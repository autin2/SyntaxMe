// formatter.js — expanded, readable output for HTML/CSS/JS with Prettier-like spacing and semicolons

// === Elements ===
const $ = s => document.querySelector(s);
const input = $('#input');
const gutter = $('#gutter');
const output = $('#output');
const charsIn = $('#charsIn');
const charsOut = $('#charsOut');
const changesEl = $('#changes');
const detectedEl = $('#detected');

// === UI helpers ===
function updateLineNumbers() {
  const n = (input.value.match(/\n/g) || []).length + 1;
  gutter.textContent = Array.from({ length: n }, (_, i) => i + 1).join('\n');
}
function setDetected(label) {
  detectedEl.textContent = 'Detected: ' + (label || '—');
}

// === Language detection (heuristic) ===
function detectLanguage(raw) {
  const t = raw.trim();
  if (!t) return 'unknown';

  const isHTML =
    /<!doctype|<html[\s>]|<head[\s>]|<body[\s>]|<\/\w+>|<\w+[\s\S]*?>/i.test(t) &&
    /<\w+[\s\S]*?>/.test(t);
  if (isHTML) return 'html';

  const noComments = t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  const isCSS =
    /[{}]/.test(noComments) &&
    /[.#@a-zA-Z\-\_\*][^{]+\{[^}]*\}/.test(noComments) &&
    !/function\s|\b(const|let|var)\b|=>|\bclass\s/.test(noComments);
  if (isCSS) return 'css';

  const isJS =
    /\b(const|let|var|function|class|import|export|return|if|for|while|switch|try|=>)\b/.test(t) ||
    /[{}();]/.test(t);
  if (isJS) return 'javascript';

  return 'unknown';
}

// === CSS formatter (expanded, one property per line, normalized ": ") ===
function formatCSS(raw) {
  let out = '', indent = 0;
  const IND = l => '  '.repeat(l);
  let i = 0, inStr = false, strCh = '', inCmt = false, buf = '';

  const fmtDecl = (d) => {
    const m = d.match(/^([^:]+):\s*(.+)$/);
    if (m) return m[1].trim() + ': ' + m[2].trim();
    return d.trim();
  };

  while (i < raw.length) {
    const ch = raw[i], nx = raw[i + 1];

    // comments
    if (!inStr && !inCmt && ch === '/' && nx === '*') { inCmt = true; buf += '/*'; i += 2; continue; }
    if (inCmt) { buf += ch; if (ch === '*' && nx === '/') { buf += '/'; i += 2; inCmt = false; } else { i++; } continue; }

    // strings
    if (!inStr && (ch === '"' || ch === "'")) { inStr = true; strCh = ch; buf += ch; i++; continue; }
    if (inStr) { buf += ch; if (ch === '\\') { buf += raw[i + 1] || ''; i += 2; continue; } if (ch === strCh) { inStr = false; } i++; continue; }

    // open block
    if (ch === '{') {
      const selector = buf.trim();
      out += selector + ' {\n';
      buf = '';
      indent++;
      i++;
      out += IND(indent);
      continue;
    }

    // close block
    if (ch === '}') {
      if (buf.trim()) {
        const decls = buf.split(';').map(s => s.trim()).filter(Boolean);
        for (const d of decls) out += fmtDecl(d) + ';\n' + IND(indent);
        buf = '';
      }
      // Trim trailing spaces/indent before closing brace
      out = out.replace(/[ \t]+$/, '');
      if (!out.endsWith('\n')) out += '\n';
      indent--;
      out += IND(indent) + '}\n' + IND(indent);
      i++;
      continue;
    }

    // declaration end
    if (ch === ';') {
      const decl = buf.trim();
      if (decl) out += fmtDecl(decl) + ';\n' + IND(indent);
      buf = '';
      i++;
      continue;
    }

    // collapse newlines in buffer
    if (ch === '\n' || ch === '\r') { buf += ' '; i++; continue; }

    buf += ch;
    i++;
  }

  if (buf.trim()) {
    const trailing = buf.split(';').map(s => s.trim()).filter(Boolean);
    for (const d of trailing) out += fmtDecl(d) + ';\n' + IND(indent);
  }

  return out.trim() + '\n';
}

// === JS formatter (readable) + style polish (spaces & semicolons) ===
function formatJS(raw) {
  let out = '', indent = 0;
  const IND = l => '  '.repeat(l);
  let i = 0, inStr = false, strCh = '', inTpl = false, tplDepth = 0, inSL = false, inML = false;
  let prevSig = '';

  function nl(){ out = out.trimEnd() + '\n' + IND(indent); }
  function emit(c){ out += c; if (!/\s/.test(c)) prevSig = c; }

  while (i < raw.length) {
    const ch = raw[i], nx = raw[i + 1];

    // // comment
    if (!inStr && !inTpl && !inSL && !inML && ch === '/' && nx === '/') { inSL = true; emit('/'); emit('/'); i += 2; continue; }
    if (inSL) { emit(ch); if (ch === '\n') { inSL = false; } i++; continue; }

    // /* comment */
    if (!inStr && !inTpl && !inSL && !inML && ch === '/' && nx === '*') { inML = true; emit('/'); emit('*'); i += 2; continue; }
    if (inML) { emit(ch); if (ch === '*' && nx === '/') { emit('/'); i += 2; inML = false; } else { i++; } continue; }

    // strings
    if (!inTpl && !inStr && (ch === '"' || ch === "'")) { inStr = true; strCh = ch; emit(ch); i++; continue; }
    if (inStr) { emit(ch); if (ch === '\\') { emit(raw[i + 1] || ''); i += 2; continue; } if (ch === strCh) { inStr = false; } i++; continue; }

    // template literals
    if (!inTpl && ch === '`') { inTpl = true; emit(ch); i++; continue; }
    if (inTpl) {
      emit(ch);
      if (ch === '\\') { emit(raw[i + 1] || ''); i += 2; continue; }
      if (ch === '$' && nx === '{') { emit('{'); tplDepth++; i += 2; continue; }
      if (ch === '}') { if (tplDepth > 0) tplDepth--; }
      if (ch === '`' && tplDepth === 0) { inTpl = false; }
      i++;
      continue;
    }

    // structure
    if (ch === '{') { out = out.trimEnd() + ' {'; indent++; nl(); i++; prevSig = '{'; continue; }
    if (ch === '}') { indent--; nl(); emit('}'); i++; continue; }

    // semicolon (preserve existing)
    if (ch === ';') { out = out.trimEnd() + ';'; nl(); i++; prevSig = ';'; continue; }

    // whitespace → single space
    if (/\s/.test(ch)) { if (!/\s/.test(out.slice(-1))) out += ' '; i++; continue; }

    // break between statements
    if ((prevSig === ')' || prevSig === '}' || prevSig === ';') && /[A-Za-z_$]/.test(ch)) { nl(); }

    emit(ch);
    i++;
  }

  // Post-process: Prettier-like spacing and cautious semicolons
  return jsStylePolish(out.trim() + '\n');
}

// Add spaces around "=" (not ==, ===, <=, >=, !=, !==, =>) and around "=>", then add safe semicolons
function jsStylePolish(code) {
  // spaces around =>
  code = code.replace(/\s*=>\s*/g, ' => ');

  // spaces around single "=" (exclude ==, ===, <=, >=, !=, !==, =>)
  code = code.replace(
    /(?<![=!<>+\-*/%&|^~?:])=(?![=>=])/g, // not preceded by comparator/op, not followed by > or =
    ' = '
  );

  // normalize multiple spaces around "=" to one (just in case)
  code = code.replace(/\s+=\s+/g, ' = ');

  // Add semicolons at safe statement boundaries
  const lines = code.split('\n');
  const keywordsHead = /^(if|for|while|switch|with|catch|try|finally|do|else|class|function)\b/;
  const bareControl = /^(return|throw|yield|continue|break)\s*$/;

  for (let idx = 0; idx < lines.length; idx++) {
    let L = lines[idx];
    const t = L.trim();

    if (!t || t.startsWith('//') || t.startsWith('/*') || t.endsWith('*/')) continue;
    if (keywordsHead.test(t)) continue; // don't add after control headers
    if (bareControl.test(t)) continue;  // "return" alone etc.

    // already ended
    if (/[;{}:,]$/.test(t)) continue;
    if (/\belse$/.test(t)) continue;
    if (/\)$/.test(t)) {
      // If the next non-empty line starts with "{", it's likely a control header or call followed by block — skip
      const next = findNextNonEmpty(lines, idx + 1);
      if (next && next.trim().startsWith('{')) continue;
    }

    // ends with likely expression token → add semicolon
    if (/[\)\]\w'"]$/.test(t) || /`$/.test(t)) {
      L = L.replace(/\s+$/, '') + ';';
    }
    lines[idx] = L;
  }

  return lines.join('\n');
}

function findNextNonEmpty(lines, start) {
  for (let i = start; i < lines.length; i++) {
    if (lines[i].trim()) return lines[i];
  }
  return '';
}

// === HTML serializer (expanded blocks, inline text preserved; <head> never single-lined) ===
const VOID = new Set(['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr']);

function attrString(el) {
  const a = [];
  for (const x of el.attributes) a.push(`${x.name}="${String(x.value).replace(/"/g,'&quot;')}"`);
  return a.length ? ' ' + a.join(' ') : '';
}
function isBlock(tag) {
  return new Set([
    'html','head','body','article','section','nav','aside','header','footer','main','div','p','pre',
    'ul','ol','li','dl','dt','dd','table','thead','tbody','tfoot','tr','td','th','figure','figcaption',
    'h1','h2','h3','h4','h5','h6','blockquote','form','fieldset','details','summary','hr'
  ]).has(tag);
}
function shouldPreserve(el) {
  const t = (el.tagName || '').toLowerCase();
  return t === 'pre' || t === 'textarea';
}
function collapseText(s) { return s.replace(/\s+/g, ' '); }

function serializeNode(node, indent = 0, inPreserve = false) {
  const IND = '  '.repeat(indent);

  if (node.nodeType === Node.DOCUMENT_TYPE_NODE) return '<!DOCTYPE html>\n';

  if (node.nodeType === Node.DOCUMENT_NODE) {
    let s = '';
    if (node.doctype) s += serializeNode(node.doctype, 0, false);
    s += serializeNode(node.documentElement, 0, false);
    return s;
  }

  if (node.nodeType === Node.ELEMENT_NODE) {
    const tag = node.tagName.toLowerCase();

    // voids single-line
    if (VOID.has(tag)) return IND + '<' + tag + attrString(node) + '>\n';

    // style/script blocks (format inner content)
    if (tag === 'style') {
      const open = '<style' + attrString(node) + '>';
      const close = '</style>';
      const content = formatCSS(node.textContent) + IND; // no leading newline
      return IND + open + '\n' + content + close + '\n';
    }
    if (tag === 'script') {
      const open = '<script' + attrString(node) + '>';
      const close = '</scr' + 'ipt>'; // safe when inlined
      const content = formatJS(node.textContent) + IND; // no leading newline
      return IND + open + '\n' + content + close + '\n';
    }

    const open = '<' + tag + attrString(node) + '>';
    const close = '</' + tag + '>';

    const preserve = inPreserve || shouldPreserve(node);
    let body = '';
    let hasBlockChild = false;

    node.childNodes.forEach(ch => {
      if (ch.nodeType === Node.TEXT_NODE) {
        let t = ch.nodeValue;
        if (!preserve) {
          t = collapseText(t);
          if (!t.trim()) return;
          body += '  '.repeat(indent + 1) + t.trim() + '\n';
        } else {
          body += t;
        }
      } else if (ch.nodeType === Node.COMMENT_NODE) {
        body += '  '.repeat(indent + 1) + '<!--' + ch.nodeValue + '-->\n';
      } else {
        body += serializeNode(ch, indent + 1, preserve);
        const ct = ch.nodeType === Node.ELEMENT_NODE ? ch.tagName.toLowerCase() : '';
        if (ct && isBlock(ct)) hasBlockChild = true;
      }
    });

    // Collapse inline-only lines — never for <head>
    if (!hasBlockChild && body.trim() && !preserve && tag !== 'head') {
      const inner = body.replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim();
      return IND + open + inner + close + '\n';
    }

    return IND + open + '\n' + body + IND + close + '\n';
  }

  if (node.nodeType === Node.TEXT_NODE) {
    return inPreserve ? node.nodeValue : collapseText(node.nodeValue).trim();
  }

  if (node.nodeType === Node.COMMENT_NODE) {
    return '  '.repeat(indent) + '<!--' + node.nodeValue + '-->\n';
  }

  return '';
}

function formatHTML(raw) {
  const doc = new DOMParser().parseFromString(raw, 'text/html');
  return (serializeNode(doc)).trim() + '\n';
}

// === Orchestrator ===
function normalize(raw) {
  const lang = detectLanguage(raw);
  let fixed = raw;

  if (lang === 'html') fixed = formatHTML(raw);
  else if (lang === 'css') fixed = formatCSS(raw);
  else if (lang === 'javascript') fixed = formatJS(raw);
  else fixed = raw.trim() + (raw.trim() ? '\n' : '');

  return { lang, fixed };
}

function analyze(raw, fixed, lang) {
  charsIn.textContent = raw.length;
  charsOut.textContent = fixed.length;
  changesEl.textContent = (raw.trim() === fixed.trim()) ? '0' : '1';
  setDetected(lang === 'unknown' ? 'Unknown' : (lang === 'javascript' ? 'JavaScript' : lang.toUpperCase()));
}

// === Actions ===
function fixNow() {
  const raw = input.value;
  const { lang, fixed } = normalize(raw);
  output.textContent = fixed;
  analyze(raw, fixed, lang);
}
function copyOutput() {
  const txt = output.textContent;
  if (!txt) return;
  navigator.clipboard.writeText(txt).catch(()=>{});
}
function downloadOutput() {
  const txt = output.textContent || '';
  const lang = detectLanguage(txt);
  const ext = lang === 'html' ? 'html' : lang === 'css' ? 'css' : lang === 'javascript' ? 'js' : 'txt';
  const blob = new Blob([txt], {type:'text/plain;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `fixed.${ext}`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

// === Events ===
const SAMPLE = (document.getElementById('sample')?.value || '').trim();
document.getElementById('loadSample').addEventListener('click', () => { input.value = SAMPLE; updateLineNumbers(); });
document.getElementById('clearInput').addEventListener('click', () => {
  input.value = '';
  updateLineNumbers();
  output.textContent = '';
  setDetected('—');
  analyze('', '', 'unknown');
});
document.getElementById('fixBtn').addEventListener('click', fixNow);
document.getElementById('copyBtn').addEventListener('click', copyOutput);
document.getElementById('downloadBtn').addEventListener('click', downloadOutput);
input.addEventListener('input', updateLineNumbers);
input.addEventListener('scroll', () => { gutter.scrollTop = input.scrollTop; });

// Init
updateLineNumbers();
document.getElementById('year').textContent = new Date().getFullYear();
