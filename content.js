(() => {
  const STYLE_ID = "grammarly-blur-toggle-style";
  const MARKER = "data-grammarly-blur-toggle";
  let enabled = false;
  let observer;

  function hasBlur(element) {
    const style = getComputedStyle(element);
    return /blur\(/i.test(style.filter) || /blur\(/i.test(style.webkitFilter);
  }

  function markBlurredElements() {
    document.querySelectorAll("*").forEach((element) => {
      if (hasBlur(element)) element.setAttribute(MARKER, "true");
    });
  }

  function setEnabled(nextEnabled) {
    enabled = nextEnabled;
    document.getElementById(STYLE_ID)?.remove();

    if (enabled) {
      const style = document.createElement("style");
      style.id = STYLE_ID;
      style.textContent = `
        [${MARKER}="true"] {
          filter: none !important;
          -webkit-filter: none !important;
          text-shadow: none !important;
          opacity: 1 !important;
        }
      `;
      (document.head || document.documentElement).appendChild(style);
    }

    chrome.storage.local.set({ enabled });
  }

  function start() {
    markBlurredElements();
    observer = new MutationObserver(() => markBlurredElements());
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "style"]
    });
  }

  chrome.storage.local.get({ enabled: false }, ({ enabled: savedEnabled }) => {
    start();
    setEnabled(savedEnabled);
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === "set-enabled") {
      setEnabled(Boolean(message.enabled));
      sendResponse({ enabled });
    }
    if (message.type === "get-enabled") sendResponse({ enabled });
    return true;
  });
})();
