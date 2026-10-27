# English listing (optional)

AMO allows localized listing fields. Use these if you want an English card as well.

## Name

`Page Translator RU`

## Summary

`A floating button on every page: tap once to translate the page into Russian, tap again to restore the original. Google, DeepL or your own LibreTranslate.`

## Description

**One tap — the page in Russian.**

“Page Translator RU” adds a small floating button to every page. Tap it and the page text is translated into Russian; tap again and the original text is restored. Drag the button anywhere, resize it, or hold it to open the settings. When you scroll down, the button hides; scroll up and it comes back, so it does not get in the way of reading.

**How it works**

- Only text blocks are translated: headings, paragraphs, lists, captions. Layout, links, images and tables stay intact.
- The button shows progress, and a second tap cancels the translation.
- Code blocks, form fields, hidden elements and service nodes are skipped.
- If the page is already in Russian, the extension says so and does not waste requests.

**Three translation providers**

| Provider | Key | Notes |
|---|---|---|
| Google | not needed | works out of the box, default |
| DeepL | API key | best quality for European languages, free tier available |
| LibreTranslate | server URL | run your own server and keep the text private |

The source language is detected automatically (or set manually). The target language is Russian by default and can be changed.

**Privacy**

No analytics, no telemetry, no server of our own. Page text is sent only to the translation provider you choose. API keys are stored locally.

**Compatibility**

- Firefox 142+ on desktop.
- Firefox for Android 142+.
- Manifest V2, no remote code, no third-party libraries.

**Limitations**

- Content loaded after the translation (infinite feeds, expandable sections) is not translated automatically.
- Iframes, canvas and closed Shadow DOM are not touched.
- Russian text is often longer than English, so minor layout shifts are possible.
- The public Google endpoint is unofficial and may rate-limit; DeepL or LibreTranslate are the fallbacks.

**Support**

Report issues or suggest improvements: `wghost404@gmail.com`.
