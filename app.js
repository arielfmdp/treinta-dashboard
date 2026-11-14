window.onerror = function(msg, url, line) {
  alert("⚠️ Error en Dashboard: " + msg + " (Línea: " + line + ")");
  return false;
};

// Variables recibidas limpiamente desde el lanzador
var auth = window.__TREINTA_AUTH__ || {};
var token = auth.token || "";
var refreshToken = auth.refreshToken || "";
var storeId = auth.storeId || "";

var activeTab = "clients";
var dateFilterMode = "monthly";
var selectedMonthDate = new Date();

// Estado Clientes y Ventas
var allClients = [];
var allGlobalProducts = [];
var currentCustomerProducts = [];
var nextProductCursor = null;
var isLoadingProducts = false;
var hasMoreProducts = true;
var profitPeriodsCache = [];
var salesPeriodsCache = [];

// Estado Inventario
var invSummaryData = null;
var invCategories = [];
var allInventoryProducts = [];
var invCurrentPage = 1;
var invTotalItems = 0;
var invIsLoading = false;
var invHasMore = true;
var invSelectedCategoryId = "";
var invFilterOnlyNoStock = false;
var invSearchTerm = "";
var invSearchTimeout = null;

var chartClientsInstance = null;
var chartProductsInstance = null;
var chartExecProfitInstance = null;
var chartExecSalesInstance = null;

var currencyFormatter = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 2 });
var numberFormatter = new Intl.NumberFormat('es-AR');

// Botón Salir
document.getElementById("btnCloseDashboard").onclick = function() {
  window.parent.document.getElementById("treinta-dashboard-overlay").remove();
};

function getHeaders() {
  return {
    "x-api-key": "TRE1NT@WEB",
    "authorization": token.startsWith("Bearer ") ? token : "Bearer " + token
  };
}

function getArgentinaStartISO(dateStr) {
  return dateStr + "T03:00:00.000Z";
}

function getArgentinaEndISO(dateStr) {
  var parts = dateStr.split("-").map(Number);
  var nextDay = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2] + 1));
  var nextDayStr = nextDay.toISOString().split("T")[0];
  return nextDayStr + "T02:59:59.999Z";
}

function getDateQueryParams() {
  var tz = encodeURIComponent("America/Buenos_Aires");
  if (dateFilterMode === "custom") {
    var start = document.getElementById("customStartDate").value;
    var end = document.getElementById("customEndDate").value;
    return "timeUnit=custom&startDate=" + getArgentinaStartISO(start) + "&endDate=" + getArgentinaEndISO(end) + "&timeZone=" + tz;
  } else {
    var y = selectedMonthDate.getFullYear();
    var m = selectedMonthDate.getMonth() + 1;
    var firstDayStr = y + "-" + (m < 10 ? "0" + m : m) + "-01";
    return "timeUnit=monthly&startDate=" + getArgentinaStartISO(firstDayStr) + "&timeZone=" + tz;
  }
}

// --- CONMUTADOR DE PESTAÑAS (3 VISTAS) ---
var tabBtnClients = document.getElementById("tabBtnClients");
var tabBtnSales = document.getElementById("tabBtnSales");
var tabBtnInventory = document.getElementById("tabBtnInventory");
var analyticsPeriodSection = document.getElementById("analyticsPeriodSection");
var viewClients = document.getElementById("viewClients");
var viewProducts = document.getElementById("viewProducts");
var viewInventory = document.getElementById("viewInventory");

tabBtnClients.onclick = function() { switchTab("clients"); };
tabBtnSales.onclick = function() { switchTab("sales"); };
tabBtnInventory.onclick = function() { switchTab("inventory"); };

function switchTab(t) {
  activeTab = t;
  [tabBtnClients, tabBtnSales, tabBtnInventory].forEach(function(btn) {
    btn.className = "px-3 py-1.5 rounded-lg text-xs font-bold text-slate-600 hover:text-slate-900 transition-all";
  });

  if (t === "clients") {
    tabBtnClients.className = "px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all shadow-sm bg-white text-indigo-600";
    analyticsPeriodSection.classList.remove("hidden");
    viewClients.classList.remove("hidden");
    viewProducts.classList.add("hidden");
    viewInventory.classList.add("hidden");
    if (allClients.length === 0) fetchClientsData();
  } else if (t === "sales") {
    tabBtnSales.className = "px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all shadow-sm bg-white text-indigo-600";
    analyticsPeriodSection.classList.remove("hidden");
    viewProducts.classList.remove("hidden");
    viewClients.classList.add("hidden");
    viewInventory.classList.add("hidden");
    if (allGlobalProducts.length === 0) resetAndFetchProducts();
  } else if (t === "inventory") {
    tabBtnInventory.className = "px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all shadow-sm bg-white text-indigo-600";
    analyticsPeriodSection.classList.add("hidden");
    viewInventory.classList.remove("hidden");
    viewClients.classList.add("hidden");
    viewProducts.classList.add("hidden");
    initInventoryView();
  }
}

// --- LÓGICA DE INVENTARIO ---
async function initInventoryView() {
  if (!invSummaryData) fetchInventorySummary();
  if (invCategories.length === 0) fetchInventoryCategories();
  if (allInventoryProducts.length === 0) resetAndFetchInventory();
}

async function fetchInventorySummary() {
  try {
    var res = await fetch("https://core-api-gateway.treinta.co/inventory/summary/" + storeId, { headers: getHeaders() });
    if (res.ok) {
      invSummaryData = await res.json();
      document.getElementById("invKpiTotalRefs").textContent = numberFormatter.format(invSummaryData.totalReferences || 0);
      document.getElementById("invKpiTotalValue").textContent = currencyFormatter.format(invSummaryData.inventoryValue || 0);
    }
  } catch(e) {
    console.error("Error resumen inventario:", e);
  }
}

async function fetchInventoryCategories() {
  try {
    var res = await fetch("https://api.prod.treinta.co/categories/" + storeId, { headers: getHeaders() });
    if (res.ok) {
      invCategories = await res.json();
      renderCategoryPills();
    }
  } catch(e) {
    console.error("Error categorías:", e);
  }
}

function renderCategoryPills() {
  var container = document.getElementById("invCategoryPillsContainer");
  container.innerHTML = '<button id="pillCatAll" class="px-3 py-1 rounded-lg font-bold ' + (!invSelectedCategoryId && !invFilterOnlyNoStock ? 'bg-amber-400 text-slate-900 shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200') + ' transition">Ver todos</button>' +
                        '<button id="pillCatNoStock" class="px-3 py-1 rounded-lg font-semibold ' + (invFilterOnlyNoStock ? 'bg-amber-400 text-slate-900 shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200') + ' transition">Sin stock</button>';

  document.getElementById("pillCatAll").onclick = function() {
    invSelectedCategoryId = "";
    invFilterOnlyNoStock = false;
    renderCategoryPills();
    resetAndFetchInventory();
  };

  document.getElementById("pillCatNoStock").onclick = function() {
    invFilterOnlyNoStock = true;
    invSelectedCategoryId = "";
    renderCategoryPills();
    resetAndFetchInventory();
  };

  invCategories.forEach(function(cat) {
    if (!cat.name) return;
    var btn = document.createElement("button");
    var isActive = invSelectedCategoryId === cat.id;
    btn.className = "px-3 py-1 rounded-lg font-semibold transition " + (isActive ? "bg-amber-400 text-slate-900 font-bold shadow-sm" : "bg-slate-100 text-slate-600 hover:bg-slate-200");
    btn.textContent = cat.name;
    btn.onclick = function() {
      invSelectedCategoryId = cat.id;
      invFilterOnlyNoStock = false;
      renderCategoryPills();
      resetAndFetchInventory();
    };
    container.appendChild(btn);
  });
}

function resetAndFetchInventory() {
  allInventoryProducts = [];
  invCurrentPage = 1;
  invHasMore = true;
  document.getElementById("inventoryTableBody").innerHTML = '<tr><td colspan="10" class="text-center py-8 text-indigo-600 font-medium">Cargando inventario...</td></tr>';
  fetchInventoryPage();
}

async function fetchInventoryPage() {
  if (invIsLoading || !invHasMore) return;
  invIsLoading = true;
  document.getElementById("invLoadingText").textContent = "Cargando artículos...";

  var url = "https://web-api-gateway.treinta.co/manager/" + storeId + "/products/summary-with-taxes?page=" + invCurrentPage + "&limit=50&sort=created_at&order=desc";
  if (invSelectedCategoryId) {
    url += "&storeCategoryId=" + encodeURIComponent(invSelectedCategoryId);
  }
  if (invSearchTerm) {
    url += "&search=" + encodeURIComponent(invSearchTerm);
  }

  try {
    var res = await fetch(url, { headers: getHeaders() });
    if (res.ok) {
      var resp = await res.json();
      var newItems = resp.data || [];
      invTotalItems = resp.total || 0;

      allInventoryProducts = allInventoryProducts.concat(newItems);
      invHasMore = (allInventoryProducts.length < invTotalItems) && (newItems.length > 0);
      invCurrentPage++;

      renderInventoryTable();

      if (invHasMore) {
        document.getElementById("invLoadingText").textContent = "Desplázate para cargar más artículos...";
      } else {
        document.getElementById("invLoadingText").textContent = "✅ Has llegado al final (" + allInventoryProducts.length + " artículos cargados)";
      }
    }
  } catch(e) {
    console.error("Error al cargar página de inventario:", e);
    document.getElementById("invLoadingText").textContent = "Error al cargar artículos.";
  } finally {
    invIsLoading = false;
  }
}

function renderInventoryTable() {
  var body = document.getElementById("inventoryTableBody");
  var filtered = allInventoryProducts;

  if (invFilterOnlyNoStock) {
    filtered = filtered.filter(function(p) { return (p.stock || 0) <= 0; });
  }

  document.getElementById("invTableCount").textContent = "Mostrando " + filtered.length + " de " + (invTotalItems || allInventoryProducts.length) + " artículos";

  var inStockCount = 0;
  var noStockCount = 0;
  allInventoryProducts.forEach(function(p) {
    if ((p.stock || 0) > 0) inStockCount++;
    else noStockCount++;
  });
  document.getElementById("invKpiInStockCount").textContent = inStockCount + " con stock";
  document.getElementById("invKpiNoStockCount").textContent = noStockCount + " sin stock";

  if (filtered.length === 0) {
    body.innerHTML = '<tr><td colspan="10" class="text-center py-8 text-slate-400">No se encontraron productos con los filtros seleccionados.</td></tr>';
    return;
  }

  body.innerHTML = "";
  filtered.forEach(function(prod, idx) {
    var price = prod.price || 0;
    var cost = prod.cost || 0;
    var stock = prod.stock || 0;
    var profit = price - cost;
    var marginPct = price > 0 ? ((profit / price) * 100).toFixed(1) : 0;
    var totalStockValue = cost * (stock > 0 ? stock : 0);
    var isLoss = profit < 0;

    var tr = document.createElement("tr");
    tr.className = isLoss ? "bg-rose-50/70 border-l-4 border-rose-500" : "hover:bg-slate-50 transition-colors";

    var imgTag = prod.imageUrl
      ? '<img src="' + prod.imageUrl + '" class="w-8 h-8 rounded-lg object-cover border border-slate-200" alt="img">'
      : '<div class="w-8 h-8 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400 text-xs">📦</div>';

    var stockBadge = stock > 0
      ? '<span class="inline-block px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 font-bold">' + numberFormatter.format(stock) + '</span>'
      : '<span class="inline-block px-2 py-0.5 rounded bg-rose-100 text-rose-700 font-bold">' + numberFormatter.format(stock) + '</span>';

    var profitCell = isLoss
      ? '<span class="font-bold text-rose-600">⚠️ ' + currencyFormatter.format(profit) + '</span>'
      : '<span class="font-semibold text-slate-700">' + currencyFormatter.format(profit) + '</span>';

    var marginBadge = isLoss
      ? '<span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-700">' + marginPct + '%</span>'
      : '<span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700">' + marginPct + '%</span>';

    var catBadge = prod.categoryName
      ? '<span class="inline-block px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-semibold text-[10px]">' + prod.categoryName + '</span>'
      : '<span class="text-slate-300 italic text-[11px]">-</span>';

    tr.innerHTML = '<td class="py-2.5 px-3 text-slate-400 font-mono">' + (idx + 1) + '</td>' +
                   '<td class="py-2.5 px-3">' + imgTag + '</td>' +
                   '<td class="py-2.5 px-3 font-medium text-slate-800">' +
                     '<div>' + (prod.name || "Sin Nombre") + '</div>' +
                     (prod.sku ? '<div class="text-[10px] text-slate-400 font-mono">SKU: ' + prod.sku + '</div>' : '') +
                   '</td>' +
                   '<td class="py-2.5 px-3">' + catBadge + '</td>' +
                   '<td class="py-2.5 px-3 text-right font-bold text-slate-900">' + currencyFormatter.format(price) + '</td>' +
                   '<td class="py-2.5 px-3 text-right text-slate-600">' + currencyFormatter.format(cost) + '</td>' +
                   '<td class="py-2.5 px-3 text-center">' + stockBadge + '</td>' +
                   '<td class="py-2.5 px-3 text-right">' + profitCell + '</td>' +
                   '<td class="py-2.5 px-3 text-right">' + marginBadge + '</td>' +
                   '<td class="py-2.5 px-3 text-right font-semibold text-slate-700">' + currencyFormatter.format(totalStockValue) + '</td>';

    body.appendChild(tr);
  });
}

// Buscador en inventario con llamada al servidor (debounce de 400ms)
document.getElementById("invSearchInput").oninput = function(e) {
  clearTimeout(invSearchTimeout);
  var term = e.target.value.trim();
  invSearchTimeout = setTimeout(function() {
    invSearchTerm = term;
    resetAndFetchInventory();
  }, 400);
};

// Scroll infinito en inventario
new IntersectionObserver(function(e) {
  if (e[0].isIntersecting && activeTab === "inventory" && invHasMore && !invIsLoading) {
    fetchInventoryPage();
  }
}, { threshold: 0.1 }).observe(document.getElementById("invInfiniteScrollTrigger"));

// --- CÓDIGO DE FECHAS Y ANÁLISIS ---
var modeMonthlyBtn = document.getElementById("modeMonthlyBtn");
var modeCustomBtn = document.getElementById("modeCustomBtn");
var monthlyControls = document.getElementById("monthlyControls");
var customControls = document.getElementById("customControls");

modeMonthlyBtn.onclick = function() {
  dateFilterMode = "monthly";
  modeMonthlyBtn.className = "px-3 py-1 rounded-md bg-white text-indigo-600 shadow-sm font-bold transition";
  modeCustomBtn.className = "px-3 py-1 rounded-md text-slate-600 hover:text-slate-900 transition";
  monthlyControls.classList.remove("hidden");
  customControls.classList.add("hidden");
  syncPresetButtonStyles();
  refreshAll();
};

modeCustomBtn.onclick = function() {
  dateFilterMode = "custom";
  modeCustomBtn.className = "px-3 py-1 rounded-md bg-white text-indigo-600 shadow-sm font-bold transition";
  modeMonthlyBtn.className = "px-3 py-1 rounded-md text-slate-600 hover:text-slate-900 transition";
  monthlyControls.classList.remove("hidden");
  customControls.classList.remove("hidden");
  refreshAll();
};

function initDateInputs() {
  var now = new Date();
  selectedMonthDate = new Date(now.getFullYear(), now.getMonth(), 1);

  var sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(now.getDate() - 7);
  document.getElementById("customStartDate").value = sevenDaysAgo.toISOString().split("T")[0];
  document.getElementById("customEndDate").value = now.toISOString().split("T")[0];

  syncPresetButtonStyles();
}

function syncPresetButtonStyles() {
  var now = new Date();
  var currentMonthDate = new Date(now.getFullYear(), now.getMonth(), 1);
  document.getElementById("lblCurrentPeriod").textContent = selectedMonthDate.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
  document.getElementById("btnNextMonthStep").disabled = selectedMonthDate >= currentMonthDate;
}

function stepMonth(delta) {
  selectedMonthDate = new Date(selectedMonthDate.getFullYear(), selectedMonthDate.getMonth() + delta, 1);
  syncPresetButtonStyles();
  refreshAll();
}

document.getElementById("btnPrevMonthStep").onclick = function() { stepMonth(-1); };
document.getElementById("btnNextMonthStep").onclick = function() { stepMonth(1); };
document.getElementById("btnCurrentMonth").onclick = function() {
  var now = new Date();
  selectedMonthDate = new Date(now.getFullYear(), now.getMonth(), 1);
  syncPresetButtonStyles();
  refreshAll();
};

document.getElementById("btnApplyCustomRange").onclick = function() { refreshAll(); };

function applyPresetRange(start, end) {
  document.getElementById("customStartDate").value = start.toISOString().split("T")[0];
  document.getElementById("customEndDate").value = end.toISOString().split("T")[0];
  refreshAll();
}

document.getElementById("btnPreset3M").onclick = function() {
  var now = new Date();
  var start = new Date();
  start.setMonth(now.getMonth() - 3);
  applyPresetRange(start, now);
};

document.getElementById("btnPreset6M").onclick = function() {
  var now = new Date();
  var start = new Date();
  start.setMonth(now.getMonth() - 6);
  applyPresetRange(start, now);
};

document.getElementById("btnPresetYTD").onclick = function() {
  var now = new Date();
  var start = new Date(now.getFullYear(), 0, 1);
  applyPresetRange(start, now);
};

var btnMonthDropdownToggle = document.getElementById("btnMonthDropdownToggle");
var monthDropdownMenu = document.getElementById("monthDropdownMenu");
var monthDropdownList = document.getElementById("monthDropdownList");

function renderMonthDropdownOptions() {
  monthDropdownList.innerHTML = "";
  var now = new Date();
  var realCurrentMonthDate = new Date(now.getFullYear(), now.getMonth(), 1);

  for (var offset = -6; offset <= 6; offset++) {
    (function(off) {
      var optionDate = new Date(selectedMonthDate.getFullYear(), selectedMonthDate.getMonth() + off, 1);
      var isCurrentSelected = optionDate.getTime() === selectedMonthDate.getTime();
      var isFuture = optionDate > realCurrentMonthDate;

      var btn = document.createElement("button");
      btn.type = "button";
      var label = optionDate.toLocaleDateString('es-AR', { month: 'short', year: '2-digit' }).replace('.', '');
      label = label.charAt(0).toUpperCase() + label.slice(1);

      if (isCurrentSelected) {
        btn.className = "px-2 py-1.5 text-xs font-bold rounded-lg bg-indigo-600 text-white shadow-sm";
        btn.textContent = "✓ " + label;
      } else if (isFuture) {
        btn.className = "px-2 py-1.5 text-xs text-slate-300 cursor-not-allowed rounded-lg text-left";
        btn.textContent = label;
        btn.disabled = true;
      } else {
        btn.className = "px-2 py-1.5 text-xs font-semibold text-slate-700 hover:bg-indigo-50 hover:text-indigo-600 rounded-lg text-left transition";
        btn.textContent = label;
      }

      btn.onclick = function() {
        if (isFuture || isCurrentSelected) return;
        selectedMonthDate = optionDate;
        monthDropdownMenu.classList.add("hidden");
        syncPresetButtonStyles();
        refreshAll();
      };

      monthDropdownList.appendChild(btn);
    })(offset);
  }
}

btnMonthDropdownToggle.onclick = function(e) {
  e.stopPropagation();
  var isHidden = monthDropdownMenu.classList.contains("hidden");
  if (isHidden) {
    renderMonthDropdownOptions();
    monthDropdownMenu.classList.remove("hidden");
  } else {
    monthDropdownMenu.classList.add("hidden");
  }
};

document.addEventListener("click", function(e) {
  if (!monthDropdownMenu.contains(e.target) && !btnMonthDropdownToggle.contains(e.target)) {
    monthDropdownMenu.classList.add("hidden");
  }
});

document.addEventListener("keydown", function(e) {
  if (e.key === "Escape" || e.keyCode === 27) {
    closeDetailModal();
    if (monthDropdownMenu) monthDropdownMenu.classList.add("hidden");
  }
});

function selectMonthFromChart(iso) {
  if (dateFilterMode === "custom") return;
  var d = new Date(iso);
  selectedMonthDate = new Date(d.getUTCFullYear(), d.getUTCMonth(), 1);
  syncPresetButtonStyles();
  refreshAll();
}

async function fetchExecutiveSummary() {
  var q = getDateQueryParams();
  try {
    var rp = await fetch("https://core-api-gateway.treinta.co/v2/stores/" + storeId + "/stats/profit?" + q, { headers: getHeaders() });
    var rs = await fetch("https://core-api-gateway.treinta.co/v2/stores/" + storeId + "/stats/sales?" + q, { headers: getHeaders() });
    if (rp.ok) renderExecutiveProfit(await rp.json());
    if (rs.ok) renderExecutiveSales(await rs.json());
  } catch(err) {
    console.error("Error en resumen ejecutivo:", err);
  }
}

function renderExecutiveProfit(data) {
  document.getElementById("execProfitValue").textContent = currencyFormatter.format(data.totalProfit || 0);
  document.getElementById("execProfitVendiste").textContent = currencyFormatter.format(data.totalSales || 0);
  document.getElementById("execProfitCosto").textContent = currencyFormatter.format(data.totalCost || 0);
  document.getElementById("execProfitMargen").textContent = (data.marginPercentage || 0).toFixed(2) + "%";
  var tr = data.trendPercentage || 0;
  document.getElementById("execProfitTrend").textContent = (tr >= 0 ? "↑ +" : "↓ ") + tr + "% vs anterior";

  profitPeriodsCache = data.periods || [];

  var labels = profitPeriodsCache.map(function(p) {
    var d = new Date(p.periodStart);
    if (dateFilterMode === "custom" || p.granularity === "day") {
      return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' }).replace('.', '');
    }
    return d.toLocaleDateString('es-AR', { month: 'short' }).replace('.', '');
  });

  var colors = profitPeriodsCache.map(function(p, idx) {
    return idx === profitPeriodsCache.length - 1 ? "#059669" : "#a7f3d0";
  });

  var ctx = document.getElementById("chartExecProfit").getContext("2d");
  if (chartExecProfitInstance) chartExecProfitInstance.destroy();
  chartExecProfitInstance = new Chart(ctx, {
    type: 'bar',
    data: { labels: labels, datasets: [{ data: profitPeriodsCache.map(function(p){ return p.totalProfit || 0; }), backgroundColor: colors, borderRadius: 3 }] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: function(items) {
              var p = profitPeriodsCache[items[0].dataIndex];
              var d = new Date(p.periodStart);
              return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' });
            },
            label: function(c) {
              return " Ganancia: " + currencyFormatter.format(c.raw);
            }
          }
        }
      },
      onClick: function(e, els) {
        if (els.length) selectMonthFromChart(profitPeriodsCache[els[0].index].periodStart);
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { autoSkip: true, maxTicksLimit: 8, font: { size: 9, weight: 'bold' }, color: '#64748b' }
        },
        y: { display: false }
      }
    }
  });
}

function renderExecutiveSales(data) {
  document.getElementById("execSalesValue").textContent = currencyFormatter.format(data.totalSales || 0);
  document.getElementById("execSalesTotalUnits").textContent = numberFormatter.format(data.totalSold || 0);
  document.getElementById("execSalesAvgTicket").textContent = currencyFormatter.format(data.averageBySale || 0);
  var tr = data.trendPercentage || 0;
  document.getElementById("execSalesTrend").textContent = (tr >= 0 ? "↑ +" : "↓ ") + tr + "% vs anterior";

  salesPeriodsCache = data.periods || [];

  var labels = salesPeriodsCache.map(function(p) {
    var d = new Date(p.periodStart);
    if (dateFilterMode === "custom" || p.granularity === "day") {
      return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' }).replace('.', '');
    }
    return d.toLocaleDateString('es-AR', { month: 'short' }).replace('.', '');
  });

  var colors = salesPeriodsCache.map(function(p, idx) {
    return idx === salesPeriodsCache.length - 1 ? "#059669" : "#a7f3d0";
  });

  var ctx = document.getElementById("chartExecSales").getContext("2d");
  if (chartExecSalesInstance) chartExecSalesInstance.destroy();
  chartExecSalesInstance = new Chart(ctx, {
    type: 'bar',
    data: { labels: labels, datasets: [{ data: salesPeriodsCache.map(function(p){ return p.salesAmount || p.value || 0; }), backgroundColor: colors, borderRadius: 3 }] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: function(items) {
              var p = salesPeriodsCache[items[0].dataIndex];
              var d = new Date(p.periodStart);
              return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' });
            },
            label: function(c) {
              return " Ventas: " + currencyFormatter.format(c.raw);
            }
          }
        }
      },
      onClick: function(e, els) {
        if (els.length) selectMonthFromChart(salesPeriodsCache[els[0].index].periodStart);
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { autoSkip: true, maxTicksLimit: 8, font: { size: 9, weight: 'bold' }, color: '#64748b' }
        },
        y: { display: false }
      }
    }
  });
}

async function fetchClientsData() {
  var q = getDateQueryParams();
  try {
    var res = await fetch("https://core-api-gateway.treinta.co/v2/stores/" + storeId + "/stats/customers?" + q, { headers: getHeaders() });
    if (res.ok) {
      var d = await res.json();
      allClients = (d.items || []).filter(function(i) { return (i.salesAmount || i.amount) > 0; });
      allClients.sort(function(a, b) { return (b.salesAmount || b.amount) - (a.salesAmount || a.amount); });
      renderClientsKPIs(allClients);
      renderClientsChart(allClients.slice(0, 10));
      renderClientsTable(allClients);
    }
  } catch(err) {
    console.error("Error clientes:", err);
  }
}

function renderClientsKPIs(items) {
  var t = 0, c = 0;
  items.forEach(function(i) { t += (i.salesAmount || i.amount || 0); c += (i.salesCount || 0); });
  document.getElementById("kpiTotalSales").textContent = currencyFormatter.format(t);
  document.getElementById("kpiActiveClients").textContent = numberFormatter.format(items.length);
  document.getElementById("kpiTotalOrders").textContent = numberFormatter.format(c);
  document.getElementById("kpiAvgTicket").textContent = currencyFormatter.format(c > 0 ? t / c : 0);
}

function renderClientsChart(items) {
  var ctx = document.getElementById("topClientsChart").getContext("2d");
  if (chartClientsInstance) chartClientsInstance.destroy();
  chartClientsInstance = new Chart(ctx, {
    type: 'bar',
    data: { labels: items.map(function(i){ return i.name.trim(); }), datasets: [{ data: items.map(function(i){ return i.salesAmount || i.amount || 0; }), backgroundColor: 'rgba(99, 102, 241, 0.85)', borderRadius: 6 }] },
    options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { grid: { display: false } } } }
  });
}

function renderClientsTable(items) {
  var body = document.getElementById("clientsTableBody");
  body.innerHTML = "";
  document.getElementById("tableRecordCount").textContent = "Mostrando " + items.length + " clientes";
  var tot = allClients.reduce(function(a, b) { return a + (b.salesAmount || b.amount || 0); }, 0);
  
  items.forEach(function(item, idx) {
    var amt = item.salesAmount || item.amount || 0;
    var cnt = item.salesCount || 0;
    var pct = tot > 0 ? ((amt / tot) * 100).toFixed(1) : 0;
    
    var tr = document.createElement("tr");
    tr.className = "hover:bg-slate-50";

    var tdIdx = document.createElement("td");
    tdIdx.className = "py-3 px-4 text-slate-400";
    tdIdx.textContent = (idx + 1);

    var tdName = document.createElement("td");
    tdName.className = "py-3 px-4 font-bold";
    tdName.textContent = item.name;

    var tdAmt = document.createElement("td");
    tdAmt.className = "py-3 px-4 text-right font-bold";
    tdAmt.textContent = currencyFormatter.format(amt);

    var tdCnt = document.createElement("td");
    tdCnt.className = "py-3 px-4 text-center font-bold";
    tdCnt.textContent = cnt;

    var tdAvg = document.createElement("td");
    tdAvg.className = "py-3 px-4 text-right";
    tdAvg.textContent = currencyFormatter.format(cnt > 0 ? amt / cnt : 0);

    var tdPct = document.createElement("td");
    tdPct.className = "py-3 px-4 text-right";
    tdPct.innerHTML = '<span class="px-2 py-0.5 rounded bg-slate-100 font-bold">' + pct + '%</span>';

    var tdAction = document.createElement("td");
    tdAction.className = "py-3 px-4 text-center";
    
    var btn = document.createElement("button");
    btn.className = "px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-semibold rounded text-[11px] border border-indigo-200 transition";
    btn.textContent = "Ver Artículos 📦";
    btn.onclick = function() {
      openCustomerDetail(item.id, item.name);
    };
    tdAction.appendChild(btn);

    tr.appendChild(tdIdx);
    tr.appendChild(tdName);
    tr.appendChild(tdAmt);
    tr.appendChild(tdCnt);
    tr.appendChild(tdAvg);
    tr.appendChild(tdPct);
    tr.appendChild(tdAction);

    body.appendChild(tr);
  });
}

function resetAndFetchProducts() {
  allGlobalProducts = [];
  nextProductCursor = null;
  hasMoreProducts = true;
  fetchProductsPage();
}

async function fetchProductsPage() {
  if (isLoadingProducts || !hasMoreProducts) return;
  isLoadingProducts = true;
  var q = getDateQueryParams();
  var u = "https://core-api-gateway.treinta.co/v2/stores/" + storeId + "/stats/products/list?sort=sales&order=desc&limit=50&" + q;
  if (nextProductCursor) u += "&cursor=" + encodeURIComponent(nextProductCursor);
  try {
    var res = await fetch(u, { headers: getHeaders() });
    if (res.ok) {
      var d = await res.json();
      allGlobalProducts = allGlobalProducts.concat(d.items || []);
      nextProductCursor = d.nextCursor || null;
      hasMoreProducts = Boolean(nextProductCursor && (d.items || []).length > 0);
      renderProductsKPIs(allGlobalProducts);
      try { renderProductsChart(allGlobalProducts.slice(0, 10)); } catch(e){}
      renderGlobalProductsTable(allGlobalProducts);
    }
  } catch(err) {
    console.error("Error productos:", err);
  } finally { 
    isLoadingProducts = false; 
  }
}

function renderProductsKPIs(items) {
  var s = 0, u = 0, p = 0;
  items.forEach(function(i) { s += (i.salesAmount || i.totalSales || 0); u += (i.totalSold || 0); p += (i.totalProfit || 0); });
  document.getElementById("kpiProdTotalSales").textContent = currencyFormatter.format(s);
  document.getElementById("kpiProdTotalUnits").textContent = numberFormatter.format(u);
  document.getElementById("kpiProdTotalProfit").textContent = currencyFormatter.format(p);
  document.getElementById("kpiProdTotalSkus").textContent = numberFormatter.format(items.length);
}

function renderProductsChart(items) {
  var ctx = document.getElementById("topProductsChart").getContext("2d");
  if (chartProductsInstance) chartProductsInstance.destroy();
  chartProductsInstance = new Chart(ctx, {
    type: 'bar',
    data: { labels: items.map(function(p){ return (p.productName || "").substring(0, 25); }), datasets: [{ data: items.map(p => p.salesAmount || p.totalSales || 0), backgroundColor: 'rgba(16, 185, 129, 0.85)', borderRadius: 6 }] },
    options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { grid: { display: false }, ticks: { font: { size: 10 } } } } }
  });
}

function renderGlobalProductsTable(items) {
  var b = document.getElementById("productsGlobalTableBody");
  var onlyL = document.getElementById("chkOnlyLosses").checked;
  var term = document.getElementById("prodSearchInput").value.toLowerCase();
  var filtered = items.filter(function(p) {
    return ((p.productName || "").toLowerCase().includes(term)) && (onlyL ? (p.totalProfit || 0) < 0 : true);
  });
  b.innerHTML = "";
  document.getElementById("prodTableRecordCount").textContent = "Mostrando " + filtered.length + " de " + allGlobalProducts.length + " productos";

  filtered.forEach(function(prod, idx) {
    var sales = prod.salesAmount || prod.totalSales || 0;
    var units = prod.totalSold || 0;
    var profit = prod.totalProfit || 0;
    var isLoss = profit < 0;

    var imgTag = prod.imageUrl
      ? '<img src="' + prod.imageUrl + '" class="w-8 h-8 rounded-lg object-cover border border-slate-200" alt="img">'
      : '<div class="w-8 h-8 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400 text-xs">📦</div>';

    var tr = document.createElement("tr");
    tr.className = isLoss ? "bg-rose-50/70 border-l-4 border-rose-500" : "hover:bg-slate-50";
    tr.innerHTML = '<td class="py-2.5 px-4 text-slate-400">' + (idx + 1) + '</td><td class="py-2.5 px-4">' + imgTag + '</td><td class="py-2.5 px-4 font-medium">' + (prod.productName || "Sin Nombre") + '</td><td class="py-2.5 px-4 text-center font-bold">' + numberFormatter.format(units) + '</td><td class="py-2.5 px-4 text-right">' + currencyFormatter.format(units > 0 ? sales / units : 0) + '</td><td class="py-2.5 px-4 text-right font-bold">' + currencyFormatter.format(sales) + '</td><td class="py-2.5 px-4 text-right font-bold ' + (isLoss ? 'text-rose-600' : 'text-emerald-600') + '">' + currencyFormatter.format(profit) + '</td><td class="py-2.5 px-4 text-right"><span class="px-1.5 py-0.5 rounded text-[10px] font-bold ' + (isLoss ? 'bg-rose-100 text-rose-700' : 'bg-emerald-50 text-emerald-700') + '">' + (sales > 0 ? ((profit/sales)*100).toFixed(1) : 0) + '%</span></td>';
    b.appendChild(tr);
  });
}

// Modal de Cliente
window.openCustomerDetail = async function(contactId, name) {
  document.getElementById("modalClientTitle").textContent = name;
  document.getElementById("modalPeriodSubtitle").textContent = dateFilterMode === "custom"
    ? "Rango: " + document.getElementById("customStartDate").value + " al " + document.getElementById("customEndDate").value
    : "Mes: " + selectedMonthDate.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
  
  document.getElementById("productSearchInput").value = "";
  document.body.classList.add("overflow-hidden");
  document.getElementById("modalDetail").classList.remove("hidden");

  var q = getDateQueryParams();
  try {
    var res = await fetch("https://core-api-gateway.treinta.co/v2/stores/" + storeId + "/stats/products/list?contactId=" + contactId + "&sort=units&order=desc&limit=100&" + q, { headers: getHeaders() });
    if (res.ok) {
      var d = await res.json();
      currentCustomerProducts = (d.items || []).filter(function(p) { return (p.salesAmount || p.totalSales || 0) > 0 || (p.totalSold || 0) > 0; });
      var tot = currentCustomerProducts.reduce(function(a, b) { return a + (b.salesAmount || b.totalSales || 0); }, 0);
      document.getElementById("modalClientTotalAmount").textContent = currencyFormatter.format(tot);
      document.getElementById("modalClientTotalUnits").textContent = numberFormatter.format(currentCustomerProducts.reduce(function(a, b) { return a + (b.totalSold || 0); }, 0));
      document.getElementById("modalClientTotalSkus").textContent = numberFormatter.format(currentCustomerProducts.length);
      renderModalProductRows(currentCustomerProducts, tot);
    }
  } catch(err) {
    console.error("Error detalle cliente:", err);
  }
};

function renderModalProductRows(prods, tot) {
  var tb = document.getElementById("productsTableBody");
  tb.innerHTML = "";
  document.getElementById("productRecordCount").textContent = prods.length + " productos";
  if (prods.length === 0) {
    tb.innerHTML = '<tr><td colspan="6" class="text-center py-8 text-slate-400">Sin productos coincidentes.</td></tr>';
    return;
  }
  prods.forEach(function(p, i) {
    var amt = p.salesAmount || p.totalSales || 0;
    var u = p.totalSold || 0;
    var row = document.createElement("tr");
    row.className = "hover:bg-slate-50";
    row.innerHTML = '<td class="p-2.5 text-slate-400">' + (i+1) + '</td><td class="p-2.5 font-medium">' + p.productName + '</td><td class="p-2.5 text-center font-bold">' + u + '</td><td class="p-2.5 text-right">' + currencyFormatter.format(u > 0 ? amt / u : 0) + '</td><td class="p-2.5 text-right font-bold">' + currencyFormatter.format(amt) + '</td><td class="p-2.5 text-right"><span class="bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded font-bold">' + (tot > 0 ? ((amt/tot)*100).toFixed(1) : 0) + '%</span></td>';
    tb.appendChild(row);
  });
}

function closeDetailModal() {
  document.getElementById("modalDetail").classList.add("hidden");
  document.body.classList.remove("overflow-hidden");
}

document.getElementById("productSearchInput").oninput = function(e) {
  var term = e.target.value.toLowerCase();
  var filtered = currentCustomerProducts.filter(function(p) { return (p.productName || "").toLowerCase().includes(term); });
  var tot = currentCustomerProducts.reduce(function(a, b) { return a + (b.salesAmount || b.totalSales || 0); }, 0);
  renderModalProductRows(filtered, tot);
};

document.getElementById("btnCloseDetail").onclick = closeDetailModal;
document.getElementById("btnCloseDetailFooter").onclick = closeDetailModal;
document.getElementById("modalDetail").onclick = function(e) {
  if (!document.getElementById("modalDetailCard").contains(e.target)) closeDetailModal();
};

new IntersectionObserver(function(e) {
  if (e[0].isIntersecting && activeTab === "sales" && hasMoreProducts && !isLoadingProducts) fetchProductsPage();
}, { threshold: 0.1 }).observe(document.getElementById("infiniteScrollTrigger"));

function refreshAll() {
  if (activeTab === "inventory") {
    resetAndFetchInventory();
  } else {
    fetchExecutiveSummary();
    if (activeTab === "clients") fetchClientsData();
    else resetAndFetchProducts();
  }
}

document.getElementById("btnRefresh").onclick = refreshAll;
document.getElementById("chkOnlyLosses").onchange = function() { renderGlobalProductsTable(allGlobalProducts); };
document.getElementById("prodSearchInput").oninput = function() { renderGlobalProductsTable(allGlobalProducts); };
document.getElementById("searchInput").oninput = function(e) {
  renderClientsTable(allClients.filter(function(i) { return i.name.toLowerCase().includes(e.target.value.toLowerCase()); }));
};

initDateInputs();
refreshAll();