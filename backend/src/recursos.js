// Definição única: banco, validação e Swagger usam estes campos.
const nota = { tipo: 'decimal', obrigatorio: true, min: 0, max: 10, ajuda: 'Nota de 0 a 10, com até duas casas decimais' };
export const recursos = {
  alunos: {
    singular: 'aluno',
    campos: {
      nome: { tipo: 'texto', obrigatorio: true, max: 100, ajuda: 'Nome do aluno avaliado' },
      nota1: { ...nota }, nota2: { ...nota }, nota3: { ...nota }, nota4: { ...nota },
    },
    busca: ['nome'],
    calculados: {
      media: { type: 'number', minimum: 0, maximum: 10, readOnly: true, description: 'Média aritmética exata das quatro notas' },
      situacao: { type: 'string', enum: ['aprovado', 'reprovado'], readOnly: true, description: 'Aprovado se média >= 7; reprovado se média < 7' },
    },
  },
};
export const camposSomenteLeitura = ['id', 'criadoEm', 'atualizadoEm', 'media', 'situacao'];
export function naoEncontrado(recurso, id) {
  const nome = recurso.singular[0].toUpperCase() + recurso.singular.slice(1);
  return `${nome} ${id} não encontrad${recurso.feminino ? 'a' : 'o'}`;
}
