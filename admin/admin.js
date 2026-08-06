const CONFIG = {
    apiBase: "https://ipl-decap-oauth.onrender.com",
    siteUrl: "https://ipl-chr.ru"
};

const TOKEN_KEY = "ipl_admin_token";

const state = {
    token: sessionStorage.getItem(TOKEN_KEY) || "",
    newsSha: "",
    items: [],
    view: "list",
    editingIndex: -1,
    draft: emptyDraft(),
    pendingImage: null,
    loading: false,
    message: "",
    loginUsername: "",
    loginPassword: ""
};

const app = document.getElementById("app");
const toastEl = document.getElementById("toast");

function emptyDraft() {
    return {
        title: "",
        text: "",
        isoDate: new Date().toISOString().slice(0, 10),
        image: "",
        link: ""
    };
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function formatDate(isoDate) {
    const parsed = Date.parse(String(isoDate || "").trim());
    if (Number.isNaN(parsed)) {
        return isoDate || "";
    }

    return new Date(parsed).toLocaleDateString("ru-RU", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric"
    });
}

function imageUrl(path) {
    if (!path) {
        return "";
    }

    if (/^https?:\/\//i.test(path)) {
        return path;
    }

    return `${CONFIG.siteUrl}/${path.replace(/^\//, "")}`;
}

function showToast(text, isError = false) {
    toastEl.textContent = text;
    toastEl.hidden = false;
    toastEl.classList.toggle("error", isError);

    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => {
        toastEl.hidden = true;
    }, 3200);
}

function setLoading(loading, message = "") {
    state.loading = loading;
    state.message = message;
    render();
}

async function apiRequest(path, options = {}) {
    const headers = {
        Accept: "application/json",
        ...(options.headers || {})
    };

    if (state.token) {
        headers.Authorization = `Bearer ${state.token}`;
    }

    if (options.body && !headers["Content-Type"]) {
        headers["Content-Type"] = "application/json";
    }

    let response;
    try {
        response = await fetch(`${CONFIG.apiBase}${path}`, {
            ...options,
            headers
        });
    } catch (error) {
        throw new Error(
            "Не удалось связаться с сервером. Проверьте интернет или подождите 30–60 сек (Render может «просыпаться»)."
        );
    }

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        if (response.status === 401) {
            state.token = "";
            sessionStorage.removeItem(TOKEN_KEY);
        }
        throw new Error(data.error || `Ошибка сервера (${response.status})`);
    }

    return data;
}

async function handleLogin(event) {
    if (event) {
        event.preventDefault();
    }

    const username = state.loginUsername.trim();
    const password = state.loginPassword;

    if (!username || !password) {
        showToast("Введите логин и пароль", true);
        return;
    }

    try {
        setLoading(true, "Входим…");
        const data = await apiRequest("/login", {
            method: "POST",
            body: JSON.stringify({ username, password })
        });

        state.token = data.token;
        sessionStorage.setItem(TOKEN_KEY, data.token);
        state.loginPassword = "";
        await loadNews();
        showToast("Вход выполнен");
    } catch (error) {
        showToast(error.message, true);
        setLoading(false);
    }
}

function handleLogout() {
    state.token = "";
    sessionStorage.removeItem(TOKEN_KEY);
    state.items = [];
    state.view = "list";
    state.loginPassword = "";
    render();
}

function normalizeNewsData(data) {
    if (Array.isArray(data)) {
        return data;
    }

    if (data && Array.isArray(data.items)) {
        return data.items;
    }

    return [];
}

async function loadNews() {
    setLoading(true, "Загружаем новости…");

    try {
        const data = await apiRequest("/api/news");
        state.newsSha = data.sha;
        state.items = normalizeNewsData(data).sort((a, b) => {
            return Date.parse(b.isoDate || "") - Date.parse(a.isoDate || "");
        });
        state.view = "list";
        setLoading(false);
    } catch (error) {
        setLoading(false);
        showToast(error.message, true);
        if (!state.token) {
            render();
        }
    }
}

async function saveNews(message) {
    const data = await apiRequest("/api/news", {
        method: "PUT",
        body: JSON.stringify({
            items: state.items,
            sha: state.newsSha,
            message
        })
    });

    state.newsSha = data.sha;
}

async function uploadImageIfNeeded() {
    if (!state.pendingImage) {
        return state.draft.image;
    }

    const file = state.pendingImage;
    const extension = file.name.split(".").pop().toLowerCase() || "jpg";

    const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(",")[1]);
        reader.onerror = () => reject(new Error("Не удалось прочитать изображение"));
        reader.readAsDataURL(file);
    });

    const data = await apiRequest("/api/upload", {
        method: "POST",
        body: JSON.stringify({
            content: base64,
            extension
        })
    });

    return data.path;
}

async function handleSaveDraft() {
    if (!state.draft.title.trim() || !state.draft.text.trim()) {
        showToast("Заполните заголовок и текст", true);
        return;
    }

    try {
        setLoading(true, "Сохраняем новость…");
        const imagePath = await uploadImageIfNeeded();
        const item = {
            title: state.draft.title.trim(),
            text: state.draft.text.trim(),
            isoDate: state.draft.isoDate || new Date().toISOString().slice(0, 10),
            image: imagePath || "",
            link: state.draft.link.trim()
        };

        if (state.editingIndex >= 0) {
            state.items[state.editingIndex] = item;
        } else {
            state.items.unshift(item);
        }

        await saveNews(
            state.editingIndex >= 0 ? "Update news via IPL admin" : "Add news via IPL admin"
        );

        state.pendingImage = null;
        state.view = "list";
        state.editingIndex = -1;
        state.draft = emptyDraft();
        setLoading(false);
        showToast("Новость сохранена");
    } catch (error) {
        setLoading(false);
        showToast(error.message, true);
    }
}

async function handleDelete(index) {
    const item = state.items[index];
    if (!item) {
        return;
    }

    const confirmed = window.confirm(`Удалить новость «${item.title}»?`);
    if (!confirmed) {
        return;
    }

    try {
        setLoading(true, "Удаляем новость…");
        state.items.splice(index, 1);
        await saveNews("Delete news via IPL admin");
        setLoading(false);
        showToast("Новость удалена");
    } catch (error) {
        setLoading(false);
        showToast(error.message, true);
    }
}

function openCreate() {
    state.view = "edit";
    state.editingIndex = -1;
    state.draft = emptyDraft();
    state.pendingImage = null;
    render();
}

function openEdit(index) {
    const item = state.items[index];
    if (!item) {
        return;
    }

    state.view = "edit";
    state.editingIndex = index;
    state.draft = {
        title: item.title || "",
        text: item.text || "",
        isoDate: item.isoDate || "",
        image: item.image || "",
        link: item.link || ""
    };
    state.pendingImage = null;
    render();
}

function renderHeader() {
    const themeButton = `
        <button class="theme-toggle" type="button" data-theme-toggle aria-label="Сменить тему" title="Тема">
            <svg class="icon-moon" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 14.3A8.2 8.2 0 1 1 9.7 3a6.6 6.6 0 0 0 11.3 11.3z"/></svg>
            <svg class="icon-sun" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>
            <span class="theme-toggle-label">Тёмная</span>
        </button>`;

    return `
        <header class="admin-header">
            <div class="admin-header-inner">
                <a class="admin-logo" href="./">
                    <div class="admin-logo-mark">ИПЛ</div>
                    <div class="admin-logo-text">
                        Админка
                        <span>ФГБУ СЭУ ФПС ИПЛ по ЧР</span>
                    </div>
                </a>
                <div class="admin-header-actions">
                    ${
                        state.token
                            ? `<a class="btn btn-ghost" href="course.html">Обучение</a>
                               <button class="btn btn-ghost" type="button" data-action="logout">Выйти</button>`
                            : ""
                    }
                    ${themeButton}
                </div>
            </div>
        </header>
    `;
}

function renderLogin() {
    return `
        ${renderHeader()}
        <div class="login-wrap">
            <form class="login-card" data-form="login">
                <div class="login-badge">ИПЛ</div>
                <h1>Вход в админку</h1>
                <p>Введите логин и пароль редактора для публикации новостей.</p>
                <div class="field">
                    <label for="loginUsername">Логин</label>
                    <input id="loginUsername" name="loginUsername" type="text" autocomplete="username" value="${escapeHtml(state.loginUsername)}" required ${state.loading ? "disabled" : ""}>
                </div>
                <div class="field">
                    <label for="loginPassword">Пароль</label>
                    <input id="loginPassword" name="loginPassword" type="password" autocomplete="current-password" value="${escapeHtml(state.loginPassword)}" required ${state.loading ? "disabled" : ""}>
                </div>
                ${state.message ? `<div class="status-bar">${escapeHtml(state.message)}</div>` : ""}
                <button class="btn btn-brand" type="submit" ${state.loading ? "disabled" : ""}>
                    Войти
                </button>
                <p class="login-note">Доступ только для сотрудников с паролем</p>
            </form>
        </div>
    `;
}

function renderNewsList() {
    const cards = state.items.length
        ? state.items.map((item, index) => {
            const thumb = item.image
                ? `<img class="news-thumb" src="${escapeHtml(imageUrl(item.image))}" alt="">`
                : `<div class="news-thumb news-thumb-empty">Нет фото</div>`;

            return `
                <article class="news-item">
                    ${thumb}
                    <div class="news-item-body">
                        <h3>${escapeHtml(item.title)}</h3>
                        <p>${escapeHtml(item.text)}</p>
                        <span class="news-date">${escapeHtml(formatDate(item.isoDate))}</span>
                    </div>
                    <div class="news-item-actions">
                        <button class="btn btn-secondary" type="button" data-action="edit" data-index="${index}">Изменить</button>
                        <button class="btn btn-danger" type="button" data-action="delete" data-index="${index}">Удалить</button>
                    </div>
                </article>
            `;
        }).join("")
        : `<div class="empty-card"><p>Новостей пока нет. Нажмите «Добавить новость».</p></div>`;

    return `
        ${renderHeader()}
        <main class="admin-main">
            <div class="admin-hero">
                <p class="admin-kicker">Управление контентом</p>
                <h1>Новости</h1>
                <p>Добавляйте и редактируйте публикации. Изменения появятся на сайте через 1–3 минуты.</p>
            </div>
            ${state.message ? `<div class="status-bar">${escapeHtml(state.message)}</div>` : ""}
            <div class="admin-actions">
                <button class="btn btn-primary" type="button" data-action="create" ${state.loading ? "disabled" : ""}>+ Добавить новость</button>
                <a class="btn btn-secondary" href="course.html">Обучение</a>
                <a class="btn btn-ghost" href="${CONFIG.siteUrl}/pages/news.html" target="_blank" rel="noopener">Открыть сайт</a>
            </div>
            <div class="news-list">${cards}</div>
        </main>
        <button class="fab" type="button" data-action="create" ${state.loading ? "disabled" : ""}>+ Новость</button>
    `;
}

function renderEditor() {
    const previewSrc = state.pendingImage
        ? URL.createObjectURL(state.pendingImage)
        : imageUrl(state.draft.image);

    return `
        ${renderHeader()}
        <main class="admin-main">
            <div class="admin-hero">
                <p class="admin-kicker">${state.editingIndex >= 0 ? "Редактирование" : "Создание"}</p>
                <h1>${state.editingIndex >= 0 ? "Изменить новость" : "Новая новость"}</h1>
                <p>Заполните поля и нажмите «Опубликовать».</p>
            </div>
            ${state.message ? `<div class="status-bar">${escapeHtml(state.message)}</div>` : ""}
            <div class="editor-card">
                <div class="editor-grid">
                    <div class="field">
                        <label for="title">Заголовок</label>
                        <input id="title" name="title" type="text" value="${escapeHtml(state.draft.title)}" required>
                    </div>
                    <div class="field">
                        <label for="text">Текст</label>
                        <textarea id="text" name="text" required>${escapeHtml(state.draft.text)}</textarea>
                    </div>
                    <div class="field">
                        <label for="isoDate">Дата публикации</label>
                        <input id="isoDate" name="isoDate" type="date" value="${escapeHtml(state.draft.isoDate)}">
                    </div>
                    <div class="field">
                        <label for="image">Изображение</label>
                        <input id="image" name="image" type="file" accept="image/*">
                        <p class="field-hint">Можно выбрать фото с телефона или компьютера.</p>
                        ${previewSrc ? `<img class="image-preview" src="${escapeHtml(previewSrc)}" alt="">` : ""}
                    </div>
                    <div class="field">
                        <label for="link">Ссылка «Подробнее»</label>
                        <input id="link" name="link" type="url" value="${escapeHtml(state.draft.link)}" placeholder="https://">
                        <p class="field-hint">Необязательно. Например, ссылка на MAX или Telegram.</p>
                    </div>
                </div>
                <div class="editor-footer">
                    <button class="btn btn-primary" type="button" data-action="save" ${state.loading ? "disabled" : ""}>Опубликовать</button>
                    <button class="btn btn-ghost" type="button" data-action="cancel" ${state.loading ? "disabled" : ""}>Отмена</button>
                </div>
            </div>
        </main>
    `;
}

function render() {
    if (!state.token) {
        app.innerHTML = renderLogin();
    } else {
        app.innerHTML = state.view === "edit" ? renderEditor() : renderNewsList();
    }
    syncThemeControls();
}

const THEME_STORAGE_KEY = "ipl-theme";

function getPreferredTheme() {
    try {
        const saved = localStorage.getItem(THEME_STORAGE_KEY);
        if (saved === "dark" || saved === "light") {
            return saved;
        }
    } catch (error) {
        /* ignore */
    }
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
}

function applyTheme(theme) {
    const next = theme === "dark" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", next);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
        meta.setAttribute("content", next === "dark" ? "#121820" : "#173b63");
    }
    syncThemeControls();
}

function syncThemeControls() {
    const next = document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
    document.querySelectorAll("[data-theme-toggle]").forEach((button) => {
        button.setAttribute("aria-label", next === "dark" ? "Включить светлую тему" : "Включить тёмную тему");
        button.title = next === "dark" ? "Светлая тема" : "Тёмная тема";
        const label = button.querySelector(".theme-toggle-label");
        if (label) {
            label.textContent = next === "dark" ? "Светлая" : "Тёмная";
        }
    });
}

function setTheme(theme) {
    applyTheme(theme);
    try {
        localStorage.setItem(THEME_STORAGE_KEY, theme === "dark" ? "dark" : "light");
    } catch (error) {
        /* ignore */
    }
}

function bindEvents() {
    app.addEventListener("submit", (event) => {
        const form = event.target.closest("[data-form='login']");
        if (!form || state.loading) {
            return;
        }
        handleLogin(event);
    });

    app.addEventListener("click", (event) => {
        const themeButton = event.target.closest("[data-theme-toggle]");
        if (themeButton) {
            event.preventDefault();
            const current = document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
            setTheme(current === "dark" ? "light" : "dark");
            return;
        }

        const button = event.target.closest("[data-action]");
        if (!button || state.loading) {
            return;
        }

        const action = button.dataset.action;
        const index = Number.parseInt(button.dataset.index || "", 10);

        if (action === "logout") {
            handleLogout();
        } else if (action === "create") {
            openCreate();
        } else if (action === "edit" && Number.isFinite(index)) {
            openEdit(index);
        } else if (action === "delete" && Number.isFinite(index)) {
            handleDelete(index);
        } else if (action === "save") {
            handleSaveDraft();
        } else if (action === "cancel") {
            state.view = "list";
            state.editingIndex = -1;
            state.draft = emptyDraft();
            state.pendingImage = null;
            render();
        }
    });

    app.addEventListener("input", (event) => {
        const target = event.target;
        if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) {
            return;
        }

        if (target.name === "loginUsername") {
            state.loginUsername = target.value;
            return;
        }

        if (target.name === "loginPassword") {
            state.loginPassword = target.value;
            return;
        }

        if (target.name === "image" && target instanceof HTMLInputElement && target.files?.[0]) {
            state.pendingImage = target.files[0];
            render();
            return;
        }

        if (target.name in state.draft) {
            state.draft[target.name] = target.value;
        }
    });

    app.addEventListener("change", (event) => {
        const target = event.target;
        if (target instanceof HTMLInputElement && target.name === "image" && target.files?.[0]) {
            state.pendingImage = target.files[0];
            render();
        }
    });
}

async function init() {
    applyTheme(getPreferredTheme());
    bindEvents();
    render();

    if (state.token) {
        await loadNews();
    }
}

init();
