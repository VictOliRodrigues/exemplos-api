import { ErroHttp } from './http.js';
import { camposSomenteLeitura } from './recursos.js';

const regexEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const regexData = /^\d{4}-\d{2}-\d{2}$/;

function descreverRecebido(valor) {
  if (valor === null) return 'null';
  if (Array.isArray(valor)) return 'um array';
  if (typeof valor === 'string') return `o texto ${JSON.stringify(valor)}`;
  if (typeof valor === 'object') return 'um objeto';
  return `${typeof valor} ${String(valor)}`;
}

function dataValida(texto) {
  if (!regexData.test(texto)) return false;
  const [ano, mes, dia] = texto.split('-').map(Number);
  const data = new Date(Date.UTC(ano, mes - 1, dia));
  return data.getUTCFullYear() === ano && data.getUTCMonth() === mes - 1 && data.getUTCDate() === dia;
}

// Valida um único valor. Retorna { valor } ou { erro }.
function validarValor(campo, valor) {
  const anulavel = !campo.obrigatorio && campo.padrao === null;

  if (valor === null) {
    return anulavel ? { valor: null } : { erro: 'Não pode ser null' };
  }

  switch (campo.tipo) {
    case 'texto':
    case 'email': {
      if (typeof valor !== 'string') return { erro: `Deve ser um texto (recebido: ${descreverRecebido(valor)})` };
      const texto = valor.trim();
      if (campo.obrigatorio && !texto) return { erro: 'Não pode ser vazio' };
      if (texto.length > campo.max) return { erro: `Máximo de ${campo.max} caracteres` };
      if (campo.tipo === 'email' && !regexEmail.test(texto)) return { erro: 'E-mail inválido (ex.: nome@exemplo.com)' };
      return { valor: texto };
    }

    case 'booleano':
      if (typeof valor !== 'boolean') {
        return { erro: `Deve ser true ou false, sem aspas (recebido: ${descreverRecebido(valor)})` };
      }
      return { valor };

    case 'inteiro':
    case 'decimal': {
      if (typeof valor !== 'number' || !Number.isFinite(valor)) {
        const dica = typeof valor === 'string' ? '. Dica: converta com Number(valor)' : '';
        return { erro: `Deve ser um número (recebido: ${descreverRecebido(valor)})${dica}` };
      }
      if (campo.tipo === 'inteiro' && !Number.isInteger(valor)) return { erro: 'Deve ser um número inteiro' };
      if (campo.min !== undefined && valor < campo.min) return { erro: `Deve ser maior ou igual a ${campo.min}` };
      if (campo.max !== undefined && valor > campo.max) return { erro: `Deve ser menor ou igual a ${campo.max}` };
      return { valor: campo.tipo === 'decimal' ? Math.round(valor * 100) / 100 : valor };
    }

    case 'opcao':
      if (!campo.opcoes.includes(valor)) {
        return { erro: `Deve ser um destes valores: ${campo.opcoes.join(', ')} (recebido: ${descreverRecebido(valor)})` };
      }
      return { valor };

    case 'data':
      if (typeof valor !== 'string' || !dataValida(valor)) {
        return { erro: `Deve ser uma data no formato AAAA-MM-DD${anulavel ? ' ou null' : ''} (recebido: ${descreverRecebido(valor)})` };
      }
      return { valor };

    default:
      throw new Error(`Tipo de campo desconhecido: ${campo.tipo}`);
  }
}

// Valida o corpo de POST/PUT (parcial = false) ou PATCH (parcial = true).
// Retorna um objeto só com os campos do recurso, já convertidos.
export function validarCorpo(recurso, corpo, { parcial }) {
  if (corpo === null || typeof corpo !== 'object' || Array.isArray(corpo)) {
    throw new ErroHttp(400, 'O corpo deve ser um objeto JSON, ex.: { "campo": "valor" }');
  }

  const nomesCampos = Object.keys(recurso.campos);
  const erros = {};
  const dados = {};

  for (const chave of Object.keys(corpo)) {
    if (!recurso.campos[chave] && !camposSomenteLeitura.includes(chave)) {
      erros[chave] = `Campo desconhecido. Campos aceitos: ${nomesCampos.join(', ')}`;
    }
  }

  for (const [nome, campo] of Object.entries(recurso.campos)) {
    if (!Object.hasOwn(corpo, nome) || corpo[nome] === undefined) {
      if (parcial) continue;
      if (campo.obrigatorio) erros[nome] = 'Campo obrigatório';
      else dados[nome] = campo.padrao;
      continue;
    }
    const resultado = validarValor(campo, corpo[nome]);
    if (resultado.erro) erros[nome] = resultado.erro;
    else dados[nome] = resultado.valor;
  }

  if (Object.keys(erros).length > 0) {
    throw new ErroHttp(400, 'Dados inválidos', { detalhes: erros });
  }
  if (parcial && Object.keys(dados).length === 0) {
    throw new ErroHttp(400, `Envie pelo menos um campo para atualizar. Campos aceitos: ${nomesCampos.join(', ')}`);
  }
  return dados;
}

// Converte o valor de um filtro da URL (?concluida=true, ?estoque=0) para o tipo do campo.
export function converterFiltro(nome, campo, texto) {
  let valor;
  switch (campo.tipo) {
    case 'booleano':
      if (texto !== 'true' && texto !== 'false') {
        throw new ErroHttp(400, `Filtro "${nome}" deve ser true ou false`);
      }
      return texto === 'true';
    case 'inteiro':
    case 'decimal':
      valor = Number(texto);
      if (texto.trim() === '' || !Number.isFinite(valor)) {
        throw new ErroHttp(400, `Filtro "${nome}" deve ser um número`);
      }
      return valor;
    case 'data':
      if (!dataValida(texto)) throw new ErroHttp(400, `Filtro "${nome}" deve ser uma data AAAA-MM-DD`);
      return texto;
    default:
      return texto;
  }
}
