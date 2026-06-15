const $ = selector => document.querySelector(selector);
const HISTORY_KEY = 'pedramExportHistory';
const EXPORT_SCHEMA_VERSION = 4;
let current = null;
let config = { fields: [], exportMode: 'single', quickExportEnabled: false, setupComplete: false };
let autoExportAttempted = false;

const fa = number => Number(number || 0).toLocaleString('fa-IR');

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function loadConfig() {
  config = await chrome.storage.sync.get({ fields: [], exportMode: 'single', quickExportEnabled: false, setupComplete: false });
}

async function loadHistory() {
  const result = await chrome.storage.local.get({ [HISTORY_KEY]: [] });
  const history = result[HISTORY_KEY].filter(item => item.schemaVersion === EXPORT_SCHEMA_VERSION);
  if (history.length !== result[HISTORY_KEY].length) await saveHistory(history);
  return history;
}

async function saveHistory(history) {
  await chrome.storage.local.set({ [HISTORY_KEY]: history });
}

function mergeHistory(history, row) {
  row.schemaVersion = EXPORT_SCHEMA_VERSION;
  const key = row.id || row.values?.[1] || row.url;
  const existingIndex = history.findIndex(item => (item.id || item.values?.[1] || item.url) === key);
  if (existingIndex >= 0) history[existingIndex] = row;
  else history.push(row);
  return history;
}

function csvEscape(value) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function makeSheetsCsv(history) {
  const headers = PedramExcelExporter.outputHeaders(config, history);
  const rows = [headers, ...history.map(item => headers.map((_, index) => item.values?.[index] || ''))];
  return `\uFEFF${rows.map(row => row.map(csvEscape).join(',')).join('\n')}`;
}

function makeSheetsTsv(history) {
  const headers = PedramExcelExporter.outputHeaders(config, history);
  const rows = [headers, ...history.map(item => headers.map((_, index) => item.values?.[index] || ''))];
  return rows.map(row => row.map(value => String(value ?? '').replace(/[\t\r\n]+/g, ' ')).join('\t')).join('\n');
}

async function currentHistoryWithRow() {
  const row = PedramExcelExporter.configuredRow(current, config);
  const history = mergeHistory(await loadHistory(), row);
  await saveHistory(history);
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
  maybeAutoExport();
}

async function render() {
  const history = await loadHistory();
  const ok = current?.isSupported;
  $('#status').textContent = ok ? 'صفحه قابل استخراج شناسایی شد' : 'صفحه پشتیبانی‌شده نیست';
  $('#fieldCount').textContent = fa(current?.fields?.length);
  $('#tableCount').textContent = fa(current?.tables?.length);
  $('#historyCount').textContent = fa(history.length);
  $('#export').disabled = !ok;
  $('#sheets').disabled = !ok;
  $('#warning').textContent = validate().join('، ');
  renderPreview();
}

function renderPreview() {
  if (!current?.fields?.length) {
    $('#preview').textContent = 'داده‌ای یافت نشد.';
    return;
  }
  const summary = PedramExcelExporter.configuredRow(current, config);
  const headers = PedramExcelExporter.outputHeaders(config, [summary]);
  $('#preview').innerHTML = `<table><thead><tr>${headers.map(header => `<th>${header}</th>`).join('')}</tr></thead><tbody><tr>${summary.values.map(value => `<td>${value || '-'}</td>`).join('')}</tr></tbody></table>`;
}

function validate() {
  if (!current) return ['ابتدا صفحه را اسکن کنید'];
  const warnings = [];
  const summary = window.PedramExcelExporter?.configuredRow(current, config);
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

async function exportExcel() {
  await loadConfig();
  const history = await currentHistoryWithRow();
  const blob = PedramExcelExporter.makeWorkbook(current, config, history);
  downloadBlob(blob, `tax-invoice-export-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

async function exportSheetsCsv() {
  await loadConfig();
  const history = await currentHistoryWithRow();
  const tsv = makeSheetsTsv(history);
  try {
    await navigator.clipboard.writeText(tsv);
    $('#warning').textContent = 'داده‌ها کپی شد؛ در تب Google Sheets با Ctrl+V جای‌گذاری کنید.';
  } catch {
    const blob = new Blob([makeSheetsCsv(history)], { type: 'text/csv;charset=utf-8' });
    downloadBlob(blob, `tax-invoice-google-sheets-${new Date().toISOString().slice(0, 10)}.csv`);
    $('#warning').textContent = 'کپی خودکار ممکن نبود؛ فایل CSV دانلود شد.';
  }
  chrome.tabs.create({ url: 'https://docs.google.com/spreadsheets/create' });
}

async function maybeAutoExport() {
  if (autoExportAttempted || !current?.isSupported || !config.quickExportEnabled || !config.setupComplete) return;
  autoExportAttempted = true;
  await exportExcel();
}

$('#refresh').onclick = scan;
$('#settings').onclick = () => chrome.runtime.openOptionsPage();
$('#fields').onclick = () => chrome.runtime.openOptionsPage();
$('#export').onclick = exportExcel;
$('#sheets').onclick = exportSheetsCsv;

loadConfig().then(scan);
