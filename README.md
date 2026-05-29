# GSE Report Generator

Applicazione web per la generazione automatica di **istruttorie economico-finanziarie GSE** relative agli extraprofitti ex art. 15-bis D.L. 4/2022.

## Funzionalità

- 📄 Upload di bilanci PDF (fino a 3 anni) + documento GSE
- 🤖 Estrazione automatica dati finanziari tramite AI (OpenRouter — **gratuito**)
- 📊 Calcolo KPI (EBITDA margin, ROE, Current Ratio, Debt/Equity)
- 📝 Generazione narrativa tecnica professionale in italiano
- ✅ Checklist documentale automatica
- 💾 Export in formato Markdown

## Modelli AI utilizzati

| Fase | Modello | Note |
|------|---------|------|
| Estrazione PDF | `meta-llama/llama-4-maverick:free` | 1M ctx, supporta PDF multimodal |
| Narrativa | `deepseek/deepseek-chat-v3-0324:free` | Ottimo per italiano tecnico |

Entrambi i modelli sono **gratuiti** su [OpenRouter](https://openrouter.ai) (limite: 200 req/giorno).

## Setup locale

```bash
npm install
cp .env.example .env
# Inserisci la tua VITE_OPENROUTER_API_KEY nel file .env
# Chiave gratuita da: https://openrouter.ai/settings/keys
npm run dev
```

## Deploy su GitHub Pages

1. Vai su [openrouter.ai/settings/keys](https://openrouter.ai/settings/keys) → crea una chiave API gratuita
2. Nel repo GitHub: **Settings → Secrets → Actions** → crea `VITE_OPENROUTER_API_KEY`
3. **Settings → Pages → Source: GitHub Actions**
4. Fai push su `main` — il workflow si attiva automaticamente

L'app sarà disponibile su: `https://riccard0000.github.io/gse-report-generator/`

## Limiti free tier OpenRouter

- 20 richieste/minuto
- 200 richieste/giorno (reset giornaliero)
- Nessuna carta di credito richiesta
- Per uso intensivo: aggiungere crediti su openrouter.ai
