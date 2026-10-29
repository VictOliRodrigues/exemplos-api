# Sistema de notas e aprovação de alunos

Projeto didático de dificuldade básica a intermediária: **Node.js puro + PostgreSQL**, documentação interativa, Swagger, autenticação por token, área do professor e frontend em **HTML, CSS e JavaScript puro**.

O exercício trabalha lógica, operadores, funções, arrays de objetos, laços, DOM e integração com API. A arquitetura original foi mantida e adaptada de produtos para alunos avaliados.

## Executar com Docker

Com o Docker em execução:

```sh
docker compose up --build
```

- Documentação e console de requisições: http://localhost:3000
- Swagger: http://localhost:3000/swagger
- Especificação: http://localhost:3000/openapi.json
- Área do professor: http://localhost:3000/admin (local: `admin` / `admin`)
- Saúde da API e banco: http://localhost:3000/saude
- Frontend: abra `frontend/index.html` no navegador ou use Live Server.

O frontend aponta inicialmente para `http://localhost:3000` e para o código `professor`. O formulário de conexão permite alterar o endereço e o código. Para usar os dados privados, cole um token obtido em `POST /auth/login`; nesse modo as chamadas usam `/privado` com o header `Authorization`. O token fica apenas na memória da página e deve ser informado novamente após recarregar.

**Os alunos e as notas ficam no PostgreSQL**, não no armazenamento local do navegador. O frontend informa falhas da API e não cria uma turma local alternativa.

Para parar mantendo os dados, execute `docker compose down`. O volume `dados` mantém o PostgreSQL entre reinícios.

## Desenvolver sem Docker na API

Com um PostgreSQL disponível:

```sh
cd backend
```

Copie `.env.example` para `.env`, configure `DATABASE_URL` e as credenciais do administrador e execute:

```sh
npm ci
npm run dev
```

Requer Node.js 22 ou superior. No Windows PowerShell com scripts desabilitados, use `npm.cmd`.

## Notas e aprovação

Cada registro contém `nome`, `nota1`, `nota2`, `nota3` e `nota4`. O nome é obrigatório e tem até 100 caracteres. As quatro notas são números obrigatórios entre 0 e 10, armazenados com duas casas decimais.

A API calcula `media = (nota1 + nota2 + nota3 + nota4) / 4` e `situacao`:

- `aprovado`: média exata maior ou igual a 7.
- `reprovado`: média exata menor que 7.

`media`, `situacao`, `id`, `criadoEm` e `atualizadoEm` são somente leitura. Se enviados, são ignorados; não alteram o resultado calculado. A média exibida pode ser arredondada, mas a aprovação sempre usa o valor exato.

Exemplo de entrada:

```json
{ "nome": "Ana Oliveira", "nota1": 7, "nota2": 8, "nota3": 9, "nota4": 6 }
```

A resposta inclui `media: 7.5` e `situacao: "aprovado"`.

## API pública e privada

Cada código de prática tem seu próprio espaço em `/api/{aluno}`. O código identifica quem está praticando; os registros de `/alunos` são os alunos avaliados da sua turma. O código deve ter de 3 a 30 caracteres: letras minúsculas, números, hífen ou sublinhado.

| Método | Caminho após `/api/{aluno}` ou `/privado` | Função |
|---|---|---|
| GET | `/` | Contagem de registros do dono |
| GET | `/alunos` | Lista os alunos |
| POST | `/alunos` | Cadastra um aluno |
| GET | `/alunos/{id}` | Obtém um aluno |
| PUT | `/alunos/{id}` | Substitui nome e quatro notas |
| PATCH | `/alunos/{id}` | Altera somente os campos enviados |
| DELETE | `/alunos/{id}` | Exclui um aluno |
| DELETE | `/alunos` | Exclui a turma do dono |
| GET | `/alunos/estatisticas` | Estatísticas da turma completa |
| POST | `/exemplos` | Adiciona seis alunos de exemplo, respeitando o limite |

POST responde 201; GET, PUT e PATCH respondem 200; DELETE responde 204 sem corpo. Cada chamada de exemplos insere novos registros, sem substituir os existentes.

### Filtros e classificação

```text
/api/professor/alunos?q=ana
/api/professor/alunos?situacao=aprovado
/api/professor/alunos?ordenar=media&ordem=desc
/api/professor/alunos?ordenar=nome&ordem=asc
/api/professor/alunos?nota1=7
/api/professor/alunos?limite=10&pagina=2
```

A busca da API usa parte do nome sem diferenciar maiúsculas. Os campos de entrada aceitam filtros exatos, combináveis. A listagem devolve um array e o header `X-Total-Count` com o total antes da paginação. `?atraso=1500` simula uma rede lenta.

As estatísticas retornam `total`, `aprovados`, `reprovados`, `media`, `maior`, `menor` e `percentual`. Sempre consideram a turma inteira do dono, independentemente dos filtros e da paginação. Turma vazia retorna contagens zero e médias e percentual `null`.

No frontend, busca, filtros e ordenação trabalham sobre o array carregado da API para praticar JavaScript e DOM; a busca local também ignora acentos. Os cartões de estatísticas usam a resposta da API. A exportação CSV considera a lista filtrada.

### Parte 2: autenticação

O professor cadastra usuários em `/admin`. As contas de acesso e os alunos avaliados são entidades diferentes.

| Método | Rota | Função |
|---|---|---|
| POST | `/auth/login` | Recebe `{ "usuario": "maria", "senha": "1234" }` e retorna token |
| GET | `/auth/eu` | Identifica o dono do token |
| POST | `/auth/logout` | Invalida o token |

```js
const resposta = await fetch('http://localhost:3000/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ usuario: 'maria', senha: '1234' }),
});
const dados = await resposta.json();
if (!resposta.ok) throw new Error(dados.erro);
const turma = await fetch('http://localhost:3000/privado/alunos', {
  headers: { Authorization: `Bearer ${dados.token}` },
}).then(r => r.json());
```

Um único token fica ativo por conta: novo login invalida o anterior. Validade padrão de 24 horas. Senhas usam scrypt com sal; tokens são armazenados como hash SHA-256. Contas inativas não conseguem fazer login e perdem o token. Dados de `/privado` ficam separados de `/api/{aluno}`, mesmo com o mesmo nome de usuário.

### Área do professor

`/admin` mantém cadastro de contas, ativação/inativação, troca de senha, último login, sessão e contagem de alunos avaliados por usuário. Sem `ADMIN_SENHA`, a área responde 503. Sessões do administrador ficam em memória.

Rotas: `POST /admin/login`, `POST /admin/logout`, `GET /admin/usuarios`, `POST /admin/usuarios` e `PATCH /admin/usuarios/{usuario}`. Exceto login, exigem token do administrador.

## Publicar no Coolify

1. Crie um PostgreSQL e copie a URL interna.
2. Crie a aplicação a partir do repositório, usando **Dockerfile**, diretório base **`/backend`**, porta **3000**.
3. Configure o domínio, `DATABASE_URL`, `ADMIN_USUARIO` e `ADMIN_SENHA`.
4. Publique e verifique `/saude`. As tabelas `usuarios` e `alunos` são criadas automaticamente; contas existentes são preservadas. Tabelas antigas de produtos não são utilizadas nem apagadas automaticamente.
5. Use o endereço publicado no formulário de conexão do frontend.

O banco e a aplicação devem estar no mesmo destino para usar a URL interna. O frontend continua independente, como no projeto original.

| Variável | Padrão | Descrição |
|---|---|---|
| DATABASE_URL | obrigatória | Conexão PostgreSQL |
| PORT | 3000 | Porta HTTP |
| LIMITE_REGISTROS | 200 | Máximo de alunos avaliados por dono |
| LIMITE_REQ_MINUTO | 300 | Requisições por minuto; 0 desativa |
| TOKEN_HORAS | 24 | Validade dos tokens e sessões do admin |
| ADMIN_USUARIO | admin | Login do professor |
| ADMIN_SENHA | sem padrão | Habilita e protege a área do professor |

CORS permite acesso pelo frontend independente, inclusive Live Server. A API mantém limites de registros, requisições e corpo JSON de 10 KB, mensagens didáticas em português e logs HTTP.

## Estrutura e uso didático

- `backend/src/`: servidor HTTP, PostgreSQL, recursos, CRUD, regras de notas, validação, autenticação, administração e OpenAPI.
- `backend/public/`: documentação com console interativo, Swagger e área do professor.
- `backend/tests/`: testes HTTP com PostgreSQL embutido (PGlite, somente em desenvolvimento).
- `frontend/index.html` e `style.css`: interface responsiva.
- `frontend/logica.js`: regras de médias, classificação, filtros e estatísticas para estudo.
- `frontend/script.js`: gabarito de integração com a API, eventos, DOM e exportação.
- `tests/logica.test.cjs`: testes das funções do frontend.
- `docker-compose.yml`: API e PostgreSQL para execução local.

Para entregar uma atividade sem o gabarito, distribua uma cópia do HTML/CSS e peça a implementação dos arquivos JavaScript referenciados no HTML. Mantenha os arquivos completos neste repositório como referência.

## Testes

```sh
npm ci --prefix backend
npm test --prefix backend
node --test tests/logica.test.cjs
```

Os testes HTTP sobem o servidor em porta livre e executam o SQL de produção em um PostgreSQL embutido e isolado, sem acessar seus dados. Cobrem CRUD, validação, limites de aprovação, filtros, ordenação por média, paginação, estatísticas, isolamento público/privado, administração, tokens, inativação, documentação e CORS. As dependências de teste não entram na imagem de produção (`npm ci --omit=dev`).
