# GSE Report Generator

**Istruttoria Economico-Finanziaria GSE** — Extraprofitti art. 15-bis D.L. 4/2022

App React + Vite + TypeScript che analizza bilanci aziendali tramite AI e genera una relazione tecnica per la verifica della sostenibilità del debito GSE da extraprofitti.

## Stack

- **Frontend**: React 18 + Vite + TypeScript + Tailwind CSS
- **AI**: [GitHub Models](https://github.com/marketplace?type=models) — inferenza gratuita, zero infrastruttura
  - Estrazione PDF: `meta/llama-4-maverick` (1M ctx, multimodale)
  - Narrativa: `deepseek/deepseek-v3-0324` (testo professionale)
- **Hosting**: GitHub Pages (deploy automatico via GitHub Actions)

## Configurazione locale

1. Clona il repository
2. Crea un [GitHub Personal Access Token](https://github.com/settings/tokens) (nessun permesso specifico richiesto)
3. Copia `.env.example` in `.env` e inserisci il token:
   ```
   VITE_GITHUB_TOKEN=ghp_il_tuo_token
   ```
4. Installa e avvia:
   ```bash
   npm install
   npm run dev
   ```

## Deploy su GitHub Pages

Il deploy è automatico ad ogni push su `main` tramite GitHub Actions.

Prerequisito: impostare il secret `VITE_GITHUB_TOKEN` nel repository:
- **Settings → Secrets and variables → Actions → New repository secret**
- Nome: `VITE_GITHUB_TOKEN`
- Valore: il tuo GitHub Personal Access Token

Abilitare GitHub Pages:
- **Settings → Pages → Source: GitHub Actions**

## Rate limits GitHub Models (piano gratuito)

| Modello | Req/min | Req/giorno |
|---|---|---|
| Llama 4 Maverick | 10 | 50 |
| DeepSeek V3 | 10 | 50 |

Sufficiente per uso come dimostratore interno.
