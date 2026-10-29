# Classe — Sistema de notas e aprovação de alunos

Aplicação didática em HTML, CSS e JavaScript puro, de dificuldade básica a intermediária. Pratica lógica, operadores, funções, arrays de objetos, laços e manipulação do DOM.

## Como executar

Abra `frontend/index.html` em um navegador moderno. Não precisa instalar dependências. Para desenvolver, também pode usar o Live Server do editor.

## Funcionalidades

- Cadastro, edição e exclusão de alunos com quatro notas de 0 a 10 (uma casa decimal).
- Média aritmética com pesos iguais. Média exata maior ou igual a 7: aprovado; abaixo de 7: reprovado. O arredondamento visual não altera a aprovação.
- Busca por nome sem distinguir acentos ou maiúsculas, filtro por situação e ordenação por nome ou média (classificação de desempenho).
- Total de alunos, média da turma, aprovados, reprovados, maior e menor média e percentual de aprovação. As estatísticas sempre consideram a turma completa, independentemente dos filtros.
- Turma de exemplo adicionada sem substituir os cadastros existentes.
- Exportação dos alunos filtrados para CSV compatível com planilhas.
- Persistência no `localStorage` do navegador, com aviso quando o armazenamento não está disponível. Os dados pertencem ao navegador e à origem usados; não são sincronizados. Em `file://`, a disponibilidade do armazenamento depende do navegador. Exporte o CSV para guardar uma cópia.
- Layout responsivo, campos rotulados, navegação por teclado e avisos acessíveis.

A turma começa vazia. Clique em **Carregar turma de exemplo** para experimentar ou cadastre seus próprios alunos.

## Estrutura

- `frontend/index.html`: estrutura e formulários.
- `frontend/style.css`: apresentação e adaptação para celulares.
- `frontend/logica.js`: validação, médias, situação, estatísticas, filtros e ordenação.
- `frontend/script.js`: eventos, DOM, armazenamento e exportação.
- `tests/logica.test.cjs`: testes das regras de negócio com o executor nativo do Node.js.

## Verificação

Com Node.js 18 ou superior:

```sh
node --test tests/logica.test.cjs
node --check frontend/logica.js
node --check frontend/script.js
```

O sistema funciona inteiramente no navegador. A antiga API de produtos, autenticação, documentação Swagger, PostgreSQL e configuração Docker foram removidas por não fazerem parte deste exercício.
