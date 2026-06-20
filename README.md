# search-panel-dev — CineGearPro Search Admin

Self-hosted admin for the CineGearPro pure-theme search engine.

1. **Metaobjects** — manage `cgp_badge`, `cgp_sort_rule`, `search_panel` in one UI
   (live immediately via the Admin API).
2. **写入主题 (Apply to theme)** — push the search-engine *module* into a chosen theme
   via the Admin Asset API. Re-runnable / idempotent.
3. **Boosts / 设置** — link to Search & Discovery for boosts/synonyms/filters.

Auth is **OAuth** (App ID + App Secret), so it can be a Partner / custom-distribution
app installed on the store. (A fixed `SHOPIFY_ADMIN_TOKEN` is also supported as an
override — set it to skip OAuth.)

## Create the app (Partner Dashboard)
1. partners.shopify.com → **Apps → Create app → Create app manually**.
2. App setup:
   - **App URL**: `https://<your-railway-url>`
   - **Allowed redirection URL(s)**: `https://<your-railway-url>/auth/callback`
3. **API credentials**: copy **Client ID (API key)** and **Client secret**.
4. **API scopes** (Configuration / requested scopes): `read_metaobjects`,
   `write_metaobjects`, `read_themes`, `write_themes`.
5. **Distribution → Custom distribution** → enter the store domain → generate the
   install link (you'll use it once after deploy).

## Deploy on Railway
1. Push to GitHub (`biglookshan-ai/search-panel-dev`) — done.
2. Railway → New Project → Deploy from GitHub → this repo.
3. (Recommended) add a **Volume** mounted at `/data` so the OAuth token survives
   redeploys.
4. **Variables**:
   - `SHOPIFY_STORE` = `cinegearpro.myshopify.com`
   - `SHOPIFY_API_KEY` = Client ID
   - `SHOPIFY_API_SECRET` = Client secret
   - `SHOPIFY_SCOPES` = `read_metaobjects,write_metaobjects,read_themes,write_themes`
   - `APP_URL` = the Railway URL (no trailing slash)
   - `SHOPIFY_API_VERSION` = `2026-04`
   - `DATA_DIR` = `/data` (if you mounted a volume)
   - `ADMIN_UI_PASSWORD` = a password
5. Deploy. Open the Railway URL → it'll prompt to **连接店铺 (Connect)** → that runs
   OAuth and stores the offline token. Then the UI works.

> Make sure the Railway App URL matches `APP_URL` and the redirect URL in the
> Partner app, or OAuth callback will fail.

## Local dev
```bash
npm install
cp .env.example .env   # fill API key/secret + APP_URL=http://localhost:3000
npm start              # http://localhost:3000  → open /auth once
```

## ⚠️ Apply-to-theme safety
- Prefer an **unpublished/draft** theme; the UI warns before writing to the live one.
- Run **试运行 (dry run)** first to see the change list.
- `main-search.liquid` + `main-collection-product-grid.liquid` are overwritten
  wholesale (the search engine owns those pages). `settings_schema.json` is
  JSON-merged (only our two groups). `theme.liquid` gets a marker block.
  `card-product.liquid` (native-card badges) is optional and NOT auto-applied.

## Updating the search engine
Edit `theme-module/**` (+ `config/injections.json` / `theme-module/settings-groups.json`),
redeploy, then re-run Apply.
