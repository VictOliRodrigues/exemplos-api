// Parte 2: autenticação básica com usuário, senha e token.
//
// 1. O professor cadastra o aluno na área /admin (veja admin.js)
// 2. POST /auth/login  { usuario, senha }  → devolve um token novo
// 3. Nas rotas protegidas, envie o header:  Authorization: Bearer <token>
//
// Cada usuário tem um único token ativo: fazer login de novo gera outro e invalida o anterior.
// O token expira depois de TOKEN_HORAS (padrão 24 h). No banco guardamos só o hash do token e da senha.

import { randomBytes, scrypt, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { pool } from './db.js';
import { config } from './config.js';
import { ErroHttp } from './http.js';

const scryptAsync = promisify(scrypt);

export const regexUsuario = /^[a-z0-9_-]{3,30}$/;
export const senhaMinimo = 4;
export const senhaMaximo = 100;

export async function gerarHashSenha(senha) {
  const sal = randomBytes(16);
  const hash = await scryptAsync(senha, sal, 64);
  return `${sal.toString('hex')}:${hash.toString('hex')}`;
}

async function senhaConfere(senha, guardado) {
  const [salHex, hashHex] = guardado.split(':');
  const esperado = Buffer.from(hashHex, 'hex');
  const calculado = await scryptAsync(senha, Buffer.from(salHex, 'hex'), esperado.length);
  return timingSafeEqual(esperado, calculado);
}

function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

// Valida o corpo { usuario, senha } do cadastro (admin) e do login.
export function lerCredenciais(corpo) {
  if (corpo === null || typeof corpo !== 'object' || Array.isArray(corpo)) {
    throw new ErroHttp(400, 'O corpo deve ser um objeto JSON, ex.: { "usuario": "maria", "senha": "1234" }');
  }
  const erros = {};
  const { usuario, senha } = corpo;
  if (typeof usuario !== 'string' || !regexUsuario.test(usuario.trim().toLowerCase())) {
    erros.usuario = 'Use de 3 a 30 caracteres: letras minúsculas, números, - ou _';
  }
  if (typeof senha !== 'string' || senha.length < senhaMinimo || senha.length > senhaMaximo) {
    erros.senha = `Deve ser um texto de ${senhaMinimo} a ${senhaMaximo} caracteres`;
  }
  if (Object.keys(erros).length > 0) throw new ErroHttp(400, 'Dados inválidos', { detalhes: erros });
  return { usuario: usuario.trim().toLowerCase(), senha };
}

export async function login(corpo) {
  const { usuario, senha } = lerCredenciais(corpo);
  const { rows } = await pool.query('SELECT senha_hash, ativo FROM usuarios WHERE usuario = $1', [usuario]);
  if (rows.length === 0 || !(await senhaConfere(senha, rows[0].senha_hash))) {
    throw new ErroHttp(401, 'Usuário ou senha incorretos');
  }
  if (!rows[0].ativo) {
    throw new ErroHttp(403, 'Sua conta está inativa. Fale com o professor.');
  }

  const token = randomBytes(32).toString('hex');
  const expiraEm = new Date(Date.now() + config.tokenHoras * 3600_000);
  await pool.query('UPDATE usuarios SET token_hash = $2, token_expira_em = $3, ultimo_login = now() WHERE usuario = $1', [
    usuario,
    hashToken(token),
    expiraEm,
  ]);
  return { token, tipo: 'Bearer', expiraEm, usuario };
}

export async function logout(usuario) {
  await pool.query('UPDATE usuarios SET token_hash = NULL, token_expira_em = NULL WHERE usuario = $1', [usuario]);
}

// Lê o header Authorization e devolve o usuário dono do token (ou lança 401).
export async function autenticar(req) {
  const cabecalho = req.headers.authorization ?? '';
  const [tipo, token] = cabecalho.trim().split(/\s+/);
  const desafio = { cabecalhos: { 'WWW-Authenticate': 'Bearer' } };

  if (!cabecalho) {
    throw new ErroHttp(401, 'Envie o token no header "Authorization: Bearer <token>". Faça login em POST /auth/login para obter um.', desafio);
  }
  if (tipo?.toLowerCase() !== 'bearer' || !token) {
    throw new ErroHttp(401, 'Header Authorization mal formatado. Use: "Authorization: Bearer <token>" (com espaço depois de Bearer)', desafio);
  }

  const { rows } = await pool.query(
    'SELECT usuario, token_expira_em FROM usuarios WHERE token_hash = $1 AND ativo',
    [hashToken(token)],
  );
  if (rows.length === 0) {
    throw new ErroHttp(401, 'Token inválido. Ele pode ter sido substituído por um login mais recente: faça login de novo.', desafio);
  }
  if (rows[0].token_expira_em <= new Date()) {
    throw new ErroHttp(401, 'Token expirado. Faça login de novo em POST /auth/login.', desafio);
  }
  return { usuario: rows[0].usuario, expiraEm: rows[0].token_expira_em };
}
