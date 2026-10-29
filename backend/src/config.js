// Configurações lidas das variáveis de ambiente (definidas no Coolify ou no .env).

function numero(nome, padrao) {
  const valor = process.env[nome];
  if (valor === undefined || valor === '') return padrao;
  const n = Number(valor);
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(`Variável de ambiente ${nome} inválida: "${valor}"`);
  }
  return n;
}

export const config = {
  porta: numero('PORT', 3000),
  databaseUrl: process.env.DATABASE_URL,
  // Máximo de registros por recurso para cada aluno (evita encher o banco).
  limiteRegistros: numero('LIMITE_REGISTROS', 200),
  // Máximo de requisições por minuto por aluno (ou por IP nas rotas sem aluno). 0 desativa.
  limiteRequisicoesPorMinuto: numero('LIMITE_REQ_MINUTO', 300),
  // Tamanho máximo do corpo JSON das requisições.
  tamanhoMaximoCorpo: 10 * 1024,
  // Atraso máximo aceito no parâmetro ?atraso=ms.
  atrasoMaximo: 5000,
  // Parte 2: horas até o token de login expirar.
  tokenHoras: numero('TOKEN_HORAS', 24),
  // Login da área /admin (cadastro e inativação de alunos). Sem ADMIN_SENHA, o /admin fica desligado.
  adminUsuario: process.env.ADMIN_USUARIO || 'admin',
  adminSenha: process.env.ADMIN_SENHA || '',
};

if (!config.databaseUrl) {
  throw new Error('Defina a variável de ambiente DATABASE_URL (ex.: postgres://usuario:senha@host:5432/banco)');
}
