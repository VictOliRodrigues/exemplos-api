const elemento = id => document.getElementById(id);
const camposNotas = [1, 2, 3, 4].map(numero => elemento(`nota-${numero}`));
let alunos = [];
let idEmEdicao = null;
const formatar = valor => valor === null ? '—' : valor.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 2 });

function mostrarMensagem(texto, tipo = 'sucesso') {
  elemento('mensagem').textContent = texto;
  elemento('mensagem').className = `mensagem ${tipo}`;
}

let estatisticasApi = null;
let ocupado = false;
// Configure a integração aqui no JavaScript, sem controles na tela.
// Para a etapa autenticada, informe o token retornado por POST /auth/login.
const conexao = { origem: 'http://localhost:3000', codigo: 'professor', token: '' };

function rotaBase() {
  return conexao.origem + (conexao.token ? '/privado' : `/api/${conexao.codigo}`);
}

async function requisicao(rota, metodo = 'GET', corpo) {
  const headers = {};
  if (conexao.token) headers.Authorization = `Bearer ${conexao.token}`;
  if (corpo !== undefined) headers['Content-Type'] = 'application/json';
  const resposta = await fetch(rotaBase() + rota, {
    method: metodo, headers,
    ...(corpo !== undefined ? { body: JSON.stringify(corpo) } : {}),
  });
  if (resposta.status === 204) return null;
  const dados = await resposta.json();
  if (!resposta.ok) {
    const detalhes = Object.entries(dados.detalhes || {}).map(([campo, erro]) => `${campo}: ${erro}`).join(' | ');
    throw new Error([dados.erro || `Erro HTTP ${resposta.status}`, detalhes].filter(Boolean).join(' | '));
  }
  return dados;
}

async function carregarAlunos() {
  const [registros, estatisticas] = await Promise.all([
    requisicao('/alunos?ordenar=nome'), requisicao('/alunos/estatisticas'),
  ]);
  alunos = registros.map(aluno => ({ ...aluno, notas: [aluno.nota1, aluno.nota2, aluno.nota3, aluno.nota4] }));
  estatisticasApi = estatisticas;
  atualizarTela();
}

async function executar(acao) {
  if (ocupado) return;
  ocupado = true;
  document.querySelectorAll('button').forEach(botao => { botao.disabled = true; });
  try {
    await acao();
  } catch (erro) {
    mostrarMensagem(`Não foi possível concluir: ${erro.message}`, 'erro');
  } finally {
    ocupado = false;
    document.querySelectorAll('button').forEach(botao => { botao.disabled = false; });
    elemento('botao-exportar').disabled = alunosVisiveis().length === 0;
  }
}

function alunosVisiveis() {
  return filtrarAlunos(alunos, elemento('campo-busca').value, elemento('filtro-situacao').value, elemento('filtro-ordem').value);
}

function criarCelula(texto, classe) {
  const celula = document.createElement('td');
  celula.textContent = texto;
  if (classe) celula.className = classe;
  return celula;
}

function atualizarTela() {
  const estatisticas = estatisticasApi || calcularEstatisticas([]);
  elemento('total-alunos').textContent = estatisticas.total;
  elemento('media-turma').textContent = formatar(estatisticas.media);
  elemento('total-aprovados').textContent = estatisticas.aprovados;
  elemento('total-reprovados').textContent = estatisticas.reprovados;
  elemento('taxa-aprovacao').textContent = estatisticas.total ? `${formatar(estatisticas.percentual)}% da turma` : 'Nenhum aluno cadastrado';
  elemento('maior-media').textContent = formatar(estatisticas.maior);
  elemento('menor-media').textContent = formatar(estatisticas.menor);
  elemento('percentual-aprovacao').textContent = estatisticas.total ? `${formatar(estatisticas.percentual)}%` : '—';
  const visiveis = alunosVisiveis();
  const lista = elemento('lista-alunos');
  lista.replaceChildren();
  for (const aluno of visiveis) {
    const linha = document.createElement('tr');
    const nome = criarCelula('');
    const identidade = document.createElement('div');
    identidade.className = 'nome-aluno';
    const iniciais = document.createElement('span');
    iniciais.className = 'iniciais';
    iniciais.setAttribute('aria-hidden', 'true');
    iniciais.textContent = aluno.nome.trim().split(/\s+/).slice(0, 2).map(parte => parte[0]).join('').toLocaleUpperCase('pt-BR');
    identidade.append(iniciais, document.createTextNode(aluno.nome));
    nome.append(identidade);
    linha.append(nome);
    for (const nota of aluno.notas) linha.append(criarCelula(formatar(nota)));
    linha.append(criarCelula(formatar(calcularMedia(aluno.notas)), 'media'));
    const situacao = situacaoAluno(aluno);
    const celulaSituacao = criarCelula('');
    const selo = document.createElement('span');
    selo.className = `selo ${situacao}`;
    selo.textContent = situacao === 'aprovado' ? 'Aprovado' : 'Reprovado';
    celulaSituacao.append(selo);
    linha.append(celulaSituacao);
    const acoes = criarCelula('');
    for (const acao of ['editar', 'excluir']) {
      const botao = document.createElement('button');
      botao.type = 'button';
      botao.disabled = ocupado;
      botao.className = `acao ${acao}`;
      botao.textContent = acao === 'editar' ? 'Editar' : 'Excluir';
      botao.setAttribute('aria-label', `${botao.textContent} ${aluno.nome}`);
      botao.addEventListener('click', () => acao === 'editar' ? editarAluno(aluno.id) : excluirAluno(aluno.id));
      acoes.append(botao);
    }
    linha.append(acoes);
    lista.append(linha);
  }
  elemento('contador-lista').textContent = alunos.length;
  elemento('resultado-filtro').textContent = `Exibindo ${visiveis.length} de ${alunos.length} alunos`;
  elemento('estado-vazio').hidden = visiveis.length > 0;
  elemento('estado-vazio').querySelector('h3').textContent = alunos.length ? 'Nenhum aluno encontrado' : 'Sua turma começa aqui';
  elemento('estado-vazio').querySelector('p').textContent = alunos.length ? 'Tente outro nome ou altere os filtros.' : 'Adicione um aluno ou carregue a turma de exemplo.';
  elemento('botao-exportar').disabled = visiveis.length === 0;
}

function atualizarPrevia() {
  const completas = camposNotas.every(campo => campo.value !== '' && campo.validity.valid);
  elemento('previa-media').textContent = completas ? formatar(calcularMedia(camposNotas.map(campo => Number(campo.value)))) : '—';
}

function limparCampos() {
  idEmEdicao = null;
  elemento('campo-nome').value = '';
  for (const campo of camposNotas) campo.value = '';
  elemento('titulo-formulario').textContent = 'Novo aluno';
  elemento('botao-salvar').textContent = '＋ Adicionar aluno';
  elemento('botao-cancelar').textContent = 'Limpar campos';
  atualizarPrevia();
}

function editarAluno(id) {
  const aluno = alunos.find(item => item.id === id);
  if (!aluno) return;
  idEmEdicao = id;
  elemento('campo-nome').value = aluno.nome;
  camposNotas.forEach((campo, indice) => { campo.value = aluno.notas[indice]; });
  elemento('titulo-formulario').textContent = 'Editar aluno';
  elemento('botao-salvar').textContent = 'Salvar alterações';
  elemento('botao-cancelar').textContent = 'Cancelar edição';
  atualizarPrevia();
  elemento('campo-nome').focus();
}

async function excluirAluno(id) {
  const aluno = alunos.find(item => item.id === id);
  if (!aluno || !confirm(`Excluir ${aluno.nome} da turma?`)) return;
  await executar(async () => {
    await requisicao(`/alunos/${id}`, 'DELETE');
    if (idEmEdicao === id) limparCampos();
    mostrarMensagem('Aluno excluído. Atualizando a turma…');
    await carregarAlunos();
    mostrarMensagem('Aluno excluído da turma.');
  });
}

elemento('botao-salvar').addEventListener('click', () => {
  if (ocupado) return;
  // Sem form: valide cada input antes de enviar os dados.
  const campos = [elemento('campo-nome'), ...camposNotas];
  for (const campo of campos) {
    if (!campo.reportValidity()) return;
  }
  const nome = elemento('campo-nome').value.trim();
  if (!nome) { mostrarMensagem('Informe o nome do aluno.', 'erro'); return; }
  const corpo = { nome };
  camposNotas.forEach((campo, indice) => { corpo[`nota${indice + 1}`] = Number(campo.value); });
  executar(async () => {
    const editando = idEmEdicao !== null;
    await requisicao(editando ? `/alunos/${idEmEdicao}` : '/alunos', editando ? 'PUT' : 'POST', corpo);
    limparCampos();
    mostrarMensagem('Aluno salvo. Atualizando a turma…');
    await carregarAlunos();
    mostrarMensagem(editando ? 'Notas atualizadas com sucesso.' : 'Aluno adicionado à turma.');
  });
});

for (const campo of camposNotas) campo.addEventListener('input', atualizarPrevia);
elemento('botao-cancelar').addEventListener('click', limparCampos);
elemento('campo-busca').addEventListener('input', atualizarTela);
elemento('filtro-situacao').addEventListener('change', atualizarTela);
elemento('filtro-ordem').addEventListener('change', atualizarTela);
elemento('botao-exemplos').addEventListener('click', () => executar(async () => {
  const dados = await requisicao('/exemplos', 'POST');
  mostrarMensagem('Exemplos inseridos. Atualizando a turma…');
  await carregarAlunos();
  mostrarMensagem(`${dados.inseridos.alunos} alunos de exemplo inseridos.`);
}));

// Exporta a lista filtrada. O prefixo evita fórmulas em programas de planilha.
elemento('botao-exportar').addEventListener('click', () => {
  const escapar = valor => {
    let texto = String(valor);
    if (/^[=+@\-\t\r\n]/.test(texto)) texto = `'${texto}`;
    return `"${texto.replaceAll('"', '""')}"`;
  };
  const linhas = [['Aluno', 'Nota 1', 'Nota 2', 'Nota 3', 'Nota 4', 'Média', 'Situação']];
  for (const aluno of alunosVisiveis()) {
    linhas.push([aluno.nome, ...aluno.notas.map(formatar), formatar(calcularMedia(aluno.notas)), situacaoAluno(aluno)]);
  }
  const arquivo = new Blob(['\uFEFF', linhas.map(linha => linha.map(escapar).join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(arquivo);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'notas-da-turma.csv';
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  mostrarMensagem('CSV exportado com os alunos dos filtros atuais.');
});

atualizarTela();
executar(async () => { await carregarAlunos(); mostrarMensagem('Turma carregada da API.'); });
