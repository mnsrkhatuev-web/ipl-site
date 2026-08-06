# Вход в админку по паролю

Сайт: **https://mnsrkhatuev-web.github.io/ipl-site/**  
Админка: **https://mnsrkhatuev-web.github.io/ipl-site/admin/**

Вход больше не через GitHub. Редактор открывает админку, вводит логин и пароль. Сервер на Render сохраняет новости в репозиторий через Personal Access Token.

## 1. GitHub Personal Access Token

1. Откройте: https://github.com/settings/personal-access-tokens/new
2. Создайте **Fine-grained token**:
   - Token name: `IPL admin`
   - Repository access: Only select repositories → `mnsrkhatuev-web/ipl-site`
   - Permissions → Repository permissions → **Contents: Read and write**
3. Сгенерируйте токен и скопируйте его (показывается один раз).

## 2. Переменные на Render

Откройте сервис `ipl-decap-oauth` на [dashboard.render.com](https://dashboard.render.com) → **Environment** и задайте:

| Переменная | Значение |
|------------|----------|
| `ADMIN_USER` | логин редактора, например `ipl` |
| `ADMIN_PASSWORD` | надёжный пароль |
| `SESSION_SECRET` | длинная случайная строка (например, 32+ символа) |
| `GITHUB_TOKEN` | токен из шага 1 |

Опционально (уже есть в `render.yaml`):

| Переменная | Значение |
|------------|----------|
| `GITHUB_REPO` | `mnsrkhatuev-web/ipl-site` |
| `ALLOWED_ORIGINS` | `https://mnsrkhatuev-web.github.io,http://127.0.0.1:8000,http://localhost:8000` |

Старые `GITHUB_OAUTH_ID` / `GITHUB_OAUTH_SECRET` больше не нужны — можно удалить.

После сохранения env нажмите **Manual Deploy → Deploy latest commit** (или дождитесь автодеплоя).

## 3. Проверка

1. Откройте: https://mnsrkhatuev-web.github.io/ipl-site/admin/
2. Введите `ADMIN_USER` и `ADMIN_PASSWORD`
3. Добавьте или измените новость → **Опубликовать**
4. Через 1–3 минуты новость появится на сайте

Проверка API: https://ipl-decap-oauth.onrender.com/ — должно ответить `IPL admin API is running.`

## Редакторы

Доступ у всех, кто знает логин и пароль. Collaborators в GitHub для входа в админку не нужны.

Чтобы сменить пароль — обновите `ADMIN_PASSWORD` на Render и перезапустите сервис.
