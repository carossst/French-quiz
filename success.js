// success.js
(function () {
    const KEY = "tyf:vanityCode"; // stored on this browser

    function rand4() {
        return Math.random()
            .toString(36)
            .toUpperCase()
            .replace(/[^A-Z0-9]/g, "")
            .slice(0, 4)
            .padEnd(4, "X");
    }

    function getOrCreateCode() {
        let code = localStorage.getItem(KEY);
        if (!code) {
            code = "TYF-" + rand4() + "-" + rand4();
            localStorage.setItem(KEY, code);
        }
        return code;
    }

    function renderCode(code) {
        ["premium-code", "premium-code-inline"].forEach((id) => {
            const el = document.getElementById(id);
            if (el) el.textContent = code;
        });
    }

    function applyWordingFromConfig() {
        try {
            const wording = window.TYF_WORDING && window.TYF_WORDING.premium;
            const label = wording && wording.ctaAlreadyHave ? String(wording.ctaAlreadyHave) : "";
            if (!label) return;

            const nodes = document.querySelectorAll('[data-tyf-wording="premium.ctaAlreadyHave"]');
            if (!nodes || !nodes.length) return;

            nodes.forEach(function (el) {
                if (!el) return;
                el.textContent = label;
            });
        } catch (e) {
            // silent fallback
        }
    }

    function setCopiedState() {
        const primaryBtn = document.getElementById("copy-btn");
        const secondaryBtn = document.getElementById("copy-again");

        if (primaryBtn) primaryBtn.textContent = "Copied!";
        if (secondaryBtn) secondaryBtn.textContent = "Copied!";

        setTimeout(() => {
            if (primaryBtn) primaryBtn.textContent = "Copy code";
            if (secondaryBtn) secondaryBtn.textContent = "Copy code again";
        }, 2000);
    }

    function fallbackCopy(code) {
        const ta = document.createElement("textarea");
        ta.value = code;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.top = "-1000px";
        ta.style.left = "-1000px";
        document.body.appendChild(ta);
        ta.select();
        let ok = false;
        try {
            ok = document.execCommand("copy");
        } catch (e) {
            ok = false;
        }
        document.body.removeChild(ta);
        return ok;
    }

    function copyCode() {
        const el = document.getElementById("premium-code");
        const code = el ? el.textContent.trim() : "";
        if (!code) return;

        // Try modern clipboard first, fallback if blocked
        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(code).then(setCopiedState).catch(() => {
                if (fallbackCopy(code)) setCopiedState();
            });
            return;
        }

        if (fallbackCopy(code)) setCopiedState();
    }

    document.addEventListener("DOMContentLoaded", () => {
        const code = getOrCreateCode();
        renderCode(code);

        // Inject wording from config.js (deterministic)
        applyWordingFromConfig();

        const primaryBtn = document.getElementById("copy-btn");
        const secondaryBtn = document.getElementById("copy-again");
        if (primaryBtn) primaryBtn.addEventListener("click", copyCode);
        if (secondaryBtn) secondaryBtn.addEventListener("click", copyCode);

        if (typeof gtag !== "undefined") {
            gtag("event", "purchase_success", { value: 12 });
        }
    });
})();
