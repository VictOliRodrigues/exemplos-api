// Script da página de documentação: preenche a URL base e o código do aluno nos exemplos,
// adiciona botões "Copiar" e faz o console "Experimente" funcionar.

const base = location.origin;
const regexAluno = /^[a-z0-9_-]{3,30}$/;
const campoAluno = document.querySelector('#codigo-aluno');

function lerPreferencia() {
  try {
    return localStorage.getItem('codigo-aluno') ?? '';
  } catch {
    return '';
  }
}

function salvarPreferencia(valor) {
  try {
    localStorage.setItem('codigo-aluno', valor);
  } catch {
    // navegação privada ou armazenamento bloqueado: tudo bem, só não lembra o código
  }
}

function codigoAtual() {
  return campoAluno.value.trim().toLowerCase() || 'seu-codigo';
}

function atualizarVariaveis() {
  const codigo = codigoAtual();
  document.querySelectorAll('.var-base').forEach((el) => (el.textContent = base));
  document.querySelectorAll('.var-aluno').forEach((el) => (el.textContent = codigo));
  document.querySelectorAll('.link-api').forEach((el) => (el.href = `${base}/api/${codigo}/produtos`));

  const valido = !campoAluno.value.trim() || regexAluno.test(codigo);
  campoAluno.classList.toggle('invalido', !valido);
  campoAluno.title = valido ? '' : '3 a 30 caracteres: letras minúsculas, números, - ou _';
}

campoAluno.value = lerPreferencia();
campoAluno.addEventListener('input', () => {
  salvarPreferencia(campoAluno.value.trim().toLowerCase());
  atualizarVariaveis();
});
atualizarVariaveis();

// ---------- Limites configurados no servidor ----------

fetch('/api')
  .then((resposta) => resposta.json())
  .then((dados) => {
    document.querySelectorAll('[data-limite]').forEach((el) => {
      const valor = dados.limites?.[el.dataset.limite];
      if (valor !== undefined) el.textContent = valor === 0 ? 'ilimitadas' : valor.toLocaleString('pt-BR');
    });
  })
  .catch(() => {});

// ---------- Botões "Copiar" ----------

document.querySelectorAll('.conteudo pre > code').forEach((codigo) => {
  if (codigo.id === 'console-saida') return;
  const botao = document.createElement('button');
  botao.type = 'button';
  botao.className = 'copiar';
  botao.textContent = 'Copiar';
  botao.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(codigo.textContent);
      botao.textContent = 'Copiado!';
    } catch {
      botao.textContent = 'Não foi possível copiar';
    }
    setTimeout(() => (botao.textContent = 'Copiar'), 1500);
  });
  codigo.parentElement.append(botao);
});

// ---------- Console "Experimente" ----------
// Os botões de exemplo só preenchem o formulário; a requisição sai quando o aluno clica em "Enviar".

const formConsole = document.querySelector('#console');
const seletorMetodo = document.querySelector('#console-metodo');
const campoRota = document.querySelector('#console-rota');
const campoCorpo = document.querySelector('#console-corpo');
const textoStatus = document.querySelector('#console-status');
const saida = document.querySelector('#console-saida');

function atualizarCorpoHabilitado() {
  const temCorpo = ['POST', 'PUT', 'PATCH'].includes(seletorMetodo.value);
  campoCorpo.disabled = !temCorpo;
  campoCorpo.placeholder = temCorpo ? '{ "nome": "Novo produto", "preco": 10 }' : `${seletorMetodo.value} não envia corpo`;
}

seletorMetodo.addEventListener('change', atualizarCorpoHabilitado);
atualizarCorpoHabilitado();

document.querySelectorAll('.atalho').forEach((botao) => {
  botao.addEventListener('click', () => {
    seletorMetodo.value = botao.dataset.metodo;
    campoRota.value = botao.dataset.rota;
    campoCorpo.value = botao.dataset.corpo ?? '';
    atualizarCorpoHabilitado();

    textoStatus.className = '';
    textoStatus.textContent = `Exemplo carregado: ${botao.dataset.metodo} ${botao.dataset.rota}. Revise e clique em Enviar.`;
    saida.textContent = '';
    (campoCorpo.disabled ? campoRota : campoCorpo).focus();
  });
});

formConsole.addEventListener('submit', async (evento) => {
  evento.preventDefault();

  if (!regexAluno.test(codigoAtual())) {
    textoStatus.className = 'erro';
    textoStatus.textContent = 'Digite um código de aluno válido no topo da página.';
    campoAluno.focus();
    return;
  }

  const metodo = seletorMetodo.value;
  let rota = campoRota.value.trim();
  if (rota && !rota.startsWith('/') && !rota.startsWith('?')) rota = `/${rota}`;
  const url = `${base}/api/${codigoAtual()}${rota}`;

  const opcoes = { method: metodo };
  if (!campoCorpo.disabled && campoCorpo.value.trim()) {
    opcoes.headers = { 'Content-Type': 'application/json' };
    opcoes.body = campoCorpo.value;
  }

  textoStatus.className = '';
  textoStatus.textContent = `${metodo} ${url} ...`;
  saida.textContent = '';
  const inicio = performance.now();

  try {
    const resposta = await fetch(url, opcoes);
    const ms = Math.round(performance.now() - inicio);
    const texto = await resposta.text();

    const extras = ['X-Total-Count', 'Location', 'Retry-After']
      .filter((nome) => resposta.headers.has(nome))
      .map((nome) => `${nome}: ${resposta.headers.get(nome)}`);

    textoStatus.className = resposta.ok ? 'ok' : 'erro';
    textoStatus.textContent = [`${resposta.status} ${resposta.statusText}`, `${ms} ms`, ...extras].join('  ·  ');

    try {
      saida.textContent = texto ? JSON.stringify(JSON.parse(texto), null, 2) : '(resposta sem corpo)';
    } catch {
      saida.textContent = texto;
    }
  } catch (erro) {
    textoStatus.className = 'erro';
    textoStatus.textContent = `Falha de conexão: ${erro.message}`;
  }
});
