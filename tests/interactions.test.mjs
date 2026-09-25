import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const chrome = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find(path => path && existsSync(path));
assert.ok(chrome, 'Set CHROME_PATH to a Chromium browser executable');
const source = readFileSync(resolve('index.html'), 'utf8');
const directory = mkdtempSync(join(tmpdir(), 'dashboard-interactions-'));

function runAt(width, height) {
  const checks = `
    const errors = [];
    const check = (condition, message) => { if (!condition) errors.push(message); };
    try {
    const inner = document.getElementById('pac-card-inner');
    const back = document.getElementById('pac-card-details');
    const segments = [...document.querySelectorAll('.donut-segment')];
    const segment = segments[0];
    const detail = document.getElementById('donut-detail-window');
    const otherInvestments = document.getElementById('pac-altri-investimenti');
    const controls = document.querySelector('.donut-segment-controls');
    const grid = document.querySelector('.dest-grid');

    check(!back.textContent.includes('Riepilogo'), 'Riepilogo button remains');
    document.querySelector('.pac-clickable-body').click();
    check(inner.classList.contains('is-flipped'), 'investment card does not open');
    check(document.activeElement === back, 'open card is not keyboard focusable');
    check(!detail.classList.contains('visible'), 'detail opens without segment selection');
    check(getComputedStyle(detail).visibility === 'hidden', 'closed detail is exposed to assistive technology');
    check(segments.every(item => item.getAttribute('aria-expanded') === 'false'),
      'closed segments do not report collapsed state');
    check(!controls, 'duplicate segment buttons remain');
    segment.dispatchEvent(new MouseEvent('mouseenter'));
    check(!detail.classList.contains('visible'), 'hover opens detail without a click');
    segment.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    check(detail.classList.contains('visible') && detail.dataset.activeSegment === 'equity', 'segment does not open its detail');
    check(segment.getAttribute('aria-expanded') === 'true', 'selected segment does not report expanded state');
    check(getComputedStyle(detail).visibility === 'visible', 'selected detail is hidden from assistive technology');
    check(otherInvestments.inert, 'background investments remain interactive behind detail');
    check(inner.classList.contains('is-flipped'), 'segment click closes card');
    if (innerWidth < 961) {
      check(detail.getBoundingClientRect().top < innerHeight, 'mobile detail is outside the visible card area');
      check(detail.getBoundingClientRect().right <= document.body.getBoundingClientRect().right,
        'mobile detail overflows the narrow content area');
    }
    segment.focus();
    check(getComputedStyle(segment).outlineStyle === 'none', 'segment has a surrounding focus box');
    for (const next of segments.slice(1)) {
      next.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      check(detail.dataset.activeSegment === next.dataset.segment, next.dataset.segment + ' shows the wrong detail');
      check(segments.filter(item => item.getAttribute('aria-expanded') === 'true').length === 1,
        'multiple segments report expanded state');
    }
    segment.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    segment.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    check(!detail.classList.contains('visible'), 'second segment click does not hide detail');
    check(segments.every(item => item.getAttribute('aria-expanded') === 'false'),
      'closed segment still reports expanded state');
    check(!otherInvestments.inert, 'background investments stay inert after detail closes');
    segment.scrollIntoView({ block: 'nearest' });
    segment.focus({ preventScroll: true });
    segment.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    check(detail.classList.contains('visible'), 'keyboard cannot open segment detail');
    check(segment.getBoundingClientRect().bottom > 0 && segment.getBoundingClientRect().top < innerHeight,
      'keyboard focus moved outside the visible card area');
    segment.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    check(!detail.classList.contains('visible'), 'keyboard cannot close segment detail');
    segment.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    back.querySelector('.pac-col-title').click();
    check(!inner.classList.contains('is-flipped'), 'clicking the card does not close it');
    check(!detail.classList.contains('visible'), 'closing the card leaves detail open');
    document.querySelector('.pac-clickable-body').click();
    back.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    check(!inner.classList.contains('is-flipped'), 'keyboard cannot close the card');
    check(document.documentElement.scrollHeight <= innerHeight, 'document is vertically scrollable');
    if (innerWidth < 961) {
      check(grid.scrollHeight > grid.clientHeight, 'mobile cards have no internal scroll area');
    }
    } catch (error) { errors.push('uncaught: ' + error.stack); }
    document.body.insertAdjacentHTML('beforeend', '<pre id="test-results">' + JSON.stringify({ width: innerWidth, height: innerHeight, errors }) + '</pre>');
  `;
  // Old headless Chromium keeps a roughly 500px minimum viewport. The separate
  // viewport test exercises real 320px and 390px device emulation.
  const constrained = width < 961
    ? source.replace('</head>', `<style>body { width: ${width}px; }</style></head>`)
    : source;
  const html = constrained.replace('</body>', `<script>${checks}</script></body>`);
  const fixture = join(directory, `fixture-${width}.html`);
  const profile = join(directory, `profile-${width}`);
  writeFileSync(fixture, html);
  const output = execFileSync(chrome, [
    '--headless=old', '--no-sandbox', '--disable-gpu', '--disable-software-rasterizer',
    '--disable-gpu-sandbox', '--disable-dev-shm-usage', '--disable-background-networking',
    '--no-first-run', '--no-default-browser-check', `--user-data-dir=${profile}`,
    `--window-size=${width},${height}`, '--dump-dom', pathToFileURL(fixture).href,
  ], { encoding: 'utf8', maxBuffer: 5_000_000, stdio: ['ignore', 'pipe', 'ignore'] });
  const match = output.match(/<pre id="test-results">(\{[^<]*\})<\/pre>/);
  assert.ok(match, `browser did not return test results: ${output.slice(-700)}`);
  const result = JSON.parse(match[1].replaceAll('&quot;', '"'));
  assert.equal(width < 961, result.width < 961, 'browser selected the wrong responsive layout');
  assert.deepEqual(result.errors, [], `${width}px: ${result.errors.join('; ')}`);
  console.log(`${width}px content: interactions and scrolling pass`);
}

try {
  runAt(320, 640);
  runAt(390, 844);
  runAt(1280, 800);
} finally {
  rmSync(directory, { recursive: true, force: true });
}
