// ============================================================
// CONFIGURAÇÃO DO PAINEL DE CONTROLE — ALMOXARIFADO
// Único arquivo que você normalmente precisa editar.
// ============================================================

const CONFIG = {
  // ID da planilha (trecho da URL entre "/d/" e "/edit").
  GOOGLE_SHEET_ID: "1s1MmD9pKrEzlj-tA1iVykveg7f7gqBNK",

  // gid (número no final da URL, depois de "gid=") da aba "TOTAL CONSOLIDADO".
  // Usamos o gid em vez do nome da aba por ser mais confiável.
  SHEET_GID: 338326866,

  // Regra oficial de classificação, escrita na própria planilha:
  // Meses de Estoque = Estoque ÷ Consumo Mensal
  // Crítico: até este limite (meses)
  LIMITE_CRITICO_MESES: 1.5,
  // Atenção: entre o limite crítico e este (meses). Acima disso = Ótimo.
  LIMITE_ATENCAO_MESES: 2.5,

  // Atualização automática dos dados, em minutos. 0 para desativar.
  AUTO_REFRESH_MINUTOS: 5,
};
