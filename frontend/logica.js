/* Regras da turma: funções puras para praticar arrays, laços e operadores. */
const MEDIA_APROVACAO = 7;

function validarAluno(aluno) {
  return aluno !== null && typeof aluno === 'object' &&
    ((typeof aluno.id === 'string' && aluno.id.length > 0) || (Number.isInteger(aluno.id) && aluno.id > 0)) &&
    typeof aluno.nome === 'string' && aluno.nome.trim().length > 0 && aluno.nome.length <= 100 &&
    Array.isArray(aluno.notas) && aluno.notas.length === 4 &&
    aluno.notas.every(nota => typeof nota === 'number' && Number.isFinite(nota) && nota >= 0 && nota <= 10);
}

function calcularMedia(notas) {
  let soma = 0;
  for (const nota of notas) soma += Math.round(nota * 100);
  return soma / (notas.length * 100);
}

function situacaoAluno(aluno) {
  return calcularMedia(aluno.notas) >= MEDIA_APROVACAO ? 'aprovado' : 'reprovado';
}

function calcularEstatisticas(alunos) {
  let soma = 0;
  let aprovados = 0;
  let maior = null;
  let menor = null;
  for (const aluno of alunos) {
    const media = calcularMedia(aluno.notas);
    soma += media;
    if (media >= MEDIA_APROVACAO) aprovados++;
    if (maior === null || media > maior) maior = media;
    if (menor === null || media < menor) menor = media;
  }
  return {
    total: alunos.length, aprovados, reprovados: alunos.length - aprovados,
    media: alunos.length ? soma / alunos.length : null,
    maior, menor, percentual: alunos.length ? aprovados / alunos.length * 100 : null,
  };
}

function normalizarNome(nome) {
  return nome.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
}

function filtrarAlunos(alunos, busca, situacao, ordem) {
  const termo = normalizarNome(busca.trim());
  const filtrados = alunos.filter(aluno => normalizarNome(aluno.nome).includes(termo) &&
    (situacao === 'todos' || situacaoAluno(aluno) === situacao));
  return filtrados.sort((a, b) => {
    const diferenca = calcularMedia(a.notas) - calcularMedia(b.notas);
    if (ordem === 'maior' && diferenca !== 0) return -diferenca;
    if (ordem === 'menor' && diferenca !== 0) return diferenca;
    return a.nome.localeCompare(b.nome, 'pt-BR');
  });
}

if (typeof module !== 'undefined') {
  module.exports = { validarAluno, calcularMedia, situacaoAluno, calcularEstatisticas, filtrarAlunos };
}
