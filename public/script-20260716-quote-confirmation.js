const quoteForm = document.querySelector("[data-quote-form]");

if (quoteForm) {
  const status = quoteForm.querySelector("[data-quote-status]");
  const submitButton = quoteForm.querySelector(".quote-submit-btn");

  const setStatus = (message = "", tone = "muted") => {
    if (!status) return;
    status.textContent = message;
    status.classList.toggle("is-good", tone === "good");
    status.classList.toggle("is-bad", tone === "bad");
    status.classList.toggle("is-muted", tone === "muted");
  };

  quoteForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!quoteForm.checkValidity()) {
      quoteForm.reportValidity();
      return;
    }

    setStatus("Sending your fast estimate request...", "muted");
    if (submitButton) submitButton.disabled = true;

    try {
      const response = await fetch("/api/quotes", {
        method: "POST",
        body: new FormData(quoteForm),
        headers: { "Accept": "application/json" },
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(result.message || "We could not send the estimate request.");
      }

      const confirmation = JSON.stringify({
        type: "estimate",
        reference: result.quoteId || "received",
        name: quoteForm.elements.name?.value || "",
        contactMethod: quoteForm.elements.contact_method?.value || "call or text",
        createdAt: Date.now(),
      });
      try { sessionStorage.setItem("junkernautsConfirmation", confirmation); } catch {}
      try { localStorage.setItem("junkernautsConfirmation", confirmation); } catch {}
      window.location.href = "confirmation";
    } catch (error) {
      setStatus(error.message || "Something went wrong. Please call or text 734-480-8190.", "bad");
    } finally {
      if (submitButton) submitButton.disabled = false;
    }
  });
}
