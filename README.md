# search-panel-dev — CineGearPro Search Admin (embedded)

An **embedded** Shopify admin app (opens inside Shopify admin) for the
CineGearPro pure-theme search engine:

1. **Metaobjects** — manage `cgp_badge`, `cgp_sort_rule`, `search_panel` (live).
2. **写入主题 (Apply to theme)** — push the search-engine *module* into a theme via
   the Admin Asset API (idempotent).
3. **Boosts / 设置** — link to Search & Discovery.

Auth = **App Bridge session token + OAuth token exchange** (no redirect-based OAuth).
Works with a Partner / custom-distribution app using **managed install**.

## Partner app config
- **embedded: true**
- **Use legacy install flow: false** (managed install)
- **App URL**: `https://<railway-url>`
- **Scopes**: `read_metaobjects, write_metaobjects, read_themes, write_themes`
- (Redirect URLs are not used by token exchange; leaving one set is harmless.)
- **Distribution → Custom distribution** → your store → install.

## Deploy on Railway
1. Push to GitHub (done) → Railway → Deploy from GitHub → this repo.
2. Add a **Volume** mounted at `/data` (so exchanged tokens persist across deploys).
3. **Variables**:
   - `SHOPIFY_API_KEY` = Client ID
   - `SHOPIFY_API_SECRET` = Client secret
   - `SHOPIFY_API_VERSION` = `2026-04`
   - `DATA_DIR` = `/data`
4. Set the Partner app's **App URL** to the Railway URL.
5. Open the app from **Shopify admin → Apps → Search Panel Dev** (it loads inside
   admin; App Bridge issues a session token, the server exchanges it for an Admin
   API token automatically). Opening the Railway URL directly will say "open from
   Shopify admin" — that's expected.

## Local dev
```bash
npm install
cp .env.example .env   # API key/secret
npm start
```
(You still need to open it via the Shopify admin to get a session token.)

## ⚠️ Apply-to-theme safety
- Prefer an unpublished/draft theme; the UI warns before writing the live one.
- Run **试运行 (dry run)** first.
- `main-search.liquid` + `main-collection-product-grid.liquid` overwritten wholesale;
  `settings_schema.json` JSON-merged (our 2 groups); `theme.liquid` gets a marker
  block; `card-product.liquid` optional (not auto-applied).

## Updating the search engine
Edit `theme-module/**` (+ `config/injections.json` / `theme-module/settings-groups.json`),
redeploy, re-run Apply.
