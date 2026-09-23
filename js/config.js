// ============================================================
// CONFIGURAÇÃO DO PAINEL DE ESTOQUE SMART
// Este é o ÚNICO arquivo que você deve editar se precisar trocar
// de planilha, de aba, ou ajustar os parâmetros do painel.
// ============================================================

const CONFIG = {
  // ID da planilha do Google Sheets.
  // É o trecho da URL entre "/d/" e "/edit".
  // Ex: https://docs.google.com/spreadsheets/d/ESTE_TRECHO_AQUI/edit
  GOOGLE_SHEET_ID: "1sE6uC5h53jSlCYqM605FsWz2XCbmmQWeLSD5Z1VAJI4",

  // Nome exato da aba (como aparece na parte de baixo do Google Sheets)
  // que contém os dados brutos de estoque.
  SHEET_NAME: "DADOS_SMART",

  // A partir de quantos dias de autonomia um item deixa de ser
  // "Em Alerta" e passa a ser considerado "OK".
  DIAS_LIMITE_ALERTA: 30,

  // Atualização automática dos dados, em minutos.
  // Coloque 0 para desativar a atualização automática
  // (o usuário ainda pode clicar em "Atualizar dados" manualmente).
  AUTO_REFRESH_MINUTOS: 5,
};
