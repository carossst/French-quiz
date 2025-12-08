# 📘 Test Your French — v3.1
**Interactive French-learning web app • Daily quizzes • Gamified progression • Privacy-first**

Test Your French is a lightweight, mobile-first learning app designed to help users test and improve their real French level through authentic daily quizzes.  
It runs entirely in the browser (no backend), with offline caching, gamification, and optional Premium unlock.

Live demo:  
**https://carossst.github.io/French-quiz/**

---

## 🧭 Features

### 🎯 Interactive French Quizzes
- Free Colors theme (5 quizzes)
- 9 additional themes (45 quizzes)
- Writing, reading, grammar, vocabulary
- “Authentic French” explanations inside each question
- Manual “Next” UX (Option B) for better control

### ⭐ Gamification
- French Points
- Levels
- Daily reward chest
- Badges
- Streak tracking
- Smart feedback (rotating motivational messages)

### 📊 Stats Dashboard
- Level & progress
- Accuracy
- Time spent
- Completed quizzes
- Recent assessments
- Earned badges
- Mobile-adaptive layout

### 🔒 Privacy-first
- No accounts required
- All user progress stored locally (`localStorage`)
- Optional profile collection (email + first name), kept local
- GDPR-safe by design

### 🛒 Premium Access ($12)
Unlock:
- all quiz themes
- all assessments
- audio pronunciation

Powered by **Stripe Checkout**.

---

## 🏗 Architecture Overview

```text
root/
│
├── index.html          # Entry point (UI shell + CSP + PWA)
├── style.css           # Tailwind compiled stylesheet
│
├── main.js             # App bootstrap
├── config.js           # Environment config (local/dev/prod)
│
├── ui-core.js          # Main UI controller (navigation, screens)
├── ui-features.js      # XP, FP, chests, paywall, feedback
├── ui-charts.js        # Stats & visualization
│
├── quizManager.js      # Quiz engine (questions, flow, scoring)
├── resourceManager.js  # Loads quizzes, metadata, audio
├── storage.js          # Local storage engine (progress, FP, badges)
│
├── email.js            # Anti-scraping contact link generator
├── noscript.js         # JS-disabled handling
├── fallback.js         # JS-load failure fallback
│
├── metadata.json       # Theme list + quiz metadata
├── *.json              # Quizzes (Colors 1–5 etc.)
└── manifest.json       # PWA manifest
```

---

## 🚀 Development

### Local usage

Nothing to install.  
Just clone the repo and open `index.html` in a browser.

```bash
git clone https://github.com/yourusername/French-quiz.git
cd French-quiz
```

Then:

- open `index.html` directly in your browser, or
- serve with a simple static server, for example:

```bash
python -m http.server 8000
# then open http://localhost:8000/
```

### Development mode

`config.js` automatically enables:

- debug logs
- disabled service worker
- relaxed caching

whenever the hostname is:

- `localhost`
- `127.0.0.1`

---

## 📦 Build & Deployment

This app is pure static HTML/CSS/JS — no build step is required.

### GitHub Pages

1. Commit your changes
2. Push to the `main` (or `gh-pages`) branch
3. Configure GitHub Pages to serve from that branch and root (`/`)
4. The app will be accessible at:

```text
https://<username>.github.io/French-quiz/
```

### Service Worker

The service worker is:

- **disabled** in local development
- **enabled** in production (non-localhost)

It:

- caches metadata, quizzes and shell
- allows limited offline usage
- auto-updates when a new version is deployed

---

## 🔐 Security

### Content Security Policy (CSP)

`index.html` defines a strict CSP, roughly:

- `default-src 'self'`
- `script-src 'self' 'unsafe-inline' https://js.stripe.com`
- `style-src 'self' 'unsafe-inline'`
- `img-src 'self' data: https:`
- `connect-src 'self' https://api.stripe.com https://buy.stripe.com`
- `frame-src https://js.stripe.com https://buy.stripe.com`

This:

- allows Stripe Checkout integration
- blocks arbitrary third-party scripts
- keeps the app privacy-friendly

### Anti-scraping email

`email.js` uses data attributes:

```html
<a id="contact-mail"
   data-user="bonjour"
   data-domain="testyourfrench.com"
   href="#">
  Contact
</a>
```

The script reconstructs the `mailto:` link client-side, reducing naive scraping.

---

## 🧪 Testing the main flow

Recommended test path for QA:

1. **New visitor**
   - Open the app in a fresh browser profile/private window
   - Confirm welcome screen, free Colors theme available

2. **First quiz (Colors)**
   - Start Colors Quiz 1
   - Answer a few questions (correct and incorrect)
   - Check feedback timing and “Next” behaviour

3. **Daily chest**
   - Return to the home screen
   - Open the daily chest (if available)
   - Confirm French Points are updated and the header refreshes

4. **Paywall behaviour**
   - Complete several free quizzes
   - Confirm paywall suggestions appear only when relevant
   - Verify Stripe Checkout opens correctly

5. **Stats**
   - Open “Stats” / “Your progress”
   - Check:
     - Level
     - French Points
     - Accuracy
     - Time spent
     - Recent assessments list
   - Confirm data matches your recent quiz runs

---

## 🧩 Adding or editing quizzes

1. Add a new quiz JSON file at the root (for example `colors_quiz_3.json`).
2. Ensure its structure follows the existing quizzes:

```json
{
  "id": 103,
  "themeId": 1,
  "name": "Writing and Reading Colors – Quiz 3",
  "description": "Practice Colors vocabulary and grammar.",
  "version": "2.2.3",
  "questions": [
    {
      "question": "How do you say "Red"?",
      "options": [
        "A. Rose",
        "B. Rouge",
        "C. Led",
        "D. Bordeaux"
      ],
      "correctAnswer": "B. Rouge",
      "explanation": "Red is one of the three colors on the French flag."
    }
  ]
}
```

3. Register the new quiz in `metadata.json` under the appropriate theme.
4. The ResourceManager will load it automatically.

---

## 🧱 Tech stack

- HTML5 + vanilla JavaScript
- Tailwind CSS (precompiled into `style.css`)
- No frontend framework (no React/Vue/Angular)
- No backend
- Stripe Checkout for payments
- Service Worker for offline support

---

## 📄 License

This project is distributed under the terms described in the \`LICENSE\` file at the root of the repository.
