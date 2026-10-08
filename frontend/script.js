// ============================================================
// GABARITO — Meus Produtos
// Apague este arquivo antes de entregar a pasta aos alunos.
// ============================================================

// Endereço da API + o código do aluno.
// No Coolify, troque por "https://SEU-DOMINIO/api/professor"
const URL_API = "http://localhost:3000/api/professor";

// O array é a "fonte da verdade": a tela é sempre desenhada a partir dele.
// Começa vazio: quem preenche é o GET na API.
let produtos = [];

// Guarda o id do produto que está sendo editado.
// null = o formulário está cadastrando um produto novo.
let idEmEdicao = null;

// --------------------------------------------------------------------- //
// Funções que só mexem na tela
// --------------------------------------------------------------------- //

// Percorre o array e redesenha a lista inteira na página
function atualizarTela() {
  let html = "";

  for (const produto of produtos) {
    // As classes extras mudam o visual do cartão (veja o style.css)
    let classes = "item cartao";
    let nome = produto.nome;

    if (produto.ativo === false) {
      classes = classes + " inativo";
      nome = nome + " (inativo)";
    }

    if (produto.estoque === 0) {
      classes = classes + " sem-estoque";
    }

    // Os botões chamam as funções passando o id do produto
    html =
      html +
      `<li class="${classes}">
        <div class="item-info">
          <span class="tag">${produto.categoria}</span>
          <h3 class="item-titulo">${nome}</h3>
          <p class="item-descricao">${produto.descricao}</p>
          <p class="item-preco">R$ ${produto.preco.toFixed(2)}</p>
          <p class="item-estoque">Estoque: ${produto.estoque}</p>
        </div>
        <div class="item-acoes">
          <button class="btn btn-pequeno btn-secundario" onclick="editarProduto(${produto.id})">Editar</button>
          <button class="btn btn-pequeno btn-perigo" onclick="excluirProduto(${produto.id})">Excluir</button>
        </div>
      </li>`;
  }

  if (produtos.length === 0) {
    html = `<li class="vazio">Nenhum produto encontrado.</li>`;
  }

  document.getElementById("lista-produtos").innerHTML = html;
  document.getElementById("total-produtos").textContent = produtos.length;
}

// tipo: "sucesso" (verde) ou "erro" (vermelho). A cor vem do style.css.
function mostrarMensagem(texto, tipo) {
  const mensagem = document.getElementById("mensagem");

  mensagem.textContent = texto;
  mensagem.className = "mensagem " + tipo;
}

// Quando dá erro, a API responde assim:
//   { "erro": "Dados inválidos", "detalhes": { "preco": "Campo obrigatório" } }
// O for...in percorre os campos de "detalhes" (se não existir, não faz nada).
function mostrarErroDaApi(dados) {
  let texto = dados.erro;

  for (const campo in dados.detalhes) {
    texto = texto + " | " + campo + ": " + dados.detalhes[campo];
  }

  mostrarMensagem(texto, "erro");
}

// Leva os dados de um produto para os campos do formulário
function preencherFormulario(produto) {
  document.getElementById("campo-nome").value = produto.nome;
  document.getElementById("campo-descricao").value = produto.descricao;
  document.getElementById("campo-preco").value = produto.preco;
  document.getElementById("campo-estoque").value = produto.estoque;
  document.getElementById("campo-categoria").value = produto.categoria;
  document.getElementById("campo-ativo").checked = produto.ativo;

  document.getElementById("titulo-formulario").textContent = "Editando: " + produto.nome;
}

// Volta o formulário para o modo "Novo produto"
function limparFormulario() {
  document.getElementById("campo-nome").value = "";
  document.getElementById("campo-descricao").value = "";
  document.getElementById("campo-preco").value = "";
  document.getElementById("campo-estoque").value = "0";
  document.getElementById("campo-categoria").value = "";
  document.getElementById("campo-ativo").checked = true;

  document.getElementById("titulo-formulario").textContent = "Novo produto";
  idEmEdicao = null;
}

// --------------------------------------------------------------------- //
// Funções de lógica: nenhuma delas mexe na tela
// --------------------------------------------------------------------- //

// Percorre o array e devolve o OBJETO com aquele id, ou null se não achar
function procurarPorId(id) {
  for (const produto of produtos) {
    if (produto.id === id) {
      return produto;
    }
  }

  return null;
}

// Lê os campos do formulário e devolve um OBJETO no formato que a API espera
function lerFormulario() {
  const produto = {
    nome: document.getElementById("campo-nome").value,
    descricao: document.getElementById("campo-descricao").value,
    // O value de um input é sempre texto: Number() converte para número
    preco: Number(document.getElementById("campo-preco").value),
    estoque: Number(document.getElementById("campo-estoque").value),
    categoria: document.getElementById("campo-categoria").value,
    // Checkbox: .checked já é true ou false
    ativo: document.getElementById("campo-ativo").checked,
  };

  return produto;
}

// Monta o endereço do GET com os filtros escolhidos na tela.
// Ex.: http://localhost:3000/api/professor/produtos?ordenar=preco&ordem=desc&ativo=true&q=mouse
function montarEnderecoDaLista() {
  // O value de cada opção do select já é o pedaço da URL (ex.: "ordenar=preco&ordem=desc")
  const ordenacao = document.getElementById("filtro-ordenar").value;
  const ativo = document.getElementById("filtro-ativo").value;
  const busca = document.getElementById("campo-busca").value.trim();

  let endereco = URL_API + "/produtos?" + ordenacao;

  if (ativo !== "") {
    endereco = endereco + "&ativo=" + ativo;
  }

  if (busca !== "") {
    // encodeURIComponent deixa o texto seguro para ir na URL (espaços, &, acentos...)
    endereco = endereco + "&q=" + encodeURIComponent(busca);
  }

  return endereco;
}

// --------------------------------------------------------------------- //
// Funções que falam com a API
// --------------------------------------------------------------------- //

// GET: busca os produtos e redesenha a tela
async function carregarProdutos() {
  try {
    const resposta = await fetch(montarEnderecoDaLista());
    const dados = await resposta.json();

    if (!resposta.ok) {
      mostrarErroDaApi(dados);
      return;
    }

    produtos = dados;
    atualizarTela();
  } catch (erro) {
    mostrarMensagem("Não foi possível falar com a API: " + erro.message, "erro");
  }
}

// POST (produto novo) ou PUT (editando um produto): quem decide é o idEmEdicao
async function salvarProduto(evento) {
  // Sem isso o navegador recarrega a página e perde tudo
  evento.preventDefault();

  const produto = lerFormulario();

  let endereco = URL_API + "/produtos";
  let metodo = "POST";

  if (idEmEdicao !== null) {
    endereco = endereco + "/" + idEmEdicao;
    metodo = "PUT";
  }

  try {
    const resposta = await fetch(endereco, {
      method: metodo,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(produto),
    });
    const dados = await resposta.json();

    if (!resposta.ok) {
      mostrarErroDaApi(dados);
      return;
    }

    if (metodo === "POST") {
      mostrarMensagem(dados.nome + " cadastrado com o id " + dados.id + ".", "sucesso");
    } else {
      mostrarMensagem(dados.nome + " atualizado.", "sucesso");
    }

    limparFormulario();
    await carregarProdutos();
  } catch (erro) {
    mostrarMensagem("Não foi possível falar com a API: " + erro.message, "erro");
  }
}

// DELETE: chamada pelo botão "Excluir" de cada produto
async function excluirProduto(id) {
  const produto = procurarPorId(id);

  // confirm() abre uma janela com OK e Cancelar e devolve true ou false
  if (!confirm("Excluir " + produto.nome + "?")) {
    return;
  }

  try {
    const resposta = await fetch(URL_API + "/produtos/" + id, { method: "DELETE" });

    // O DELETE responde 204, que vem SEM corpo: só chamamos .json() se deu erro
    if (!resposta.ok) {
      mostrarErroDaApi(await resposta.json());
      return;
    }

    if (idEmEdicao === id) {
      limparFormulario();
    }

    mostrarMensagem(produto.nome + " excluído.", "sucesso");
    await carregarProdutos();
  } catch (erro) {
    mostrarMensagem("Não foi possível falar com a API: " + erro.message, "erro");
  }
}

// POST /exemplos: a API cadastra alguns produtos prontos
async function inserirExemplos() {
  try {
    const resposta = await fetch(URL_API + "/exemplos", { method: "POST" });
    const dados = await resposta.json();

    if (!resposta.ok) {
      mostrarErroDaApi(dados);
      return;
    }

    mostrarMensagem(dados.inseridos.produtos + " produtos de exemplo cadastrados.", "sucesso");
    await carregarProdutos();
  } catch (erro) {
    mostrarMensagem("Não foi possível falar com a API: " + erro.message, "erro");
  }
}

// --------------------------------------------------------------------- //
// Funções ligadas aos botões
// --------------------------------------------------------------------- //

// "Editar" não fala com a API: só leva o produto para o formulário.
// Quem salva é o salvarProduto(), com PUT.
function editarProduto(id) {
  const produto = procurarPorId(id);

  idEmEdicao = id;
  preencherFormulario(produto);
  document.getElementById("campo-nome").focus();
}

document.getElementById("form-produtos").addEventListener("submit", salvarProduto);
document.getElementById("botao-cancelar").addEventListener("click", limparFormulario);
document.getElementById("botao-exemplos").addEventListener("click", inserirExemplos);
document.getElementById("botao-recarregar").addEventListener("click", carregarProdutos);

// Filtros: "input" dispara a cada tecla, "change" quando o select muda
document.getElementById("campo-busca").addEventListener("input", carregarProdutos);
document.getElementById("filtro-ativo").addEventListener("change", carregarProdutos);
document.getElementById("filtro-ordenar").addEventListener("change", carregarProdutos);

// Apertar Enter na busca envia o formulário de filtros: impedimos o recarregamento
document.getElementById("form-filtros").addEventListener("submit", function (evento) {
  evento.preventDefault();
});

// Busca os produtos já no carregamento da página
carregarProdutos();
