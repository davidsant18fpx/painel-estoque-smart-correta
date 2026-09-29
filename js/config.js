// ============================================================
// CONFIGURAÇÃO DO PAINEL DE ESTOQUE — ALMOXARIFADO
// Este é o ÚNICO arquivo que você deve editar se precisar trocar
// de planilha, de aba, ou ajustar os parâmetros do painel.
// ============================================================

const CONFIG = {
  // Cada item aqui vira uma aba clicável no topo do painel (Central / Satélite).
  // "id" precisa ser único. "nome" é o que aparece no botão.
  // GOOGLE_SHEET_ID e SHEET_NAME funcionam igual ao painel original:
  // o ID vem da URL da planilha (entre "/d/" e "/edit"), e SHEET_NAME
  // é o nome exato da aba com os dados brutos.
  ABAS: [
    {
      id: "central",
      nome: "Central",
      GOOGLE_SHEET_ID: "1sE6uC5h53jSlCYqM605FsWz2XCbmmQWeLSD5Z1VAJI4",
      SHEET_NAME: "DADOS_SMART",
    },
    {
      id: "satelite",
      nome: "Satélite",
      // Planilha do Satélite. A aba é identificada pelo GID (o número que
      // aparece depois de "gid=" na URL da planilha), em vez do nome.
      // Se preferir usar o nome da aba, apague o GID e preencha SHEET_NAME.
      GOOGLE_SHEET_ID: "1s1MmD9pKrEzlj-tA1iVykveg7f7gqBNK",
      GID: "338326866",
    },
  ],

  // A partir de quantos dias de autonomia um item deixa de ser
  // "Em Alerta" e passa a ser considerado "OK".
  DIAS_LIMITE_ALERTA: 30,

  // Atualização automática dos dados, em minutos. 0 para desativar.
  AUTO_REFRESH_MINUTOS: 5,
};
