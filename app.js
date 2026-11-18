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

// PREFERENCIA DE TAMAÑO DE MINIATURAS: "sm" (2rem), "md" (3rem), "lg" (4rem)
var currentThumbSize = localStorage.getItem("t_thumb_size") || "sm";

// Estado Clientes y Ventas
var allClients = [];
var allGlobalProducts = [];
var currentCustomerProducts = [];
var nextProductCursor = null;
var isLoadingProducts = false;
var hasMoreProducts = true;
var profitPeriodsCache = [];
var salesPeriodsCache = [];
var salesSelectedCategoryId = "";
var salesSortField = "sales"; // "sales", "profit", o "units"
var salesSortOrder = "desc";  // "desc" o "asc"
var salesCategoriesLoaded = false;

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
var invSortField = "created_at"; // "created_at", "name", "price", "stock"
var invSortOrder = "desc";
// Estado de columna Fecha Alta visible u oculta
var invShowCreatedCol = localStorage.getItem("t_show_created_col") === "true";

var chartClientsInstance = null;
var chartProductsInstance = null;
var chartExecProfitInstance = null;
var chartExecSalesInstance = null;

var currencyFormatter = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 2 });
var numberFormatter = new Intl.NumberFormat('es-AR');

// Diccionario en memoria: ID de Producto ➔ Nombre de Categoría
var productCategoryMap = {};
try {
  productCategoryMap = JSON.parse(localStorage.getItem("t_prod_cat_map") || "{}");
} catch(e) {}

async function ensureProductCategoryMap() {
  if (Object.keys(productCategoryMap).length >= 50) return; // Si ya está en caché local, no gasta red

  try {
    var res = await fetch("https://web-api-gateway.treinta.co/manager/" + storeId + "/products/summary-with-taxes?page=1&limit=100&sort=created_at&order=desc", { headers: getHeaders() });
    if (res.ok) {
      var d = await res.json();
      var total = d.total || 0;
      (d.data || []).forEach(function(p) {
        if (p.id) productCategoryMap[p.id] = p.categoryName || "SIN CATEGORIA";
      });

      var totalPages = Math.ceil(total / 100);
      var promises = [];
      for (var pg = 2; pg <= totalPages; pg++) {
        promises.push(
          fetch("https://web-api-gateway.treinta.co/manager/" + storeId + "/products/summary-with-taxes?page=" + pg + "&limit=100&sort=created_at&order=desc", { headers: getHeaders() })
            .then(function(r) { return r.json(); })
            .then(function(resData) {
              (resData.data || []).forEach(function(p) {
                if (p.id) productCategoryMap[p.id] = p.categoryName || "SIN CATEGORIA";
              });
            }).catch(function() {})
        );
      }
      if (promises.length > 0) await Promise.all(promises);
      localStorage.setItem("t_prod_cat_map", JSON.stringify(productCategoryMap));
      if (activeTab === "sales") renderGlobalProductsTable(allGlobalProducts);
    }
  } catch(e) {
    console.error("Error mapa categorías:", e);
  }
}

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

// --- GESTIÓN DE TAMAÑO DE FOTOS Y VISOR FLOTANTE ZOOM (10rem) ---
function getThumbDimensions() {
  if (currentThumbSize === "md") return "w-12 h-12"; // 3rem
  if (currentThumbSize === "lg") return "w-16 h-16"; // 4rem
  return "w-8 h-8"; // 2rem (sm por defecto)
}

function syncThumbSizeButtons() {
  document.querySelectorAll(".btn-thumb-size").forEach(function(btn) {
    if (btn.dataset.size === currentThumbSize) {
      btn.className = "btn-thumb-size px-2 py-0.5 rounded text-[11px] font-bold bg-white text-indigo-600 shadow-sm transition";
    } else {
      btn.className = "btn-thumb-size px-2 py-0.5 rounded text-[11px] font-semibold text-slate-600 hover:text-slate-900 transition";
    }
  });
}

function syncCreatedColToggleBtn() {
  var btn = document.getElementById("btnToggleCreatedCol");
  var th = document.getElementById("thInvSortCreated");
  if (!btn || !th) return;

  if (invShowCreatedCol) {
    btn.className = "px-2.5 py-1 rounded-lg text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-300 shadow-sm transition flex items-center gap-1 select-none";
    th.classList.remove("hidden");
  } else {
    btn.className = "px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-200 transition flex items-center gap-1 select-none";
    th.classList.add("hidden");
  }
}

document.getElementById("btnToggleCreatedCol").onclick = function() {
  invShowCreatedCol = !invShowCreatedCol;
  localStorage.setItem("t_show_created_col", invShowCreatedCol ? "true" : "false");
  syncCreatedColToggleBtn();
  renderInventoryTable();
};

document.querySelectorAll(".btn-thumb-size").forEach(function(btn) {
  btn.onclick = function() {
    currentThumbSize = btn.dataset.size;
    localStorage.setItem("t_thumb_size", currentThumbSize);
    syncThumbSizeButtons();
    if (activeTab === "sales") renderGlobalProductsTable(allGlobalProducts);
    if (activeTab === "inventory") renderInventoryTable();
  };
});

// Control del Visor de Zoom flotante
function showImgPreview(e, url) {
  if (!url) return;
  var preview = document.getElementById("globalImgPreview");
  var img = document.getElementById("globalImgPreviewSrc");
  img.src = url;
  positionPreview(e);
  preview.classList.remove("hidden");
  preview.classList.add("flex");
}

function positionPreview(e) {
  var preview = document.getElementById("globalImgPreview");
  var x = e.clientX + 16;
  var y = e.clientY - 80;
  if (x + 180 > window.innerWidth) x = e.clientX - 180;
  if (y < 10) y = 10;
  if (y + 180 > window.innerHeight) y = window.innerHeight - 190;
  preview.style.left = x + "px";
  preview.style.top = y + "px";
}

function hideImgPreview() {
  var preview = document.getElementById("globalImgPreview");
  preview.classList.add("hidden");
  preview.classList.remove("flex");
}

function attachHoverPreviewEvents(tableBodyId) {
  var tb = document.getElementById(tableBodyId);
  tb.onmouseover = function(e) {
    if (e.target && e.target.classList.contains("img-previewable")) {
      showImgPreview(e, e.target.dataset.preview);
    }
  };
  tb.onmousemove = function(e) {
    if (e.target && e.target.classList.contains("img-previewable")) {
      positionPreview(e);
    }
  };
  tb.onmouseout = function(e) {
    if (e.target && e.target.classList.contains("img-previewable")) {
      hideImgPreview();
    }
  };
}

// Fechas Argentina UTC-3
function getArgentinaStartISO(dateStr) { return dateStr + "T03:00:00.000Z"; }
function getArgentinaEndISO(dateStr) {
  var parts = dateStr.split("-").map(Number);
  var nextDay = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2] + 1));
  return nextDay.toISOString().split("T")[0] + "T02:59:59.999Z";
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

// Pestañas
var tabBtnClients = document.getElementById("tabBtnClients");
var tabBtnSales = document.getElementById("tabBtnSales");
var tabBtnInventory = document.getElementById("tabBtnInventory");
var tabBtnTransactions = document.getElementById("tabBtnTransactions");
var analyticsPeriodSection = document.getElementById("analyticsPeriodSection");
var viewClients = document.getElementById("viewClients");
var viewProducts = document.getElementById("viewProducts");
var viewInventory = document.getElementById("viewInventory");
var viewTransactions = document.getElementById("viewTransactions");

tabBtnClients.onclick = function() { switchTab("clients"); };
tabBtnSales.onclick = function() { switchTab("sales"); };
tabBtnInventory.onclick = function() { switchTab("inventory"); };
tabBtnTransactions.onclick = function() { switchTab("transactions"); };

  
function switchTab(t) {
  activeTab = t;
  [tabBtnClients, tabBtnSales, tabBtnInventory, tabBtnTransactions].forEach(function(btn) {
    btn.className = "px-3 py-1.5 rounded-lg text-xs font-bold text-slate-600 hover:text-slate-900 transition-all";
  });

  if (t === "clients") {
    tabBtnClients.className = "px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all shadow-sm bg-white text-indigo-600";
    analyticsPeriodSection.classList.remove("hidden");
    viewClients.classList.remove("hidden");
    viewProducts.classList.add("hidden");
    viewInventory.classList.add("hidden");
    viewTransactions.classList.add("hidden");
    if (allClients.length === 0) fetchClientsData();
  } else if (t === "sales") {
    tabBtnSales.className = "px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all shadow-sm bg-white text-indigo-600";
    analyticsPeriodSection.classList.remove("hidden");
    viewProducts.classList.remove("hidden");
    viewClients.classList.add("hidden");
    viewInventory.classList.add("hidden");
    viewTransactions.classList.add("hidden");
    initSalesCategories();
    if (allGlobalProducts.length === 0) resetAndFetchProducts();
  } else if (t === "inventory") {
    tabBtnInventory.className = "px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all shadow-sm bg-white text-indigo-600";
    analyticsPeriodSection.classList.add("hidden");
    viewInventory.classList.remove("hidden");
    viewClients.classList.add("hidden");
    viewProducts.classList.add("hidden");
    viewTransactions.classList.add("hidden");
    initInventoryView();
  } else if (t === "transactions") {
    tabBtnTransactions.className = "px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all shadow-sm bg-white text-indigo-600";
    analyticsPeriodSection.classList.add("hidden");
    viewClients.classList.add("hidden");
    viewProducts.classList.add("hidden");
    viewInventory.classList.add("hidden");
    viewTransactions.classList.remove("hidden");
    initTransactionsView(); // 👈 Inicia la vista de comprobantes
  }
}

// Inventario
async function initInventoryView() {
  syncThumbSizeButtons();
  syncCreatedColToggleBtn();

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
  } catch(e) { console.error("Error resumen inventario:", e); }
}

async function fetchInventoryCategories() {
  try {
    var res = await fetch("https://api.prod.treinta.co/categories/" + storeId, { headers: getHeaders() });
    if (res.ok) {
      invCategories = await res.json();
      renderCategoryPills();
    }
  } catch(e) { console.error("Error categorías:", e); }
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

  var url = "https://web-api-gateway.treinta.co/manager/" + storeId + "/products/summary-with-taxes?page=" + invCurrentPage + "&limit=50&sort=" + invSortField + "&order=" + invSortOrder;

  
    if (invFilterOnlyNoStock) {
    url += "&quickFilters=lowStock";
  }

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
      document.getElementById("invLoadingText").textContent = invHasMore ? "Desplázate para cargar más artículos..." : "✅ Final del inventario (" + allInventoryProducts.length + " artículos)";
    }
  } finally { invIsLoading = false; }
}

function renderInventoryTable() {
  var body = document.getElementById("inventoryTableBody");
  var filtered = allInventoryProducts;

  document.getElementById("invTableCount").textContent = "Mostrando " + filtered.length + " de " + (invTotalItems || allInventoryProducts.length) + " artículos";

  var inStockCount = 0, noStockCount = 0;
  allInventoryProducts.forEach(function(p) { if ((p.stock || 0) > 0) inStockCount++; else noStockCount++; });
  document.getElementById("invKpiInStockCount").textContent = inStockCount + " con stock";
  document.getElementById("invKpiNoStockCount").textContent = noStockCount + " sin stock";

  if (filtered.length === 0) {
    body.innerHTML = '<tr><td colspan="11" class="text-center py-8 text-slate-400">No se encontraron productos.</td></tr>';
    return;
  }

  body.innerHTML = "";
  var dim = getThumbDimensions();

  filtered.forEach(function(prod, idx) {
    var price = prod.price || 0, cost = prod.cost || 0, stock = prod.stock || 0;
    var profit = price - cost;
    var marginPct = price > 0 ? ((profit / price) * 100).toFixed(1) : 0;
    var totalStockValue = cost * (stock > 0 ? stock : 0);
    var isLoss = profit < 0;

    var tr = document.createElement("tr");
    tr.className = isLoss ? "bg-rose-50/70 border-l-4 border-rose-500" : "hover:bg-slate-50 transition-colors";

    var imgTag = prod.imageUrl
      ? '<img src="' + prod.imageUrl + '" data-preview="' + prod.imageUrl + '" class="' + dim + ' rounded-lg object-contain bg-white border border-slate-200 cursor-zoom-in img-previewable" alt="img">'
      : '<div class="' + dim + ' rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400 text-xs">📦</div>';

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
      ? '<span class="inline-block px-2 py-0.5 rounded bg-slate-100 hover:bg-amber-100 hover:text-amber-800 text-slate-600 font-semibold text-[10px] cursor-pointer transition select-none btn-filter-cat" data-cat-id="' + (prod.storeCategoriesId || '') + '" title="Clic para filtrar por ' + prod.categoryName + '">' + prod.categoryName + '</span>'
      : '<span class="text-slate-300 italic text-[11px]">-</span>';

    
    // Formatear la fecha de creación si la columna está activa
    var createdCell = "";
    if (invShowCreatedCol) {
      var createdDateStr = "-";
      if (prod.createdAt) {
        var d = new Date(prod.createdAt);
        createdDateStr = d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
      }
      createdCell = '<td class="py-2.5 px-3 text-center text-slate-500 font-mono text-[11px] whitespace-nowrap">' + createdDateStr + '</td>';
    }

    tr.innerHTML = '<td class="py-2.5 px-3 text-slate-400 font-mono">' + (idx + 1) + '</td>' +
                   '<td class="py-2.5 px-3">' + imgTag + '</td>' +
                   '<td class="py-2.5 px-3 font-medium text-slate-800">' +
                     '<div>' + (prod.name || "Sin Nombre") + '</div>' +
                     (prod.sku ? '<div class="text-[10px] text-slate-400 font-mono">SKU: ' + prod.sku + '</div>' : '') +
                   '</td>' +
                   '<td class="py-2.5 px-3">' + catBadge + '</td>' +
                   createdCell + // 👈 Celda condicional
                   '<td class="py-2.5 px-3 text-right font-bold text-slate-900">' + currencyFormatter.format(price) + '</td>' +
                   '<td class="py-2.5 px-3 text-right text-slate-600">' + currencyFormatter.format(cost) + '</td>' +
                   '<td class="py-2.5 px-3 text-center">' + stockBadge + '</td>' +
                   '<td class="py-2.5 px-3 text-right">' + profitCell + '</td>' +
                   '<td class="py-2.5 px-3 text-right">' + marginBadge + '</td>' +
                   '<td class="py-2.5 px-3 text-right font-semibold text-slate-700">' + currencyFormatter.format(totalStockValue) + '</td>';

    body.appendChild(tr);
  });
}

document.getElementById("invSearchInput").oninput = function(e) {
  clearTimeout(invSearchTimeout);
  var term = e.target.value.trim();
  invSearchTimeout = setTimeout(function() {
    invSearchTerm = term;
    resetAndFetchInventory();
  }, 400);
};

// Detectores de Scroll Infinito naturales con anticipación de 300px
new IntersectionObserver(function(entries) {
  if (entries[0].isIntersecting && activeTab === "inventory" && invHasMore && !invIsLoading) {
    fetchInventoryPage();
  }
}, { root: null, rootMargin: "300px", threshold: 0 }).observe(document.getElementById("invInfiniteScrollTrigger"));


// Controles y Fechas
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
  } catch(err) { console.error("Error ejecutivo:", err); }
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
  var colors = profitPeriodsCache.map(function(p, idx) { return idx === profitPeriodsCache.length - 1 ? "#059669" : "#a7f3d0"; });

  var ctx = document.getElementById("chartExecProfit").getContext("2d");
  if (chartExecProfitInstance) chartExecProfitInstance.destroy();
  chartExecProfitInstance = new Chart(ctx, {
    type: 'bar',
    data: { labels: labels, datasets: [{ data: profitPeriodsCache.map(function(p){ return p.totalProfit || 0; }), backgroundColor: colors, borderRadius: 3 }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: function(items) {
              var p = profitPeriodsCache[items[0].dataIndex];
              return new Date(p.periodStart).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' });
            },
            label: function(c) { return " Ganancia: " + currencyFormatter.format(c.raw); }
          }
        }
      },
      onClick: function(e, els) { if (els.length) selectMonthFromChart(profitPeriodsCache[els[0].index].periodStart); },
      scales: { x: { grid: { display: false }, ticks: { autoSkip: true, maxTicksLimit: 8, font: { size: 9, weight: 'bold' } } }, y: { display: false } }
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
  var colors = salesPeriodsCache.map(function(p, idx) { return idx === salesPeriodsCache.length - 1 ? "#059669" : "#a7f3d0"; });

  var ctx = document.getElementById("chartExecSales").getContext("2d");
  if (chartExecSalesInstance) chartExecSalesInstance.destroy();
  chartExecSalesInstance = new Chart(ctx, {
    type: 'bar',
    data: { labels: labels, datasets: [{ data: salesPeriodsCache.map(function(p){ return p.salesAmount || p.value || 0; }), backgroundColor: colors, borderRadius: 3 }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: function(items) {
              var p = salesPeriodsCache[items[0].dataIndex];
              return new Date(p.periodStart).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' });
            },
            label: function(c) { return " Ventas: " + currencyFormatter.format(c.raw); }
          }
        }
      },
      onClick: function(e, els) { if (els.length) selectMonthFromChart(salesPeriodsCache[els[0].index].periodStart); },
      scales: { x: { grid: { display: false }, ticks: { autoSkip: true, maxTicksLimit: 8, font: { size: 9, weight: 'bold' } } }, y: { display: false } }
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
  } catch(err) { console.error("Error clientes:", err); }
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
    var amt = item.salesAmount || item.amount || 0, cnt = item.salesCount || 0;
    var pct = tot > 0 ? ((amt / tot) * 100).toFixed(1) : 0;
    var tr = document.createElement("tr");
    tr.className = "hover:bg-slate-50";

    var btn = document.createElement("button");
    btn.className = "px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-semibold rounded text-[11px] border border-indigo-200 transition";
    btn.textContent = "Ver Artículos 📦";
    btn.onclick = function() { openCustomerDetail(item.id, item.name); };

    tr.innerHTML = '<td class="py-3 px-4 text-slate-400">' + (idx + 1) + '</td><td class="py-3 px-4 font-bold">' + item.name + '</td><td class="py-3 px-4 text-right font-bold">' + currencyFormatter.format(amt) + '</td><td class="py-3 px-4 text-center font-bold">' + cnt + '</td><td class="py-3 px-4 text-right">' + currencyFormatter.format(cnt > 0 ? amt / cnt : 0) + '</td><td class="py-3 px-4 text-right"><span class="px-2 py-0.5 rounded bg-slate-100 font-bold">' + pct + '%</span></td><td class="py-3 px-4 text-center"></td>';
    tr.querySelector("td:last-child").appendChild(btn);
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
  
  // Incluye el orden seleccionado (sales, profit o units) y el sentido (asc o desc)
  var u = "https://core-api-gateway.treinta.co/v2/stores/" + storeId + "/stats/products/list?sort=" + salesSortField + "&order=" + salesSortOrder + "&limit=50&" + q;
  
  // Filtro de categoría en ventas si hay una seleccionada
  if (salesSelectedCategoryId) {
    u += "&categoryId%5B%5D=" + encodeURIComponent(salesSelectedCategoryId);
  }
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
    console.error("Error productos ventas:", err);
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

  var dim = getThumbDimensions();

  filtered.forEach(function(prod, idx) {
    var sales = prod.salesAmount || prod.totalSales || 0, units = prod.totalSold || 0, profit = prod.totalProfit || 0;
    var isLoss = profit < 0;

    var imgTag = prod.imageUrl
      ? '<img src="' + prod.imageUrl + '" data-preview="' + prod.imageUrl + '" class="' + dim + ' rounded-lg object-contain bg-white border border-slate-200 cursor-zoom-in img-previewable" alt="img">'
      : '<div class="' + dim + ' rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400 text-xs">📦</div>';

    // Cruce en memoria con el mapa de inventario para obtener la categoría
    var catName = productCategoryMap[prod.productId];
    if (!catName && salesSelectedCategoryId) {
      var matchedCat = invCategories.find(function(c) { return c.id === salesSelectedCategoryId; });
      if (matchedCat) catName = matchedCat.name;
    }

    var catBadge = catName
      ? '<span class="inline-block px-2 py-0.5 rounded bg-slate-100 hover:bg-amber-100 hover:text-amber-800 text-slate-600 font-semibold text-[10px] cursor-pointer transition select-none btn-filter-sales-cat" data-cat-name="' + catName + '" title="Clic para filtrar por ' + catName + '">' + catName + '</span>'
      : '<span class="text-slate-300 italic text-[11px]">-</span>';

    var tr = document.createElement("tr");
    tr.className = isLoss ? "bg-rose-50/70 border-l-4 border-rose-500" : "hover:bg-slate-50";
    tr.innerHTML = '<td class="py-2.5 px-4 text-slate-400">' + (idx + 1) + '</td>' +
                   '<td class="py-2.5 px-4">' + imgTag + '</td>' +
                   '<td class="py-2.5 px-4 font-medium">' + (prod.productName || "Sin Nombre") + '</td>' +
                   '<td class="py-2.5 px-4">' + catBadge + '</td>' +
                   '<td class="py-2.5 px-4 text-center font-bold">' + numberFormatter.format(units) + '</td>' +
                   '<td class="py-2.5 px-4 text-right">' + currencyFormatter.format(units > 0 ? sales / units : 0) + '</td>' +
                   '<td class="py-2.5 px-4 text-right font-bold">' + currencyFormatter.format(sales) + '</td>' +
                   '<td class="py-2.5 px-4 text-right font-bold ' + (isLoss ? 'text-rose-600' : 'text-emerald-600') + '">' + currencyFormatter.format(profit) + '</td>' +
                   '<td class="py-2.5 px-4 text-right"><span class="px-1.5 py-0.5 rounded text-[10px] font-bold ' + (isLoss ? 'bg-rose-100 text-rose-700' : 'bg-emerald-50 text-emerald-700') + '">' + (sales > 0 ? ((profit/sales)*100).toFixed(1) : 0) + '%</span></td>';
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
  } catch(err) { console.error("Error detalle cliente:", err); }
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
    var amt = p.salesAmount || p.totalSales || 0, u = p.totalSold || 0;
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

new IntersectionObserver(function(entries) {
  if (entries[0].isIntersecting && activeTab === "sales" && hasMoreProducts && !isLoadingProducts) {
    fetchProductsPage();
  }
}, { root: null, rootMargin: "300px", threshold: 0 }).observe(document.getElementById("infiniteScrollTrigger"));



function refreshAll() {
  if (activeTab === "inventory") {
    resetAndFetchInventory();
  } else {
    fetchExecutiveSummary();
    if (activeTab === "clients") fetchClientsData();
    else resetAndFetchProducts();
  }
}

// --- PÍLDORAS DE CATEGORÍAS EN VENTAS ---
async function initSalesCategories() {
  ensureProductCategoryMap();
  if (salesCategoriesLoaded) return;
  if (invCategories.length === 0) {
    try {
      var res = await fetch("https://api.prod.treinta.co/categories/" + storeId, { headers: getHeaders() });
      if (res.ok) invCategories = await res.json();
    } catch(e) {}
  }
  renderSalesCategoryPills();
  salesCategoriesLoaded = true;
}

function renderSalesCategoryPills() {
  var container = document.getElementById("salesCategoryPillsContainer");
  container.innerHTML = '<button id="pillSalesCatAll" class="px-3 py-1 rounded-lg font-bold ' + (!salesSelectedCategoryId ? 'bg-amber-400 text-slate-900 shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200') + ' transition">Ver todos</button>';

  document.getElementById("pillSalesCatAll").onclick = function() {
    salesSelectedCategoryId = "";
    renderSalesCategoryPills();
    resetAndFetchProducts();
  };

  invCategories.forEach(function(cat) {
    if (!cat.name) return;
    var btn = document.createElement("button");
    var isActive = salesSelectedCategoryId === cat.id;
    btn.className = "px-3 py-1 rounded-lg font-semibold transition " + (isActive ? "bg-amber-400 text-slate-900 font-bold shadow-sm" : "bg-slate-100 text-slate-600 hover:bg-slate-200");
    btn.textContent = cat.name;
    btn.onclick = function() {
      salesSelectedCategoryId = cat.id;
      renderSalesCategoryPills();
      resetAndFetchProducts();
    };
    container.appendChild(btn);
  });
}

// --- ORDENAMIENTO AL HACER CLIC EN LOS ENCABEZADOS ---
function handleSalesSort(field) {
  if (salesSortField === field) {
    // Alterna entre descendente y ascendente
    salesSortOrder = salesSortOrder === "desc" ? "asc" : "desc";
  } else {
    salesSortField = field;
    salesSortOrder = "desc"; // Por defecto mayor a menor
  }
  updateSortIcons();
  resetAndFetchProducts();
}

function updateSortIcons() {
  var iconMap = { sales: "iconSortSales", profit: "iconSortProfit", units: "iconSortUnits" };
  ["sales", "profit", "units"].forEach(function(f) {
    var iconEl = document.getElementById(iconMap[f]);
    if (f === salesSortField) {
      iconEl.className = "text-indigo-600 font-bold ml-0.5";
      iconEl.textContent = salesSortOrder === "desc" ? "↓" : "↑";
    } else {
      iconEl.className = "text-slate-300 ml-0.5 font-bold";
      iconEl.textContent = "↕";
    }
  });
}

document.getElementById("thSortUnits").onclick = function() { handleSalesSort("units"); };
document.getElementById("thSortSales").onclick = function() { handleSalesSort("sales"); };
document.getElementById("thSortProfit").onclick = function() { handleSalesSort("profit"); };

// --- ORDENAMIENTO AL HACER CLIC EN ENCABEZADOS DE INVENTARIO ---
function handleInvSort(field) {
  if (invSortField === field) {
    invSortOrder = invSortOrder === "desc" ? "asc" : "desc";
  } else {
    invSortField = field;
    invSortOrder = (field === "name") ? "asc" : "desc"; // Alfabético A-Z por defecto, números de mayor a menor
  }
  updateInvSortIcons();
  resetAndFetchInventory();
}

function updateInvSortIcons() {
  var iconMap = { created_at: "iconInvSortCreated", name: "iconInvSortName", price: "iconInvSortPrice", stock: "iconInvSortStock" };
  ["created_at", "name", "price", "stock"].forEach(function(f) {
    var iconEl = document.getElementById(iconMap[f]);
    if (!iconEl) return;
    if (f === invSortField) {
      iconEl.className = "text-indigo-600 font-bold ml-0.5";
      iconEl.textContent = invSortOrder === "desc" ? "↓" : "↑";
    } else {
      iconEl.className = "text-slate-300 ml-0.5 font-bold";
      iconEl.textContent = "↕";
    }
  });
}

document.getElementById("thInvSortCreated").onclick = function() { handleInvSort("created_at"); };
document.getElementById("thInvSortName").onclick = function() { handleInvSort("name"); };
document.getElementById("thInvSortPrice").onclick = function() { handleInvSort("price"); };
document.getElementById("thInvSortStock").onclick = function() { handleInvSort("stock"); };


document.getElementById("btnRefresh").onclick = refreshAll;
document.getElementById("chkOnlyLosses").onchange = function() { renderGlobalProductsTable(allGlobalProducts); };
document.getElementById("prodSearchInput").oninput = function() { renderGlobalProductsTable(allGlobalProducts); };
document.getElementById("searchInput").oninput = function(e) {
  renderClientsTable(allClients.filter(function(i) { return i.name.toLowerCase().includes(e.target.value.toLowerCase()); }));
};

// En la tabla de Inventario:
document.getElementById("inventoryTableBody").addEventListener("click", function(e) {
  var target = e.target.closest(".btn-filter-cat");
  if (target && target.dataset.catId) {
    invSelectedCategoryId = target.dataset.catId;
    invFilterOnlyNoStock = false;
    renderCategoryPills();
    resetAndFetchInventory();
  }
});

// En la tabla de Ventas:
document.getElementById("productsGlobalTableBody").addEventListener("click", function(e) {
  var target = e.target.closest(".btn-filter-sales-cat");
  if (target && target.dataset.catName) {
    var cat = invCategories.find(function(c) {
      return (c.name || "").trim().toLowerCase() === target.dataset.catName.trim().toLowerCase();
    });
    if (cat) {
      salesSelectedCategoryId = cat.id;
      renderSalesCategoryPills();
      resetAndFetchProducts();
    }
  }
});

// ==================== MÓDULO DE TRANSACCIONES / COMPROBANTES ====================
var txPeriodMode = "weekly";
var txAnchorDate = new Date(); // Fecha ancla para navegar
var txCustomStart = new Date();
var txCustomEnd = new Date();
var allTransactions = [];
var txCurrentPage = 1;
var txIsLoading = false;
var txHasMore = true;
var txSearchTerm = "";
var currentTxDetailData = null;

// Elementos del popup
var btnTxDatePickerTrigger = document.getElementById("btnTxDatePickerTrigger");
var txDatePopupModal = document.getElementById("txDatePopupModal");
var txPopupContent = document.getElementById("txPopupContent");
var lblTxCurrentRange = document.getElementById("lblTxCurrentRange");

// Diccionario en memoria: userId ➔ Nombre de Vendedor configurado
var employeesMap = {};
try {
  employeesMap = JSON.parse(localStorage.getItem("t_employees_map") || "{}");
} catch(e) {}

async function ensureEmployeesMap() {
  if (Object.keys(employeesMap).length > 0) return; // Si ya está en caché, no gasta red
  try {
    var res = await fetch("https://core-api-gateway.treinta.co/employees/get-employees/" + storeId + "?onlyEmployees=false", { headers: getHeaders() });
    if (res.ok) {
      var list = await res.json();
      (list || []).forEach(function(item) {
        if (item.employee) {
          if (item.employee.userId) employeesMap[item.employee.userId] = item.employee.name;
          if (item.employee.storeEmployeeRegisterId) employeesMap[item.employee.storeEmployeeRegisterId] = item.employee.name;
        }
      });
      localStorage.setItem("t_employees_map", JSON.stringify(employeesMap));
    }
  } catch(e) {
    console.error("Error al cargar empleados:", e);
  }
}

// Conversión directa a milisegundos de Treinta en zona horaria Argentina (UTC-3)
function toTreintaStartMs(year, month, day) {
  return Date.UTC(year, month - 1, day, 3, 0, 0, 0);
}

function toTreintaEndMs(year, month, day) {
  return Date.UTC(year, month - 1, day + 1, 2, 59, 59, 999);
}

function getTxTimestamps() {
  var y = txAnchorDate.getFullYear();
  var m = txAnchorDate.getMonth();
  var d = txAnchorDate.getDate();
  var startMs, endMs, startObj, endObj;

  if (txPeriodMode === "daily") {
    startMs = toTreintaStartMs(y, m + 1, d);
    endMs = toTreintaEndMs(y, m + 1, d);
    startObj = new Date(y, m, d);
    endObj = new Date(y, m, d);
  } else if (txPeriodMode === "weekly") {
    var dayOfWeek = txAnchorDate.getDay() || 7; // Lunes = 1, Domingo = 7
    var mon = new Date(y, m, d - dayOfWeek + 1);
    var sun = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 6);

    startMs = toTreintaStartMs(mon.getFullYear(), mon.getMonth() + 1, mon.getDate());
    endMs = toTreintaEndMs(sun.getFullYear(), sun.getMonth() + 1, sun.getDate());
    startObj = mon;
    endObj = sun;
  } else if (txPeriodMode === "monthly") {
    var lastDay = new Date(y, m + 1, 0).getDate();
    startMs = toTreintaStartMs(y, m + 1, 1);
    endMs = toTreintaEndMs(y, m + 1, lastDay);
    startObj = new Date(y, m, 1);
    endObj = new Date(y, m, lastDay);
  } else if (txPeriodMode === "yearly") {
    startMs = toTreintaStartMs(y, 1, 1);
    endMs = toTreintaEndMs(y, 12, 31);
    startObj = new Date(y, 0, 1);
    endObj = new Date(y, 11, 31);
  } else if (txPeriodMode === "custom") {
    var sY = txCustomStart.getFullYear(), sM = txCustomStart.getMonth() + 1, sD = txCustomStart.getDate();
    var eY = txCustomEnd.getFullYear(), eM = txCustomEnd.getMonth() + 1, eD = txCustomEnd.getDate();
    startMs = toTreintaStartMs(sY, sM, sD);
    endMs = toTreintaEndMs(eY, eM, eD);
    startObj = new Date(sY, sM - 1, sD);
    endObj = new Date(eY, eM - 1, eD);
  }

  return {
    startMs: startMs,
    endMs: endMs,
    startObj: startObj,
    endObj: endObj
  };
}

function updateTxRangeLabel() {
  var ts = getTxTimestamps();
  var s = ts.startObj;
  var e = ts.endObj;

  if (txPeriodMode === "daily") {
    lblTxCurrentRange.textContent = s.getDate() + " " + s.toLocaleDateString('es-AR', { month: 'short' }).replace('.', '') + " " + s.getFullYear();
  } else if (txPeriodMode === "weekly") {
    lblTxCurrentRange.textContent = s.getDate() + " " + s.toLocaleDateString('es-AR', { month: 'short' }).replace('.', '') + " | " + e.getDate() + " " + e.toLocaleDateString('es-AR', { month: 'short' }).replace('.', '');
  } else if (txPeriodMode === "monthly") {
    lblTxCurrentRange.textContent = s.toLocaleDateString('es-AR', { month: 'short' }).replace('.', '') + " " + s.getFullYear();
  } else if (txPeriodMode === "yearly") {
    lblTxCurrentRange.textContent = s.getFullYear().toString();
  } else if (txPeriodMode === "custom") {
    lblTxCurrentRange.textContent = s.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' }) + " al " + e.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
  }
}

// Renderizado del contenido del popup según el modo
function renderTxPopupUI() {
  txPopupContent.innerHTML = "";
  var y = txAnchorDate.getFullYear();
  var m = txAnchorDate.getMonth();

  if (txPeriodMode === "daily" || txPeriodMode === "weekly") {
    // CALENDARIO MENSUAL CON DÍAS O SEMANAS RESALTADAS
    var header = document.createElement("div");
    header.className = "flex justify-between items-center mb-3 font-bold text-xs text-slate-800";
    header.innerHTML = '<span class="capitalize">' + txAnchorDate.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' }) + '</span>' +
                       '<div class="flex gap-1">' +
                         '<button id="popCalPrevMonth" class="px-2 py-0.5 hover:bg-slate-100 rounded text-slate-500 font-bold">‹</button>' +
                         '<button id="popCalNextMonth" class="px-2 py-0.5 hover:bg-slate-100 rounded text-slate-500 font-bold">›</button>' +
                       '</div>';
    txPopupContent.appendChild(header);

    var grid = document.createElement("div");
    grid.className = "grid grid-cols-7 gap-1 text-center text-xs";
    
    // Encabezados L M M J V S D
    ["L", "M", "M", "J", "V", "S", "D"].forEach(function(dName) {
      grid.innerHTML += '<span class="text-[10px] font-bold text-slate-400 py-1">' + dName + '</span>';
    });

    var firstDayMonth = new Date(y, m, 1);
    var startDayIndex = firstDayMonth.getDay() || 7; // Lunes = 1
    var daysInMonth = new Date(y, m + 1, 0).getDate();

    // Espacios vacíos
    for (var i = 1; i < startDayIndex; i++) {
      grid.innerHTML += '<span></span>';
    }

    var ts = getTxTimestamps();

    for (var dayNum = 1; dayNum <= daysInMonth; dayNum++) {
      (function(dn) {
        var thisDate = new Date(y, m, dn);
        var isSelected = false;

        if (txPeriodMode === "daily") {
          isSelected = thisDate.toDateString() === txAnchorDate.toDateString();
        } else if (txPeriodMode === "weekly") {
          isSelected = thisDate >= ts.startObj && thisDate <= ts.endObj;
        }

        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "py-1.5 rounded-md text-xs font-semibold transition " +
          (isSelected ? "bg-amber-400 text-slate-900 font-bold" : "hover:bg-slate-100 text-slate-700");
        btn.textContent = dn;

        btn.onclick = function() {
          txAnchorDate = thisDate;
          txDatePopupModal.classList.add("hidden");
          updateTxRangeLabel();
          resetAndFetchTransactions();
        };

        grid.appendChild(btn);
      })(dayNum);
    }

    txPopupContent.appendChild(grid);

    document.getElementById("popCalPrevMonth").onclick = function() {
      txAnchorDate = new Date(y, m - 1, 1);
      renderTxPopupUI();
    };
    document.getElementById("popCalNextMonth").onclick = function() {
      txAnchorDate = new Date(y, m + 1, 1);
      renderTxPopupUI();
    };

  } else if (txPeriodMode === "monthly") {
    // CUADRÍCULA DE 12 MESES (CAPTURA 2)
    var header = document.createElement("div");
    header.className = "flex justify-between items-center mb-3 font-bold text-xs text-slate-800";
    header.innerHTML = '<span>' + y + '</span>' +
                       '<div class="flex gap-1">' +
                         '<button id="popMonthPrevYear" class="px-2 py-0.5 hover:bg-slate-100 rounded text-slate-500 font-bold">‹</button>' +
                         '<button id="popMonthNextYear" class="px-2 py-0.5 hover:bg-slate-100 rounded text-slate-500 font-bold">›</button>' +
                       '</div>';
    txPopupContent.appendChild(header);

    var grid = document.createElement("div");
    grid.className = "grid grid-cols-3 gap-2 text-center text-xs";
    var monthNames = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

    monthNames.forEach(function(mName, mIdx) {
      var isCurrent = mIdx === txAnchorDate.getMonth();
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "py-2 rounded-lg font-bold transition " + (isCurrent ? "bg-amber-400 text-slate-900" : "hover:bg-slate-100 text-slate-600");
      btn.textContent = mName;
      btn.onclick = function() {
        txAnchorDate = new Date(y, mIdx, 1);
        txDatePopupModal.classList.add("hidden");
        updateTxRangeLabel();
        resetAndFetchTransactions();
      };
      grid.appendChild(btn);
    });

    txPopupContent.appendChild(grid);

    document.getElementById("popMonthPrevYear").onclick = function() {
      txAnchorDate = new Date(y - 1, m, 1);
      renderTxPopupUI();
    };
    document.getElementById("popMonthNextYear").onclick = function() {
      txAnchorDate = new Date(y + 1, m, 1);
      renderTxPopupUI();
    };

  } else if (txPeriodMode === "yearly") {
    // CUADRÍCULA NUMÉRICA DE AÑOS (CAPTURA 3)
    var grid = document.createElement("div");
    grid.className = "grid grid-cols-4 gap-2 text-center text-xs";
    var startYear = 2020;
    var endYear = 2031;

    for (var yr = startYear; yr <= endYear; yr++) {
      (function(yearNum) {
        var isCurrent = yearNum === txAnchorDate.getFullYear();
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "py-2 rounded-lg font-bold transition " + (isCurrent ? "bg-amber-400 text-slate-900" : "hover:bg-slate-100 text-slate-600");
        btn.textContent = yearNum;
        btn.onclick = function() {
          txAnchorDate = new Date(yearNum, 0, 1);
          txDatePopupModal.classList.add("hidden");
          updateTxRangeLabel();
          resetAndFetchTransactions();
        };
        grid.appendChild(btn);
      })(yr);
    }
    txPopupContent.appendChild(grid);

  } else if (txPeriodMode === "custom") {
    // PERSONALIZADO (formateo local para evitar desfase UTC después de las 21hs ART)
    var formatLocalYMD = function(d) {
      return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2);
    };

    txPopupContent.innerHTML = '<div class="space-y-3 text-xs">' +
      '<p class="font-bold text-slate-700">Rango personalizado</p>' +
      '<div><label class="text-[10px] text-slate-400 block mb-0.5">Desde</label><input type="date" id="popCustomStart" class="w-full border rounded p-1 text-xs"></div>' +
      '<div><label class="text-[10px] text-slate-400 block mb-0.5">Hasta</label><input type="date" id="popCustomEnd" class="w-full border rounded p-1 text-xs"></div>' +
      '<button id="btnPopApplyCustom" class="w-full py-1.5 bg-indigo-600 text-white font-bold rounded-lg shadow-sm">Aplicar</button>' +
    '</div>';

    document.getElementById("popCustomStart").value = formatLocalYMD(txCustomStart);
    document.getElementById("popCustomEnd").value = formatLocalYMD(txCustomEnd);

    document.getElementById("btnPopApplyCustom").onclick = function() {
      var sVal = document.getElementById("popCustomStart").value;
      var eVal = document.getElementById("popCustomEnd").value;
      if (!sVal || !eVal) return;

      var sParts = sVal.split("-").map(Number);
      var eParts = eVal.split("-").map(Number);
      var newStart = new Date(sParts[0], sParts[1] - 1, sParts[2]);
      var newEnd = new Date(eParts[0], eParts[1] - 1, eParts[2]);

      // Si el usuario invierte las fechas, las reordena automáticamente
      if (newStart > newEnd) {
        txCustomStart = newEnd;
        txCustomEnd = newStart;
      } else {
        txCustomStart = newStart;
        txCustomEnd = newEnd;
      }

      txDatePopupModal.classList.add("hidden");
      updateTxRangeLabel();
      resetAndFetchTransactions();
    };
  }
}

// Abrir / Cerrar el Popup
btnTxDatePickerTrigger.onclick = function(e) {
  e.stopPropagation();
  var isHidden = txDatePopupModal.classList.contains("hidden");
  if (isHidden) {
    renderTxPopupUI();
    txDatePopupModal.classList.remove("hidden");
  } else {
    txDatePopupModal.classList.add("hidden");
  }
};

document.addEventListener("click", function(e) {
  if (!txDatePopupModal.contains(e.target) && !btnTxDatePickerTrigger.contains(e.target)) {
    txDatePopupModal.classList.add("hidden");
  }
});

// Botones de Modo (Diario, Semanal, Mensual, Anual, Personalizado)
["daily", "weekly", "monthly", "yearly", "custom"].forEach(function(m) {
  var map = { daily: "btnTxPeriodDaily", weekly: "btnTxPeriodWeekly", monthly: "btnTxPeriodMonthly", yearly: "btnTxPeriodYearly", custom: "btnTxPeriodCustom" };
  document.getElementById(map[m]).onclick = function() {
    txPeriodMode = m;
    ["daily", "weekly", "monthly", "yearly", "custom"].forEach(function(modeKey) {
      var btn = document.getElementById(map[modeKey]);
      if (modeKey === m) {
        btn.className = "px-2.5 py-1 rounded font-bold bg-white text-indigo-600 shadow-sm transition";
      } else {
        btn.className = "px-2.5 py-1 rounded font-semibold text-slate-600 hover:text-slate-900 transition";
      }
    });

    updateTxRangeLabel();
    renderTxPopupUI();
    txDatePopupModal.classList.remove("hidden"); // Abre el calendario inmediatamente
    resetAndFetchTransactions();
  };
});

async function initTransactionsView() {
  ensureEmployeesMap();
  updateTxRangeLabel();
  if (allTransactions.length === 0) {
    resetAndFetchTransactions();
  }
}

function resetAndFetchTransactions() {
  allTransactions = [];
  txCurrentPage = 1;
  txHasMore = true;
  document.getElementById("transactionsTableBody").innerHTML = '<tr><td colspan="6" class="text-center py-8 text-indigo-600 font-medium">Cargando comprobantes...</td></tr>';
  fetchTxBalance();
  fetchTransactionsPage();
}

async function fetchTxBalance() {
  var ts = getTxTimestamps();
  var url = "https://core-api-gateway.treinta.co/balance/" + storeId + "?startDate=" + ts.startMs + "&endDate=" + ts.endMs;
  try {
    var res = await fetch(url, { headers: getHeaders() });
    if (res.ok) {
      var d = await res.json();
      document.getElementById("txKpiBalance").textContent = currencyFormatter.format(d.utility || 0);
      document.getElementById("txKpiSales").textContent = currencyFormatter.format(d.sales || 0);
      document.getElementById("txKpiSpendings").textContent = currencyFormatter.format(d.spendings || 0);
    }
  } catch(e) { console.error("Error balance:", e); }
}

async function fetchTransactionsPage() {
  if (txIsLoading || !txHasMore) return;
  txIsLoading = true;
  document.getElementById("txLoadingText").textContent = "Cargando comprobantes...";

  var ts = getTxTimestamps();
  var url = "https://core-api-gateway.treinta.co/transactions/stores/" + storeId +
    "?startDate=" + ts.startMs +
    "&endDate=" + ts.endMs +
    "&transactionTypeId=1&transactionTypeId=3&transactionTypeId=4&transactionTypeId=14" +
    "&transactionStatusId=1&transactionStatusId=3&transactionStatusId=6" +
    "&page=" + txCurrentPage +
    "&limit=100";

  try {
    var res = await fetch(url, { headers: getHeaders() });
    if (res.ok) {
      var items = await res.json();
      allTransactions = allTransactions.concat(items || []);
      txHasMore = (items || []).length === 100;
      txCurrentPage++;

      renderTransactionsTable();

      if (txHasMore) {
        document.getElementById("txLoadingText").textContent = "Desplázate para cargar más comprobantes...";
      } else {
        document.getElementById("txLoadingText").textContent = "✅ Todos los comprobantes cargados (" + allTransactions.length + ")";
      }
    }
  } catch(e) {
    console.error("Error comprobantes:", e);
    document.getElementById("txLoadingText").textContent = "Error al cargar comprobantes.";
  } finally {
    txIsLoading = false;
  }
}

function renderTransactionsTable() {
  var body = document.getElementById("transactionsTableBody");
  var term = txSearchTerm.toLowerCase();
  
  var filtered = allTransactions.filter(function(tx) {
    var cName = (tx.contactName || "").toLowerCase();
    var cDesc = (tx.description || "").toLowerCase();
    var cNum = (tx.transactionCount || "").toString();
    return cName.includes(term) || cDesc.includes(term) || cNum.includes(term);
  });

  document.getElementById("txTableCount").textContent = "Mostrando " + filtered.length + " de " + allTransactions.length + " comprobantes";

  if (filtered.length === 0) {
    body.innerHTML = '<tr><td colspan="6" class="text-center py-8 text-slate-400">No se encontraron comprobantes para este período o búsqueda.</td></tr>';
    return;
  }

  body.innerHTML = "";
  filtered.forEach(function(tx) {
    var tr = document.createElement("tr");
    // Fila clickeable con efecto hover y el ID de la transacción asociado:
    tr.className = "hover:bg-indigo-50/40 cursor-pointer transition-colors";
    tr.dataset.txId = tx.transactionId || tx.id;
    tr.dataset.rowValue = tx.value || 0; // 👈 Guarda el valor de este abono puntual


    // Formato ultra-compacto 24hs sin preposiciones "de": DD/MM/AAAA HH:mm
    var dateMs = Number(tx.date) || (tx.createdAt ? new Date(tx.createdAt).getTime() : 0);
    var dateFormatted = "-";
    if (dateMs) {
      var d = new Date(dateMs);
      var day = ("0" + d.getDate()).slice(-2);
      var month = ("0" + (d.getMonth() + 1)).slice(-2);
      var year = d.getFullYear();
      var hours = ("0" + d.getHours()).slice(-2);
      var mins = ("0" + d.getMinutes()).slice(-2);
      dateFormatted = day + "/" + month + "/" + year + " " + hours + ":" + mins;
    }

    var clientDisplay = tx.contactName
      ? '<span class="font-bold text-slate-900">' + tx.contactName + '</span>'
      : '<span class="text-slate-400 italic">Consumidor Final</span>';

    var paymentMethod = tx.paymentTypeId === 1 ? "Efectivo" : "Otro";

    tr.innerHTML = '<td class="py-3 px-4 font-mono font-bold text-indigo-600">#' + (tx.transactionCount || tx.id.slice(0, 8)) + '</td>' +
                   '<td class="py-3 px-4 text-slate-500 font-mono text-[11px] whitespace-nowrap">' + dateFormatted + '</td>' +
                   '<td class="py-3 px-4">' + clientDisplay + '</td>' +
                   '<td class="py-3 px-4 text-slate-600">' + (tx.description || "-") + '</td>' +
                   '<td class="py-3 px-4 text-center"><span class="px-2 py-0.5 rounded bg-slate-100 font-semibold text-slate-600 text-[10px]">' + paymentMethod + '</span></td>' +
                   '<td class="py-3 px-4 text-right font-bold text-slate-900 text-sm">' + currencyFormatter.format(tx.value || 0) + '</td>';

    body.appendChild(tr);
  });
}

document.getElementById("txSearchInput").oninput = function(e) {
  txSearchTerm = e.target.value.trim();
  renderTransactionsTable();
};

new IntersectionObserver(function(entries) {
  if (entries[0].isIntersecting && activeTab === "transactions" && txHasMore && !txIsLoading) {
    fetchTransactionsPage();
  }
}, { root: null, rootMargin: "300px", threshold: 0 }).observe(document.getElementById("txInfiniteScrollTrigger"));


// ==================== DETALLE DE COMPROBANTE EN MODAL ====================
var modalTxDetail = document.getElementById("modalTxDetail");
var modalTxDetailCard = document.getElementById("modalTxDetailCard");
var modalTxProductsList = document.getElementById("modalTxProductsList");

// Clic en cualquier fila de la tabla de comprobantes (delegación de eventos)
document.getElementById("transactionsTableBody").addEventListener("click", function(e) {
  var row = e.target.closest("tr");
  if (row && row.dataset.txId) {
    openTransactionDetail(row.dataset.txId, Number(row.dataset.rowValue) || 0);
  }
});


async function openTransactionDetail(txId, rowValue) {
  document.body.classList.add("overflow-hidden");
  modalTxDetail.classList.remove("hidden");

  document.getElementById("modalTxTitle").textContent = "Consultando comprobante...";
  document.getElementById("modalTxSubtitle").textContent = "Cargando datos...";
  modalTxProductsList.innerHTML = '<p class="text-center py-8 text-indigo-600 text-xs font-semibold"><span class="inline-block animate-spin mr-1.5">🔄</span> Cargando detalle del pedido...</p>';

  try {
    // Consultamos la venta y el historial de pagos en paralelo
    var urlTx = "https://core-api-gateway.treinta.co/transactions/" + txId;
    var urlPay = "https://api.prod.treinta.co/payment/by-transaction/" + txId;

    var [resTx, resPay] = await Promise.all([
      fetch(urlTx, { headers: getHeaders() }),
      fetch(urlPay, { headers: getHeaders() }).catch(function() { return null; })
    ]);

    if (!resTx.ok) throw new Error("Error " + resTx.status);

    var data = await resTx.json();
    var payments = (resPay && resPay.ok) ? await resPay.json() : [];

    currentTxDetailData = data;
    currentTxDetailData._payments = payments;
    currentTxDetailData._rowValue = rowValue;

    var tx = data.transaction || {};
    var totals = data.totals || {};
    var products = data.products || [];
    var contact = tx.contact || {};
    var user = tx.user || {};

    // 1. Títulos
    var descText = tx.description || "Comprobante de venta";
    var titleEl = document.getElementById("modalTxTitle");
    titleEl.textContent = descText;
    titleEl.title = descText;
    document.getElementById("modalTxSubtitle").textContent = "Transacción #" + (tx.transactionCount || tx.id.slice(0, 8));

    // 2. Cálculo Contable Exacto
    var saleTotal = totals.total || tx.value || 0;
    var totalPaid = 0;

    if (payments && payments.length > 0) {
      totalPaid = payments.reduce(function(acc, p) { return acc + (p.value || 0); }, 0);
    } else {
      totalPaid = rowValue || saleTotal;
    }

    var balanceRemaining = Math.max(0, saleTotal - totalPaid);
    var isPaid = balanceRemaining <= 1; // Tolerancia de redondeo

    currentTxDetailData._isPaid = isPaid;
    currentTxDetailData._totalPaid = totalPaid;
    currentTxDetailData._balanceRemaining = balanceRemaining;

    // Actualizar Estado Visual
    var statusBadge = document.getElementById("modalTxStatusBadge");
    if (isPaid) {
      statusBadge.className = "px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800";
      statusBadge.textContent = "Pagada";
    } else if (totalPaid > 0) {
      statusBadge.className = "px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800";
      statusBadge.textContent = "Pago Parcial (" + ((totalPaid / saleTotal) * 100).toFixed(0) + "%)";
    } else {
      statusBadge.className = "px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-100 text-rose-800";
      statusBadge.textContent = "Pendiente";
    }

    // Montos Financieros
    document.getElementById("modalTxMainAmount").textContent = currencyFormatter.format(rowValue || totalPaid);
    document.getElementById("modalTxTotalSale").textContent = currencyFormatter.format(saleTotal);
    document.getElementById("modalTxTotalPaid").textContent = currencyFormatter.format(totalPaid);
    document.getElementById("modalTxBalanceDue").textContent = currencyFormatter.format(balanceRemaining);
    document.getElementById("modalTxProfit").textContent = currencyFormatter.format(totals.profit || 0);

    // Descuento
    var discVal = totals.totalDiscount || 0;
    var discRow = document.getElementById("modalTxDiscountRow");
    if (discVal > 0) {
      discRow.classList.remove("hidden");
      document.getElementById("modalTxDiscountVal").textContent = currencyFormatter.format(discVal);
    } else {
      discRow.classList.add("hidden");
    }

    // Metadatos
    document.getElementById("modalTxClient").textContent = contact.name || "Consumidor Final";
    var empName = employeesMap[tx.userId] || employeesMap[user.id] || "";
    if (!empName && (user.firstName || user.lastName)) {
      empName = (user.firstName + " " + (user.lastName || "")).trim();
    }
    document.getElementById("modalTxUser").textContent = empName || "Vendedor";
    document.getElementById("modalTxPayment").textContent = tx.paymentTypeId === 1 ? "Efectivo" : (tx.paymentTypeId === 6 ? "Deuda / Cta. Cte." : "Otro");

    // Fecha
    var dMs = Number(tx.date) || (tx.createdAt ? new Date(tx.createdAt).getTime() : 0);
    var dStr = "-";
    if (dMs) {
      var dObj = new Date(dMs);
      dStr = ("0" + dObj.getDate()).slice(-2) + "/" + ("0" + (dObj.getMonth() + 1)).slice(-2) + "/" + dObj.getFullYear() + " " +
             ("0" + dObj.getHours()).slice(-2) + ":" + ("0" + dObj.getMinutes()).slice(-2);
    }
    document.getElementById("modalTxDateTime").textContent = dStr;

    // 3. Listado de Artículos
    document.getElementById("modalTxProdCount").textContent = products.length + " artículos";

    if (products.length === 0) {
      modalTxProductsList.innerHTML = '<p class="text-center py-6 text-slate-400 text-xs">Sin artículos registrados.</p>';
      return;
    }

    var htmlProds = "";
    products.forEach(function(p) {
      var cant = p.amount || 1;
      var pUnit = p.price || 0;
      var pTotal = cant * pUnit;

      var img = p.imageUrl
        ? '<img src="' + p.imageUrl + '" class="w-10 h-10 rounded-lg object-contain bg-white border border-slate-200" alt="img">'
        : '<div class="w-10 h-10 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400 text-xs">📦</div>';

      htmlProds += '<div class="p-3 flex items-center justify-between gap-3 hover:bg-slate-50 transition">' +
                     '<div class="flex items-center gap-3 min-w-0">' +
                       img +
                       '<div class="min-w-0">' +
                         '<p class="text-xs font-bold text-slate-800 truncate">' + (p.name || "Sin Nombre") + '</p>' +
                         '<p class="text-[11px] text-slate-500">' + cant + ' Unidades · <span class="font-mono">' + currencyFormatter.format(pUnit) + ' x und</span></p>' +
                       '</div>' +
                     '</div>' +
                     '<p class="font-extrabold text-xs text-slate-900 whitespace-nowrap">' + currencyFormatter.format(pTotal) + '</p>' +
                   '</div>';
    });

    modalTxProductsList.innerHTML = htmlProds;

  } catch (err) {
    console.error("Error al obtener transacción:", err);
    modalTxProductsList.innerHTML = '<p class="text-center py-6 text-rose-500 text-xs font-bold">Error al cargar detalle del pedido.</p>';
  }
}

function closeTxDetailModal() {
  modalTxDetail.classList.add("hidden");
  document.body.classList.remove("overflow-hidden");
}

document.getElementById("btnCloseTxDetail").onclick = closeTxDetailModal;
document.getElementById("btnCloseTxDetailFooter").onclick = closeTxDetailModal;
modalTxDetail.onclick = function(e) {
  if (!modalTxDetailCard.contains(e.target)) closeTxDetailModal();
};

// Cierre con Esc integrado
document.addEventListener("keydown", function(e) {
  if (e.key === "Escape" || e.keyCode === 27) {
    closeTxDetailModal();
  }
});

// ==================== MOTOR DE IMPRESIÓN DESACOPLADO ====================
function escapeHtml(str) {
  return String(str == null ? "" : str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildProductNode(doc, isFull, prod, index) {
  var cant = prod.amount || 1;
  var price = prod.price || 0;
  var lineTot = cant * price;
  var safeName = escapeHtml(prod.name || "Artículo");

  if (isFull) {
    var tr = doc.createElement("tr");
    tr.innerHTML =
      '<td style="text-align: center; color: #64748b;">' + (index + 1) + '</td>' +
      '<td style="font-weight: bold; color: #1e293b;">' + safeName + '</td>' +
      '<td style="text-align: center; font-weight: bold;">' + cant + '</td>' +
      '<td style="text-align: right;">' + currencyFormatter.format(price) + '</td>' +
      '<td style="text-align: right; font-weight: bold;">' + currencyFormatter.format(lineTot) + '</td>';
    return tr;
  }

  var row = doc.createElement("div");
  row.className = "half-item-row";
  row.innerHTML =
    '<div class="half-item-top">' +
      '<span class="half-item-name">' + safeName + '</span>' +
      '<span class="half-item-total">' + currencyFormatter.format(lineTot) + '</span>' +
    '</div>' +
    '<div class="half-item-sub">' + cant + ' Unid. × ' + currencyFormatter.format(price) + '</div>';
  return row;
}

function paginateAndRenderReceipt(doc, isFull, products) {
  var sheetsRoot = doc.getElementById("sheetsRoot");
  var prefix = isFull ? "tplFull" : "tplHalf";

  var tplHeader = doc.getElementById(prefix + "Header");
  var tplContHeader = doc.getElementById(prefix + "ContHeader");
  var tplItemsWrap = doc.getElementById(isFull ? "tplFullTableWrap" : "tplHalfItemsWrap");
  var tplFooter = doc.getElementById(prefix + "Footer");

  // Escenario de medición invisible con el ancho útil exacto de la página
  var measureStage = doc.createElement("div");
  measureStage.className = "measure-stage";
  measureStage.style.cssText = "position: absolute; left: -9999px; top: 0; visibility: hidden;";
  doc.body.appendChild(measureStage);

  // Medir alto máximo útil en px usando la regla CSS en mm
  var ruler = doc.createElement("div");
  ruler.className = "measure-ruler";
  measureStage.appendChild(ruler);
  var maxPageHeight = ruler.getBoundingClientRect().height - 8; // 8px de holgura
  measureStage.removeChild(ruler);

  function measureNode(node) {
    measureStage.appendChild(node);
    var h = node.getBoundingClientRect().height;
    measureStage.removeChild(node);
    return h;
  }

  // Medimos cabeceras con el badge visible para contemplar su espacio si hubiera > 1 pág
  var headerNode = tplHeader.content.firstElementChild.cloneNode(true);
  var badgeH1 = headerNode.querySelector(".page-indicator");
  if (badgeH1) { badgeH1.classList.remove("hidden"); badgeH1.textContent = "Pág. 1 de 9"; }
  var hHeaderFull = measureNode(headerNode);

  var contHeaderNode = tplContHeader.content.firstElementChild.cloneNode(true);
  var badgeH2 = contHeaderNode.querySelector(".page-indicator");
  if (badgeH2) { badgeH2.classList.remove("hidden"); badgeH2.textContent = "Pág. 2 de 9"; }
  var hHeaderCont = measureNode(contHeaderNode);

  var wrapProbe = tplItemsWrap.content.firstElementChild.cloneNode(true);
  var hItemsHead = measureNode(wrapProbe);

  var footerProbe = tplFooter.content.firstElementChild.cloneNode(true);
  var hFooter = measureNode(footerProbe);

  // Medimos cada fila de producto en su contenedor real para capturar saltos de línea
  var rowsWrap = tplItemsWrap.content.firstElementChild.cloneNode(true);
  var rowsTarget = rowsWrap.querySelector(".items-target");
  var rowNodes = products.map(function(prod, idx) {
    var node = buildProductNode(doc, isFull, prod, idx);
    rowsTarget.appendChild(node);
    return node;
  });
  measureStage.appendChild(rowsWrap);
  var rowHeights = rowNodes.map(function(node) {
    return node.getBoundingClientRect().height;
  });
  measureStage.removeChild(rowsWrap);

  // Reparto greedy en páginas
  var pages = [];
  var currentItems = [];
  var currentUsed = hHeaderFull + hItemsHead;

  for (var i = 0; i < products.length; i++) {
    var hRow = rowHeights[i];
    if (currentUsed + hRow > maxPageHeight && currentItems.length > 0) {
      pages.push({ items: currentItems, usedHeight: currentUsed });
      currentItems = [];
      currentUsed = hHeaderCont + hItemsHead;
    }
    currentItems.push(i);
    currentUsed += hRow;
  }

  if (currentItems.length > 0 || pages.length === 0) {
    pages.push({ items: currentItems, usedHeight: currentUsed });
  }

  // Validar que el footer entre en la última página; si no entra, mover últimos ítems
  var footerReserve = hFooter + 10;
  var lastPage = pages[pages.length - 1];
  if (lastPage.usedHeight + footerReserve > maxPageHeight) {
    var movedItems = [];
    while (lastPage.items.length > 1 && lastPage.usedHeight + footerReserve > maxPageHeight) {
      var poppedIdx = lastPage.items.pop();
      lastPage.usedHeight -= rowHeights[poppedIdx];
      movedItems.unshift(poppedIdx);
    }

    if (movedItems.length > 0) {
      var nextUsed = hHeaderCont + hItemsHead + movedItems.reduce(function(acc, idx) {
        return acc + rowHeights[idx];
      }, 0);
      pages.push({ items: movedItems, usedHeight: nextUsed });
    } else {
      // Caso extremo: 1 solo ítem gigante + footer exceden la hoja -> hoja final para totales
      pages.push({ items: [], usedHeight: hHeaderCont });
    }
  }

  doc.body.removeChild(measureStage);

  // Renderizado final de cada hoja
  var totalPages = pages.length;
  pages.forEach(function(pageData, pIdx) {
    var sheet = doc.createElement("div");
    sheet.className = "sheet";

    var sheetBody = doc.createElement("div");
    sheetBody.className = "sheet-body";

    var hdr = (pIdx === 0 ? tplHeader : tplContHeader).content.firstElementChild.cloneNode(true);
    if (totalPages > 1) {
      var badge = hdr.querySelector(".page-indicator");
      if (badge) {
        badge.textContent = "Pág. " + (pIdx + 1) + " de " + totalPages;
        badge.classList.remove("hidden");
      }
    }
    sheetBody.appendChild(hdr);

    if (pageData.items.length > 0) {
      var itemsWrap = tplItemsWrap.content.firstElementChild.cloneNode(true);
      var target = itemsWrap.querySelector(".items-target");
      pageData.items.forEach(function(prodIdx) {
        target.appendChild(buildProductNode(doc, isFull, products[prodIdx], prodIdx));
      });
      sheetBody.appendChild(itemsWrap);
    }

    var sheetFooter = doc.createElement("div");
    sheetFooter.className = "sheet-footer";

    if (pIdx === totalPages - 1) {
      sheetFooter.appendChild(tplFooter.content.firstElementChild.cloneNode(true));
    } else {
      var notice = doc.createElement("div");
      notice.className = "cont-notice";
      notice.textContent = "Continúa en página " + (pIdx + 2) + " de " + totalPages + " →";
      sheetFooter.appendChild(notice);
    }

    sheet.appendChild(sheetBody);
    sheet.appendChild(sheetFooter);
    sheetsRoot.appendChild(sheet);
  });
}

async function printReceipt(layoutType) {
  if (!currentTxDetailData) return;

  // Abrir ventana top-level ANTES del await para preservar el gesto de usuario y que Chrome respete @page 105x297mm
  var printWin = window.open("", "_blank");
  if (printWin) {
    printWin.document.open();
    printWin.document.write("<!DOCTYPE html><html><body style='font-family:sans-serif;padding:20px;color:#475569;'>Generando comprobante...</body></html>");
    printWin.document.close();
  }

  var isFull = layoutType === "a4-full";
  var data = currentTxDetailData;
  var tx = data.transaction || {};
  var totals = data.totals || {};
  var products = data.products || [];
  var contact = tx.contact || {};
  var user = tx.user || {};

  var clientName = escapeHtml(contact.name || "Consumidor Final");
  var txNumber = escapeHtml(tx.transactionCount || tx.id.slice(0, 8));
  var rawEmpName = employeesMap[tx.userId] || employeesMap[user.id] || "";
  if (!rawEmpName && (user.firstName || user.lastName)) {
    rawEmpName = (user.firstName + " " + (user.lastName || "")).trim();
  }
  var empName = escapeHtml(rawEmpName || "Vendedor Millenial");
  var logoUrl = "https://arielfmdp.github.io/treinta-dashboard/LOGO.png";

  var dMs = Number(tx.date) || (tx.createdAt ? new Date(tx.createdAt).getTime() : Date.now());
  var dObj = new Date(dMs);
  var dateStr = ("0" + dObj.getDate()).slice(-2) + "/" + ("0" + (dObj.getMonth() + 1)).slice(-2) + "/" + dObj.getFullYear() + " " +
                ("0" + dObj.getHours()).slice(-2) + ":" + ("0" + dObj.getMinutes()).slice(-2);

  var subtotalVal = currencyFormatter.format(totals.subtotal || totals.total || tx.value || 0);
  var discountNum = totals.totalDiscount || 0;
  var totalVal = currencyFormatter.format(totals.total || tx.value || 0);

  var totalPaidNum = data._totalPaid !== undefined ? data._totalPaid : (totals.total || tx.value || 0);
  var totalPaidVal = currencyFormatter.format(totalPaidNum);

  var isPaid = data._isPaid !== undefined ? data._isPaid : true;
  var statusLabel = isPaid ? "Pagada" : "Pendiente";
  var balanceDue = data._balanceRemaining !== undefined ? data._balanceRemaining : 0;

  var discountValStr = discountNum > 0 ? ("-" + currencyFormatter.format(discountNum)) : "$ 0";
  var balanceDueStr = currencyFormatter.format(balanceDue);
  var balanceDueStyle = balanceDue > 1 ? "color: #e11d48; font-weight: 900;" : "color: #059669;";

  var saldoFilaHalf = balanceDue > 1
    ? '<div style="display: flex; justify-content: space-between; color: #e11d48; font-weight: bold; margin-top: 2px;"><span>Saldo Pendiente:</span><span>' + currencyFormatter.format(balanceDue) + '</span></div>'
    : '<div style="display: flex; justify-content: space-between; color: #059669; margin-top: 2px;"><span>Saldo Pendiente:</span><span>$ 0</span></div>';

  var descBlockHalf = discountNum > 0
    ? '<div style="display: flex; justify-content: space-between; color: #e11d48; margin-bottom: 2px;"><span>Descuento:</span><span>-' + currencyFormatter.format(discountNum) + '</span></div>'
    : '';

  var pageRuleCss = isFull
    ? "@page { size: A4 portrait; margin: 12mm 15mm; }"
    : "@page { size: 105mm 297mm; margin: 7mm 6mm; }";

  try {
    var tRes = await fetch("https://arielfmdp.github.io/treinta-dashboard/comprobante.html?v=" + Date.now());
    if (!tRes.ok) throw new Error("No se pudo cargar comprobante.html");
    var html = await tRes.text();

    html = html
      .replace("{{PAGE_RULE_CSS}}", pageRuleCss)
      .replace("{{LAYOUT_CLASS}}", isFull ? "layout-full" : "layout-half")
      .replace(/{{LOGO_URL}}/g, logoUrl)
      .replace(/{{TX_NUMBER}}/g, txNumber)
      .replace(/{{CLIENTE}}/g, clientName)
      .replace(/{{FECHA_HORA}}/g, dateStr)
      .replace(/{{VENDEDOR}}/g, empName)
      .replace(/{{MEDIO_PAGO}}/g, tx.paymentTypeId === 1 ? "Efectivo" : (tx.paymentTypeId === 6 ? "Deuda / Cta. Cte." : "Otro"))
      .replace(/{{ESTADO_LABEL}}/g, statusLabel)
      .replace(/{{SUBTOTAL}}/g, subtotalVal)
      .replace(/{{DESCUENTO_VAL}}/g, discountValStr)
      .replace("{{DESCUENTO_BLOQUE_HALF}}", descBlockHalf)
      .replace(/{{TOTAL}}/g, totalVal)
      .replace(/{{TOTAL_ABONADO}}/g, totalPaidVal)
      .replace("{{SALDO_PENDIENTE_VAL}}", balanceDueStr)
      .replace("{{ESTILO_PENDIENTE}}", balanceDueStyle)
      .replace("{{SALDO_PENDIENTE_FILA_HALF}}", saldoFilaHalf)
      .replace(/{{TOTAL_ITEMS}}/g, products.length);

    var targetWin = null;
    var pFrame = null;

    if (printWin && !printWin.closed) {
      targetWin = printWin;
    } else {
      // Fallback a iframe si los popups están bloqueados
      pFrame = document.createElement("iframe");
      pFrame.style.position = "fixed";
      pFrame.style.top = "-9999px";
      pFrame.style.left = "-9999px";
      pFrame.style.width = isFull ? "210mm" : "105mm";
      pFrame.style.height = "297mm";
      pFrame.style.border = "none";
      document.body.appendChild(pFrame);
      targetWin = pFrame.contentWindow;
    }

    var pDoc = targetWin.document;
    pDoc.open();
    pDoc.write(html);
    pDoc.close();

    // Esperar a que apliquen estilos antes de medir y paginar
    await new Promise(function(resolve) { setTimeout(resolve, 60); });
    paginateAndRenderReceipt(pDoc, isFull, products);

    var imgs = Array.prototype.slice.call(pDoc.querySelectorAll("#sheetsRoot img"));
    await Promise.all(imgs.map(function(img) {
      if (img.complete) return Promise.resolve();
      return new Promise(function(resolve) {
        img.onload = resolve;
        img.onerror = resolve;
      });
    }));

    if (printWin && !printWin.closed) {
      printWin.onafterprint = function() { printWin.close(); };
    }

    setTimeout(function() {
      targetWin.focus();
      targetWin.print();
      if (pFrame) {
        setTimeout(function() { pFrame.remove(); }, 1500);
      }
    }, 100);

  } catch (err) {
    if (printWin && !printWin.closed) printWin.close();
    alert("Error al generar comprobante: " + err.message);
  }
}

document.getElementById("btnPrintA4Full").onclick = function() { printReceipt("a4-full"); };
document.getElementById("btnPrintA4Half").onclick = function() { printReceipt("a4-half"); };


// Activar delegación del hover de zoom en ambas tablas
attachHoverPreviewEvents("productsGlobalTableBody");
attachHoverPreviewEvents("inventoryTableBody");

syncThumbSizeButtons();
initDateInputs();
refreshAll();