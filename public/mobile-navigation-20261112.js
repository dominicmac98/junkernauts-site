(() => {
  function initializeMobileNavigation() {
    const nav = document.querySelector('.site-nav');
    const links = nav?.querySelector('.nav-links');
    if (!nav || !links || nav.dataset.mobileNavigationReady || !window.matchMedia) return;

    const mobile = window.matchMedia('(max-width: 680px)');
    const button = document.createElement('button');
    let linksId = links.id;
    if (!linksId) {
      linksId = 'site-navigation-links';
      let suffix = 2;
      while (document.getElementById(linksId)) linksId = `site-navigation-links-${suffix++}`;
      links.id = linksId;
    }
    button.type = 'button';
    button.className = 'mobile-menu-toggle';
    button.textContent = 'Menu';
    button.setAttribute('aria-controls', linksId);
    button.setAttribute('aria-expanded', 'false');

    const closeDropdowns = () => {
      nav.querySelectorAll('.nav-dropdown').forEach(dropdown => {
        dropdown.classList.remove('is-open', 'is-hover-open');
        dropdown.querySelector('.nav-dropdown-toggle')?.setAttribute('aria-expanded', 'false');
      });
    };

    const setOpen = (requested, restoreFocus = false) => {
      const open = mobile.matches && requested;
      nav.classList.toggle('mobile-menu-open', open);
      button.setAttribute('aria-expanded', String(open));
      if (!open) closeDropdowns();
      if (restoreFocus) button.focus();
    };

    button.addEventListener('click', () => {
      if (mobile.matches) setOpen(!nav.classList.contains('mobile-menu-open'));
    });
    document.addEventListener('click', event => {
      if (mobile.matches && nav.classList.contains('mobile-menu-open') && !nav.contains(event.target)) setOpen(false);
    });
    links.addEventListener('click', event => {
      const link = event.target.closest('a');
      // The shared navigation script owns the Services and Areas accordions.
      if (mobile.matches && link && !link.classList.contains('nav-dropdown-toggle')) setOpen(false);
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && mobile.matches && nav.classList.contains('mobile-menu-open')) {
        event.preventDefault();
        setOpen(false, true);
      }
    });
    window.addEventListener('resize', () => {
      if (!mobile.matches) setOpen(false);
    });

    // Put the disclosure before its links in keyboard order, keeping the
    // original links, phone handlers, and desktop DOM content intact.
    links.parentNode.insertBefore(button, links);
    nav.dataset.mobileNavigationReady = 'true';
    nav.classList.add('mobile-navigation-enhanced');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeMobileNavigation, { once: true });
  } else {
    initializeMobileNavigation();
  }
})();
