const reveals = document.querySelectorAll(".reveal");
const siteNav = document.querySelector(".site-nav");
const themeToggle = document.querySelector("[data-theme-toggle]");
const navDropdowns = document.querySelectorAll(".nav-dropdown");
let navIsCompact = false;

const setThemeToggleText = () => {
  if (!themeToggle) return;
  const isNight = document.body.classList.contains("night-mode");
  const label = isNight ? "Night Mode" : "Day Mode";
  themeToggle.setAttribute("aria-pressed", String(isNight));
  themeToggle.innerHTML = `<span class="theme-toggle-track" aria-hidden="true"><span class="theme-toggle-thumb"></span><span class="theme-toggle-symbol"></span></span><span class="theme-toggle-text">${label}</span>`;
};

const savedTheme = localStorage.getItem("junkernautsTheme");
if (savedTheme === "night") {
  document.body.classList.add("night-mode");
}
setThemeToggleText();

themeToggle?.addEventListener("click", () => {
  document.body.classList.toggle("night-mode");
  localStorage.setItem("junkernautsTheme", document.body.classList.contains("night-mode") ? "night" : "day");
  setThemeToggleText();
});

const updateNavSize = () => {
  if (!siteNav) return;
  const y = window.scrollY || document.documentElement.scrollTop || 0;

  if (!navIsCompact && y > 140) {
    navIsCompact = true;
    siteNav.classList.add("nav-compact");
  } else if (navIsCompact && y < 12) {
    navIsCompact = false;
    siteNav.classList.remove("nav-compact");
  }
};

updateNavSize();
window.addEventListener("scroll", updateNavSize, { passive: true });

const closeMobileDropdowns = (except = null) => {
  navDropdowns.forEach((dropdown) => {
    if (dropdown === except) return;
    dropdown.classList.remove("is-open");
    dropdown.querySelector(".nav-dropdown-toggle")?.setAttribute("aria-expanded", "false");
  });
};

navDropdowns.forEach((dropdown) => {
  const toggle = dropdown.querySelector(".nav-dropdown-toggle");
  if (!toggle) return;

  toggle.setAttribute("aria-expanded", "false");
  toggle.addEventListener("click", (event) => {
    if (!window.matchMedia("(max-width: 680px)").matches) return;
    event.preventDefault();

    const willOpen = !dropdown.classList.contains("is-open");
    closeMobileDropdowns(dropdown);
    dropdown.classList.toggle("is-open", willOpen);
    toggle.setAttribute("aria-expanded", String(willOpen));
  });
});

document.addEventListener("click", (event) => {
  if (!window.matchMedia("(max-width: 680px)").matches) return;
  if (!event.target.closest(".nav-dropdown")) closeMobileDropdowns();
});

window.addEventListener("resize", () => {
  if (!window.matchMedia("(max-width: 680px)").matches) closeMobileDropdowns();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeMobileDropdowns();
});

if ("IntersectionObserver" in window) {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry, index) => {
      if (entry.isIntersecting) {
        setTimeout(() => entry.target.classList.add("visible"), index * 70);
      }
    });
  }, { threshold: 0.12 });

  reveals.forEach((item) => observer.observe(item));
} else {
  reveals.forEach((item) => item.classList.add("visible"));
}
