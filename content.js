(() => {
  'use strict';

  let latest = null;
  let timer = 0;
  let extensionAlive = true;

  function canUseRuntime() {
    try {
      return extensionAlive && typeof chrome !== 'undefined' && !!chrome.runtime?.id;
    } catch {
      extensionAlive = false;
      return false;
    }
  }

  function safeSendScanResult(payload) {
    if (!canUseRuntime()) return;
    try {
      chrome.runtime.sendMessage({ type: 'PEDRAM_SCAN_RESULT', payload }, () => {
        if (chrome.runtime.lastError) extensionAlive = false;
      });
    } catch {
      extensionAlive = false;
    }
  }

  const scan = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      latest = window.PedramTaxExtractor.extract(document);
      safeSendScanResult(latest);
    }, 250);
  };

  if (canUseRuntime()) {
    try {
      chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
        if (message?.type === 'PEDRAM_GET_DATA') {
          latest = window.PedramTaxExtractor.extract(document);
          sendResponse(latest);
        }
        return true;
      });
    } catch {
      extensionAlive = false;
    }
  }

  new MutationObserver(scan).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  scan();
})();
