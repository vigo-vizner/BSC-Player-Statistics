/** Shared small helpers. */

/** Escape text for safe use in HTML content AND quoted attribute values. */
function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Table header cell; `tip` becomes the hover description (title attribute). `label` is trusted HTML. */
const th = (label, tip, cls = '') =>
  `<th${cls ? ` class="${cls}"` : ''}${tip ? ` title="${esc(tip)}"` : ''}>${label}</th>`;

/** One CSV field: quotes when needed and neutralises spreadsheet formula injection in text. */
function csvCell(v) {
  let s = String(v ?? '');
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Full CSV document (UTF-8 BOM so Excel shows Slovak diacritics correctly). */
function toCsv(rows) {
  return '\uFEFF' + rows.map(r => r.map(csvCell).join(',')).join('\r\n');
}

module.exports = { esc, th, csvCell, toCsv };
