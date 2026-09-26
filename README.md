# Recall Coach

HackNCState2027 Hackathon project: a fitness coach that **remembers what matters, forgets what doesn't, and asks before it lets go.**

Two Gemini models work side by side. A coach answers using your Google Health data, and a memory builder sorts what you say into 🔒 Core facts (never forgotten), 🎯 Goals (kept until done) and 🌊 Moments (fade on their own, with a check-in first when it matters).

See [ARCHITECTURE.md](ARCHITECTURE.md) for the full design and the demo script.

## Run it

```bash
npm install
cp .env.example .env.local   # add GEMINI_API_KEY
npm run dev                  # http://localhost:3000
```

The app starts on generated sample data, so only the Gemini key is required.

## Useful commands

| Command | What it does |
|---|---|
| `npm run gemini:spike` | Smoke-tests the memory builder and the coach (streaming and tools) against Gemini |
| `npm run google:auth` | One-time Google Health sign-in; prints `GOOGLE_REFRESH_TOKEN` for `.env.local` |
| `npm run google:dump` | Saves raw Google Health responses to `data/raw/` to check field mappings |

In the app, **Sync** pulls 30 days from Google Health (double-click it to load sample data), **⏩ +7 days** fast-forwards the memory clock, and **Reset** clears the demo.
