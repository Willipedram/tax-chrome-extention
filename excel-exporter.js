(() => {
  'use strict';

  const enc = new TextEncoder();
  const DEFAULT_HEADERS = [
    'نام فروشنده/حق‌العمل کار',
    'شماره مالیاتی صورتحساب',
    'مبلغ واحد',
    'مالیات بر ارزش افزوده',
    'مجموع بهای کالا و خدمات صورتحساب بدون مالیات و عوارض (ریال)',
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
      .replace(/^(?:نام\s*)?(?:فروشنده|حق\s*العمل\s*کار)[:：-]?/u, '')
      .replace(/[،,;؛]+$/g, '')
      .trim();
  }

  function uniqueJoin(values) {
    const seen = [];
    for (const value of values.map(normalize).filter(Boolean)) if (!seen.includes(value)) seen.push(value);
    return seen.join(' - ');
  }

  function invoiceSummaryRow(data) {
    const sellerName = cleanSellerName(fieldValue(data, 'seller', ['نام فروشنده', 'فروشنده', 'نام شرکت', 'نام']));
    const taxInvoiceNumber = fieldValue(data, 'invoice', ['شماره مالیاتی صورتحساب', 'شماره منحصر مالیاتی', 'شماره مالیاتی', 'tax id', 'tax number']);
    const unitAmounts = tableValues(data, ['مبلغ واحد', 'فی', 'بهای واحد', 'unit price', 'unit amount']);
    const vat = fieldValue(data, 'payment', ['مالیات بر ارزش افزوده', 'مالیات ارزش افزوده', 'مالیات', 'vat']) || firstMoneyLike(tableValues(data, ['مالیات بر ارزش افزوده', 'مالیات', 'vat'], 'payment'));
    const goodsTotal = fieldValue(data, 'payment', ['مجموع بهای کالا و خدمات صورتحساب بدون مالیات و عوارض', 'مجموع بهای کالا', 'جمع بهای کالا', 'total before tax']) || firstMoneyLike(tableValues(data, ['مجموع بهای کالا', 'جمع بهای کالا', 'بدون مالیات', 'total before tax']));
    const invoiceTotalCandidates = [
      ...tableValues(data, ['مجموع صورتحساب', 'مبلغ نهایی', 'قابل پرداخت', 'جمع کل', 'total'], 'payment'),
      ...tableValues(data, moneyWords, 'payment')
    ];
    const invoiceTotal = fieldValue(data, 'payment', ['مجموع صورتحساب', 'مبلغ نهایی', 'مبلغ قابل پرداخت', 'جمع کل', 'total amount', 'final amount']) || firstMoneyLike(invoiceTotalCandidates);

    return {
      id: taxInvoiceNumber || `${data.url || ''}:${data.extractedAt || ''}`,
      extractedAt: data.extractedAt,
      url: data.url,
      values: [sellerName, taxInvoiceNumber, uniqueJoin(unitAmounts), vat, goodsTotal, invoiceTotal]
    };
  }

  function summaryRows(history) {
    return [DEFAULT_HEADERS, ...history.map(item => DEFAULT_HEADERS.map((_, index) => item.values?.[index] || ''))];
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
    rows.push([], ['Pedram Tax Exporter', '© پدرام نخستین', 'Copyright © Pedram Nakhostin']);
    return rows;
  }

  function workbookFiles(sheets) {
    return [
      { name: '[Content_Types].xml', data: `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>${sheets.map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>` },
      { name: '_rels/.rels', data: `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>` },
      { name: 'docProps/core.xml', data: `<?xml version="1.0"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:creator>Pedram Tax Exporter - پدرام نخستین</dc:creator><dc:title>Tax Portal Invoice Export</dc:title></cp:coreProperties>` },
      { name: 'xl/styles.xml', data: `<?xml version="1.0"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Vazirmatn"/></font><font><b/><sz val="11"/><color rgb="FF000000"/><name val="Vazirmatn"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF92D050"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1" readingOrder="2"/></xf><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFill="1" applyFont="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1" readingOrder="2"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>` },
      { name: 'xl/workbook.xml', data: `<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><workbookPr/><sheets>${sheets.map((sheet, index) => `<sheet name="${xml(sheet.name).slice(0, 31)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join('')}</sheets></workbook>` },
      { name: 'xl/_rels/workbook.xml.rels', data: `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
      ...sheets.map((sheet, index) => ({ name: `xl/worksheets/sheet${index + 1}.xml`, data: sheetXml(sheet.rows) }))
    ];
  }

  function makeWorkbook(data, config = {}, history = []) {
    const sheets = [{ name: 'خروجی صورتحساب‌ها', rows: summaryRows(history.length ? history : [invoiceSummaryRow(data)]) }];
    if (config.exportMode === 'multi') {
      const categories = window.PedramTaxExtractor?.CATEGORY_ORDER || CATEGORY_ORDER;
      categories.forEach(category => {
        const rows = detailRows({ ...data, fields: (data.fields || []).filter(field => field.category === category), tables: (data.tables || []).filter(table => table.category === category) }, config);
        if (rows.length > 4) sheets.push({ name: data.categories?.[category] || category, rows });
      });
    }
    return zip(workbookFiles(sheets));
  }

  window.PedramExcelExporter = { makeWorkbook, invoiceSummaryRow, DEFAULT_HEADERS };
})();
