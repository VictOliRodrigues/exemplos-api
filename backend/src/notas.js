export const MEDIA_APROVACAO = 7;
// Soma em centésimos: mantém a mesma precisão dos NUMERIC(10, 2) do banco.
export function resultadoAluno(aluno) {
  const soma = ['nota1', 'nota2', 'nota3', 'nota4'].reduce((total, campo) => total + Math.round(aluno[campo] * 100), 0);
  const media = soma / 400;
  return { media, situacao: media >= MEDIA_APROVACAO ? 'aprovado' : 'reprovado' };
}
export function estatisticasTurma(alunos) {
  let soma = 0;
  let aprovados = 0;
  let maior = null;
  let menor = null;
  for (const aluno of alunos) {
    const { media, situacao } = resultadoAluno(aluno);
    soma += media;
    if (situacao === 'aprovado') aprovados++;
    if (maior === null || media > maior) maior = media;
    if (menor === null || media < menor) menor = media;
  }
  return {
    total: alunos.length, aprovados, reprovados: alunos.length - aprovados,
    media: alunos.length ? soma / alunos.length : null, maior, menor,
    percentual: alunos.length ? aprovados / alunos.length * 100 : null,
  };
}
export const mediaSql = '(("nota1" + "nota2" + "nota3" + "nota4") / 4)';
export const situacaoSql = `(CASE WHEN ${mediaSql} >= 7 THEN 'aprovado' ELSE 'reprovado' END)`;
