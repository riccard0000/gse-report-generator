# GSE Report Generator

Applicazione web per la generazione automatica di **istruttorie economico-finanziarie GSE** relative agli extraprofitti ex art. 15-bis D.L. 4/2022.

## Funzionalità

- 📄 Upload di bilanci PDF (fino a 3 anni) + documento GSE
- 🤖 Estrazione automatica dati finanziari tramite Gemini AI
- 📊 Calcolo KPI (EBITDA margin, ROE, Current Ratio, Debt/Equity)
- 📝 Generazione narrativa tecnica professionale
- ✅ Checklist documentale automatica
- 💾 Export in formato Markdown

## Setup locale

```bash
npm install
cp .env.example .env
# Inserisci la tua VITE_GEMINI_API_KEY nel file .env
npm run dev
```

## Deploy su GitHub Pages

1. Vai su **Settings → Secrets → Actions** e crea il secret `VITE_GEMINI_API_KEY`
2. Vai su **Settings → Pages → Source: GitHub Actions**
3. Fai push su `main` — il workflow si attiva automaticamente

## Ottenere la chiave API

Visita [aistudio.google.com/apikey](https://aistudio.google.com/apikey) e crea una chiave nel progetto `gse-it-svil-doc-ai-0`.
