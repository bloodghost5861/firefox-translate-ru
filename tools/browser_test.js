/*
 * Smoke test in real Chromium (via CDP, no Playwright):
 * injects the extension's content scripts into test/demo.html with a
 * browser.* shim, taps the floating button, checks the DOM, saves screenshots.
 *
 * This does not replace testing in Firefox for Android, but it catches
 * runtime errors in the content script and verifies the tap/drag/panel logic.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const { pathToFileURL } = require('url');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9333;
const EXT = path.join(__dirname, '..', 'firefox-translate-ru');
const SHOTS = path.join(__dirname, '..', 'screenshots');
const PROFILE = path.join(__dirname, '..', '.chrome-profile-test');

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function assert(condition, message) {
  if (!condition) throw new Error('ASSERT: ' + message);
}

const SHIM = `
(() => {
  const store = {
    provider: 'google',
    source: 'auto',
    target: 'ru',
    deeplKey: '',
    libreUrl: '',
    libreKey: '',
    alwaysTranslate: false
  };
  const listeners = [];
  window.__store = store;
  window.browser = {
    storage: {
      local: {
        get(defaults) {
          return Promise.resolve(Object.assign({}, defaults || {}, store));
        },
        set(values) {
          Object.assign(store, values);
          listeners.forEach((fn) => fn(values, 'local'));
          return Promise.resolve();
        }
      },
      onChanged: { addListener(fn) { listeners.push(fn); } }
    },
    runtime: {
      sendMessage(message) {
        if (!message || message.type !== 'dshl:translate') return Promise.resolve({ ok: true });
        return new Promise((resolve) => {
          setTimeout(() => {
            resolve({ ok: true, translations: message.texts.map((text) => 'ПЕРЕВОД: ' + text) });
          }, 25);
        });
      }
    }
  };
})();
`;

async function main() {
  fs.rmSync(PROFILE, { recursive: true, force: true });
  fs.mkdirSync(SHOTS, { recursive: true });

  const chrome = spawn(CHROME, [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    '--disable-extensions',
    '--hide-scrollbars',
    '--window-size=412,915',
    '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + PROFILE,
    'about:blank'
  ], { stdio: 'ignore' });

  let ws = null;
  const errors = [];

  try {
    let version = null;
    for (let attempt = 0; attempt < 120; attempt++) {
      try {
        const response = await fetch('http://127.0.0.1:' + PORT + '/json/version');
        if (response.ok) { version = await response.json(); break; }
      } catch (error) { /* not up yet */ }
      await wait(150);
    }
    assert(version, 'Chrome DevTools endpoint did not start');
    console.log('Browser:', version.Browser);

    const list = await (await fetch('http://127.0.0.1:' + PORT + '/json/list')).json();
    const page = list.find((target) => target.type === 'page');
    assert(page && page.webSocketDebuggerUrl, 'no page target found');

    ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve);
      ws.addEventListener('error', reject);
    });

    let nextId = 0;
    const pending = new Map();

    ws.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.id && pending.has(message.id)) {
        const entry = pending.get(message.id);
        pending.delete(message.id);
        if (message.error) entry.reject(new Error(message.error.message));
        else entry.resolve(message.result);
        return;
      }
      if (message.method === 'Runtime.exceptionThrown') {
        const details = message.params.exceptionDetails;
        errors.push(details.exception && details.exception.description ? details.exception.description : details.text);
      }
      if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
        errors.push(message.params.args.map((arg) => arg.value || arg.description || '').join(' '));
      }
    });

    function send(method, params) {
      return new Promise((resolve, reject) => {
        const id = ++nextId;
        pending.set(id, { resolve, reject });
        ws.send(JSON.stringify({ id, method, params: params || {} }));
      });
    }

    async function evaluate(expression) {
      const result = await send('Runtime.evaluate', {
        expression,
        awaitPromise: true,
        returnByValue: true,
        userGesture: true
      });
      if (result.exceptionDetails) {
        const details = result.exceptionDetails;
        throw new Error('Page error: ' + (details.exception && details.exception.description || details.text));
      }
      return result.result ? result.result.value : undefined;
    }

    async function shot(name) {
      const result = await send('Page.captureScreenshot', { format: 'png' });
      const file = path.join(SHOTS, name);
      fs.writeFileSync(file, Buffer.from(result.data, 'base64'));
      console.log('screenshot:', file);
    }

    await send('Page.enable');
    await send('Runtime.enable');
    await send('Emulation.setDeviceMetricsOverride', {
      width: 412,
      height: 915,
      deviceScaleFactor: 2,
      mobile: true
    });

    const url = pathToFileURL(path.join(EXT, 'test', 'demo.html')).href;
    await send('Page.navigate', { url });
    for (let attempt = 0; attempt < 100; attempt++) {
      if (await evaluate('document.readyState') === 'complete') break;
      await wait(100);
    }

    const sources = [
      SHIM,
      fs.readFileSync(path.join(EXT, 'content', 'text.js'), 'utf8'),
      fs.readFileSync(path.join(EXT, 'content', 'ui.js'), 'utf8'),
      fs.readFileSync(path.join(EXT, 'content', 'main.js'), 'utf8')
    ];
    await evaluate(sources.join('\n;\n') + '\n;\n"injected"');

    await wait(150);

    const ui = `document.getElementById('dshl-root').shadowRoot`;
    const buttonInfo = await evaluate(`(() => {
      const btn = ${ui}.querySelector('.dshl-btn');
      if (!btn) return null;
      const rect = btn.getBoundingClientRect();
      return { label: btn.textContent.trim(), left: rect.left, top: rect.top, width: rect.width, height: rect.height };
    })()`);
    assert(buttonInfo, 'floating button was not created');
    assert(buttonInfo.width > 40, 'button has non-zero size');
    assert(buttonInfo.left >= 0 && buttonInfo.left < 412, 'button is inside viewport horizontally');
    assert(buttonInfo.top >= 0 && buttonInfo.top < 915, 'button is inside viewport vertically');
    assert(buttonInfo.label === 'RU', 'default label is RU, got ' + buttonInfo.label);
    console.log('button:', JSON.stringify(buttonInfo));

    const originalText = await evaluate('document.body.innerText');
    const originalPre = await evaluate(`document.querySelector('pre').textContent`);

    async function tap() {
      await evaluate(`(() => {
        const btn = ${ui}.querySelector('.dshl-btn');
        const rect = btn.getBoundingClientRect();
        const base = {
          bubbles: true, cancelable: true, composed: true, pointerId: 7,
          pointerType: 'touch', isPrimary: true, button: 0,
          clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2
        };
        btn.dispatchEvent(new PointerEvent('pointerdown', Object.assign({}, base, { buttons: 1 })));
        btn.dispatchEvent(new PointerEvent('pointerup', Object.assign({}, base, { buttons: 0 })));
        return true;
      })()`);
    }

    await tap();
    await wait(1800);

    const translatedText = await evaluate('document.body.innerText');
    assert(translatedText.includes('ПЕРЕВОД:'), 'page text was not translated');
    assert(!originalText.includes('ПЕРЕВОД:'), 'original text was already translated');

    const afterLabel = await evaluate(`${ui}.querySelector('.dshl-btn__label').textContent`);
    assert(afterLabel === '↺', 'button switched to restore state, got ' + afterLabel);

    const preAfter = await evaluate(`document.querySelector('pre').textContent`);
    assert(preAfter.includes('Hello, ') && !preAfter.includes('ПЕРЕВОД:'), 'code block was left untouched');

    const inlineCode = await evaluate(`document.querySelector('code').textContent`);
    assert(!inlineCode.includes('ПЕРЕВОД:'), 'inline code was left untouched');

    await shot('01-translated.png');

    await tap();
    await wait(400);
    const restoredText = await evaluate('document.body.innerText');
    assert(restoredText === originalText, 'restore returns the exact original text');
    const restoredLabel = await evaluate(`${ui}.querySelector('.dshl-btn__label').textContent`);
    assert(restoredLabel === 'RU', 'button label restored, got ' + restoredLabel);
    console.log('tap translate/restore: OK');

    // long press opens settings
    await evaluate(`(() => {
      const btn = ${ui}.querySelector('.dshl-btn');
      const rect = btn.getBoundingClientRect();
      const base = {
        bubbles: true, cancelable: true, composed: true, pointerId: 9,
        pointerType: 'touch', isPrimary: true, button: 0,
        clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2
      };
      btn.dispatchEvent(new PointerEvent('pointerdown', Object.assign({}, base, { buttons: 1 })));
      return true;
    })()`);
    await wait(800);
    const panelOpen = await evaluate(`!${ui}.querySelector('.dshl-modal').hidden`);
    assert(panelOpen, 'long press opens the settings panel');
    const providerOptions = await evaluate(`${ui}.querySelectorAll('#dshl-provider option').length`);
    assert(providerOptions === 3, 'settings panel has three providers');
    await shot('02-settings.png');

    // размер кнопки меняется слайдером и сохраняется
    await evaluate(`(() => {
      const input = ${ui}.querySelector('#dshl-size');
      input.value = '72';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()`);
    await evaluate(`${ui}.querySelector('.dshl-primary').click()`);
    await wait(400);
    console.log('size debug:', JSON.stringify(await evaluate(`(() => {
      const host = document.getElementById('dshl-root');
      const root = host.shadowRoot;
      const btn = root.querySelector('.dshl-btn');
      return {
        slider: root.querySelector('#dshl-size').value,
        varValue: root.querySelector('.dshl-layer').style.getPropertyValue('--dshl-size'),
        width: btn.getBoundingClientRect().width,
        modalHidden: root.querySelector('.dshl-modal').hidden,
        stored: window.__store.buttonSize
      };
    })()`)));
    const sizeAfter = await evaluate(`${ui}.querySelector('.dshl-btn').getBoundingClientRect().width`);
    assert(Math.abs(sizeAfter - 72) < 1, 'button size changed to 72, got ' + sizeAfter);
    const storedSize = await evaluate('window.__store.buttonSize');
    assert(storedSize === 72, 'button size saved to storage, got ' + storedSize);
    console.log('size change: OK');

    await evaluate(`${ui}.querySelector('.dshl-close').click()`);
    await wait(150);
    assert(await evaluate(`${ui}.querySelector('.dshl-modal').hidden`), 'panel closes');

    // drag moves the button and stores its position
    const before = await evaluate(`(() => {
      const btn = ${ui}.querySelector('.dshl-btn');
      return { left: btn.getBoundingClientRect().left, top: btn.getBoundingClientRect().top };
    })()`);
    await evaluate(`(() => {
      const btn = ${ui}.querySelector('.dshl-btn');
      const rect = btn.getBoundingClientRect();
      const base = {
        bubbles: true, cancelable: true, composed: true, pointerId: 11,
        pointerType: 'touch', isPrimary: true, button: 0,
        clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2
      };
      btn.dispatchEvent(new PointerEvent('pointerdown', Object.assign({}, base, { buttons: 1 })));
      btn.dispatchEvent(new PointerEvent('pointermove', Object.assign({}, base, {
        buttons: 1, clientX: base.clientX - 180, clientY: base.clientY - 320
      })));
      btn.dispatchEvent(new PointerEvent('pointerup', Object.assign({}, base, {
        buttons: 0, clientX: base.clientX - 180, clientY: base.clientY - 320
      })));
      return true;
    })()`);
    await wait(300);
    const after = await evaluate(`(() => {
      const btn = ${ui}.querySelector('.dshl-btn');
      return { left: btn.getBoundingClientRect().left, top: btn.getBoundingClientRect().top, pos: window.__store['dshl:pos'] };
    })()`);
    assert(Math.abs(after.left - before.left) > 50, 'drag moved the button horizontally');
    assert(Math.abs(after.top - before.top) > 50, 'drag moved the button vertically');
    assert(after.pos && typeof after.pos.x === 'number', 'position saved to storage');
    console.log('panel + drag: OK');

    // кнопка прячется при прокрутке вниз и возвращается при прокрутке вверх
    await evaluate('window.scrollTo(0, 800); true');
    await wait(500);
    const hiddenDown = await evaluate(`${ui}.querySelector('.dshl-btn').classList.contains('is-hidden')`);
    assert(hiddenDown, 'button hides when scrolling down');
    await evaluate('window.scrollTo(0, 0); true');
    await wait(500);
    const hiddenUp = await evaluate(`${ui}.querySelector('.dshl-btn').classList.contains('is-hidden')`);
    assert(!hiddenUp, 'button returns when scrolling up');
    console.log('scroll hide: OK');

    assert(errors.length === 0, 'no page errors, got: ' + errors.join(' | '));
    console.log('BROWSER TEST OK');
  } finally {
    try { if (ws) ws.close(); } catch (error) { /* ignore */ }
    spawnSync('taskkill', ['/pid', String(chrome.pid), '/T', '/F'], { stdio: 'ignore' });
    await wait(400);
    try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch (error) { /* ignore */ }
  }
}

main().catch((error) => {
  console.error('BROWSER TEST FAILED:', error && error.stack ? error.stack : error);
  process.exit(1);
});
