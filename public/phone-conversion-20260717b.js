function gtag_report_conversion(url) {
  var navigationStarted = false;
  var fallbackTimer;
  var callback = function () {
    if (navigationStarted) return;
    navigationStarted = true;
    if (typeof fallbackTimer !== "undefined") window.clearTimeout(fallbackTimer);
    if (typeof url !== "undefined") {
      window.location = url;
    }
  };

  if (typeof window.gtag === "function") {
    // Calling must still work if Google is blocked, slow, or throws an error.
    fallbackTimer = window.setTimeout(callback, 1600);
    try {
      window.gtag("event", "conversion", {
        send_to: "AW-18197209529/D7xnCIHd_tEcELnDjeVD",
        value: 1.0,
        currency: "USD",
        event_callback: callback,
        event_timeout: 1500
      });
    } catch (error) {
      callback();
    }
  } else {
    callback();
  }

  return false;
}
