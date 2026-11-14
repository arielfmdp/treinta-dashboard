(async function () {
  // 1. Evitar abrir múltiples instancias
  if (document.getElementById("treinta-dashboard-overlay")) {
    document.getElementById("treinta-dashboard-overlay").remove();
    return;
  }

  // 2. Extraer sesión viva de Treinta
  let accessToken = "";
  let refreshToken = "";
  let storeId = localStorage.getItem("STORE_ID") || "";

  try {
    const cookieMatch = document.cookie.match(/USER_TOKEN=([^;]+)/);
    if (cookieMatch) {
      const parsed = JSON.parse(decodeURIComponent(cookieMatch[1]));
      accessToken = parsed.accessToken || "";
      refreshToken = parsed.refreshToken || "";
    }
  } catch (e) {
    console.error("Error leyendo cookie USER_TOKEN:", e);
  }

  if (!accessToken) {
    alert("⚠️ No se detectó sesión activa en Treinta. Inicia sesión en web.treinta.co primero.");
    return;
  }

  // 3. Descargar index.html desde tu GitHub Pages
  const GITHUB_HTML_URL = "https://arielfmdp.github.io/treinta-dashboard/index.html?v=" + Date.now();

  try {
    const res = await fetch(GITHUB_HTML_URL);
    if (!res.ok) throw new Error("No se pudo descargar index.html (Status: " + res.status + ")");
    let html = await res.text();

    // 4. Inyectar credenciales y forzar que app.js no use caché vieja
    const sessionScript = "<script>" +
      "window.__TREINTA_AUTH__ = {" +
        "token: " + JSON.stringify(accessToken) + "," +
        "refreshToken: " + JSON.stringify(refreshToken) + "," +
        "storeId: " + JSON.stringify(storeId) +
      "};" +
    "<\/script>";

    html = html.replace("<!-- INJECT_SESSION -->", sessionScript);
    html = html.replace("app.js", "app.js?v=" + Date.now());

    // 5. Crear el iframe moderno con srcdoc
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
    iframe.srcdoc = html;

    document.body.appendChild(iframe);
  } catch (err) {
    alert("❌ Error al cargar el Dashboard Pro: " + err.message);
  }
})();