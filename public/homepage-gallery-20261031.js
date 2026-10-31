(() => {
  const interval = 5000;

  function initializeGallery() {
    const cards = Array.from(document.querySelectorAll('[data-home-comparison]'));
    if (!cards.length) return;

    const motion = typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)')
      : null;
    const comparisons = [];
    let pageSuspended = false;

    cards.forEach(card => {
      if (card.dataset.homeReady === 'true') return;

      const before = card.querySelector('[data-home-photo="before"]');
      const after = card.querySelector('[data-home-photo="after"]');
      const controls = card.querySelector('[data-home-controls]');
      const beforeButton = card.querySelector('[data-home-show="before"]');
      const afterButton = card.querySelector('[data-home-show="after"]');
      const pauseButton = card.querySelector('[data-home-pause]');
      const label = card.querySelector('[data-home-state]');
      const status = card.querySelector('[data-home-autoplay]');

      // Incomplete markup keeps the two-photo, no-JavaScript fallback intact.
      if (!before || !after || !controls || !beforeButton || !afterButton || !pauseButton) return;

      const state = { after: false, paused: Boolean(motion?.matches), timer: null };

      function stop() {
        window.clearTimeout(state.timer);
        state.timer = null;
      }

      function render() {
        before.hidden = state.after;
        after.hidden = !state.after;
        card.dataset.homeCurrent = state.after ? 'after' : 'before';
        beforeButton.setAttribute('aria-pressed', String(!state.after));
        afterButton.setAttribute('aria-pressed', String(state.after));
        if (label) label.textContent = state.after ? 'After' : 'Before';
        pauseButton.textContent = state.paused ? 'Play' : 'Pause';
        pauseButton.setAttribute('aria-label', state.paused
          ? 'Play automatic photo changes'
          : 'Pause automatic photo changes');
        if (status) status.textContent = state.paused ? 'Auto paused' : 'Auto · every 5 seconds';
      }

      function schedule() {
        stop();
        if (state.paused || pageSuspended || document.hidden || card.isConnected === false) return;
        state.timer = window.setTimeout(() => {
          state.timer = null;
          if (state.paused || pageSuspended || document.hidden || card.isConnected === false) return;
          state.after = !state.after;
          render();
          schedule();
        }, interval);
      }

      beforeButton.addEventListener('click', () => {
        state.after = false;
        render();
        schedule();
      });
      afterButton.addEventListener('click', () => {
        state.after = true;
        render();
        schedule();
      });
      pauseButton.addEventListener('click', () => {
        state.paused = !state.paused;
        render();
        schedule();
      });

      card.dataset.homeReady = 'true';
      render();
      card.classList.add('is-enhanced');
      controls.hidden = false;
      schedule();
      comparisons.push({ state, render, schedule, stop });
    });

    if (!comparisons.length) return;

    document.addEventListener('visibilitychange', () => {
      comparisons.forEach(comparison => comparison.schedule());
    });
    window.addEventListener('pagehide', () => {
      pageSuspended = true;
      comparisons.forEach(comparison => comparison.stop());
    });
    window.addEventListener('pageshow', () => {
      pageSuspended = false;
      comparisons.forEach(comparison => comparison.schedule());
    });
    motion?.addEventListener?.('change', event => {
      if (!event.matches) return;
      comparisons.forEach(comparison => {
        comparison.state.paused = true;
        comparison.render();
        comparison.stop();
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeGallery, { once: true });
  } else {
    initializeGallery();
  }
})();
