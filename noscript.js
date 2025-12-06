// js/noscript.js

document.addEventListener('DOMContentLoaded', function () {
    const btn = document.getElementById('reload-btn');
    if (btn) {
        btn.addEventListener('click', () => window.location.reload());
    }
});
