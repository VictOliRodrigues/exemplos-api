import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { setTimeout as esperar } from 'node:timers/promises';
import { gzipSync } from 'node:zlib';
import { config } from './config.js';
import { pool, iniciarBanco } from './db.js';
import { recursos, camposSomenteLeitura } from './recursos.js';
import { cabecalhosCors, enviarJson, enviarErro, lerCorpoJson, ipDoCliente, ErroHttp } from './http.js';
import { verificarLimite } from './limitador.js';
import { gerarOpenApi } from './openapi.js';
import * as crud from './crud.js';
import * as auth from './auth.js';
import * as admin from './admin.js';

const regexAluno = /^[a-z0-9_-]{3,30}$/;
const nomesRecursos = Object.keys(recursos);
const especificacaoOpenApi = gerarOpenApi();

// ---------- Arquivos estáticos (documentação e Swagger) ----------

const pastaPublica = new URL('../public/', import.meta.url);
const pastaSwagger = new URL('./', import.meta.resolve('swagger-ui-dist/package.json'));

const html = 'text/html; charset=utf-8';
const css = 'text/css; charset=utf-8';
const js = 'text/javascript; charset=utf-8';

// cache: true → o navegador pode guardar por 1 dia (arquivos do Swagger, que não mudam)
const arquivosEstaticos = {
  '/': { pasta: pastaPublica, arquivo: 'index.html', tipo: html },
  '/index.html': { pasta: pastaPublica, arquivo: 'index.html', tipo: html },
  '/docs.css': { pasta: pastaPublica, arquivo: 'docs.css', tipo: css },
  '/docs.js': { pasta: pastaPublica, arquivo: 'docs.js', tipo: js },
  '/swagger': { pasta: pastaPublica, arquivo: 'swagger.html', tipo: html },
  '/admin': { pasta: pastaPublica, arquivo: 'admin.html', tipo: html },
  '/admin.js': { pasta: pastaPublica, arquivo: 'admin.js', tipo: js },
  '/swagger/swagger-ui.css': { pasta: pastaSwagger, arquivo: 'swagger-ui.css', tipo: css, cache: true },
  '/swagger/swagger-ui-bundle.js': { pasta: pastaSwagger, arquivo: 'swagger-ui-bundle.js', tipo: js, cache: true },
};
const cacheEstaticos = new Map();

async function enviarEstatico(req, res, caminho) {
  const entrada = arquivosEstaticos[caminho];
  const url = new URL(entrada.arquivo, entrada.pasta).href;
  if (!cacheEstaticos.has(url)) {
    const conteudo = await readFile(new URL(url));
    cacheEstaticos.set(url, { conteudo, compactado: gzipSync(conteudo) });
  }

  const { conteudo, compactado } = cacheEstaticos.get(url);
  const usarGzip = /\bgzip\b/.test(req.headers['accept-encoding'] ?? '');
  const corpo = usarGzip ? compactado : conteudo;

  res.writeHead(200, {
    'Content-Type': entrada.tipo,
    'Content-Length': corpo.length,
    'Cache-Control': entrada.cache ? 'public, max-age=86400' : 'no-cache',
    Vary: 'Accept-Encoding',
    ...(usarGzip ? { 'Content-Encoding': 'gzip' } : {}),
  });
  res.end(corpo);
}

// ---------- Rotas ----------

function exigirMetodo(metodo, permitidos) {
  if (!permitidos.includes(metodo)) {
    throw new ErroHttp(405, `Método ${metodo} não permitido nesta rota. Use: ${permitidos.join(', ')}`, {
      cabecalhos: { Allow: [...permitidos, 'OPTIONS'].join(', ') },
    });
  }
}

function lerId(texto) {
  const id = Number(texto);
  if (!/^\d+$/.test(texto) || !Number.isSafeInteger(id) || id < 1 || id > 2147483647) {
    throw new ErroHttp(400, `id inválido: "${texto}". O id deve ser um número inteiro, ex.: /produtos/3`);
  }
  return id;
}

function descricaoDaApi(origem) {
  return {
    nome: 'API de prática para alunos',
    documentacao: `${origem}/`,
    swagger: `${origem}/swagger`,
    openapi: `${origem}/openapi.json`,
    rotaBase: `${origem}/api/{aluno}`,
    parte2: {
      login: `POST ${origem}/auth/login`,
      rotaBase: `${origem}/privado`,
      header: 'Authorization: Bearer <token>',
      validadeTokenHoras: config.tokenHoras,
    },
    limites: {
      registros: config.limiteRegistros,
      requisicoesPorMinuto: config.limiteRequisicoesPorMinuto,
      tamanhoMaximoCorpoKb: config.tamanhoMaximoCorpo / 1024,
      atrasoMaximoMs: config.atrasoMaximo,
      tokenHoras: config.tokenHoras,
    },
    recursos: Object.fromEntries(
      Object.entries(recursos).map(([nome, recurso]) => [
        nome,
        {
          rota: `/api/{aluno}/${nome}`,
          campos: recurso.campos,
          somenteLeitura: camposSomenteLeitura,
          busca: recurso.busca,
        },
      ]),
    ),
  };
}

// Rotas de dados, iguais na parte 1 (/api/{aluno}) e na parte 2 (/privado, com token).
// dono = valor gravado na coluna "aluno"; base = começo da rota (para o header Location);
// resto = partes depois da base, ex.: ['produtos', '3'].
async function rotasDosDados(req, res, metodo, dono, base, resto, parametros) {
  // base → resumo de quantos registros o dono tem
  if (resto.length === 0) {
    exigirMetodo(metodo, ['GET']);
    const resumo = {};
    for (const nome of nomesRecursos) {
      const { total } = await crud.listar(nome, dono, new URLSearchParams('limite=1'));
      resumo[nome] = total;
    }
    return resumo;
  }

  const nomeRecurso = resto[0];

  // base/exemplos → popula todos os recursos com dados de exemplo
  if (nomeRecurso === 'exemplos' && resto.length === 1) {
    exigirMetodo(metodo, ['POST']);
    const inseridos = await crud.inserirExemplos(dono);
    return enviarJson(res, 201, { mensagem: 'Dados de exemplo inseridos', inseridos });
  }

  if (!recursos[nomeRecurso]) {
    throw new ErroHttp(404, `Recurso "${nomeRecurso}" não existe. Recursos disponíveis: ${nomesRecursos.join(', ')}`);
  }

  // base/{recurso}
  if (resto.length === 1) {
    exigirMetodo(metodo, ['GET', 'POST', 'DELETE']);
    if (metodo === 'GET') {
      const { registros, total } = await crud.listar(nomeRecurso, dono, parametros);
      return enviarJson(res, 200, registros, { 'X-Total-Count': String(total) });
    }
    if (metodo === 'POST') {
      const corpo = await lerCorpoJson(req, config.tamanhoMaximoCorpo);
      const criado = await crud.criar(nomeRecurso, dono, corpo);
      return enviarJson(res, 201, criado, { Location: `${base}/${nomeRecurso}/${criado.id}` });
    }
    await crud.removerTodos(nomeRecurso, dono);
    return enviarJson(res, 204);
  }

  // base/{recurso}/{id}
  if (resto.length === 2) {
    exigirMetodo(metodo, ['GET', 'PUT', 'PATCH', 'DELETE']);
    const id = lerId(resto[1]);
    if (metodo === 'GET') return enviarJson(res, 200, await crud.obter(nomeRecurso, dono, id));
    if (metodo === 'DELETE') {
      await crud.remover(nomeRecurso, dono, id);
      return enviarJson(res, 204);
    }
    const corpo = await lerCorpoJson(req, config.tamanhoMaximoCorpo);
    const funcao = metodo === 'PUT' ? crud.substituir : crud.atualizar;
    return enviarJson(res, 200, await funcao(nomeRecurso, dono, id, corpo));
  }

  throw new ErroHttp(404, 'Rota não encontrada. Veja a documentação em /');
}

// Parte 1: /api/{aluno}/... (sem autenticação)
async function rotasDaApi(req, res, metodo, partes, parametros) {
  const aluno = partes[1].toLowerCase();
  if (!regexAluno.test(aluno)) {
    throw new ErroHttp(400, `Código do aluno inválido: "${partes[1]}". Use de 3 a 30 caracteres: letras minúsculas, números, - ou _`);
  }
  const resumo = await rotasDosDados(req, res, metodo, aluno, `/api/${aluno}`, partes.slice(2), parametros);
  if (resumo) enviarJson(res, 200, { aluno, recursos: resumo });
}

// Parte 2: /auth/... (login) e /privado/... (exige "Authorization: Bearer <token>")
async function rotasDeAutenticacao(req, res, metodo, partes) {
  const acao = partes[1];
  if (partes.length === 2 && acao === 'login') {
    exigirMetodo(metodo, ['POST']);
    const corpo = await lerCorpoJson(req, config.tamanhoMaximoCorpo);
    return enviarJson(res, 200, await auth.login(corpo));
  }
  if (partes.length === 2 && acao === 'eu') {
    exigirMetodo(metodo, ['GET']);
    return enviarJson(res, 200, await auth.autenticar(req));
  }
  if (partes.length === 2 && acao === 'logout') {
    exigirMetodo(metodo, ['POST']);
    const { usuario } = await auth.autenticar(req);
    await auth.logout(usuario);
    return enviarJson(res, 204);
  }
  throw new ErroHttp(404, 'Rota não encontrada. Rotas de autenticação: /auth/login, /auth/eu, /auth/logout');
}

// Área do professor: /admin/login, /admin/logout, /admin/usuarios[/{usuario}] (a página /admin é estática)
async function rotasDoAdmin(req, res, metodo, partes) {
  const acao = partes[1];
  if (partes.length === 2 && acao === 'login') {
    exigirMetodo(metodo, ['POST']);
    return enviarJson(res, 200, admin.loginAdmin(await lerCorpoJson(req, config.tamanhoMaximoCorpo)));
  }

  admin.exigirAdmin(req);

  if (partes.length === 2 && acao === 'logout') {
    exigirMetodo(metodo, ['POST']);
    admin.logoutAdmin(req);
    return enviarJson(res, 204);
  }
  if (acao === 'usuarios' && partes.length === 2) {
    exigirMetodo(metodo, ['GET', 'POST']);
    if (metodo === 'GET') return enviarJson(res, 200, await admin.listarUsuarios());
    return enviarJson(res, 201, await admin.criarUsuario(await lerCorpoJson(req, config.tamanhoMaximoCorpo)));
  }
  if (acao === 'usuarios' && partes.length === 3) {
    exigirMetodo(metodo, ['PATCH']);
    const corpo = await lerCorpoJson(req, config.tamanhoMaximoCorpo);
    return enviarJson(res, 200, await admin.alterarUsuario(partes[2].toLowerCase(), corpo));
  }
  throw new ErroHttp(404, 'Rota do admin não encontrada');
}

async function rotasPrivadas(req, res, metodo, partes, parametros) {
  const { usuario } = await auth.autenticar(req);
  // "@" não é aceito no código de aluno, então os dados privados nunca se misturam com /api/{aluno}.
  const resumo = await rotasDosDados(req, res, metodo, `@${usuario}`, '/privado', partes.slice(1), parametros);
  if (resumo) enviarJson(res, 200, { usuario, recursos: resumo });
}

async function tratarRequisicao(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const caminho = url.pathname.replace(/\/+$/, '') || '/';
  const partes = caminho.split('/').filter(Boolean);
  const metodo = req.method;

  // Preflight do CORS: o navegador pergunta antes de enviar PUT/PATCH/DELETE ou JSON.
  if (metodo === 'OPTIONS') {
    res.writeHead(204, cabecalhosCors);
    return res.end();
  }

  const chaveLimite = partes[0] === 'api' && partes[1] ? `aluno:${partes[1].toLowerCase()}` : `ip:${ipDoCliente(req)}`;
  const limite = verificarLimite(chaveLimite, config.limiteRequisicoesPorMinuto);
  if (!limite.permitido) {
    throw new ErroHttp(429, `Muitas requisições. Tente de novo em ${limite.segundosRestantes} s (verifique se não há um loop no seu código)`, {
      cabecalhos: { 'Retry-After': String(limite.segundosRestantes) },
    });
  }

  // ?atraso=1500 → espera 1,5 s antes de responder (para testar telas de "carregando...")
  if (url.searchParams.has('atraso')) {
    const atraso = Number(url.searchParams.get('atraso'));
    if (!Number.isInteger(atraso) || atraso < 0 || atraso > config.atrasoMaximo) {
      throw new ErroHttp(400, `Parâmetro "atraso" deve ser um inteiro entre 0 e ${config.atrasoMaximo} (milissegundos)`);
    }
    await esperar(atraso);
  }

  if (arquivosEstaticos[caminho]) {
    exigirMetodo(metodo, ['GET']);
    return enviarEstatico(req, res, caminho);
  }

  if (caminho === '/openapi.json') {
    exigirMetodo(metodo, ['GET']);
    return enviarJson(res, 200, especificacaoOpenApi);
  }

  if (caminho === '/saude') {
    exigirMetodo(metodo, ['GET']);
    await pool.query('SELECT 1');
    return enviarJson(res, 200, { status: 'ok' });
  }

  if (caminho === '/api') {
    exigirMetodo(metodo, ['GET']);
    const protocolo = req.headers['x-forwarded-proto']?.split(',')[0] ?? 'http';
    return enviarJson(res, 200, descricaoDaApi(`${protocolo}://${req.headers.host}`));
  }

  if (partes[0] === 'api' && partes.length >= 2) {
    return rotasDaApi(req, res, metodo, partes, url.searchParams);
  }

  if (partes[0] === 'auth') {
    return rotasDeAutenticacao(req, res, metodo, partes);
  }

  if (partes[0] === 'admin') {
    return rotasDoAdmin(req, res, metodo, partes);
  }

  if (partes[0] === 'privado') {
    return rotasPrivadas(req, res, metodo, partes, url.searchParams);
  }

  throw new ErroHttp(404, 'Rota não encontrada. Veja a documentação em /');
}

const servidor = http.createServer(async (req, res) => {
  const inicio = performance.now();
  res.on('finish', () => {
    const ms = Math.round(performance.now() - inicio);
    console.log(`${req.method} ${req.url} → ${res.statusCode} (${ms} ms)`);
  });

  try {
    await tratarRequisicao(req, res);
  } catch (erro) {
    if (res.headersSent) return res.end();
    if (erro instanceof ErroHttp) {
      const cabecalhos = erro.status === 413 ? { ...erro.cabecalhos, Connection: 'close' } : erro.cabecalhos;
      return enviarErro(res, erro.status, erro.message, erro.detalhes, cabecalhos);
    }
    console.error(erro);
    enviarErro(res, 500, 'Erro interno no servidor. Avise o professor.');
  }
});

// ---------- Inicialização e encerramento ----------

await iniciarBanco();
servidor.listen(config.porta, () => {
  console.log(`API ouvindo na porta ${config.porta}`);
});

function encerrar(sinal) {
  console.log(`${sinal} recebido, encerrando...`);
  setTimeout(() => process.exit(1), 10_000).unref();
  servidor.close(() => pool.end().finally(() => process.exit(0)));
  servidor.closeIdleConnections();
}
process.on('SIGTERM', () => encerrar('SIGTERM'));
process.on('SIGINT', () => encerrar('SIGINT'));
