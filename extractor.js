(() => {
  'use strict';

  const CATEGORY_ORDER = ['invoice', 'seller', 'buyer', 'payment', 'supplementary'];
  const CATEGORY_TITLES = {
    invoice: 'اطلاعات صورتحساب', seller: 'اطلاعات فروشنده', buyer: 'اطلاعات خریدار', payment: 'اطلاعات پرداخت', supplementary: 'اطلاعات تکمیلی'
  };
  const DICTIONARY = {
    payment: ['پرداخت','مبلغ','ارزش','مالیات','عوارض','تخفیف','نقدی','نسیه','روش پرداخت','تسویه','بانک','مرجع پرداخت','شناسه پرداخت','شماره پیگیری','کارت','vat','tax amount','payment','amount','discount','total','final','bank','reference'],
    seller: ['فروشنده','نام فروشنده','شناسه فروشنده','اقتصادی فروشنده','کد پستی فروشنده','نشانی فروشنده','seller','vendor'],
    buyer: ['خریدار','نام خریدار','شناسه خریدار','اقتصادی خریدار','کد پستی خریدار','نشانی خریدار','buyer','customer'],
    invoice: ['صورتحساب','شماره منحصر','شماره مالیاتی','شماره مرجع','تاریخ صدور','تاریخ صورتحساب','وضعیت','کد رهگیری','invoice','tracking','status','date','reference'],
    supplementary: ['تکمیلی','توضیحات','شرح','قرارداد','یادداشت','سایر','داخلی','supplement','description','note','contract']
  };

  const normalize = (value = '') => String(value).replace(/[\u200c\u200f\u200e]/g, ' ').replace(/\s+/g, ' ').trim();
  const keyify = (value = '') => normalize(value).toLowerCase();
  const visible = el => !!(el && el.offsetParent !== null && getComputedStyle(el).visibility !== 'hidden');
  const text = el => normalize(el?.innerText || el?.textContent || '');
  const uniqueId = (category, label, index = 0) => `${category}:${keyify(label).replace(/[^\p{L}\p{N}]+/gu, '_').slice(0, 80)}:${index}`;

  function categoryFor(label, context = '') {
    const haystack = keyify(`${context} ${label}`);
    const scores = Object.fromEntries(CATEGORY_ORDER.map(c => [c, 0]));
    for (const [category, words] of Object.entries(DICTIONARY)) {
      for (const word of words) if (haystack.includes(keyify(word))) scores[category] += category === 'payment' ? 3 : 2;
    }
    if (/\b(ریال|تومان|irt|rial)\b/i.test(haystack)) scores.payment += 2;
    return Object.entries(scores).sort((a, b) => b[1] - a[1])[0][1] > 0 ? Object.entries(scores).sort((a, b) => b[1] - a[1])[0][0] : 'supplementary';
  }

  function nearestHeading(el) {
    let node = el;
    for (let i = 0; node && i < 4; i++, node = node.parentElement) {
      const heading = node.querySelector?.('h1,h2,h3,h4,h5,h6,.title,.header,.card-title,[class*=title],[class*=Title]');
      const value = text(heading);
      if (value && value.length < 120) return value;
    }
    return '';
  }

  function addField(map, category, label, value, source = 'label') {
    label = normalize(label).replace(/[:：]+$/, ''); value = normalize(value);
    if (!label || !value || label === value || label.length > 140) return;
    const id = uniqueId(category, label, map.size);
    if (![...map.values()].some(f => f.category === category && f.label === label && f.value === value)) {
      map.set(id, { id, category, sectionTitle: CATEGORY_TITLES[category], label, value, source });
    }
  }

  function scanKeyValues(root, map) {
    root.querySelectorAll('label,dt,th,strong,b,span,div,p').forEach(el => {
      if (!visible(el)) return;
      const label = text(el);
      if (!label || label.length > 90) return;
      let value = '';
      const aria = el.getAttribute('for') && root.getElementById?.(el.getAttribute('for'));
      if (aria) value = aria.value || text(aria);
      if (!value && el.nextElementSibling) value = text(el.nextElementSibling);
      if (!value && el.parentElement) {
        const parts = [...el.parentElement.children].filter(visible).map(text).filter(Boolean);
        if (parts.length === 2 && parts[0] === label) value = parts[1];
      }
      if (value) addField(map, categoryFor(label, nearestHeading(el)), label, value, 'semantic');
    });
  }

  function scanTables(root) {
    const tables = [];
    root.querySelectorAll('table').forEach((table, tableIndex) => {
      if (!visible(table)) return;
      const rows = [...table.rows].map(row => [...row.cells].map(cell => text(cell))).filter(row => row.some(Boolean));
      if (!rows.length) return;
      let headers = rows[0];
      const hasHeader = [...table.rows[0].cells].some(c => c.tagName === 'TH') || headers.some(h => /نام|مبلغ|تاریخ|شماره|شناسه|روش|کد|شرح|amount|date|name/i.test(h));
      const dataRows = hasHeader ? rows.slice(1) : rows;
      const context = `${nearestHeading(table)} ${headers.join(' ')}`;
      const category = categoryFor(headers.join(' '), context);
      const normalizedRows = dataRows.map((row, rowIndex) => {
        const record = {};
        row.forEach((value, colIndex) => { record[headers[colIndex] || `ستون ${colIndex + 1}`] = value; });
        return { rowIndex: rowIndex + 1, values: record };
      });
      tables.push({ id: `table:${category}:${tableIndex}`, category, sectionTitle: CATEGORY_TITLES[category], title: nearestHeading(table) || CATEGORY_TITLES[category], headers, rows: normalizedRows });
    });
    return tables;
  }

  function detectPage(data) {
    const hostOk = /(^|\.)tax\.gov\.ir$/i.test(location.hostname) || location.hostname === 'hardcore-char-endd.pagedrop.io';
    const pageText = keyify(document.body.innerText || '');
    const score = ['صورتحساب','خریدار','فروشنده','پرداخت','مالیات','invoice','payment'].reduce((s, w) => s + (pageText.includes(keyify(w)) ? 1 : 0), 0);
    return hostOk && (score >= 2 || data.tables.length || data.fields.length >= 3);
  }

  function extract(root = document) {
    const map = new Map();
    scanKeyValues(root, map);
    const tables = scanTables(root);
    const fields = [...map.values()].sort((a, b) => CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category));
    const data = { url: location.href, title: document.title, extractedAt: new Date().toISOString(), categories: CATEGORY_TITLES, fields, tables };
    data.isSupported = detectPage(data);
    return data;
  }

  window.PedramTaxExtractor = { extract, CATEGORY_ORDER, CATEGORY_TITLES };
})();
