/**
 * main.js — orchestrates everything
 * Injects bridge, waits for DOM, handles URL changes.
 */

(function () {
  // Inline conversation.js helpers (already loaded via manifest order,
  // but referenced here for clarity about load order dependencies)

  function waitForElement(selector, timeoutMs = 10000) {
    return new Promise((resolve, reject) => {
      const el = document.querySelector(selector);
      if (el) { resolve(el); return; }
      const observer = new MutationObserver(() => {
        const found = document.querySelector(selector);
        if (found) { observer.disconnect(); resolve(found); }
      });
      observer.observe(document.documentElement, { childList: true, subtree: true });
      setTimeout(() => {
        observer.disconnect();
        reject(new Error(`Timeout waiting for ${selector}`));
      }, timeoutMs);
    });
  }

  async function init() {
    // 1. Inject the page-context bridge
    BridgeClient.inject();

    // 2. Wait for Claude's main content to exist
    try {
      await waitForElement('main', 8000);
    } catch (_) {
      // Claude might use a different selector — continue anyway
    }

    // 3. Mount the UI
    UI.init();

    // 4. Listen for URL changes (SPA navigation)
    window.addEventListener('ct:urlchange', () => {
      UI.onUrlChange();
    });

    // Also watch with polling as a fallback
    let lastUrl = window.location.href;
    setInterval(() => {
      if (window.location.href !== lastUrl) {
        lastUrl = window.location.href;
        UI.onUrlChange();
      }
    }, 500);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
