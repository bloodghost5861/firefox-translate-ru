/*
 * Основная логика: кнопка -> перевод страницы -> возврат оригинала.
 */
(function () {
  'use strict';

  // В Firefox content scripts живут в отдельном sandbox: window !== globalThis,
  // поэтому общий namespace модулей берём именно из globalThis.
  if (globalThis.__dshlTranslateLoaded) return;
  globalThis.__dshlTranslateLoaded = true;

  var api = typeof browser !== 'undefined' ? browser : null;
  if (!api) return;

  var T = globalThis.DSHText;
  var UI = globalThis.DSHUI;
  if (!T || !UI) return;

  var DEFAULTS = {
    provider: 'google',
    source: 'auto',
    target: 'ru',
    deeplKey: '',
    libreUrl: '',
    libreKey: '',
    alwaysTranslate: false,
    hideOnScroll: true,
    buttonSize: 54
  };

  var state = {
    settings: Object.assign({}, DEFAULTS),
    mode: 'idle',
    busy: false,
    cancelled: false,
    startedAt: 0,
    groups: [],
    items: [],
    ui: null
  };

  function delay(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  function userError(message) {
    var error = new Error(message);
    error.userFacing = true;
    return error;
  }

  function shortLabel(code) {
    var aliases = { 'zh-CN': 'ZH', 'zh-TW': 'ZH', 'pt-BR': 'PT' };
    var value = String(code || 'ru');
    return aliases[value] || value.slice(0, 2).toUpperCase();
  }

  function loadSettings() {
    return api.storage.local.get(DEFAULTS).then(function (stored) {
      state.settings = Object.assign({}, DEFAULTS, stored);
      return state.settings;
    }).catch(function () {
      return state.settings;
    });
  }

  function saveSettings(values) {
    var clean = {
      provider: values.provider,
      source: values.source,
      target: values.target,
      deeplKey: values.deeplKey || '',
      libreUrl: values.libreUrl || '',
      libreKey: values.libreKey || '',
      alwaysTranslate: !!values.alwaysTranslate,
      hideOnScroll: values.hideOnScroll !== false,
      buttonSize: Number(values.buttonSize) || 54
    };
    return api.storage.local.set(clean).then(function () {
      state.settings = Object.assign({}, state.settings, clean);
      return state.settings;
    });
  }

  function sendTranslate(texts) {
    var message = {
      type: 'dshl:translate',
      texts: texts,
      provider: state.settings.provider,
      source: state.settings.source,
      target: state.settings.target
    };
    var pending;
    try {
      pending = api.runtime.sendMessage(message);
    } catch (error) {
      return Promise.reject(userError('Расширение обновилось. Перезагрузите страницу.'));
    }
    return Promise.resolve(pending).catch(function () {
      throw userError('Фоновый процесс расширения не отвечает. Перезагрузите страницу.');
    });
  }

  function isAlreadyRussian(items) {
    var lang = (document.documentElement.getAttribute('lang') || '').toLowerCase();
    if (lang.indexOf('ru') === 0) return true;
    if (lang.indexOf('uk') === 0 || lang.indexOf('be') === 0) return false;
    return T.looksRussian(items);
  }

  function restorePage() {
    T.restore(state.groups);
    state.groups = [];
    state.items = [];
    state.mode = 'idle';
    if (state.ui) {
      state.ui.setMode('idle');
      state.ui.toast('Оригинальный текст возвращён');
    }
  }

  function translatePage() {
    if (state.busy) return Promise.resolve();
    state.busy = true;
    state.cancelled = false;
    state.startedAt = Date.now();
    var ui = state.ui;
    ui.setBusy(true, 0);

    return delay(40)
      .then(function () {
        var collected = T.collect(document.body);
        if (!collected.items.length) {
          throw userError('На этой странице не нашлось текста для перевода');
        }
        if (!state.settings.alwaysTranslate && isAlreadyRussian(collected.items)) {
          throw userError('Похоже, страница уже на русском. Включите «Переводить всегда» в настройках (удержание кнопки).');
        }

        state.groups = collected.groups;
        state.items = collected.items;

        var chunks = T.chunkItems(collected.items);
        var translatedCount = 0;
        var chain = Promise.resolve();

        chunks.forEach(function (indexes) {
          chain = chain.then(function () {
            if (state.cancelled) return null;
            var texts = indexes.map(function (index) {
              return state.items[index].text;
            });
            return sendTranslate(texts).then(function (response) {
              if (state.cancelled) return null;
              if (!response || !response.ok) {
                throw userError(response && response.error ? response.error : 'Сервис перевода не ответил');
              }
              T.applyChunk(state.groups, state.items, indexes, response.translations);
              translatedCount += indexes.length;
              var percent = Math.min(99, Math.round((translatedCount / state.items.length) * 100));
              ui.setBusy(true, percent);
              return delay(120);
            });
          });
        });

        return chain.then(function () {
          if (state.cancelled) {
            T.restore(state.groups);
            state.groups = [];
            state.items = [];
            state.mode = 'idle';
            ui.setMode('idle');
            ui.toast('Перевод отменён');
            return;
          }
          state.mode = 'translated';
          ui.setMode('translated');
          ui.toast('Готово. Нажмите кнопку ещё раз, чтобы вернуть оригинал.');
        });
      })
      .catch(function (error) {
        if (state.groups.length) T.restore(state.groups);
        state.groups = [];
        state.items = [];
        state.mode = 'idle';
        ui.setMode('idle');
        ui.toast(error && error.userFacing ? error.message : 'Не удалось перевести страницу. Попробуйте ещё раз.');
      })
      .then(function () {
        state.busy = false;
        ui.setBusy(false);
      });
  }

  function onTap() {
    if (state.busy) {
      // случайный двойной тап в первые полсекунды не должен отменять перевод
      if (Date.now() - state.startedAt < 600) return;
      state.cancelled = true;
      state.ui.toast('Останавливаю перевод…', 2000);
      return;
    }
    if (state.mode === 'translated') {
      // страница могла смениться без перезагрузки (SPA): старых узлов уже нет
      var alive = state.groups.some(function (group) {
        return group && group.node && group.node.isConnected;
      });
      if (!alive) {
        state.groups = [];
        state.items = [];
        state.mode = 'idle';
        state.ui.setMode('idle');
        translatePage();
        return;
      }
      restorePage();
      return;
    }
    translatePage();
  }

  function onSave(values) {
    return saveSettings(values).then(function (settings) {
      state.ui.setLabel(shortLabel(settings.target));
      return settings;
    });
  }

  function init() {
    if (document.body == null) return;
    loadSettings().then(function () {
      var ui = UI.create({
        buttonSize: state.settings.buttonSize,
        hideOnScroll: state.settings.hideOnScroll,
        onTap: onTap,
        onLongPress: function () {
          ui.openPanel(state.settings);
        },
        onSave: onSave
      });
      if (!ui) return;
      state.ui = ui;
      ui.setLabel(shortLabel(state.settings.target));
      ui.setMode('idle');

      api.storage.onChanged.addListener(function (changes, area) {
        if (area !== 'local') return;
        var keys = ['provider', 'source', 'target', 'deeplKey', 'libreUrl', 'libreKey', 'alwaysTranslate', 'hideOnScroll', 'buttonSize'];
        var changed = false;
        keys.forEach(function (key) {
          if (changes[key]) {
            state.settings[key] = changes[key].newValue;
            changed = true;
          }
        });
        if (changed) {
          ui.setLabel(shortLabel(state.settings.target));
          ui.setButtonSize(state.settings.buttonSize);
          ui.setHideOnScroll(state.settings.hideOnScroll);
        }
      });

      api.storage.local.get({ 'dshl:hint': false }).then(function (stored) {
        if (stored && stored['dshl:hint']) return;
        setTimeout(function () {
          ui.toast('Нажмите кнопку — перевод на русский. Удерживайте — настройки.', 5200);
        }, 1200);
        api.storage.local.set({ 'dshl:hint': true }).catch(function () {});
      }).catch(function () {});
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
