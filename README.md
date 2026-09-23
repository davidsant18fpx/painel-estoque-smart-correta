# Painel de Estoque SMART

Painel web, somente leitura, que lê os dados diretamente da sua planilha
do Google Sheets (aba `DADOS_SMART`) e mostra estoque, consumo diário,
autonomia e status (crítico / alerta / ok / sem consumo).

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
https://docs.google.com/spreadsheets/d/SEU_ID/gviz/tq?tqx=out:json&sheet=DADOS_SMART
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

1. Abra sua planilha **Painel de Estoque e Controle SMART**.
2. Confirme que a aba com os dados brutos se chama exatamente
   `DADOS_SMART` (sem espaços extras).
3. Confirme os nomes das colunas na primeira linha da aba: `SMART`,
   `MATERIAL`, `QTD ESTOQUE`, `CONSUMO DIARIO` (essas 4 são
   obrigatórias; `CONSUMO MEDIO` é opcional, usada só no detalhe do
   item).
4. Em **Arquivo → Compartilhar → Acesso geral**, deixe como
   **"Qualquer pessoa com o link" → Leitor**. (Ela já está assim hoje.)

Se algum desses nomes de coluna mudar no futuro, o painel mostra uma
mensagem de erro dizendo exatamente qual coluna não foi encontrada —
ele nunca inventa dados.

---

## 4. Configurar o painel (`js/config.js`)

Abra `js/config.js`. É o único arquivo que você deve editar no dia a
dia:

```js
const CONFIG = {
  GOOGLE_SHEET_ID: "1sE6uC5h53jSlCYqM605FsWz2XCbmmQWeLSD5Z1VAJI4",
  SHEET_NAME: "DADOS_SMART",
  DIAS_LIMITE_ALERTA: 30,
  AUTO_REFRESH_MINUTOS: 5,
};
```

- `GOOGLE_SHEET_ID`: já está preenchido com o ID da sua planilha atual
  (o trecho da URL entre `/d/` e `/edit`). Só muda se você trocar de
  planilha.
- `SHEET_NAME`: nome da aba de origem dos dados.
- `DIAS_LIMITE_ALERTA`: hoje é 30 dias, como você pediu. Pode ajustar.
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
- Filtro por status funciona.
- Clicar no cabeçalho de uma coluna ordena a tabela.
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
   - Selecione o repositório `painel-estoque-smart`.
   - Como é um site estático (HTML/CSS/JS puro), a Vercel não pede
     nenhuma configuração de build — clique em "Deploy".
   - Em 1-2 minutos você recebe um link público, ex:
     `https://painel-estoque-smart.vercel.app`.

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
2. Você atualiza a aba `DADOS_SMART` na planilha do Google Sheets,
   como sempre.
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

- Fonte de dados: aba `DADOS_SMART` (a aba `PAINEL PRINCIPAL` não é
  usada, conforme pedido).
- Colunas `Status`/`Qtd` que já existem na planilha **não** são usadas
  para classificar os itens, porque estão incompletas e, em alguns
  casos, inconsistentes com a regra de "sem consumo" que você definiu.
  O painel recalcula o status sempre a partir de `QTD ESTOQUE` e
  `CONSUMO DIARIO`.
- Acesso aos dados: link não listado (API pública de visualização do
  Google Sheets), sem backend, conforme sua escolha — ver seção 2 para
  as implicações de segurança.
