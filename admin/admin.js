const CONFIG = {
    repo: "mnsrkhatuev-web/ipl-site",
    branch: "main",
    newsPath: "data/news.json",
    imagesPath: "assets/images",
    oauthBase: "https://ipl-decap-oauth.onrender.com",
    siteUrl: "https://mnsrkhatuev-web.github.io/ipl-site"
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
    message: ""
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

async function githubRequest(path, options = {}) {
    const response = await fetch(`https://api.github.com${path}`, {
        ...options,
        headers: {
            Accept: "application/vnd.github+json",
            Authorization: `Bearer ${state.token}`,
            "X-GitHub-Api-Version": "2022-11-28",
            ...(options.headers || {})
        }
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        const error = data.message || `Ошибка GitHub API (${response.status})`;
        throw new Error(error);
    }

    return data;
}

function loginWithGitHub() {
    return new Promise((resolve, reject) => {
        const popup = window.open(
            `${CONFIG.oauthBase}/auth?provider=github`,
            "github-oauth",
            "width=560,height=720"
        );

        if (!popup) {
            reject(new Error("Разрешите всплывающие окна для входа"));
            return;
        }

        function onMessage(event) {
            if (typeof event.data !== "string") {
                return;
            }

            if (event.data === "authorizing:github") {
                return;
            }

            const successPrefix = "authorization:github:success:";
            const errorPrefix = "authorization:github:error:";

            if (event.data.startsWith(successPrefix)) {
                window.removeEventListener("message", onMessage);
                try {
                    const payload = JSON.parse(event.data.slice(successPrefix.length));
                    resolve(payload.token);
                } catch (error) {
                    reject(error);
                }
                return;
            }

            if (event.data.startsWith(errorPrefix)) {
                window.removeEventListener("message", onMessage);
                reject(new Error("Не удалось войти через GitHub"));
            }
        }

        window.addEventListener("message", onMessage);
    });
}

async function handleLogin() {
    try {
        setLoading(true, "Открываем вход через GitHub…");
        const token = await loginWithGitHub();
        state.token = token;
        sessionStorage.setItem(TOKEN_KEY, token);
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
        const file = await githubRequest(
            `/repos/${CONFIG.repo}/contents/${CONFIG.newsPath}?ref=${CONFIG.branch}`
        );

        state.newsSha = file.sha;
        const decoded = JSON.parse(decodeBase64Utf8(file.content));
        state.items = normalizeNewsData(decoded).sort((a, b) => {
            return Date.parse(b.isoDate || "") - Date.parse(a.isoDate || "");
        });
        state.view = "list";
        setLoading(false);
    } catch (error) {
        setLoading(false);
        showToast(error.message, true);
    }
}

function encodeBase64Utf8(text) {
    return btoa(unescape(encodeURIComponent(text)));
}

function decodeBase64Utf8(base64) {
    return decodeURIComponent(
        Array.from(atob(base64.replace(/\n/g, "")), (char) => {
            return `%${`00${char.charCodeAt(0).toString(16)}`.slice(-2)}`;
        }).join("")
    );
}

async function saveNewsToGitHub(message) {
    const payload = {
        items: state.items
    };

    const body = {
        message,
        content: encodeBase64Utf8(`${JSON.stringify(payload, null, 2)}\n`),
        branch: CONFIG.branch,
        sha: state.newsSha
    };

    const file = await githubRequest(`/repos/${CONFIG.repo}/contents/${CONFIG.newsPath}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
    });

    state.newsSha = file.content.sha;
}

async function uploadImageIfNeeded() {
    if (!state.pendingImage) {
        return state.draft.image;
    }

    const file = state.pendingImage;
    const extension = file.name.split(".").pop().toLowerCase() || "jpg";
    const safeName = `news-${Date.now()}.${extension}`;
    const path = `${CONFIG.imagesPath}/${safeName}`;

    const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(",")[1]);
        reader.onerror = () => reject(new Error("Не удалось прочитать изображение"));
        reader.readAsDataURL(file);
    });

    await githubRequest(`/repos/${CONFIG.repo}/contents/${path}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            message: `Upload news image ${safeName}`,
            content: base64,
            branch: CONFIG.branch
        })
    });

    return path;
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

        await saveNewsToGitHub(
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
        await saveNewsToGitHub("Delete news via IPL admin");
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
    return `
        <header class="admin-header">
            <div class="admin-header-inner">
                <a class="admin-logo" href="${CONFIG.siteUrl}/">
                    <div class="admin-logo-mark">ИПЛ</div>
                    <div class="admin-logo-text">
                        Админка новостей
                        <span>ФГБУ СЭУ ФПС ИПЛ по ЧР</span>
                    </div>
                </a>
                ${state.token ? `<button class="btn btn-ghost" type="button" data-action="logout">Выйти</button>` : ""}
            </div>
        </header>
    `;
}

function renderLogin() {
    return `
        ${renderHeader()}
        <div class="login-wrap">
            <div class="login-card">
                <h1>Вход в админку</h1>
                <p>Для публикации новостей войдите через GitHub. Доступ есть только у редакторов репозитория.</p>
                <button class="btn btn-primary" type="button" data-action="login" ${state.loading ? "disabled" : ""}>
                    Войти через GitHub
                </button>
            </div>
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
                <h1>Новости</h1>
                <p>Добавляйте и редактируйте публикации. Изменения появятся на сайте через 1–3 минуты.</p>
            </div>
            ${state.message ? `<div class="status-bar">${escapeHtml(state.message)}</div>` : ""}
            <div class="admin-actions">
                <button class="btn btn-primary" type="button" data-action="create" ${state.loading ? "disabled" : ""}>+ Добавить новость</button>
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
                <h1>${state.editingIndex >= 0 ? "Редактирование" : "Новая новость"}</h1>
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
        return;
    }

    app.innerHTML = state.view === "edit" ? renderEditor() : renderNewsList();
}

function bindEvents() {
    app.addEventListener("click", (event) => {
        const button = event.target.closest("[data-action]");
        if (!button || state.loading) {
            return;
        }

        const action = button.dataset.action;
        const index = Number.parseInt(button.dataset.index || "", 10);

        if (action === "login") {
            handleLogin();
        } else if (action === "logout") {
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
    bindEvents();
    render();

    if (state.token) {
        await loadNews();
    }
}

init();
