const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validarAluno, calcularMedia, situacaoAluno, calcularEstatisticas, filtrarAlunos } = require('../frontend/logica.js');
const aluno = (id, nome, notas) => ({ id, nome, notas });
const turma = [aluno('1', 'Ágata', [7, 7, 7, 7]), aluno('2', 'Bruno', [6.9, 7, 7, 7]), aluno('3', 'Carlos', [10, 8, 9, 9])];
test('média e aprovação usam o limite exato sem arredondamento', () => {
  assert.equal(calcularMedia([10, 0, 10, 0]), 5);
  assert.equal(situacaoAluno(turma[0]), 'aprovado');
  assert.equal(situacaoAluno(turma[1]), 'reprovado');
});
test('validação rejeita notas inválidas, nomes vazios e estruturas corrompidas', () => {
  assert.ok(validarAluno(turma[0]));
  for (const notas of [[-1, 7, 7, 7], [11, 7, 7, 7], [NaN, 7, 7, 7], ['7', 7, 7, 7], [7, 7], [Infinity, 7, 7, 7]]) {
    assert.equal(validarAluno(aluno('1', 'Ana', notas)), false);
  }
  assert.equal(validarAluno(aluno('1', '   ', [7, 7, 7, 7])), false);
  assert.equal(validarAluno(null), false);
  assert.equal(validarAluno({}), false);
});
test('estatísticas de turma vazia não geram NaN nem extremos fictícios', () => {
  assert.deepEqual(calcularEstatisticas([]), { total: 0, aprovados: 0, reprovados: 0, media: null, maior: null, menor: null, percentual: null });
});
test('estatísticas agregam médias e percentuais da turma', () => {
  const resultado = calcularEstatisticas(turma);
  assert.equal(resultado.aprovados, 2);
  assert.equal(resultado.reprovados, 1);
  assert.equal(resultado.maior, 9);
  assert.equal(resultado.menor, 6.975);
  assert.equal(resultado.media, (7 + 6.975 + 9) / 3);
  assert.equal(resultado.percentual, 2 / 3 * 100);
});
test('busca normaliza acentos e combina com situação', () => {
  assert.deepEqual(filtrarAlunos(turma, ' AGATA ', 'aprovado', 'nome').map(item => item.id), ['1']);
  assert.equal(filtrarAlunos(turma, 'agata', 'reprovado', 'nome').length, 0);
  assert.equal(filtrarAlunos(turma, 'ausente', 'todos', 'nome').length, 0);
});
test('classificação ordena médias sem modificar a lista original', () => {
  assert.deepEqual(filtrarAlunos(turma, '', 'todos', 'maior').map(item => item.id), ['3', '1', '2']);
  assert.deepEqual(filtrarAlunos(turma, '', 'todos', 'menor').map(item => item.id), ['2', '1', '3']);
  assert.deepEqual(turma.map(item => item.id), ['1', '2', '3']);
});
