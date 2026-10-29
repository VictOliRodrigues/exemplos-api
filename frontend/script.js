const CHAVE_DADOS = 'classe.alunos.v1';
const elemento = id => document.getElementById(id);
const formulario = elemento('form-alunos');
const camposNotas = [1, 2, 3, 4].map(numero => elemento(`nota-${numero}`));
let alunos = [];
let idEmEdicao = null;
const formatar = valor => valor === null ? '—' : valor.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 2 });

function mostrarMensagem(texto, tipo = 'sucesso') {
  elemento('mensagem').textContent = texto;
  elemento('mensagem').className = `mensagem ${tipo}`;
}

function carregarDados() {
  try {
    const dados = localStorage.getItem(CHAVE_DADOS);
    if (dados === null) return;
    const lista = JSON.parse(dados);
    if (!Array.isArray(lista) || !lista.every(validarAluno) || new Set(lista.map(aluno => aluno.id)).size !== lista.length) {
      throw new Error('Dados inválidos');
    }
    alunos = lista;
  } catch {
    mostrarMensagem('Não foi possível recuperar os dados salvos. Você pode continuar usando a turma nesta sessão.', 'erro');
  }
}

function salvarDados(texto) {
  atualizarTela();
  try {
    localStorage.setItem(CHAVE_DADOS, JSON.stringify(alunos));
    mostrarMensagem(texto);
  } catch {
    mostrarMensagem(`${texto} O navegador não permitiu salvar: exporte o CSV antes de fechar esta página.`, 'erro');
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
  const estatisticas = calcularEstatisticas(alunos);
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

function limparFormulario() {
  idEmEdicao = null;
  formulario.reset();
  elemento('titulo-formulario').textContent = 'Novo aluno';
  elemento('botao-salvar').textContent = '＋ Adicionar aluno';
  elemento('botao-cancelar').textContent = 'Limpar formulário';
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

function excluirAluno(id) {
  const aluno = alunos.find(item => item.id === id);
  if (!aluno || !confirm(`Excluir ${aluno.nome} da turma?`)) return;
  alunos = alunos.filter(item => item.id !== id);
  if (idEmEdicao === id) limparFormulario();
  salvarDados('Aluno excluído da turma.');
}

formulario.addEventListener('submit', evento => {
  evento.preventDefault();
  if (!formulario.reportValidity()) return;
  const aluno = {
    id: idEmEdicao || crypto.randomUUID(),
    nome: elemento('campo-nome').value.trim(),
    notas: camposNotas.map(campo => Number(campo.value)),
  };
  if (!validarAluno(aluno)) {
    mostrarMensagem('Informe um nome e quatro notas entre 0 e 10.', 'erro');
    return;
  }
  const editando = idEmEdicao !== null;
  if (editando) alunos = alunos.map(item => item.id === idEmEdicao ? aluno : item);
  else alunos.push(aluno);
  limparFormulario();
  salvarDados(editando ? 'Notas atualizadas com sucesso.' : 'Aluno adicionado à turma.');
});

for (const campo of camposNotas) campo.addEventListener('input', atualizarPrevia);
elemento('botao-cancelar').addEventListener('click', limparFormulario);
elemento('campo-busca').addEventListener('input', atualizarTela);
elemento('filtro-situacao').addEventListener('change', atualizarTela);
elemento('filtro-ordem').addEventListener('change', atualizarTela);
elemento('botao-exemplos').addEventListener('click', () => {
  if (alunos.some(aluno => aluno.id.startsWith('exemplo-'))) {
    mostrarMensagem('A turma de exemplo já foi adicionada. Seus alunos foram mantidos.');
    return;
  }
  const exemplos = [
    ['Ana Oliveira', [8.5, 9, 7.5, 9]], ['Bruno Santos', [5, 6.5, 4, 6]],
    ['Camila Costa', [9, 9.5, 10, 9]], ['Daniel Almeida', [7, 7, 7, 7]],
    ['Elisa Ferreira', [6, 5.5, 7, 6.5]], ['Felipe Lima', [8, 7.5, 8.5, 8]],
  ];
  exemplos.forEach(([nome, notas], indice) => alunos.push({ id: `exemplo-${indice}`, nome, notas }));
  salvarDados('Turma de exemplo adicionada. Seus cadastros foram mantidos.');
});

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

carregarDados();
atualizarTela();
