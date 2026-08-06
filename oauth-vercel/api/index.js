const crypto = require("crypto");

const REPO = process.env.GITHUB_REPO || "mnsrkhatuev-web/ipl-site";
const BRANCH = process.env.GITHUB_BRANCH || "main";
const NEWS_PATH = process.env.NEWS_PATH || "data/news.json";
const IMAGES_PATH = process.env.IMAGES_PATH || "assets/images";
const ALLOWED_ORIGINS = (
    process.env.ALLOWED_ORIGINS ||
    "https://ipl-chr.ru,https://www.ipl-chr.ru,https://mnsrkhatuev-web.github.io,http://127.0.0.1:8000,http://localhost:8000"
).split(",").map((value) => value.trim()).filter(Boolean);
const SESSION_TTL_SECONDS = Number(process.env.SESSION_TTL_SECONDS || 60 * 60 * 12);

function sendJson(res, status, body, extraHeaders = {}) {
    res.writeHead(status, {
        "Content-Type": "application/json; charset=utf-8",
        ...extraHeaders
    });
    res.end(JSON.stringify(body));
}

function sendText(res, status, body, extraHeaders = {}) {
    res.writeHead(status, {
        "Content-Type": "text/plain; charset=utf-8",
        ...extraHeaders
    });
    res.end(body);
}

function applyCors(req, res) {
    const origin = req.headers.origin || "";
    if (origin && ALLOWED_ORIGINS.includes(origin)) {
        res.setHeader("Access-Control-Allow-Origin", origin);
        res.setHeader("Vary", "Origin");
        res.setHeader("Access-Control-Allow-Credentials", "true");
    }
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS");
    res.setHeader(
        "Access-Control-Allow-Headers",
        "Content-Type, Authorization"
    );
}

function readBody(req) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        req.on("data", (chunk) => chunks.push(chunk));
        req.on("end", () => {
            const raw = Buffer.concat(chunks).toString("utf8");
            if (!raw) {
                resolve(null);
                return;
            }
            try {
                resolve(JSON.parse(raw));
            } catch (error) {
                reject(new Error("Некорректный JSON"));
            }
        });
        req.on("error", reject);
    });
}

function base64UrlEncode(value) {
    return Buffer.from(value)
        .toString("base64")
        .replace(/=/g, "")
        .replace(/\+/g, "-")
        .replace(/\//g, "_");
}

function base64UrlDecode(value) {
    const padded = value.replace(/-/g, "+").replace(/_/g, "/");
    const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
    return Buffer.from(padded + pad, "base64").toString("utf8");
}

function getSessionSecret() {
    const secret = process.env.SESSION_SECRET;
    if (!secret) {
        throw new Error("SESSION_SECRET is not configured");
    }
    return secret;
}

function signJwt(payload) {
    const header = { alg: "HS256", typ: "JWT" };
    const encodedHeader = base64UrlEncode(JSON.stringify(header));
    const encodedPayload = base64UrlEncode(JSON.stringify(payload));
    const data = `${encodedHeader}.${encodedPayload}`;
    const signature = crypto
        .createHmac("sha256", getSessionSecret())
        .update(data)
        .digest("base64")
        .replace(/=/g, "")
        .replace(/\+/g, "-")
        .replace(/\//g, "_");
    return `${data}.${signature}`;
}

function verifyJwt(token) {
    const parts = String(token || "").split(".");
    if (parts.length !== 3) {
        throw Object.assign(new Error("Недействительный токен"), { status: 401 });
    }

    const [encodedHeader, encodedPayload, signature] = parts;
    const data = `${encodedHeader}.${encodedPayload}`;
    const expected = crypto
        .createHmac("sha256", getSessionSecret())
        .update(data)
        .digest("base64")
        .replace(/=/g, "")
        .replace(/\+/g, "-")
        .replace(/\//g, "_");

    const expectedBuf = Buffer.from(expected);
    const actualBuf = Buffer.from(signature);
    if (expectedBuf.length !== actualBuf.length) {
        throw Object.assign(new Error("Недействительный токен"), { status: 401 });
    }
    if (!crypto.timingSafeEqual(expectedBuf, actualBuf)) {
        throw Object.assign(new Error("Недействительный токен"), { status: 401 });
    }

    let payload;
    try {
        payload = JSON.parse(base64UrlDecode(encodedPayload));
    } catch (error) {
        throw Object.assign(new Error("Недействительный токен"), { status: 401 });
    }

    if (!payload.exp || Date.now() / 1000 > payload.exp) {
        throw Object.assign(new Error("Сессия истекла"), { status: 401 });
    }

    return payload;
}

function requireAuth(req) {
    const header = req.headers.authorization || "";
    const match = header.match(/^Bearer\s+(.+)$/i);
    if (!match) {
        throw Object.assign(new Error("Требуется авторизация"), { status: 401 });
    }
    return verifyJwt(match[1].trim());
}

function timingSafeEqualString(a, b) {
    const left = Buffer.from(String(a));
    const right = Buffer.from(String(b));
    if (left.length !== right.length) {
        return false;
    }
    return crypto.timingSafeEqual(left, right);
}

function encodeBase64Utf8(text) {
    return Buffer.from(text, "utf8").toString("base64");
}

function decodeBase64Utf8(base64) {
    return Buffer.from(String(base64).replace(/\n/g, ""), "base64").toString("utf8");
}

async function githubRequest(path, options = {}) {
    const token = process.env.GITHUB_TOKEN;
    if (!token) {
        throw Object.assign(new Error("GITHUB_TOKEN is not configured"), { status: 500 });
    }

    const response = await fetch(`https://api.github.com${path}`, {
        ...options,
        headers: {
            Accept: "application/vnd.github+json",
            Authorization: `Bearer ${token}`,
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "ipl-admin-api",
            ...(options.headers || {})
        }
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        const error = new Error(data.message || `GitHub API error (${response.status})`);
        error.status = response.status;
        throw error;
    }

    return data;
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

async function handleLogin(req, res) {
    const body = await readBody(req);
    const username = String(body?.username || "").trim();
    const password = String(body?.password || "");

    const expectedUser = process.env.ADMIN_USER || "";
    const expectedPassword = process.env.ADMIN_PASSWORD || "";

    if (!expectedUser || !expectedPassword) {
        sendJson(res, 500, { error: "ADMIN_USER / ADMIN_PASSWORD не настроены" });
        return;
    }

    const userOk = timingSafeEqualString(username, expectedUser);
    const passOk = timingSafeEqualString(password, expectedPassword);

    if (!userOk || !passOk) {
        sendJson(res, 401, { error: "Неверный логин или пароль" });
        return;
    }

    const now = Math.floor(Date.now() / 1000);
    const token = signJwt({
        sub: username,
        iat: now,
        exp: now + SESSION_TTL_SECONDS
    });

    sendJson(res, 200, { token, expiresIn: SESSION_TTL_SECONDS });
}

async function handleGetNews(req, res) {
    requireAuth(req);

    const file = await githubRequest(
        `/repos/${REPO}/contents/${NEWS_PATH}?ref=${BRANCH}`
    );
    const decoded = JSON.parse(decodeBase64Utf8(file.content));
    const items = normalizeNewsData(decoded).sort((a, b) => {
        return Date.parse(b.isoDate || "") - Date.parse(a.isoDate || "");
    });

    sendJson(res, 200, { items, sha: file.sha });
}

async function handlePutNews(req, res) {
    requireAuth(req);
    const body = await readBody(req);
    const items = Array.isArray(body?.items) ? body.items : null;
    const message = String(body?.message || "Update news via IPL admin").slice(0, 200);
    const sha = String(body?.sha || "");

    if (!items) {
        sendJson(res, 400, { error: "Ожидается массив items" });
        return;
    }
    if (!sha) {
        sendJson(res, 400, { error: "Ожидается sha текущего файла" });
        return;
    }

    const payload = { items };
    const content = encodeBase64Utf8(`${JSON.stringify(payload, null, 2)}\n`);

    const file = await githubRequest(`/repos/${REPO}/contents/${NEWS_PATH}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            message,
            content,
            branch: BRANCH,
            sha
        })
    });

    sendJson(res, 200, { sha: file.content.sha, items });
}

async function handleUpload(req, res) {
    requireAuth(req);
    const body = await readBody(req);
    const content = String(body?.content || "");
    const extension = String(body?.extension || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";

    if (!content) {
        sendJson(res, 400, { error: "Ожидается content (base64)" });
        return;
    }

    if (content.length > 7_000_000) {
        sendJson(res, 400, { error: "Файл слишком большой" });
        return;
    }

    const safeName = `news-${Date.now()}.${extension}`;
    const path = `${IMAGES_PATH}/${safeName}`;

    await githubRequest(`/repos/${REPO}/contents/${path}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            message: `Upload news image ${safeName}`,
            content,
            branch: BRANCH
        })
    });

    sendJson(res, 200, { path });
}

module.exports = async (req, res) => {
    applyCors(req, res);

    if (req.method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
    }

    const host = req.headers.host || "localhost";
    const url = new URL(req.url, `https://${host}`);
    const pathname = url.pathname.replace(/\/+$/, "") || "/";

    try {
        if (pathname === "/login" && req.method === "POST") {
            await handleLogin(req, res);
            return;
        }

        if (pathname === "/logout" && req.method === "POST") {
            requireAuth(req);
            sendJson(res, 200, { ok: true });
            return;
        }

        if (pathname === "/api/news" && req.method === "GET") {
            await handleGetNews(req, res);
            return;
        }

        if (pathname === "/api/news" && req.method === "PUT") {
            await handlePutNews(req, res);
            return;
        }

        if (pathname === "/api/upload" && req.method === "POST") {
            await handleUpload(req, res);
            return;
        }

        if (pathname === "/" && req.method === "GET") {
            sendText(res, 200, "IPL admin API is running.");
            return;
        }

        sendJson(res, 404, { error: "Not found" });
    } catch (error) {
        const status = error.status || (String(error.message || "").includes("токен") ||
            String(error.message || "").includes("Сессия") ||
            String(error.message || "").includes("авторизац")
            ? 401
            : 500);

        if (status >= 500) {
            console.error(error);
        }

        sendJson(res, status, { error: error.message || "Internal Server Error" });
    }
};
