// formatter.js — Syntax Me (Nesting Fixer)
// Plain JS: format HTML/CSS/JS, manage UI, and handle "View more" modal.

/* ------------------ DOM Helpers ------------------ */
const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/* ------------------ Elements ------------------ */
const inputEl     = $('#input');
const gutterEl    = $('#gutter');
const outputEl     = $('#output');
const sampleEl     = $('#sample');

const fixBtn       = $('#fixBtn');
const loadSampleBtn= $('#loadSample');
const clearBtn     = $('#clearInput');
const copyBtn      = $('#copyBtn');
const downloadBtn  = $('#downloadBtn');

const detectedEl   = $('#detected');
const charsInEl    = $('#charsIn');
const charsOutEl   = $('#charsOut');
const changesEl    = $('#changes');
const yearEl       = $('#year');

/* ------------------ Utilities ------------------ */
const VOID_HTML = new Set([
  'area','base','br','col','embed','hr','img','input','link',
  'meta','param','source','track','wbr'
]);

const INDENT = (n) => '  '.repeat(Math.max(0, n)); // 2 spaces

function clamp(n, lo, hi){ return Math.max(lo, Math.min(hi, n)); }

function getYear(){ try { return new Date().getFullYear(); } catch { return 2025; } }

function extFor(kind){
  if (kind === 'html') return 'html';
  if (kind === 'css')  return 'css';
  return 'js';
}

function detectKind(text){
  const t = text.trim();
  if (/<[a-z!/]/i.test(t)) return 'html';
  if (!/<[a-z]/i.test(t) && /{[^}]*}/.test(t) && /:/.test(t)) return 'css';
  return 'js';
}

/* ------------------ Formatters ------------------ */
// CSS pretty-printer (minimal, brace/semicolon aware)
function cssPretty(src){
  let out = '';
  let buf = '';
  let indent = 0;
  let inStr = false, strCh = null;
  let inComm = false;

  const flush = () => {
    const trimmed = buf.trim();
    if (trimmed) out += INDENT(indent) + trimmed + '\n';
    buf = '';
  };

  for (let i=0; i<src.length; i++){
    const ch = src[i], nx = src[i+1];

    // comments
    if (!inStr && !inComm && ch === '/' && nx === '*'){ inComm = true; i++; buf += '/*'; continue; }
    if (inComm){
      buf += ch;
      if (ch === '*' && nx === '/'){ buf += '/'; i++; inComm = false; }
      continue;
    }

    // strings
    if (!inStr && (ch === '"' || ch === "'")){ inStr = true; strCh = ch; buf += ch; continue; }
    if (inStr){
      buf += ch;
      if (ch === '\\'){ buf += src[++i] || ''; continue; }
      if (ch === strCh){ inStr = false; strCh = null; }
      continue;
    }

    if (ch === '{'){
      const pre = buf.trim();
      if (pre){ out += INDENT(indent) + pre + ' {\n'; buf = ''; }
      else { out += INDENT(indent) + '{\n'; }
      indent++;
      continue;
    }

    if (ch === '}'){
      flush();
      indent = Math.max(0, indent-1);
      out += INDENT(indent) + '}\n';
      continue;
    }

    if (ch === ';'){
      buf += ';';
      flush();
      continue;
    }

    // normalize spaces around colon (light)
    if (ch === ':'){
      buf = buf.trimEnd() + ': ';
      continue;
    }

    if (ch === '\n' || ch === '\r'){
      // collapse raw newlines into spaces inside buf
      if (buf.endsWith(' ') === false) buf += ' ';
      continue;
    }

    buf += ch;
  }
  flush();
  return out.trimEnd();
}

// JS pretty-printer (very light, brace/semicolon aware)
function jsPretty(src){
  let out = '';
  let buf = '';
  let indent = 0;

  let inStr = false, strCh = null;
  let inTpl = false;
  let inComm = false, lineComm = false;

  const flush = () => {
    const t = buf.trim();
    if (t) out += INDENT(indent) + t + '\n';
    buf = '';
  };

  for (let i=0; i<src.length; i++){
    const ch = src[i], nx = src[i+1];

    // line comment //
    if (!inStr && !inTpl && !inComm && ch === '/' && nx === '/'){
      lineComm = true; i++;
      buf = buf.trimEnd();
      // move comment to end of line
      let comment = '//';
      while (i+1 < src.length && src[i+1] !== '\n'){ i++; comment += src[i]; }
      if (buf){ out += INDENT(indent) + buf + ' ' + comment + '\n'; buf=''; }
      else    { out += INDENT(indent) + comment + '\n'; }
      continue;
    }

    // block comment /* */
    if (!inStr && !inTpl && !inComm && ch === '/' && nx === '*'){ inComm = true; i++; buf += '/*'; continue; }
    if (inComm){
      buf += ch;
      if (ch === '*' && nx === '/'){ buf += '/'; i++; inComm = false; }
      continue;
    }

    // strings & template literals
    if (!inTpl && !inStr && (ch === '"' || ch === "'")){ inStr = true; strCh = ch; buf += ch; continue; }
    if (inStr){
      buf += ch;
      if (ch === '\\'){ buf += src[++i] || ''; continue; }
      if (ch === strCh){ inStr = false; strCh = null; }
      continue;
    }
    if (!inStr && ch === '`'){
      inTpl = !inTpl; buf += ch; continue;
    }
    if (inTpl){
      buf += ch;
      if (ch === '\\'){ buf += src[++i] || ''; }
      continue;
    }

    if (ch === '{'){
      const t = buf.trim();
      if (t){ out += INDENT(indent) + t + ' {\n'; buf=''; }
      else  { out += INDENT(indent) + '{\n'; }
      indent++;
      continue;
    }
    if (ch === '}'){
      const t = buf.trim();
      if (t){ out += INDENT(indent) + t + '\n'; buf=''; }
      indent = Math.max(0, indent-1);
      out += INDENT(indent) + '}\n';
      continue;
    }
    if (ch === ';'){
      buf += ';';
      flush();
      continue;
    }
    if (ch === '\n' || ch === '\r'){
      if (buf.trim()){ flush(); }
      continue;
    }
    buf += ch;
  }
  if (buf.trim()) flush();
  return out.trimEnd();
}

// HTML pretty-printer (token-based, preserves <script>/<style> blocks)
function htmlPretty(src){
  const tokens = src.split(/(<[^>]+>)/g); // keep tags
  let out = [];
  let indent = 0;

  function tagName(tag){
    return (tag.match(/^<\s*\/?\s*([a-zA-Z0-9:-]+)/) || [,''])[1].toLowerCase();
  }
  function isClosing(tag){ return /^<\s*\//.test(tag); }
  function isComment(tag){ return /^<!--/.test(tag); }
  function isDoctype(tag){ return /^<!doctype/i.test(tag) || /^<\?xml/i.test(tag); }
  function isSelfClosing(tag){
    const tn = tagName(tag);
    return /\/\s*>$/.test(tag) || VOID_HTML.has(tn);
  }

  for (let i=0; i<tokens.length; i++){
    let t = tokens[i];
    if (!t) continue;

    if (t.startsWith('<')){
      const tn = tagName(t);

      // comments / doctype
      if (isComment(t) || isDoctype(t)){
        out.push(INDENT(indent) + t.trim());
        continue;
      }

      // closing tag
      if (isClosing(t)){
        indent = Math.max(0, indent-1);
        out.push(INDENT(indent) + t.trim());
        continue;
      }

      // <script> or <style> collect block
      if (tn === 'script' || tn === 'style'){
        const open = t.trim();
        const closeNeedle = `</${tn}`;
        out.push(INDENT(indent) + open);
        indent++;
        let inner = '';
        // collect until closing tag token
        for (i=i+1; i<tokens.length; i++){
          const tk = tokens[i];
          if (tk && tk.toLowerCase().startsWith(closeNeedle)){
            // we are at the closing tag; step back one so outer loop can handle t=closing
            i--; break;
          }
          inner += tk || '';
        }
        // pretty inner if style, keep structure for script
        let prettyInner = (tn === 'style') ? cssPretty(inner) : inner.trim();
        if (prettyInner){
          for (const line of prettyInner.split('\n')){
            out.push(INDENT(indent) + line);
          }
        }
        indent = Math.max(0, indent-1);
        // advance to closing tag (outer loop will consume it next iteration)
        continue;
      }

      // self-closing or void
      if (isSelfClosing(t)){
        out.push(INDENT(indent) + t.trim());
        continue;
      }

      // opening tag
      out.push(INDENT(indent) + t.trim());
      indent++;
    } else {
      // text node -> collapse excessive whitespace but keep meaningful text
      const text = t.replace(/\s+/g, ' ').trim();
      if (text) out.push(INDENT(indent) + text);
    }
  }

  return out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd();
}

/* ------------------ Orchestrator ------------------ */
function formatText(raw){
  const kind = detectKind(raw);
  let pretty = raw;
  try {
    if (kind === 'html') pretty = htmlPretty(raw);
    else if (kind === 'css') pretty = cssPretty(raw);
    else pretty = jsPretty(raw);
  } catch (e){
    // fallback: keep original if formatter failed
    pretty = raw;
    console.warn('Formatter error:', e);
  }
  return { kind, pretty };
}

/* ------------------ Input Gutter (line numbers) ------------------ */
function updateGutter(){
  const lines = (inputEl.value.match(/\n/g) || []).length + 1;
  gutterEl.textContent = Array.from({length: lines}, (_,i)=>i+1).join('\n');
}
function syncScroll(){ gutterEl.scrollTop = inputEl.scrollTop; }

/* ------------------ Actions ------------------ */
function doFix(){
  const raw = inputEl.value;
  const { kind, pretty } = formatText(raw);

  outputEl.textContent = pretty;

  detectedEl.textContent = `Detected: ${kind.toUpperCase()}`;
  charsInEl.textContent  = String(raw.length);
  charsOutEl.textContent = String(pretty.length);
  const lineDelta = Math.max(0, pretty.split('\n').length - raw.split('\n').length);
  changesEl.textContent  = String(lineDelta);

  // Re-check the "View more" control after render
  window.updateViewMore?.();
}

function loadSample(){
  if (!sampleEl) return;
  inputEl.value = sampleEl.value.trim();
  updateGutter();
  doFix();
}

function clearAll(){
  inputEl.value = '';
  updateGutter();
  outputEl.textContent = '';
  detectedEl.textContent = 'Detected: —';
  charsInEl.textContent = '0';
  charsOutEl.textContent = '0';
  changesEl.textContent = '0';
  window.updateViewMore?.();
}

async function copyOutput(){
  try {
    await navigator.clipboard.writeText(outputEl.textContent || '');
    // optional: brief UI feedback
    copyBtn.textContent = 'Copied';
    setTimeout(()=> copyBtn.textContent = 'Copy', 900);
  } catch {}
}

function downloadOutput(){
  const txt = outputEl.textContent || '';
  const kind = (detectedEl.textContent.split(':')[1] || '').trim().toLowerCase() || detectKind(txt);
  const filename = `formatted.${extFor(kind)}`;

  const blob = new Blob([txt], { type: 'text/plain;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  a.remove(); URL.revokeObjectURL(url);
}

/* ------------------ View More / Modal (robust) ------------------ */
const viewMoreBtn   = $('#viewMoreBtn');
const modal         = $('#viewerModal');
const fullOutputEl  = $('#fullOutput');
const closeModalBtn = $('#closeModal');
const copyFullBtn   = $('#copyFullBtn');
const modalBackdrop = $('#modalBackdrop');

function reallyOverflowing(el) {
  const tooTall = el.scrollHeight > el.clientHeight + 1;
  const tooWide = el.scrollWidth  > el.clientWidth  + 1;
  const tooLong = (el.textContent || '').length > 4000;
  return tooTall || tooWide || tooLong;
}
function refreshViewMore() {
  if (!outputEl || !viewMoreBtn) return;
  viewMoreBtn.hidden = !reallyOverflowing(outputEl);
}
function rafRefresh() {
  requestAnimationFrame(() => requestAnimationFrame(refreshViewMore));
}
// Expose hook to call after output updates
window.updateViewMore = rafRefresh;

// Observe changes to #output so button toggles automatically
if (outputEl) {
  new MutationObserver(rafRefresh)
    .observe(outputEl, { childList: true, characterData: true, subtree: true });
}

// Show modal
viewMoreBtn?.addEventListener('click', () => {
  fullOutputEl.textContent = outputEl.textContent || '';
  modal.setAttribute('open','');
  modal.setAttribute('aria-hidden','false');
  document.body.style.overflow = 'hidden';
});

// Close modal
function closeModal() {
  modal.removeAttribute('open');
  modal.setAttribute('aria-hidden','true');
  document.body.style.overflow = '';
}
closeModalBtn?.addEventListener('click', closeModal);
modalBackdrop?.addEventListener('click', closeModal);
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

// Copy full code
copyFullBtn?.addEventListener('click', () => {
  navigator.clipboard.writeText(fullOutputEl.textContent || '');
});

/* ------------------ Wire Up ------------------ */
document.addEventListener('DOMContentLoaded', () => {
  if (yearEl) yearEl.textContent = String(getYear());

  inputEl?.addEventListener('input', updateGutter);
  inputEl?.addEventListener('scroll', syncScroll);
  updateGutter();

  fixBtn?.addEventListener('click', doFix);
  loadSampleBtn?.addEventListener('click', loadSample);
  clearBtn?.addEventListener('click', clearAll);
  copyBtn?.addEventListener('click', copyOutput);
  downloadBtn?.addEventListener('click', downloadOutput);

  // initial check for View more
  rafRefresh();
  setTimeout(refreshViewMore, 200);
});
