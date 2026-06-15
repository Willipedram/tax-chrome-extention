const $ = selector => document.querySelector(selector);
let fields = [];
let saved = { fields: [], exportMode: 'single', quickExportEnabled: false, setupComplete: false };

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}


async function requestPageData(tab) {
  try {
    return await chrome.tabs.sendMessage(tab.id, { type: 'PEDRAM_GET_DATA' });
  } catch {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['extractor.js', 'content.js'] });
    return chrome.tabs.sendMessage(tab.id, { type: 'PEDRAM_GET_DATA' });
  }
}

async function init() {
  saved = await chrome.storage.sync.get({ fields: [], exportMode: 'single', quickExportEnabled: false, setupComplete: false });
  $('#mode').value = saved.exportMode;
  $('#quick').checked = saved.quickExportEnabled;
  fields = saved.fields;
  render();
}

function merge(discovered) {
  const byId = new Map(saved.fields.map(field => [field.id, field]));
  fields = discovered
    .map((field, index) => ({
      id: field.id,
      label: field.label,
      category: field.category,
      sectionTitle: field.sectionTitle,
      sampleValue: field.value || byId.get(field.id)?.sampleValue || '',
      enabled: byId.get(field.id)?.enabled ?? true,
      order: byId.get(field.id)?.order ?? index
    }))
    .sort((a, b) => a.order - b.order);
}

function render() {
  const query = $('#search').value?.trim() || '';
  const list = fields.filter(field => !query || `${field.label} ${field.sectionTitle}`.includes(query));
  $('#fields').innerHTML = list.length
    ? list.map(field => `<div class="field" data-id="${field.id}"><input type="checkbox" ${field.enabled ? 'checked' : ''}><div><strong>${field.label}</strong><div class="muted">${field.sectionTitle}</div><div class="value-sample">${field.sampleValue || 'بدون مقدار نمونه'}</div></div><div><button class="btn ghost up">↑</button><button class="btn ghost down">↓</button></div></div>`).join('')
    : 'فیلدی ثبت نشده است.';
  document.querySelectorAll('.field').forEach(element => {
    const id = element.dataset.id;
    element.querySelector('input').onchange = event => { fields.find(field => field.id === id).enabled = event.target.checked; };
    element.querySelector('.up').onclick = () => move(id, -1);
    element.querySelector('.down').onclick = () => move(id, 1);
  });
}

function move(id, delta) {
  const index = fields.findIndex(field => field.id === id);
  const next = index + delta;
  if (next < 0 || next >= fields.length) return;
  [fields[index], fields[next]] = [fields[next], fields[index]];
  fields.forEach((field, order) => { field.order = order; });
  render();
}

$('#search').oninput = render;
$('#scan').onclick = async () => {
  const tab = await activeTab();
  const data = await requestPageData(tab);
  merge(data.fields || []);
  render();
};
$('#save').onclick = async () => {
  fields.forEach((field, order) => { field.order = order; });
  await chrome.storage.sync.set({ fields, exportMode: $('#mode').value, quickExportEnabled: $('#quick').checked, setupComplete: true });
  $('#save').textContent = 'ذخیره شد ✓';
  setTimeout(() => { $('#save').textContent = 'ذخیره تنظیمات'; }, 1200);
};

init();
