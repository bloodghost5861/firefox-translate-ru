/*
 * Работа с текстом страницы: сбор текстовых узлов, нарезка на пакеты,
 * подстановка перевода и возврат оригинала.
 */
(function (global) {
  'use strict';

  var SKIP_TAGS = new Set([
    'SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'TEXTAREA', 'INPUT', 'SELECT',
    'OPTION', 'CODE', 'PRE', 'KBD', 'SAMP', 'VAR', 'CANVAS', 'IFRAME',
    'OBJECT', 'EMBED', 'VIDEO', 'AUDIO', 'HEAD', 'TITLE', 'META', 'LINK', 'SVG', 'MATH'
  ]);

  var SKIP_SELECTOR = [
    '[translate="no"]',
    '.notranslate',
    '[contenteditable]:not([contenteditable="false"])',
    '[aria-hidden="true"]',
    '[data-dshl-ui]'
  ].join(', ');

  var DEFAULTS = {
    maxNodes: 5000,
    maxChars: 200000,
    maxGroupChars: 500,
    maxChunkChars: 1200,
    maxChunkEncoded: 4500,
    maxChunkItems: 24
  };

  function collapse(value) {
    return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
  }

  function hasLetters(value) {
    return /\p{L}/u.test(value);
  }

  function isSkipped(element) {
    if (!element || !element.tagName) return true;
    if (SKIP_TAGS.has(element.tagName)) return true;
    if (element.isContentEditable) return true;
    if (typeof element.closest === 'function') {
      if (element.closest(SKIP_SELECTOR)) return true;
      if (element.closest('svg') || element.closest('math')) return true;
    }
    return false;
  }

  function isVisible(element, cache) {
    var known = cache.get(element);
    if (known !== undefined) return known;
    var visible = true;
    try {
      if (element.getClientRects().length === 0) {
        visible = false;
      } else {
        var style = global.getComputedStyle(element);
        if (style && (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0')) {
          visible = false;
        }
      }
    } catch (error) {
      visible = true;
    }
    cache.set(element, visible);
    return visible;
  }

  function splitLongText(text, maxLen) {
    if (text.length <= maxLen) return [text];
    var parts = [];
    var rest = text;
    while (rest.length > maxLen) {
      var slice = rest.slice(0, maxLen);
      var threshold = Math.floor(maxLen * 0.55);
      var cut = Math.max(
        slice.lastIndexOf('. '),
        slice.lastIndexOf('! '),
        slice.lastIndexOf('? '),
        slice.lastIndexOf('; '),
        slice.lastIndexOf(': '),
        slice.lastIndexOf(', ')
      );
      if (cut < threshold) cut = slice.lastIndexOf(' ');
      if (cut < threshold) cut = maxLen - 1;
      parts.push(rest.slice(0, cut + 1).trim());
      rest = rest.slice(cut + 1).trim();
    }
    if (rest) parts.push(rest);
    return parts;
  }

  /**
   * Собирает текст страницы.
   * groups — текстовые узлы (с сохранённым оригиналом),
   * items  — куски текста, которые уходят в сервис перевода.
   */
  function collect(root, options) {
    var limits = Object.assign({}, DEFAULTS, options || {});
    var container = root || document.body;
    var result = { groups: [], items: [], totalChars: 0 };
    if (!container) return result;

    var doc = container.ownerDocument || document;
    var cache = new Map();
    var walker = doc.createTreeWalker(container, global.NodeFilter.SHOW_TEXT, {
      acceptNode: function (node) {
        var value = node.nodeValue;
        if (!value || value.length < 2) return global.NodeFilter.FILTER_REJECT;
        if (!hasLetters(value)) return global.NodeFilter.FILTER_REJECT;
        var parent = node.parentElement;
        if (!parent || isSkipped(parent)) return global.NodeFilter.FILTER_REJECT;
        if (!isVisible(parent, cache)) return global.NodeFilter.FILTER_REJECT;
        return global.NodeFilter.FILTER_ACCEPT;
      }
    });

    var node = null;
    while ((node = walker.nextNode())) {
      if (result.groups.length >= limits.maxNodes || result.totalChars >= limits.maxChars) break;
      var raw = node.nodeValue;
      var text = collapse(raw);
      if (text.length < 2 || !hasLetters(text)) continue;

      var leadMatch = raw.match(/^\s*/);
      var trailMatch = raw.match(/\s*$/);
      var groupIndex = result.groups.length;
      var group = {
        node: node,
        lead: leadMatch ? leadMatch[0] : '',
        trail: trailMatch ? trailMatch[0] : '',
        original: raw,
        appliedValue: null,
        items: [],
        translated: false
      };

      var pieces = splitLongText(text, limits.maxGroupChars);
      for (var i = 0; i < pieces.length; i++) {
        if (!pieces[i]) continue;
        group.items.push(result.items.length);
        result.items.push({ text: pieces[i], group: groupIndex, translation: null });
      }
      if (!group.items.length) continue;

      result.groups.push(group);
      result.totalChars += text.length;
    }

    return result;
  }

  /** Режет список кусков на пакеты разумного размера. */
  function chunkItems(items, options) {
    var limits = Object.assign({}, DEFAULTS, options || {});
    var chunks = [];
    var current = { indexes: [], chars: 0, encoded: 0 };

    for (var i = 0; i < items.length; i++) {
      var text = items[i].text;
      var chars = text.length;
      var encoded;
      try {
        encoded = encodeURIComponent(text).length + 3;
      } catch (error) {
        encoded = text.length * 6 + 3;
      }
      var tooBig = current.indexes.length > 0 && (
        current.chars + chars > limits.maxChunkChars ||
        current.encoded + encoded > limits.maxChunkEncoded ||
        current.indexes.length >= limits.maxChunkItems
      );
      if (tooBig) {
        chunks.push(current.indexes);
        current = { indexes: [], chars: 0, encoded: 0 };
      }
      current.indexes.push(i);
      current.chars += chars;
      current.encoded += encoded;
    }
    if (current.indexes.length) chunks.push(current.indexes);
    return chunks;
  }

  /** Подставляет перевод одного пакета в DOM. */
  function applyChunk(groups, items, chunkIndexes, translations) {
    var touched = new Set();
    for (var i = 0; i < chunkIndexes.length; i++) {
      var item = items[chunkIndexes[i]];
      if (!item) continue;
      var value = translations && translations[i] != null ? String(translations[i]) : '';
      item.translation = value ? value.trim() : item.text;
      touched.add(item.group);
    }
    touched.forEach(function (groupIndex) {
      var group = groups[groupIndex];
      if (!group || !group.node || !group.node.isConnected) return;
      var pieces = group.items.map(function (itemIndex) {
        var current = items[itemIndex];
        return current && current.translation ? current.translation : current.text;
      });
      var nextValue = group.lead + pieces.join(' ') + group.trail;
      if (group.node.nodeValue === nextValue) return;
      try {
        group.node.nodeValue = nextValue;
        group.appliedValue = nextValue;
        group.translated = true;
      } catch (error) {
        /* узел мог исчезнуть — ничего страшного */
      }
    });
  }

  /** Возвращает оригинальный текст. */
  function restore(groups) {
    for (var i = 0; i < groups.length; i++) {
      var group = groups[i];
      if (!group || !group.node || !group.node.isConnected) continue;
      try {
        if (group.node.nodeValue === group.appliedValue) {
          group.node.nodeValue = group.original;
        }
      } catch (error) {
        /* игнорируем */
      }
    }
  }

  /** Похоже ли содержимое на русский текст (чтобы не переводить зря). */
  function looksRussian(items, sampleChars) {
    var limit = sampleChars || 3000;
    var taken = 0;
    var letters = 0;
    var cyrillic = 0;
    var foreignCyrillic = false;

    for (var i = 0; i < items.length; i++) {
      var text = items[i].text;
      for (var j = 0; j < text.length; j++) {
        if (taken >= limit) break;
        var ch = text.charAt(j);
        taken += 1;
        if (!/\p{L}/u.test(ch)) continue;
        letters += 1;
        if (/[А-Яа-яЁё]/.test(ch)) {
          cyrillic += 1;
        } else if (/[ІіЇїЄєҐґЎў]/.test(ch)) {
          foreignCyrillic = true;
        }
      }
      if (taken >= limit) break;
    }

    if (!letters) return false;
    return cyrillic / letters >= 0.85 && !foreignCyrillic;
  }

  global.DSHText = {
    collect: collect,
    chunkItems: chunkItems,
    applyChunk: applyChunk,
    restore: restore,
    looksRussian: looksRussian,
    splitLongText: splitLongText,
    collapse: collapse,
    isSkipped: isSkipped
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
