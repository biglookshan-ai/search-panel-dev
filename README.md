# search-panel-dev — CineGearPro Search Admin

A small self-hosted admin for the CineGearPro pure-theme search engine:

1. **Metaobjects** — manage `cgp_badge` (custom tag badges), `cgp_sort_rule`
   (priority sort), `search_panel` (popular terms/products) in one UI. Saves go
   straight to the store via the Admin API and are live immediately.
2. **写入主题 (Apply to theme)** — pushes the search-engine *module* (the files in
   `theme-module/` + marker blocks) into a selected theme via the Admin Asset API.
   Re-runnable; replaces the content between the `CGP-SEARCH` markers each time.
3. **Boosts / 设置** — link to the Search & Discovery app for boosts/synonyms/filters.

> The search engine itself stays a pure-theme solution. This app only *manages* it.

## Setup (local)
```bash
npm install
cp .env.example .env   # fill in SHOPIFY_STORE + SHOPIFY_ADMIN_TOKEN
npm start              # http://localhost:3000
```

## Deploy on Railway
1. Push this repo to GitHub (`biglookshan-ai/search-panel-dev`).
2. Railway → New Project → Deploy from GitHub → pick this repo.
3. Add Variables (Railway → Variables):
   - `SHOPIFY_STORE` = `cinegearpro.myshopify.com`
   - `SHOPIFY_ADMIN_TOKEN` = custom-app Admin API token
   - `SHOPIFY_API_VERSION` = `2025-01`
   - `ADMIN_UI_PASSWORD` = a password (recommended, since the URL is public)
4. Railway auto-detects Node and runs `npm start`. Open the generated URL.

## The Admin API token
Create a **custom app** in the store admin (Settings → Apps and sales channels →
Develop apps), with Admin API scopes:
- `read_metaobjects`, `write_metaobjects`
- `read_themes`, `write_themes`

Install it, reveal the **Admin API access token**, put it in Railway Variables.
Never commit the token.

## ⚠️ Apply-to-theme safety
- Prefer an **unpublished/draft** theme. The UI warns before writing to the live theme.
- Always run **试运行 (dry run)** first to see the change list.
- Writing assets is reversible (re-publish a previous theme version), but treat the
  live theme with care.

## theme-module/
The search-engine files that get written into the theme. Update these (and
`config/injections.json`) when the search engine changes, redeploy, then re-Apply.

## Status / TODO
- Metaobject management: working (badge / sort_rule / search_panel).
- Apply: copies all `theme-module/**` files + injects `layout/theme.liquid`.
  Remaining shared-file injections (main-search, main-collection-product-grid,
  card-product, settings_schema) are added to `config/injections.json` once those
  files are marked with `CGP-SEARCH` markers in the theme.
