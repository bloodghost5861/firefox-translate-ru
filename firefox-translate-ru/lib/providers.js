/*
 * Сервисы перевода для расширения «Перевод страницы на русский».
 *
 * Файл намеренно не обращается к browser.* — его можно проверить отдельно:
 *   node -e "require('./lib/providers.js');globalThis.DSHTranslate.translate(['Hello world'],{provider:'google',target:'ru'}).then(console.log)"
 *
 * Контракт: translate(texts: string[], options) -> Promise<string[]>
 * Длина результата всегда совпадает с длиной texts.
 */
(function (global) {
  'use strict';

  var DEFAULT_TIMEOUT = 25000;
  var MAX_URL_LENGTH = 7000;

  class TranslationError extends Error {
    constructor(message, code) {
      super(message);
      this.name = 'TranslationError';
      this.code = code || 'error';
    }
  }

  function sleep(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  function normalize(value) {
    return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
  }

  function fetchWithTimeout(url, options) {
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, options && options.timeoutMs ? options.timeoutMs : DEFAULT_TIMEOUT);
    var init = {
      method: (options && options.method) || 'GET',
      headers: (options && options.headers) || {},
      body: options && options.body,
      signal: controller.signal,
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'follow'
    };
    if (init.body == null) delete init.body;
    return global.fetch(url, init).catch(function (error) {
      if (error && error.name === 'AbortError') {
        throw new TranslationError('Сервис перевода не ответил вовремя', 'timeout');
      }
      throw new TranslationError('Не удалось связаться с сервисом перевода. Проверьте интернет.', 'network');
    }).finally(function () {
      clearTimeout(timer);
    });
  }

  /* ------------------------------------------------------------------ */
  /* Google (публичный endpoint переводчика, ключ не нужен)              */
  /* ------------------------------------------------------------------ */

  function buildGoogleUrl(lines, options) {
    var params = new URLSearchParams();
    params.set('client', 'gtx');
    params.set('dt', 't');
    params.set('sl', (options && options.source) || 'auto');
    params.set('tl', (options && options.target) || 'ru');
    params.set('q', lines.join('\n'));
    return 'https://translate.googleapis.com/translate_a/single?' + params.toString();
  }

  function parseGoogle(payload, expectedCount) {
    if (!Array.isArray(payload) || !Array.isArray(payload[0])) return null;
    var text = '';
    for (var i = 0; i < payload[0].length; i++) {
      var part = payload[0][i];
      if (Array.isArray(part) && typeof part[0] === 'string') text += part[0];
    }
    var lines = text.split('\n');
    while (lines.length > 1 && lines[lines.length - 1].trim() === '') lines.pop();
    if (lines.length !== expectedCount) {
      if (expectedCount === 1) return [normalize(text)];
      return null;
    }
    return lines.map(normalize);
  }

  async function googleTranslateOneByOne(lines, options) {
    var result = [];
    for (var i = 0; i < lines.length; i++) {
      var single = await googleTranslate([lines[i]], options);
      result.push(single[0]);
      await sleep(150);
    }
    return result;
  }

  async function googleTranslate(lines, options) {
    var prepared = lines.map(normalize);
    for (var i = 0; i < prepared.length; i++) {
      if (!prepared[i]) throw new TranslationError('Попался пустой фрагмент текста', 'empty');
    }
    var url = buildGoogleUrl(prepared, options);
    if (url.length > MAX_URL_LENGTH && prepared.length > 1) {
      var middle = Math.ceil(prepared.length / 2);
      var left = await googleTranslate(prepared.slice(0, middle), options);
      var right = await googleTranslate(prepared.slice(middle), options);
      return left.concat(right);
    }
    var response = await fetchWithTimeout(url, { method: 'GET', headers: { 'Accept': 'application/json' } });
    if (!response.ok) {
      throw new TranslationError('Google не смог перевести (код ' + response.status + ')', 'http_' + response.status);
    }
    var payload;
    try {
      payload = await response.json();
    } catch (error) {
      throw new TranslationError('Google вернул неожиданный ответ', 'parse');
    }
    var parsed = parseGoogle(payload, prepared.length);
    if (parsed) return parsed;
    if (prepared.length > 1) return googleTranslateOneByOne(prepared, options);
    throw new TranslationError('Google вернул текст в неизвестном формате', 'parse');
  }

  /* ------------------------------------------------------------------ */
  /* DeepL (нужен ключ API)                                              */
  /* ------------------------------------------------------------------ */

  var DEEPL_TARGET_ALIASES = { en: 'EN-US', pt: 'PT-PT', zh: 'ZH', 'zh-cn': 'ZH', 'zh-tw': 'ZH' };

  function deeplSourceLang(code) {
    var value = String(code || '').toLowerCase();
    if (!value) return '';
    return value.split('-')[0].toUpperCase();
  }

  async function deeplTranslate(lines, options) {
    var key = String((options && options.deeplKey) || '').trim();
    if (!key) {
      throw new TranslationError('Не задан ключ DeepL. Удерживайте кнопку и откройте настройки.', 'no_key');
    }
    var target = String((options && options.target) || 'ru');
    var deeplTarget = DEEPL_TARGET_ALIASES[target.toLowerCase()] || target.toUpperCase();
    var endpoint = key.slice(-3) === ':fx'
      ? 'https://api-free.deepl.com/v2/translate'
      : 'https://api.deepl.com/v2/translate';
    var body = new URLSearchParams();
    for (var i = 0; i < lines.length; i++) body.append('text', normalize(lines[i]));
    body.set('target_lang', deeplTarget);
    if (options.source && options.source !== 'auto') body.set('source_lang', deeplSourceLang(options.source));

    var response = await fetchWithTimeout(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': 'DeepL-Auth-Key ' + key,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: body.toString()
    });
    if (response.status === 403) {
      throw new TranslationError('DeepL отклонил ключ (403). Проверьте ключ в настройках.', 'auth');
    }
    if (response.status === 456) {
      throw new TranslationError('У DeepL закончился месячный лимит перевода', 'quota');
    }
    if (!response.ok) {
      throw new TranslationError('DeepL не смог перевести (код ' + response.status + ')', 'http_' + response.status);
    }
    var data;
    try {
      data = await response.json();
    } catch (error) {
      throw new TranslationError('DeepL вернул неожиданный ответ', 'parse');
    }
    var translations = data && data.translations;
    if (!Array.isArray(translations) || translations.length !== lines.length) {
      throw new TranslationError('DeepL вернул неполный перевод. Попробуйте ещё раз.', 'parse');
    }
    return translations.map(function (item) { return normalize(item && item.text); });
  }

  /* ------------------------------------------------------------------ */
  /* LibreTranslate (свой или публичный сервер)                          */
  /* ------------------------------------------------------------------ */

  async function libreTranslate(lines, options) {
    var base = String((options && options.libreUrl) || '').trim().replace(/\/+$/, '');
    if (!base) {
      throw new TranslationError('Не задан адрес LibreTranslate. Удерживайте кнопку и откройте настройки.', 'no_key');
    }
    var payload = {
      q: lines.map(normalize),
      source: (options && options.source) || 'auto',
      target: (options && options.target) || 'ru',
      format: 'text'
    };
    if (options.libreKey) payload.api_key = String(options.libreKey).trim();

    var response = await fetchWithTimeout((/\/translate$/.test(base) ? base : base + '/translate'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      throw new TranslationError('LibreTranslate вернул ошибку (код ' + response.status + '). Проверьте адрес и ключ.', 'http_' + response.status);
    }
    var data;
    try {
      data = await response.json();
    } catch (error) {
      throw new TranslationError('LibreTranslate вернул неожиданный ответ', 'parse');
    }
    var translated = data && data.translatedText;
    if (typeof translated === 'string') translated = [translated];
    if (!Array.isArray(translated) || translated.length !== lines.length) {
      throw new TranslationError('Сервер LibreTranslate не поддерживает пакетный перевод. Обновите сервер.', 'parse');
    }
    return translated.map(normalize);
  }

  /* ------------------------------------------------------------------ */
  /* Общая обвязка                                                       */
  /* ------------------------------------------------------------------ */

  var PROVIDERS = {
    google: googleTranslate,
    deepl: deeplTranslate,
    libretranslate: libreTranslate
  };

  function isRetryable(error) {
    if (!error || !error.code) return false;
    if (error.code === 'timeout' || error.code === 'network') return true;
    if (error.code === 'http_429') return true;
    return /^http_5/.test(error.code);
  }

  async function withRetry(fn) {
    var attempt = 0;
    for (;;) {
      try {
        return await fn();
      } catch (error) {
        attempt += 1;
        if (attempt >= 3 || !isRetryable(error)) throw error;
        await sleep(600 * Math.pow(2, attempt));
      }
    }
  }

  async function translate(lines, options) {
    var settings = options || {};
    var name = settings.provider || 'google';
    var provider = PROVIDERS[name];
    if (!provider) throw new TranslationError('Неизвестный сервис перевода: ' + name, 'unknown_provider');
    if (!Array.isArray(lines) || lines.length === 0) return [];
    return withRetry(function () { return provider(lines, settings); });
  }

  global.DSHTranslate = {
    translate: translate,
    normalize: normalize,
    providerNames: Object.keys(PROVIDERS),
    TranslationError: TranslationError
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
