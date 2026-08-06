(function initPwa() {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  const DISMISS_KEY = "ipl-pwa-dismissed";
  let deferredPrompt = null;
  let bannerEl = null;

  function isStandalone() {
    return (
      window.matchMedia("(display-mode: standalone)").matches ||
      window.navigator.standalone === true
    );
  }

  function isIos() {
    return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
  }

  function isSafari() {
    const ua = window.navigator.userAgent;
    return /safari/i.test(ua) && !/crios|fxios|edgios|chrome|android/i.test(ua);
  }

  function createBanner({ title, text, actionLabel, onAction }) {
    if (bannerEl || sessionStorage.getItem(DISMISS_KEY) === "1" || isStandalone()) {
      return;
    }

    bannerEl = document.createElement("div");
    bannerEl.className = "pwa-banner";
    bannerEl.setAttribute("role", "dialog");
    bannerEl.setAttribute("aria-label", title);
    bannerEl.innerHTML = `
      <div class="pwa-banner-inner">
        <img class="pwa-banner-icon" src="/assets/icons/icon-192.png" width="48" height="48" alt="">
        <div class="pwa-banner-copy">
          <strong>${title}</strong>
          <p>${text}</p>
        </div>
        <div class="pwa-banner-actions">
          ${actionLabel ? `<button type="button" class="btn primary pwa-banner-install">${actionLabel}</button>` : ""}
          <button type="button" class="pwa-banner-close" aria-label="Закрыть">×</button>
        </div>
      </div>
    `;

    document.body.appendChild(bannerEl);

    bannerEl.querySelector(".pwa-banner-close")?.addEventListener("click", () => {
      sessionStorage.setItem(DISMISS_KEY, "1");
      bannerEl.remove();
      bannerEl = null;
    });

    bannerEl.querySelector(".pwa-banner-install")?.addEventListener("click", onAction);
  }

  function showAndroidInstall() {
    createBanner({
      title: "Установить ИПЛ ЧР",
      text: "Добавьте сайт на главный экран — быстрее открывать и удобнее пользоваться.",
      actionLabel: "Установить",
      onAction: async () => {
        if (!deferredPrompt) {
          return;
        }

        deferredPrompt.prompt();
        await deferredPrompt.userChoice;
        deferredPrompt = null;
        sessionStorage.setItem(DISMISS_KEY, "1");
        bannerEl?.remove();
        bannerEl = null;
      }
    });
  }

  function showIosHint() {
    if (!isIos() || !isSafari()) {
      return;
    }

    createBanner({
      title: "На экран «Домой»",
      text: "Нажмите «Поделиться» и выберите «На экран Домой».",
      actionLabel: null
    });
  }

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event;
    showAndroidInstall();
  });

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((error) => {
      console.warn("Service worker registration failed:", error);
    });

    // iOS не даёт beforeinstallprompt — подсказка через пару секунд
    window.setTimeout(showIosHint, 2500);
  });
})();
