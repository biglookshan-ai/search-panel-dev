// Shopify OAuth (authorization code grant) using App ID (API key) + App Secret.
// Single-store, offline access token. Lets the app be a Partner/custom-distribution
// app instead of a store-admin token.
import crypto from 'node:crypto';
import { saveToken } from './token-store.js';

const KEY = process.env.SHOPIFY_API_KEY;
const SECRET = process.env.SHOPIFY_API_SECRET;
const SCOPES = process.env.SHOPIFY_SCOPES || 'read_metaobjects,write_metaobjects,read_themes,write_themes';
const APP_URL = (process.env.APP_URL || '').replace(/\/$/, '');
const DEFAULT_SHOP = process.env.SHOPIFY_STORE;

export function oauthConfigured() {
  return !!(KEY && SECRET && APP_URL);
}

function cookie(name, value, maxAge) {
  return `${name}=${value}; HttpOnly; Path=/; Max-Age=${maxAge}; SameSite=Lax`;
}

export function authStart(req, res) {
  if (!oauthConfigured()) return res.status(500).send('OAuth not configured (need SHOPIFY_API_KEY, SHOPIFY_API_SECRET, APP_URL).');
  const shop = (req.query.shop || DEFAULT_SHOP || '').trim();
  if (!/^[a-zA-Z0-9-]+\.myshopify\.com$/.test(shop)) return res.status(400).send('Missing/invalid shop (?shop=xxx.myshopify.com)');
  const state = crypto.randomBytes(16).toString('hex');
  res.setHeader('Set-Cookie', cookie('oauth_state', state, 600));
  const redirect = `${APP_URL}/auth/callback`;
  const url = `https://${shop}/admin/oauth/authorize?client_id=${encodeURIComponent(KEY)}` +
    `&scope=${encodeURIComponent(SCOPES)}&redirect_uri=${encodeURIComponent(redirect)}&state=${state}`;
  res.redirect(url);
}

export async function authCallback(req, res) {
  try {
    const { shop, hmac, code, state } = req.query;
    if (!shop || !hmac || !code) return res.status(400).send('Missing params');

    const cookieState = (req.headers.cookie || '').match(/oauth_state=([^;]+)/)?.[1];
    if (!state || state !== cookieState) return res.status(400).send('State mismatch');

    // verify HMAC over the query (excluding hmac/signature), keys sorted
    const params = { ...req.query };
    delete params.hmac; delete params.signature;
    const msg = Object.keys(params).sort().map((k) => `${k}=${params[k]}`).join('&');
    const digest = crypto.createHmac('sha256', SECRET).update(msg).digest('hex');
    if (!crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(hmac))) {
      return res.status(400).send('HMAC validation failed');
    }

    const r = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: KEY, client_secret: SECRET, code }),
    });
    const j = await r.json();
    if (!j.access_token) return res.status(500).send('Token exchange failed: ' + JSON.stringify(j));

    saveToken(j.access_token, shop);
    res.setHeader('Set-Cookie', cookie('oauth_state', '', 0));
    res.redirect('/');
  } catch (e) {
    res.status(500).send('OAuth error: ' + e.message);
  }
}
