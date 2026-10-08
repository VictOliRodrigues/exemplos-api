// Área do professor (/admin): cadastra alunos para a parte 2 e ativa/inativa contas.
// O login do admin vem das variáveis ADMIN_USUARIO e ADMIN_SENHA.
// A sessão do admin fica só em memória: reiniciar a API desloga o professor.

import { randomBytes, timingSafeEqual, createHash } from 'node:crypto';
import { pool } from './db.js';
import { config } from './config.js';
import { ErroHttp } from './http.js';
import { recursos } from './recursos.js';
import { gerarHashSenha, lerCredenciais, regexUsuario, senhaMinimo, senhaMaximo } from './auth.js';

const sessoes = new Map(); // token → data de expiração (ms)

// Compara textos sem vazar, pelo tempo de resposta, quantos caracteres batem.
function textosIguais(a, b) {
  const hashA = createHash('sha256').update(String(a)).digest();
  const hashB = createHash('sha256').update(String(b)).digest();
  return timingSafeEqual(hashA, hashB);
}

function exigirAdminConfigurado() {
  if (!config.adminSenha) {
    throw new ErroHttp(503, 'Área admin desligada. Defina as variáveis ADMIN_USUARIO e ADMIN_SENHA no servidor.');
  }
}

export function loginAdmin(corpo) {
  exigirAdminConfigurado();
  const usuarioOk = textosIguais(corpo?.usuario ?? '', config.adminUsuario);
  const senhaOk = textosIguais(corpo?.senha ?? '', config.adminSenha);
  if (!usuarioOk || !senhaOk) throw new ErroHttp(401, 'Usuário ou senha do admin incorretos');

  const token = randomBytes(32).toString('hex');
  const expiraEm = Date.now() + config.tokenHoras * 3600_000;
  sessoes.set(token, expiraEm);
  return { token, expiraEm: new Date(expiraEm) };
}

export function exigirAdmin(req) {
  exigirAdminConfigurado();
  const [tipo, token] = (req.headers.authorization ?? '').trim().split(/\s+/);
  const expiraEm = tipo?.toLowerCase() === 'bearer' ? sessoes.get(token) : undefined;
  if (!expiraEm || expiraEm <= Date.now()) {
    if (expiraEm) sessoes.delete(token);
    throw new ErroHttp(401, 'Sessão do admin inválida ou expirada. Faça login em /admin.', {
      cabecalhos: { 'WWW-Authenticate': 'Bearer' },
    });
  }
}

export function logoutAdmin(req) {
  const [, token] = (req.headers.authorization ?? '').trim().split(/\s+/);
  sessoes.delete(token);
}

function paraJson(linha) {
  return {
    usuario: linha.usuario,
    ativo: linha.ativo,
    criadoEm: linha.criado_em,
    ultimoLogin: linha.ultimo_login,
    logado: Boolean(linha.token_expira_em && linha.token_expira_em > new Date()),
    produtos: linha.produtos,
  };
}

// Conta os produtos de cada aluno na parte 2 (dono gravado como "@usuario").
const contagemProdutos = Object.keys(recursos)
  .map((nome) => `(SELECT count(*) FROM "${nome}" WHERE aluno = '@' || u.usuario)`)
  .join(' + ');

const colunas = `u.usuario, u.ativo, u.criado_em, u.ultimo_login, u.token_expira_em, ${contagemProdutos} AS produtos`;

export async function listarUsuarios() {
  const { rows } = await pool.query(`SELECT ${colunas} FROM usuarios u ORDER BY u.usuario`);
  return rows.map(paraJson);
}

async function obterUsuario(usuario) {
  const { rows } = await pool.query(`SELECT ${colunas} FROM usuarios u WHERE u.usuario = $1`, [usuario]);
  return paraJson(rows[0]);
}

export async function criarUsuario(corpo) {
  const { usuario, senha } = lerCredenciais(corpo);
  const { rowCount } = await pool.query(
    'INSERT INTO usuarios (usuario, senha_hash) VALUES ($1, $2) ON CONFLICT (usuario) DO NOTHING',
    [usuario, await gerarHashSenha(senha)],
  );
  if (rowCount === 0) throw new ErroHttp(409, `O usuário "${usuario}" já existe`);
  return obterUsuario(usuario);
}

// PATCH /admin/usuarios/{usuario}  { ativo?: boolean, senha?: string }
export async function alterarUsuario(usuario, corpo) {
  if (!regexUsuario.test(usuario)) throw new ErroHttp(400, `Usuário inválido: "${usuario}"`);
  if (corpo === null || typeof corpo !== 'object' || Array.isArray(corpo)) {
    throw new ErroHttp(400, 'O corpo deve ser um objeto JSON, ex.: { "ativo": false }');
  }

  const erros = {};
  const sets = [];
  const valores = [usuario];
  for (const chave of Object.keys(corpo)) {
    if (chave !== 'ativo' && chave !== 'senha') erros[chave] = 'Campo desconhecido. Campos aceitos: ativo, senha';
  }
  if (corpo.ativo !== undefined) {
    if (typeof corpo.ativo !== 'boolean') erros.ativo = 'Deve ser true ou false';
    else {
      valores.push(corpo.ativo);
      sets.push(`ativo = $${valores.length}`);
    }
  }
  if (corpo.senha !== undefined) {
    if (typeof corpo.senha !== 'string' || corpo.senha.length < senhaMinimo || corpo.senha.length > senhaMaximo) {
      erros.senha = `Deve ser um texto de ${senhaMinimo} a ${senhaMaximo} caracteres`;
    } else {
      valores.push(await gerarHashSenha(corpo.senha));
      sets.push(`senha_hash = $${valores.length}`);
    }
  }
  if (Object.keys(erros).length > 0) throw new ErroHttp(400, 'Dados inválidos', { detalhes: erros });
  if (sets.length === 0) throw new ErroHttp(400, 'Envie "ativo" e/ou "senha"');

  // Inativar ou trocar a senha derruba o token atual do aluno.
  const { rowCount } = await pool.query(
    `UPDATE usuarios SET ${sets.join(', ')}, token_hash = NULL, token_expira_em = NULL WHERE usuario = $1`,
    valores,
  );
  if (rowCount === 0) throw new ErroHttp(404, `Usuário "${usuario}" não encontrado`);
  return obterUsuario(usuario);
}

// Limpa sessões vencidas para não acumular memória.
setInterval(() => {
  const agora = Date.now();
  for (const [token, expiraEm] of sessoes) if (expiraEm <= agora) sessoes.delete(token);
}, 3600_000).unref();
