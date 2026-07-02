async function fetchJson(path) {
    const response = await fetch(path);

    if (!response.ok) {
        throw new Error(`Failed to load: ${path}`);
    }

    return response.json();
}

function resolvePath(relativePath) {
    if (!relativePath) {
        return relativePath;
    }

    if (/^https?:\/\//i.test(relativePath) || relativePath.startsWith("/")) {
        return relativePath;
    }

    const inPagesDir = window.location.pathname.includes("/pages/");
    return inPagesDir ? `../${relativePath}` : relativePath;
}

function normalizeNewsItems(data) {
    if (Array.isArray(data)) {
        return data;
    }

    if (data && Array.isArray(data.items)) {
        return data.items;
    }

    return [];
}

function formatNewsDate(item) {
    if (item.date) {
        return item.date;
    }

    const isoDate = String(item.isoDate || "").trim();
    if (!isoDate) {
        return "";
    }

    const parsed = Date.parse(isoDate);
    if (Number.isNaN(parsed)) {
        return isoDate;
    }

    return new Date(parsed).toLocaleDateString("ru-RU", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric"
    });
}

function createCardMessage(title, text) {
    return `
        <article class="card">
            <h3>${title}</h3>
            <p>${text}</p>
        </article>
    `;
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function escapeAttr(value) {
    return escapeHtml(value).replace(/'/g, "&#39;");
}

function getFileExtension(filePath) {
    const cleanPath = String(filePath).split("?")[0].split("#")[0];
    const match = cleanPath.match(/\.([a-z0-9]+)$/i);
    return match ? match[1].toLowerCase() : "";
}

function isPreviewableExtension(extension) {
    return extension === "pdf";
}

function getDownloadFilename(url) {
    const filename = String(url).split("?")[0].split("#")[0].split("/").pop();
    return filename || "document";
}

function triggerDownload(url) {
    const link = document.createElement("a");
    link.href = url;
    link.download = getDownloadFilename(url);
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    link.remove();
}

let documentModalElements = null;

function ensureDocumentModals() {
    if (documentModalElements) {
        return documentModalElements;
    }

    const confirmDialog = document.createElement("dialog");
    confirmDialog.className = "doc-modal";
    confirmDialog.id = "doc-confirm-modal";
    confirmDialog.innerHTML = `
        <div class="doc-modal-inner">
            <h2 class="doc-modal-title" id="doc-confirm-heading">Подтверждение</h2>
            <p class="doc-modal-text" id="doc-confirm-text"></p>
            <div class="doc-modal-actions">
                <button type="button" class="btn doc-modal-btn doc-modal-cancel">Отмена</button>
                <button type="button" class="btn primary doc-modal-btn" id="doc-confirm-submit">Подтвердить</button>
            </div>
        </div>
    `;

    const previewDialog = document.createElement("dialog");
    previewDialog.className = "doc-modal doc-modal-preview";
    previewDialog.id = "doc-preview-modal";
    previewDialog.innerHTML = `
        <div class="doc-modal-inner doc-modal-preview-inner">
            <div class="doc-modal-header">
                <h2 class="doc-modal-title" id="doc-preview-title"></h2>
                <button type="button" class="doc-modal-close" aria-label="Закрыть">&times;</button>
            </div>
            <div class="doc-modal-preview-body">
                <iframe id="doc-preview-frame" title="Просмотр документа"></iframe>
            </div>
            <p class="doc-modal-note muted" id="doc-preview-note"></p>
            <div class="doc-modal-actions">
                <button type="button" class="btn doc-modal-btn doc-modal-close-btn">Закрыть</button>
                <button type="button" class="btn primary doc-modal-btn" id="doc-preview-download">Скачать</button>
            </div>
        </div>
    `;

    document.body.appendChild(confirmDialog);
    document.body.appendChild(previewDialog);

    const confirmText = confirmDialog.querySelector("#doc-confirm-text");
    const confirmHeading = confirmDialog.querySelector("#doc-confirm-heading");
    const confirmSubmit = confirmDialog.querySelector("#doc-confirm-submit");
    const previewTitle = previewDialog.querySelector("#doc-preview-title");
    const previewFrame = previewDialog.querySelector("#doc-preview-frame");
    const previewNote = previewDialog.querySelector("#doc-preview-note");
    const previewDownload = previewDialog.querySelector("#doc-preview-download");

    let pendingConfirmAction = null;
    let previewUrl = "";

    function closeConfirmDialog() {
        pendingConfirmAction = null;
        confirmDialog.close();
    }

    function closePreviewDialog() {
        previewUrl = "";
        previewFrame.removeAttribute("src");
        previewDialog.close();
    }

    confirmDialog.addEventListener("click", (event) => {
        if (event.target === confirmDialog) {
            closeConfirmDialog();
        }
    });

    previewDialog.addEventListener("click", (event) => {
        if (event.target === previewDialog) {
            closePreviewDialog();
        }
    });

    confirmDialog.querySelector(".doc-modal-cancel").addEventListener("click", closeConfirmDialog);
    confirmSubmit.addEventListener("click", () => {
        if (typeof pendingConfirmAction === "function") {
            pendingConfirmAction();
        }
        closeConfirmDialog();
    });

    previewDialog.querySelectorAll(".doc-modal-close, .doc-modal-close-btn").forEach((button) => {
        button.addEventListener("click", closePreviewDialog);
    });

    previewDownload.addEventListener("click", () => {
        if (previewUrl) {
            const url = previewUrl;
            const title = previewTitle.textContent;
            closePreviewDialog();
            openDownloadConfirm({ url, title });
        }
    });

    documentModalElements = {
        confirmDialog,
        confirmText,
        confirmHeading,
        confirmSubmit,
        previewDialog,
        previewTitle,
        previewFrame,
        previewNote,
        setPendingConfirmAction(action) {
            pendingConfirmAction = action;
        },
        setPreviewUrl(url) {
            previewUrl = url;
        }
    };

    return documentModalElements;
}

function openDownloadConfirm({ url, title }) {
    const modal = ensureDocumentModals();

    modal.confirmHeading.textContent = "Скачать документ?";
    modal.confirmText.textContent = `Вы собираетесь скачать «${title}». Продолжить?`;
    modal.confirmSubmit.textContent = "Скачать";
    modal.setPendingConfirmAction(() => triggerDownload(url));
    modal.confirmDialog.showModal();
}

function openExternalConfirm({ url, title }) {
    const modal = ensureDocumentModals();

    modal.confirmHeading.textContent = "Открыть документ?";
    modal.confirmText.textContent = `Документ «${title}» будет открыт в новой вкладке. Продолжить?`;
    modal.confirmSubmit.textContent = "Открыть";
    modal.setPendingConfirmAction(() => {
        window.open(url, "_blank", "noopener,noreferrer");
    });
    modal.confirmDialog.showModal();
}

function openDocumentPreview({ url, title }) {
    const modal = ensureDocumentModals();
    const extension = getFileExtension(url);

    modal.previewTitle.textContent = title;
    modal.setPreviewUrl(url);

    if (isPreviewableExtension(extension)) {
        modal.previewFrame.hidden = false;
        modal.previewNote.hidden = true;
        modal.previewFrame.src = url;
    } else {
        modal.previewFrame.hidden = true;
        modal.previewFrame.removeAttribute("src");
        modal.previewNote.hidden = false;
        modal.previewNote.textContent =
            "Предпросмотр недоступен для этого формата. Скачайте файл, чтобы открыть его на компьютере.";
    }

    modal.previewDialog.showModal();
}

function initDocumentActions() {
    ensureDocumentModals();

    document.addEventListener("click", (event) => {
        const trigger = event.target.closest(".doc-action");

        if (!trigger) {
            return;
        }

        event.preventDefault();

        const url = trigger.dataset.docUrl;
        const title = trigger.dataset.docTitle || "Документ";
        const action = trigger.dataset.docAction;

        if (!url) {
            return;
        }

        if (action === "preview") {
            openDocumentPreview({ url, title });
            return;
        }

        if (action === "open") {
            openExternalConfirm({ url, title });
            return;
        }

        openDownloadConfirm({ url, title });
    });
}

function renderDocumentLink(file, title = "Документ") {
    if (!file) {
        return `<p class="muted">Документ предоставляется по запросу через приемную учреждения.</p>`;
    }

    const isExternal = /^https?:\/\//i.test(file);
    const href = isExternal ? file : resolvePath(file);
    const canPreview = !isExternal && isPreviewableExtension(getFileExtension(file));

    if (isExternal) {
        return `
            <div class="doc-actions">
                <button
                    type="button"
                    class="text-link doc-action"
                    data-doc-action="open"
                    data-doc-url="${escapeAttr(href)}"
                    data-doc-title="${escapeAttr(title)}"
                >Открыть документ</button>
            </div>
        `;
    }

    const previewButton = canPreview
        ? `<button
                type="button"
                class="text-link doc-action"
                data-doc-action="preview"
                data-doc-url="${escapeAttr(href)}"
                data-doc-title="${escapeAttr(title)}"
            >Просмотр</button>`
        : "";

    return `
        <div class="doc-actions">
            ${previewButton}
            <button
                type="button"
                class="text-link doc-action"
                data-doc-action="download"
                data-doc-url="${escapeAttr(href)}"
                data-doc-title="${escapeAttr(title)}"
            >Скачать документ</button>
        </div>
    `;
}

async function loadDocuments() {
    const container = document.querySelector("#docs-list");

    if (!container) {
        return;
    }

    try {
        const docs = await fetchJson(resolvePath("data/documents.json"));

        docs.forEach((doc) => {
            const card = document.createElement("article");
            card.className = "card";

            card.innerHTML = `
                <h3>${doc.title}</h3>
                <p>${doc.description}</p>
                ${renderDocumentLink(doc.file, doc.title)}
            `;

            container.appendChild(card);
        });
    } catch (error) {
        container.innerHTML = createCardMessage(
            "Раздел документов",
            "Сведения уточняются. Для получения документа обратитесь в приемную учреждения."
        );
        console.error(error);
    }
}

async function loadNews() {
    const container = document.querySelector("#news-list");

    if (!container) {
        return;
    }

    try {
        const newsData = await fetchJson(resolvePath("data/news.json"));
        const sortedNews = normalizeNewsItems(newsData).sort((a, b) => {
            const da = Date.parse((a.isoDate || "").trim());
            const db = Date.parse((b.isoDate || "").trim());
            if (!Number.isNaN(da) && !Number.isNaN(db)) {
                return db - da;
            }
            return 0;
        });

        const limit = Number.parseInt(container.dataset.limit || "", 10);
        const items = Number.isFinite(limit) ? sortedNews.slice(0, limit) : sortedNews;

        items.forEach((item) => {
            const card = document.createElement("article");
            card.className = "card news-card";

            const imageMarkup = item.image
                ? `<img src="${resolvePath(item.image)}" alt="${escapeAttr(item.title)}">`
                : "";
            const linkMarkup = item.link
                ? `<a class="text-link" href="${escapeAttr(item.link)}" target="_blank" rel="noopener noreferrer">Подробнее</a>`
                : "";

            card.innerHTML = `
                ${imageMarkup}
                <h3>${escapeHtml(item.title)}</h3>
                <p>${escapeHtml(item.text)}</p>
                <span class="news-date">${escapeHtml(formatNewsDate(item))}</span>
                ${linkMarkup}
            `;

            container.appendChild(card);
        });
    } catch (error) {
        container.innerHTML = createCardMessage(
            "Раздел новостей",
            "Публикации обновляются. Актуальную информацию можно уточнить по контактам учреждения."
        );
        console.error(error);
    }
}

function renderSystemLinks(links) {
    if (!Array.isArray(links) || links.length === 0) {
        return `<p class="muted">Форма заявки предоставляется по запросу через приемную учреждения.</p>`;
    }

    return `
        <div class="systems-links">
            ${links
                .map(
                    (link) => {
                        const isExternal = /^https?:\/\//i.test(link.url || "");
                        const href = isExternal ? link.url : resolvePath(link.url || "");
                        const action = isExternal ? "open" : "download";
                        const label = link.label || "Документ";

                        return `<button
                            type="button"
                            class="btn primary systems-link doc-action"
                            data-doc-action="${action}"
                            data-doc-url="${escapeAttr(href)}"
                            data-doc-title="${escapeAttr(label)}"
                        >${escapeHtml(label)}</button>`;
                    }
                )
                .join("")}
        </div>
    `;
}

async function loadFireSystemsTests() {
    const container = document.querySelector("#systems-tests-list");

    if (!container) {
        return;
    }

    try {
        const services = await fetchJson(resolvePath("data/fire-systems.json"));

        services.forEach((service) => {
            const card = document.createElement("article");
            card.className = "card systems-card";

            const requirements = Array.isArray(service.requirements)
                ? service.requirements.map((item) => `<li>${item}</li>`).join("")
                : "";

            const standards = Array.isArray(service.standards) && service.standards.length > 0
                ? `<p class="systems-standards"><strong>Нормативная база:</strong> ${service.standards.join("; ")}</p>`
                : "";

            card.innerHTML = `
                <div class="systems-card-head">
                    <h3>${service.title}</h3>
                    <span class="systems-price">${service.price || "Согласно действующему прейскуранту"}</span>
                </div>
                <p>${service.description || ""}</p>
                ${standards}
                <p class="systems-subtitle"><strong>Необходимые документы:</strong></p>
                <ul class="schedule-list">${requirements}</ul>
                ${renderSystemLinks(service.links)}
            `;

            container.appendChild(card);
        });
    } catch (error) {
        container.innerHTML = createCardMessage(
            "Раздел испытаний",
            "Сведения обновляются. Для уточнения перечня услуг обратитесь в приемную учреждения."
        );
        console.error(error);
    }
}

function initMobileNav() {
    const toggle = document.querySelector(".nav-toggle");
    const menu = document.querySelector(".header-actions");

    if (!toggle || !menu) {
        return;
    }

    toggle.addEventListener("click", () => {
        const isOpen = menu.classList.toggle("is-open");
        toggle.setAttribute("aria-expanded", String(isOpen));
        toggle.setAttribute("aria-label", isOpen ? "Закрыть меню" : "Открыть меню");
    });

    menu.querySelectorAll("a").forEach((link) => {
        link.addEventListener("click", () => {
            menu.classList.remove("is-open");
            toggle.setAttribute("aria-expanded", "false");
            toggle.setAttribute("aria-label", "Открыть меню");
        });
    });
}

initMobileNav();
initDocumentActions();
loadDocuments();
loadNews();
loadFireSystemsTests();
