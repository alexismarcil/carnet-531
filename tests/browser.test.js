'use strict';
// Real mobile-sized Edge smoke test, using the built-in DevTools protocol (no npm dependencies).
const {test} = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawn} = require('node:child_process');
const C = require('../carnet.js');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

test('mobile browser: automatic blocks, upgrade, persistence, import/export and offline reload', {timeout: 60000}, async t => {
  const browserPath = process.env.CARNET_BROWSER || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  assert.ok(fs.existsSync(browserPath), 'Set CARNET_BROWSER to a Chromium/Edge executable.');
  const root = path.resolve(__dirname, '..');
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-531-browser-'));
  const mime = {'.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.webmanifest': 'application/manifest+json'};
  const server = http.createServer((request, response) => {
    const name = new URL(request.url, 'http://localhost').pathname.slice(1) || 'index.html';
    if (!['index.html', 'app.js', 'carnet.js', 'style.css', 'sw.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png'].includes(name)) {
      response.writeHead(404).end(); return;
    }
    response.setHeader('Content-Type', (mime[path.extname(name)] || 'text/plain') + (name.endsWith('.png') ? '' : '; charset=utf-8'));
    response.end(fs.readFileSync(path.join(root, name)));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}/`;
  const browser = spawn(browserPath, ['--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run', '--no-default-browser-check',
    '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], {windowsHide: true, stdio: 'ignore'});
  let ws;
  t.after(async () => {
    ws?.close(); browser.kill(); server.closeAllConnections(); server.close();
    // The browser owns its temporary profile; leave cleanup to the OS if files are still locked.
    await sleep(300);
    const resolvedProfile = path.resolve(profile);
    assert.ok(resolvedProfile.startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(resolvedProfile).startsWith('carnet-531-browser-'));
    try { fs.rmSync(resolvedProfile, {recursive: true, force: true}); } catch {}
  });
  const activePortFile = path.join(profile, 'DevToolsActivePort');
  for (let i = 0; i < 100 && !fs.existsSync(activePortFile); i++) await sleep(100);
  assert.ok(fs.existsSync(activePortFile), 'Browser must start and expose DevTools.');
  const port = fs.readFileSync(activePortFile, 'utf8').split('\n')[0];
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`, {signal: AbortSignal.timeout(5000)})).json();
  ws = new WebSocket(targets.find(target => target.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, {once: true}); ws.addEventListener('error', reject, {once: true}); });
  let counter = 0;
  const pending = new Map(), errors = [];
  ws.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.id) {
      const task = pending.get(message.id); pending.delete(message.id);
      if (!task) return;
      clearTimeout(task.timer);
      if (message.error) task.reject(new Error(JSON.stringify(message.error))); else task.resolve(message.result);
    }
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails);
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++counter;
    const timer = setTimeout(() => {pending.delete(id); reject(new Error('DevTools timeout: ' + method));}, 5000);
    pending.set(id, {resolve, reject, timer}); ws.send(JSON.stringify({id, method, params}));
  });
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', {expression, returnByValue: true, awaitPromise: true});
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  const waitFor = async expression => {
    for (let i = 0; i < 80; i++) {
      try { if (await evaluate(expression)) return; } catch {}
      await sleep(100);
    }
    throw new Error('Timed out: ' + expression);
  };
  const click = selector => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const input = (selector, value, event = 'input') => evaluate(`(() => {const node = document.querySelector(${JSON.stringify(selector)}); node.value = ${JSON.stringify(value)}; node.dispatchEvent(new Event(${JSON.stringify(event)}, {bubbles:true}));})()`);
  const database = () => evaluate("JSON.parse(localStorage.getItem('531powerbuilding-v1'))");
  const currentBlock = id => evaluate(`document.querySelector('[data-current-block="${id}"]').textContent`);

  console.log('Browser connected');
  await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
  await send('Emulation.setDeviceMetricsOverride', {width: 390, height: 844, deviceScaleFactor: 1, mobile: true});
  const old = C.fresh(); old.schema = 'ca.carnet531.v1'; delete old.movementDrafts;
  old.cycles[0].tms = {squat: 150, bench: 100, deadlift: 180, front: 110, ohp: 60};
  old.sessions = [{id: 'old', cycle: 1, block: 0, day: 3, date: '2026-10-30', notes: 'Ancien duo', movements: [{id: 'front'}, {id: 'ohp'}]}];
  old.plans['1-1-3-front'] = {draft: {front: {style: 'ssl', reps: 8}}};
  await send('Page.addScriptToEvaluateOnNewDocument', {source: `if (location.origin === ${JSON.stringify(url.slice(0, -1))} && !localStorage.getItem('_test_seeded')) {
    localStorage.setItem('531powerbuilding-v1', ${JSON.stringify(JSON.stringify(old))});
    localStorage.setItem('531powerbuilding-ui-v2', JSON.stringify({cy:1,b:1,day:3,note:'Reprise',repsActual:'6'}));
    localStorage.setItem('531powerbuilding-checks-v1', JSON.stringify({'1-1-3-front':[true,false,false,false,false]}));
    localStorage.setItem('_test_seeded','yes');
  }`});
  await send('Page.navigate', {url});
  await waitFor("document.querySelectorAll('[data-toggle]').length === 5 && navigator.serviceWorker.controller");
  await waitFor("document.readyState === 'complete' && document.querySelectorAll('#moves article').length === 2");
  console.log('Upgrade and service worker ready');
  assert.deepEqual((await database()).sessions, old.sessions);
  assert.equal(await evaluate("localStorage.getItem('531powerbuilding-backup-v1') !== null"), true);
  assert.equal(await evaluate("document.querySelector('#actual-front').value"), '6');
  assert.equal(await evaluate("document.querySelector('[data-check-id=front]').getAttribute('aria-pressed')"), 'true');
  assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true);
  assert.equal(await evaluate("document.querySelectorAll('#moves select, [data-block-id]').length"), 0);
  assert.match(await currentBlock('front'), /Bloc B/);
  assert.match(await currentBlock('ohp'), /Bloc B/);

  // A draft survives removing/readding a movement; old manual block overrides are ignored.
  await click('[data-remove=front]'); await click('[data-toggle=front]');
  assert.equal(await evaluate("document.querySelector('#actual-front').value"), '6');
  await input('#actual-ohp', '8');
  await click('[data-toggle=bench]');
  await click('[data-reps-id=bench][data-reps="10"]');
  await click('[data-check-id=bench][data-set="2"]');
  await evaluate("(() => {const key='531powerbuilding-ui-v3'; const ui=JSON.parse(localStorage.getItem(key)); ui.blocks={'1-front':2,'1-ohp':0,'1-bench':2}; localStorage.setItem(key,JSON.stringify(ui));})()");
  await send('Page.reload');
  await waitFor("document.querySelectorAll('#moves article').length === 3");
  assert.match(await currentBlock('front'), /Bloc B/);
  assert.match(await currentBlock('ohp'), /Bloc B/);
  assert.match(await currentBlock('bench'), /Bloc A/);
  assert.equal(await evaluate("Object.hasOwn(JSON.parse(localStorage.getItem('531powerbuilding-ui-v3')), 'blocks')"), false);
  assert.equal(await evaluate("document.querySelector('#actual-ohp').value"), '8');
  assert.equal(await evaluate("document.querySelector('[data-check-id=bench][data-set=\"2\"]').getAttribute('aria-pressed')"), 'true');
  await click('#save');
  console.log('Grouped session saved');
  let saved = await database();
  assert.equal(saved.sessions.length, 2);
  assert.deepEqual(saved.sessions[1].movements.map(m => [m.id, m.block]), [['ohp', 1], ['front', 1], ['bench', 0]]);
  assert.equal(saved.sessions[1].movements.find(m => m.id === 'ohp').main[2].actualReps, 8);
  assert.equal(saved.sessions[1].movements.find(m => m.id === 'front').main[2].actualReps, 6);
  assert.equal(saved.sessions[1].movements.find(m => m.id === 'bench').supplementary.sets[2].completed, true);
  assert.equal(saved.cycles.length, 1);
  await click('[data-toggle=bench]');
  assert.match(await currentBlock('bench'), /Bloc B/);
  await click('[data-toggle=ohp]');
  assert.match(await currentBlock('ohp'), /Bloc C/);

  // Completing OHP alone leaves bench at B and prevents any repeat after C.
  await evaluate('window._confirms=[]; window.confirm = message => {window._confirms.push(message); return false;};');
  await click('[data-remove=bench]');
  await click('#save');
  saved = await database();
  assert.equal(saved.sessions.length, 3);
  assert.deepEqual(saved.sessions[2].movements.map(m => [m.id, m.block]), [['ohp', 2]]);
  assert.equal(await evaluate("document.querySelector('[data-toggle=ohp]').disabled"), true);
  await click('[data-toggle=ohp]'); await click('#save');
  assert.equal((await database()).sessions.length, 3);
  assert.equal(await evaluate("document.querySelectorAll('#moves article').length"), 0);
  assert.equal(await evaluate('window._confirms.length'), 0);
  await click('[data-toggle=bench]');
  assert.match(await currentBlock('bench'), /Bloc B/);
  await click('#tabTM'); await click('#next');
  assert.equal((await database()).cycles.length, 1);
  assert.match(await evaluate('window._confirms.at(-1)'), /incomplet/);

  // Export captures the actual JSON blob, and import restores it through the real input handler.
  await evaluate('window._export=null; URL.createObjectURL = blob => {window._export=blob; return "blob:test";}; HTMLAnchorElement.prototype.click=function(){};');
  await click('#export');
  const exported = await evaluate('window._export.text()');
  console.log('JSON exported');
  assert.deepEqual(JSON.parse(exported), await database());
  await evaluate('window.confirm=()=>true;');
  await evaluate(`(async () => {const transfer=new DataTransfer(); transfer.items.add(new File([${JSON.stringify(exported)}], 'backup.json', {type:'application/json'})); const input=document.querySelector('#importFile'); input.files=transfer.files; await input.onchange({target:input});})()`);
  assert.deepEqual(await database(), JSON.parse(exported));
  const beforeInvalid = await database();
  await evaluate('window._alert=""; window.alert=message=>window._alert=message;');
  await evaluate(`(async () => {const transfer=new DataTransfer(); transfer.items.add(new File(['{}'], 'invalid.json')); const input=document.querySelector('#importFile'); input.files=transfer.files; await input.onchange({target:input});})()`);
  assert.deepEqual(await database(), beforeInvalid);
  assert.match(await evaluate('window._alert'), /invalide/);

  // The new JS/CSS assets must all be present in the offline cache.
  await waitFor("caches.open('carnet-531-v4').then(async cache => (await cache.keys()).length === 8)");
  console.log('Offline cache ready');
  await send('Network.emulateNetworkConditions', {offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0});
  await send('Page.reload');
  await waitFor("document.readyState === 'complete' && document.querySelectorAll('[data-toggle]').length === 5");
  assert.deepEqual((await database()).sessions, saved.sessions);
  await click('[data-toggle=front]');
  assert.match(await currentBlock('front'), /Bloc C/);
  await send('Emulation.setDeviceMetricsOverride', {width: 320, height: 700, deviceScaleFactor: 1, mobile: true});
  assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true);
  await click('#tabTM');
  await evaluate('window.confirm=()=>true;');
  await click('#next');
  const next = await database();
  assert.equal(next.cycles.length, 2);
  assert.deepEqual(next.cycles[1].tms, {squat: 155, bench: 102.5, deadlift: 185, front: 115, ohp: 62.5});
  assert.equal(await evaluate("document.querySelector('#cycle').value"), '2');
  assert.equal(await evaluate("document.querySelectorAll('#moves article').length"), 0);
  await click('[data-toggle=front]');
  assert.match(await currentBlock('front'), /Bloc A/);
  await input('#cycle', '1', 'change');
  await click('[data-toggle=front]');
  assert.match(await currentBlock('front'), /Bloc C/);
  if (process.env.CARNET_SCREENSHOT) {
    const shot = await send('Page.captureScreenshot', {format: 'png', captureBeyondViewport: true});
    fs.writeFileSync(process.env.CARNET_SCREENSHOT, Buffer.from(shot.data, 'base64'));
  }
  assert.deepEqual(errors, []);
});
