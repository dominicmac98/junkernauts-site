const reveals = document.querySelectorAll(".reveal");
const siteNav = document.querySelector(".site-nav");
const themeToggle = document.querySelector("[data-theme-toggle]");
const navDropdowns = document.querySelectorAll(".nav-dropdown");
const promoBanner = document.querySelector(".promo-banner");
let navIsCompact = siteNav?.classList.contains("nav-compact") || false;
let navUpdateFrame = 0;
let navSettleTimer = 0;

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

const setNavCompact = (shouldBeCompact) => {
  if (!siteNav) return;
  if (shouldBeCompact === navIsCompact) return;
  navIsCompact = shouldBeCompact;
  siteNav.classList.toggle("nav-compact", navIsCompact);
};

const updateNavSize = () => {
  if (!siteNav) return;
  const y = window.scrollY || document.documentElement.scrollTop || 0;
  setNavCompact(navIsCompact ? y > 120 : y > 220);
};

const scheduleNavSizeUpdate = () => {
  if (!navUpdateFrame) {
    navUpdateFrame = window.requestAnimationFrame(() => {
      navUpdateFrame = 0;
      updateNavSize();
    });
  }

  window.clearTimeout(navSettleTimer);
  navSettleTimer = window.setTimeout(updateNavSize, 140);
};

updateNavSize();
window.addEventListener("scroll", scheduleNavSizeUpdate, { passive: true });
window.addEventListener("scrollend", updateNavSize, { passive: true });
window.addEventListener("pageshow", scheduleNavSizeUpdate);

if (promoBanner && "IntersectionObserver" in window) {
  const navTopObserver = new IntersectionObserver(([entry]) => {
    if (entry.isIntersecting) {
      setNavCompact(false);
    } else if ((window.scrollY || 0) > 220) {
      setNavCompact(true);
    }
  }, { threshold: 0.25 });

  navTopObserver.observe(promoBanner);
}

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
  let hoverCloseTimer = 0;

  dropdown.addEventListener("pointerenter", () => {
    if (!window.matchMedia("(min-width: 681px)").matches) return;
    window.clearTimeout(hoverCloseTimer);
    navDropdowns.forEach((otherDropdown) => {
      if (otherDropdown !== dropdown) otherDropdown.classList.remove("is-hover-open");
    });
    dropdown.classList.add("is-hover-open");
  });

  dropdown.addEventListener("pointerleave", () => {
    if (!window.matchMedia("(min-width: 681px)").matches) return;
    window.clearTimeout(hoverCloseTimer);
    hoverCloseTimer = window.setTimeout(() => {
      dropdown.classList.remove("is-hover-open");
    }, 260);
  });

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
  navDropdowns.forEach((dropdown) => dropdown.classList.remove("is-hover-open"));
  if (!window.matchMedia("(max-width: 680px)").matches) closeMobileDropdowns();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    navDropdowns.forEach((dropdown) => dropdown.classList.remove("is-hover-open"));
    closeMobileDropdowns();
  }
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
  const businessTimeZone = "America/Detroit";
  const bookingSteps = Array.from(bookingForm.querySelectorAll("[data-booking-step]"));
  const progressSteps = Array.from(bookingForm.querySelectorAll("[data-progress-step]"));
  const dateInput = bookingForm.querySelector("[data-booking-date]");
  const datePickerMenu = bookingForm.querySelector("[data-date-picker-menu]");
  const windowSelect = bookingForm.querySelector("[data-booking-window]");
  const availabilityStatus = bookingForm.querySelector("[data-booking-status]");
  const submitStatus = bookingForm.querySelector("[data-booking-submit-status]");
  const submitButton = bookingForm.querySelector(".submit-btn");
  const dateField = dateInput?.closest(".date-field");
  const windowPicker = bookingForm.querySelector("[data-window-picker]");
  const windowPickerButton = bookingForm.querySelector("[data-window-picker-button]");
  const windowPickerText = bookingForm.querySelector("[data-window-picker-text]");
  const windowPickerMenu = bookingForm.querySelector("[data-window-picker-menu]");
  const addressInput = bookingForm.querySelector("[data-address-input]");
  const addressSuggestions = bookingForm.querySelector("[data-address-suggestions]");
  const cityInput = bookingForm.elements.pickup_city;
  const zipInput = bookingForm.elements.pickup_zip;
  const windowLabels = new Map();
  const addressSessionToken = (
    window.crypto?.randomUUID?.() ||
    `${Date.now()}-${Math.random().toString(16).slice(2)}`
  );
  let addressTimer = null;
  let addressAbort = null;

  windowSelect?.querySelectorAll("option").forEach((option) => {
    windowLabels.set(option.value, option.textContent);
  });

  const toDateInputValueInTimeZone = (date, timeZone) => {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date);
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

    return `${values.year}-${values.month}-${values.day}`;
  };

  const parseDateInputValue = (value) => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || "");
    if (!match) return null;

    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  };

  const formatCalendarTitle = (date) => new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
  }).format(date);

  const formatDateButtonLabel = (date) => new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(date);

  if (dateInput) {
    dateInput.dataset.min = toDateInputValueInTimeZone(new Date(), businessTimeZone);
  }

  let datePickerMonth = parseDateInputValue(dateInput?.value) || parseDateInputValue(dateInput?.dataset.min) || new Date();

  const closeDatePicker = () => {
    dateField?.classList.remove("is-open");
    dateInput?.setAttribute("aria-expanded", "false");
  };

  const renderDatePicker = () => {
    if (!datePickerMenu || !dateInput) return;

    const minDate = parseDateInputValue(dateInput.dataset.min);
    const selectedDate = parseDateInputValue(dateInput.value);
    const monthStart = new Date(datePickerMonth.getFullYear(), datePickerMonth.getMonth(), 1);
    const gridStart = new Date(monthStart);
    gridStart.setDate(gridStart.getDate() - gridStart.getDay());
    const canGoBack = !minDate || new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0) >= minDate;

    datePickerMenu.innerHTML = "";

    const header = document.createElement("div");
    header.className = "date-picker-head";

    const prev = document.createElement("button");
    prev.type = "button";
    prev.className = "date-picker-nav";
    prev.textContent = "<";
    prev.setAttribute("aria-label", "Previous month");
    prev.disabled = !canGoBack;
    prev.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      datePickerMonth = new Date(datePickerMonth.getFullYear(), datePickerMonth.getMonth() - 1, 1);
      renderDatePicker();
    });

    const title = document.createElement("div");
    title.className = "date-picker-title";
    title.textContent = formatCalendarTitle(monthStart);

    const next = document.createElement("button");
    next.type = "button";
    next.className = "date-picker-nav";
    next.textContent = ">";
    next.setAttribute("aria-label", "Next month");
    next.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      datePickerMonth = new Date(datePickerMonth.getFullYear(), datePickerMonth.getMonth() + 1, 1);
      renderDatePicker();
    });

    header.append(prev, title, next);
    datePickerMenu.appendChild(header);

    const weekdays = document.createElement("div");
    weekdays.className = "date-picker-weekdays";
    ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].forEach((day) => {
      const item = document.createElement("span");
      item.textContent = day;
      weekdays.appendChild(item);
    });
    datePickerMenu.appendChild(weekdays);

    const grid = document.createElement("div");
    grid.className = "date-picker-grid";

    for (let index = 0; index < 42; index += 1) {
      const day = new Date(gridStart);
      day.setDate(gridStart.getDate() + index);
      const value = toDateInputValueInTimeZone(day, businessTimeZone);
      const button = document.createElement("button");
      button.type = "button";
      button.className = "date-picker-day";
      button.textContent = String(day.getDate());
      button.setAttribute("aria-label", formatDateButtonLabel(day));
      button.classList.toggle("is-muted", day.getMonth() !== monthStart.getMonth());
      button.classList.toggle("is-selected", selectedDate && value === dateInput.value);

      if (minDate && day < minDate) {
        button.disabled = true;
      } else {
        button.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          dateInput.value = value;
          dateInput.dispatchEvent(new Event("change", { bubbles: true }));
          closeDatePicker();
        });
      }

      grid.appendChild(button);
    }

    datePickerMenu.appendChild(grid);
  };

  const openDatePicker = () => {
    if (!dateField || !dateInput || !datePickerMenu) return;
    datePickerMonth = parseDateInputValue(dateInput.value) || parseDateInputValue(dateInput.dataset.min) || new Date();
    renderDatePicker();
    dateField.classList.add("is-open");
    dateInput.setAttribute("aria-expanded", "true");
  };

  dateField?.addEventListener("click", (event) => {
    if (!dateInput || event.target.closest(".date-picker-menu")) return;
    event.preventDefault();
    dateInput.focus();
    openDatePicker();
  });

  dateInput?.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " " || event.key === "ArrowDown") {
      event.preventDefault();
      openDatePicker();
    }
    if (event.key === "Escape") closeDatePicker();
  });

  document.addEventListener("click", (event) => {
    if (!dateField?.contains(event.target)) closeDatePicker();
  });

  const closeWindowPicker = () => {
    windowPicker?.classList.remove("is-open");
    windowPickerButton?.setAttribute("aria-expanded", "false");
  };

  const renderWindowPicker = () => {
    if (!windowSelect || !windowPickerMenu || !windowPickerText) return;

    const selectedOption = windowSelect.selectedOptions[0];
    windowPickerText.textContent = selectedOption?.value ? selectedOption.textContent : "Choose a window";
    windowPickerMenu.innerHTML = "";

    windowSelect.querySelectorAll("option").forEach((option) => {
      if (!option.value) return;
      const item = document.createElement("button");
      item.type = "button";
      item.className = "window-picker-option";
      item.textContent = option.textContent;
      item.disabled = option.disabled;
      item.setAttribute("role", "option");
      item.setAttribute("aria-selected", String(option.value === windowSelect.value));
      item.classList.toggle("is-selected", option.value === windowSelect.value);
      item.addEventListener("click", () => {
        if (option.disabled) return;
        windowSelect.value = option.value;
        windowSelect.dispatchEvent(new Event("change", { bubbles: true }));
        closeWindowPicker();
        windowPickerButton?.focus();
      });
      windowPickerMenu.appendChild(item);
    });
  };

  windowPickerButton?.addEventListener("click", () => {
    const isOpen = windowPicker?.classList.toggle("is-open");
    windowPickerButton.setAttribute("aria-expanded", String(Boolean(isOpen)));
  });

  document.addEventListener("click", (event) => {
    if (!windowPicker?.contains(event.target)) closeWindowPicker();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeWindowPicker();
  });

  const closeAddressSuggestions = () => {
    addressSuggestions?.classList.remove("is-open");
    if (addressSuggestions) addressSuggestions.innerHTML = "";
  };

  const fillAddressDetails = async (placeId) => {
    if (!placeId || !addressInput) return;

    try {
      const response = await fetch(`/api/place-details?placeId=${encodeURIComponent(placeId)}&sessionToken=${encodeURIComponent(addressSessionToken)}`, {
        cache: "no-store",
        headers: { "Accept": "application/json" },
      });

      if (!response.ok) return;

      const details = await response.json();
      if (details.address) addressInput.value = details.address;
      if (details.city && cityInput) cityInput.value = details.city;
      if (details.zip && zipInput) zipInput.value = details.zip;
    } catch (error) {
      // Keep the typed address if Google details are not available.
    }
  };

  const renderAddressSuggestions = (suggestions) => {
    if (!addressSuggestions) return;

    addressSuggestions.innerHTML = "";
    if (!suggestions.length) {
      closeAddressSuggestions();
      return;
    }

    suggestions.forEach((suggestion) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "address-suggestion";
      button.setAttribute("role", "option");
      button.innerHTML = `
        <span class="address-pin" aria-hidden="true">&#9679;</span>
        <span>
          <span class="address-main"></span>
          <span class="address-secondary"></span>
        </span>
      `;
      button.querySelector(".address-main").textContent = suggestion.mainText || suggestion.text;
      button.querySelector(".address-secondary").textContent = suggestion.secondaryText || "";
      button.addEventListener("click", async () => {
        addressInput.value = suggestion.text;
        closeAddressSuggestions();
        await fillAddressDetails(suggestion.placeId);
      });
      addressSuggestions.appendChild(button);
    });

    const powered = document.createElement("div");
    powered.className = "address-powered";
    powered.textContent = "powered by Google";
    addressSuggestions.appendChild(powered);
    addressSuggestions.classList.add("is-open");
  };

  const updateAddressSuggestions = () => {
    if (!addressInput || !addressSuggestions) return;

    clearTimeout(addressTimer);
    const input = addressInput.value.trim();

    if (input.length < 3) {
      closeAddressSuggestions();
      return;
    }

    addressTimer = setTimeout(async () => {
      addressAbort?.abort();
      addressAbort = new AbortController();

      try {
        const response = await fetch(`/api/places-autocomplete?input=${encodeURIComponent(input)}&sessionToken=${encodeURIComponent(addressSessionToken)}`, {
          cache: "no-store",
          headers: { "Accept": "application/json" },
          signal: addressAbort.signal,
        });

        if (!response.ok) return;

        const data = await response.json();
        renderAddressSuggestions(Array.isArray(data.suggestions) ? data.suggestions : []);
      } catch (error) {
        if (error.name !== "AbortError") closeAddressSuggestions();
      }
    }, 220);
  };

  addressInput?.addEventListener("input", updateAddressSuggestions);
  addressInput?.addEventListener("focus", updateAddressSuggestions);

  document.addEventListener("click", (event) => {
    if (!addressSuggestions?.contains(event.target) && event.target !== addressInput) {
      closeAddressSuggestions();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeAddressSuggestions();
  });

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
    renderWindowPicker();
  };

  const updateAvailability = async () => {
    if (!dateInput?.value || !windowSelect) return;

    resetWindowOptions();
    setStatus(availabilityStatus, "Checking available windows...", "muted");

    try {
      const availabilityUrl = `/api/availability?date=${encodeURIComponent(dateInput.value)}&refresh=${Date.now()}`;
      const response = await fetch(availabilityUrl, {
        cache: "no-store",
        headers: { "Accept": "application/json" },
      });

      if (!response.ok) throw new Error("Availability unavailable");

      const data = await response.json();
      const windows = Array.isArray(data.windows) ? data.windows : [];
      const unavailable = new Set(windows.filter((slot) => !slot.available).map((slot) => slot.window));
      const unavailableReasons = new Map(windows.map((slot) => [slot.window, slot.reason]));

      windowSelect.querySelectorAll("option").forEach((option) => {
        if (!option.value || !unavailable.has(option.value)) return;
        const reason = unavailableReasons.get(option.value);
        const suffix = reason === "too_soon" ? "Too soon" : "Booked";
        option.disabled = true;
        option.textContent = `${windowLabels.get(option.value) || option.value} - ${suffix}`;
      });

      if (unavailable.has(windowSelect.value)) windowSelect.value = "";
      renderWindowPicker();

      const availableCount = windows.filter((slot) => slot.available).length;
      if (availableCount > 0) {
        setStatus(availabilityStatus, `${availableCount} pickup window${availableCount === 1 ? "" : "s"} available for that day.`, "good");
      } else if (windows.some((slot) => slot.reason === "too_soon")) {
        setStatus(availabilityStatus, "Same-day pickups need at least 2 hours of notice. Please choose a later window or another day.", "bad");
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
      if (invalid === windowSelect && windowPickerButton) windowPickerButton.focus();
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
  windowSelect?.addEventListener("change", renderWindowPicker);
  renderWindowPicker();

  bookingForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const currentStep = bookingForm.querySelector("[data-booking-step='3']");
    if (!currentStep || !validateStep(currentStep)) return;

    setStatus(submitStatus, "Sending your on-site quote request...", "muted");
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
        throw new Error(result.message || "On-site quote request failed");
      }

      const confirmationNumber = result.confirmationNumber || result.eventId || "sent";
      const confirmation = JSON.stringify({
        type: "booking",
        reference: confirmationNumber,
        preferredDay: bookingForm.elements.preferred_day?.value || "",
        preferredWindow: bookingForm.elements.preferred_window?.value || "",
        createdAt: Date.now(),
      });
      try { sessionStorage.setItem("junkernautsConfirmation", confirmation); } catch {}
      try { localStorage.setItem("junkernautsConfirmation", confirmation); } catch {}
      window.location.href = "confirmation";
    } catch (error) {
      setStatus(submitStatus, error.message || "Something went wrong sending the request. Please call or text 734-480-8190.", "bad");
    } finally {
      if (submitButton) submitButton.disabled = false;
    }
  });
}
