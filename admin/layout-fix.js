(function () {
    const MOBILE_BREAKPOINT = 900;

    function isMobile() {
        return window.innerWidth < MOBILE_BREAKPOINT;
    }

    function headerHeight() {
        return isMobile() ? 88 : 112;
    }

    function sidebarWidth() {
        return isMobile() ? 0 : 280;
    }

    function applyImportant(element, rules) {
        if (!element) {
            return;
        }

        for (const [property, value] of Object.entries(rules)) {
            element.style.setProperty(property, value, "important");
        }
    }

    function fixLayout() {
        const mobile = isMobile();
        const header = headerHeight();
        const sidebar = sidebarWidth();
        const root = document.body;
        const appShell = root.firstElementChild;

        if (!appShell || !appShell.querySelector("main")) {
            return;
        }

        applyImportant(appShell, {
            width: "100%",
            "max-width": "none",
            "min-width": "0",
            margin: "0",
            "min-height": "100vh"
        });

        appShell.querySelectorAll("header, nav").forEach((element) => {
            applyImportant(element, {
                width: "100%",
                "max-width": "none"
            });
        });

        appShell.querySelectorAll("main").forEach((main) => {
            if (mobile) {
                applyImportant(main, {
                    width: "100%",
                    "max-width": "none",
                    "padding-left": "16px",
                    "padding-right": "16px",
                    "padding-top": "12px",
                    "padding-bottom": "80px",
                    "min-height": "auto",
                    "box-sizing": "border-box"
                });
            } else {
                applyImportant(main, {
                    width: "100%",
                    "max-width": "none",
                    "padding-left": `${sidebar}px`,
                    "padding-right": "32px",
                    "padding-top": "20px",
                    "padding-bottom": "32px",
                    "min-height": `calc(100vh - ${header}px)`,
                    "box-sizing": "border-box"
                });
            }
        });

        appShell.querySelectorAll("div").forEach((element) => {
            const className = element.className || "";
            if (typeof className === "string" && className.includes("SidebarContainer")) {
                if (mobile) {
                    applyImportant(element, {
                        position: "static",
                        width: "100%",
                        left: "auto",
                        top: "auto",
                        margin: "0 16px 16px",
                        "max-height": "none"
                    });
                } else {
                    applyImportant(element, {
                        position: "fixed",
                        left: "24px",
                        top: `${header}px`,
                        width: "250px",
                        "max-height": `calc(100vh - ${header}px - 24px)`
                    });
                }
                return;
            }

            const styles = window.getComputedStyle(element);
            if (styles.maxWidth === "1440px") {
                applyImportant(element, {
                    width: "100%",
                    "max-width": "none",
                    margin: "0"
                });
            }
        });
    }

    let resizeTimer;
    function scheduleFix() {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(fixLayout, 80);
    }

    function start() {
        fixLayout();
        window.addEventListener("resize", scheduleFix);

        const observer = new MutationObserver(scheduleFix);
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        setTimeout(fixLayout, 400);
        setTimeout(fixLayout, 1500);
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", start);
    } else {
        start();
    }
})();
