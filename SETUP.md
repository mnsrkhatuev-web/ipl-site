# Публикация сайта на GitHub Pages + Decap CMS

План A: **публичный репозиторий**, бесплатный GitHub Pages, админка новостей с телефона.

## Что уже подготовлено в проекте

- `admin/` — Decap CMS (редактирование новостей)
- `data/news.json` — новости в формате `{ "items": [...] }`
- `.nojekyll` — корректная работа GitHub Pages
- `robots.txt` — закрывает `/admin/` от индексации
- `oauth-proxy/` — OAuth-прокси для GitHub Login (Cloudflare Workers, бесплатно)

---

## Шаг 1. GitHub — репозиторий и Pages

1. Создайте **публичный** репозиторий на GitHub, например `ipl-site`.
2. Загрузите все файлы проекта в ветку `main`.
   - Через GitHub Desktop, VS Code, или веб-интерфейс («Upload files»).
3. Откройте **Settings → Pages**:
   - Source: **Deploy from a branch**
   - Branch: `main`, folder: **`/ (root)`**
   - Save
4. Через 1–3 минуты сайт будет доступен по адресу:
   ```
   https://ВАШ_USERNAME.github.io/ipl-site/
   ```

---

## Шаг 2. OAuth-прокси на Cloudflare (бесплатно)

Decap CMS не может войти через GitHub без серверной части OAuth.

### 2.1. GitHub OAuth App

1. GitHub → **Settings → Developer settings → OAuth Apps → New OAuth App**
2. Заполните:
   - **Application name:** `IPL Decap CMS`
   - **Homepage URL:** `https://ВАШ_USERNAME.github.io/ipl-site/admin/`
   - **Authorization callback URL:** `https://ipl-decap-oauth.ВАШ_CF_ACCOUNT.workers.dev/callback`
     (точный URL получите после деплоя Worker на шаге 2.3)
3. Сохраните **Client ID** и **Client Secret**.

### 2.2. Cloudflare Worker

1. Зарегистрируйтесь на [cloudflare.com](https://cloudflare.com) (бесплатно).
2. Установите Node.js, затем в папке `oauth-proxy` выполните:

```powershell
cd oauth-proxy
npm init -y
npm install wrangler --save-dev
npx wrangler login
npx wrangler secret put GITHUB_OAUTH_ID
npx wrangler secret put GITHUB_OAUTH_SECRET
npx wrangler deploy
```

3. После деплоя Cloudflare покажет URL Worker, например:
   ```
   https://ipl-decap-oauth.account-name.workers.dev
   ```
4. Вернитесь в GitHub OAuth App и укажите callback:
   ```
   https://ipl-decap-oauth.account-name.workers.dev/callback
   ```

---

## Шаг 3. Настройка `admin/config.yml`

Откройте `admin/config.yml` и замените плейсхолдеры:

| Плейсхолдер | На что заменить |
|-------------|-----------------|
| `YOUR_GITHUB_USERNAME` | ваш логин GitHub |
| `YOUR_OAUTH_WORKER_URL` | URL Worker без `/` в конце, например `ipl-decap-oauth.account.workers.dev` |

Пример:

```yaml
backend:
  repo: ivanov/ipl-site
  base_url: https://ipl-decap-oauth.account.workers.dev

site_url: https://ivanov.github.io/ipl-site
display_url: https://ivanov.github.io/ipl-site
logo_url: https://ivanov.github.io/ipl-site/index.html
```

Если репозиторий называется не `ipl-site`, замените имя и во всех URL выше.

Закоммитьте и запушьте изменения в `main`.

---

## Шаг 4. Доступ редакторов

1. GitHub → репозиторий → **Settings → Collaborators**
2. Добавьте сотрудников с правом **Write** или **Maintain**
3. Только они смогут войти в админку через GitHub Login

---

## Шаг 5. Проверка

1. Сайт: `https://ВАШ_USERNAME.github.io/ipl-site/`
2. Новости: `https://ВАШ_USERNAME.github.io/ipl-site/pages/news.html`
3. Админка (с телефона или ПК): `https://ВАШ_USERNAME.github.io/ipl-site/admin/`
4. Войти через GitHub → «Новости» → добавить запись → **Publish**
5. Через 1–3 минуты новость появится на сайте

---

## Поля новости

| Поле | Описание |
|------|----------|
| Заголовок | Заголовок новости |
| Текст | Краткий текст |
| Изображение | Загрузка с телефона или ПК |
| Ссылка | Внешняя ссылка «Подробнее» |
| Дата публикации | Дата на сайте форматируется автоматически |

---

## Локальная разработка

```powershell
node server.js
```

Сайт: `http://127.0.0.1:8000`

Админка Decap без OAuth локально не сохраняет в GitHub — для теста CMS нужен деплой.

---

## Если что-то не работает

| Проблема | Решение |
|----------|---------|
| «Repository not found» | Проверьте `repo` в `config.yml` и права collaborator |
| OAuth не открывается | Проверьте `base_url` и callback URL в OAuth App |
| Картинка не видна | Загрузите через CMS или положите файл в `assets/images/` |
| Pages не обновляется | Подождите 3 мин, проверьте ветку `main` и Actions/Pages в Settings |

---

## Свой домен (опционально)

1. GitHub → Settings → Pages → Custom domain
2. DNS: CNAME → `ВАШ_USERNAME.github.io`
3. Обновите `site_url`, `display_url`, `logo_url` и Homepage URL в OAuth App
