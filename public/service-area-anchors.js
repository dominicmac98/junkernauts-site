// Settle the two directory fragments after the mobile header finishes compacting.
// Native fragment navigation remains the fallback; never interrupt visitor input.
(() => {
  const anchors = new Set(["other-communities", "monroe-decking-removal"]);
  const mobile = window.matchMedia("(max-width: 680px)");
  let cleanup = () => {};
  let isPending = () => false;
  let restorePending = false;

  const begin = () => {
    cleanup();
    restorePending = false;
    const id = window.location.hash.slice(1);
    const target = anchors.has(id) && document.getElementById(id);
    const nav = document.querySelector(".site-nav");
    if (!mobile.matches || !target || !nav) return;

    let active = true;
    let timer = 0;
    let loaded = document.readyState === "complete";
    let fontsReady = !document.fonts?.ready;
    const inputs = ["pointerdown", "touchstart", "wheel", "keydown"];
    isPending = () => active;

    const stop = () => {
      active = false;
      window.clearTimeout(timer);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("load", onLoad);
      window.removeEventListener("resize", stop);
      nav.removeEventListener("transitionend", schedule);
      inputs.forEach((type) => window.removeEventListener(type, stop));
    };
    const settle = () => {
      if (!active) return;
      stop();
      if (!mobile.matches || window.location.hash !== `#${id}`) return;
      const top = target.getBoundingClientRect().top;
      const navBottom = nav.getBoundingClientRect().bottom;
      if (top < navBottom + 12 || top > window.innerHeight - 40) {
        target.scrollIntoView({ block: "start", behavior: "instant" });
      }
    };
    function schedule() {
      if (!active || !loaded || !fontsReady) return;
      window.clearTimeout(timer);
      // Header transitions last 220ms. Restart after scrolling or a transition.
      timer = window.setTimeout(settle, 260);
    }
    function onLoad() {
      loaded = true;
      schedule();
    }

    cleanup = stop;
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("load", onLoad, { once: true });
    window.addEventListener("resize", stop, { passive: true });
    nav.addEventListener("transitionend", schedule);
    inputs.forEach((type) => window.addEventListener(type, stop, { passive: true }));
    if (!fontsReady) {
      Promise.resolve(document.fonts.ready).catch(() => {}).then(() => {
        fontsReady = true;
        schedule();
      });
    }
    schedule();
  };

  window.addEventListener("hashchange", begin);
  // Do not replace a visitor's restored reading position after correction/cancellation.
  window.addEventListener("pageshow", (event) => { if (event.persisted && restorePending) begin(); });
  window.addEventListener("pagehide", () => { restorePending = isPending(); cleanup(); });
  begin();
})();
