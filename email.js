// email.js
document.addEventListener('DOMContentLoaded', () => {
    const el = document.getElementById('contact-mail');
    if (!el) return;
    const user = el.dataset.user || 'bonjour';
    const domain = el.dataset.domain || 'testyourfrench.com';
    const addr = `${user}@${domain}`;
    el.textContent = addr;
    el.href = `mailto:${addr}`;
    el.rel = 'nofollow noopener';
});
