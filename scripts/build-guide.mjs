import { readFile, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { ROOT, PUBLIC } from './runtime.mjs';

const markdown = await readFile(path.join(ROOT, 'docs/BEGINNER_GUIDE.md'), 'utf8');
const escape = text => text.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const inline = text => escape(text).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
const lines = markdown.split('\n');
const content = [], toc = [];
let list = null, code = false, codeLines = [], table = false;
function closeList() { if (list) { content.push(`</${list}>`); list = null; } }
function closeTable() { if (table) { content.push('</tbody></table></div>'); table = false; } }
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  if (line.startsWith('```')) {
    closeList(); closeTable();
    if (code) { content.push(`<pre><code>${escape(codeLines.join('\n'))}</code></pre>`); codeLines = []; }
    code = !code; continue;
  }
  if (code) { codeLines.push(line); continue; }
  if (!line.trim()) { closeList(); closeTable(); continue; }
  if (line.startsWith('|')) {
    closeList();
    if (/^\|[\s:|-]+\|$/.test(line)) continue;
    const cells = line.split('|').slice(1,-1).map(value => inline(value.trim()));
    if (!table) { content.push(`<div class="table-wrap"><table><thead><tr>${cells.map(value => `<th>${value}</th>`).join('')}</tr></thead><tbody>`); table = true; }
    else content.push(`<tr>${cells.map(value => `<td>${value}</td>`).join('')}</tr>`);
    continue;
  }
  closeTable();
  const heading = line.match(/^(#{1,3}) (.+)$/);
  if (heading) {
    closeList(); const level = heading[1].length, id = `section-${i}`;
    content.push(`<h${level} id="${id}">${inline(heading[2])}</h${level}>`);
    if (level === 2) toc.push(`<a href="#${id}">${inline(heading[2])}</a>`);
    continue;
  }
  const ordered = line.match(/^\d+\. (.+)$/), unordered = line.match(/^- (.+)$/);
  if (ordered || unordered) {
    const type = ordered ? 'ol' : 'ul';
    if (list !== type) { closeList(); content.push(`<${type}>`); list = type; }
    content.push(`<li>${inline((ordered || unordered)[1])}</li>`); continue;
  }
  closeList(); content.push(`<p>${inline(line)}</p>`);
}
closeList(); closeTable();
const html = `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>VeriLedger V2 Beginner Handbook</title><style>
*{box-sizing:border-box}body{margin:0;color:#21384b;background:#f6f8fa;font:16px/1.95 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}header{background:#132d43;color:#fff;padding:22px max(22px,calc((100% - 1100px)/2));display:flex;justify-content:space-between;gap:20px}header a{color:#a3e0d0}main{max-width:1100px;margin:30px auto;display:grid;grid-template-columns:215px minmax(0,1fr);gap:28px;padding:0 22px}nav{position:sticky;top:25px;align-self:start}nav strong{display:block;margin-bottom:10px}nav a{display:block;font-size:14px;padding:6px 0;color:#508275;text-decoration:none}article{background:#fff;border:1px solid #e0e7ec;border-radius:10px;padding:32px;min-width:0}h1{font-size:28px;line-height:1.6;margin:0 0 22px;color:#142e43}h2{font-size:23px;margin:40px 0 18px;line-height:1.7;color:#142e43}h3{font-size:18px;margin:26px 0 12px;color:#245a52}p{margin:15px 0;overflow-wrap:anywhere}li{margin:9px 0}code{font-size:14px;overflow-wrap:anywhere;background:#f0f4f6;padding:2px 5px;border-radius:3px}pre{padding:18px;background:#f0f4f6;border-radius:7px;white-space:pre-wrap;word-break:break-all}pre code{padding:0}.table-wrap{overflow:auto}table{border-collapse:collapse;width:100%;font-size:14px}th,td{border:1px solid #dde5e9;padding:10px 12px;text-align:left;vertical-align:top}th{background:#edf4f1}tr:nth-child(even){background:#fafcfd}a{color:#0a7f70}@media(max-width:800px){main{grid-template-columns:1fr;gap:15px}nav{position:static;padding:10px 0}nav a{display:inline-block;margin-right:18px}article{padding:24px 19px}h1{font-size:25px}h2{font-size:21px}header{font-size:14px}}
</style></head><body><header><strong>VeriLedger V2 · English Beginner Handbook</strong><a href="/">Back to the application</a></header><main><nav aria-label="Handbook contents"><strong>Follow the steps</strong>${toc.join('')}</nav><article>${content.join('\n')}</article></main></body></html>`;
await writeFile(path.join(ROOT, 'frontend/guide.html'), html);
await unlink(path.join(PUBLIC, 'guide.html')).catch(() => {});
console.log('Generated the browser handbook.');
