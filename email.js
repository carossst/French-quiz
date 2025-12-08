// email.js v3.0 - Test Your French
// Gère l'email obfusqué + les liens de contact (header + footer)

(function () {
    function buildMailto(user, domain) {
        if (!user || !domain) return null;
        return user + '@' + domain;
    }

    function decodeReversedEmail(el) {
        if (!el) return;

        const userRev = el.getAttribute('data-user') || '';
        const domainRev = el.getAttribute('data-domain') || '';

        if (!userRev || !domainRev) return;

        // Les deux sont stockés à l'envers dans le HTML
        const user = userRev.split('').reverse().join('');
        const domain = domainRev.split('').reverse().join('');
        const email = buildMailto(user, domain);

        if (!email) return;

        // Affiche l'email en clair (anti-scraping minimal)
        el.textContent = email;
    }

    function wireContactLink(el) {
        if (!el) return;

        const user = el.getAttribute('data-user') || 'bonjour';
        const domain = el.getAttribute('data-domain') || 'testyourfrench.com';
        const email = buildMailto(user, domain);
        if (!email) return;

        el.setAttribute('href', 'mailto:' + email);
        el.setAttribute('rel', 'nofollow noopener');
        // On NE change PAS le texte du lien ("send an email", "Contact")
    }

    document.addEventListener('DOMContentLoaded', function () {
        try {
            // 1) Span obfusqué dans le texte
            const obfuscated = document.querySelector('.obfuscated-email');
            decodeReversedEmail(obfuscated);

            // 2) Lien principal "send an email"
            const mainLink = document.getElementById('contact-mail');
            wireContactLink(mainLink);

            // 3) Lien footer "Contact"
            const footerLink = document.getElementById('contact-mail-footer');
            wireContactLink(footerLink);

        } catch (err) {
            console.warn('[email.js] Failed to initialize contact links:', err);
        }
    });
})();
