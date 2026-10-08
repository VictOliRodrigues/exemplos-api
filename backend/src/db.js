import pg from 'pg';
import { setTimeout as esperar } from 'node:timers/promises';
import { config } from './config.js';
import { recursos } from './recursos.js';

// NUMERIC chega como string por padrão; DATE viraria Date com fuso. Ajustamos os dois.
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (v) => (v === null ? null : Number(v)));
pg.types.setTypeParser(pg.types.builtins.DATE, (v) => v);
pg.types.setTypeParser(pg.types.builtins.INT8, (v) => (v === null ? null : Number(v)));

export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  max: 10,
});

pool.on('error', (erro) => {
  console.error('Erro inesperado no pool do PostgreSQL:', erro.message);
});

const tiposSql = {
  texto: 'TEXT',
  email: 'TEXT',
  opcao: 'TEXT',
  booleano: 'BOOLEAN',
  inteiro: 'INTEGER',
  decimal: 'NUMERIC(10, 2)',
  data: 'DATE',
};

function definicaoColuna(nome, campo) {
  const anulavel = !campo.obrigatorio && campo.padrao === null;
  return `"${nome}" ${tiposSql[campo.tipo]}${anulavel ? '' : ' NOT NULL'}`;
}

function valorPadraoSql(campo) {
  if (campo.padrao === undefined || campo.padrao === null) return null;
  if (typeof campo.padrao === 'string') return `'${campo.padrao.replaceAll("'", "''")}'`;
  return String(campo.padrao);
}

// Cria as tabelas (e colunas novas, se você adicionar campos em recursos.js depois).
async function criarTabelas() {
  // Parte 2: contas de usuário (senha e token guardados só como hash).
  await pool.query(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id SERIAL PRIMARY KEY,
      usuario TEXT NOT NULL UNIQUE,
      senha_hash TEXT NOT NULL,
      token_hash TEXT UNIQUE,
      token_expira_em TIMESTAMPTZ,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
  await pool.query('ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS ativo BOOLEAN NOT NULL DEFAULT true');
  await pool.query('ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS ultimo_login TIMESTAMPTZ');

  for (const [tabela, recurso] of Object.entries(recursos)) {
    const colunas = Object.entries(recurso.campos).map(([nome, campo]) => definicaoColuna(nome, campo));
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "${tabela}" (
        id SERIAL PRIMARY KEY,
        aluno TEXT NOT NULL,
        ${colunas.join(',\n        ')},
        criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
        atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
      )`);
    await pool.query(`CREATE INDEX IF NOT EXISTS "${tabela}_aluno_id_idx" ON "${tabela}" (aluno, id)`);

    for (const [nome, campo] of Object.entries(recurso.campos)) {
      const padrao = valorPadraoSql(campo);
      const tipo = tiposSql[campo.tipo];
      const restricao = padrao === null ? '' : ` NOT NULL DEFAULT ${padrao}`;
      await pool.query(`ALTER TABLE "${tabela}" ADD COLUMN IF NOT EXISTS "${nome}" ${tipo}${restricao}`);
    }
  }
}

// Espera o banco ficar disponível (útil quando o container sobe antes do PostgreSQL).
export async function iniciarBanco({ tentativas = 30, intervaloMs = 2000 } = {}) {
  for (let i = 1; ; i++) {
    try {
      await pool.query('SELECT 1');
      break;
    } catch (erro) {
      if (i >= tentativas) throw erro;
      console.log(`Aguardando o PostgreSQL (${i}/${tentativas}): ${erro.message}`);
      await esperar(intervaloMs);
    }
  }
  await criarTabelas();
}
