# GSE Report Generator

Applicazione React + Vite per generare report di istruttoria GSE (Extraprofitti art. 15-bis D.L. 4/2022).
Deploy automatico su **GitHub Pages** tramite GitHub Actions.

## Setup locale

```bash
npm install
cp .env.example .env.local
# Inserisci la chiave in .env.local
npm run dev
```

## Deploy su GitHub Pages

1. **Settings → Secrets → Actions** → aggiungi `VITE_GEMINI_API_KEY`
2. **Settings → Pages → Source: GitHub Actions**
3. Ogni push su `main` avvia il deploy automatico

## Stack

- React 18 + TypeScript + Tailwind CSS
- Vite 6 + GitHub Actions CI/CD
- Gemini 2.5 Flash (Google AI Studio API)
- pdfjs-dist (PDF viewer con highlight)
