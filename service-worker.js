chrome.runtime.onInstalled.addListener(() => chrome.action.setBadgeBackgroundColor({ color: '#00796b' }));
chrome.runtime.onMessage.addListener((message, sender) => {
  if (message?.type === 'PEDRAM_SCAN_RESULT' && sender.tab?.id) {
    chrome.action.setBadgeText({ tabId: sender.tab.id, text: message.payload?.isSupported ? '✓' : '' });
    chrome.action.setTitle({ tabId: sender.tab.id, title: message.payload?.isSupported ? 'صفحه قابل استخراج است' : 'Tax Invoice Exporter' });
  }
});
