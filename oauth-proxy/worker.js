/**
 * OAuth-прокси Decap CMS для GitHub Pages.
 * Деплой: npx wrangler deploy (см. SETUP.md)
 */

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
    <title>Авторизация Decap CMS</title>
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
<p>Авторизация Decap CMS… Можно закрыть это окно.</p>
</body>
</html>`;
}

async function exchangeCodeForToken(code, redirectUri, env) {
    const response = await fetch(TOKEN_URL, {
        method: "POST",
        headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            "User-Agent": "ipl-decap-oauth"
        },
        body: JSON.stringify({
            client_id: env.GITHUB_OAUTH_ID,
            client_secret: env.GITHUB_OAUTH_SECRET,
            code,
            redirect_uri: redirectUri
        })
    });

    if (!response.ok) {
        throw new Error(`GitHub token exchange failed: ${response.status}`);
    }

    const data = await response.json();

    if (data.error) {
        throw new Error(data.error_description || data.error);
    }

    if (!data.access_token) {
        throw new Error("GitHub did not return access_token");
    }

    return data.access_token;
}

export default {
    async fetch(request, env) {
        const url = new URL(request.url);

        if (url.pathname === "/auth") {
            const provider = url.searchParams.get("provider");
            if (provider !== "github") {
                return new Response("Invalid provider", { status: 400 });
            }

            const redirectUri = `${url.origin}/callback?provider=github`;
            const authUrl = new URL(AUTHORIZE_URL);
            authUrl.searchParams.set("client_id", env.GITHUB_OAUTH_ID);
            authUrl.searchParams.set("redirect_uri", redirectUri);
            authUrl.searchParams.set("scope", SCOPE);
            authUrl.searchParams.set("state", crypto.randomUUID());

            return redirectResponse(authUrl.toString());
        }

        if (url.pathname === "/callback") {
            const provider = url.searchParams.get("provider");
            if (provider !== "github") {
                return new Response("Invalid provider", { status: 400 });
            }

            const code = url.searchParams.get("code");
            if (!code) {
                return htmlResponse(buildCallbackPage("error", ""), 400);
            }

            try {
                const redirectUri = `${url.origin}/callback?provider=github`;
                const token = await exchangeCodeForToken(code, redirectUri, env);
                return htmlResponse(buildCallbackPage("success", token));
            } catch (error) {
                console.error(error);
                return htmlResponse(buildCallbackPage("error", ""), 500);
            }
        }

        return new Response("Decap OAuth proxy is running.", {
            headers: { "Content-Type": "text/plain; charset=utf-8" }
        });
    }
};
