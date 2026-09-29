// ============================================================
// PAINEL DE ESTOQUE SMART — lógica principal
// Não guarda nenhum dado de produto aqui: tudo vem do Google Sheets
// configurado em js/config.js.
// ============================================================

const state = {
  itens: [],
  busca: "",
  abaAtiva: "todos",
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
  abasBotoes: document.querySelectorAll(".aba-btn"),
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

function parseNumeroOuNull(cell) {
  if (!cell || cell.v == null || cell.v === "") return null;
  if (typeof cell.v === "number") return cell.v;
  const raw = String(cell.v).replace(/\./g, "").replace(",", ".");
  const n = parseFloat(raw);
  return isNaN(n) ? null : n;
}

function parseNumeroCell(cell) {
  const n = parseNumeroOuNull(cell);
  return n === null ? 0 : n;
}

function parseTextoCell(cell) {
  if (!cell || cell.v == null) return "";
  return String(cell.v).trim();
}

// ---------- Busca os dados no Google Sheets (Google Visualization API) ----------
async function buscarDadosPlanilha() {
  const f = CONFIG.FONTE;
  const alvo = f.GID
    ? `gid=${encodeURIComponent(f.GID)}`
    : `sheet=${encodeURIComponent(f.SHEET_NAME)}`;
  const url =
    `https://docs.google.com/spreadsheets/d/${f.GOOGLE_SHEET_ID}/gviz/tq` +
    `?tqx=out:json&${alvo}`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(
      `Não foi possível acessar a planilha (HTTP ${res.status}). ` +
      `Verifique se ela está compartilhada como "Qualquer pessoa com o link pode visualizar" ` +
      `e se é um Google Sheets de verdade (arquivo .xlsx enviado ao Drive não funciona: use Arquivo → Salvar como Google Sheets).`
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

  if (json.status === "error") {
    const det = json.errors && json.errors[0] ? (json.errors[0].detailed_message || json.errors[0].message) : "";
    throw new Error(`O Google Sheets recusou a leitura da aba. ${det}`.trim());
  }
  if (!json.table || !json.table.cols || !json.table.rows) {
    throw new Error("A aba não retornou nenhuma tabela de dados.");
  }

  return json.table;
}

// ---------- Localiza a linha de cabeçalho (a aba tem título e aviso acima) ----------
// O Google às vezes trata a linha de cabeçalho como rótulos das colunas e às
// vezes como uma linha de dados; aqui funcionam os dois casos.
function localizarCabecalho(table) {
  const candidatos = [{ cells: table.cols.map((c) => ({ v: c.label })), inicio: 0 }];
  table.rows.slice(0, 15).forEach((r, i) => candidatos.push({ cells: r.c || [], inicio: i + 1 }));

  for (const cand of candidatos) {
    const nomes = cand.cells.map((c) => normalizar(c && c.v != null ? c.v : ""));
    if (nomes.includes("MATERIAL") && (nomes.includes("CODIGO") || nomes.includes("SMART"))) {
      return { nomes, inicio: cand.inicio };
    }
  }
  throw new Error(
    "Não encontrei a linha de cabeçalho (com as colunas Código e Material) nas primeiras linhas da aba. " +
    "Confira se o GID em config.js é o da aba TOTAL CONSOLIDADO."
  );
}

// ---------- Mapeia as colunas pelo nome do cabeçalho ----------
function mapearColunas(nomes) {
  const acha = (fn) => nomes.findIndex(fn);
  const idx = {
    aba: acha((n) => n === "ABA"),
    codigo: acha((n) => n === "CODIGO" || n === "SMART"),
    material: acha((n) => n.startsWith("MATERIAL")),
    qtdCentral: acha((n) => n.includes("CENTRAL")),
    qtdSatelite: acha((n) => n.includes("SATELITE")),
    total: acha((n) => n.startsWith("TOTAL")),
    diario: acha((n) => n.includes("CONSUMO") && n.includes("DIARIO")),
    mensal: acha((n) => n.includes("CONSUMO") && n.includes("MENSAL")),
    meses: acha((n) => n.includes("MESES")),
    status: acha((n) => n === "STATUS"),
  };

  const obrigatorias = ["aba", "codigo", "material", "total", "diario"];
  const faltando = obrigatorias.filter((c) => idx[c] === -1);
  if (faltando.length > 0) {
    throw new Error(
      `Não encontrei na planilha as colunas: ${faltando.join(", ")}. ` +
      `Confira se os cabeçalhos continuam sendo Aba, Código, Material, Total Estoque e Consumo Diário.`
    );
  }
  return idx;
}

function formatarMeses(m) {
  return m.toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " m";
}

// ---------- Define o status do item ----------
// Usa o Status calculado na própria planilha. Só recalcula se ele vier vazio.
function classificar(statusTxt, total, consumoDiario, consumoMensal, meses) {
  if (total === 0 && consumoDiario > 0) return { status: "CRITICO", label: "ZERADO" };

  const s = normalizar(statusTxt);
  if (s.includes("CRIT")) return { status: "CRITICO", label: meses != null ? formatarMeses(meses) : "CRÍTICO" };
  if (s.includes("ATEN") || s.includes("ALERT")) return { status: "ALERTA", label: meses != null ? formatarMeses(meses) : "ATENÇÃO" };
  if (s.includes("OTIMO") || s === "OK") return { status: "OK", label: "OK" };

  // Status vazio na planilha: calcula pela mesma regra (meses de estoque).
  let m = meses;
  if (m == null && consumoMensal > 0) m = total / consumoMensal;
  if (m == null && consumoDiario > 0) m = total / (consumoDiario * 30);
  if (m == null) return { status: "SEM_CONSUMO", label: "SEM CONSUMO" };
  if (m <= CONFIG.MESES_CRITICO) return { status: "CRITICO", label: formatarMeses(m) };
  if (m <= CONFIG.MESES_ATENCAO) return { status: "ALERTA", label: formatarMeses(m) };
  return { status: "OK", label: "OK" };
}

// ---------- Transforma as linhas cruas da planilha em itens do painel ----------
function processarLinhas(table) {
  const cab = localizarCabecalho(table);
  const idx = mapearColunas(cab.nomes);
  const itens = [];

  for (const row of table.rows.slice(cab.inicio)) {
    const cells = row.c || [];
    const smart = parseTextoCell(cells[idx.codigo]);
    const material = parseTextoCell(cells[idx.material]);
    if (!smart && !material) continue; // linhas de fórmula em branco

    const local = parseTextoCell(cells[idx.aba]) || "—";
    const total = parseNumeroCell(cells[idx.total]);
    const consumoDiario = parseNumeroCell(cells[idx.diario]);
    const consumoMensal = idx.mensal > -1 ? parseNumeroCell(cells[idx.mensal]) : 0;
    const meses = idx.meses > -1 ? parseNumeroOuNull(cells[idx.meses]) : null;
    const qtdCentral = idx.qtdCentral > -1 ? parseNumeroCell(cells[idx.qtdCentral]) : null;
    const qtdSatelite = idx.qtdSatelite > -1 ? parseNumeroCell(cells[idx.qtdSatelite]) : null;
    const statusTxt = idx.status > -1 ? parseTextoCell(cells[idx.status]) : "";

    const { status, label } = classificar(statusTxt, total, consumoDiario, consumoMensal, meses);

    itens.push({
      local, smart, material,
      estoque: total, qtdCentral, qtdSatelite,
      consumoDiario, consumoMensal, meses,
      status, statusLabel: label,
    });
  }
  return itens;
}

// ---------- Carregamento principal ----------
async function carregarPainel() {
  mostrarCarregando(true);
  esconderErro();
  try {
    const table = await buscarDadosPlanilha();
    const itens = processarLinhas(table);
    itens.forEach((it, i) => { it.id = i; });
    state.itens = itens;
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

function mostrarErro(msg, manterConteudo = false) {
  els.erroMsg.textContent = msg;
  els.erro.classList.remove("escondido");
  if (!manterConteudo) els.conteudo.classList.add("escondido");
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
  return `<tr data-id="${item.id}">
    <td><span class="tag-local">${escapeHtml(item.local)}</span></td>
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
  const nomeAba = (CONFIG.LOCAIS.find((a) => a.id === state.abaAtiva) || {}).nome;
  const visiveis = state.abaAtiva === "todos"
    ? state.itens
    : state.itens.filter((i) => normalizar(i.local) === normalizar(nomeAba));
  const filtrados = visiveis.filter(
    (i) => !termo || normalizar(i.smart).includes(termo) || normalizar(i.material).includes(termo)
  );

  const risco = filtrados
    .filter((i) => i.status === "CRITICO" || i.status === "ALERTA")
    .sort((a, b) => (a.status === "CRITICO" ? 0 : 1) - (b.status === "CRITICO" ? 0 : 1) || (a.meses ?? 0) - (b.meses ?? 0));
  const ok = filtrados
    .filter((i) => i.status === "OK" || i.status === "SEM_CONSUMO")
    .sort((a, b) => (a.status === "OK" ? 0 : 1) - (b.status === "OK" ? 0 : 1));

  els.corpoRisco.innerHTML = risco.map(linhaHtml).join("") ||
    `<tr><td colspan="6" class="tabela-vazia">Nenhum item encontrado.</td></tr>`;
  els.corpoOk.innerHTML = ok.map(linhaHtml).join("") ||
    `<tr><td colspan="6" class="tabela-vazia">Nenhum item encontrado.</td></tr>`;

  els.cardCritico.textContent = visiveis.filter((i) => i.status === "CRITICO").length;
  els.cardAlerta.textContent = visiveis.filter((i) => i.status === "ALERTA").length;
  els.cardOk.textContent = visiveis.filter((i) => i.status === "OK").length;
  els.cardTotal.textContent = visiveis.length;

  const criticosPorConsumo = visiveis
    .filter((i) => i.status === "CRITICO")
    .sort((a, b) => b.consumoDiario - a.consumoDiario)
    .slice(0, 3);
  els.acaoRecomendada.innerHTML = criticosPorConsumo.length
    ? `⚠️ <b>Ação recomendada:</b> cobrar entregas pendentes para os itens zerados de maior giro (códigos ${criticosPorConsumo
        .map((i) => escapeHtml(i.smart) + " (" + escapeHtml(i.local) + ")")
        .join(", ")}).`
    : `Nenhum item crítico no momento.`;

  document.querySelectorAll("#corpo-risco tr[data-id], #corpo-ok tr[data-id]").forEach((tr) => {
    tr.addEventListener("click", () => {
      const item = state.itens.find((i) => i.id === Number(tr.dataset.id));
      if (item) abrirModal(item);
    });
  });
}

// ---------- Modal de detalhes ----------
function abrirModal(item) {
  const n = (v) => (v === null || v === undefined ? "—" : v.toLocaleString("pt-BR"));
  els.modalConteudo.innerHTML = `
    <h3>${escapeHtml(item.material)}</h3>
    <dl class="modal-lista">
      <dt>Local</dt><dd>${escapeHtml(item.local)}</dd>
      <dt>SMART</dt><dd>${escapeHtml(item.smart)}</dd>
      <dt>Descrição</dt><dd>${escapeHtml(item.material)}</dd>
      <dt>Qtd. Central</dt><dd>${n(item.qtdCentral)}</dd>
      <dt>Qtd. Satélite</dt><dd>${n(item.qtdSatelite)}</dd>
      <dt>Total em estoque</dt><dd>${n(item.estoque)}</dd>
      <dt>Consumo diário</dt><dd>${n(item.consumoDiario)}</dd>
      <dt>Consumo mensal</dt><dd>${n(item.consumoMensal)}</dd>
      <dt>Meses de estoque</dt><dd>${item.meses === null ? "Sem consumo" : item.meses.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}</dd>
      <dt>Status</dt><dd><span class="${badgeClasse(item.status)}">${escapeHtml(item.statusLabel)}</span></dd>
    </dl>`;
  els.modal.classList.remove("escondido");
}

function fecharModal() {
  els.modal.classList.add("escondido");
}

// ---------- Eventos ----------
els.abasBotoes.forEach((btn) => {
  btn.addEventListener("click", () => {
    if (btn.dataset.aba === state.abaAtiva) return;
    state.abaAtiva = btn.dataset.aba;
    els.abasBotoes.forEach((b) => b.classList.toggle("ativa", b === btn));
    render();
  });
});

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
