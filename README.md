# API de Produtos para Alunos

API REST didática em **Node.js puro** (sem framework) + **PostgreSQL**, com página de documentação e um front em HTML/CSS para os alunos escreverem o JavaScript.

```
apis/
├── backend/          → API + documentação (vai para o Coolify)
│   ├── src/          → código do servidor
│   ├── public/       → página de documentação (servida em "/")
│   └── Dockerfile
├── frontend/         → index.html + style.css (entregue aos alunos) + script.js (gabarito, NÃO entregar)
└── docker-compose.yml → só para testar no seu computador
```

## O que a API oferece

- CRUD completo de **produtos** (nome, descrição, preço, estoque, categoria, ativo)
- Métodos `GET`, `POST`, `PUT`, `PATCH`, `DELETE` (+ `OPTIONS` para o CORS)
- Cada aluno usa um código próprio na URL: `/api/{aluno}/produtos`. Um aluno não vê os dados do outro.
- Filtros, busca (`?q=`), ordenação, paginação e `?atraso=ms` para simular rede lenta
- Mensagens de erro em português e didáticas (ex.: *"Deve ser um número (recebido: o texto "19.90"). Dica: converta com Number(valor)"*)
- `POST /api/{aluno}/exemplos` preenche dados de exemplo
- CORS liberado para qualquer origem (funciona com `file://` e Live Server)
- Proteções para API pública: até 200 produtos por aluno, 300 requisições/min por aluno e corpo de até 10 KB

A documentação completa fica na raiz do domínio (`https://seu-dominio/`), com um console "Experimente" para testar sem código.

O botão **Abrir no Swagger** da documentação leva ao Swagger UI (`/swagger`), onde dá para ver e executar todas as rotas. A especificação OpenAPI fica em `/openapi.json`. Ela é gerada automaticamente de `backend/src/recursos.js`, então acompanha qualquer campo novo sem edição manual. O Swagger UI é servido pelo próprio backend (pacote `swagger-ui-dist`, com a telemetria de instalação desligada no `package.json`), sem depender de CDN.

## Parte 2: autenticação com token

Uma segunda etapa para praticar login e headers. O professor cadastra cada aluno na área `/admin`; o aluno faz login e recebe um token, que precisa ir no header `Authorization` de toda requisição protegida.

| Rota | O que faz |
|---|---|
| `POST /auth/login` | Corpo `{ "usuario": "maria", "senha": "1234" }`. Devolve `{ token, tipo, expiraEm, usuario }` |
| `GET /auth/eu` | Mostra de quem é o token e quando expira |
| `POST /auth/logout` | Invalida o token atual |
| `/privado/produtos[/{id}]`, `/privado/exemplos`, `GET /privado` | O mesmo CRUD da parte 1, mas o dono dos dados vem do token |

```js
const resp = await fetch('/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ usuario: 'maria', senha: '1234' }),
});
const { token } = await resp.json();

const produtos = await fetch('/privado/produtos', {
  headers: { Authorization: `Bearer ${token}` },
}).then((r) => r.json());
```

- O token vale `TOKEN_HORAS` (padrão 24 h) **ou até um novo login**: cada usuário tem um único token ativo, e logar de novo invalida o anterior.
- Sem token, com token errado, substituído ou expirado, a API responde `401` com uma mensagem explicando o motivo.
- Senhas são guardadas com `scrypt` + sal, e o token só como hash SHA-256 (tabela `usuarios`, criada automaticamente).
- Os dados de `/privado` são separados dos de `/api/{aluno}`, mesmo que o nome de usuário seja igual ao código de aluno.
- No Swagger, faça login, copie o token e clique em **Authorize**.

### Área do professor (`/admin`)

Abra `https://seu-dominio/admin` e entre com `ADMIN_USUARIO` / `ADMIN_SENHA`. Lá dá para:

- ver todos os alunos (situação, se está logado, último login, quantidade de produtos);
- cadastrar aluno (usuário + senha);
- inativar ou reativar: inativar derruba o token na hora e o login passa a responder `403`;
- trocar a senha de um aluno (também derruba o token atual).

Sem `ADMIN_SENHA` definida, o `/admin` responde `503`. A sessão do admin fica em memória, então reiniciar a API pede login de novo. No `docker-compose.yml` local o login é `admin` / `admin`.

Rotas usadas pela página (todas com `Authorization: Bearer <token do admin>`, exceto o login): `POST /admin/login`, `POST /admin/logout`, `GET /admin/usuarios`, `POST /admin/usuarios` (`{ usuario, senha }`), `PATCH /admin/usuarios/{usuario}` (`{ ativo }` e/ou `{ senha }`).

## Rodar no seu computador

Precisa do Docker:

```bash
docker compose up --build
```

- Documentação: http://localhost:3000
- Swagger: http://localhost:3000/swagger
- API: http://localhost:3000/api/seu-codigo/produtos
- Front com o gabarito: abra `frontend/index.html` no navegador (usa o código de aluno `professor`)

Para parar e apagar o banco local: `docker compose down -v`.

Para desenvolver sem Docker na API (com o PostgreSQL do compose rodando: `docker compose up db`):

```bash
cd backend
cp .env.example .env
npm install
npm run dev
```

## Publicar no Coolify

1. **Suba este projeto para um repositório Git** (GitHub, GitLab etc.).

2. **Crie o banco:** no seu projeto do Coolify, *+ New → Database → PostgreSQL*. Inicie e copie a **Postgres URL (internal)**, algo como
   `postgres://postgres:SENHA@ID-DO-BANCO:5432/postgres`.

3. **Crie a aplicação:** *+ New → Application → (repositório público ou privado)* e escolha o repositório.
   - **Build Pack:** `Dockerfile`
   - **Base Directory:** `/backend`
   - **Ports Exposes:** `3000`
   - **Domains:** `https://api.seudominio.com.br`. O DNS (registro A) precisa apontar para o servidor. O Coolify gera o certificado HTTPS sozinho.
   - **Environment Variables:** `DATABASE_URL` = a URL interna copiada no passo 2
   - **Health Check** (opcional): caminho `/saude`, porta `3000`

4. **Deploy.** As tabelas são criadas automaticamente na primeira inicialização. Confira `https://api.seudominio.com.br/saude`, que deve responder `{"status":"ok"}`.

> O banco e a aplicação precisam estar no mesmo servidor/destino do Coolify para a URL interna funcionar.

### Variáveis de ambiente

| Variável | Padrão | Descrição |
|---|---|---|
| `DATABASE_URL` | — (obrigatória) | URL de conexão do PostgreSQL |
| `PORT` | `3000` | Porta HTTP |
| `LIMITE_REGISTROS` | `200` | Máximo de produtos para cada aluno |
| `LIMITE_REQ_MINUTO` | `300` | Máximo de requisições por minuto por aluno (`0` desativa) |
| `TOKEN_HORAS` | `24` | Validade do token de login da parte 2 (e da sessão do admin), em horas |
| `ADMIN_USUARIO` | `admin` | Usuário da área `/admin` |
| `ADMIN_SENHA` | — | Senha da área `/admin`. Sem ela, o `/admin` fica desligado |

A página de documentação mostra automaticamente os limites configurados.

## O que entregar aos alunos

1. A pasta **`frontend/`** só com `index.html` e `style.css`. **Apague o `script.js` antes**: ele é o gabarito.
2. O endereço da documentação (`https://api.seudominio.com.br`).

O `index.html` já chama um `script.js` que o aluno cria na mesma pasta, como nas aulas. No topo do HTML há um comentário-guia com:
- todos os ids (`campo-nome`, `form-produtos`, `lista-produtos`...), para usar com `getElementById`;
- o HTML de um produto (o `<li>` que o aluno monta para cada item), com as classes `inativo` e `sem-estoque`;
- dicas sobre checkbox, `Number()` e `preventDefault()`.

O gabarito (`frontend/script.js`) usa só o que foi visto até a aula 04 do curso: `getElementById`, `innerHTML` com template string, `onclick`, `addEventListener`, `for...of`, `for...in`, `fetch` com `async`/`await`, `try`/`catch` e `resposta.ok`. Ele aponta para `http://localhost:3000` com o código de aluno `professor`.

## Manutenção

- **Logs:** cada requisição aparece no log da aplicação no Coolify (`GET /api/maria/produtos → 200 (4 ms)`).
- **Apagar os dados de um aluno:** pela própria API (`DELETE /api/{aluno}/produtos`) ou no terminal do banco:
  ```sql
  DELETE FROM produtos WHERE aluno = 'maria-silva';
  ```
- **Zerar tudo (fim do semestre):**
  ```sql
  TRUNCATE produtos RESTART IDENTITY;
  ```
- **Adicionar um campo:** edite `backend/src/recursos.js`. A coluna é criada sozinha no próximo deploy. Atualize também a tabela de campos em `backend/public/index.html` e, se quiser, o formulário em `frontend/index.html`.
