// Definição única dos recursos da API.
// As tabelas do banco, a validação, a rota GET /api e o Swagger (/openapi.json)
// são gerados a partir daqui.
//
// Tipos de campo:
//   texto    → string (com "max" de caracteres)
//   email    → string em formato de e-mail
//   booleano → true / false
//   inteiro  → número inteiro (com "min"/"max" opcionais)
//   decimal  → número com até 2 casas decimais (com "min" opcional)
//   opcao    → um dos valores de "opcoes"
//   data     → string "AAAA-MM-DD"
//
// "obrigatorio: true" → precisa vir no POST e no PUT.
// "padrao"            → valor usado quando o campo não é enviado (null = pode ficar vazio).
// "ajuda"             → explicação do campo, mostrada no Swagger.
// "feminino: true"    → ajusta as mensagens ("Categoria 3 não encontrada").

export const recursos = {
  produtos: {
    singular: 'produto',
    campos: {
      nome: { tipo: 'texto', obrigatorio: true, max: 120, ajuda: 'Nome do produto' },
      descricao: { tipo: 'texto', max: 1000, padrao: '', ajuda: 'Detalhes do produto' },
      preco: { tipo: 'decimal', obrigatorio: true, min: 0, max: 99999999.99, ajuda: 'Preço em reais, com até 2 casas decimais (ex.: 19.9)' },
      estoque: { tipo: 'inteiro', min: 0, max: 1000000, padrao: 0, ajuda: 'Quantidade disponível' },
      categoria: { tipo: 'texto', max: 60, padrao: '', ajuda: 'Categoria livre (ex.: Periféricos)' },
      ativo: { tipo: 'booleano', padrao: true, ajuda: 'Se o produto está à venda' },
    },
    busca: ['nome', 'descricao', 'categoria'],
  },
};

// Campos que existem em todo registro e que o aluno não pode alterar.
export const camposSomenteLeitura = ['id', 'criadoEm', 'atualizadoEm'];

// "Produto 3 não encontrado"
export function naoEncontrado(recurso, id) {
  const nome = recurso.singular[0].toUpperCase() + recurso.singular.slice(1);
  return `${nome} ${id} não encontrad${recurso.feminino ? 'a' : 'o'}`;
}
