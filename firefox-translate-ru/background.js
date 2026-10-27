/*
 * Фоновый скрипт: хранит настройки и выполняет запросы к сервисам перевода.
 * Запросы идут из расширения (а не со страницы), поэтому CORS и CSP сайта не мешают.
 */
'use strict';

var DEFAULTS = {
  provider: 'google',
  source: 'auto',
  target: 'ru',
  deeplKey: '',
  libreUrl: '',
  libreKey: '',
  alwaysTranslate: false
};

var CACHE_LIMIT = 400;
var cache = new Map();

function getSettings() {
  return browser.storage.local.get(DEFAULTS).catch(function () {
    return Object.assign({}, DEFAULTS);
  });
}

function cacheKey(options, texts) {
  return options.provider + '|' + options.source + '|' + options.target + '|' + texts.join('\u0000');
}

function cacheGet(key) {
  return cache.get(key);
}

function cacheSet(key, value) {
  if (cache.size >= CACHE_LIMIT) {
    var oldest = cache.keys().next();
    if (!oldest.done) cache.delete(oldest.value);
  }
  cache.set(key, value);
}

async function handleTranslate(message) {
  var settings = await getSettings();
  var options = {
    provider: message.provider || settings.provider,
    source: message.source || settings.source,
    target: message.target || settings.target,
    deeplKey: settings.deeplKey,
    libreUrl: settings.libreUrl,
    libreKey: settings.libreKey
  };
  var texts = Array.isArray(message.texts) ? message.texts.map(String) : [];
  if (!texts.length) return { ok: true, translations: [] };

  var key = cacheKey(options, texts);
  var cached = cacheGet(key);
  if (cached) return { ok: true, translations: cached.slice() };

  var translations = await DSHTranslate.translate(texts, options);
  cacheSet(key, translations.slice());
  return { ok: true, translations: translations };
}

browser.runtime.onMessage.addListener(function (message) {
  if (!message || typeof message !== 'object') return undefined;

  if (message.type === 'dshl:translate') {
    return handleTranslate(message).catch(function (error) {
      return {
        ok: false,
        error: error && error.message ? error.message : 'Не удалось перевести текст',
        code: (error && error.code) || 'error'
      };
    });
  }

  if (message.type === 'dshl:ping') {
    return Promise.resolve({ ok: true });
  }

  return undefined;
});
