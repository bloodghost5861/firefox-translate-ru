/*
 * Интерфейс расширения: плавающая кнопка, всплывающие сообщения и панель настроек.
 * Всё живёт в Shadow DOM, чтобы стили сайта не ломали внешний вид.
 */
(function (global) {
  'use strict';

  var POS_KEY = 'dshl:pos';
  var BUTTON_SIZE = 54;
  var MARGIN = 10;
  var LONG_PRESS_MS = 650;

  var SOURCE_LANGS = [
    ['auto', 'Определить автоматически'],
    ['en', 'Английский'],
    ['ru', 'Русский'],
    ['uk', 'Украинский'],
    ['de', 'Немецкий'],
    ['fr', 'Французский'],
    ['es', 'Испанский'],
    ['it', 'Итальянский'],
    ['pt', 'Португальский'],
    ['pl', 'Польский'],
    ['tr', 'Турецкий'],
    ['nl', 'Нидерландский'],
    ['sv', 'Шведский'],
    ['cs', 'Чешский'],
    ['ro', 'Румынский'],
    ['el', 'Греческий'],
    ['hu', 'Венгерский'],
    ['fi', 'Финский'],
    ['da', 'Датский'],
    ['no', 'Норвежский'],
    ['ja', 'Японский'],
    ['ko', 'Корейский'],
    ['zh-CN', 'Китайский (упр.)'],
    ['ar', 'Арабский'],
    ['hi', 'Хинди'],
    ['he', 'Иврит'],
    ['fa', 'Персидский'],
    ['vi', 'Вьетнамский'],
    ['th', 'Тайский'],
    ['id', 'Индонезийский']
  ];

  var TARGET_LANGS = [
    ['ru', 'Русский'],
    ['en', 'Английский'],
    ['uk', 'Украинский'],
    ['de', 'Немецкий'],
    ['fr', 'Французский'],
    ['es', 'Испанский'],
    ['it', 'Итальянский'],
    ['pt', 'Португальский'],
    ['pl', 'Польский'],
    ['tr', 'Турецкий'],
    ['nl', 'Нидерландский'],
    ['sv', 'Шведский'],
    ['cs', 'Чешский'],
    ['ro', 'Румынский'],
    ['el', 'Греческий'],
    ['hu', 'Венгерский'],
    ['fi', 'Финский'],
    ['da', 'Датский'],
    ['no', 'Норвежский'],
    ['ja', 'Японский'],
    ['ko', 'Корейский'],
    ['zh-CN', 'Китайский (упр.)'],
    ['ar', 'Арабский'],
    ['hi', 'Хинди'],
    ['he', 'Иврит'],
    ['fa', 'Персидский'],
    ['vi', 'Вьетнамский'],
    ['th', 'Тайский'],
    ['id', 'Индонезийский']
  ];

  var CSS = `
.dshl-layer {
  position: fixed; inset: 0; pointer-events: none; direction: ltr; text-align: left;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  font-size: 14px; line-height: 1.4; font-weight: 400; color: #0f172a;
  letter-spacing: normal; word-spacing: normal; text-transform: none; white-space: normal;
  -webkit-text-size-adjust: 100%;
}
.dshl-layer *, .dshl-layer *::before, .dshl-layer *::after { box-sizing: border-box; }
.dshl-btn {
  position: absolute; right: 12px; bottom: 12px;
  width: var(--dshl-size, 54px); height: var(--dshl-size, 54px); padding: 0; margin: 0;
  display: flex; align-items: center; justify-content: center;
  border: 0; border-radius: 50%; color: #fff;
  background: linear-gradient(135deg, #2563eb 0%, #7c3aed 100%);
  font-family: inherit; font-size: calc(var(--dshl-size, 54px) * 0.28); font-weight: 700; letter-spacing: .3px; line-height: 1;
  box-shadow: 0 6px 20px rgba(37, 99, 235, .40), 0 2px 6px rgba(15, 23, 42, .22);
  cursor: pointer; pointer-events: auto; touch-action: none;
  user-select: none; -webkit-user-select: none; -webkit-touch-callout: none;
  -webkit-tap-highlight-color: transparent;
  transition: transform .18s ease, box-shadow .12s ease, opacity .18s ease;
}
.dshl-btn:active { transform: scale(.93); }
.dshl-btn.is-hidden {
  opacity: 0; pointer-events: none;
  transform: translateY(18px) scale(.9);
}
.dshl-btn.is-busy { background: linear-gradient(135deg, #1d4ed8 0%, #6d28d9 100%); }
.dshl-btn.is-busy .dshl-btn__label { animation: dshl-pulse 1.1s ease-in-out infinite; }
.dshl-btn.is-translated {
  background: linear-gradient(135deg, #059669 0%, #0f766e 100%);
  box-shadow: 0 6px 20px rgba(5, 150, 105, .38), 0 2px 6px rgba(15, 23, 42, .22);
}
.dshl-btn__label { display: block; transform: translateY(1px); }
@keyframes dshl-pulse { 0%, 100% { opacity: 1; } 50% { opacity: .45; } }
.dshl-toast {
  position: fixed; left: 50%; bottom: 92px; transform: translate(-50%, 10px);
  max-width: min(88vw, 400px); padding: 10px 15px; border-radius: 12px;
  background: rgba(15, 23, 42, .95); color: #f8fafc; font-size: 13px; line-height: 1.4;
  text-align: center; box-shadow: 0 10px 30px rgba(0, 0, 0, .3);
  opacity: 0; pointer-events: none; z-index: 4;
  transition: opacity .18s ease, transform .18s ease;
}
.dshl-toast.is-visible { opacity: 1; transform: translate(-50%, 0); }
.dshl-modal {
  position: fixed; inset: 0; z-index: 3; display: flex; align-items: center; justify-content: center;
  padding: 16px; background: rgba(15, 23, 42, .58); pointer-events: auto;
}
.dshl-modal[hidden] { display: none; }
.dshl-card {
  width: 100%; max-width: 400px; max-height: 86vh; overflow-y: auto; overscroll-behavior: contain;
  background: #fff; color: #0f172a; border-radius: 18px; padding: 18px 18px 16px;
  box-shadow: 0 24px 64px rgba(0, 0, 0, .38); font-size: 14px;
}
.dshl-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 14px; }
.dshl-title { margin: 0; font-size: 17px; line-height: 1.25; font-weight: 700; }
.dshl-close {
  width: 32px; height: 32px; flex: 0 0 32px; display: flex; align-items: center; justify-content: center;
  border: 0; border-radius: 50%; background: rgba(15, 23, 42, .07); color: inherit;
  font-family: inherit; font-size: 15px; line-height: 1; cursor: pointer;
}
.dshl-row { margin: 0 0 12px; }
.dshl-label { display: block; margin-bottom: 5px; font-size: 12.5px; font-weight: 600; color: #64748b; }
.dshl-input {
  display: block; width: 100%; min-height: 42px; padding: 10px 12px;
  border: 1px solid #cbd5e1; border-radius: 11px; background: #fff; color: #0f172a;
  font-family: inherit; font-size: 15px; line-height: 1.2;
}
.dshl-input:focus { outline: 2px solid #2563eb; outline-offset: 1px; border-color: #2563eb; }
.dshl-range { display: flex; align-items: center; gap: 10px; min-height: 42px; }
.dshl-range input[type="range"] { flex: 1 1 auto; margin: 0; accent-color: #2563eb; }
.dshl-range-value { flex: 0 0 52px; text-align: right; font-size: 13px; color: #64748b; font-variant-numeric: tabular-nums; }
.dshl-extra[hidden] { display: none; }
.dshl-hint { margin: -4px 0 12px; font-size: 12px; line-height: 1.35; color: #64748b; }
.dshl-check { display: flex; align-items: flex-start; gap: 8px; margin: 4px 0 2px; font-size: 13.5px; line-height: 1.35; }
.dshl-check input { width: 18px; height: 18px; margin: 1px 0 0; flex: 0 0 18px; accent-color: #2563eb; }
.dshl-actions { display: flex; gap: 8px; margin-top: 16px; }
.dshl-primary {
  flex: 1 1 auto; min-height: 44px; padding: 10px 14px; border: 0; border-radius: 12px;
  background: #2563eb; color: #fff; font-family: inherit; font-size: 15px; font-weight: 600; cursor: pointer;
}
.dshl-secondary {
  flex: 0 0 auto; min-height: 44px; padding: 10px 16px; border: 1px solid #cbd5e1; border-radius: 12px;
  background: transparent; color: inherit; font-family: inherit; font-size: 15px; cursor: pointer;
}
.dshl-note { margin: 14px 0 0; font-size: 12px; line-height: 1.4; color: #64748b; }
@media (prefers-color-scheme: dark) {
  .dshl-card { background: #1c1c1e; color: #f2f2f7; }
  .dshl-label, .dshl-hint, .dshl-note { color: #9ba1ab; }
  .dshl-range-value { color: #9ba1ab; }
  .dshl-input { background: #2c2c2e; color: #f2f2f7; border-color: #3a3a3c; }
  .dshl-close { background: rgba(255, 255, 255, .1); }
  .dshl-secondary { border-color: #3a3a3c; }
  .dshl-modal { background: rgba(0, 0, 0, .66); }
}
@media print { .dshl-layer { display: none !important; } }
@media (prefers-reduced-motion: reduce) {
  .dshl-btn, .dshl-toast { transition: none; }
  .dshl-btn.is-busy .dshl-btn__label { animation: none; }
}
`;

  var TEMPLATE = `
<button class="dshl-btn" type="button">
  <span class="dshl-btn__label">RU</span>
</button>
<div class="dshl-toast" role="status" aria-live="polite"></div>
<div class="dshl-modal" hidden>
  <div class="dshl-card" role="dialog" aria-modal="true" aria-labelledby="dshl-title">
    <div class="dshl-head">
      <h2 class="dshl-title" id="dshl-title">Перевод страницы</h2>
      <button class="dshl-close" type="button" aria-label="Закрыть">✕</button>
    </div>
    <div class="dshl-row">
      <label class="dshl-label" for="dshl-provider">Сервис перевода</label>
      <select class="dshl-input" id="dshl-provider">
        <option value="google">Google (без ключа)</option>
        <option value="deepl">DeepL (нужен ключ)</option>
        <option value="libretranslate">LibreTranslate (свой сервер)</option>
      </select>
    </div>
    <div class="dshl-row">
      <label class="dshl-label" for="dshl-source">Язык страницы</label>
      <select class="dshl-input" id="dshl-source"></select>
    </div>
    <div class="dshl-row">
      <label class="dshl-label" for="dshl-target">Переводить на</label>
      <select class="dshl-input" id="dshl-target"></select>
    </div>
    <div class="dshl-row">
      <label class="dshl-label" for="dshl-size">Размер кнопки</label>
      <div class="dshl-range">
        <input id="dshl-size" type="range" min="40" max="72" step="2" value="54">
        <output class="dshl-range-value" for="dshl-size">54 px</output>
      </div>
    </div>
    <div class="dshl-extra" data-for="deepl" hidden>
      <div class="dshl-row">
        <label class="dshl-label" for="dshl-deepl">Ключ DeepL API</label>
        <input class="dshl-input" id="dshl-deepl" type="password" autocomplete="off" spellcheck="false"
               placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx:fx">
      </div>
      <p class="dshl-hint">Ключ бесплатного тарифа заканчивается на <b>:fx</b>. Хранится только в этом браузере.</p>
    </div>
    <div class="dshl-extra" data-for="libretranslate" hidden>
      <div class="dshl-row">
        <label class="dshl-label" for="dshl-libre-url">Адрес сервера</label>
        <input class="dshl-input" id="dshl-libre-url" type="url" autocomplete="off" spellcheck="false"
               placeholder="https://libretranslate.example.com">
      </div>
      <div class="dshl-row">
        <label class="dshl-label" for="dshl-libre-key">API-ключ (если нужен)</label>
        <input class="dshl-input" id="dshl-libre-key" type="password" autocomplete="off" spellcheck="false">
      </div>
    </div>
    <label class="dshl-check">
      <input type="checkbox" id="dshl-always">
      <span>Переводить, даже если страница уже на русском</span>
    </label>
    <label class="dshl-check">
      <input type="checkbox" id="dshl-hide-scroll" checked>
      <span>Скрывать кнопку при прокрутке вниз</span>
    </label>
    <div class="dshl-actions">
      <button class="dshl-primary" type="button">Сохранить</button>
      <button class="dshl-secondary" type="button">Закрыть</button>
    </div>
    <p class="dshl-note">Нажатие на кнопку переводит страницу, повторное нажатие возвращает оригинал.
    Удержание кнопки открывает эти настройки. Кнопку можно перетаскивать.</p>
  </div>
</div>
`;

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function fillLanguages(select, languages, selected) {
    select.textContent = '';
    languages.forEach(function (pair) {
      var option = document.createElement('option');
      option.value = pair[0];
      option.textContent = pair[1];
      select.appendChild(option);
    });
    if (selected && !languages.some(function (pair) { return pair[0] === selected; })) {
      var extra = document.createElement('option');
      extra.value = selected;
      extra.textContent = selected;
      select.appendChild(extra);
    }
    select.value = selected || languages[0][0];
  }

  function create(options) {
    var opts = options || {};
    if (document.getElementById('dshl-root')) return null;

    var host = document.createElement('div');
    host.id = 'dshl-root';
    host.setAttribute('data-dshl-ui', '');
    host.style.position = 'fixed';
    host.style.left = '0';
    host.style.top = '0';
    host.style.width = '0';
    host.style.height = '0';
    host.style.zIndex = '2147483647';
    host.style.pointerEvents = 'none';

    var shadow = host.attachShadow({ mode: 'open' });
    var style = document.createElement('style');
    style.textContent = CSS;
    shadow.appendChild(style);

    // TEMPLATE — статическая строка, пользовательские данные в разметку не попадают.
    // DOMParser не исполняет скрипты; HTML-строка не присваивается элементу напрямую.
    var parsed = new DOMParser().parseFromString('<div class="dshl-layer">' + TEMPLATE + '</div>', 'text/html');
    var layer = document.importNode(parsed.body.firstElementChild, true);
    shadow.appendChild(layer);

    var rootElement = document.documentElement || document.body;
    if (!rootElement) return null;
    rootElement.appendChild(host);

    var button = shadow.querySelector('.dshl-btn');
    var buttonLabel = shadow.querySelector('.dshl-btn__label');
    var toastEl = shadow.querySelector('.dshl-toast');
    var modal = shadow.querySelector('.dshl-modal');
    var card = shadow.querySelector('.dshl-card');
    var providerSel = shadow.querySelector('#dshl-provider');
    var sourceSel = shadow.querySelector('#dshl-source');
    var targetSel = shadow.querySelector('#dshl-target');
    var sizeInput = shadow.querySelector('#dshl-size');
    var sizeValue = shadow.querySelector('.dshl-range-value');
    var deeplInput = shadow.querySelector('#dshl-deepl');
    var libreUrlInput = shadow.querySelector('#dshl-libre-url');
    var libreKeyInput = shadow.querySelector('#dshl-libre-key');
    var alwaysInput = shadow.querySelector('#dshl-always');
    var hideScrollInput = shadow.querySelector('#dshl-hide-scroll');
    var saveBtn = shadow.querySelector('.dshl-primary');
    var cancelBtn = shadow.querySelector('.dshl-secondary');
    var closeBtn = shadow.querySelector('.dshl-close');

    fillLanguages(sourceSel, SOURCE_LANGS, 'auto');
    fillLanguages(targetSel, TARGET_LANGS, 'ru');

    var api = typeof browser !== 'undefined' ? browser : null;
    var mode = 'idle';
    var busy = false;
    var busyPercent = null;
    var label = 'RU';
    var buttonSize = clampSize(opts.buttonSize);
    var pos = { x: 1, y: 1 };
    var hasCustomPos = false;
    var dragging = null;
    var longPressTimer = null;
    var longPressFired = false;
    var suppressBackdropUntil = 0;
    var toastTimer = null;
    var lastPointerTap = 0;
    var posTimer = null;
    var hideOnScroll = opts.hideOnScroll !== false;
    var hidden = false;
    var lastScrollY = 0;
    var scrollTicking = false;

    function maxLeft() {
      return Math.max(MARGIN, global.innerWidth - buttonSize - MARGIN);
    }

    function maxTop() {
      return Math.max(MARGIN, global.innerHeight - buttonSize - MARGIN);
    }

    function clampSize(value) {
      var size = Number(value);
      if (!isFinite(size) || size <= 0) size = BUTTON_SIZE;
      return Math.min(72, Math.max(40, Math.round(size)));
    }

    function setButtonSize(value) {
      buttonSize = clampSize(value);
      layer.style.setProperty('--dshl-size', buttonSize + 'px');
      if (sizeInput) sizeInput.value = String(buttonSize);
      if (sizeValue) sizeValue.textContent = buttonSize + ' px';
      applyPos();
    }

    function showButton() {
      applyHidden(false);
    }

    function applyHidden(value) {
      var shouldHide = !!value && hideOnScroll && !busy && !dragging && (!modal || modal.hidden);
      hidden = shouldHide;
      button.classList.toggle('is-hidden', hidden);
      button.setAttribute('aria-hidden', hidden ? 'true' : 'false');
      button.tabIndex = hidden ? -1 : 0;
    }

    function setHideOnScroll(value) {
      hideOnScroll = value !== false;
      if (!hideOnScroll) showButton();
    }

    function onScroll() {
      if (scrollTicking) return;
      scrollTicking = true;
      var run = function () {
        scrollTicking = false;
        var doc = document.documentElement;
        var y = global.pageYOffset || (doc ? doc.scrollTop : 0) || 0;
        var delta = y - lastScrollY;
        if (Math.abs(delta) < 6) {
          lastScrollY = y;
          return;
        }
        if (!hideOnScroll || y <= 80) {
          showButton();
        } else if (delta > 0) {
          applyHidden(true);
        } else {
          showButton();
        }
        lastScrollY = y;
      };
      if (global.requestAnimationFrame) global.requestAnimationFrame(run);
      else setTimeout(run, 50);
    }

    function applyPos() {
      if (!hasCustomPos) {
        // По умолчанию кнопку ставит CSS (right/bottom) — это переживает
        // открытую клавиатуру и динамическую панель Firefox на Android.
        button.style.left = '';
        button.style.top = '';
        return;
      }
      var left = MARGIN + pos.x * (maxLeft() - MARGIN);
      var top = MARGIN + pos.y * (maxTop() - MARGIN);
      button.style.left = Math.round(left) + 'px';
      button.style.top = Math.round(top) + 'px';
    }

    function schedulePos() {
      clearTimeout(posTimer);
      posTimer = setTimeout(applyPos, 120);
    }

    function savePos() {
      if (!api || !api.storage || !api.storage.local) return;
      var value = {};
      value[POS_KEY] = { x: pos.x, y: pos.y };
      try {
        api.storage.local.set(value).catch(function () {});
      } catch (error) {
        /* ignore */
      }
    }

    function render() {
      button.classList.toggle('is-busy', busy);
      button.classList.toggle('is-translated', mode === 'translated' && !busy);
      if (busy) {
        buttonLabel.textContent = busyPercent == null ? '…' : busyPercent + '%';
        button.setAttribute('aria-label', 'Идёт перевод. Нажмите, чтобы остановить.');
        button.title = 'Остановить перевод';
      } else if (mode === 'translated') {
        buttonLabel.textContent = '↺';
        button.setAttribute('aria-label', 'Вернуть оригинальный текст');
        button.title = 'Вернуть оригинал';
      } else {
        buttonLabel.textContent = label;
        button.setAttribute('aria-label', 'Перевести страницу на ' + label);
        button.title = 'Перевести страницу';
      }
    }

    function toast(message, duration) {
      if (!message) return;
      toastEl.textContent = message;
      toastEl.classList.add('is-visible');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(function () {
        toastEl.classList.remove('is-visible');
      }, duration || 4000);
    }

    function setMode(value) {
      mode = value === 'translated' ? 'translated' : 'idle';
      render();
    }

    function setBusy(value, percent) {
      busy = !!value;
      busyPercent = busy && typeof percent === 'number' ? Math.max(0, Math.min(100, Math.round(percent))) : null;
      if (busy) showButton();
      render();
    }

    function setLabel(value) {
      label = String(value || 'RU').slice(0, 3).toUpperCase();
      render();
    }

    /* ------------------------------ настройки ------------------------------ */

    function syncExtras() {
      var provider = providerSel.value;
      shadow.querySelectorAll('.dshl-extra').forEach(function (element) {
        element.hidden = element.getAttribute('data-for') !== provider;
      });
    }

    function fillForm(settings) {
      var values = settings || {};
      providerSel.value = values.provider || 'google';
      fillLanguages(sourceSel, SOURCE_LANGS, values.source || 'auto');
      fillLanguages(targetSel, TARGET_LANGS, values.target || 'ru');
      deeplInput.value = values.deeplKey || '';
      libreUrlInput.value = values.libreUrl || '';
      libreKeyInput.value = values.libreKey || '';
      alwaysInput.checked = !!values.alwaysTranslate;
      hideScrollInput.checked = values.hideOnScroll !== false;
      var formSize = clampSize(values.buttonSize || buttonSize);
      sizeInput.value = String(formSize);
      sizeValue.textContent = formSize + ' px';
      syncExtras();
    }

    function collectForm() {
      return {
        provider: providerSel.value,
        source: sourceSel.value || 'auto',
        target: targetSel.value || 'ru',
        deeplKey: deeplInput.value.trim(),
        libreUrl: libreUrlInput.value.trim(),
        libreKey: libreKeyInput.value.trim(),
        alwaysTranslate: alwaysInput.checked,
        hideOnScroll: hideScrollInput.checked,
        buttonSize: clampSize(sizeInput.value)
      };
    }

    function openPanel(settings) {
      fillForm(settings || {});
      showButton();
      if (card) card.scrollTop = 0;
      modal.hidden = false;
      suppressBackdropUntil = Date.now() + 350;
      setTimeout(function () {
        try {
          providerSel.focus({ preventScroll: true });
        } catch (error) {
          /* ignore */
        }
      }, 40);
    }

    function closePanel() {
      modal.hidden = true;
    }

    providerSel.addEventListener('change', syncExtras);

    sizeInput.addEventListener('input', function () {
      sizeValue.textContent = clampSize(sizeInput.value) + ' px';
    });

    saveBtn.addEventListener('click', function () {
      var values = collectForm();
      if (values.provider === 'deepl' && !values.deeplKey) {
        toast('Укажите ключ DeepL');
        return;
      }
      if (values.provider === 'libretranslate') {
        if (!values.libreUrl) {
          toast('Укажите адрес сервера LibreTranslate');
          return;
        }
        if (!/^https?:\/\//i.test(values.libreUrl)) {
          toast('Адрес должен начинаться с http:// или https://');
          return;
        }
      }
      Promise.resolve(opts.onSave ? opts.onSave(values) : null)
        .then(function () {
          setButtonSize(values.buttonSize);
          setHideOnScroll(values.hideOnScroll);
          closePanel();
          toast('Настройки сохранены');
        })
        .catch(function (error) {
          toast(error && error.message ? error.message : 'Не удалось сохранить настройки');
        });
    });

    cancelBtn.addEventListener('click', closePanel);
    closeBtn.addEventListener('click', closePanel);

    modal.addEventListener('pointerdown', function (event) {
      if (event.target === modal && Date.now() > suppressBackdropUntil) {
        closePanel();
      }
    });

    shadow.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && !modal.hidden) {
        event.stopPropagation();
        closePanel();
      }
    });

    /* --------------------------- кнопка и перетаскивание --------------------------- */

    button.addEventListener('pointerdown', function (event) {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      event.preventDefault();
      longPressFired = false;
      var rect = button.getBoundingClientRect();
      button.style.right = '';
      button.style.bottom = '';
      button.style.left = Math.round(rect.left) + 'px';
      button.style.top = Math.round(rect.top) + 'px';
      dragging = {
        id: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        left: rect.left,
        top: rect.top,
        moved: false
      };
      try {
        button.setPointerCapture(event.pointerId);
      } catch (error) {
        /* ignore */
      }
      clearTimeout(longPressTimer);
      longPressTimer = setTimeout(function () {
        if (!dragging || dragging.moved) return;
        longPressFired = true;
        dragging = null;
        try {
          button.releasePointerCapture(event.pointerId);
        } catch (error) {
          /* ignore */
        }
        if (opts.onLongPress) opts.onLongPress();
      }, LONG_PRESS_MS);
    });

    button.addEventListener('pointermove', function (event) {
      if (!dragging || event.pointerId !== dragging.id) return;
      var dx = event.clientX - dragging.startX;
      var dy = event.clientY - dragging.startY;
      if (!dragging.moved && Math.abs(dx) + Math.abs(dy) < 8) return;
      dragging.moved = true;
      hasCustomPos = true;
      clearTimeout(longPressTimer);
      var left = clamp(dragging.left + dx, MARGIN, maxLeft());
      var top = clamp(dragging.top + dy, MARGIN, maxTop());
      button.style.left = Math.round(left) + 'px';
      button.style.top = Math.round(top) + 'px';
      pos = {
        x: (left - MARGIN) / Math.max(1, maxLeft() - MARGIN),
        y: (top - MARGIN) / Math.max(1, maxTop() - MARGIN)
      };
    });

    button.addEventListener('pointerup', function (event) {
      if (!dragging || event.pointerId !== dragging.id) return;
      clearTimeout(longPressTimer);
      var moved = dragging.moved;
      dragging = null;
      try {
        button.releasePointerCapture(event.pointerId);
      } catch (error) {
        /* ignore */
      }
      if (longPressFired) {
        longPressFired = false;
        return;
      }
      if (moved) {
        savePos();
        return;
      }
      lastPointerTap = Date.now();
      if (opts.onTap) opts.onTap();
    });

    button.addEventListener('pointercancel', function () {
      clearTimeout(longPressTimer);
      dragging = null;
    });

    button.addEventListener('contextmenu', function (event) {
      event.preventDefault();
    });

    button.addEventListener('click', function (event) {
      // клик с клавиатуры (Enter/Пробел): тапы мышью и пальцем уже обработаны выше
      if (event.detail !== 0) return;
      if (Date.now() - lastPointerTap < 700) return;
      if (opts.onTap) opts.onTap();
    });

    global.addEventListener('resize', schedulePos, { passive: true });
    global.addEventListener('orientationchange', schedulePos, { passive: true });
    if (global.visualViewport) {
      // На Android клавиатура и панель браузера меняют visual viewport без события window.resize
      global.visualViewport.addEventListener('resize', schedulePos, { passive: true });
      global.visualViewport.addEventListener('scroll', schedulePos, { passive: true });
    }

    var startY = global.pageYOffset || (document.documentElement ? document.documentElement.scrollTop : 0) || 0;
    lastScrollY = startY;
    global.addEventListener('scroll', onScroll, { passive: true });

    setButtonSize(buttonSize);
    render();
    setTimeout(applyPos, 500);

    if (api && api.storage && api.storage.local) {
      try {
        api.storage.local.get(POS_KEY).then(function (stored) {
          var saved = stored && stored[POS_KEY];
          if (saved && typeof saved.x === 'number' && typeof saved.y === 'number') {
            pos = { x: clamp(saved.x, 0, 1), y: clamp(saved.y, 0, 1) };
            hasCustomPos = true;
            applyPos();
          }
        }).catch(function () {});
      } catch (error) {
        /* ignore */
      }
    }

    return {
      host: host,
      setMode: setMode,
      setBusy: setBusy,
      setLabel: setLabel,
      setButtonSize: setButtonSize,
      setHideOnScroll: setHideOnScroll,
      toast: toast,
      openPanel: openPanel,
      closePanel: closePanel
    };
  }

  global.DSHUI = { create: create };
})(typeof globalThis !== 'undefined' ? globalThis : this);
