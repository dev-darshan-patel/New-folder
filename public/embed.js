/* Booking embed loader. Paste once on any site:
 *   Inline:  <div data-booking="slug/event" data-accent="#4f46e5" data-font="Poppins"></div>
 *   Popup:   <button data-booking-popup="slug/event">Book now</button>
 *   <script src="https://YOURAPP/embed.js" async></script>
 */
(function () {
  var script = document.currentScript;
  // Fall back to scanning script tags if currentScript is unavailable (async).
  if (!script) {
    var tags = document.getElementsByTagName("script");
    for (var i = tags.length - 1; i >= 0; i--) {
      if (tags[i].src && tags[i].src.indexOf("embed.js") !== -1) {
        script = tags[i];
        break;
      }
    }
  }
  var origin = new URL(script.src).origin;

  function buildUrl(path, accent, font) {
    var url = origin + "/" + String(path).replace(/^\//, "") + "?embed=1";
    if (accent) url += "&accent=" + encodeURIComponent(accent.replace(/^#/, ""));
    if (font) url += "&font=" + encodeURIComponent(font);
    return url;
  }

  function makeIframe(url, minHeight) {
    var iframe = document.createElement("iframe");
    iframe.src = url;
    iframe.title = "Booking";
    iframe.style.width = "100%";
    iframe.style.border = "0";
    iframe.style.minHeight = (minHeight || 600) + "px";
    iframe.style.colorScheme = "normal";
    return iframe;
  }

  // Inline embeds.
  var inlines = document.querySelectorAll("[data-booking]");
  for (var a = 0; a < inlines.length; a++) {
    (function (el) {
      if (el.getAttribute("data-booking-init")) return;
      el.setAttribute("data-booking-init", "1");
      var url = buildUrl(
        el.getAttribute("data-booking"),
        el.getAttribute("data-accent"),
        el.getAttribute("data-font"),
      );
      el.appendChild(makeIframe(url));
    })(inlines[a]);
  }

  // Auto-resize iframes from height messages posted by the booking page.
  window.addEventListener("message", function (e) {
    if (!e.data || e.data.type !== "booking-embed:height") return;
    var frames = document.getElementsByTagName("iframe");
    for (var f = 0; f < frames.length; f++) {
      if (frames[f].contentWindow === e.source) {
        frames[f].style.height = e.data.height + "px";
      }
    }
  });

  // Popup buttons.
  function openPopup(url) {
    var overlay = document.createElement("div");
    overlay.style.cssText =
      "position:fixed;inset:0;background:rgba(15,23,42,.6);z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px;";
    var box = document.createElement("div");
    box.style.cssText =
      "background:#fff;border-radius:16px;max-width:680px;width:100%;max-height:90vh;overflow:auto;position:relative;box-shadow:0 20px 60px rgba(0,0,0,.3);";
    var close = document.createElement("button");
    close.textContent = "✕";
    close.setAttribute("aria-label", "Close");
    close.style.cssText =
      "position:absolute;top:10px;right:14px;border:0;background:transparent;font-size:18px;line-height:1;cursor:pointer;color:#475569;z-index:1;";
    box.appendChild(close);
    box.appendChild(makeIframe(url));
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    function done() {
      overlay.remove();
    }
    close.addEventListener("click", done);
    overlay.addEventListener("click", function (e) {
      if (e.target === overlay) done();
    });
  }

  var popups = document.querySelectorAll("[data-booking-popup]");
  for (var b = 0; b < popups.length; b++) {
    (function (btn) {
      if (btn.getAttribute("data-booking-init")) return;
      btn.setAttribute("data-booking-init", "1");
      btn.addEventListener("click", function () {
        openPopup(
          buildUrl(
            btn.getAttribute("data-booking-popup"),
            btn.getAttribute("data-accent"),
            btn.getAttribute("data-font"),
          ),
        );
      });
    })(popups[b]);
  }
})();
