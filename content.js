(() => {
  'use strict';
  let latest = null;
  let timer = 0;
  const scan = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      latest = window.PedramTaxExtractor.extract(document);
      chrome.runtime.sendMessage({ type: 'PEDRAM_SCAN_RESULT', payload: latest }).catch(() => {});
    }, 250);
  };
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === 'PEDRAM_GET_DATA') { latest = window.PedramTaxExtractor.extract(document); sendResponse(latest); }
    return true;
  });
  new MutationObserver(scan).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  scan();
})();
