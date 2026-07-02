(function () {
    const HEADER_HEIGHT = 112;
    const SIDEBAR_WIDTH = 280;

    function applyImportant(element, rules) {
        if (!element) {
            return;
        }

        for (const [property, value] of Object.entries(rules)) {
            element.style.setProperty(property, value, "important");
        }
    }

    function fixLayout() {
        const root = document.getElementById("nc-root") || document.body;
        const appShell = root.firstElementChild;

        applyImportant(appShell, {
            width: "100%",
            "max-width": "none",
            "min-width": "0",
            margin: "0",
            "min-height": "100vh"
        });

        root.querySelectorAll("main").forEach((main) => {
            applyImportant(main, {
                width: "100%",
                "max-width": "none",
                "min-height": `calc(100vh - ${HEADER_HEIGHT}px)`,
                "padding-left": `${SIDEBAR_WIDTH}px`,
                "padding-right": "24px",
                "box-sizing": "border-box"
            });
        });

        root.querySelectorAll("header, nav").forEach((element) => {
            applyImportant(element, {
                width: "100%",
                "max-width": "none"
            });
        });

        root.querySelectorAll("div").forEach((element) => {
            const styles = window.getComputedStyle(element);
            const width = parseInt(styles.width, 10);

            if (styles.position === "fixed" && width >= 200 && width <= 300) {
                applyImportant(element, {
                    left: "0",
                    top: `${HEADER_HEIGHT}px`,
                    width: "250px"
                });
            }
        });

        root.querySelectorAll("div, main, section").forEach((element) => {
            const styles = window.getComputedStyle(element);
            if (styles.maxWidth === "1440px" || styles.marginLeft === "auto") {
                applyImportant(element, {
                    width: "100%",
                    "max-width": "none",
                    margin: "0"
                });
            }
        });
    }

    function start() {
        fixLayout();
        window.addEventListener("resize", fixLayout);

        const observer = new MutationObserver(() => fixLayout());
        observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ["style", "class"]
        });

        setTimeout(fixLayout, 300);
        setTimeout(fixLayout, 1000);
        setTimeout(fixLayout, 3000);
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", start);
    } else {
        start();
    }
})();
