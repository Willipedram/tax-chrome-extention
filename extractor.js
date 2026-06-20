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
  const PAYMENT_METHOD_PATTERN = /(?:نقدی|نقد|اقساط|اقسات|نسیه|اعتباری|تهاتر|کارت|انتقال\s*بانکی|واریز|چک|pos|cash|credit|installment)/iu;
  const PAYMENT_METHOD_LABEL_PATTERN = /روش\s*(?:پرداخت|تسویه)|نحوه\s*تسویه|نوع\s*تسویه/iu;
  const visible = el => !!(el && el.offsetParent !== null && getComputedStyle(el).visibility !== 'hidden');
  const text = el => normalize(el?.innerText || el?.textContent || '');
  const uniqueId = (category, label) => `${category}:${keyify(label).replace(/[^\p{L}\p{N}]+/gu, '_').slice(0, 100)}`;

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
    if (!label || !value || label === value || label.length > 140 || value.length > 260) return;
    const id = uniqueId(category, label);
    const existing = map.get(id);
    if (!existing || existing.value.length > value.length) {
      map.set(id, { id, category, sectionTitle: CATEGORY_TITLES[category], label, value, source });
    }
  }

  function isLeafish(el) {
    if (!el) return false;
    const visibleChildren = [...el.children].filter(visible);
    return visibleChildren.length <= 1 || text(el).length < 140;
  }

  function looksLikeLabel(label) {
    const value = normalize(label);
    if (!value || value.length > 100) return false;
    if (/[:：]$/.test(value)) return true;
    return Object.values(DICTIONARY).flat().some(word => keyify(value).includes(keyify(word))) ||
      ['شماره مالیاتی', 'نام فروشنده', 'نام خریدار', 'مبلغ واحد', 'مجموع صورتحساب', 'مجموع مالیات بر ارزش افزوده', 'مجموع مبلغ قبل از کسر تخفیف', 'مجموع مبلغ پس از کسر تخفیف'].some(token => value.includes(token));
  }

  function findNearbyValue(labelEl, root) {
    const forTarget = labelEl.getAttribute?.('for') && root.getElementById?.(labelEl.getAttribute('for'));
    if (forTarget) return forTarget.value || text(forTarget);
    const directSibling = labelEl.nextElementSibling;
    if (directSibling && visible(directSibling) && isLeafish(directSibling)) return text(directSibling);
    const parent = labelEl.parentElement;
    if (!parent) return '';
    const siblings = [...parent.children].filter(visible);
    const index = siblings.indexOf(labelEl);
    if (index >= 0 && siblings[index + 1] && isLeafish(siblings[index + 1])) return text(siblings[index + 1]);
    if (siblings.length === 2 && isLeafish(siblings[1])) return text(siblings[1]);
    const gridParent = labelEl.closest?.('.MuiGrid-container, [class*="MuiGrid-container"], li, .MuiListItem-root, [class*="MuiListItem-root"]');
    const gridChildren = gridParent ? [...gridParent.children].filter(visible) : [];
    const gridIndex = gridChildren.indexOf(labelEl);
    if (gridIndex >= 0 && gridChildren[gridIndex + 1]) return text(gridChildren[gridIndex + 1]);
    return '';
  }

  function scanKeyValues(root, map) {
    root.querySelectorAll('label,dt,th,strong,b,[aria-label],.MuiGrid-item,[class*="MuiGrid-item"],li').forEach(el => {
      if (!visible(el) || !isLeafish(el)) return;
      const label = text(el);
      if (!looksLikeLabel(label)) return;
      const value = findNearbyValue(el, root);
      if (value) addField(map, categoryFor(label, nearestHeading(el)), label, value, 'semantic-pair');
    });
  }

  function scanStructuredPairs(root, map) {
    root.querySelectorAll('.MuiGrid-container, .MuiListItem-root, [class*="MuiGrid-container"], [class*="MuiListItem-root"]').forEach(container => {
      if (!visible(container)) return;
      const children = [...container.children].filter(visible);
      for (let i = 0; i < children.length - 1; i++) {
        const label = text(children[i]);
        const value = text(children[i + 1]);
        if (!looksLikeLabel(label) || !value || label === value || value.length > 220) continue;
        addField(map, categoryFor(label, nearestHeading(container)), label, value, 'mui-grid');
      }
    });
  }


  function cleanPaymentMethodValue(value) {
    const textValue = normalize(value).replace(/^.*?(?:روش\s*(?:پرداخت|تسویه)|نحوه\s*تسویه|نوع\s*تسویه)\s*[:：-]?\s*/u, '');
    const match = textValue.match(PAYMENT_METHOD_PATTERN);
    if (match?.[0]) return normalize(match[0]);
    const firstPart = normalize(textValue.split(/[،,;؛\n|]/u)[0]);
    return firstPart.length <= 24 && !/\s{2,}|مشخصات|صورتحساب|خریدار|فروشنده|مجموع/.test(firstPart) ? firstPart : '';
  }

  function scanPaymentMethod(root, map) {
    root.querySelectorAll('li, .MuiListItem-root, [class*="MuiListItem-root"], .MuiGrid-container, [class*="MuiGrid-container"]').forEach(container => {
      if (!visible(container)) return;
      const rowText = text(container);
      if (!PAYMENT_METHOD_LABEL_PATTERN.test(rowText)) return;
      const children = [...container.children].filter(visible);
      for (let i = 0; i < children.length - 1; i++) {
        const label = text(children[i]);
        if (!PAYMENT_METHOD_LABEL_PATTERN.test(label)) continue;
        const value = cleanPaymentMethodValue(text(children[i + 1]));
        if (value) addField(map, 'payment', label, value, 'payment-method');
      }
      const inline = rowText.match(/((?:روش\s*(?:پرداخت|تسویه)|نحوه\s*تسویه|نوع\s*تسویه))\s*[:：-]?\s*([^،,;؛\n|]+)/iu);
      if (inline?.[1] && inline?.[2]) {
        const value = cleanPaymentMethodValue(inline[2]);
        if (value) addField(map, 'payment', inline[1], value, 'payment-method');
      }
    });
  }

  function scanTotalSummary(root, map) {
    root.querySelectorAll('h1,h2,h3,h4,h5,h6').forEach(heading => {
      if (text(heading) !== 'جمع کل') return;
      let section = heading.parentElement;
      let summarySection = null;
      for (let depth = 0; section && depth < 6; depth++, section = section.parentElement) {
        const sectionText = text(section);
        if (sectionText.includes('مجموع مالیات بر ارزش افزوده') && sectionText.includes('مجموع صورتحساب')) { summarySection = section; break; }
      }
      section = summarySection;
      if (!section) return;
      section.querySelectorAll('li, .MuiListItem-root, [class*="MuiListItem-root"], .MuiGrid-container, [class*="MuiGrid-container"]').forEach(row => {
        const children = [...row.children].filter(visible);
        for (let i = 0; i < children.length - 1; i++) {
          const label = text(children[i]);
          const value = text(children[i + 1]);
          if (!looksLikeLabel(label) || !/[0-9۰-۹٠-٩]/.test(value)) continue;
          addField(map, 'payment', label, value, 'total-summary');
        }
      });
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
    const hostOk = /(^|\.)tax\.gov\.ir$/i.test(location.hostname) || /(^|\.)pagedrop\.io$/i.test(location.hostname);
    const pageText = keyify(document.body.innerText || '');
    const score = ['صورتحساب','خریدار','فروشنده','پرداخت','مالیات','invoice','payment'].reduce((s, w) => s + (pageText.includes(keyify(w)) ? 1 : 0), 0);
    return hostOk && (score >= 2 || data.tables.length || data.fields.length >= 3);
  }

  function extract(root = document) {
    const map = new Map();
    scanKeyValues(root, map);
    scanStructuredPairs(root, map);
    scanPaymentMethod(root, map);
    scanTotalSummary(root, map);
    const tables = scanTables(root);
    const fields = [...map.values()].sort((a, b) => CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category));
    const data = { url: location.href, title: document.title, extractedAt: new Date().toISOString(), categories: CATEGORY_TITLES, fields, tables };
    data.isSupported = detectPage(data);
    return data;
  }

  window.PedramTaxExtractor = { extract, CATEGORY_ORDER, CATEGORY_TITLES };
})();
