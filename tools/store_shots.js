/*
 * Берёт скриншоты для карточки AMO в настоящем Firefox:
 * переведённая страница и панель настроек при 1280x800.
 */
'use strict';

const fs = require('fs');
const http = require('http');
const net = require('net');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const FIREFOX = 'C:\\Program Files\\Mozilla Firefox\\firefox.exe';
const EXT = path.join(__dirname, '..', 'firefox-translate-ru');
const PROFILE = path.join(__dirname, '..', '.ff-profile-shots');
const OUT = path.join(__dirname, '..', 'store', 'screenshots');
const PORT = 8767;
const MPORT = 2831;

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const rel = decodeURIComponent((req.url || '/').split('?')[0]);
      const file = path.join(EXT, 'test', rel === '/' ? 'demo.html' : rel.replace(/^\//, ''));
      fs.readFile(file, (err, data) => {
        if (err) { res.writeHead(404); res.end('not found'); return; }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(data);
      });
    });
    server.listen(PORT, '127.0.0.1', () => resolve(server));
  });
}

class Marionette {
  constructor(socket) {
    this.socket = socket;
    this.buffer = Buffer.alloc(0);
    this.id = 0;
    this.pending = new Map();
    socket.on('data', (chunk) => {
      this.buffer = Buffer.concat([this.buffer, chunk]);
      for (;;) {
        const colon = this.buffer.indexOf(0x3a);
        if (colon < 0) return;
        const len = parseInt(this.buffer.slice(0, colon).toString('utf8'), 10);
        if (this.buffer.length < colon + 1 + len) return;
        const msg = JSON.parse(this.buffer.slice(colon + 1, colon + 1 + len).toString('utf8'));
        this.buffer = this.buffer.slice(colon + 1 + len);
        if (Array.isArray(msg) && msg[0] === 1 && this.pending.has(msg[1])) {
          const p = this.pending.get(msg[1]);
          this.pending.delete(msg[1]);
          if (msg[2]) p.reject(new Error(msg[2].message || JSON.stringify(msg[2])));
          else p.resolve(msg[3]);
        }
      }
    });
  }
  send(name, params) {
    const id = ++this.id;
    const json = JSON.stringify([0, id, name, params || {}]);
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.write(Buffer.byteLength(json) + ':' + json);
      setTimeout(() => {
        if (this.pending.has(id)) { this.pending.delete(id); reject(new Error('timeout ' + name)); }
      }, 30000);
    });
  }
  async script(body) {
    const result = await this.send('WebDriver:ExecuteScript', { script: body, args: [] });
    return result && result.value;
  }
  async navigate(url) {
    return this.send('WebDriver:Navigate', { url });
  }
}

async function connect() {
  for (let i = 0; i < 80; i++) {
    const socket = await new Promise((resolve) => {
      const s = net.connect(MPORT, '127.0.0.1');
      s.once('connect', () => resolve(s));
      s.once('error', () => resolve(null));
    });
    if (socket) return new Marionette(socket);
    await wait(250);
  }
  throw new Error('marionette did not start');
}

async function main() {
  fs.rmSync(PROFILE, { recursive: true, force: true });
  fs.mkdirSync(PROFILE, { recursive: true });
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(PROFILE, 'user.js'), [
    'user_pref("marionette.port", ' + MPORT + ');',
    'user_pref("browser.shell.checkDefaultBrowser", false);',
    'user_pref("browser.startup.page", 0);',
    'user_pref("datareporting.policy.dataSubmissionEnabled", false);'
  ].join('\n'));

  const server = await startServer();
  const firefox = spawn(FIREFOX, ['-headless', '-marionette', '-remote-allow-system-access', '-no-remote', '-profile', PROFILE, 'about:blank'], { stdio: 'ignore' });
  let client = null;
  try {
    client = await connect();
    await wait(400);
    await client.send('WebDriver:NewSession', { capabilities: {} });
    await client.send('Addon:Install', { path: EXT, temporary: true });
    await wait(500);
    await client.send('WebDriver:SetWindowRect', { width: 1280, height: 1024, x: 0, y: 0 });
    await client.navigate('http://127.0.0.1:' + PORT + '/demo.html');

    for (let i = 0; i < 60; i++) {
      if (await client.script('return !!document.getElementById("dshl-root");')) break;
      await wait(250);
    }

    await client.script(`
      const btn = document.getElementById('dshl-root').shadowRoot.querySelector('.dshl-btn');
      const r = btn.getBoundingClientRect();
      const base = { bubbles: true, cancelable: true, composed: true, pointerId: 3, pointerType: 'touch', isPrimary: true, button: 0, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
      btn.dispatchEvent(new PointerEvent('pointerdown', Object.assign({}, base, { buttons: 1 })));
      btn.dispatchEvent(new PointerEvent('pointerup', Object.assign({}, base, { buttons: 0 })));
      return true;
    `);

    let done = false;
    for (let i = 0; i < 120; i++) {
      const label = await client.script('return document.getElementById("dshl-root").shadowRoot.querySelector(".dshl-btn__label").textContent;');
      if (label === '↺') { done = true; break; }
      await wait(300);
    }
    if (!done) throw new Error('translation did not finish');
    await wait(5200);

    let shot = await client.send('WebDriver:TakeScreenshot', { full: false });
    fs.writeFileSync(path.join(OUT, '01-translated.png'), Buffer.from(shot.value || shot, 'base64'));
    console.log('saved 01-translated.png');

    await client.script(`
      const btn = document.getElementById('dshl-root').shadowRoot.querySelector('.dshl-btn');
      const r = btn.getBoundingClientRect();
      const base = { bubbles: true, cancelable: true, composed: true, pointerId: 4, pointerType: 'touch', isPrimary: true, button: 0, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
      btn.dispatchEvent(new PointerEvent('pointerdown', Object.assign({}, base, { buttons: 1 })));
      return true;
    `);
    await wait(900);
    shot = await client.send('WebDriver:TakeScreenshot', { full: false });
    fs.writeFileSync(path.join(OUT, '02-settings.png'), Buffer.from(shot.value || shot, 'base64'));
    console.log('saved 02-settings.png');

    await client.send('WebDriver:DeleteSession', {});
  } finally {
    try { if (client) client.socket.destroy(); } catch (e) {}
    spawnSync('taskkill', ['/pid', String(firefox.pid), '/T', '/F'], { stdio: 'ignore' });
    server.close();
    await wait(400);
    try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch (e) {}
  }
}

main().catch((e) => { console.error('SHOTS FAILED:', e && e.stack || e); process.exit(1); });
