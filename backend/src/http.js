// Funções auxiliares para ler requisições e enviar respostas JSON.

export const cabecalhosCors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Expose-Headers': 'X-Total-Count, Location, Retry-After',
  'Access-Control-Max-Age': '86400',
};

// Erro com status HTTP: qualquer handler pode lançar e o servidor responde no formato padrão.
export class ErroHttp extends Error {
  constructor(status, mensagem, { detalhes, cabecalhos } = {}) {
    super(mensagem);
    this.status = status;
    this.detalhes = detalhes;
    this.cabecalhos = cabecalhos;
  }
}

export function enviarJson(res, status, dados, cabecalhos = {}) {
  const corpo = dados === undefined ? '' : JSON.stringify(dados, null, 2);
  res.writeHead(status, {
    ...cabecalhosCors,
    ...(corpo ? { 'Content-Type': 'application/json; charset=utf-8' } : {}),
    ...cabecalhos,
  });
  res.end(corpo);
}

export function enviarErro(res, status, mensagem, detalhes, cabecalhos) {
  enviarJson(res, status, detalhes ? { erro: mensagem, detalhes } : { erro: mensagem }, cabecalhos);
}

export async function lerCorpoJson(req, tamanhoMaximo) {
  const tipo = (req.headers['content-type'] ?? '').toLowerCase();
  if (!tipo.includes('application/json')) {
    throw new ErroHttp(415, 'Envie o corpo em JSON com o header "Content-Type: application/json"');
  }

  const pedacos = [];
  let tamanho = 0;
  for await (const pedaco of req) {
    tamanho += pedaco.length;
    if (tamanho > tamanhoMaximo) {
      throw new ErroHttp(413, `Corpo muito grande (máximo ${Math.round(tamanhoMaximo / 1024)} KB)`);
    }
    pedacos.push(pedaco);
  }

  const texto = Buffer.concat(pedacos).toString('utf8').trim();
  if (!texto) {
    throw new ErroHttp(400, 'Corpo da requisição vazio. Envie um objeto JSON, ex.: body: JSON.stringify({ ... })');
  }

  try {
    return JSON.parse(texto);
  } catch (erro) {
    throw new ErroHttp(400, `JSON inválido: ${erro.message}`);
  }
}

// IP real do cliente (o Coolify coloca um proxy na frente da aplicação).
export function ipDoCliente(req) {
  const encaminhado = req.headers['x-forwarded-for'];
  if (encaminhado) return encaminhado.split(',')[0].trim();
  return req.socket.remoteAddress ?? 'desconhecido';
}
