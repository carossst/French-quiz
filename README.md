# 🇫🇷 Test Your French

> **A PWA to test your real-world French skills — built with vibe coding and AI-assisted development.**

---

## 💡 Why This Exists

Learning French in a classroom is one thing. **Ordering a croissant in a real Parisian boulangerie is another.**

Most apps teach vocabulary. This one tests if you'd actually survive a conversation with a French person — the fast talkers, the slang, the "what did they just say?" moments.

**Test Your French** was born from a simple frustration: existing apps don't prepare you for *real* France.

---

## 🎯 What It Does

- **10 themed quizzes** — Colors, Numbers, Café, Métro, Boulangerie...
- **Native French audio** — Real pronunciation, real speed
- **Gamification** — French Points, daily chests, progressive unlocking
- **Freemium model** — Colors theme free, premium unlocks everything
- **Works offline** — Full PWA with service worker caching

---

## 🛠️ How It Was Built

### Vibe Coding with AI

This project was built using **vibe coding** — a human-led, AI-assisted development workflow.

*Vibe coding here means fast iteration with AI, without giving up architectural control or understanding.*

**What that means in practice:**
- Product vision, UX decisions, and final calls stay human
- AI (Claude, ChatGPT) is used as a force multiplier, not autopilot
- One AI reviews the other's output — cross-verification avoids blind spots
- It's pair programming with a very patient colleague who never gets tired — but also unreliable and forgetful, so you stay sharp

This project was developed through long-term iteration, refactoring, and continuous learning.

### AI Roles in This Project

AI supports the work, but does not own it.
It is used to suggest architectures, generate and refactor code, and help detect bugs or logical inconsistencies. Different models are deliberately cross-used to review each other’s outputs to reduce blind spots.

All final responsibility remains human. Technical decisions, product vision and positioning, UX trade-offs and constraints, and the monetization model are defined by the project owner. AI accelerates thinking and execution, but judgment and ownership stay human.

AI is treated as a **senior pair programmer**, not a decision-maker.

### Why Not Cursor, Copilot, or Full App Generators?

These tools are powerful. They were intentionally not used here because of the project constraints: learning, full control, and long-term maintainability.

**Tooling philosophy:**
- **Cursor/Copilot** — useful for autocomplete, but the goal was to understand and actively decide on the logic, not just accept suggestions  
- **v0** — great for UI scaffolding, but the project required a coherent, lightweight design system fully under control  
- **Bolt/Lovable** — perfect for quick prototypes, but the objective here was to learn and ship clean, not just ship fast  


AI was used as a pair programmer and a, with systematic cross-review between models — not as a black-box generator.

### Tech Stack

```
Frontend:    Vanilla JS (no framework)
Styling:     Tailwind CSS
PWA:         Service Worker, Web App Manifest
Storage:     localStorage (no backend)
Payments:    Stripe Checkout
Hosting:     GitHub Pages
```

**Why no React/Vue?** The scope doesn't justify a framework. I prioritized a small, auditable codebase with minimal tooling: ES modules, clear separation of concerns, and no build dependency for local development.

---

## 📁 Project Structure

```
├── index.html          # Main app shell
├── style.css           # Tailwind-compiled styles
├── config.js           # App configuration
├── main.js             # Bootstrap & initialization
├── ui-core.js          # Screen management & quiz UI
├── ui-features.js      # Gamification, modals, XP system
├── ui-charts.js        # Stats visualization
├── storage.js          # localStorage manager (single source of truth)
├── quizManager.js      # Quiz logic & scoring
├── resourceManager.js  # Data loading & caching
├── sw.js               # Service Worker
├── metadata.json       # Themes & quizzes index
└── *_quiz_*.json       # Quiz data files
```

---

## 🚀 Getting Started

```bash
# Clone
git clone https://github.com/your-username/test-your-french.git

# Serve locally (any static server works)
npx serve .
# or
python -m http.server 8000

# Open
http://localhost:8000
```

No build step. No npm install. Just serve and go.

---

## 🎨 Design Principles

1. **Mobile-first** — Designed for phones, scales up to desktop
2. **Offline-ready** — Cache everything, work anywhere
3. **Privacy-first** — All data stays in your browser
4. **KISS** — Keep It Simple, Stupid

---

## 🧠 Philosophy

> *"I don't try to move fast by skipping understanding. I move fast by removing unnecessary complexity."*

### AI Usage

- AI is a thinking accelerator, not an authority
- Every non-trivial output is reviewed, challenged, corrected
- One model systematically reviews the other
- Final decisions remain human

### Engineering Style

- Explicit code over magic abstractions
- Clarity over cleverness
- One responsibility per file
- Single source of truth for state
- Fix bugs by simplifying, not adding layers

### Product Mindset

- Constraints are features, not limitations
- Offline-first and privacy-first are product decisions, not accidents
- Monetization is part of the design, not an afterthought
- No feature without a clear UX rationale

### Quality Discipline

- Manual testing on real devices (mobile-first)
- Edge cases found through reasoning, not just testing
- Refactors only when they reduce cognitive load

---

## 🧠 What This Project Demonstrates

- Shipping a complete product end-to-end as a solo builder
- Strong JavaScript fundamentals without relying on heavy frameworks
- Clean separation between UI, logic, and storage
- Pragmatic AI usage as a productivity multiplier
- Product thinking: UX, monetization, constraints, trade-offs
- Critical thinking about AI outputs — not blind trust

---

## ✅ Requirements

- Any modern browser
- HTTPS required for Service Worker in production
- Node or Python optional (for local static server)

---

## 🤝 Contributing

Issues and feedback are welcome.  
This project is primarily a learning and portfolio space.

---

## 🗺️ Roadmap

- Improve audio variety and difficulty scaling
- Refine stats and progression insights
- Explore additional real-life scenarios

---

## 👩‍💻 About the Creator

Built by **Carole Stromboni** — product-oriented builder, French native, and AI-assisted development practitioner.

This project started as a concrete experiment: *"Can a single person ship a real, monetized product using AI responsibly?"* 

The answer is yes — with structure, discipline, and human judgment.

**→ [Connect on LinkedIn](https://www.linkedin.com/in/carolestromboni/)**

---

## 📄 License

MIT — Use it. Fork it. Learn from it. Build your own.

---
