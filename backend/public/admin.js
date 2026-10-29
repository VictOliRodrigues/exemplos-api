// Página /admin: login do professor, cadastro de alunos e ativação/inativação de contas.

const $ = (seletor) => document.querySelector(seletor);
let usuarios = [];

function lerToken() {
  try { return sessionStorage.getItem('admin-token'); } catch { return null; }
}
function salvarToken(token) {
  try { token ? sessionStorage.setItem('admin-token', token) : sessionStorage.removeItem('admin-token'); } catch {}
}

function mostrar(logado) {
  $('#tela-login').hidden = logado;
  $('#tela-painel').hidden = !logado;
  $('#sair').hidden = !logado;
}

function mensagem(el, texto, tipo = 'erro') {
  el.textContent = texto;
  el.className = `mensagem ${tipo}`;
}

async function api(metodo, rota, corpo) {
  const resposta = await fetch(rota, {
    method: metodo,
    headers: {
      ...(corpo ? { 'Content-Type': 'application/json' } : {}),
      ...(lerToken() ? { Authorization: `Bearer ${lerToken()}` } : {}),
    },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  const dados = resposta.status === 204 ? null : await resposta.json();
  if (resposta.status === 401 && rota !== '/admin/login') {
    salvarToken(null);
    mostrar(false);
    mensagem($('#msg-login'), 'Sessão expirada. Entre de novo.');
  }
  if (!resposta.ok) {
    const detalhes = dados?.detalhes ? ` (${Object.entries(dados.detalhes).map(([k, v]) => `${k}: ${v}`).join('; ')})` : '';
    throw new Error((dados?.erro ?? `Erro ${resposta.status}`) + detalhes);
  }
  return dados;
}

const formatoData = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
const data = (texto) => (texto ? formatoData.format(new Date(texto)) : '—');

function celula(texto) {
  const td = document.createElement('td');
  td.textContent = texto;
  return td;
}

function botao(texto, aoClicar, perigo = false) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = `botao-secundario${perigo ? ' perigo' : ''}`;
  b.textContent = texto;
  b.addEventListener('click', aoClicar);
  return b;
}

function desenhar() {
  const filtro = $('#filtro').value.trim().toLowerCase();
  const visiveis = usuarios.filter((u) => u.usuario.includes(filtro));
  const ativos = usuarios.filter((u) => u.ativo).length;
  $('#total').textContent = `${ativos} ativos / ${usuarios.length}`;

  const lista = $('#lista');
  lista.replaceChildren();
  if (visiveis.length === 0) {
    const tr = document.createElement('tr');
    const td = celula(usuarios.length ? 'Nenhum aluno encontrado com esse filtro.' : 'Nenhum aluno cadastrado ainda.');
    td.colSpan = 6;
    td.className = 'vazio';
    tr.append(td);
    lista.append(tr);
    return;
  }

  for (const u of visiveis) {
    const tr = document.createElement('tr');
    if (!u.ativo) tr.className = 'inativo';

    const usuario = celula('');
    const code = document.createElement('code');
    code.textContent = u.usuario;
    usuario.append(code);

    const situacao = celula('');
    const selo = document.createElement('span');
    selo.className = `selo ${u.ativo ? 'ativo' : 'inativo'}`;
    selo.textContent = u.ativo ? (u.logado ? 'ativo · logado' : 'ativo') : 'inativo';
    situacao.append(selo);

    const acoes = celula('');
    const caixa = document.createElement('div');
    caixa.className = 'acoes';
    caixa.append(
      u.ativo
        ? botao('Inativar', () => alterar(u.usuario, { ativo: false }, `"${u.usuario}" inativado`), true)
        : botao('Reativar', () => alterar(u.usuario, { ativo: true }, `"${u.usuario}" reativado`)),
      botao('Trocar senha', () => {
        const senha = prompt(`Nova senha para "${u.usuario}" (4 a 100 caracteres):`);
        if (senha) alterar(u.usuario, { senha }, `Senha de "${u.usuario}" alterada`);
      }),
    );
    acoes.append(caixa);

    tr.append(usuario, situacao, celula(data(u.ultimoLogin)), celula(String(u.alunos)), celula(data(u.criadoEm)), acoes);
    lista.append(tr);
  }
}

async function carregar() {
  try {
    usuarios = await api('GET', '/admin/usuarios');
    mensagem($('#msg-lista'), '', 'ok');
    desenhar();
  } catch (erro) {
    mensagem($('#msg-lista'), erro.message);
  }
}

async function alterar(usuario, corpo, sucesso) {
  if (corpo.ativo === false && !confirm(`Inativar "${usuario}"? O aluno perde o acesso na hora (o token atual deixa de valer).`)) return;
  try {
    const atualizado = await api('PATCH', `/admin/usuarios/${encodeURIComponent(usuario)}`, corpo);
    usuarios = usuarios.map((u) => (u.usuario === usuario ? atualizado : u));
    desenhar();
    mensagem($('#msg-lista'), sucesso, 'ok');
  } catch (erro) {
    mensagem($('#msg-lista'), erro.message);
  }
}

$('#form-login').addEventListener('submit', async (evento) => {
  evento.preventDefault();
  const form = evento.currentTarget;
  try {
    const { token } = await api('POST', '/admin/login', { usuario: form.usuario.value, senha: form.senha.value });
    salvarToken(token);
    form.reset();
    mensagem($('#msg-login'), '', 'ok');
    mostrar(true);
    carregar();
  } catch (erro) {
    mensagem($('#msg-login'), erro.message);
  }
});

$('#form-novo').addEventListener('submit', async (evento) => {
  evento.preventDefault();
  const form = evento.currentTarget;
  const usuario = form.usuario.value.trim().toLowerCase();
  try {
    const novo = await api('POST', '/admin/usuarios', { usuario, senha: form.senha.value });
    usuarios = [...usuarios, novo].sort((a, b) => a.usuario.localeCompare(b.usuario));
    desenhar();
    mensagem($('#msg-novo'), `Aluno "${usuario}" cadastrado. Passe o usuário e a senha para ele.`, 'ok');
    form.reset();
    form.usuario.focus();
  } catch (erro) {
    mensagem($('#msg-novo'), erro.message);
  }
});

$('#filtro').addEventListener('input', desenhar);

$('#sair').addEventListener('click', async () => {
  try { await api('POST', '/admin/logout'); } catch {}
  salvarToken(null);
  mostrar(false);
});

if (lerToken()) {
  mostrar(true);
  carregar();
} else {
  mostrar(false);
}
