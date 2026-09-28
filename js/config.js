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
      // TODO: trocar pelo ID/aba da planilha do estoque Satélite quando você enviar.
      // Por enquanto está apontando pra mesma planilha da Central.
      GOOGLE_SHEET_ID: "1sE6uC5h53jSlCYqM605FsWz2XCbmmQWeLSD5Z1VAJI4",
      SHEET_NAME: "DADOS_SMART",
    },
  ],

  // A partir de quantos dias de autonomia um item deixa de ser
  // "Em Alerta" e passa a ser considerado "OK".
  DIAS_LIMITE_ALERTA: 30,

  // Atualização automática dos dados, em minutos. 0 para desativar.
  AUTO_REFRESH_MINUTOS: 5,
};
