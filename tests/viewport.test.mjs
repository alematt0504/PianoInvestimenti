import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const browser = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find(path => path && existsSync(path));
assert.ok(browser, 'Set CHROME_PATH to a Chromium browser executable');

const profile = mkdtempSync(join(tmpdir(), 'dashboard-viewport-'));
const processHandle = spawn(browser, [
  '--headless=old', '--no-sandbox', '--disable-gpu', '--disable-software-rasterizer',
  '--disable-gpu-sandbox', '--disable-background-networking', '--no-first-run',
  `--user-data-dir=${profile}`, '--remote-debugging-port=0', 'about:blank',
], { stdio: 'ignore' });
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

try {
  const activePort = join(profile, 'DevToolsActivePort');
  for (let attempt = 0; attempt < 100 && !existsSync(activePort); attempt++) await pause(100);
  assert.ok(existsSync(activePort), 'Chromium debugging port did not start');
  const port = readFileSync(activePort, 'utf8').split('\n')[0];
  const tabs = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const tab = tabs.find(item => item.type === 'page' && item.url === 'about:blank');
  assert.ok(tab, 'Chromium page target was not found');

  const socket = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((resolveOpen, rejectOpen) => {
    socket.onopen = resolveOpen;
    socket.onerror = rejectOpen;
  });
  let nextId = 0;
  const pending = new Map();
  socket.onmessage = event => {
    const response = JSON.parse(event.data);
    if (!response.id) return;
    const request = pending.get(response.id);
    pending.delete(response.id);
    response.error ? request.reject(new Error(response.error.message)) : request.resolve(response.result);
  };
  const send = (method, params = {}) => new Promise((resolveSend, rejectSend) => {
    const id = ++nextId;
    pending.set(id, { resolve: resolveSend, reject: rejectSend });
    socket.send(JSON.stringify({ id, method, params }));
  });

  await send('Page.enable');
  await send('Runtime.enable');
  const url = pathToFileURL(resolve('index.html')).href;

  for (const [width, height] of [[320, 640], [390, 844]]) {
    await send('Emulation.setDeviceMetricsOverride', {
      width, height, deviceScaleFactor: 1, mobile: true,
    });
    await send('Page.navigate', { url });
    let loaded = false;
    for (let attempt = 0; attempt < 100 && !loaded; attempt++) {
      await pause(100);
      const state = await send('Runtime.evaluate', {
        expression: 'location.href + "|" + document.readyState', returnByValue: true,
      });
      loaded = state.result.value === `${url}|complete`;
    }
    assert.ok(loaded, `${width}px page did not load`);

    const evaluation = await send('Runtime.evaluate', {
      expression: `(() => {
        const grid = document.querySelector('.dest-grid');
        const back = document.getElementById('pac-card-details');
        const detail = document.getElementById('donut-detail-window');
        openPacModal();
        const hiddenBeforeClick = getComputedStyle(detail).visibility === 'hidden';
        document.querySelector('.donut-segment[data-segment="equity"]')
          .dispatchEvent(new MouseEvent('click', { bubbles: true }));
        const rect = detail.getBoundingClientRect();
        return {
          width: innerWidth, height: innerHeight,
          pageHeight: document.scrollingElement.scrollHeight,
          pageWidth: document.scrollingElement.scrollWidth,
          cardsScroll: grid.scrollHeight > grid.clientHeight,
          controlsRemoved: !document.querySelector('.donut-segment-controls'),
          buttonRemoved: !back.textContent.includes('Riepilogo'),
          hiddenBeforeClick,
          detailVisible: getComputedStyle(detail).visibility === 'visible',
          detailLeft: rect.left, detailRight: rect.right, detailTop: rect.top,
        };
      })()`,
      returnByValue: true,
    });
    assert.ok(!evaluation.exceptionDetails, `${width}px browser evaluation failed`);
    const result = evaluation.result.value;
    assert.equal(result.width, width);
    assert.equal(result.height, height);
    assert.ok(result.pageHeight <= height && result.pageWidth <= width, `${width}px page scrolls`);
    assert.ok(result.cardsScroll, `${width}px cards cannot scroll`);
    assert.ok(result.controlsRemoved && result.buttonRemoved, `${width}px unwanted controls remain`);
    assert.ok(result.hiddenBeforeClick && result.detailVisible, `${width}px click-only detail failed`);
    assert.ok(result.detailLeft >= 0 && result.detailRight <= width && result.detailTop < height,
      `${width}px detail is outside the viewport`);
    console.log(`${width}x${height}: viewport and detail pass`);
  }

  await send('Browser.close');
  socket.close();
} finally {
  processHandle.kill();
  await pause(500);
  rmSync(profile, { recursive: true, force: true });
}
