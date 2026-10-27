# Чек-лист публикации на AMO

## 0. Перед началом

- [ ] Аккаунт Mozilla: <https://addons.mozilla.org/developers/> (включите двухфакторную аутентификацию — AMO просит её для новых аккаунтов).
- [ ] Готовый zip: [`firefox-translate-ru.zip`](../firefox-translate-ru.zip) (manifest.json в корне архива).
- [x] Политика приватности опубликована: <https://silly-caramel-ee1a0f.netlify.app> (email `wghost404@gmail.com` указан в материалах).
- [ ] Решите, нужна ли публичная карточка:
  - **On your own (unlisted)** — ссылка только у вас, проверка быстрее, для личного пользования достаточно.
  - **Listed** — публичная карточка в каталоге, обычное ревью (может занять дни).

## 1. Политика приватности — готово

Политика уже опубликована и отдаёт 200:

**URL:** <https://silly-caramel-ee1a0f.netlify.app>

Используйте его в поле **Privacy policy** в карточке AMO. Локальная копия — [`privacy-policy.html`](privacy-policy.html).

Если понадобится перевыложить (например, после правок):

1. Откройте <https://app.netlify.com/drop>.
2. Перетащите `privacy-policy.html`, переименованный в `index.html`.
3. Скопируйте новый URL и обновите его в этой карточке и в [`amo-fields.md`](amo-fields.md).

- [x] URL политики: `https://silly-caramel-ee1a0f.netlify.app`

> **Важно про Netlify Drop.** Если Netlify предложит войти и «claim» сайт — сделайте это (бесплатный аккаунт).
> Незаклеймленный анонимный деплой может быть удалён, и ссылка в карточке AMO перестанет открываться.
> Для долгосрочной публичной карточки надёжнее GitHub Pages (вариант из прошлой версии чек-листа).

## 2. Проверьте пакет

- [ ] `manifest.json` лежит в корне zip (не во вложенной папке).
- [ ] Версия в манифесте: `1.0.3`.
- [ ] Нет лишних файлов (`.env`, ключей, профилей).
- [ ] `data_collection_permissions` на месте.

Пересобрать zip при изменениях — способом из [README → «Сборка zip для AMO»](../firefox-translate-ru/README.md#3-сборка-zip-для-amo).
Коротко: **не** `Compress-Archive` (он пишет `content\main.js`, AMO отклоняет), а сборка с явными
прямыми слэшами. В этой рабочей папке то же самое делает `python tools\build_zip.py`.

```powershell
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$src = (Resolve-Path .\firefox-translate-ru).Path
$zipPath = Join-Path (Get-Location) 'firefox-translate-ru.zip'
if (Test-Path $zipPath) { Remove-Item $zipPath }
$zip = [System.IO.Compression.ZipFile]::Open($zipPath, 'Create')
Get-ChildItem $src -Recurse -File | ForEach-Object {
  $rel = $_.FullName.Substring($src.Length + 1).Replace('\', '/')
  [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $_.FullName, $rel) | Out-Null
}
$zip.Dispose()
```

Проверить содержимое:

```powershell
Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::OpenRead("$PWD\firefox-translate-ru.zip").Entries |
  ForEach-Object { $_.FullName }
```

## 3. Загрузите дополнение

- [ ] Developer Hub → **Submit a New Add-on**.
- [ ] Выберите **On your own** (для unlisted) или **Listed**.
- [ ] Загрузите `firefox-translate-ru.zip`.
- [ ] Дождитесь автоматической проверки (обычно 1–3 минуты).
- [ ] На шаге **«Which applications is this version compatible with?»** галочка **Firefox for Android**
      обычно **серая (заблокирована) и уже стоит** — это нормально: AMO берёт совместимость из
      `browser_specific_settings.gecko_android` и запрещает менять её вручную. Убедитесь, что внутри
      серого квадратика есть галочка; кликать по нему не нужно. Галочку **Firefox** можно менять вручную.
- [ ] Проверьте **Firefox 142+** и Android (должно определиться из `gecko_android`).
      Версия 142 обязательна: `data_collection_permissions` поддерживается с неё, иначе AMO
      показывает предупреждение «Manifest key not supported by the specified minimum version».

## 4. Заполните карточку

Берите тексты из [`amo-fields.md`](amo-fields.md).

- [ ] Name, Summary, Description.
- [ ] Category: Language Support.
- [ ] Tags.
- [ ] License: MIT.
- [ ] Privacy policy URL (из шага 1).
- [ ] Support email.
- [ ] Иконка: [`icon-512.png`](icon-512.png).
- [ ] Скриншоты: [`screenshots/01-translated.png`](screenshots/01-translated.png),
      [`screenshots/02-settings.png`](screenshots/02-settings.png) — в этом порядке.
- [ ] Release notes для 1.0.3.
- [ ] Notes to reviewer: [`reviewer-notes.md`](reviewer-notes.md).

## 5. Сбор данных

- [ ] В форме укажите передачу `websiteContent` (текст страниц) выбранному сервису перевода.
- [ ] Ссылка на политику приватности заполнена.
- [ ] Собственного сервера, аналитики и рекламы нет — отметьте это, если спросят.

## 6. Подпись и установка

- [ ] Нажмите **Submit** (или **Sign Add-on** для unlisted).
- [ ] Дождитесь статуса **Signed** (unlisted обычно минуты; listed — ревью).
- [ ] Скачайте подписанный `.xpi` из карточки версии (Developer Hub → версия → **Download file**)
      или из письма AMO.
- [ ] Установите на телефон одним из способов:
  - **из файла (работает для unlisted):** перекиньте `.xpi` в «Загрузки» → Firefox → **Настройки** →
    **О Firefox** → пять раз нажмите на логотип Firefox → **Настройки** → **«Установить расширение
    из файла»** → выберите `.xpi` → **Добавить**;
  - **с AMO:** откройте страницу дополнения на телефоне и нажмите **Add to Firefox**
    (для listed-дополнений).
- [ ] Подтвердите доступ к сайтам и передачу содержимого страниц.
- [ ] Проверьте: кнопка **RU** на странице, перевод, возврат по **↺**, настройки по удержанию,
      изменение размера кнопки слайдером.

Если на телефоне кнопки установки нет:

- проверьте, что в карточке версии отмечен Android и `strict_min_version` для Android ≤ версии вашего Firefox;
- для unlisted используйте установку из файла (пункт выше) — это официальный путь;
- попробуйте открыть ссылку на карточку в обычном (не приватном) окне.

## 7. Обновления

1. Увеличьте `version` в `manifest.json` (например, `1.0.4`).
2. Пересоберите zip командой из шага 2.
3. Developer Hub → ваше дополнение → **Upload New Version**.
4. Для unlisted снова дождитесь подписи; установленное расширение обновится само (или переустановите с AMO).

## Если AMO попросит Manifest V3

Скажите — портирую на MV3 (background на `scripts`/event page, `browser_specific_settings` уже готов,
код content script менять почти не нужно). Текущая MV2-версия проверена в Firefox 145 и 158.
