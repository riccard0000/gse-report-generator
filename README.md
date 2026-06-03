# GSE Report Generator

Applicazione web per la generazione automatica di istruttorie economico-finanziarie per il **GSE (Gestore dei Servizi Energetici)** ai sensi dell'**art. 15-bis D.L. 4/2022** (extraprofitti energetici).

## Come funziona

1. **Carica** i bilanci aziendali (PDF, fino a 3 anni) e il documento GSE con l'importo residuo
2. **Analisi AI** estrae automaticamente tutti i dati finanziari rilevanti
3. **Verifica** e correggi i dati estratti prima di procedere
4. **Report** completo con narrativa tecnica e giudizio di sostenibilità del debito

## Architettura di Sicurezza

```
Browser (GitHub Pages)
    │  POST /  (solo dati, nessuna chiave API)
    ▼
Cloudflare Worker (proxy gratuito)
    │  Aggiunge Authorization: Bearer sk-or-...
    │  (chiave cifrata come Secret nel Worker)
    ▼
OpenRouter API
```

La chiave API **non è mai nel codice frontend** né nei secret di build GitHub Actions.

## Setup Completo

### 1. Deploy del Cloudflare Worker (proxy)

```bash
# Installa Wrangler CLI
npm install -g wrangler

# Login a Cloudflare (account gratuito)
wrangler login

# Entra nella cartella worker
cd worker

# Aggiungi la chiave OpenRouter come Secret cifrato
wrangler secret put OPENROUTER_API_KEY
# → Incolla la tua chiave OpenRouter (da https://openrouter.ai/keys)

# Deploy del Worker
wrangler deploy
# → Annota l'URL: https://gse-proxy.TUONOME.workers.dev
```

### 2. Configura il Secret in GitHub Actions

Vai su **GitHub → Settings → Secrets and variables → Actions** e aggiungi:

| Nome | Valore |
|------|--------|
| `VITE_PROXY_URL` | `https://gse-proxy.TUONOME.workers.dev` |

### 3. Sviluppo locale

```bash
# Terminale 1 — avvia il Worker in locale
cd worker && wrangler dev
# → Worker disponibile su http://localhost:8787

# Terminale 2 — avvia il frontend
cp .env.example .env
# VITE_PROXY_URL=http://localhost:8787 (già precompilato in .env.example)
npm install
npm run dev
```

## Stack Tecnologico

| Layer | Tecnologia |
|-------|------------|
| Frontend | React 18 + TypeScript |
| Build | Vite |
| Stile | Tailwind CSS |
| PDF Parsing | pdfjs-dist |
| AI | OpenRouter (NVIDIA Nemotron) |
| Proxy | Cloudflare Workers (gratuito) |
| Hosting | GitHub Pages |
