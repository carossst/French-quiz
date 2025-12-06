// js/fallback.js

window.addEventListener('DOMContentLoaded', function () {
    // JS s’est bien chargé → on ne montre rien
    const jsFailed = document.getElementById('js-failed');
    if (jsFailed) jsFailed.remove();

    const reloadBtn = document.getElementById('reload-btn');
    if (reloadBtn) {
        reloadBtn.addEventListener('click', () => window.location.reload());
    }
});
