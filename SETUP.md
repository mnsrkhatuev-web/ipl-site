# Публикация сайта на GitHub Pages + админка новостей

План A: **публичный репозиторий**, бесплатный GitHub Pages, админка новостей с телефона (логин и пароль).

## Что уже подготовлено в проекте

- `admin/` — веб-админка новостей
- `data/news.json` — новости в формате `{ "items": [...] }`
- `.nojekyll` — корректная работа GitHub Pages
- `robots.txt` — закрывает `/admin/` от индексации
- `oauth-vercel/` — API на Render (логин/пароль + запись в GitHub)

Подробная настройка пароля и токена: [ADMIN-SETUP.md](ADMIN-SETUP.md).

---

## Шаг 1. GitHub — репозиторий и Pages

1. Создайте **публичный** репозиторий на GitHub, например `ipl-site`.
2. Загрузите все файлы проекта в ветку `main`.
3. Откройте **Settings → Pages**:
   - Source: **Deploy from a branch**
   - Branch: `main`, folder: **`/ (root)`**
   - Save
4. Через 1–3 минуты сайт будет доступен по адресу:
   ```
   https://ВАШ_USERNAME.github.io/ipl-site/
   ```

---

## Шаг 2. API админки на Render

См. [ADMIN-SETUP.md](ADMIN-SETUP.md): Personal Access Token + переменные `ADMIN_USER`, `ADMIN_PASSWORD`, `SESSION_SECRET`, `GITHUB_TOKEN`.

Blueprint: подключите репозиторий в Render — сервис создастся из `render.yaml` (`ipl-decap-oauth`).

---

## Шаг 3. Настройка админки

В [`admin/admin.js`](admin/admin.js) проверьте:

```js
apiBase: "https://ipl-decap-oauth.onrender.com",
siteUrl: "https://ВАШ_USERNAME.github.io/ipl-site"
```

Закоммитьте и запушьте изменения в `main`.

---

## Шаг 4. Проверка

1. Сайт: `https://ВАШ_USERNAME.github.io/ipl-site/`
2. Новости: `https://ВАШ_USERNAME.github.io/ipl-site/pages/news.html`
3. Админка: `https://ВАШ_USERNAME.github.io/ipl-site/admin/`
4. Войти логином и паролем → «Новости» → добавить запись → **Опубликовать**
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

Админка локально ходит на Render API (`apiBase`). Для полноценного теста нужны переменные на Render из [ADMIN-SETUP.md](ADMIN-SETUP.md).

---

## Если что-то не работает

| Проблема | Решение |
|----------|---------|
| «Неверный логин или пароль» | Проверьте `ADMIN_USER` / `ADMIN_PASSWORD` на Render |
| «GITHUB_TOKEN is not configured» | Добавьте токен в Environment и задеплойте снова |
| «Bad credentials» / 401 от GitHub | Перевыпустите PAT с Contents: Read and write |
| Картинка не видна | Загрузите через админку или положите файл в `assets/images/` |
| Pages не обновляется | Подождите 3 мин, проверьте ветку `main` |

---

## Свой домен (опционально)

1. GitHub → Settings → Pages → Custom domain
2. DNS: CNAME → `ВАШ_USERNAME.github.io`
3. Обновите `siteUrl` в `admin/admin.js` и `ALLOWED_ORIGINS` на Render
