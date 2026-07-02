const TOKEN_URL = "https://github.com/login/oauth/access_token";
const AUTHORIZE_URL = "https://github.com/login/oauth/authorize";
const SCOPE = "public_repo,user";

function sendText(res, status, body) {
    res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
    res.end(body);
}

function sendHtml(res, status, body) {
    res.writeHead(status, { "Content-Type": "text/html; charset=utf-8" });
    res.end(body);
}

function redirect(res, location) {
    res.writeHead(302, { Location: location });
    res.end();
}

function buildCallbackPage(status, token) {
    const message = `authorization:github:${status}:${JSON.stringify({ token })}`;

    return `<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="utf-8">
    <title>Decap CMS</title>
</head>
<body>
<script>
(function () {
    function receiveMessage() {
        window.opener.postMessage(${JSON.stringify(message)}, "*");
        window.removeEventListener("message", receiveMessage, false);
    }
    window.addEventListener("message", receiveMessage, false);
    window.opener.postMessage("authorizing:github", "*");
})();
</script>
<p>Авторизация…</p>
</body>
</html>`;
}

async function exchangeCodeForToken(code, redirectUri) {
    const response = await fetch(TOKEN_URL, {
        method: "POST",
        headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            "User-Agent": "ipl-decap-oauth"
        },
        body: JSON.stringify({
            client_id: process.env.GITHUB_OAUTH_ID,
            client_secret: process.env.GITHUB_OAUTH_SECRET,
            code,
            redirect_uri: redirectUri
        })
    });

    const data = await response.json();
    if (!response.ok || data.error || !data.access_token) {
        throw new Error(data.error_description || data.error || "token exchange failed");
    }

    return data.access_token;
}

module.exports = async (req, res) => {
    const host = req.headers.host || "localhost";
    const url = new URL(req.url, `https://${host}`);

    if (url.pathname === "/auth") {
        const provider = url.searchParams.get("provider");
        if (provider !== "github") {
            sendText(res, 400, "Invalid provider");
            return;
        }

        if (!process.env.GITHUB_OAUTH_ID) {
            sendText(res, 500, "GITHUB_OAUTH_ID is not configured");
            return;
        }

        const redirectUri = `${url.origin}/callback?provider=github`;
        const authUrl = new URL(AUTHORIZE_URL);
        authUrl.searchParams.set("client_id", process.env.GITHUB_OAUTH_ID);
        authUrl.searchParams.set("redirect_uri", redirectUri);
        authUrl.searchParams.set("scope", SCOPE);
        authUrl.searchParams.set("state", crypto.randomUUID());

        redirect(res, authUrl.toString());
        return;
    }

    if (url.pathname === "/callback") {
        const provider = url.searchParams.get("provider");
        if (provider !== "github") {
            sendText(res, 400, "Invalid provider");
            return;
        }

        const code = url.searchParams.get("code");
        if (!code) {
            sendHtml(res, 400, buildCallbackPage("error", ""));
            return;
        }

        try {
            const redirectUri = `${url.origin}/callback?provider=github`;
            const token = await exchangeCodeForToken(code, redirectUri);
            sendHtml(res, 200, buildCallbackPage("success", token));
        } catch (error) {
            console.error(error);
            sendHtml(res, 500, buildCallbackPage("error", ""));
        }
        return;
    }

    sendText(res, 200, "Decap OAuth proxy is running.");
};
