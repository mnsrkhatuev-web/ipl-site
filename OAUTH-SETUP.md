# Последний шаг: OAuth для админки

Сайт уже опубликован: **https://mnsrkhatuev-web.github.io/ipl-site/**

Осталось подключить OAuth-прокси (1 раз, ~5 минут).

## 1. GitHub OAuth App

Откройте: https://github.com/settings/applications/new

| Поле | Значение |
|------|----------|
| Application name | `IPL Decap CMS` |
| Homepage URL | `https://mnsrkhatuev-web.github.io/ipl-site/admin/` |
| Authorization callback URL | `https://ipl-decap-oauth.onrender.com/callback` |

Сохраните **Client ID** и **Client Secret**.

## 2. Render (бесплатный OAuth-сервер)

Откройте: https://dashboard.render.com/select-repo?type=blueprint

- Подключите репозиторий `mnsrkhatuev-web/ipl-site`
- Render прочитает `render.yaml` и создаст сервис `ipl-decap-oauth`
- В настройках сервиса добавьте переменные:
  - `GITHUB_OAUTH_ID` = Client ID из шага 1
  - `GITHUB_OAUTH_SECRET` = Client Secret из шага 1
- Дождитесь статуса **Live**

## 3. Проверка

1. Сайт: https://mnsrkhatuev-web.github.io/ipl-site/
2. Админка: https://mnsrkhatuev-web.github.io/ipl-site/admin/
3. Login with GitHub → Новости → Publish

## Редакторы

GitHub → репозиторий `ipl-site` → **Settings → Collaborators** → добавить сотрудников с правом **Write**.
