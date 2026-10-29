import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';

process.env.DATABASE_URL = 'postgres://teste:teste@localhost/teste';
process.env.PORT = '0';
process.env.ADMIN_USUARIO = 'admin';
process.env.ADMIN_SENHA = 'teste-seguro';
process.env.LIMITE_REQ_MINUTO = '0';
const { pool } = await import('../src/db.js');
const { servidor, iniciarServidor } = await import('../src/server.js');
const banco = new PGlite();
let base;
// Mesmo SQL da produção, executado pelo motor PostgreSQL embutido.
const consultaOriginal = pool.query;
pool.query = async (sql, valores) => {
  const resultado = await banco.query(sql, valores);
  return { rows: resultado.rows, rowCount: resultado.affectedRows ?? resultado.rows.length };
};
before(async () => {
  await iniciarServidor();
  base = `http://127.0.0.1:${servidor.address().port}`;
});
after(async () => {
  await new Promise(resolve => servidor.close(resolve));
  servidor.closeAllConnections();
  pool.query = consultaOriginal;
  await pool.end();
  await banco.close();
});
async function chamar(rota, metodo = 'GET', corpo, token) {
  const resposta = await fetch(base + rota, {
    method: metodo,
    headers: { ...(corpo !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(corpo !== undefined ? { body: JSON.stringify(corpo) } : {}),
  });
  const texto = await resposta.text();
  return { status: resposta.status, headers: resposta.headers, dados: texto ? JSON.parse(texto) : null };
}
const ana = { nome: 'Ana Oliveira', nota1: 7, nota2: 8, nota3: 9, nota4: 6 };

test('CRUD HTTP, médias exatas, filtros, paginação, estatísticas e isolamento público', async () => {
  const raiz = '/api/turma-a/alunos';
  const vazio = await chamar(`${raiz}/estatisticas`);
  assert.equal(vazio.dados.total, 0);
  assert.equal(vazio.dados.media, null);
  const criado = await chamar(raiz, 'POST', { ...ana, media: 10, situacao: 'reprovado' });
  assert.equal(criado.status, 201);
  assert.equal(criado.dados.media, 7.5);
  assert.equal(criado.dados.situacao, 'aprovado');
  const id = criado.dados.id;
  assert.equal(criado.headers.get('location'), `${raiz}/${id}`);
  assert.equal((await chamar(`/api/turma-b/alunos/${id}`)).status, 404);
  assert.equal((await chamar('/api/turma-b/alunos')).dados.length, 0);
  const editado = await chamar(`${raiz}/${id}`, 'PATCH', { nota1: 4.99, nota2: 7, nota3: 7, nota4: 9 });
  assert.equal(editado.status, 200);
  assert.equal(editado.dados.media, 6.9975);
  assert.equal(editado.dados.situacao, 'reprovado');
  await chamar(raiz, 'POST', { ...ana, nome: 'Bruno Santos', nota1: 10, nota2: 10, nota3: 10, nota4: 10 });
  const filtrado = await chamar(`${raiz}?situacao=aprovado&ordenar=media&ordem=desc&limite=1&pagina=1`);
  assert.equal(filtrado.status, 200);
  assert.equal(filtrado.dados[0].nome, 'Bruno Santos');
  assert.equal(filtrado.headers.get('x-total-count'), '1');
  const ordem = await chamar(`${raiz}?ordenar=media&ordem=asc`);
  assert.equal(ordem.dados[0].id, id);
  assert.equal((await chamar(`${raiz}?q=OLIVEIRA`)).dados.length, 1);
  const resumo = await chamar(`${raiz}/estatisticas`);
  assert.equal(resumo.dados.total, 2);
  assert.equal(resumo.dados.aprovados, 1);
  assert.equal(resumo.dados.reprovados, 1);
  assert.equal(resumo.dados.percentual, 50);
  assert.equal(resumo.dados.menor, 6.9975);
  const substituido = await chamar(`${raiz}/${id}`, 'PUT', ana);
  assert.equal(substituido.dados.media, 7.5);
  assert.equal((await chamar(`${raiz}/${id}`, 'DELETE')).status, 204);
  assert.equal((await chamar(`${raiz}/${id}`)).status, 404);
  assert.equal((await chamar(raiz, 'DELETE')).status, 204);
  assert.equal((await chamar(raiz)).dados.length, 0);
});

test('validação de notas, nomes, corpos, filtros e métodos', async () => {
  const raiz = '/api/validacao/alunos';
  for (const corpo of [{ ...ana, nota1: 11 }, { ...ana, nota1: -1 }, { ...ana, nota1: '7' }, { nome: 'Ana' }, { ...ana, nome: '  ' }, { ...ana, estoque: 3 }]) {
    assert.equal((await chamar(raiz, 'POST', corpo)).status, 400);
  }
  assert.equal((await chamar(raiz + '?situacao=recuperacao')).status, 400);
  assert.equal((await chamar(raiz + '?ordenar=inexistente')).status, 400);
  assert.equal((await chamar(raiz + '?ordem=errada')).status, 400);
  assert.equal((await chamar(raiz + '?pagina=2')).status, 400);
  assert.equal((await chamar(raiz + '/estatisticas', 'POST', {})).status, 405);
  assert.equal((await chamar('/api/validacao/produtos')).status, 404);
  const semJson = await fetch(base + raiz, { method: 'POST', body: '{}' });
  assert.equal(semJson.status, 415);
});

test('professor, login, rotas privadas, troca de token, inativação e logout', async () => {
  assert.equal((await chamar('/privado/alunos')).status, 401);
  assert.equal((await chamar('/admin/usuarios')).status, 401);
  const admin = await chamar('/admin/login', 'POST', { usuario: 'admin', senha: 'teste-seguro' });
  assert.equal(admin.status, 200);
  const adminToken = admin.dados.token;
  assert.equal((await chamar('/admin/usuarios', 'POST', { usuario: 'maria', senha: '1234' }, adminToken)).status, 201);
  const login = await chamar('/auth/login', 'POST', { usuario: 'maria', senha: '1234' });
  assert.equal(login.status, 200);
  const token = login.dados.token;
  assert.equal((await chamar('/privado/alunos', 'POST', ana, token)).status, 201);
  assert.equal((await chamar('/privado/alunos/estatisticas', 'GET', undefined, token)).dados.total, 1);
  assert.equal((await chamar('/api/maria/alunos')).dados.length, 0);
  const usuarios = await chamar('/admin/usuarios', 'GET', undefined, adminToken);
  assert.equal(Number(usuarios.dados[0].alunos), 1);
  const novoLogin = await chamar('/auth/login', 'POST', { usuario: 'maria', senha: '1234' });
  assert.equal((await chamar('/privado/alunos', 'GET', undefined, token)).status, 401);
  assert.equal((await chamar('/auth/eu', 'GET', undefined, novoLogin.dados.token)).status, 200);
  assert.equal((await chamar('/admin/usuarios/maria', 'PATCH', { ativo: false }, adminToken)).status, 200);
  assert.equal((await chamar('/privado/alunos', 'GET', undefined, novoLogin.dados.token)).status, 401);
  assert.equal((await chamar('/auth/login', 'POST', { usuario: 'maria', senha: '1234' })).status, 403);
  await chamar('/admin/usuarios/maria', 'PATCH', { ativo: true }, adminToken);
  const ultimo = await chamar('/auth/login', 'POST', { usuario: 'maria', senha: '1234' });
  assert.equal((await chamar('/auth/logout', 'POST', undefined, ultimo.dados.token)).status, 204);
  assert.equal((await chamar('/privado/alunos', 'GET', undefined, ultimo.dados.token)).status, 401);
  assert.equal((await chamar('/admin/logout', 'POST', undefined, adminToken)).status, 204);
});

test('exemplos, documentação, Swagger, OpenAPI e CORS', async () => {
  const exemplos = await chamar('/api/exemplos/alunos/estatisticas');
  assert.equal(exemplos.dados.total, 0);
  assert.equal((await chamar('/api/exemplos/exemplos', 'POST')).dados.inseridos.alunos, 6);
  assert.equal((await chamar('/api/exemplos/alunos/estatisticas')).dados.total, 6);
  const openapi = (await chamar('/openapi.json')).dados;
  assert.ok(openapi.paths['/api/{aluno}/alunos/estatisticas']);
  assert.ok(openapi.paths['/privado/alunos/estatisticas'].get.security);
  assert.ok(openapi.components.schemas.Aluno.properties.media.readOnly);
  assert.equal(openapi.components.schemas.AlunoEntrada.properties.media, undefined);
  assert.equal(openapi.paths['/api/{aluno}/produtos'], undefined);
  for (const rota of ['/', '/docs.js', '/docs.css', '/swagger', '/swagger/swagger-ui-bundle.js', '/admin', '/admin.js']) {
    assert.equal((await fetch(base + rota)).status, 200);
  }
  const cors = await fetch(base + '/api/exemplos/alunos', { method: 'OPTIONS' });
  assert.equal(cors.status, 204);
  assert.match(cors.headers.get('access-control-allow-headers'), /Authorization/);
  assert.equal((await chamar('/saude')).dados.status, 'ok');
});
