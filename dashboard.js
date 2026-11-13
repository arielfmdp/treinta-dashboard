(function () {
  if (document.getElementById("treinta-dashboard-overlay")) {
    document.getElementById("treinta-dashboard-overlay").remove();
  }

  let accessToken = "";
  let refreshToken = "";
  let storeId = localStorage.getItem("STORE_ID") || "205d87a4-7a4a-5a33-88c4-6835353f00a1";

  try {
    const cookieMatch = document.cookie.match(/USER_TOKEN=([^;]+)/);
    if (cookieMatch) {
      const parsed = JSON.parse(decodeURIComponent(cookieMatch[1]));
      accessToken = parsed.accessToken || "";
      refreshToken = parsed.refreshToken || "";
    }
  } catch (e) {
    console.error("Error leyendo USER_TOKEN:", e);
  }

  if (!accessToken) {
    alert("⚠️ No se detectó sesión activa en Treinta. Inicia sesión en web.treinta.co primero.");
    return;
  }

  const iframe = document.createElement("iframe");
  iframe.id = "treinta-dashboard-overlay";
  iframe.style.position = "fixed";
  iframe.style.top = "0";
  iframe.style.left = "0";
  iframe.style.width = "100vw";
  iframe.style.height = "100vh";
  iframe.style.zIndex = "999999999";
  iframe.style.border = "none";
  iframe.style.backgroundColor = "#f1f5f9";
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow.document;
  doc.open();
  doc.write(`
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Dashboard Pro</title>
  <script src="https://cdn.tailwindcss.com"><\/script>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"><\/script>
</head>
<body class="bg-slate-100 text-slate-800 font-sans min-h-screen">

  <script>
    window.onerror = function(msg, url, line) {
      alert("⚠️ Error en Dashboard: " + msg + " (Línea: " + line + ")");
      return false;
    };
  <\/script>

  <!-- BARRA DE NAVEGACIÓN -->
  <header class="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-sm">
    <div class="max-w-7xl mx-auto px-4 py-3 flex justify-between items-center gap-4">
      <div class="flex items-center gap-3">
        <div class="bg-indigo-600 text-white p-2 rounded-xl font-bold text-lg shadow-md">📊</div>
        <div>
          <h1 class="text-base sm:text-lg font-bold text-slate-900 leading-tight">Analítica de Negocio Pro</h1>
          <p class="text-xs text-emerald-600 font-semibold">● Sesión Conectada en Vivo</p>
        </div>
      </div>

      <nav class="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
        <button id="tabBtnClients" class="px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all shadow-sm bg-white text-indigo-600">👥 Clientes</button>
        <button id="tabBtnProducts" class="px-3.5 py-1.5 rounded-lg text-xs font-bold text-slate-600 hover:text-slate-900 transition-all">📦 Productos</button>
      </nav>

      <div class="flex items-center gap-2">
        <button id="btnRefresh" class="text-xs font-semibold px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg shadow-sm transition flex items-center gap-1.5">
          <span id="refreshIcon">🔄</span> Actualizar
        </button>
        <button id="btnCloseDashboard" class="text-xs font-bold px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg border border-rose-200 transition">
          ✕ Volver a Treinta
        </button>
      </div>
    </div>
  </header>

  <main class="max-w-7xl mx-auto px-4 py-6 space-y-6">

    <!-- FILTROS DE PERÍODO -->
    <section class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3">
      <div class="flex flex-wrap items-center justify-between gap-4">
        
        <div class="flex items-center gap-3">
          <span class="text-xs font-bold uppercase tracking-wider text-slate-500">Modo:</span>
          <div class="inline-flex bg-slate-100 rounded-lg p-0.5 border border-slate-200 text-xs font-semibold">
            <button id="modeMonthlyBtn" class="px-3 py-1 rounded-md bg-white text-indigo-600 shadow-sm font-bold transition">Mensual</button>
            <button id="modeCustomBtn" class="px-3 py-1 rounded-md text-slate-600 hover:text-slate-900 transition">Rango Personalizado</button>
          </div>
        </div>

        <!-- MODO MENSUAL -->
        <div id="monthlyControls" class="flex flex-wrap items-center gap-2">
          <div class="relative inline-flex items-center bg-slate-100 rounded-lg border border-slate-200 p-0.5">
            <button id="btnPrevMonthStep" class="px-2.5 py-1 text-xs font-bold text-slate-600 hover:bg-white rounded transition">◀</button>
            <button id="btnMonthDropdownToggle" class="px-2.5 py-1 text-xs font-bold text-slate-800 hover:bg-white rounded transition flex items-center gap-1 capitalize min-w-[130px] justify-center">
              <span id="lblCurrentPeriod">Cargando...</span>
              <span class="text-[9px] text-slate-400">▼</span>
            </button>
            <button id="btnNextMonthStep" class="px-2.5 py-1 text-xs font-bold text-slate-600 hover:bg-white rounded transition disabled:opacity-30">▶</button>
            <div id="monthDropdownMenu" class="hidden absolute top-full left-0 mt-1.5 w-64 bg-white rounded-xl shadow-xl border border-slate-200 p-2 z-50">
              <div class="text-[10px] font-bold uppercase text-slate-400 px-2 py-1 mb-1 border-b">Saltar a un mes:</div>
              <div id="monthDropdownList" class="grid grid-cols-2 gap-1 max-h-56 overflow-y-auto"></div>
            </div>
          </div>
          <button id="btnCurrentMonth" class="px-3 py-1.5 rounded-lg text-xs font-semibold border transition">📍 Mes Actual</button>
        </div>

		<!-- MODO RANGO PERSONALIZADO CON BOTONES RÁPIDOS -->
        <div id="customControls" class="hidden flex flex-wrap items-center gap-2 text-xs">
          <div class="flex items-center gap-1">
            <label for="customStartDate" class="text-slate-500 font-medium">Desde:</label>
            <input type="date" id="customStartDate" class="border border-slate-300 rounded-lg px-2 py-1 text-xs text-slate-700">
          </div>
          <div class="flex items-center gap-1">
            <label for="customEndDate" class="text-slate-500 font-medium">Hasta:</label>
            <input type="date" id="customEndDate" class="border border-slate-300 rounded-lg px-2 py-1 text-xs text-slate-700">
          </div>
          <button id="btnApplyCustomRange" class="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg transition shadow-sm">
            Filtrar
          </button>

          <!-- Botones de Rango Rápido -->
          <div class="inline-flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg border border-slate-200">
            <button id="btnPreset3M" type="button" class="px-2 py-1 bg-white hover:bg-slate-50 text-slate-700 font-semibold rounded text-[11px] border border-slate-200 transition">Últimos 3M</button>
            <button id="btnPreset6M" type="button" class="px-2 py-1 bg-white hover:bg-slate-50 text-slate-700 font-semibold rounded text-[11px] border border-slate-200 transition">Últimos 6M</button>
            <button id="btnPresetYTD" type="button" class="px-2 py-1 bg-white hover:bg-slate-50 text-slate-700 font-semibold rounded text-[11px] border border-slate-200 transition">Este Año (YTD)</button>
          </div>
        </div>

      </div>
    </section>

    <!-- SECCIÓN EJECUTIVA -->
    <section class="grid grid-cols-1 lg:grid-cols-2 gap-5">
      <div class="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex flex-col justify-between">
        <div>
          <h3 class="text-xs font-bold uppercase tracking-wider text-slate-500">Tu ganancia</h3>
          <div class="flex items-center gap-2 mt-1">
            <span class="text-amber-500 text-xl font-bold">🪙</span>
            <span id="execProfitValue" class="text-2xl sm:text-3xl font-extrabold text-slate-900">$ 0</span>
          </div>
          <div class="mt-2">
            <span id="execProfitTrend" class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">↑ +0% vs anterior</span>
          </div>
        </div>
        <div class="my-4 h-24 w-full cursor-pointer relative"><canvas id="chartExecProfit"></canvas></div>
        <div class="pt-3 border-t border-slate-100 grid grid-cols-3 text-xs">
          <div><p class="text-slate-400 font-medium text-[11px]">Vendiste</p><p id="execProfitVendiste" class="font-extrabold text-slate-800">$ 0</p></div>
          <div><p class="text-slate-400 font-medium text-[11px]">Costo</p><p id="execProfitCosto" class="font-extrabold text-slate-800">$ 0</p></div>
          <div class="text-right"><p class="text-slate-400 font-medium text-[11px]">Margen</p><p id="execProfitMargen" class="font-extrabold text-slate-800">0%</p></div>
        </div>
      </div>

      <div class="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex flex-col justify-between">
        <div>
          <h3 class="text-xs font-bold uppercase tracking-wider text-slate-500">Tus ventas</h3>
          <div class="mt-1"><span id="execSalesValue" class="text-2xl sm:text-3xl font-extrabold text-slate-900">$ 0</span></div>
          <div class="mt-2">
            <span id="execSalesTrend" class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">↑ +0% vs anterior</span>
          </div>
        </div>
        <div class="my-4 h-24 w-full cursor-pointer relative"><canvas id="chartExecSales"></canvas></div>
        <div class="pt-3 border-t border-slate-100 flex justify-between items-end text-xs">
          <div><p class="text-slate-400 font-medium text-[11px]">Unidades vendidas</p><p id="execSalesTotalUnits" class="font-extrabold text-emerald-600 text-sm">0</p></div>
          <div class="text-right"><p class="text-slate-400 font-medium text-[11px]">Promedio de venta</p><p id="execSalesAvgTicket" class="font-extrabold text-slate-800 text-sm">$ 0</p></div>
        </div>
      </div>
    </section>

    <!-- VISTA CLIENTES -->
    <div id="viewClients" class="space-y-6">
      <section class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div class="bg-white p-5 rounded-xl border border-slate-200 shadow-sm"><p class="text-xs uppercase text-slate-400 font-bold">Total Facturado</p><h3 id="kpiTotalSales" class="text-2xl font-extrabold text-slate-900 mt-1">$ 0</h3></div>
        <div class="bg-white p-5 rounded-xl border border-slate-200 shadow-sm"><p class="text-xs uppercase text-slate-400 font-bold">Clientes con Compra</p><h3 id="kpiActiveClients" class="text-2xl font-extrabold text-slate-900 mt-1">0</h3></div>
        <div class="bg-white p-5 rounded-xl border border-slate-200 shadow-sm"><p class="text-xs uppercase text-slate-400 font-bold">Operaciones</p><h3 id="kpiTotalOrders" class="text-2xl font-extrabold text-slate-900 mt-1">0</h3></div>
        <div class="bg-white p-5 rounded-xl border border-slate-200 shadow-sm"><p class="text-xs uppercase text-slate-400 font-bold">Ticket Promedio</p><h3 id="kpiAvgTicket" class="text-2xl font-extrabold text-slate-900 mt-1">$ 0</h3></div>
      </section>
      <section class="bg-white p-5 rounded-xl border border-slate-200 shadow-sm"><h2 class="text-sm font-bold text-slate-900 mb-4">Top 10 Clientes</h2><div class="h-80 w-full"><canvas id="topClientsChart"></canvas></div></section>
      <section class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div class="p-4 border-b flex justify-between items-center gap-3">
          <p class="text-xs text-slate-500 font-bold" id="tableRecordCount">Mostrando clientes</p>
          <input type="text" id="searchInput" placeholder="Buscar cliente..." class="border rounded-lg px-3 py-1.5 text-xs w-64">
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-left border-collapse text-xs">
            <thead><tr class="bg-slate-50 text-slate-500 uppercase font-semibold text-[11px] border-b"><th class="py-3 px-4">#</th><th class="py-3 px-4">Cliente</th><th class="py-3 px-4 text-right">Ventas ($)</th><th class="py-3 px-4 text-center">Operaciones</th><th class="py-3 px-4 text-right">Ticket Prom.</th><th class="py-3 px-4 text-right">% Total</th><th class="py-3 px-4 text-center">Acciones</th></tr></thead>
            <tbody id="clientsTableBody" class="divide-y divide-slate-100"></tbody>
          </table>
        </div>
      </section>
    </div>

    <!-- VISTA PRODUCTOS -->
    <div id="viewProducts" class="space-y-6 hidden">
      <section class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div class="bg-white p-5 rounded-xl border border-slate-200 shadow-sm"><p class="text-xs uppercase text-slate-400 font-bold">Facturado Artículos</p><h3 id="kpiProdTotalSales" class="text-2xl font-extrabold text-slate-900 mt-1">$ 0</h3></div>
        <div class="bg-white p-5 rounded-xl border border-slate-200 shadow-sm"><p class="text-xs uppercase text-slate-400 font-bold">Unidades Totales</p><h3 id="kpiProdTotalUnits" class="text-2xl font-extrabold text-slate-900 mt-1">0</h3></div>
        <div class="bg-white p-5 rounded-xl border border-slate-200 shadow-sm"><p class="text-xs uppercase text-slate-400 font-bold">Ganancia Bruta Est.</p><h3 id="kpiProdTotalProfit" class="text-2xl font-extrabold text-indigo-600 mt-1">$ 0</h3></div>
        <div class="bg-white p-5 rounded-xl border border-slate-200 shadow-sm"><p class="text-xs uppercase text-slate-400 font-bold">Artículos Listados</p><h3 id="kpiProdTotalSkus" class="text-2xl font-extrabold text-slate-900 mt-1">0</h3></div>
      </section>
      <section class="bg-white p-5 rounded-xl border border-slate-200 shadow-sm"><h2 class="text-sm font-bold text-slate-900 mb-4">Top 10 Productos</h2><div class="h-80 w-full"><canvas id="topProductsChart"></canvas></div></section>
      <section class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div class="p-4 border-b flex justify-between items-center gap-3">
          <p class="text-xs text-slate-500 font-bold" id="prodTableRecordCount">0 productos</p>
          <div class="flex items-center gap-2">
            <label class="flex items-center gap-1.5 text-xs font-semibold text-rose-700 bg-rose-50 px-3 py-1.5 rounded-lg border border-rose-200 cursor-pointer"><input type="checkbox" id="chkOnlyLosses" class="rounded text-rose-600"><span>⚠️ Solo con pérdida</span></label>
            <input type="text" id="prodSearchInput" placeholder="Filtrar producto..." class="border rounded-lg px-3 py-1.5 text-xs w-64">
          </div>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-left border-collapse text-xs">
            <thead><tr class="bg-slate-50 text-slate-500 uppercase font-semibold text-[11px] border-b"><th class="py-3 px-4">#</th><th class="py-3 px-4">Foto</th><th class="py-3 px-4">Producto</th><th class="py-3 px-4 text-center">Unidades</th><th class="py-3 px-4 text-right">Precio Prom.</th><th class="py-3 px-4 text-right">Ventas ($)</th><th class="py-3 px-4 text-right">Ganancia ($)</th><th class="py-3 px-4 text-right">Margen</th></tr></thead>
            <tbody id="productsGlobalTableBody" class="divide-y divide-slate-100"></tbody>
          </table>
        </div>
        <div id="infiniteScrollTrigger" class="py-4 text-center bg-slate-50 text-xs font-semibold text-slate-500"><span id="infiniteLoadingText">Desplázate para cargar más...</span></div>
      </section>
    </div>

  </main>

  <!-- MODAL DETALLE CLIENTE -->
  <div id="modalDetail" class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center hidden p-4 sm:p-6">
    <div id="modalDetailCard" class="bg-white rounded-2xl max-w-4xl w-full p-6 shadow-2xl border border-slate-200 space-y-4 h-[85vh] max-h-[780px] min-h-[520px] flex flex-col">
      <div class="flex justify-between items-start border-b pb-3 flex-shrink-0">
        <div><h3 id="modalClientTitle" class="text-base font-bold text-slate-900">Cargando...</h3><p id="modalPeriodSubtitle" class="text-xs text-slate-500"></p></div>
        <button id="btnCloseDetail" class="text-slate-400 hover:text-slate-600 text-2xl leading-none">&times;</button>
      </div>
      <div class="grid grid-cols-3 gap-3 bg-slate-50 p-3 rounded-xl border text-xs flex-shrink-0">
        <div><p class="text-slate-400">Total Comprado</p><p id="modalClientTotalAmount" class="font-extrabold text-slate-900">$ 0</p></div>
        <div><p class="text-slate-400">Unidades</p><p id="modalClientTotalUnits" class="font-extrabold text-slate-900">0</p></div>
        <div><p class="text-slate-400">Artículos Distintos</p><p id="modalClientTotalSkus" class="font-extrabold text-slate-900">0</p></div>
      </div>
      <div class="flex justify-between items-center gap-3 flex-shrink-0">
        <input type="text" id="productSearchInput" placeholder="Buscar producto en la lista..." class="border rounded-lg px-3 py-1.5 text-xs w-72 focus:outline-none focus:ring-2 focus:ring-indigo-500">
        <span id="productRecordCount" class="text-xs text-slate-400 whitespace-nowrap"></span>
      </div>
      <div class="overflow-y-auto flex-1 min-h-0 border rounded-xl">
        <table class="w-full text-left text-xs">
          <thead class="sticky top-0 bg-slate-100 border-b z-10 shadow-sm">
            <tr class="text-slate-600 font-semibold text-[11px]"><th class="p-2.5">#</th><th class="p-2.5">Producto</th><th class="p-2.5 text-center">Unidades</th><th class="p-2.5 text-right">Precio Prom.</th><th class="p-2.5 text-right">Total ($)</th><th class="p-2.5 text-right">% Aporte</th></tr>
          </thead>
          <tbody id="productsTableBody" class="divide-y divide-slate-100"></tbody>
        </table>
      </div>
      <div class="pt-1 flex justify-end flex-shrink-0"><button id="btnCloseDetailFooter" class="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold text-xs rounded-lg transition">Cerrar</button></div>
    </div>
  </div>

  <script>
    var token = ${JSON.stringify(accessToken)};
    var refreshToken = ${JSON.stringify(refreshToken)};
    var storeId = ${JSON.stringify(storeId)};

    var dateFilterMode = "monthly";
    var selectedMonthDate = new Date();

    var activeTab = "clients";
    var allClients = [];
    var allGlobalProducts = [];
    var currentCustomerProducts = [];
    var nextProductCursor = null;
    var isLoadingProducts = false;
    var hasMoreProducts = true;
    var profitPeriodsCache = [];
    var salesPeriodsCache = [];

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

    // Selector de Modo
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
      monthlyControls.classList.add("hidden");
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

	// --- LÓGICA DE BOTONES PREDEFINIDOS ---
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
      var start = new Date(now.getFullYear(), 0, 1); // 1 de Enero del año actual
      applyPresetRange(start, now);
    };

    // --- CERRAR MODAL Y MENÚ CON LA TECLA ESC ---
    document.addEventListener("keydown", function(e) {
      if (e.key === "Escape" || e.keyCode === 27) {
        closeDetailModal();
        if (monthDropdownMenu) {
          monthDropdownMenu.classList.add("hidden");
        }
      }
    });
	
    // Menú flotante de meses
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

    function selectMonthFromChart(iso) {
      if (dateFilterMode === "custom") return;
      var d = new Date(iso);
      selectedMonthDate = new Date(d.getUTCFullYear(), d.getUTCMonth(), 1);
      syncPresetButtonStyles();
      refreshAll();
    }

    // Pestañas
    document.getElementById("tabBtnClients").onclick = function() { switchTab("clients"); };
    document.getElementById("tabBtnProducts").onclick = function() { switchTab("products"); };

    function switchTab(t) {
      activeTab = t;
      if (t === "clients") {
        document.getElementById("tabBtnClients").className = "px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all shadow-sm bg-white text-indigo-600";
        document.getElementById("tabBtnProducts").className = "px-3.5 py-1.5 rounded-lg text-xs font-bold text-slate-600 hover:text-slate-900 transition-all";
        document.getElementById("viewClients").classList.remove("hidden");
        document.getElementById("viewProducts").classList.add("hidden");
        if (allClients.length === 0) fetchClientsData();
      } else {
        document.getElementById("tabBtnProducts").className = "px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all shadow-sm bg-white text-indigo-600";
        document.getElementById("tabBtnClients").className = "px-3.5 py-1.5 rounded-lg text-xs font-bold text-slate-600 hover:text-slate-900 transition-all";
        document.getElementById("viewProducts").classList.remove("hidden");
        document.getElementById("viewClients").classList.add("hidden");
        if (allGlobalProducts.length === 0) resetAndFetchProducts();
      }
    }

    // Consultas
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
              ticks: {
                autoSkip: true,
                maxTicksLimit: 8,
                font: { size: 9, weight: 'bold' },
                color: '#64748b'
              }
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
              ticks: {
                autoSkip: true,
                maxTicksLimit: 8,
                font: { size: 9, weight: 'bold' },
                color: '#64748b'
              }
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

    // PUNTO CLAVE: TABLA DE CLIENTES SIN COMILLAS EN LÍNEA 404
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
        
        // Botón creado como nodo DOM: libre de errores de comillas
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
      if (e[0].isIntersecting && activeTab === "products" && hasMoreProducts && !isLoadingProducts) fetchProductsPage();
    }, { threshold: 0.1 }).observe(document.getElementById("infiniteScrollTrigger"));

    function refreshAll() {
      fetchExecutiveSummary();
      if (activeTab === "clients") fetchClientsData();
      else resetAndFetchProducts();
    }

    document.getElementById("btnRefresh").onclick = refreshAll;
    document.getElementById("chkOnlyLosses").onchange = function() { renderGlobalProductsTable(allGlobalProducts); };
    document.getElementById("prodSearchInput").oninput = function() { renderGlobalProductsTable(allGlobalProducts); };
    document.getElementById("searchInput").oninput = function(e) {
      renderClientsTable(allClients.filter(function(i) { return i.name.toLowerCase().includes(e.target.value.toLowerCase()); }));
    };

    initDateInputs();
    refreshAll();
  <\/script>
</body>
</html>
  `);
  doc.close();
})();