// ============================================================
// CONFIGURAÇÃO DO PAINEL DE ESTOQUE — ALMOXARIFADO
// Este é o ÚNICO arquivo que você deve editar se precisar trocar
// de planilha, de aba, ou ajustar os parâmetros do painel.
// ============================================================

const CONFIG = {
  // Fonte única de dados: aba "TOTAL CONSOLIDADO", que já traz Central e
  // Satélite, o total, os meses de estoque e o status calculados.
  // O ID vem da URL da planilha (entre "/d/" e "/edit") e o GID é o número
  // depois de "gid=" na URL, com a aba aberta. Se preferir usar o nome da
  // aba, apague o GID (o SHEET_NAME é usado no lugar).
  FONTE: {
    GOOGLE_SHEET_ID: "1s1MmD9pKrEzlj-tA1iVykveg7f7gqBNK",
    GID: "338326866",
    SHEET_NAME: "TOTAL CONSOLIDADO",
  },

  // Botões de filtro no topo. "nome" precisa bater com o valor da coluna
  // "Aba" da planilha (sem diferenciar maiúsculas e acentos).
  LOCAIS: [
    { id: "central", nome: "Central" },
    { id: "satelite", nome: "Satélite" },
  ],

  // Só usados quando a coluna Status da planilha vier vazia para um item
  // que tem consumo (mesma regra descrita na planilha, em meses de estoque):
  // até MESES_CRITICO = crítico; até MESES_ATENCAO = atenção; acima = ótimo.
  MESES_CRITICO: 1.5,
  MESES_ATENCAO: 2.5,

  // Atualização automática dos dados, em minutos. 0 para desativar.
  AUTO_REFRESH_MINUTOS: 5,
};
