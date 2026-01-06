// success.js
(function () {
    const KEY = "tyf:vanityCode"; // personal reference stored on this browser

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
        ["premium-code", "premium-code-inline", "premium-code-save"].forEach((id) => {
            const el = document.getElementById(id);
            if (el) el.textContent = code;
        });
    }

    function copyCode() {
        const el = document.getElementById("premium-code");
        const code = el ? el.textContent.trim() : "";
        const primaryBtn = document.getElementById("copy-btn");
        const secondaryBtn = document.getElementById("copy-again");

        if (!code || !navigator.clipboard) return;

        navigator.clipboard.writeText(code).then(() => {
            if (primaryBtn) primaryBtn.textContent = "✅ Copied!";
            if (secondaryBtn) secondaryBtn.textContent = "✅ Copied!";

            setTimeout(() => {
                if (primaryBtn) primaryBtn.textContent = "📋 Copy Code";
                if (secondaryBtn) secondaryBtn.textContent = "📋 Copy code again";
            }, 2000);
        });
    }

    document.addEventListener("DOMContentLoaded", () => {
        const code = getOrCreateCode();
        renderCode(code);

        const primaryBtn = document.getElementById("copy-btn");
        const secondaryBtn = document.getElementById("copy-again");
        if (primaryBtn) primaryBtn.addEventListener("click", copyCode);
        if (secondaryBtn) secondaryBtn.addEventListener("click", copyCode);

        if (typeof gtag !== "undefined") {
            gtag("event", "purchase_success", { value: 12 });
        }
    });
})();
