// Operações genéricas de CRUD, iguais para todos os recursos definidos em recursos.js.
// Nomes de tabela e de coluna vêm sempre da definição; valores vão sempre como parâmetros ($1, $2...).

import { pool } from './db.js';
import { config } from './config.js';
import { ErroHttp } from './http.js';
import { recursos, naoEncontrado } from './recursos.js';
import { validarCorpo, converterFiltro } from './validacao.js';
import { exemplos } from './exemplos.js';
import { resultadoAluno, estatisticasTurma, mediaSql, situacaoSql } from './notas.js';

const parametrosDaListagem = ['q', 'ordenar', 'ordem', 'limite', 'pagina'];
const parametrosGlobais = ['atraso'];

const tiposArraySql = {
  texto: 'text[]',
  email: 'text[]',
  opcao: 'text[]',
  booleano: 'boolean[]',
  inteiro: 'integer[]',
  decimal: 'numeric[]',
  data: 'date[]',
};

const colunasEspeciais = { id: 'id', criadoEm: 'criado_em', atualizadoEm: 'atualizado_em' };

function colunasSelect(recurso) {
  return ['id', ...Object.keys(recurso.campos).map((nome) => `"${nome}"`), 'criado_em', 'atualizado_em'].join(', ');
}

function paraJson(recurso, linha) {
  const registro = { id: linha.id };
  for (const nome of Object.keys(recurso.campos)) registro[nome] = linha[nome];
  if (recurso.singular === 'aluno') Object.assign(registro, resultadoAluno(registro));
  registro.criadoEm = linha.criado_em;
  registro.atualizadoEm = linha.atualizado_em;
  return registro;
}

function inteiroPositivo(nome, texto, maximo) {
  const n = Number(texto);
  if (!Number.isInteger(n) || n < 1 || (maximo && n > maximo)) {
    throw new ErroHttp(400, `Parâmetro "${nome}" deve ser um número inteiro${maximo ? ` entre 1 e ${maximo}` : ' maior que 0'}`);
  }
  return n;
}

export async function listar(nomeRecurso, aluno, parametros) {
  const recurso = recursos[nomeRecurso];
  const condicoes = ['aluno = $1'];
  const valores = [aluno];

  for (const chave of new Set(parametros.keys())) {
    if (parametrosDaListagem.includes(chave) || parametrosGlobais.includes(chave)) continue;
    if (chave === 'situacao' && nomeRecurso === 'alunos') {
      const situacoes = parametros.getAll(chave);
      if (!situacoes.every(valor => ['aprovado', 'reprovado'].includes(valor))) {
        throw new ErroHttp(400, 'Filtro "situacao" deve ser aprovado ou reprovado');
      }
      valores.push(situacoes);
      condicoes.push(`${situacaoSql} = ANY($${valores.length}::text[])`);
      continue;
    }
    const campo = recurso.campos[chave];
    if (!campo) {
      throw new ErroHttp(400, `Parâmetro desconhecido "${chave}"`, {
        detalhes: {
          filtros: Object.keys(recurso.campos).join(', '),
          outros: parametrosDaListagem.join(', '),
        },
      });
    }
    // ?prioridade=alta&prioridade=media → prioridade é "alta" OU "media"
    let lista = parametros.getAll(chave).map((texto) => converterFiltro(chave, campo, texto));
    let coluna = `"${chave}"`;
    if (campo.tipo === 'texto' || campo.tipo === 'email') {
      lista = lista.map((texto) => texto.toLowerCase());
      coluna = `lower(${coluna})`;
    }
    valores.push(lista);
    condicoes.push(`${coluna} = ANY($${valores.length}::${tiposArraySql[campo.tipo]})`);
  }

  const busca = parametros.get('q');
  if (busca) {
    valores.push(`%${busca.replace(/[\\%_]/g, '\\$&')}%`);
    condicoes.push(`(${recurso.busca.map((nome) => `"${nome}" ILIKE $${valores.length}`).join(' OR ')})`);
  }

  const where = condicoes.join(' AND ');

  const campoOrdem = parametros.get('ordenar') ?? 'id';
  const colunaCalculada = nomeRecurso === 'alunos' ? { media: mediaSql, situacao: situacaoSql }[campoOrdem] : null;
  const colunaOrdem = colunaCalculada ?? colunasEspeciais[campoOrdem] ?? (recurso.campos[campoOrdem] ? `"${campoOrdem}"` : null);
  if (!colunaOrdem) {
    throw new ErroHttp(400, `Não é possível ordenar por "${campoOrdem}". Use: id, media, situacao, ${Object.keys(recurso.campos).join(', ')}, criadoEm, atualizadoEm`);
  }
  const ordem = (parametros.get('ordem') ?? 'asc').toLowerCase();
  if (ordem !== 'asc' && ordem !== 'desc') {
    throw new ErroHttp(400, 'Parâmetro "ordem" deve ser asc ou desc');
  }

  let paginacao = '';
  if (parametros.has('limite')) {
    const limite = inteiroPositivo('limite', parametros.get('limite'), config.limiteRegistros);
    const pagina = parametros.has('pagina') ? inteiroPositivo('pagina', parametros.get('pagina')) : 1;
    paginacao = ` LIMIT ${limite} OFFSET ${(pagina - 1) * limite}`;
  } else if (parametros.has('pagina')) {
    throw new ErroHttp(400, 'Use "pagina" junto com "limite", ex.: ?limite=10&pagina=2');
  }

  const [{ rows: contagem }, { rows }] = await Promise.all([
    pool.query(`SELECT count(*) AS total FROM "${nomeRecurso}" WHERE ${where}`, valores),
    pool.query(
      `SELECT ${colunasSelect(recurso)} FROM "${nomeRecurso}" WHERE ${where}
       ORDER BY ${colunaOrdem} ${ordem.toUpperCase()} NULLS LAST, id ${ordem.toUpperCase()}${paginacao}`,
      valores,
    ),
  ]);

  return { registros: rows.map((linha) => paraJson(recurso, linha)), total: contagem[0].total };
}

export async function obter(nomeRecurso, aluno, id) {
  const recurso = recursos[nomeRecurso];
  const { rows } = await pool.query(
    `SELECT ${colunasSelect(recurso)} FROM "${nomeRecurso}" WHERE aluno = $1 AND id = $2`,
    [aluno, id],
  );
  if (rows.length === 0) throw new ErroHttp(404, naoEncontrado(recurso, id));
  return paraJson(recurso, rows[0]);
}

async function inserir(nomeRecurso, aluno, dados) {
  const recurso = recursos[nomeRecurso];
  const nomes = Object.keys(dados);
  const { rows } = await pool.query(
    `INSERT INTO "${nomeRecurso}" (aluno, ${nomes.map((nome) => `"${nome}"`).join(', ')})
     VALUES ($1, ${nomes.map((_, i) => `$${i + 2}`).join(', ')})
     RETURNING ${colunasSelect(recurso)}`,
    [aluno, ...Object.values(dados)],
  );
  return paraJson(recurso, rows[0]);
}

async function contar(nomeRecurso, aluno) {
  const { rows } = await pool.query(`SELECT count(*) AS total FROM "${nomeRecurso}" WHERE aluno = $1`, [aluno]);
  return rows[0].total;
}

export async function criar(nomeRecurso, aluno, corpo) {
  const dados = validarCorpo(recursos[nomeRecurso], corpo, { parcial: false });
  if ((await contar(nomeRecurso, aluno)) >= config.limiteRegistros) {
    throw new ErroHttp(409, `Limite de ${config.limiteRegistros} ${nomeRecurso} por aluno atingido. Apague alguns antes de criar novos.`);
  }
  return inserir(nomeRecurso, aluno, dados);
}

async function alterar(nomeRecurso, aluno, id, dados) {
  const recurso = recursos[nomeRecurso];
  const nomes = Object.keys(dados);
  const { rows } = await pool.query(
    `UPDATE "${nomeRecurso}"
     SET ${nomes.map((nome, i) => `"${nome}" = $${i + 3}`).join(', ')}, atualizado_em = now()
     WHERE aluno = $1 AND id = $2
     RETURNING ${colunasSelect(recurso)}`,
    [aluno, id, ...Object.values(dados)],
  );
  if (rows.length === 0) throw new ErroHttp(404, naoEncontrado(recurso, id));
  return paraJson(recurso, rows[0]);
}

// PUT: substitui o registro inteiro (campos não enviados voltam ao valor padrão).
export async function substituir(nomeRecurso, aluno, id, corpo) {
  const dados = validarCorpo(recursos[nomeRecurso], corpo, { parcial: false });
  return alterar(nomeRecurso, aluno, id, dados);
}

// PATCH: altera somente os campos enviados.
export async function atualizar(nomeRecurso, aluno, id, corpo) {
  const dados = validarCorpo(recursos[nomeRecurso], corpo, { parcial: true });
  return alterar(nomeRecurso, aluno, id, dados);
}

export async function remover(nomeRecurso, aluno, id) {
  const { rowCount } = await pool.query(`DELETE FROM "${nomeRecurso}" WHERE aluno = $1 AND id = $2`, [aluno, id]);
  if (rowCount === 0) throw new ErroHttp(404, naoEncontrado(recursos[nomeRecurso], id));
}

export async function removerTodos(nomeRecurso, aluno) {
  await pool.query(`DELETE FROM "${nomeRecurso}" WHERE aluno = $1`, [aluno]);
}

// Insere os dados de exemplo de todos os recursos (respeitando o limite por aluno).
export async function inserirExemplos(aluno) {
  const inseridos = {};
  for (const nomeRecurso of Object.keys(recursos)) {
    const vagas = config.limiteRegistros - (await contar(nomeRecurso, aluno));
    const lista = exemplos[nomeRecurso].slice(0, Math.max(0, vagas));
    for (const exemplo of lista) {
      await inserir(nomeRecurso, aluno, validarCorpo(recursos[nomeRecurso], exemplo, { parcial: false }));
    }
    inseridos[nomeRecurso] = lista.length;
  }
  return inseridos;
}

// A turma inteira do dono, sem os filtros e a pagina??o da listagem.
export async function estatisticas(aluno) {
  const { rows } = await pool.query('SELECT nota1, nota2, nota3, nota4 FROM alunos WHERE aluno = $1', [aluno]);
  return estatisticasTurma(rows);
}
