# Поля для карточки AMO

Копируйте значения в Developer Hub. Всё, что в угловых скобках, замените на своё.

## Основное

| Поле | Значение |
|---|---|
| **Name** | `Перевод страницы на русский` |
| **Summary** | `Плавающая кнопка на странице: одним нажатием переводит текст на русский, повторным — возвращает оригинал. Google, DeepL или свой LibreTranslate.` |
| **Category** | `Language Support` (если в списке нет — `Other`) |
| **Tags** | `перевод`, `translate`, `russian`, `русский`, `google translate`, `deepl`, `libretranslate` |
| **License** | `MIT License` |
| **Version** | `1.0.3` (уже в manifest.json) |
| **Privacy policy** | `https://silly-caramel-ee1a0f.netlify.app` |
| **Support email** | `wghost404@gmail.com` |
| **Support website** | необязательно |
| **Homepage** | необязательно; можно указать репозиторий или страницу с описанием |

## Description

Вставьте содержимое файла [`description-ru.md`](description-ru.md) целиком (AMO поддерживает Markdown).

Короткий вариант, если хочется короче:

```text
Плавающая кнопка на каждой странице: нажали — текст переведён на русский, нажали ещё раз — вернулся оригинал.

• Переводятся только текстовые блоки, вёрстка и ссылки остаются на месте.
• Прогресс на кнопке, перевод можно прервать.
• Удержание кнопки открывает настройки: сервис, языки, ключи, размер кнопки.
• Google — без ключа, DeepL — по ключу API, LibreTranslate — свой сервер.
• Никакой аналитики и собственного сервера: текст уходит только выбранному сервису.

Совместимо с Firefox 142+ для компьютера и Android.
```

## Совместимость

- **Firefox**: минимум `142.0`.
- **Firefox for Android**: да, минимум `142.0` (в манифесте есть `browser_specific_settings.gecko_android`).
  Версия 142 выбрана потому, что `browser_specific_settings.gecko.data_collection_permissions`
  поддерживается начиная с Firefox 142; при меньшем `strict_min_version` валидатор AMO выдаёт
  предупреждение «Manifest key not supported by the specified minimum Firefox for Android version».
- На шаге **«Which applications is this version compatible with?»** галочка **Firefox for Android**
  обычно серая (заблокирована) и уже отмечена: AMO импортирует совместимость из
  `browser_specific_settings.gecko_android` и не даёт менять её вручную. Это ожидаемое поведение —
  главное, чтобы в сером квадратике была галочка. Галочку **Firefox** можно менять вручную.

## Сбор данных (Data collection)

В манифесте уже объявлено:

```json
"data_collection_permissions": { "required": ["websiteContent"] }
```

Если AMO попросит заполнить форму, отвечайте так:

- **Собирает или передаёт данные?** Да, передаёт.
- **Какие категории?** `websiteContent` — текст страниц, которые пользователь решил перевести.
- **Кому?** Выбранному сервису перевода: Google (`translate.googleapis.com`), DeepL (`api-free.deepl.com` / `api.deepl.com`) или серверу LibreTranslate, адрес которого указал пользователь.
- **Зачем?** Чтобы выполнить перевод по запросу пользователя.
- **Есть ли собственный сервер/аналитика?** Нет. Расширение ничего не хранит на сервере и не собирает статистику.
- **Ключи API и настройки?** Хранятся локально в `browser.storage.local`.

## Notes to reviewer

Вставьте содержимое файла [`reviewer-notes.md`](reviewer-notes.md).

## Иконка и скриншоты

- Иконка: [`icon-512.png`](icon-512.png) (512×512).
- Скриншоты (порядок важен):
  1. [`screenshots/01-translated.png`](screenshots/01-translated.png) — подпись: «Переведённая страница: кнопка RU и возврат оригинала».
  2. [`screenshots/02-settings.png`](screenshots/02-settings.png) — подпись: «Настройки: сервис перевода, языки, ключи и размер кнопки».

AMO рекомендует скриншоты от 1200×900 — оба файла 1280×939.

## Релиз

- **Release notes** для версии 1.0.3:

```text
Кнопка скрывается при прокрутке страницы вниз и возвращается при прокрутке вверх.
Поведение можно отключить в настройках.
```

- **Channels**: для личного использования достаточно `On your own` (unlisted). Для публичной карточки — `Listed`.
