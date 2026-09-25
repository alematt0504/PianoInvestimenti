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
let socket;
let send;

try {
  const activePort = join(profile, 'DevToolsActivePort');
  for (let attempt = 0; attempt < 100 && !existsSync(activePort); attempt++) await pause(100);
  assert.ok(existsSync(activePort), 'Chromium debugging port did not start');
  const port = readFileSync(activePort, 'utf8').split('\n')[0];
  const tabs = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const tab = tabs.find(item => item.type === 'page' && item.url === 'about:blank');
  assert.ok(tab, 'Chromium page target was not found');

  socket = new WebSocket(tab.webSocketDebuggerUrl);
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
  send = (method, params = {}) => new Promise((resolveSend, rejectSend) => {
    const id = ++nextId;
    pending.set(id, { resolve: resolveSend, reject: rejectSend });
    socket.send(JSON.stringify({ id, method, params }));
  });

  await send('Page.enable');
  await send('Runtime.enable');
  const url = pathToFileURL(resolve('index.html')).href;

  for (const [width, height, rootFontPx = 16] of [
    [320, 500], [320, 540], [320, 568], [320, 568, 20],
    [320, 640], [375, 667], [390, 844], [667, 375], [844, 390],
    [1280, 500], [1280, 600], [1280, 800],
  ]) {
    await send('Emulation.setDeviceMetricsOverride', {
      width, height, deviceScaleFactor: 1, mobile: width < 961,
    });
    await send('Emulation.setTouchEmulationEnabled', {
      enabled: width < 961, maxTouchPoints: 1,
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
        document.documentElement.style.fontSize = '${rootFontPx}px';
        const grid = document.querySelector('.dest-grid');
        const back = document.getElementById('pac-card-details');
        const detail = document.getElementById('donut-detail-window');
        const investment = document.querySelector('.card-pac-wrapper');
        const chart = document.getElementById('donut-chart-container');
        openPacModal();
        const openCardRect = investment.getBoundingClientRect();
        const openCardFits = grid.scrollHeight <= grid.clientHeight &&
          openCardRect.top >= 0 && openCardRect.bottom <= innerHeight;
        const defaultContentFits = back.scrollHeight <= back.clientHeight + 1 &&
          document.querySelector('.donut-back-layout').scrollHeight <=
            document.querySelector('.donut-back-layout').clientHeight + 8 &&
          document.getElementById('pac-altri-investimenti').scrollHeight <=
            document.getElementById('pac-altri-investimenti').clientHeight + 1 &&
          [...document.querySelectorAll('#pac-altri-investimenti .pac-subcard--full')].every(card =>
            card.scrollHeight <= card.clientHeight + 1);
        const defaultHeights = {
          back: [back.clientHeight, back.scrollHeight],
          layout: [document.querySelector('.donut-back-layout').clientHeight,
            document.querySelector('.donut-back-layout').scrollHeight],
          other: [document.getElementById('pac-altri-investimenti').clientHeight,
            document.getElementById('pac-altri-investimenti').scrollHeight],
          left: [document.querySelector('.pac-back-col--left').clientHeight,
            document.querySelector('.pac-back-col--left').scrollHeight],
          subcards: [...document.querySelectorAll('#pac-altri-investimenti .pac-subcard--full')]
            .map(card => [card.clientHeight, card.scrollHeight]),
        };
        const hiddenBeforeClick = getComputedStyle(detail).visibility === 'hidden';
        document.querySelector('.donut-segment[data-segment="equity"]')
          .dispatchEvent(new MouseEvent('click', { bubbles: true }));
        const rect = detail.getBoundingClientRect();
        const chartRect = chart.getBoundingClientRect();
        const selectedSegment = document.querySelector('.donut-segment[data-segment="equity"]');
        const renderedStroke = parseFloat(getComputedStyle(selectedSegment).strokeWidth) * chartRect.width / 240;
        const selectedCardRect = investment.getBoundingClientRect();
        const result = {
          width: innerWidth, height: innerHeight,
          pageHeight: document.scrollingElement.scrollHeight,
          pageWidth: document.scrollingElement.scrollWidth,
          openCardFits,
          defaultContentFits,
          defaultHeights,
          selectedCardFits: grid.scrollHeight <= grid.clientHeight &&
            selectedCardRect.top >= 0 && selectedCardRect.bottom <= innerHeight,
          selectedContentFits: back.scrollHeight <= back.clientHeight + 1 &&
            document.querySelector('.donut-back-layout').scrollHeight <=
              document.querySelector('.donut-back-layout').clientHeight + 8 &&
            detail.scrollHeight <= detail.clientHeight + 1 &&
            [...detail.querySelectorAll('.tooltip-subcard')].every(card => {
              if (getComputedStyle(card).display === 'none') return true;
              const bounds = card.getBoundingClientRect();
              return [...card.querySelectorAll('.subcard-row')].every(row => {
                const rowBounds = row.getBoundingClientRect();
                return rowBounds.top >= bounds.top - 1 && rowBounds.bottom <= bounds.bottom + 1;
              });
            }),
          heights: {
            back: [back.clientHeight, back.scrollHeight],
            layout: [document.querySelector('.donut-back-layout').clientHeight,
              document.querySelector('.donut-back-layout').scrollHeight],
            detail: [detail.clientHeight, detail.scrollHeight],
            subcards: [...detail.querySelectorAll('.tooltip-subcard')].map(card =>
              [card.clientHeight, card.scrollHeight]),
            bottomRowOverflow: [...detail.querySelectorAll('.tooltip-subcard')].map(card => {
              const row = card.querySelector('.subcard-row--bottom');
              return row ? row.getBoundingClientRect().bottom - card.getBoundingClientRect().bottom : 0;
            }),
          },
          chartVisible: chartRect.top >= 0 && chartRect.bottom <= innerHeight,
          chartWidth: chartRect.width,
          renderedStroke,
          controlsRemoved: !document.querySelector('.donut-segment-controls'),
          buttonRemoved: !back.textContent.includes('Riepilogo'),
          hiddenBeforeClick,
          detailVisible: getComputedStyle(detail).visibility === 'visible',
          detailLeft: rect.left, detailRight: rect.right, detailTop: rect.top,
          detailBottom: rect.bottom,
        };
        back.querySelector('.pac-col-title').click();
        const frontRect = document.querySelector('.pac-clickable-body').getBoundingClientRect();
        result.frontVisibleAfterClose = frontRect.top >= 0 && frontRect.top < innerHeight;
        return result;
      })()`,
      returnByValue: true,
    });
    assert.ok(!evaluation.exceptionDetails,
      `${width}px browser evaluation failed: ${JSON.stringify(evaluation.exceptionDetails)}`);
    const result = evaluation.result.value;
    assert.equal(result.width, width);
    assert.equal(result.height, height);
    assert.ok(result.pageHeight <= height && result.pageWidth <= width, `${width}px page scrolls`);
    assert.ok(result.openCardFits, `${width}px opened investment card requires scrolling`);
    assert.ok(result.defaultContentFits,
      `${width}px default investment content is clipped: ${JSON.stringify(result.defaultHeights)}`);
    assert.ok(result.selectedCardFits, `${width}px selected investment detail requires scrolling`);
    assert.ok(result.selectedContentFits,
      `${width}px selected investment content is clipped: ${JSON.stringify(result.heights)}`);
    assert.ok(result.chartVisible, `${width}px chart is no longer available to select another segment`);
    assert.ok(result.chartWidth >= (height <= 600 ? 155 : 180) && result.renderedStroke >= 40,
      `${width}px chart segments are too small to tap: ${result.chartWidth}px chart, ${result.renderedStroke}px stroke`);
    assert.ok(result.controlsRemoved && result.buttonRemoved, `${width}px unwanted controls remain`);
    assert.ok(result.hiddenBeforeClick && result.detailVisible, `${width}px segment detail failed`);
    assert.ok(result.detailLeft >= 0 && result.detailRight <= width &&
      result.detailTop >= 0 && result.detailBottom <= height,
      `${width}px detail is outside the viewport`);
    assert.ok(result.frontVisibleAfterClose, `${width}px closed investment card is out of view`);
    if (width === 1280 && height === 800) {
      await send('Runtime.evaluate', { expression: 'openPacModal()' });
      await pause(700);
      const pointResult = await send('Runtime.evaluate', {
        expression: `(() => {
          const svg = document.querySelector('.donut-svg');
          const point = (x, y) => {
            const p = svg.createSVGPoint();
            p.x = x; p.y = y;
            const screen = p.matrixTransform(svg.getScreenCTM());
            return { x: screen.x, y: screen.y,
              hit: document.elementFromPoint(screen.x, screen.y)?.dataset.segment };
          };
          return { equity: point(198, 141), bonds: point(39, 124) };
        })()`,
        returnByValue: true,
      });
      const points = pointResult.result.value;
      assert.equal(points.equity.hit, 'equity', 'desktop mouse cannot reach equity segment');
      assert.equal(points.bonds.hit, 'bonds', 'desktop mouse cannot reach bonds segment');
      const detailState = async () => (await send('Runtime.evaluate', {
        expression: `(() => {
          const detail = document.getElementById('donut-detail-window');
          return { visible: detail.classList.contains('visible'),
            segment: detail.dataset.activeSegment,
            open: document.getElementById('pac-card-inner').classList.contains('is-flipped') };
        })()`,
        returnByValue: true,
      })).result.value;
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: points.equity.x, y: points.equity.y });
      assert.deepEqual(await detailState(), { visible: true, segment: 'equity', open: true },
        'desktop mouse hover does not show equity detail');
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: points.bonds.x, y: points.bonds.y });
      assert.deepEqual(await detailState(), { visible: true, segment: 'bonds', open: true },
        'desktop mouse hover does not switch to bonds detail');
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 5, y: 5 });
      assert.deepEqual(await detailState(), { visible: false, segment: '', open: true },
        'desktop detail remains visible after leaving the graph');
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: points.equity.x, y: points.equity.y });
      await send('Input.dispatchMouseEvent', {
        type: 'mousePressed', x: points.equity.x, y: points.equity.y, button: 'left', clickCount: 1,
      });
      await send('Input.dispatchMouseEvent', {
        type: 'mouseReleased', x: points.equity.x, y: points.equity.y, button: 'left', clickCount: 1,
      });
      assert.deepEqual(await detailState(), { visible: true, segment: 'equity', open: true },
        'desktop mouse click hides detail or closes the investment card');
    }
    console.log(`${width}x${height} @ ${rootFontPx}px text: viewport and detail pass`);
  }

} finally {
  try {
    if (socket?.readyState === WebSocket.OPEN) await send('Browser.close');
  } catch {}
  socket?.close();
  processHandle.kill();
  await pause(500);
  try {
    rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  } catch (error) {
    if (error.code !== 'EPERM' && error.code !== 'EBUSY') throw error;
  }
}
