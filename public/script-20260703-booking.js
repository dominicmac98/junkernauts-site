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

const bookingForm = document.querySelector("[data-booking-form]");

if (bookingForm) {
  const bookingSteps = Array.from(bookingForm.querySelectorAll("[data-booking-step]"));
  const progressSteps = Array.from(bookingForm.querySelectorAll("[data-progress-step]"));
  const dateInput = bookingForm.querySelector("[data-booking-date]");
  const windowSelect = bookingForm.querySelector("[data-booking-window]");
  const availabilityStatus = bookingForm.querySelector("[data-booking-status]");
  const submitStatus = bookingForm.querySelector("[data-booking-submit-status]");
  const submitButton = bookingForm.querySelector(".submit-btn");
  const windowLabels = new Map();

  windowSelect?.querySelectorAll("option").forEach((option) => {
    windowLabels.set(option.value, option.textContent);
  });

  const toDateInputValue = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  if (dateInput) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    dateInput.min = toDateInputValue(tomorrow);
  }

  const setBookingStep = (stepNumber) => {
    bookingSteps.forEach((step) => {
      step.classList.toggle("is-active", step.dataset.bookingStep === String(stepNumber));
    });

    progressSteps.forEach((step) => {
      const number = Number(step.dataset.progressStep);
      step.classList.toggle("is-active", number === Number(stepNumber));
      step.classList.toggle("is-complete", number < Number(stepNumber));
    });
  };

  const setStatus = (element, message = "", tone = "muted") => {
    if (!element) return;
    element.textContent = message;
    element.classList.toggle("is-good", tone === "good");
    element.classList.toggle("is-bad", tone === "bad");
    element.classList.toggle("is-muted", tone === "muted");
  };

  const resetWindowOptions = () => {
    if (!windowSelect) return;
    windowSelect.querySelectorAll("option").forEach((option) => {
      option.disabled = false;
      option.textContent = windowLabels.get(option.value) || option.textContent;
    });
  };

  const updateAvailability = async () => {
    if (!dateInput?.value || !windowSelect) return;

    resetWindowOptions();
    setStatus(availabilityStatus, "Checking available windows...", "muted");

    try {
      const response = await fetch(`/api/availability?date=${encodeURIComponent(dateInput.value)}`, {
        headers: { "Accept": "application/json" },
      });

      if (!response.ok) throw new Error("Availability unavailable");

      const data = await response.json();
      const windows = Array.isArray(data.windows) ? data.windows : [];
      const unavailable = new Set(windows.filter((slot) => !slot.available).map((slot) => slot.window));

      windowSelect.querySelectorAll("option").forEach((option) => {
        if (!option.value || !unavailable.has(option.value)) return;
        option.disabled = true;
        option.textContent = `${windowLabels.get(option.value) || option.value} - Booked`;
      });

      if (unavailable.has(windowSelect.value)) windowSelect.value = "";

      const availableCount = windows.filter((slot) => slot.available).length;
      if (availableCount > 0) {
        setStatus(availabilityStatus, `${availableCount} pickup window${availableCount === 1 ? "" : "s"} available for that day.`, "good");
      } else if (windows.length > 0) {
        setStatus(availabilityStatus, "That day is currently full. Please choose another day.", "bad");
      } else {
        setStatus(availabilityStatus, "Choose a preferred pickup window.", "muted");
      }
    } catch (error) {
      resetWindowOptions();
      setStatus(availabilityStatus, "Choose your preferred window and we will confirm availability.", "muted");
    }
  };

  const validateStep = (step) => {
    const fields = Array.from(step.querySelectorAll("input, select, textarea"));
    const invalid = fields.find((field) => !field.checkValidity());

    if (invalid) {
      invalid.reportValidity();
      return false;
    }

    return true;
  };

  bookingForm.querySelectorAll("[data-next-step]").forEach((button) => {
    button.addEventListener("click", () => {
      const currentStep = button.closest("[data-booking-step]");
      if (!currentStep || !validateStep(currentStep)) return;
      setBookingStep(button.dataset.nextStep);
      if (button.dataset.nextStep === "2") updateAvailability();
    });
  });

  bookingForm.querySelectorAll("[data-prev-step]").forEach((button) => {
    button.addEventListener("click", () => {
      setBookingStep(button.dataset.prevStep);
    });
  });

  dateInput?.addEventListener("change", updateAvailability);

  bookingForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const currentStep = bookingForm.querySelector("[data-booking-step='3']");
    if (!currentStep || !validateStep(currentStep)) return;

    setStatus(submitStatus, "Sending your booking request...", "muted");
    if (submitButton) submitButton.disabled = true;

    try {
      const response = await fetch("/api/bookings", {
        method: "POST",
        body: new FormData(bookingForm),
        headers: { "Accept": "application/json" },
      });

      const result = await response.json().catch(() => ({}));

      if (response.status === 409) {
        setBookingStep(2);
        await updateAvailability();
        setStatus(availabilityStatus, result.message || "That window was just taken. Please choose another pickup window.", "bad");
        setStatus(submitStatus, "", "muted");
        return;
      }

      if (!response.ok) {
        throw new Error(result.message || "Booking request failed");
      }

      const confirmationNumber = result.confirmationNumber || result.eventId || "sent";
      sessionStorage.setItem("junkernautsBookingConfirmation", JSON.stringify({
        confirmationNumber,
        preferredDay: bookingForm.elements.preferred_day?.value || "",
        preferredWindow: bookingForm.elements.preferred_window?.value || "",
      }));
      window.location.href = `thanks?booking=${encodeURIComponent(confirmationNumber)}`;
    } catch (error) {
      setStatus(submitStatus, error.message || "Something went wrong sending the request. Please call or text 734-480-8190.", "bad");
    } finally {
      if (submitButton) submitButton.disabled = false;
    }
  });
}
