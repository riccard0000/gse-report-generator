# GSE Proxy — Cloudflare Worker

Questo Worker fa da proxy tra il frontend React (GitHub Pages) e l'API OpenRouter,
agggiungendo la chiave API server-side per risolvere il problema CORS.

## Deploy dalla Dashboard Cloudflare (metodo visuale)

1. Vai su https://dash.cloudflare.com → **Workers & Pages** → **Create** → **Create Worker**
2. Dai il nome `gse-proxy` e clicca **Deploy**
3. Clicca **Edit code**, cancella tutto e incolla il contenuto di `index.js`
4. Clicca **Deploy**
5. Vai su **Settings** → **Variables and Secrets** → **Add**
   - Type: **Secret**
   - Variable name: `OPENROUTER_API_KEY`
   - Value: la tua chiave OpenRouter (da https://openrouter.ai/keys)
6. Copia l'URL del Worker: `https://gse-proxy.TUONOME.workers.dev`

## Dopo il deploy del Worker

Aggiungi l'URL come secret in GitHub Actions:
- Vai su: https://github.com/riccard0000/gse-report-generator/settings/secrets/actions
- Clicca **New repository secret**
- Nome: `VITE_PROXY_URL`
- Valore: `https://gse-proxy.TUONOME.workers.dev`

Poi vai su https://github.com/riccard0000/gse-report-generator/actions
e clicca **Run workflow** per ribuilare il frontend con il nuovo URL.

## Deploy da terminale (alternativa)

```bash
cd worker
npm install
wrangler login
wrangler secret put OPENROUTER_API_KEY
wrangler deploy
```
