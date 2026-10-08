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
    limites: {
      registros: config.limiteRegistros,
      requisicoesPorMinuto: config.limiteRequisicoesPorMinuto,
      tamanhoMaximoCorpoKb: config.tamanhoMaximoCorpo / 1024,
      atrasoMaximoMs: config.atrasoMaximo,
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

async function rotasDaApi(req, res, metodo, partes, parametros) {
  // partes = ['api', aluno, recurso?, id?]
  const aluno = partes[1].toLowerCase();
  if (!regexAluno.test(aluno)) {
    throw new ErroHttp(400, `Código do aluno inválido: "${partes[1]}". Use de 3 a 30 caracteres: letras minúsculas, números, - ou _`);
  }

  // /api/{aluno} → resumo de quantos registros o aluno tem
  if (partes.length === 2) {
    exigirMetodo(metodo, ['GET']);
    const resumo = {};
    for (const nome of nomesRecursos) {
      const { total } = await crud.listar(nome, aluno, new URLSearchParams('limite=1'));
      resumo[nome] = total;
    }
    return enviarJson(res, 200, { aluno, recursos: resumo });
  }

  const nomeRecurso = partes[2];

  // /api/{aluno}/exemplos → popula todos os recursos com dados de exemplo
  if (nomeRecurso === 'exemplos' && partes.length === 3) {
    exigirMetodo(metodo, ['POST']);
    const inseridos = await crud.inserirExemplos(aluno);
    return enviarJson(res, 201, { mensagem: 'Dados de exemplo inseridos', inseridos });
  }

  if (!recursos[nomeRecurso]) {
    throw new ErroHttp(404, `Recurso "${nomeRecurso}" não existe. Recursos disponíveis: ${nomesRecursos.join(', ')}`);
  }

  // /api/{aluno}/{recurso}
  if (partes.length === 3) {
    exigirMetodo(metodo, ['GET', 'POST', 'DELETE']);
    if (metodo === 'GET') {
      const { registros, total } = await crud.listar(nomeRecurso, aluno, parametros);
      return enviarJson(res, 200, registros, { 'X-Total-Count': String(total) });
    }
    if (metodo === 'POST') {
      const corpo = await lerCorpoJson(req, config.tamanhoMaximoCorpo);
      const criado = await crud.criar(nomeRecurso, aluno, corpo);
      return enviarJson(res, 201, criado, { Location: `/api/${aluno}/${nomeRecurso}/${criado.id}` });
    }
    await crud.removerTodos(nomeRecurso, aluno);
    return enviarJson(res, 204);
  }

  // /api/{aluno}/{recurso}/{id}
  if (partes.length === 4) {
    exigirMetodo(metodo, ['GET', 'PUT', 'PATCH', 'DELETE']);
    const id = lerId(partes[3]);
    if (metodo === 'GET') return enviarJson(res, 200, await crud.obter(nomeRecurso, aluno, id));
    if (metodo === 'DELETE') {
      await crud.remover(nomeRecurso, aluno, id);
      return enviarJson(res, 204);
    }
    const corpo = await lerCorpoJson(req, config.tamanhoMaximoCorpo);
    const funcao = metodo === 'PUT' ? crud.substituir : crud.atualizar;
    return enviarJson(res, 200, await funcao(nomeRecurso, aluno, id, corpo));
  }

  throw new ErroHttp(404, 'Rota não encontrada. Veja a documentação em /');
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
