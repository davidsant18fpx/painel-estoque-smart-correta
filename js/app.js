// ============================================================
// PAINEL DE ESTOQUE SMART — lógica principal
// Não guarda nenhum dado de produto aqui: tudo vem do Google Sheets
// configurado em js/config.js.
// ============================================================

const state = {
  itens: [],
  busca: "",
  autoRefreshTimer: null,
};

const els = {
  loading: document.getElementById("loading"),
  erro: document.getElementById("erro"),
  erroMsg: document.getElementById("erro-msg"),
  conteudo: document.getElementById("conteudo"),
  ultimaAtualizacao: document.getElementById("ultima-atualizacao"),
  btnAtualizar: document.getElementById("btn-atualizar"),
  buscaInput: document.getElementById("busca-input"),
  corpoRisco: document.getElementById("corpo-risco"),
  corpoOk: document.getElementById("corpo-ok"),
  acaoRecomendada: document.getElementById("acao-recomendada"),
  cardCritico: document.getElementById("card-critico-valor"),
  cardAlerta: document.getElementById("card-alerta-valor"),
  cardOk: document.getElementById("card-ok-valor"),
  cardTotal: document.getElementById("card-total-valor"),
  modal: document.getElementById("modal"),
  modalConteudo: document.getElementById("modal-conteudo"),
  modalFechar: document.getElementById("modal-fechar"),
};

// ---------- Normalização de texto (p/ casar nomes de colunas e busca) ----------
function normalizar(txt) {
  return String(txt || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .toUpperCase()
    .trim();
}

function parseNumeroCell(cell) {
  if (!cell) return 0;
  if (typeof cell.v === "number") return cell.v;
  if (cell.v == null) return 0;
  const raw = String(cell.v).replace(/\./g, "").replace(",", ".");
  const n = parseFloat(raw);
  return isNaN(n) ? 0 : n;
}

function parseTextoCell(cell) {
  if (!cell || cell.v == null) return "";
  return String(cell.v).trim();
}

// ---------- Busca os dados no Google Sheets (Google Visualization API) ----------
async function buscarDadosPlanilha() {
  const url =
    `https://docs.google.com/spreadsheets/d/${CONFIG.GOOGLE_SHEET_ID}/gviz/tq` +
    `?tqx=out:json&sheet=${encodeURIComponent(CONFIG.SHEET_NAME)}`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(
      `Não foi possível acessar a planilha (HTTP ${res.status}). ` +
      `Verifique se ela ainda está compartilhada como "Qualquer pessoa com o link pode visualizar".`
    );
  }

  const texto = await res.text();
  const inicio = texto.indexOf("{");
  const fim = texto.lastIndexOf("}");
  if (inicio === -1 || fim === -1) {
    throw new Error("A resposta da planilha veio em um formato inesperado.");
  }

  let json;
  try {
    json = JSON.parse(texto.substring(inicio, fim + 1));
  } catch (e) {
    throw new Error("Não foi possível interpretar os dados retornados pela planilha.");
  }

  if (!json.table || !json.table.cols || !json.table.rows) {
    throw new Error(`A aba "${CONFIG.SHEET_NAME}" não retornou nenhuma tabela de dados.`);
  }

  return json.table;
}

// ---------- Mapeia as colunas pelo nome do cabeçalho ----------
function mapearColunas(cols) {
  const idx = { smart: -1, material: -1, estoque: -1, consumoMedio: -1, consumoDiario: -1 };

  cols.forEach((col, i) => {
    const label = normalizar(col.label);
    if (label === "SMART") idx.smart = i;
    else if (label.startsWith("MATERIAL")) idx.material = i;
    else if (label.includes("ESTOQUE")) idx.estoque = i;
    else if (label.includes("CONSUMO") && label.includes("MEDIO")) idx.consumoMedio = i;
    // OBS: a coluna da planilha se chama "CONSUMO MENSAL", mas os valores nela
    // já são usados como consumo DIÁRIO na aba PAINEL PRINCIPAL (conferido: os
    // números batem 1 a 1 com a coluna "Consumo Diário" de lá, sem divisão).
    // Por isso mapeamos ela direto para consumoDiario, sem dividir por 30.
    else if (label.includes("CONSUMO") && (label.includes("MENSAL") || label.includes("DIARIO") || label.includes("DIA"))) idx.consumoDiario = i;
  });

  const faltando = Object.entries(idx)
    .filter(([campo, i]) => i === -1 && campo !== "consumoMedio")
    .map(([campo]) => campo);

  if (faltando.length > 0) {
    throw new Error(
      `Não encontrei na aba "${CONFIG.SHEET_NAME}" as colunas: ${faltando.join(", ")}. ` +
      `Confira se os nomes das colunas na planilha continuam sendo SMART, MATERIAL, QTD ESTOQUE e CONSUMO MENSAL (usada como consumo diário).`
    );
  }

  return idx;
}

// ---------- Classifica um item segundo as regras do painel ----------
function classificar(estoque, consumoDiario) {
  if (estoque === 0 && consumoDiario > 0) return { status: "CRITICO", label: "ZERADO" };
  if (consumoDiario === 0) return { status: "SEM_CONSUMO", label: "SEM CONSUMO" };
  const autonomia = estoque / consumoDiario;
  if (autonomia < CONFIG.DIAS_LIMITE_ALERTA) return { status: "ALERTA", label: Math.round(autonomia) + "d" };
  return { status: "OK", label: "OK" };
}

// ---------- Transforma as linhas cruas da planilha em itens do painel ----------
function processarLinhas(table) {
  const idx = mapearColunas(table.cols);
  const itens = [];
  for (const row of table.rows) {
    const cells = row.c || [];
    const smart = parseTextoCell(cells[idx.smart]);
    const material = parseTextoCell(cells[idx.material]);
    if (!smart && !material) continue;

    const estoque = parseNumeroCell(cells[idx.estoque]);
    const consumoMedio = idx.consumoMedio > -1 ? parseNumeroCell(cells[idx.consumoMedio]) : null;
    const consumoDiario = parseNumeroCell(cells[idx.consumoDiario]);

    const { status, label } = classificar(estoque, consumoDiario);
    const autonomia = consumoDiario > 0 ? Math.round(estoque / consumoDiario) : null;

    itens.push({ smart, material, estoque, consumoMedio, consumoDiario, autonomia, status, statusLabel: label });
  }
  return itens;
}

// ---------- Carregamento principal ----------
async function carregarPainel() {
  mostrarCarregando(true);
  esconderErro();
  try {
    const table = await buscarDadosPlanilha();
    state.itens = processarLinhas(table);
    render();
    marcarUltimaAtualizacao();
    els.conteudo.classList.remove("escondido");
  } catch (err) {
    console.error(err);
    mostrarErro(err.message || "Erro desconhecido ao carregar os dados.");
  } finally {
    mostrarCarregando(false);
  }
}

function mostrarCarregando(ligado) {
  els.loading.classList.toggle("escondido", !ligado);
  els.btnAtualizar.disabled = ligado;
  els.btnAtualizar.textContent = ligado ? "🔄 Atualizando..." : "🔄 Atualizar dados";
}

function mostrarErro(msg) {
  els.erroMsg.textContent = msg;
  els.erro.classList.remove("escondido");
  els.conteudo.classList.add("escondido");
}

function esconderErro() {
  els.erro.classList.add("escondido");
}

function marcarUltimaAtualizacao() {
  const agora = new Date();
  const dd = String(agora.getDate()).padStart(2, "0");
  const mm = String(agora.getMonth() + 1).padStart(2, "0");
  const yyyy = agora.getFullYear();
  const hh = String(agora.getHours()).padStart(2, "0");
  const min = String(agora.getMinutes()).padStart(2, "0");
  els.ultimaAtualizacao.textContent = `Última atualização: ${dd}/${mm}/${yyyy} ${hh}:${min}`;
}

function badgeClasse(status) {
  return { CRITICO: "badge badge-critico", ALERTA: "badge badge-alerta", OK: "badge badge-ok", SEM_CONSUMO: "badge badge-sem-consumo" }[status];
}

function linhaHtml(item) {
  return `<tr data-smart="${escapeHtml(item.smart)}">
    <td class="col-smart">${escapeHtml(item.smart)}</td>
    <td>${escapeHtml(item.material)}</td>
    <td class="col-num">${item.estoque.toLocaleString("pt-BR")}</td>
    <td class="col-num">${item.consumoDiario.toLocaleString("pt-BR")}</td>
    <td><span class="${badgeClasse(item.status)}">${escapeHtml(item.statusLabel)}</span></td>
  </tr>`;
}

function escapeHtml(txt) {
  const div = document.createElement("div");
  div.textContent = txt;
  return div.innerHTML;
}

// ---------- Filtra por busca, monta as duas colunas e os cards ----------
function render() {
  const termo = normalizar(state.busca);
  const filtrados = state.itens.filter(
    (i) => !termo || normalizar(i.smart).includes(termo) || normalizar(i.material).includes(termo)
  );

  const risco = filtrados
    .filter((i) => i.status === "CRITICO" || i.status === "ALERTA")
    .sort((a, b) => (a.status === "CRITICO" ? 0 : 1) - (b.status === "CRITICO" ? 0 : 1) || (a.autonomia ?? 0) - (b.autonomia ?? 0));
  const ok = filtrados.filter((i) => i.status === "OK" || i.status === "SEM_CONSUMO");

  els.corpoRisco.innerHTML = risco.map(linhaHtml).join("") ||
    `<tr><td colspan="5" class="tabela-vazia">Nenhum item encontrado.</td></tr>`;
  els.corpoOk.innerHTML = ok.map(linhaHtml).join("") ||
    `<tr><td colspan="5" class="tabela-vazia">Nenhum item encontrado.</td></tr>`;

  els.cardCritico.textContent = state.itens.filter((i) => i.status === "CRITICO").length;
  els.cardAlerta.textContent = state.itens.filter((i) => i.status === "ALERTA").length;
  els.cardOk.textContent = state.itens.filter((i) => i.status === "OK").length;
  els.cardTotal.textContent = state.itens.length;

  const criticosPorConsumo = state.itens
    .filter((i) => i.status === "CRITICO")
    .sort((a, b) => b.consumoDiario - a.consumoDiario)
    .slice(0, 3);
  els.acaoRecomendada.innerHTML = criticosPorConsumo.length
    ? `⚠️ <b>Ação recomendada:</b> cobrar entregas pendentes para os itens zerados de maior giro (códigos ${criticosPorConsumo
        .map((i) => escapeHtml(i.smart))
        .join(", ")}).`
    : `Nenhum item crítico no momento.`;

  document.querySelectorAll("#corpo-risco tr[data-smart], #corpo-ok tr[data-smart]").forEach((tr) => {
    tr.addEventListener("click", () => {
      const item = state.itens.find((i) => i.smart === tr.dataset.smart);
      if (item) abrirModal(item);
    });
  });
}

// ---------- Modal de detalhes ----------
function abrirModal(item) {
  els.modalConteudo.innerHTML = `
    <h3>${escapeHtml(item.material)}</h3>
    <dl class="modal-lista">
      <dt>SMART</dt><dd>${escapeHtml(item.smart)}</dd>
      <dt>Descrição</dt><dd>${escapeHtml(item.material)}</dd>
      <dt>Estoque atual</dt><dd>${item.estoque.toLocaleString("pt-BR")}</dd>
      <dt>Consumo médio</dt><dd>${item.consumoMedio === null ? "—" : item.consumoMedio.toLocaleString("pt-BR")}</dd>
      <dt>Consumo diário</dt><dd>${item.consumoDiario.toLocaleString("pt-BR")}</dd>
      <dt>Autonomia</dt><dd>${item.autonomia === null ? "Sem consumo" : item.autonomia + " dias"}</dd>
      <dt>Status</dt><dd><span class="${badgeClasse(item.status)}">${escapeHtml(item.statusLabel)}</span></dd>
    </dl>`;
  els.modal.classList.remove("escondido");
}

function fecharModal() {
  els.modal.classList.add("escondido");
}

// ---------- Eventos ----------
els.btnAtualizar.addEventListener("click", carregarPainel);
els.buscaInput.addEventListener("input", (e) => {
  state.busca = e.target.value;
  render();
});
els.modalFechar.addEventListener("click", fecharModal);
els.modal.addEventListener("click", (e) => { if (e.target === els.modal) fecharModal(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") fecharModal(); });

// ---------- Atualização automática ----------
function configurarAutoRefresh() {
  if (state.autoRefreshTimer) clearInterval(state.autoRefreshTimer);
  if (CONFIG.AUTO_REFRESH_MINUTOS > 0) {
    state.autoRefreshTimer = setInterval(carregarPainel, CONFIG.AUTO_REFRESH_MINUTOS * 60 * 1000);
  }
}

// ---------- Início ----------
carregarPainel();
configurarAutoRefresh();
