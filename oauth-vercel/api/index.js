const TOKEN_URL = "https://github.com/login/oauth/access_token";
const AUTHORIZE_URL = "https://github.com/login/oauth/authorize";
const SCOPE = "public_repo,user";

function htmlResponse(html, status = 200) {
    return new Response(html, {
        status,
        headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "no-store"
        }
    });
}

function redirectResponse(location, status = 302) {
    return new Response(null, {
        status,
        headers: {
            Location: location,
            "Cache-Control": "no-store"
        }
    });
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
    const url = new URL(req.url, `https://${req.headers.host}`);

    if (url.pathname === "/auth") {
        const provider = url.searchParams.get("provider");
        if (provider !== "github") {
            res.status(400).send("Invalid provider");
            return;
        }

        const redirectUri = `${url.origin}/callback?provider=github`;
        const authUrl = new URL(AUTHORIZE_URL);
        authUrl.searchParams.set("client_id", process.env.GITHUB_OAUTH_ID);
        authUrl.searchParams.set("redirect_uri", redirectUri);
        authUrl.searchParams.set("scope", SCOPE);
        authUrl.searchParams.set("state", crypto.randomUUID());

        res.writeHead(302, { Location: authUrl.toString() });
        res.end();
        return;
    }

    if (url.pathname === "/callback") {
        const provider = url.searchParams.get("provider");
        if (provider !== "github") {
            res.status(400).send("Invalid provider");
            return;
        }

        const code = url.searchParams.get("code");
        if (!code) {
            res.status(400).send(buildCallbackPage("error", ""));
            return;
        }

        try {
            const redirectUri = `${url.origin}/callback?provider=github`;
            const token = await exchangeCodeForToken(code, redirectUri);
            res.status(200).send(buildCallbackPage("success", token));
        } catch (error) {
            console.error(error);
            res.status(500).send(buildCallbackPage("error", ""));
        }
        return;
    }

    res.status(200).send("Decap OAuth proxy is running.");
};
