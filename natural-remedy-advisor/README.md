# Natural Remedy Advisor

Natural diet, lifestyle and home-remedy advisor built on the **9 pillars of health**, SUSTAIN ME (Sunshine, Use of water, Sleep, Trust, Abstain, Inhale fresh air, Nutrition, Moderation, Exercise). Web app (installable PWA) + Android app (Capacitor), with a Gemini-powered AI advisor.

## Features
- **Advisor**: Gemini chat that follows the 9 pillars and the built-in remedy library, labels evidence levels, and flags interactions.
- **Remedies**: searchable library of 25 home remedies, each with how-to, evidence level and cautions.
- **Today**: goal-based daily plan, 9-pillar checklist, streak and 7-day chart (stored on the device).
- **Pillars**: the nine pillars explained.
- **Safety**: emergency/red-flag phrases (chest pain, stroke signs, cancer, stopping medication…) are caught on the device *and* the server and never reach the model. The system prompt forbids anti-medication, anti-vaccine and "cure" claims.

## Architecture
```
Browser / Android WebView ──► /api/advisor (Netlify Function) ──► Gemini API
                                 holds GEMINI_API_KEY, red-flag filter, system prompt
```
The API key lives only on the server. Never put it in the app: anything inside an APK can be extracted.

## Run locally
```bash
npm install
cp .env.example .env          # add GEMINI_API_KEY (free at aistudio.google.com)
npx netlify dev               # web + function at http://localhost:8888
```

## Deploy the web app (Netlify)
1. Push to GitHub → "Import project" in Netlify (build settings come from `netlify.toml`).
2. Site settings → Environment variables: `GEMINI_API_KEY`, optionally `GEMINI_MODEL` and `ALLOWED_ORIGINS`.
3. On Android Chrome, open the site → menu → **Install app**. That alone gives you an Android app.

## Get the test APK
Every push to `main` builds a debug APK with GitHub Actions and attaches it to a **Releases** entry (`Test build N`). Open the release on your phone, download the `.apk`, and allow "Install unknown apps".

Without a server, tap ⚙️ in the app and paste your own Gemini key (stored only on the device). To point the APK at your deployed server instead, set the repository variable `VITE_API_BASE`.

## Build the Android app (Play Store)
Requires Android Studio.
```bash
echo "VITE_API_BASE=https://your-site.netlify.app" > .env.production
npm run android:sync
npm run android:open          # Android Studio → Build → Generate Signed Bundle (.aab)
```

## Content
- `src/data/principles.js`: the nine pillars
- `src/data/remedies.js`: remedy library (evidence: strong / some / traditional)
- `src/data/redflags.js`: emergency patterns, shared by the client and the server

## Before publishing
- Play Store health apps need a privacy policy and the Health apps declaration, and must not claim to diagnose or treat disease.
- Have a qualified health professional review the remedy content.
