#!/usr/bin/env node
// scripts/extract-preview-url.mjs
//
// Pulls the Preview URL out of whatever `wrangler preview` printed.
//
// Usage: node scripts/extract-preview-url.mjs <file>   (or stdin)
//
// WHY THIS IS A SCRIPT AND NOT A GREP
//
// `wrangler preview --json` does not emit JSON on its own. It writes its normal
// progress output to stdout as well -- "🌀 Building...", upload progress, and so
// on -- with the JSON document at the end. So `JSON.parse(output)` fails with
//
//     SyntaxError: Unexpected token '🌀', "🌀 Buildin"... is not valid JSON
//
// and a plain `grep -oE 'https://...workers.dev'` over the same text works by
// accident: it also matches the progress lines and any incidental URL in a log
// message. That is how the previous workflow found its URL, and it breaks
// silently the day the wording changes.
//
// This script does the narrow thing: strip ANSI colour codes, find the JSON
// document, parse it, and return the Preview URL from the parsed structure. If
// there is no JSON document it says so, rather than falling back to scraping.
//
// Kept in a file so it can be tested directly against the shapes wrangler
// produces. The previous two-line inline `node -e` version could only be tested
// by running a real deploy.

import fs from 'fs';

// eslint-disable-next-line no-control-regex
const ANSI = /\u001B\[[0-9;?]*[ -/]*[@-~]/g;
// Wrangler also emits bare escape sequences and carriage-return progress lines.
const OTHER_ESCAPES = /\u001B[@-Z\\-_]/g;

function stripAnsi(text) {
  return String(text).replace(ANSI, '').replace(OTHER_ESCAPES, '');
}

// Returns the balanced JSON object starting at `start`, or null if it never
// balances.
//
// "Balanced" has to respect string literals and escapes: a `}` inside a JSON
// string value would otherwise close the object early and produce a parse error
// that looks like wrangler emitted malformed JSON.
function balancedObjectAt(text, start) {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let j = start; j < text.length; j++) {
    const ch = text[j];
    if (escaped) { escaped = false; continue; }
    if (ch === '\\') { escaped = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return text.slice(start, j + 1);
    }
  }
  return null;
}

// Finds the JSON document in wrangler's output, or returns null.
//
// Candidate start positions are `{` at the very beginning of the text or at the
// beginning of a line. Both matter: wrangler pretty-prints the document so its
// `{` is alone on a line after the progress output, but a caller may pipe in
// compact single-line JSON, and an earlier version of this function only handled
// the pretty-printed case and silently found nothing in the other.
//
// Candidates are tried in order and the first one that both balances and parses
// wins, so a stray brace in a progress line cannot win over the real document.
function findJsonObject(text) {
  const candidates = [];
  if (text[0] === '{') candidates.push(0);
  for (let i = 1; i < text.length; i++) {
    if (text[i] === '{' && text[i - 1] === '\n') candidates.push(i);
  }
  for (const start of candidates) {
    const candidate = balancedObjectAt(text, start);
    if (candidate === null) continue;
    try {
      JSON.parse(candidate);
      return candidate;
    } catch (_) {
      // A brace in the progress output. Try the next candidate.
    }
  }
  return null;
}

// Pulls a workers.dev URL out of a parsed wrangler document.
//
// The key has moved between wrangler versions and the shape is nested
// differently, so rather than hard-coding one path this walks the object and
// collects every https://...workers.dev string value, then prefers one that
// contains the preview name (the Preview URL) over a bare deployment URL.
function collectWorkersDevUrls(value, out = []) {
  if (typeof value === 'string') {
    for (const m of value.match(/https:\/\/[A-Za-z0-9._-]*workers\.dev/g) || []) out.push(m);
  } else if (Array.isArray(value)) {
    for (const v of value) collectWorkersDevUrls(v, out);
  } else if (value && typeof value === 'object') {
    for (const v of Object.values(value)) collectWorkersDevUrls(v, out);
  }
  return out;
}

export function extractPreviewUrl(raw, previewName) {
  const text = stripAnsi(raw);
  const json = findJsonObject(text);
  if (!json) {
    return { ok: false, reason: 'no JSON document found in wrangler output' };
  }
  let doc;
  try {
    doc = JSON.parse(json);
  } catch (err) {
    return { ok: false, reason: 'JSON document did not parse: ' + err.message };
  }
  const urls = [...new Set(collectWorkersDevUrls(doc))];
  if (urls.length === 0) {
    return { ok: false, reason: 'no workers.dev URL in the wrangler JSON' };
  }
  // The Preview URL always contains the preview name; a deployment URL contains
  // a deployment id instead. Prefer the former so the smoke test keeps hitting
  // the latest deploy rather than pinning one.
  const preferred = previewName
    ? urls.find((u) => u.includes(previewName.toLowerCase()))
    : null;
  return { ok: true, url: preferred || urls[0], all: urls };
}

// ---- CLI -------------------------------------------------------------------
if (import.meta.url === 'file://' + process.argv[1].replace(/\\/g, '/')
  || import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))) {
  const file = process.argv[2];
  const previewName = process.argv[3];
  const raw = file ? fs.readFileSync(file, 'utf-8') : fs.readFileSync(0, 'utf-8');
  const result = extractPreviewUrl(raw, previewName);
  if (!result.ok) {
    console.error('extract-preview-url: ' + result.reason);
    process.exit(1);
  }
  if (process.env.DEBUG_PREVIEW_URL) {
    console.error('candidates: ' + JSON.stringify(result.all));
  }
  process.stdout.write(result.url);
}
