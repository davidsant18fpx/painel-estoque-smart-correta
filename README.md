# Painel de Controle — Almoxarifado

Painel web, somente leitura, que lê os dados diretamente da planilha
do Google Sheets (aba **TOTAL CONSOLIDADO**, que já junta os estoques
Central e Satélite por item) e mostra estoque de cada local, consumo
e status (crítico / atenção / ótimo / sem consumo) — separado por
Central e por Satélite.

Não existe banco de dados próprio. Não existe cadastro de produtos pelo
site. A única fonte de dados é a sua planilha.

```
Sistema remoto da empresa → Google Sheets → Painel Web
```

---

## 1. Estrutura do projeto

```
painel-estoque-smart/
├── index.html          → estrutura da página
├── css/
│   └── style.css        → visual do painel
├── js/
│   ├── config.js         → ⚙️ único arquivo que você normalmente vai editar
│   └── app.js             → lógica (busca, classifica e renderiza os dados)
└── README.md             → este arquivo
```

---

## 2. Como funciona o acesso aos dados (leia antes de publicar)

Este projeto usa a solução mais simples possível: a **API pública de
visualização do Google Sheets** (o mesmo mecanismo usado para incorporar
planilhas em sites). O navegador do usuário faz uma requisição direta a:

```
https://docs.google.com/spreadsheets/d/SEU_ID/gviz/tq?tqx=out:json&gid=SEU_GID
```

Isso só funciona porque a planilha está compartilhada como **"Qualquer
pessoa com o link pode visualizar"**. Não há chave de API, não há
credencial, e por isso não existe nada para "vazar" no código — mas
por isso é importante que você entenda a implicação de segurança:

> ⚠️ **Qualquer pessoa que descobrir o ID da sua planilha (ou o link do
> painel, olhando o código-fonte) consegue ler os mesmos dados**, mesmo
> sem estar logada numa conta Google. É proteção por "link não listado"
> (não aparece em buscas, não é adivinhável), **não é uma senha e não é
> controle de acesso real**.

Você escolheu esse caminho por ser o mais simples de publicar e manter.
Se no futuro quiser controle de acesso de verdade (a planilha volta a
ficar privada, e só usuários autorizados enxergam o painel), o caminho
é adicionar um backend leve (ex: uma função serverless na Vercel) que
acessa a planilha com uma **Service Account do Google** e exige login
para chegar até ele — isso é um projeto à parte, mais complexo, e não
está incluído aqui para não complicar sem necessidade.

**Nunca** coloque senhas, chaves de API do Google ou credenciais de
conta de serviço dentro do JavaScript do navegador (arquivos `.js`
servidos ao público) — qualquer pessoa consegue abrir o "Ver código
fonte" e ler.

---

## 3. Configurar o Google Sheets

1. A planilha usada é a **ESTOQUE_TOTAL_ATUALIZADO**, aba
   **TOTAL CONSOLIDADO** — ela já junta os itens da Central e do
   Satélite numa lista só (as abas brutas "Central" e "Satélite" não
   são usadas diretamente pelo painel).
2. Essa aba tem um título e um texto explicativo nas primeiras linhas
   — o cabeçalho de colunas de verdade não está na linha 1. O painel
   procura essa linha automaticamente (olha as primeiras 15 linhas até
   achar uma que tenha "Código"/"SMART" e "Material"), então não
   precisa configurar o número da linha.
3. As colunas obrigatórias são: `Código`, `Material`, `Qtd. Central`,
   `Qtd. Satélite`, `Consumo Mensal` (é essa que a planilha usa pra
   calcular meses de estoque). `Consumo Diário` é opcional, só exibida
   como informação extra na tabela.
4. Em **Arquivo → Compartilhar → Acesso geral**, deixe como
   **"Qualquer pessoa com o link" → Leitor**.

Se algum desses nomes de coluna mudar no futuro, o painel mostra uma
mensagem de erro dizendo exatamente qual coluna não foi encontrada —
ele nunca inventa dados.

---

## 4. Configurar o painel (`js/config.js`)

Abra `js/config.js`. É o único arquivo que você deve editar no dia a
dia:

```js
const CONFIG = {
  GOOGLE_SHEET_ID: "1s1MmD9pKrEzlj-tA1iVykveg7f7gqBNK",
  SHEET_GID: 338326866,
  LIMITE_CRITICO_MESES: 1.5,
  LIMITE_ATENCAO_MESES: 2.5,
  AUTO_REFRESH_MINUTOS: 5,
};
```

- `GOOGLE_SHEET_ID`: ID da planilha (trecho da URL entre `/d/` e
  `/edit`). Só muda se você trocar de planilha.
- `SHEET_GID`: identificador da aba `TOTAL CONSOLIDADO` — é o número
  que aparece depois de `gid=` na URL quando você está com essa aba
  aberta. Usamos o gid (não o nome da aba) porque é mais estável.
- `LIMITE_CRITICO_MESES` / `LIMITE_ATENCAO_MESES`: os mesmos limites
  que a própria planilha já usa (1,5 e 2,5 meses de estoque). O
  painel calcula `estoque ÷ Consumo Mensal` separadamente para
  Central e para Satélite, usando esses limites.
- `AUTO_REFRESH_MINUTOS`: de quanto em quanto tempo o painel busca os
  dados sozinho. Coloque `0` para desativar (o botão de atualizar
  manual sempre funciona).

---

## 5. Testar localmente

Como o `index.html` faz requisições (`fetch`), não dá para simplesmente
abrir o arquivo clicando duas vezes — o navegador bloqueia isso. É
preciso servir a pasta por um servidor local simples:

**Opção 1 — Python (já vem instalado na maioria dos computadores):**
```bash
cd painel-estoque-smart
python3 -m http.server 8000
```
Depois abra `http://localhost:8000` no navegador.

**Opção 2 — VS Code:** instale a extensão "Live Server" e clique em
"Go Live" com a pasta aberta.

O que testar:
- Os 4 cards mostram números.
- A tabela carrega itens reais (sem produto inventado).
- Busca por SMART e por parte da descrição funciona.
- Cada item mostra Estoque Central, Estoque Satélite e um status para
  cada um.
- Clicar numa linha abre o modal com os detalhes do item.
- Botão "🔄 Atualizar dados" busca a planilha de novo.

---

## 6. Publicar na internet (GitHub + Vercel)

1. **Criar o repositório:**
   - Crie uma conta gratuita em [github.com](https://github.com) (se
     ainda não tiver).
   - Crie um repositório novo, ex: `painel-estoque-smart`.
   - Suba os arquivos desta pasta para o repositório (pelo site do
     GitHub, arrastando os arquivos, ou por `git push` se preferir
     linha de comando).

2. **Publicar com a Vercel:**
   - Crie uma conta gratuita em [vercel.com](https://vercel.com) usando
     login do GitHub.
   - Clique em "Add New… → Project".
   - Selecione o repositório.
   - Como é um site estático (HTML/CSS/JS puro), a Vercel não pede
     nenhuma configuração de build — clique em "Deploy".
   - Em 1-2 minutos você recebe um link público.

(Alternativa equivalente: Netlify — o processo é praticamente igual:
conectar o GitHub e publicar a pasta.)

---

## 7. Atualizar o projeto depois de publicado

Sempre que editar qualquer arquivo (ex: `config.js`):
1. Suba a alteração para o GitHub (commit + push, ou editar o arquivo
   direto pela interface do GitHub).
2. A Vercel detecta o novo commit e republica o site sozinha, em
   segundos — você não precisa fazer nada na Vercel.

---

## 8. Como você atualiza os DADOS depois (rotina do dia a dia)

Isso é o mais importante e é justamente o que **não muda**:

1. Você abre o relatório do sistema remoto da empresa, como sempre.
2. Você atualiza a aba `TOTAL CONSOLIDADO` (ou as abas que a
   alimentam) na planilha do Google Sheets, como sempre.
3. Você abre o painel no navegador (ou clica em
   "🔄 Atualizar dados", ou espera os 5 minutos da atualização
   automática).
4. Pronto — o painel mostra os números novos.

**Você nunca precisa mexer no site, no GitHub ou na Vercel para
atualizar os dados de estoque.** Só mexe nesses três se um dia quiser
mudar a aparência, as regras de classificação, ou trocar de planilha.

---

## 9. Sobre a prévia que você viu no Claude

Se você testou uma prévia publicada dentro do próprio Claude antes de
baixar este projeto: aquela prévia usava uma **amostra fixa de dados**
porque o ambiente de preview do Claude bloqueia, por segurança,
requisições para domínios externos (inclusive o Google Sheets).

**Esse bloqueio existe só dentro do Claude.** Quando você publica estes
arquivos no GitHub + Vercel (ou Netlify), o site passa a rodar no seu
próprio domínio, sem esse tipo de restrição — e aí a busca ao vivo na
planilha funciona normalmente. Você **não precisa pagar por nada**: os
planos gratuitos da Vercel e do Netlify são suficientes para um site
estático como este (veja a seção 6).

## 10. Resumo de decisões tomadas

- Fonte de dados atual: aba `TOTAL CONSOLIDADO` da planilha
  `ESTOQUE_TOTAL_ATUALIZADO` (substitui a planilha/aba `DADOS_SMART`
  usada na primeira versão do projeto).
- Cada item tem estoque em dois locais (Central e Satélite). O painel
  calcula um **status para cada um separadamente**, usando a regra
  oficial da própria planilha (`estoque ÷ Consumo Mensal`, com Crítico
  até 1,5 mês e Atenção até 2,5 meses) — não a regra de 30 dias usada
  na primeira versão, que era baseada num documento de referência
  antigo.
- Um item entra na coluna vermelha se **qualquer um dos dois** locais
  estiver crítico ou em atenção; só entra na coluna verde quando os
  dois estão ótimos (ou sem consumo).
- A coluna `Status` pronta na planilha (calculada em cima do **total**
  Central+Satélite) não é usada diretamente — o painel recalcula por
  local, separadamente, para poder mostrar os dois status.
- Acesso aos dados: link não listado (API pública de visualização do
  Google Sheets), sem backend, conforme sua escolha — ver seção 2 para
  as implicações de segurança.
