// Merge the search-engine module into a theme via the Admin Asset API:
//  1. copy every file under theme-module/<dir> as asset <dir>/<file>
//  2. inject marker blocks into the theme's own shared files (idempotent:
//     re-running replaces the block between the CGP-SEARCH markers).
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getAsset, putAsset } from './shopify.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MODULE_DIR = path.join(ROOT, 'theme-module');

async function loadInjections() {
  const raw = await fs.readFile(path.join(ROOT, 'config', 'injections.json'), 'utf8');
  return JSON.parse(raw);
}

async function listModuleFiles(dir) {
  const abs = path.join(MODULE_DIR, dir);
  let names = [];
  try { names = await fs.readdir(abs); } catch { return []; }
  return names.filter((n) => !n.startsWith('.'));
}

// Replace the block between CGP-SEARCH markers, or insert after the anchor line.
function injectBlock(content, blockLines, anchorAfter) {
  const lines = content.split('\n');
  const block = blockLines.join('\n');
  const startIdx = lines.findIndex((l) => l.includes('CGP-SEARCH START'));
  const endIdx = lines.findIndex((l) => l.includes('CGP-SEARCH END'));
  if (startIdx !== -1 && endIdx !== -1 && endIdx >= startIdx) {
    lines.splice(startIdx, endIdx - startIdx + 1, ...block.split('\n'));
    return { content: lines.join('\n'), mode: 'replaced' };
  }
  const anchorIdx = anchorAfter ? lines.findIndex((l) => l.includes(anchorAfter)) : -1;
  if (anchorIdx === -1) {
    throw new Error(`anchor not found ("${anchorAfter}") and no existing CGP-SEARCH markers`);
  }
  lines.splice(anchorIdx + 1, 0, ...block.split('\n'));
  return { content: lines.join('\n'), mode: 'inserted' };
}

export async function applyToTheme(ctx, themeId, { dryRun = false } = {}) {
  const cfg = await loadInjections();
  const log = [];

  // 1) copy module files
  for (const dir of cfg.copyDirs) {
    for (const name of await listModuleFiles(dir)) {
      const key = `${dir}/${name}`;
      const value = await fs.readFile(path.join(MODULE_DIR, dir, name), 'utf8');
      if (!dryRun) await putAsset(ctx, themeId, key, value);
      log.push(`copy  ${key}`);
    }
  }

  // 2) inject marker blocks into shared theme files
  for (const inj of cfg.injections) {
    const original = await getAsset(ctx, themeId, inj.file);
    if (original == null) { log.push(`SKIP  ${inj.file} (not found in theme)`); continue; }
    let working = original;

    // Remove any legacy inline CGP script (old themes defined window.CGP_BADGES /
    // CGP_CONFIG inline in theme.liquid; that now lives in the cgp-search-head
    // snippet, and a stale inline copy runs later and overrides it — e.g. without
    // the badge `link` field). The regex matches a single <script> block that
    // contains window.CGP_BADGES without spanning into other script tags.
    if (inj.stripLegacyCgpScript) {
      const before = working;
      working = working.replace(
        /[ \t]*<script\b[^>]*>(?:(?!<\/script>)[\s\S])*?window\.CGP_BADGES(?:(?!<\/script>)[\s\S])*?<\/script>[ \t]*\n?/gi,
        '');
      if (working !== before) log.push(`clean  ${inj.file} (removed legacy inline CGP script)`);
    }

    let mode = 'unchanged';
    if (working.includes('CGP-SEARCH START') || (inj.anchorAfter && working.includes(inj.anchorAfter))) {
      const res = injectBlock(working, inj.block, inj.anchorAfter);
      working = res.content; mode = res.mode;
    } else if (working === original) {
      log.push(`SKIP  ${inj.file} (anchor & markers missing)`);
      continue;
    }

    if (working !== original) {
      if (!dryRun) await putAsset(ctx, themeId, inj.file, working);
      log.push(`inject ${inj.file} (${mode})`);
    } else {
      log.push(`SKIP  ${inj.file} (no change)`);
    }
  }

  // 3) JSON-merge our settings groups into config/settings_schema.json
  if (cfg.settingsSchema) {
    const { file, groupsFile, replaceGroupNames } = cfg.settingsSchema;
    const ours = JSON.parse(await fs.readFile(path.join(MODULE_DIR, groupsFile), 'utf8'));
    const current = await getAsset(ctx, themeId, file);
    if (current == null) {
      log.push(`SKIP  ${file} (not found in theme)`);
    } else {
      const arr = JSON.parse(current);
      const drop = new Set(replaceGroupNames);
      const merged = arr.filter((g) => !drop.has(g && g.name)).concat(ours);
      const out = JSON.stringify(merged, null, 2);
      if (!dryRun && out !== current) await putAsset(ctx, themeId, file, out);
      log.push(`merge  ${file} (${ours.length} groups, ${ours.reduce((n, g) => n + (g.settings || []).length, 0)} settings)`);
    }
  }

  return { dryRun, count: log.length, log };
}
