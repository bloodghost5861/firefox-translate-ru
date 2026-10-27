# tools

Вспомогательные скрипты. Запускать из корня репозитория.

| Скрипт | Что делает |
|---|---|
| `build_zip.py` | Собирает `firefox-translate-ru.zip` с `manifest.json` в корне и прямыми слэшами (`/`) в именах файлов. Именно такой архив принимает AMO. |
| `selftest.js` | Проверяет провайдеров перевода, нарезку текста, фоновый скрипт и кэш. Нужен Node 18+ и интернет (запрос к Google). |
| `browser_test.js` | UI-тест в Chromium через CDP: кнопка, перевод (заглушка), возврат, размер, скролл, панель, перетаскивание. Windows + установленный Chrome; путь к `chrome.exe` задан константой. |
| `firefox_test.js` | End-to-end тест в настоящем Firefox через Marionette: временная установка расширения, живой перевод Google, возврат, скролл, настройки. Windows + Firefox. |
| `store_shots.js` | Пересобирает скриншоты 1280×939 для карточки AMO в headless Firefox. |

## Быстрые команды

```bash
python tools/build_zip.py
node tools/selftest.js
```

Браузерные тесты:

```bash
node tools/browser_test.js
node tools/firefox_test.js
node tools/store_shots.js
```

Скрипты `browser_test.js`, `firefox_test.js` и `store_shots.js` — вспомогательные, с жёстко прописанными
путями к браузерам и профилями. Если пути отличаются, поправьте константы в начале файла.

## CI

Готовый workflow лежит в [`ci/build.yml`](../ci/build.yml). Он не активирован: чтобы GitHub Actions
запускался, скопируйте файл в `.github/workflows/build.yml` через веб-интерфейс GitHub или запушьте
токеном со scope `workflow`. Workflow проверяет синтаксис JS и собирает zip как artifact.
