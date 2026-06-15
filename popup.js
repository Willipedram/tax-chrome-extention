const $ = selector => document.querySelector(selector);
const HISTORY_KEY = 'pedramExportHistory';
let current = null;
let config = { fields: [], exportMode: 'single' };

const fa = number => Number(number || 0).toLocaleString('fa-IR');

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function loadConfig() {
  config = await chrome.storage.sync.get({ fields: [], exportMode: 'single' });
}

async function loadHistory() {
  const result = await chrome.storage.local.get({ [HISTORY_KEY]: [] });
  return result[HISTORY_KEY];
}

async function saveHistory(history) {
  await chrome.storage.local.set({ [HISTORY_KEY]: history });
}

function mergeHistory(history, row) {
  const key = row.id || row.values?.[1] || row.url;
  const existingIndex = history.findIndex(item => (item.id || item.values?.[1] || item.url) === key);
  if (existingIndex >= 0) history[existingIndex] = row;
  else history.push(row);
  return history;
}

async function scan() {
  const tab = await activeTab();
  try {
    current = await chrome.tabs.sendMessage(tab.id, { type: 'PEDRAM_GET_DATA' });
  } catch {
    current = null;
  }
  render();
}

function render() {
  const ok = current?.isSupported;
  $('#status').textContent = ok ? 'صفحه قابل استخراج شناسایی شد' : 'صفحه پشتیبانی‌شده نیست';
  $('#counts').textContent = `${fa(current?.fields?.length)} فیلد، ${fa(current?.tables?.length)} جدول`;
  $('#export').disabled = !ok;
  $('#warning').textContent = validate().join('، ');
  renderPreview();
}

function renderPreview() {
  if (!current?.fields?.length) {
    $('#preview').textContent = 'داده‌ای یافت نشد.';
    return;
  }
  const summary = PedramExcelExporter.invoiceSummaryRow(current);
  $('#preview').innerHTML = `<table><thead><tr>${PedramExcelExporter.DEFAULT_HEADERS.map(header => `<th>${header}</th>`).join('')}</tr></thead><tbody><tr>${summary.values.map(value => `<td>${value || '-'}</td>`).join('')}</tr></tbody></table>`;
}

function validate() {
  if (!current) return ['ابتدا صفحه را اسکن کنید'];
  const warnings = [];
  const summary = window.PedramExcelExporter?.invoiceSummaryRow(current);
  if (summary && summary.values.some(value => !value)) warnings.push('چند ستون خروجی خالی است');
  if ((current.fields || []).some(field => !field.value)) warnings.push('چند مقدار خام خالی است');
  const seen = new Set();
  if ((current.fields || []).some(field => {
    const key = `${field.category}:${field.label}`;
    if (seen.has(key)) return true;
    seen.add(key);
    return false;
  })) warnings.push('فیلد تکراری دیده شد');
  return warnings;
}

$('#refresh').onclick = scan;
$('#settings').onclick = () => chrome.runtime.openOptionsPage();
$('#fields').onclick = () => chrome.runtime.openOptionsPage();
$('#export').onclick = async () => {
  await loadConfig();
  const row = PedramExcelExporter.invoiceSummaryRow(current);
  const history = mergeHistory(await loadHistory(), row);
  await saveHistory(history);
  const blob = PedramExcelExporter.makeWorkbook(current, config, history);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `pedram-tax-export-${new Date().toISOString().slice(0, 10)}.xlsx`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

loadConfig().then(scan);
