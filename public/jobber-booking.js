(() => {
  const origin = "https://clienthub.getjobber.com";
  const formPath = "/hubs/84193bef-02ad-49cd-93e2-4c8bfc7f103c/public/requests/5115979/embedded_new";
  const mount = document.querySelector("[data-jobber-form]");
  const warmKey = "junkernauts-jobber-warmed";
  const warmLifetime = 10 * 60 * 1000;

  function formUrl(background = false) {
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

  function rememberWarm() {
    try { sessionStorage.setItem(warmKey, String(Date.now())); } catch { /* Storage is optional. */ }
  }

  if (mount) {
    const frame = document.createElement("iframe");
    frame.className = "jobber-work-request";
    frame.title = "Schedule a free on-site quote with Junkernauts";
    frame.loading = "eager";
    frame.setAttribute("sandbox", "allow-forms allow-scripts allow-same-origin allow-modals allow-popups");
    frame.src = formUrl();
    frame.height = "960";
    const status = document.querySelector("[data-jobber-status]");
    const fallback = document.querySelector("[data-jobber-direct]");
    if (fallback) fallback.href = frame.src;
    let ready = false;

    const slowTimer = window.setTimeout(() => {
      if (status) status.textContent = "Taking longer than usual? You can open the booking form directly below.";
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
        rememberWarm();
      }
    });
    mount.appendChild(frame);
    return;
  }

  // A hidden instance warms Jobber's JS, CSS and connections for later navigation.
  // The booking page still starts a fresh form, so appointment availability is live.
  const connection = navigator.connection;
  if (connection?.saveData || /(^|-)2g$/.test(connection?.effectiveType || "")) return;
  let started = false;
  function warmForm() {
    if (started || document.visibilityState === "hidden") return;
    try {
      const lastWarm = Number(sessionStorage.getItem(warmKey));
      if (lastWarm && Date.now() - lastWarm < warmLifetime) return;
    } catch { /* Continue when browser storage is unavailable. */ }
    started = true;
    const frame = document.createElement("iframe");
    frame.title = "Booking preload";
    frame.setAttribute("sandbox", "allow-forms allow-scripts allow-same-origin allow-modals allow-popups");
    frame.setAttribute("aria-hidden", "true");
    frame.setAttribute("inert", "");
    frame.tabIndex = -1;
    frame.style.cssText = "position:fixed;left:-10000px;top:0;width:760px;height:960px;border:0;visibility:hidden;pointer-events:none;";
    function warmed(event) {
      if (event.origin !== origin || event.source !== frame.contentWindow) return;
      if (!/^\d+(?:\.\d+)?(?:px)?$/.test(String(event.data))) return;
      rememberWarm();
      window.removeEventListener("message", warmed);
    }
    window.addEventListener("message", warmed);
    frame.src = formUrl(true);
    document.body.appendChild(frame);
  }

  function onBookingIntent(event) {
    const link = event.target.closest?.("a[href]");
    if (!link) return;
    const url = new URL(link.href, window.location.href);
    if (url.origin === window.location.origin && /^\/booking(?:\.html|\/)?$/.test(url.pathname)) warmForm();
  }
  document.addEventListener("pointerover", onBookingIntent, { passive: true });
  document.addEventListener("focusin", onBookingIntent);
  document.addEventListener("touchstart", onBookingIntent, { passive: true });

  function queueWarmup() {
    window.setTimeout(() => {
      if ("requestIdleCallback" in window) window.requestIdleCallback(warmForm, { timeout: 4000 });
      else warmForm();
    }, 1500);
  }
  if (document.readyState === "complete") queueWarmup();
  else window.addEventListener("load", queueWarmup, { once: true });
})();
