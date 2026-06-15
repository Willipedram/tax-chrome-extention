(() => {
  'use strict';

  const enc = new TextEncoder();
  const DEFAULT_HEADERS = [
    'نام فروشنده/حق‌العمل کار',
    'شماره مالیاتی صورتحساب',
    'مبلغ واحد',
    'تعداد/مقدار',
    'مجموع مالیات بر ارزش افزوده',
    'مجموع مبلغ پس از کسر تخفیف',
    'مجموع صورتحساب'
  ];
  const CATEGORY_ORDER = ['invoice', 'seller', 'buyer', 'payment', 'supplementary'];
  const moneyWords = ['مبلغ', 'بها', 'جمع', 'کل', 'نهایی', 'قابل پرداخت', 'ریال', 'amount', 'total', 'price'];

  const xml = value => String(value ?? '').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '').replace(/[<>&\"']/g, char => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[char]));
  const normalize = value => String(value ?? '').replace(/[\u200c\u200f\u200e]/g, ' ').replace(/\s+/g, ' ').trim();
  const keyify = value => normalize(value).toLowerCase();
  const col = index => {
    let label = '';
    for (let n = index + 1; n; n = Math.floor((n - 1) / 26)) label = String.fromCharCode(65 + ((n - 1) % 26)) + label;
    return label;
  };

  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc32 = data => {
    let c = 0xffffffff;
    for (const b of data) c = crcTable[(c ^ b) & 255] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const u16 = (array, value) => array.push(value & 255, (value >>> 8) & 255);
  const u32 = (array, value) => array.push(value & 255, (value >>> 8) & 255, (value >>> 16) & 255, (value >>> 24) & 255);

  function zip(files) {
    const out = [];
    const central = [];
    let offset = 0;
    for (const file of files) {
      const name = enc.encode(file.name);
      const data = enc.encode(file.data);
      const crc = crc32(data);
      const local = [];
      u32(local, 0x04034b50); u16(local, 20); u16(local, 0); u16(local, 0); u16(local, 0); u16(local, 0);
      u32(local, crc); u32(local, data.length); u32(local, data.length); u16(local, name.length); u16(local, 0);
      out.push(...local, ...name, ...data);

      const cd = [];
      u32(cd, 0x02014b50); u16(cd, 20); u16(cd, 20); u16(cd, 0); u16(cd, 0); u16(cd, 0); u16(cd, 0);
      u32(cd, crc); u32(cd, data.length); u32(cd, data.length); u16(cd, name.length); u16(cd, 0); u16(cd, 0); u16(cd, 0); u16(cd, 0); u32(cd, 0); u32(cd, offset);
      central.push(...cd, ...name);
      offset += local.length + name.length + data.length;
    }
    const centralOffset = out.length;
    out.push(...central);
    const end = [];
    u32(end, 0x06054b50); u16(end, 0); u16(end, 0); u16(end, files.length); u16(end, files.length); u32(end, central.length); u32(end, centralOffset); u16(end, 0);
    out.push(...end);
    return new Blob([new Uint8Array(out)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }

  function sheetXml(rows) {
    const widths = [];
    rows.forEach(row => row.forEach((value, index) => { widths[index] = Math.max(widths[index] || 10, Math.min(48, normalize(value).length + 5)); }));
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetViews><sheetView rightToLeft="1" workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${widths.map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`).join('')}</cols><sheetData>${rows.map((row, rowIndex) => `<row r="${rowIndex + 1}">${row.map((value, columnIndex) => `<c r="${col(columnIndex)}${rowIndex + 1}" t="inlineStr" s="${rowIndex === 0 ? 1 : 0}"><is><t>${xml(value)}</t></is></c>`).join('')}</row>`).join('')}</sheetData></worksheet>`;
  }

  function fieldValue(data, category, labels) {
    const wanted = labels.map(keyify);
    const fields = data.fields || [];
    const exact = fields.find(field => (!category || field.category === category) && wanted.some(label => keyify(field.label) === label));
    if (exact) return exact.value;
    const partial = fields.find(field => (!category || field.category === category) && wanted.some(label => keyify(field.label).includes(label) || label.includes(keyify(field.label))));
    return partial?.value || '';
  }

  function tableValues(data, headerMatchers, tableCategory) {
    const values = [];
    for (const table of data.tables || []) {
      if (tableCategory && table.category !== tableCategory) continue;
      const matchedHeaders = (table.headers || []).filter(header => headerMatchers.some(match => keyify(header).includes(keyify(match))));
      for (const row of table.rows || []) {
        for (const header of matchedHeaders) {
          const value = normalize(row.values?.[header]);
          if (value) values.push(value);
        }
      }
    }
    return values;
  }

  function firstMoneyLike(values) {
    return values.find(value => /[0-9۰-۹٠-٩]/.test(value)) || values[0] || '';
  }

  function cleanSellerName(value) {
    return normalize(value)
      .split(/(?:شناسه|کد اقتصادی|شماره اقتصادی|کد پستی|نشانی|آدرس|ملی|مالیاتی)[:：]?/)[0]
      .replace(/^(?:نام\s*)?(?:فروشنده|حق\s*العمل\s*کار|شرکت)[:：-]?/u, '')
      .replace(/[،,;؛]+$/g, '')
      .trim();
  }

  function cleanAmount(value) {
    return normalize(value)
      .replace(/^.*?[:：]\s*/u, '')
      .replace(/\s*(?:ریال|تومان)\s*$/u, '')
      .trim();
  }


  function allFieldTexts(data) {
    return (data.fields || []).flatMap(field => [field.label, field.value]).map(normalize).filter(Boolean);
  }

  function extractCompanyName(data, sectionWord) {
    const pattern = new RegExp(`(?:مشخصات\\s*)?${sectionWord}\\s*نام[:：]\\s*([^:：]+?)(?:\\s+نوع\\s*شخص|\\s+شناسه|\\s+کد|\\s+شماره|\\s+بیشتر|$)`, 'u');
    for (const value of allFieldTexts(data)) {
      const match = value.match(pattern);
      if (match?.[1]) return cleanSellerName(match[1]);
    }
    return '';
  }

  function findLongTaxNumber(data) {
    for (const value of allFieldTexts(data)) {
      const match = value.match(/\b[A-Z0-9]{16,}\b/i);
      if (match) return match[0];
    }
    return '';
  }


  function numberFromText(value) {
    const cleaned = cleanAmount(value);
    const matches = cleaned.match(/[0-9۰-۹٠-٩][0-9۰-۹٠-٩٬,\.\s]*/g);
    return matches?.map(normalize).filter(Boolean).at(-1) || '';
  }


  function amountByExactLabels(data, labels, category) {
    const wanted = labels.map(keyify);
    const fields = data.fields || [];
    const passes = [
      fields.filter(field => field.source === 'total-summary' && (!category || field.category === category)),
      fields.filter(field => !category || field.category === category),
      fields
    ];
    for (const passFields of passes) {
      for (const field of passFields) {
        if (!wanted.includes(keyify(field.label))) continue;
        const amount = numberFromText(field.value);
        if (amount) return amount;
      }
    }
    return '';
  }

  function amountByLabels(data, labels, category) {
    const wanted = labels.map(keyify);
    const fields = data.fields || [];
    const passes = category ? [fields.filter(field => field.category === category), fields] : [fields];
    for (const passFields of passes) {
      for (const field of passFields) {
        const label = keyify(field.label);
        if (wanted.some(want => label === want || label.includes(want))) {
          const amount = numberFromText(field.value);
          if (amount) return amount;
        }
      }
    }
    for (const textValue of allFieldTexts(data)) {
      for (const label of labels) {
        const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const match = textValue.match(new RegExp(`${escaped}\\s*[:：]\\s*([0-9۰-۹٠-٩][0-9۰-۹٠-٩٬,\\.\\s]*)`, 'u'));
        if (match?.[1]) return normalize(match[1]);
      }
    }
    return '';
  }

  function fieldValueStrict(data, category, labels, validator = value => !!value) {
    const wanted = labels.map(keyify);
    const matches = (data.fields || []).filter(field => !category || field.category === category);
    for (const field of matches) {
      const label = keyify(field.label);
      const isMatch = wanted.some(want => label === want || label.includes(want));
      if (isMatch && validator(normalize(field.value))) return field.value;
    }
    return '';
  }

  function exactTableColumnValues(data, headerLabel) {
    const wanted = keyify(headerLabel);
    const values = [];
    for (const table of data.tables || []) {
      if (/جمع\s*کل|خلاصه|summary|total/i.test(`${table.title || ''} ${(table.headers || []).join(' ')}`)) continue;
      const headers = (table.headers || []).filter(header => keyify(header) === wanted || (keyify(header).includes(wanted) && !keyify(header).includes('مجموع')));
      for (const row of table.rows || []) {
        for (const header of headers) {
          const value = cleanAmount(row.values?.[header]);
          if (value) values.push(value);
        }
      }
    }
    return values;
  }


  function tableColumnValues(data, headerLabels) {
    const values = [];
    for (const label of headerLabels) values.push(...exactTableColumnValues(data, label));
    return values;
  }

  function uniqueJoin(values) {
    const seen = [];
    for (const value of values.map(normalize).filter(Boolean)) if (!seen.includes(value)) seen.push(value);
    return seen.join(' - ');
  }

  function invoiceSummaryRow(data) {
    const sellerName = extractCompanyName(data, 'فروشنده') || cleanSellerName(fieldValueStrict(data, 'seller', ['نام فروشنده', 'فروشنده', 'نام شرکت'], value => !/خریدار/.test(value)));
    const taxInvoiceNumber = findLongTaxNumber(data) || fieldValueStrict(data, 'invoice', ['شماره مالیاتی صورتحساب', 'شماره منحصر مالیاتی', 'شماره مالیاتی'], value => /^[A-Z0-9\-]+$/i.test(value));
    const vat = amountByExactLabels(data, ['مجموع مالیات بر ارزش افزوده'], 'payment') || amountByLabels(data, ['مجموع مالیات بر ارزش افزوده', 'مالیات بر ارزش افزوده', 'مالیات ارزش افزوده'], 'payment');
    const goodsTotal = amountByLabels(data, ['مجموع مبلغ پس از کسر تخفیف', 'مجموع بهای کالا و خدمات صورتحساب بدون مالیات و عوارض', 'مجموع مبلغ قبل از کسر تخفیف', 'مجموع بهای کالا', 'جمع بهای کالا'], 'payment');
    const invoiceTotal = amountByLabels(data, ['مجموع صورتحساب', 'مبلغ نهایی', 'مبلغ قابل پرداخت', 'جمع کل'], 'payment');
    const blockedAmounts = new Set([vat, goodsTotal, invoiceTotal].filter(Boolean));
    const unitAmounts = (exactTableColumnValues(data, 'مبلغ واحد').length ? exactTableColumnValues(data, 'مبلغ واحد') : [amountByLabels(data, ['مبلغ واحد', 'فی', 'بهای واحد'])]).filter(value => value && !blockedAmounts.has(value));
    const quantityValues = (tableColumnValues(data, ['تعداد/مقدار', 'تعداد', 'مقدار']).length ? tableColumnValues(data, ['تعداد/مقدار', 'تعداد', 'مقدار']) : [amountByLabels(data, ['تعداد/مقدار', 'تعداد', 'مقدار'])]).filter(Boolean);

    return {
      id: taxInvoiceNumber || `${data.url || ''}:${data.extractedAt || ''}`,
      extractedAt: data.extractedAt,
      url: data.url,
      values: [sellerName, taxInvoiceNumber, uniqueJoin(unitAmounts), uniqueJoin(quantityValues), vat, goodsTotal, invoiceTotal]
    };
  }

  function summaryRows(history, config) {
    const headers = outputHeaders(config, history);
    return [headers, ...history.map(item => headers.map((_, index) => item.values?.[index] || ''))];
  }

  function detailRows(data, config) {
    const enabled = (config?.fields || []).filter(field => field.enabled !== false);
    const ids = enabled.map(field => field.id);
    const rows = [['بخش', 'فیلد', 'مقدار']];
    (data.fields || []).filter(field => !ids.length || ids.includes(field.id)).forEach(field => rows.push([field.sectionTitle, field.label, field.value]));
    (data.tables || []).forEach(table => {
      rows.push([], [table.sectionTitle, table.title, ''], table.headers);
      table.rows.forEach(row => rows.push(table.headers.map(header => row.values[header] ?? '')));
    });
    rows.push([], ['Tax Invoice Exporter', '© پدرام نخستین', 'Copyright © Pedram Nakhostin']);
    return rows;
  }

  function workbookFiles(sheets) {
    return [
      { name: '[Content_Types].xml', data: `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>${sheets.map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>` },
      { name: '_rels/.rels', data: `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>` },
      { name: 'docProps/core.xml', data: `<?xml version="1.0"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:creator>Tax Invoice Exporter</dc:creator><dc:title>Tax Portal Invoice Export</dc:title></cp:coreProperties>` },
      { name: 'xl/styles.xml', data: `<?xml version="1.0"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Vazirmatn"/></font><font><b/><sz val="11"/><color rgb="FF000000"/><name val="Vazirmatn"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF92D050"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1" readingOrder="2"/></xf><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFill="1" applyFont="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1" readingOrder="2"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>` },
      { name: 'xl/workbook.xml', data: `<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><workbookPr/><sheets>${sheets.map((sheet, index) => `<sheet name="${xml(sheet.name).slice(0, 31)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join('')}</sheets></workbook>` },
      { name: 'xl/_rels/workbook.xml.rels', data: `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
      ...sheets.map((sheet, index) => ({ name: `xl/worksheets/sheet${index + 1}.xml`, data: sheetXml(sheet.rows) }))
    ];
  }

  function configuredHeaders(config) {
    return (config?.fields || [])
      .filter(field => field.enabled !== false)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map(field => field.label);
  }

  function configuredRow(data, config) {
    const enabled = (config?.fields || [])
      .filter(field => field.enabled !== false)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    if (!enabled.length) return invoiceSummaryRow(data);
    const values = enabled.map(savedField => {
      const match = (data.fields || []).find(field => field.id === savedField.id) ||
        (data.fields || []).find(field => field.category === savedField.category && field.label === savedField.label) ||
        (data.fields || []).find(field => field.label === savedField.label);
      return normalize(match?.value || '');
    });
    const taxInvoiceNumber = fieldValue(data, 'invoice', ['شماره مالیاتی صورتحساب', 'شماره منحصر مالیاتی', 'شماره مالیاتی', 'tax id', 'tax number']);
    return {
      id: taxInvoiceNumber || `${data.url || ''}:${data.extractedAt || ''}`,
      extractedAt: data.extractedAt,
      url: data.url,
      headers: enabled.map(field => field.label),
      values
    };
  }

  function outputHeaders(config, history = []) {
    const historyHeaders = history.find(item => item.headers?.length)?.headers;
    const selectedHeaders = configuredHeaders(config);
    return historyHeaders || (selectedHeaders.length ? selectedHeaders : DEFAULT_HEADERS);
  }

  function makeWorkbook(data, config = {}, history = []) {
    const currentRow = configuredRow(data, config);
    const sheets = [{ name: 'خروجی صورتحساب‌ها', rows: summaryRows(history.length ? history : [currentRow], config) }];
    if (config.exportMode === 'multi') {
      const categories = window.PedramTaxExtractor?.CATEGORY_ORDER || CATEGORY_ORDER;
      categories.forEach(category => {
        const rows = detailRows({ ...data, fields: (data.fields || []).filter(field => field.category === category), tables: (data.tables || []).filter(table => table.category === category) }, config);
        if (rows.length > 4) sheets.push({ name: data.categories?.[category] || category, rows });
      });
    }
    return zip(workbookFiles(sheets));
  }

  window.PedramExcelExporter = { makeWorkbook, invoiceSummaryRow, configuredRow, outputHeaders, DEFAULT_HEADERS };
})();
