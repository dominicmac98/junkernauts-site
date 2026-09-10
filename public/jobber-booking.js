(() => {
  const origin = "https://clienthub.getjobber.com";
  const forms = {
    booking: { id: "5115979", title: "Schedule a free on-site quote with Junkernauts Junk Removal" },
    quote: { id: "5115980", title: "Request a fast free estimate from Junkernauts Junk Removal" },
  };
  const mount = document.querySelector("[data-jobber-form]");
  const warmKey = form => `junkernauts-jobber-warmed-${form.id}`;
  const warmLifetime = 10 * 60 * 1000;

  function formUrl(form, background = false) {
    const formPath = `/hubs/84193bef-02ad-49cd-93e2-4c8bfc7f103c/public/requests/${form.id}/embedded_new`;
    const url = new URL(formPath, origin);
    const query = new URLSearchParams(window.location.search);
    for (const key of ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"]) {
      if (query.has(key)) url.searchParams.set(key, query.get(key));
    }
    url.searchParams.set("source", "embedded_inline");
    url.searchParams.set("ga_send_page_view", "false");
    if (!background) {
      url.searchParams.set("ga_page_location", window.location.href);
      url.searchParams.set("ga_page_referrer", document.referrer);
      url.searchParams.set("ga_page_title", document.title);
      // Reuse an existing client ID without waiting for the analytics network.
      const clientId = document.cookie.match(/(?:^|;\s*)_ga=GA\d+\.\d+\.(\d+\.\d+)(?:;|$)/)?.[1];
      if (clientId) url.searchParams.set("ga_client_id", JSON.stringify(clientId));
    }
    return url.href;
  }

  function rememberWarm(form) {
    try { sessionStorage.setItem(warmKey(form), String(Date.now())); } catch { /* Storage is optional. */ }
  }

  if (mount) {
    const form = forms[mount.getAttribute("data-jobber-form")] || forms.booking;
    const frame = document.createElement("iframe");
    frame.className = "jobber-work-request";
    frame.title = form.title;
    frame.loading = "eager";
    frame.setAttribute("sandbox", "allow-forms allow-scripts allow-same-origin allow-modals allow-popups");
    frame.src = formUrl(form);
    frame.height = "960";
    const status = document.querySelector("[data-jobber-status]");
    const fallback = document.querySelector("[data-jobber-direct]");
    if (fallback) fallback.href = frame.src;
    let ready = false;

    const slowTimer = window.setTimeout(() => {
      if (status) status.textContent = "Taking longer than usual? You can open the form directly below.";
    }, 12000);

    // Jobber reports its actual height as each form step changes.
    window.addEventListener("message", (event) => {
      if (event.origin !== origin || event.source !== frame.contentWindow) return;
      if (event.data === "scrolltop") {
        if (ready && document.activeElement === frame) mount.scrollIntoView({ block: "start" });
        return;
      }
      const value = typeof event.data === "number" ? String(event.data) : event.data;
      if (typeof value !== "string" || !/^\d+(?:\.\d+)?(?:px)?$/.test(value)) return;
      const height = parseFloat(value);
      if (height < 200 || height > 20000) return;
      frame.style.height = `${Math.ceil(height)}px`;
      if (!ready) {
        ready = true;
        window.clearTimeout(slowTimer);
        if (status) status.hidden = true;
        mount.setAttribute("aria-busy", "false");
        rememberWarm(form);
      }
    });
    mount.appendChild(frame);
    return;
  }

  // Stagger hidden instances to warm each form without competing with page load.
  // Each destination starts a fresh form, keeping appointment availability live.
  const connection = navigator.connection;
  if (connection?.saveData || /(^|-)2g$/.test(connection?.effectiveType || "")) return;
  const started = new Set();
  function warmForm(form) {
    if (started.has(form.id) || document.visibilityState === "hidden") return;
    try {
      const lastWarm = Number(sessionStorage.getItem(warmKey(form)));
      if (lastWarm && Date.now() - lastWarm < warmLifetime) return;
    } catch { /* Continue when browser storage is unavailable. */ }
    started.add(form.id);
    const frame = document.createElement("iframe");
    frame.title = `${form.title} preload`;
    frame.setAttribute("sandbox", "allow-forms allow-scripts allow-same-origin allow-modals allow-popups");
    frame.setAttribute("aria-hidden", "true");
    frame.setAttribute("inert", "");
    frame.tabIndex = -1;
    frame.style.cssText = "position:fixed;left:-10000px;top:0;width:760px;height:960px;border:0;visibility:hidden;pointer-events:none;";
    function warmed(event) {
      if (event.origin !== origin || event.source !== frame.contentWindow) return;
      if (!/^\d+(?:\.\d+)?(?:px)?$/.test(String(event.data))) return;
      rememberWarm(form);
      window.removeEventListener("message", warmed);
    }
    window.addEventListener("message", warmed);
    frame.src = formUrl(form, true);
    document.body.appendChild(frame);
  }

  function onFormIntent(event) {
    const link = event.target.closest?.("a[href]");
    if (!link) return;
    const url = new URL(link.href, window.location.href);
    const route = url.pathname.match(/^\/(booking|quote)(?:\.html|\/)?$/)?.[1];
    if (url.origin === window.location.origin && route) warmForm(forms[route]);
  }
  document.addEventListener("pointerover", onFormIntent, { passive: true });
  document.addEventListener("focusin", onFormIntent);
  document.addEventListener("touchstart", onFormIntent, { passive: true });

  function queueWarmup() {
    Object.values(forms).forEach((form, index) => {
      window.setTimeout(() => {
        if ("requestIdleCallback" in window) window.requestIdleCallback(() => warmForm(form), { timeout: 4000 });
        else warmForm(form);
      }, 1500 + index * 2000);
    });
  }
  if (document.readyState === "complete") queueWarmup();
  else window.addEventListener("load", queueWarmup, { once: true });
})();
