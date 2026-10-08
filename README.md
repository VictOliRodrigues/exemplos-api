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
