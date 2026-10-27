/*
 * End-to-end test in real Firefox (desktop) through the Marionette protocol.
 * Installs the unpacked extension as a temporary add-on, opens the demo page
 * over HTTP, taps the real floating button and checks the real translation
 * that the background script fetches from Google.
 *
 * This validates the manifest, browser.* APIs, content script, background
 * messaging and storage — everything except Fenix-specific UI.
 */
'use strict';

const fs = require('fs');
const http = require('http');
const net = require('net');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const FIREFOX = 'C:\\Program Files\\Mozilla Firefox\\firefox.exe';
const EXT = path.join(__dirname, '..', 'firefox-translate-ru');
const PROFILE = path.join(__dirname, '..', '.ff-profile-test');
const SHOTS = path.join(__dirname, '..', 'screenshots');
const PORT = 8765;
const MARIONETTE_PORT = 2829;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function assert(condition, message) {
  if (!condition) throw new Error('ASSERT: ' + message);
}

function startServer() {
  const server = http.createServer((request, response) => {
    const requestPath = decodeURIComponent((request.url || '/').split('?')[0]);
    console.log('HTTP request:', requestPath);
    const relative = (requestPath === '/' || requestPath === '/demo.html')
      ? '/test/demo.html'
      : (requestPath === '/csp.html' ? '/test/csp.html' : requestPath);
    const file = path.normalize(path.join(EXT, relative));
    if (!file.startsWith(EXT)) {
      response.writeHead(403);
      response.end('forbidden');
      return;
    }
    fs.readFile(file, (error, data) => {
      if (error) {
        response.writeHead(404);
        response.end('not found');
        return;
      }
      const type = file.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream';
      const headers = { 'Content-Type': type };
      if (process.env.CSP === '1') {
        headers['Content-Security-Policy'] = "default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:";
      }
      response.writeHead(200, headers);
      response.end(data);
    });
  });
  return new Promise((resolve) => server.listen(PORT, '127.0.0.1', () => resolve(server)));
}

class Marionette {
  constructor(socket) {
    this.socket = socket;
    this.buffer = Buffer.alloc(0);
    this.nextId = 0;
    this.pending = new Map();
    this.events = [];
    socket.on('data', (chunk) => {
      this.buffer = Buffer.concat([this.buffer, chunk]);
      this.parse();
    });
  }

  parse() {
    for (;;) {
      const colon = this.buffer.indexOf(0x3a);
      if (colon < 0) return;
      const length = parseInt(this.buffer.slice(0, colon).toString('utf8'), 10);
      if (!Number.isFinite(length) || length < 0) throw new Error('bad marionette frame');
      if (this.buffer.length < colon + 1 + length) return;
      const payload = this.buffer.slice(colon + 1, colon + 1 + length).toString('utf8');
      this.buffer = this.buffer.slice(colon + 1 + length);
      const message = JSON.parse(payload);
      this.handle(message);
    }
  }

  handle(message) {
    if (Array.isArray(message)) {
      const [kind, id, error, result] = message;
      if (kind === 1 && this.pending.has(id)) {
        const entry = this.pending.get(id);
        this.pending.delete(id);
        if (error) {
          const errorText = error.message || JSON.stringify(error);
          entry.reject(new Error(errorText));
        } else {
          entry.resolve(result);
        }
        return;
      }
      this.events.push(message);
      return;
    }
    this.events.push(message);
  }

  send(name, params) {
    const id = ++this.nextId;
    const json = JSON.stringify([0, id, name, params || {}]);
    const frame = Buffer.byteLength(json, 'utf8') + ':' + json;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.write(frame);
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error('Marionette timeout: ' + name));
        }
      }, 30000);
    });
  }

  async script(body, args) {
    const result = await this.send('WebDriver:ExecuteScript', { script: body, args: args || [] });
    return result && result.value;
  }

  async navigate(url) {
    return this.send('WebDriver:Navigate', { url });
  }
}

async function connectMarionette() {
  for (let attempt = 0; attempt < 80; attempt++) {
    const socket = await new Promise((resolve) => {
      const client = net.connect(MARIONETTE_PORT, '127.0.0.1');
      client.once('connect', () => resolve(client));
      client.once('error', () => resolve(null));
    });
    if (socket) return new Marionette(socket);
    await wait(250);
  }
  throw new Error('Marionette did not start on port ' + MARIONETTE_PORT);
}

async function main() {
  fs.rmSync(PROFILE, { recursive: true, force: true });
  fs.mkdirSync(path.join(PROFILE, 'extensions'), { recursive: true });
  fs.mkdirSync(SHOTS, { recursive: true });
  fs.writeFileSync(path.join(PROFILE, 'user.js'), [
    'user_pref("marionette.port", ' + MARIONETTE_PORT + ');',
    'user_pref("marionette.log.level", "error");',
    'user_pref("browser.shell.checkDefaultBrowser", false);',
    'user_pref("browser.startup.homepage_override.mstone", "ignore");',
    'user_pref("browser.startup.page", 0);',
    'user_pref("datareporting.policy.dataSubmissionEnabled", false);',
    'user_pref("datareporting.healthreport.uploadEnabled", false);',
    'user_pref("toolkit.telemetry.reportingpolicy.firstRun", false);',
    'user_pref("signon.rememberSignons", false);',
    'user_pref("devtools.debugger.prompt-connection", false);',
    'user_pref("browser.tabs.warnOnClose", false);',
    'user_pref("extensions.autoDisableScopes", 0);'
  ].join('\n'));

  const server = await startServer();
  const firefox = spawn(FIREFOX, [
    '-headless',
    '-marionette',
    '-remote-allow-system-access',
    '-no-remote',
    '-profile', PROFILE,
    'about:blank'
  ], { stdio: 'ignore' });

  let client = null;

  try {
    client = await connectMarionette();
    await wait(400);

    const session = await client.send('WebDriver:NewSession', { capabilities: {} });
    assert(session && session.sessionId, 'Marionette session created');
    console.log('Firefox session:', session.sessionId);

    const installed = await client.send('Addon:Install', { path: EXT, temporary: true });
    console.log('Addon:Install ->', JSON.stringify(installed));
    assert(installed && (installed.value || installed.addonId), 'temporary add-on installed');
    await wait(800);

    await client.send('Marionette:SetContext', { value: 'chrome' });
    const extensionInfo = await client.script(`
      const { ExtensionParent } = ChromeUtils.importESModule("resource://gre/modules/ExtensionParent.sys.mjs");
      const ext = ExtensionParent.GlobalManager.getExtension("page-translate-ru@skillex");
      let messages = [];
      try {
        messages = Services.console.getMessageArray().map((m) => String(m.message || m)).slice(-25);
      } catch (e) {
        messages = ['console unavailable: ' + e];
      }
      return JSON.stringify({
        found: !!ext,
        active: ext ? ext.active : null,
        errors: ext && ext.errors ? ext.errors.map(String) : null,
        scripts: ext && ext.manifest ? ext.manifest.content_scripts : null,
        permissions: ext && ext.manifest ? ext.manifest.permissions : null,
        console: messages
      });
    `);
    console.log('extension info:', extensionInfo);
    await client.send('Marionette:SetContext', { value: 'content' });

    try {
      await client.send('WebDriver:SetWindowRect', { width: 412, height: 915, x: 0, y: 0 });
    } catch (error) {
      console.log('SetWindowRect skipped:', error.message);
    }
    const testPage = process.env.CSP === '1' ? 'csp.html' : 'demo.html';
    await client.navigate('http://127.0.0.1:' + PORT + '/' + testPage);
    await wait(1000);
    await client.send('WebDriver:Refresh', {});
    await wait(1200);
    console.log('page:', JSON.stringify(await client.script(`return {
      href: location.href,
      title: document.title,
      state: document.readyState,
      text: (document.body ? document.body.innerText : '').slice(0, 120),
      nodes: document.querySelectorAll('*').length
    };`)));

    await client.send('Marionette:SetContext', { value: 'chrome' });
    const consoleDump = await client.script(`
      const { ExtensionParent } = ChromeUtils.importESModule("resource://gre/modules/ExtensionParent.sys.mjs");
      const ext = ExtensionParent.GlobalManager.getExtension("page-translate-ru@skillex");
      const policy = ext && ext.policy;
      const messages = Services.console.getMessageArray().map((m) => String(m.message || m));
      return JSON.stringify({
        allowedOrigins: policy ? policy.allowedOrigins : null,
        contentScripts: policy && policy.contentScripts ? policy.contentScripts.length : null,
        errors: ext && ext.errors ? ext.errors.map(String) : null,
        tail: messages.slice(-12)
      });
    `);
    console.log('after load:', consoleDump);
    await client.send('Marionette:SetContext', { value: 'content' });

    // wait for the content script to inject the button
    let ready = false;
    for (let attempt = 0; attempt < 80; attempt++) {
      ready = await client.script('return !!(document.getElementById("dshl-root") && document.getElementById("dshl-root").shadowRoot);');
      if (ready) break;
      await wait(250);
    }
    assert(ready, 'content script injected the floating button');

    const label = await client.script('return document.getElementById("dshl-root").shadowRoot.querySelector(".dshl-btn__label").textContent;');
    assert(label === 'RU', 'button label is RU, got ' + label);

    const buttonStyle = JSON.parse(await client.script(`
      const button = document.getElementById('dshl-root').shadowRoot.querySelector('.dshl-btn');
      const style = getComputedStyle(button);
      return JSON.stringify({ width: style.width, height: style.height, position: style.position, radius: style.borderRadius });
    `));
    console.log('button style:', JSON.stringify(buttonStyle));
    assert(buttonStyle.width === '54px' && buttonStyle.position === 'absolute', 'button styles applied (CSP does not strip the shadow styles)');

    const original = await client.script('return document.body.innerText;');
    const originalPre = await client.script('return document.querySelector("pre").textContent;');

    await client.script(`
      const host = document.getElementById('dshl-root');
      const button = host.shadowRoot.querySelector('.dshl-btn');
      const rect = button.getBoundingClientRect();
      const base = { bubbles: true, cancelable: true, composed: true, pointerId: 5,
        pointerType: 'touch', isPrimary: true, button: 0,
        clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 };
      button.dispatchEvent(new PointerEvent('pointerdown', Object.assign({}, base, { buttons: 1 })));
      button.dispatchEvent(new PointerEvent('pointerup', Object.assign({}, base, { buttons: 0 })));
      return true;
    `);

    // wait for the real translation (Google request from the background script)
    let translated = '';
    for (let attempt = 0; attempt < 100; attempt++) {
      translated = await client.script('return document.body.innerText;');
      if (translated !== original && /[А-Яа-яЁё]/.test(translated)) break;
      await wait(300);
    }
    assert(translated !== original, 'page text changed after the tap');
    assert(/[А-Яа-яЁё]/.test(translated), 'translated text contains Cyrillic');
    const cyrillic = (translated.match(/[А-Яа-яЁё]/g) || []).length;
    const latin = (translated.match(/[A-Za-z]/g) || []).length;
    assert(cyrillic > latin / 2, 'translation is predominantly Cyrillic (cyr=' + cyrillic + ', lat=' + latin + ')');

    const preAfter = await client.script('return document.querySelector("pre").textContent;');
    assert(preAfter === originalPre, 'code block text is untouched');

    let stateLabel = '';
    for (let attempt = 0; attempt < 300; attempt++) {
      stateLabel = await client.script('return document.getElementById("dshl-root").shadowRoot.querySelector(".dshl-btn__label").textContent;');
      if (stateLabel === '↺') break;
      await wait(300);
    }
    assert(stateLabel === '↺', 'translation finished and button shows restore state, got ' + stateLabel);

    const screenshot = await client.send('WebDriver:TakeScreenshot', { full: false });
    fs.writeFileSync(path.join(SHOTS, '03-firefox-translated.png'), Buffer.from(screenshot.value || screenshot, 'base64'));
    console.log('screenshot saved');
    console.log('sample translation:', translated.split('\n').filter(Boolean).slice(0, 3).join(' | ').slice(0, 220));

    // second tap restores the original
    await client.script(`
      const button = document.getElementById('dshl-root').shadowRoot.querySelector('.dshl-btn');
      const rect = button.getBoundingClientRect();
      const base = { bubbles: true, cancelable: true, composed: true, pointerId: 6,
        pointerType: 'touch', isPrimary: true, button: 0,
        clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 };
      button.dispatchEvent(new PointerEvent('pointerdown', Object.assign({}, base, { buttons: 1 })));
      button.dispatchEvent(new PointerEvent('pointerup', Object.assign({}, base, { buttons: 0 })));
      return true;
    `);
    await wait(800);
    const restored = await client.script('return document.body.innerText;');
    assert(restored === original, 'second tap returns the exact original text');
    console.log('restore: OK');

    // кнопка прячется при прокрутке вниз и возвращается при прокрутке вверх
    await client.script('window.scrollTo(0, 900); return true;');
    await wait(700);
    assert(await client.script('return document.getElementById("dshl-root").shadowRoot.querySelector(".dshl-btn").classList.contains("is-hidden");'),
      'button hides when scrolling down');
    await client.script('window.scrollTo(0, 0); return true;');
    await wait(700);
    assert(!(await client.script('return document.getElementById("dshl-root").shadowRoot.querySelector(".dshl-btn").classList.contains("is-hidden");')),
      'button returns when scrolling up');
    console.log('scroll hide: OK');

    // long press opens the settings panel
    await client.script(`
      const button = document.getElementById('dshl-root').shadowRoot.querySelector('.dshl-btn');
      const rect = button.getBoundingClientRect();
      const base = { bubbles: true, cancelable: true, composed: true, pointerId: 8,
        pointerType: 'touch', isPrimary: true, button: 0,
        clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 };
      button.dispatchEvent(new PointerEvent('pointerdown', Object.assign({}, base, { buttons: 1 })));
      return true;
    `);
    await wait(900);
    const panelOpen = await client.script('return !document.getElementById("dshl-root").shadowRoot.querySelector(".dshl-modal").hidden;');
    assert(panelOpen, 'long press opens the settings panel');
    const providers = await client.script('return document.getElementById("dshl-root").shadowRoot.querySelectorAll("#dshl-provider option").length;');
    assert(providers === 3, 'three providers in settings');
    const panelShot = await client.send('WebDriver:TakeScreenshot', { full: false });
    fs.writeFileSync(path.join(SHOTS, '04-firefox-settings.png'), Buffer.from(panelShot.value || panelShot, 'base64'));

    await client.send('WebDriver:DeleteSession', {});
    console.log('FIREFOX TEST OK');
  } finally {
    try {
      if (client && client.socket) client.socket.destroy();
    } catch (error) { /* ignore */ }
    spawnSync('taskkill', ['/pid', String(firefox.pid), '/T', '/F'], { stdio: 'ignore' });
    server.close();
    await wait(500);
    try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch (error) { /* ignore */ }
  }
}

main().catch((error) => {
  console.error('FIREFOX TEST FAILED:', error && error.stack ? error.stack : error);
  process.exit(1);
});
