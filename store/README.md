# Материалы для публикации на AMO

Всё, что нужно для загрузки расширения на [addons.mozilla.org](https://addons.mozilla.org/developers/).

## Что здесь лежит

| Файл | Зачем |
|---|---|
| [`amo-fields.md`](amo-fields.md) | Готовые тексты для полей формы: название, краткое и полное описание, категория, теги |
| [`description-ru.md`](description-ru.md) | Полное описание отдельным файлом (RU) |
| [`summary-ru.txt`](summary-ru.txt) | Краткое описание для карточки (≤ 250 символов) |
| [`english-listing.md`](english-listing.md) | Необязательная английская версия карточки |
| [`privacy-policy.md`](privacy-policy.md) | Политика приватности (Markdown) |
| [`privacy-policy.html`](privacy-policy.html) | Та же политика готовым HTML — можно сразу выложить и получить URL |
| [`reviewer-notes.md`](reviewer-notes.md) | Пояснения для проверяющего AMO (права, сеть, как тестировать) |
| [`submission-checklist.md`](submission-checklist.md) | Пошаговый чек-лист загрузки, подписи и установки на телефон |
| [`icon-512.png`](icon-512.png) | Иконка 512×512 для карточки |
| [`screenshots/`](screenshots/) | Скриншоты 1280×939 для карточки |

Сам пакет для загрузки — [`firefox-translate-ru.zip`](../firefox-translate-ru.zip) в корне рабочей папки (50 КБ, manifest.json в корне архива, имена файлов с прямыми слэшами).

## Порядок действий в двух словах

1. Опубликуйте [`privacy-policy.html`](privacy-policy.html) и получите публичный URL.
2. Загрузите `firefox-translate-ru.zip` в Developer Hub → **Submit a New Add-on** → **On your own** (unlisted).
3. Заполните поля из [`amo-fields.md`](amo-fields.md), добавьте иконку и скриншоты.
4. Отметьте совместимость с Android, подтвердите сбор `websiteContent`, вставьте [`reviewer-notes.md`](reviewer-notes.md).
5. Дождитесь подписи и установите на телефон по ссылке с AMO.

Подробности — в [`submission-checklist.md`](submission-checklist.md).

## Всё готово к загрузке

- Политика приватности опубликована: <https://silly-caramel-ee1a0f.netlify.app>
  (если Netlify предложит «claim» сайт — сделайте это, иначе временный деплой могут удалить).
- Контактный email указан: `wghost404@gmail.com`.
- Пакет, иконка и скриншоты на месте.

Осталось только загрузить zip в Developer Hub и заполнить поля из [`amo-fields.md`](amo-fields.md).

Ничего в коде менять не нужно.
