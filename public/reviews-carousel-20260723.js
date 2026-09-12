(() => {
  const root = document.querySelector("[data-review-carousel]");
  const stage = root?.querySelector("[data-review-stage]");
  const previousButton = root?.querySelector("[data-review-previous]");
  const nextButton = root?.querySelector("[data-review-next]");
  const dotsContainer = root?.querySelector("[data-review-dots]");
  const status = root?.querySelector("[data-review-status]");
  const googleRating = document.querySelector("[data-google-rating]");
  const googleCount = document.querySelector("[data-google-count]");

  if (!root || !stage || !previousButton || !nextButton || !dotsContainer) return;

  const refreshEvery = 5 * 60 * 1000;
  const rotateEvery = 6500;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let slides = [];
  let activeIndex = 0;
  let rotateTimer = 0;
  let signature = "";
  let paused = false;

  const pluralizeReviews = (count) => `${count} customer review${count === 1 ? "" : "s"}`;

  const stars = (rating) => {
    const rounded = Math.max(1, Math.min(5, Math.round(Number(rating) || 5)));
    return "\u2605".repeat(rounded);
  };

  const reviewDate = (value) => {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return new Intl.DateTimeFormat("en-US", {
      month: "long",
      year: "numeric",
    }).format(date);
  };

  const buildCard = (review) => {
    const card = document.createElement("a");
    const sourceRow = document.createElement("div");
    const source = document.createElement("span");
    const starRow = document.createElement("span");
    const quote = document.createElement("blockquote");
    const meta = document.createElement("div");
    const authorRow = document.createElement("div");
    const metaCopy = document.createElement("div");
    const author = document.createElement("strong");
    const details = document.createElement("span");
    const linkText = document.createElement("span");

    card.className = "review-card";
    card.href = review.reviewUrl;
    card.target = "_blank";
    card.rel = "noopener noreferrer";
    card.dataset.reviewId = review.id;
    card.setAttribute("aria-label", `Read ${review.author}'s complete review on Google`);

    sourceRow.className = "review-source-row";
    source.className = "review-source";
    source.textContent = "Google Review";
    starRow.className = "review-stars";
    starRow.textContent = stars(review.rating);
    starRow.setAttribute("aria-label", `${review.rating} out of 5 stars`);
    sourceRow.append(source, starRow);

    quote.textContent = `\u201c${review.comment}\u201d`;

    meta.className = "review-meta";
    authorRow.className = "review-author";
    metaCopy.className = "review-score-copy";
    author.textContent = review.author;
    details.textContent = ["Google customer", reviewDate(review.createTime)].filter(Boolean).join(" \u00b7 ");
    metaCopy.append(author, details);

    if (review.authorPhoto) {
      const avatar = document.createElement("img");
      avatar.className = "review-avatar";
      avatar.src = review.authorPhoto;
      avatar.alt = "";
      avatar.width = 42;
      avatar.height = 42;
      avatar.loading = "lazy";
      avatar.referrerPolicy = "no-referrer";
      authorRow.append(avatar);
    }

    authorRow.append(metaCopy);
    meta.append(authorRow);

    linkText.className = "review-full-link";
    linkText.textContent = "Read the complete review \u2192";
    card.append(sourceRow, quote, meta, linkText);
    return card;
  };

  const restartRotation = () => {
    window.clearInterval(rotateTimer);
    if (reduceMotion || paused || slides.length < 2) return;
    rotateTimer = window.setInterval(() => show(activeIndex + 1, false), rotateEvery);
  };

  const updateDots = () => {
    dotsContainer.replaceChildren();
    slides.forEach((slide, index) => {
      const dot = document.createElement("button");
      dot.className = `review-dot${index === activeIndex ? " is-active" : ""}`;
      dot.type = "button";
      dot.setAttribute("aria-label", `Show review ${index + 1}`);
      dot.setAttribute("aria-current", index === activeIndex ? "true" : "false");
      dot.addEventListener("click", () => {
        show(index, true);
        restartRotation();
      });
      dotsContainer.append(dot);
    });
  };

  function show(nextIndex, announce = true) {
    const total = slides.length;
    if (!total) return;

    activeIndex = (nextIndex + total) % total;
    const previousIndex = total > 2 ? (activeIndex - 1 + total) % total : -1;
    const followingIndex = total > 1 ? (activeIndex + 1) % total : -1;

    slides.forEach((slide, index) => {
      slide.classList.remove("is-active", "is-prev", "is-next");
      slide.setAttribute("aria-hidden", "true");
      slide.tabIndex = -1;

      if (index === activeIndex) {
        slide.classList.add("is-active");
        slide.setAttribute("aria-hidden", "false");
        slide.tabIndex = 0;
      } else if (index === previousIndex) {
        slide.classList.add("is-prev");
        slide.setAttribute("aria-hidden", "false");
      } else if (index === followingIndex) {
        slide.classList.add("is-next");
        slide.setAttribute("aria-hidden", "false");
      }
    });

    root.querySelectorAll(".review-dot").forEach((dot, index) => {
      const isActive = index === activeIndex;
      dot.classList.toggle("is-active", isActive);
      dot.setAttribute("aria-current", isActive ? "true" : "false");
    });

    if (announce && status) status.textContent = `Showing review ${activeIndex + 1} of ${total}.`;
  }

  const bindSlideClicks = () => {
    slides.forEach((slide, index) => {
      slide.addEventListener("click", (event) => {
        if (index === activeIndex) return;
        event.preventDefault();
        show(index);
        restartRotation();
      });
    });
  };

  const useStageSlides = () => {
    slides = Array.from(stage.querySelectorAll(".review-card"));
    signature = slides.map((slide) => slide.dataset.reviewId || slide.textContent.trim()).join("|");
    bindSlideClicks();
    updateDots();
    show(0, false);
    restartRotation();
    if (slides.length) root.classList.add("is-ready");
  };

  const renderReviews = (payload) => {
    if (!Array.isArray(payload.reviews) || !payload.reviews.length) return;
    const nextSignature = payload.reviews.map((review) => review.id).join("|");
    if (nextSignature === signature) return;

    stage.replaceChildren(...payload.reviews.map(buildCard));
    slides = Array.from(stage.querySelectorAll(".review-card"));
    signature = nextSignature;
    activeIndex = 0;
    bindSlideClicks();
    updateDots();
    show(0, false);
    restartRotation();
    root.classList.add("is-ready");

    if (googleRating && payload.averageRating) {
      googleRating.textContent = `${Number(payload.averageRating).toFixed(1)} on Google`;
    }
    if (googleCount && Number.isFinite(Number(payload.totalReviewCount))) {
      googleCount.textContent = pluralizeReviews(Number(payload.totalReviewCount));
    }
  };

  const loadReviews = async () => {
    try {
      const response = await fetch("/api/reviews", {
        headers: {
          "Accept": "application/json",
        },
      });
      if (!response.ok) return;
      renderReviews(await response.json());
    } catch {
      // The static cards remain usable if the live Google feed is unavailable.
    }
  };

  previousButton.addEventListener("click", () => {
    show(activeIndex - 1);
    restartRotation();
  });

  nextButton.addEventListener("click", () => {
    show(activeIndex + 1);
    restartRotation();
  });

  root.addEventListener("mouseenter", () => {
    paused = true;
    restartRotation();
  });

  root.addEventListener("mouseleave", () => {
    paused = false;
    restartRotation();
  });

  root.addEventListener("focusin", () => {
    paused = true;
    restartRotation();
  });

  root.addEventListener("focusout", (event) => {
    if (root.contains(event.relatedTarget)) return;
    paused = false;
    restartRotation();
  });

  document.addEventListener("visibilitychange", () => {
    paused = document.hidden;
    restartRotation();
  });

  useStageSlides();
  loadReviews();
  window.setInterval(loadReviews, refreshEvery);
})();
