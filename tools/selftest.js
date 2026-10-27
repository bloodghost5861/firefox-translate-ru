/* Self-test for the extension sources that can run outside a browser. */
'use strict';

const path = require('path');
const root = path.join(__dirname, '..', 'firefox-translate-ru');

require(path.join(root, 'lib', 'providers.js'));
require(path.join(root, 'content', 'text.js'));

const T = globalThis.DSHText;
const P = globalThis.DSHTranslate;

function assert(condition, message) {
  if (!condition) throw new Error('ASSERT: ' + message);
}

(async function () {
  // --- pure text helpers ------------------------------------------------
  assert(typeof T.splitLongText === 'function', 'splitLongText exported');
  const long = 'word '.repeat(300);
  const pieces = T.splitLongText(long, 500);
  assert(pieces.length >= 2, 'long text is split');
  pieces.forEach((piece, i) => assert(piece.length <= 500, 'piece ' + i + ' <= 500 chars, got ' + piece.length));
  assert(pieces.join(' ').replace(/\s+/g, ' ').trim() === T.collapse(long), 'split keeps all words');

  const items = [];
  for (let i = 0; i < 10; i++) items.push({ text: 'Sentence number ' + i + ' ' + 'x'.repeat(250), group: i, translation: null });
  const chunks = T.chunkItems(items);
  const flat = [].concat.apply([], chunks);
  assert(flat.length === 10, 'all items assigned to chunks');
  chunks.forEach((chunk, i) => assert(chunk.length > 0, 'chunk ' + i + ' is not empty'));

  assert(T.looksRussian([{ text: 'Привет, мир! Это обычный русский текст.' }]) === true, 'detects Russian');
  assert(T.looksRussian([{ text: 'Hello world, this is English text.' }]) === false, 'detects English');
  assert(T.looksRussian([{ text: 'Привіт, це український текст із літерою і.' }]) === false, 'does not treat Ukrainian as Russian');

  // --- providers --------------------------------------------------------
  assert(Array.isArray(P.providerNames) && P.providerNames.length === 3, 'three providers registered');

  let failed = null;
  try {
    await P.translate(['Hello'], { provider: 'deepl', target: 'ru', deeplKey: '' });
  } catch (error) {
    failed = error;
  }
  assert(failed && failed.code === 'no_key', 'DeepL without key fails with no_key');

  const translated = await P.translate(
    ['Hello world.', 'This is the second line.', 'A third sentence for testing.'],
    { provider: 'google', target: 'ru' }
  );
  assert(Array.isArray(translated) && translated.length === 3, 'Google returns one line per input line');
  translated.forEach((line, i) => {
    assert(typeof line === 'string' && line.length > 0, 'line ' + i + ' is a non-empty string');
    assert(/[А-Яа-яЁё]/.test(line), 'line ' + i + ' contains Cyrillic: ' + line);
  });

  console.log(JSON.stringify(translated, null, 2));
  console.log('SELFTEST OK');
})().catch((error) => {
  console.error('SELFTEST FAILED:', error && error.stack ? error.stack : error);
  process.exit(1);
});

// --- background wiring (runs after the provider checks above) ------------
(async function () {
  const listenerBox = [];
  globalThis.browser = {
    storage: {
      local: {
        get(defaults) {
          return Promise.resolve(Object.assign({}, defaults, { provider: 'google', target: 'ru' }));
        }
      }
    },
    runtime: {
      onMessage: {
        addListener(fn) { listenerBox.push(fn); }
      }
    }
  };

  require(path.join(root, 'background.js'));
  assert(listenerBox.length === 1, 'background registers one message listener');
  const handle = listenerBox[0];

  const response = await handle({ type: 'dshl:translate', texts: ['Good morning', 'See you later'] });
  assert(response && response.ok === true, 'background answers ok');
  assert(Array.isArray(response.translations) && response.translations.length === 2, 'background returns two translations');
  assert(/[А-Яа-яЁё]/.test(response.translations[0]), 'background translation has Cyrillic');

  const cached = await handle({ type: 'dshl:translate', texts: ['Good morning', 'See you later'] });
  assert(cached.ok && cached.translations.join('|') === response.translations.join('|'), 'second identical request is served consistently');

  const failure = await handle({ type: 'dshl:translate', texts: ['Hello'], provider: 'deepl' });
  assert(failure.ok === false && /ключ/i.test(failure.error), 'missing DeepL key becomes a readable error');

  console.log('BACKGROUND TEST OK');
})().catch((error) => {
  console.error('BACKGROUND TEST FAILED:', error && error.stack ? error.stack : error);
  process.exit(1);
});

