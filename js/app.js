// ============================================================
// PAINEL DE CONTROLE ALMOXARIFADO — lógica principal
// Fonte única: aba "TOTAL CONSOLIDADO" da planilha (Central + Satélite
// já juntos). Não guarda nenhum dado de produto aqui.
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

function normalizar(txt) {
  return String(txt || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .toUpperCase()
    .trim();
}

function paraNumero(valor) {
  if (valor == null) return 0;
  if (typeof valor === "number") return valor;
  const raw = String(valor).replace(/\./g, "").replace(",", ".");
  const n = parseFloat(raw);
  return isNaN(n) ? 0 : n;
}

// ---------- Busca os dados no Google Sheets (Google Visualization API) ----------
async function buscarDadosPlanilha() {
  const url =
    `https://docs.google.com/spreadsheets/d/${CONFIG.GOOGLE_SHEET_ID}/gviz/tq` +
    `?tqx=out:json&gid=${CONFIG.SHEET_GID}`;

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

  if (!json.table || !json.table.rows) {
    throw new Error("A aba consolidada não retornou nenhuma tabela de dados.");
  }

  return json.table;
}

// ---------- Encontra a linha de cabeçalho de verdade ----------
// Essa planilha tem título e um texto explicativo nas primeiras linhas,
// então o cabeçalho de colunas não está na linha 1 — procuramos ele.
function pareceCabecalho(valores) {
  const norm = valores.map(normalizar);
  const temMaterial = norm.some((v) => v.includes("MATERIAL"));
  const temCodigo = norm.some((v) => v === "CODIGO" || v === "SMART");
  return temMaterial && temCodigo;
}

function localizarCabecalhoEDados(table) {
  // 1) O Google às vezes já detecta sozinho a linha de cabeçalho (mesmo
  //    não sendo a linha 1) e a coloca em table.cols, tirando ela de
  //    table.rows. Checamos isso primeiro.
  const labelsAuto = (table.cols || []).map((c) => c.label || "");
  if (pareceCabecalho(labelsAuto)) {
    const linhasDados = table.rows.map((row) =>
      (row.c || []).map((cel) => (cel && cel.v != null ? String(cel.v) : ""))
    );
    return { cabecalho: labelsAuto, linhasDados };
  }

  // 2) Senão, procura a linha de cabeçalho dentro das próprias linhas de dados
  //    (planilhas com título/instruções antes do cabeçalho de verdade).
  const linhasBrutas = table.rows.map((row) =>
    (row.c || []).map((cel) => (cel && cel.v != null ? String(cel.v) : ""))
  );

  for (let i = 0; i < Math.min(15, linhasBrutas.length); i++) {
    if (pareceCabecalho(linhasBrutas[i])) {
      return { cabecalho: linhasBrutas[i], linhasDados: linhasBrutas.slice(i + 1) };
    }
  }

  throw new Error("Não encontrei a linha de cabeçalho (Código/Material) nem nos nomes de coluna nem nas primeiras linhas da planilha.");
}

// ---------- Mapeia as colunas pelo texto do cabeçalho ----------
function mapearColunas(cabecalho) {
  const idx = { smart: -1, material: -1, estoqueCentral: -1, estoqueSatelite: -1, consumoDiario: -1, consumoMensal: -1 };

  cabecalho.forEach((texto, i) => {
    const label = normalizar(texto);
    if (label === "CODIGO" || label === "SMART") idx.smart = i;
    else if (label.startsWith("MATERIAL")) idx.material = i;
    else if (label.includes("CENTRAL")) idx.estoqueCentral = i;
    else if (label.includes("SATELITE")) idx.estoqueSatelite = i;
    else if (label.includes("CONSUMO") && label.includes("DIARIO")) idx.consumoDiario = i;
    else if (label.includes("CONSUMO") && label.includes("MENSAL")) idx.consumoMensal = i;
  });

  const faltando = Object.entries(idx)
    .filter(([campo, i]) => i === -1 && campo !== "consumoDiario")
    .map(([campo]) => campo);

  if (faltando.length > 0) {
    throw new Error(
      `Não encontrei na planilha as colunas: ${faltando.join(", ")}. ` +
      `Confira se os cabeçalhos continuam sendo Código, Material, Qtd. Central, Qtd. Satélite e Consumo Mensal.`
    );
  }

  return idx;
}

// ---------- Classifica um estoque (Central ou Satélite) ----------
// Regra oficial da planilha: Meses de Estoque = Estoque ÷ Consumo Mensal
function classificar(estoque, consumoMensal) {
  if (consumoMensal === 0) return { status: "SEM_CONSUMO", label: "SEM CONSUMO", meses: null };
  const meses = estoque / consumoMensal;
  if (meses <= CONFIG.LIMITE_CRITICO_MESES) return { status: "CRITICO", label: "CRÍTICO", meses };
  if (meses <= CONFIG.LIMITE_ATENCAO_MESES) return { status: "ALERTA", label: "ATENÇÃO", meses };
  return { status: "OK", label: "ÓTIMO", meses };
}

function formatarMeses(meses) {
  if (meses === null || meses === undefined) return "—";
  return meses.toLocaleString("pt-BR", { maximumFractionDigits: 1, minimumFractionDigits: 1 }) + " meses";
}

const SEVERIDADE = { CRITICO: 3, ALERTA: 2, SEM_CONSUMO: 1, OK: 0 };

function processarLinhas(cabecalho, linhasDados) {
  const idx = mapearColunas(cabecalho);
  const itens = [];
  const smartsVistos = new Set();

  for (const linha of linhasDados) {
    const smart = (linha[idx.smart] || "").trim();
    const material = (linha[idx.material] || "").trim();
    if (!smart || !material) continue;
    // A planilha traz uma linha por origem (Central/Satélite) para o mesmo
    // item, mas os dois estoques já vêm juntos em cada linha — então só
    // precisamos da primeira ocorrência de cada código.
    if (smartsVistos.has(smart)) continue;
    smartsVistos.add(smart);

    const estoqueCentral = paraNumero(linha[idx.estoqueCentral]);
    const estoqueSatelite = paraNumero(linha[idx.estoqueSatelite]);
    const consumoDiario = idx.consumoDiario > -1 ? paraNumero(linha[idx.consumoDiario]) : null;
    const consumoMensal = paraNumero(linha[idx.consumoMensal]);

    // Estoque único: Central + Satélite somados, com UM status calculado
    // em cima do total (regra oficial da planilha: estoque ÷ consumo mensal).
    const estoque = estoqueCentral + estoqueSatelite;
    const { status, label, meses: autonomiaMeses } = classificar(estoque, consumoMensal);

    // Autonomia em meses, separada por local (só pra exibir no modal de detalhes).
    const autonomiaCentralMeses = consumoMensal > 0 ? estoqueCentral / consumoMensal : null;
    const autonomiaSateliteMeses = consumoMensal > 0 ? estoqueSatelite / consumoMensal : null;

    itens.push({
      smart,
      material,
      estoque,
      consumoDiario,
      consumoMensal,
      autonomiaMeses,
      autonomiaCentralMeses,
      autonomiaSateliteMeses,
      status,
      statusLabel: label,
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
    const { cabecalho, linhasDados } = localizarCabecalhoEDados(table);
    state.itens = processarLinhas(cabecalho, linhasDados);
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
  document.getElementById("btn-atualizar-texto").textContent = ligado ? "Atualizando..." : "Atualizar dados";
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

function escapeHtml(txt) {
  const div = document.createElement("div");
  div.textContent = txt;
  return div.innerHTML;
}

function linhaHtml(item) {
  return `<tr data-smart="${escapeHtml(item.smart)}">
    <td class="col-smart">${escapeHtml(item.smart)}</td>
    <td>${escapeHtml(item.material)}</td>
    <td class="col-num">${item.estoque.toLocaleString("pt-BR")}</td>
    <td class="col-num">${item.consumoMensal.toLocaleString("pt-BR")}</td>
    <td><span class="${badgeClasse(item.status)}">${escapeHtml(item.statusLabel)}</span></td>
  </tr>`;
}

// ---------- Filtra por busca, monta as duas colunas e os cards ----------
function render() {
  const termo = normalizar(state.busca);
  const filtrados = state.itens.filter(
    (i) => !termo || normalizar(i.smart).includes(termo) || normalizar(i.material).includes(termo)
  );

  const risco = filtrados
    .filter((i) => i.status === "CRITICO" || i.status === "ALERTA")
    .sort((a, b) => SEVERIDADE[b.status] - SEVERIDADE[a.status]);
  const ok = filtrados
    .filter((i) => i.status === "OK" || i.status === "SEM_CONSUMO")
    .sort((a, b) => (a.status === "OK" ? 0 : 1) - (b.status === "OK" ? 0 : 1));

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
    .sort((a, b) => b.consumoMensal - a.consumoMensal)
    .slice(0, 3);
  els.acaoRecomendada.innerHTML = criticosPorConsumo.length
    ? `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" x2="12" y1="9" y2="13"/><line x1="12" x2="12.01" y1="17" y2="17"/></svg> <b>Ação recomendada:</b> priorizar compra dos itens críticos de maior giro (códigos ${criticosPorConsumo
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
      <dt>Estoque</dt><dd>${item.estoque.toLocaleString("pt-BR")} — <span class="${badgeClasse(item.status)}">${escapeHtml(item.statusLabel)}</span></dd>
      <dt>Autonomia Central</dt><dd>${formatarMeses(item.autonomiaCentralMeses)}</dd>
      <dt>Autonomia Satélite</dt><dd>${formatarMeses(item.autonomiaSateliteMeses)}</dd>
      <dt>Consumo mensal</dt><dd>${item.consumoMensal.toLocaleString("pt-BR")}</dd>
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
