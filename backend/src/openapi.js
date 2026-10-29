// Gera a especificação OpenAPI 3 (usada pelo Swagger em /swagger) a partir de recursos.js.

import { config } from './config.js';
import { recursos } from './recursos.js';
import { exemplos } from './exemplos.js';

const dataExemplo = '2026-10-07T21:30:00.000Z';

function capitalizar(texto) {
  return texto[0].toUpperCase() + texto.slice(1);
}

function esquemaDoCampo(campo) {
  const esquema = {};
  switch (campo.tipo) {
    case 'texto':
      Object.assign(esquema, { type: 'string', maxLength: campo.max });
      if (campo.obrigatorio) esquema.minLength = 1;
      break;
    case 'email':
      Object.assign(esquema, { type: 'string', format: 'email', maxLength: campo.max });
      break;
    case 'booleano':
      esquema.type = 'boolean';
      break;
    case 'inteiro':
    case 'decimal':
      esquema.type = campo.tipo === 'inteiro' ? 'integer' : 'number';
      if (campo.min !== undefined) esquema.minimum = campo.min;
      if (campo.max !== undefined) esquema.maximum = campo.max;
      break;
    case 'opcao':
      Object.assign(esquema, { type: 'string', enum: campo.opcoes });
      break;
    case 'data':
      Object.assign(esquema, { type: 'string', format: 'date' });
      break;
  }
  if (campo.ajuda) esquema.description = campo.ajuda;
  if (!campo.obrigatorio && campo.padrao === null) esquema.nullable = true;
  if (campo.padrao !== undefined) esquema.default = campo.padrao;
  return esquema;
}

function esquemasDoRecurso(nomeRecurso, recurso) {
  const Nome = capitalizar(recurso.singular);
  const propriedades = Object.fromEntries(
    Object.entries(recurso.campos).map(([nome, campo]) => [nome, esquemaDoCampo(campo)]),
  );
  const obrigatorios = Object.entries(recurso.campos).filter(([, c]) => c.obrigatorio).map(([nome]) => nome);
  const exemplo = exemplos[nomeRecurso]?.[0] ?? {};
  const completo = Object.fromEntries(
    Object.entries(recurso.campos).map(([nome, campo]) => [nome, exemplo[nome] ?? campo.padrao ?? null]),
  );
  const primeiroOpcional = Object.keys(recurso.campos).find((nome) => !recurso.campos[nome].obrigatorio);

  return {
    [Nome]: {
      type: 'object',
      description: `${Nome} como a API devolve`,
      properties: {
        id: { type: 'integer', description: 'Gerado pela API', readOnly: true },
        ...propriedades,
        ...recurso.calculados,
        criadoEm: { type: 'string', format: 'date-time', description: 'Quando foi criado', readOnly: true },
        atualizadoEm: { type: 'string', format: 'date-time', description: 'Última alteração', readOnly: true },
      },
      required: ['id', ...Object.keys(propriedades), ...Object.keys(recurso.calculados || {}), 'criadoEm', 'atualizadoEm'],
      example: { id: 1, ...completo, media: 8.5, situacao: 'aprovado', criadoEm: dataExemplo, atualizadoEm: dataExemplo },
    },
    [`${Nome}Entrada`]: {
      type: 'object',
      description: `Corpo do POST e do PUT. No PUT, campos não enviados voltam ao valor padrão.`,
      properties: propriedades,
      required: obrigatorios,
      additionalProperties: false,
      example: exemplo,
    },
    [`${Nome}Parcial`]: {
      type: 'object',
      description: 'Corpo do PATCH: envie só os campos que quer alterar.',
      properties: propriedades,
      minProperties: 1,
      additionalProperties: false,
      example: primeiroOpcional ? { [primeiroOpcional]: completo[primeiroOpcional] } : {},
    },
  };
}

function json(esquemaOuRef, exemplo) {
  const conteudo = { schema: esquemaOuRef };
  if (exemplo !== undefined) conteudo.example = exemplo;
  return { 'application/json': conteudo };
}

const ref = (nome) => ({ $ref: `#/components/schemas/${nome}` });
const respostaRef = (nome) => ({ $ref: `#/components/responses/${nome}` });
const parametroRef = (nome) => ({ $ref: `#/components/parameters/${nome}` });

function caminhosDoRecurso(nomeRecurso, recurso) {
  const Nome = capitalizar(recurso.singular);
  const tag = capitalizar(nomeRecurso);
  const campos = Object.keys(recurso.campos);
  const artigo = recurso.feminino ? 'a' : 'o';

  const filtros = Object.entries(recurso.campos).map(([nome, campo]) => {
    const { description, default: _, nullable, ...esquema } = esquemaDoCampo(campo);
    return {
      name: nome,
      in: 'query',
      description: `Filtra pelo valor exato de "${nome}"${campo.tipo === 'texto' ? ' (sem diferenciar maiúsculas)' : ''}. Repita o parâmetro para aceitar mais de um valor.`,
      schema: esquema,
    };
  });

  return {
    [`/api/{aluno}/${nomeRecurso}`]: {
      parameters: [parametroRef('aluno')],
      get: {
        tags: [tag],
        operationId: `listar${tag}`,
        summary: `Listar ${nomeRecurso}`,
        description: `Devolve um array. O total encontrado (sem contar a paginação) vem no header **X-Total-Count**.`,
        parameters: [
          { name: 'q', in: 'query', description: `Busca parte do texto em: ${recurso.busca.join(', ')}`, schema: { type: 'string' } },
          { name: 'ordenar', in: 'query', description: 'Campo usado para ordenar', schema: { type: 'string', enum: ['id', ...campos, ...Object.keys(recurso.calculados || {}), 'criadoEm', 'atualizadoEm'], default: 'id' } },
          { name: 'ordem', in: 'query', description: 'Crescente ou decrescente', schema: { type: 'string', enum: ['asc', 'desc'], default: 'asc' } },
          { name: 'limite', in: 'query', description: 'Quantidade máxima de itens na resposta', schema: { type: 'integer', minimum: 1, maximum: config.limiteRegistros } },
          { name: 'pagina', in: 'query', description: 'Página desejada (começa em 1). Use junto com "limite".', schema: { type: 'integer', minimum: 1 } },
          ...filtros,
          { name: 'situacao', in: 'query', description: 'Filtra pela situa??o calculada', schema: { type: 'string', enum: ['aprovado', 'reprovado'] } },
          parametroRef('atraso'),
        ],
        responses: {
          200: {
            description: `Lista de ${nomeRecurso}`,
            headers: { 'X-Total-Count': { description: 'Total encontrado', schema: { type: 'integer' } } },
            content: json({ type: 'array', items: ref(Nome) }),
          },
          400: respostaRef('ParametroInvalido'),
        },
      },
      post: {
        tags: [tag],
        operationId: `criar${Nome}`,
        summary: `Criar ${recurso.singular}`,
        parameters: [parametroRef('atraso')],
        requestBody: { required: true, content: json(ref(`${Nome}Entrada`)) },
        responses: {
          201: {
            description: `${Nome} criad${artigo}`,
            headers: { Location: { description: `Rota d${artigo} ${recurso.singular} criad${artigo}`, schema: { type: 'string' } } },
            content: json(ref(Nome)),
          },
          400: respostaRef('DadosInvalidos'),
          409: respostaRef('LimiteAtingido'),
          415: respostaRef('SemJson'),
        },
      },
      delete: {
        tags: [tag],
        operationId: `apagarTodos${tag}`,
        summary: `Apagar tod${artigo}s ${artigo}s ${nomeRecurso}`,
        description: `Apaga só ${artigo}s ${nomeRecurso} deste código de aluno.`,
        parameters: [parametroRef('atraso')],
        responses: { 204: { description: 'Apagados (resposta sem corpo)' }, 400: respostaRef('ParametroInvalido') },
      },
    },

    [`/api/{aluno}/${nomeRecurso}/{id}`]: {
      parameters: [parametroRef('aluno'), parametroRef('id')],
      get: {
        tags: [tag],
        operationId: `buscar${Nome}`,
        summary: `Buscar um${recurso.feminino ? 'a' : ''} ${recurso.singular}`,
        parameters: [parametroRef('atraso')],
        responses: { 200: { description: `${Nome} encontrad${artigo}`, content: json(ref(Nome)) }, 400: respostaRef('ParametroInvalido'), 404: respostaRef('NaoEncontrado') },
      },
      put: {
        tags: [tag],
        operationId: `substituir${Nome}`,
        summary: `Substituir ${recurso.singular} (completo)`,
        description: 'Envie o objeto completo. Campos que ficarem de fora voltam ao valor padrão.',
        parameters: [parametroRef('atraso')],
        requestBody: { required: true, content: json(ref(`${Nome}Entrada`)) },
        responses: {
          200: { description: `${Nome} atualizad${artigo}`, content: json(ref(Nome)) },
          400: respostaRef('DadosInvalidos'),
          404: respostaRef('NaoEncontrado'),
          415: respostaRef('SemJson'),
        },
      },
      patch: {
        tags: [tag],
        operationId: `alterar${Nome}`,
        summary: `Alterar alguns campos d${artigo} ${recurso.singular}`,
        description: 'Envie só os campos que quer mudar. O resto continua igual.',
        parameters: [parametroRef('atraso')],
        requestBody: { required: true, content: json(ref(`${Nome}Parcial`)) },
        responses: {
          200: { description: `${Nome} atualizad${artigo}`, content: json(ref(Nome)) },
          400: respostaRef('DadosInvalidos'),
          404: respostaRef('NaoEncontrado'),
          415: respostaRef('SemJson'),
        },
      },
      delete: {
        tags: [tag],
        operationId: `apagar${Nome}`,
        summary: `Apagar ${recurso.singular}`,
        parameters: [parametroRef('atraso')],
        responses: { 204: { description: `Apagad${artigo} (resposta sem corpo)` }, 400: respostaRef('ParametroInvalido'), 404: respostaRef('NaoEncontrado') },
      },
    },
  };
}

const erro = {
  type: 'object',
  properties: {
    erro: { type: 'string', description: 'Mensagem do erro' },
    detalhes: { type: 'object', description: 'Motivo por campo, quando houver', additionalProperties: { type: 'string' } },
  },
  required: ['erro'],
};

function respostaDeErro(descricao, exemplo) {
  return { description: descricao, content: json(ref('Erro'), exemplo) };
}

export function gerarOpenApi() {
  const nomes = Object.keys(recursos);
  const primeiro = recursos[nomes[0]];

  const schemas = { Erro: erro };
  let paths = {};
  for (const [nomeRecurso, recurso] of Object.entries(recursos)) {
    Object.assign(schemas, esquemasDoRecurso(nomeRecurso, recurso));
    paths = { ...paths, ...caminhosDoRecurso(nomeRecurso, recurso) };
  }

  paths['/api/{aluno}/exemplos'] = {
    post: {
      tags: ['Utilitários'],
      operationId: 'inserirExemplos',
      summary: 'Inserir dados de exemplo',
      parameters: [parametroRef('aluno'), parametroRef('atraso')],
      responses: {
        201: {
          description: 'Exemplos inseridos',
          content: json(
            { type: 'object', properties: { mensagem: { type: 'string' }, inseridos: { type: 'object', additionalProperties: { type: 'integer' } } } },
            { mensagem: 'Dados de exemplo inseridos', inseridos: Object.fromEntries(nomes.map((n) => [n, exemplos[n]?.length ?? 0])) },
          ),
        },
        400: respostaRef('ParametroInvalido'),
      },
    },
  };
  schemas.Estatisticas = {
    type: 'object',
    properties: {
      total: { type: 'integer' }, aprovados: { type: 'integer' }, reprovados: { type: 'integer' },
      media: { type: 'number', nullable: true }, maior: { type: 'number', nullable: true },
      menor: { type: 'number', nullable: true }, percentual: { type: 'number', nullable: true },
    },
    required: ['total', 'aprovados', 'reprovados', 'media', 'maior', 'menor', 'percentual'],
  };
  paths['/api/{aluno}/alunos/estatisticas'] = {
    get: {
      tags: ['Alunos'], operationId: 'estatisticasTurma', summary: 'Estat?sticas da turma completa',
      description: 'N?o aplica filtros ou pagina??o da listagem. Turma vazia retorna contagens 0 e m?dias e percentual null.',
      parameters: [parametroRef('aluno'), parametroRef('atraso')],
      responses: { 200: { description: 'Resumo da turma', content: json(ref('Estatisticas')) } },
    },
  };
  // Parte 2: as mesmas rotas de dados em /privado, exigindo o token no header Authorization.
  for (const [caminho, operacoes] of Object.entries(paths)) {
    const copia = structuredClone(operacoes);
    if (copia.parameters) copia.parameters = copia.parameters.filter((p) => p.$ref !== parametroRef('aluno').$ref);
    for (const operacao of Object.values(copia)) {
      if (!operacao.responses) continue;
      operacao.tags = operacao.tags.map((t) => `${t} (privado)`);
      operacao.operationId += 'Privado';
      operacao.parameters = operacao.parameters?.filter((p) => p.$ref !== parametroRef('aluno').$ref);
      operacao.security = [{ token: [] }];
      operacao.responses[401] = respostaRef('NaoAutenticado');
    }
    paths[caminho.replace('/api/{aluno}', '/privado')] = copia;
  }

  const credenciais = {
    type: 'object',
    properties: {
      usuario: { type: 'string', pattern: '^[a-z0-9_-]{3,30}$' },
      senha: { type: 'string', minLength: 4, maxLength: 100 },
    },
    required: ['usuario', 'senha'],
    example: { usuario: 'maria', senha: '1234' },
  };
  paths['/auth/login'] = {
    post: {
      tags: ['Autenticação'],
      operationId: 'login',
      summary: 'Entrar e receber um token',
      description: `Devolve um token válido por ${config.tokenHoras} h. Fazer login de novo gera outro token e invalida o anterior. Envie-o nas rotas /privado com o header \`Authorization: Bearer <token>\` (no Swagger, clique em **Authorize**).`,
      requestBody: { required: true, content: json(credenciais) },
      responses: {
        200: {
          description: 'Login feito',
          content: json({ type: 'object' }, { token: 'a3f9…(64 caracteres)', tipo: 'Bearer', expiraEm: dataExemplo, usuario: 'maria' }),
        },
        400: respostaRef('DadosInvalidos'),
        401: respostaDeErro('Usuário ou senha errados', { erro: 'Usuário ou senha incorretos' }),
        403: respostaDeErro('Conta inativada pelo professor', { erro: 'Sua conta está inativa. Fale com o professor.' }),
        415: respostaRef('SemJson'),
      },
    },
  };
  paths['/auth/eu'] = {
    get: {
      tags: ['Autenticação'],
      operationId: 'quemSouEu',
      summary: 'Ver de quem é o token e quando expira',
      security: [{ token: [] }],
      responses: {
        200: { description: 'Token válido', content: json({ type: 'object' }, { usuario: 'maria', expiraEm: dataExemplo }) },
        401: respostaRef('NaoAutenticado'),
      },
    },
  };
  paths['/auth/logout'] = {
    post: {
      tags: ['Autenticação'],
      operationId: 'logout',
      summary: 'Sair (invalida o token atual)',
      security: [{ token: [] }],
      responses: { 204: { description: 'Token invalidado (resposta sem corpo)' }, 401: respostaRef('NaoAutenticado') },
    },
  };

  paths['/api'] = {
    get: {
      tags: ['Utilitários'],
      operationId: 'descreverApi',
      summary: 'Descrição da API em JSON (recursos, campos e limites)',
      responses: { 200: { description: 'Descrição da API', content: json({ type: 'object' }) } },
    },
  };
  paths['/saude'] = {
    get: {
      tags: ['Utilitários'],
      operationId: 'verificarSaude',
      summary: 'Verifica se a API e o banco estão no ar',
      responses: { 200: { description: 'Tudo certo', content: json({ type: 'object', properties: { status: { type: 'string' } } }, { status: 'ok' }) } },
    },
  };

  for (const caminho of Object.values(paths)) {
    // Parâmetros da rota (aluno, id) vão para o começo de cada operação, para aparecerem primeiro no Swagger.
    const comuns = caminho.parameters ?? [];
    delete caminho.parameters;
    for (const operacao of Object.values(caminho)) {
      operacao.parameters = [...comuns, ...(operacao.parameters ?? [])];
      // O limite de requisições por minuto vale para todas as rotas.
      if (config.limiteRequisicoesPorMinuto) operacao.responses[429] = respostaRef('MuitasRequisicoes');
    }
  }

  return {
    openapi: '3.0.3',
    info: {
      title: 'API de Notas e Aprova??o',
      version: '1.0.0',
      description: [
        'API REST para praticar requisições HTTP.',
        '',
        '**Código do aluno:** todas as rotas começam com `/api/{aluno}`. Escolha um código (3 a 30 caracteres: letras minúsculas, números, `-` ou `_`) e use sempre o mesmo: cada código tem os seus próprios dados.',
        '',
        `**Parte 2 (autenticação):** com o usuário e a senha que o professor cadastrou, faça login em \`POST /auth/login\` e envie o token no header \`Authorization: Bearer <token>\` nas rotas \`/privado\`. O token vale ${config.tokenHoras} h ou até um novo login.`,
        '',
        `**Limites:** até ${config.limiteRegistros} ${nomes[0]} por aluno, ${config.limiteRequisicoesPorMinuto || 'sem limite de'} requisições por minuto e corpo de até ${config.tamanhoMaximoCorpo / 1024} KB.`,
        '',
        'Clique numa rota, depois em **Try it out** e em **Execute** para testar.',
        '',
        '[← Voltar para a documentação](/)',
      ].join('\n'),
    },
    servers: [{ url: '/', description: 'Este servidor' }],
    security: [], // Parte 1 é pública; as rotas da parte 2 declaram a própria segurança
    tags: [
      ...nomes.map((n) => ({ name: capitalizar(n), description: `CRUD de ${n}` })),
      { name: 'Autenticação', description: 'Parte 2: login e token' },
      ...nomes.map((n) => ({ name: `${capitalizar(n)} (privado)`, description: `CRUD de ${n} com token (parte 2)` })),
      { name: 'Utilitários', description: 'Rotas de apoio' },
    ],
    paths,
    components: {
      securitySchemes: {
        token: { type: 'http', scheme: 'bearer', description: 'Token recebido em POST /auth/login' },
      },
      parameters: {
        aluno: {
          name: 'aluno',
          in: 'path',
          required: true,
          description: 'Seu código de aluno',
          schema: { type: 'string', pattern: '^[a-z0-9_-]{3,30}$' },
          example: 'seu-codigo',
        },
        id: { name: 'id', in: 'path', required: true, description: `id d${primeiro.feminino ? 'a' : 'o'} ${primeiro.singular}`, schema: { type: 'integer', minimum: 1 }, example: 1 },
        atraso: {
          name: 'atraso',
          in: 'query',
          description: 'Espera esse tempo (em milissegundos) antes de responder. Útil para testar telas de "carregando...".',
          schema: { type: 'integer', minimum: 0, maximum: config.atrasoMaximo },
        },
      },
      responses: {
        DadosInvalidos: respostaDeErro('Dados inválidos, JSON mal formado ou campo desconhecido', {
          erro: 'Dados inválidos',
          detalhes: { nome: 'Campo obrigatório', nota1: 'Deve ser um número (recebido: o texto "7.5"). Dica: converta com Number(valor)' },
        }),
        ParametroInvalido: respostaDeErro('Parâmetro ou id inválido', { erro: 'Parâmetro "ordem" deve ser asc ou desc' }),
        NaoEncontrado: respostaDeErro('Não encontrado (ou é de outro código de aluno)', { erro: `${capitalizar(primeiro.singular)} 1 não encontrad${primeiro.feminino ? 'a' : 'o'}` }),
        LimiteAtingido: respostaDeErro('Limite de registros atingido', { erro: `Limite de ${config.limiteRegistros} ${nomes[0]} por aluno atingido. Apague alguns antes de criar novos.` }),
        SemJson: respostaDeErro('Faltou o header Content-Type: application/json', { erro: 'Envie o corpo em JSON com o header "Content-Type: application/json"' }),
        NaoAutenticado: {
          description: 'Token ausente, inválido ou expirado',
          headers: { 'WWW-Authenticate': { schema: { type: 'string' } } },
          content: json(ref('Erro'), { erro: 'Token expirado. Faça login de novo em POST /auth/login.' }),
        },
        MuitasRequisicoes: {
          description: `Mais de ${config.limiteRequisicoesPorMinuto} requisições em 1 minuto (provavelmente um loop no código)`,
          headers: { 'Retry-After': { description: 'Segundos para tentar de novo', schema: { type: 'integer' } } },
          content: json(ref('Erro'), { erro: 'Muitas requisições. Tente de novo em 42 s (verifique se não há um loop no seu código)' }),
        },
      },
      schemas,
    },
  };
}
