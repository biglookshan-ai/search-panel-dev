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

export async function applyToTheme(themeId, { dryRun = false } = {}) {
  const cfg = await loadInjections();
  const log = [];

  // 1) copy module files
  for (const dir of cfg.copyDirs) {
    for (const name of await listModuleFiles(dir)) {
      const key = `${dir}/${name}`;
      const value = await fs.readFile(path.join(MODULE_DIR, dir, name), 'utf8');
      if (!dryRun) await putAsset(themeId, key, value);
      log.push(`copy  ${key}`);
    }
  }

  // 2) inject into shared theme files
  for (const inj of cfg.injections) {
    const current = await getAsset(themeId, inj.file);
    if (current == null) { log.push(`SKIP  ${inj.file} (not found in theme)`); continue; }
    if (current.includes('CGP-SEARCH START') || (inj.anchorAfter && current.includes(inj.anchorAfter))) {
      const { content, mode } = injectBlock(current, inj.block, inj.anchorAfter);
      if (!dryRun && content !== current) await putAsset(themeId, inj.file, content);
      log.push(`inject ${inj.file} (${mode})`);
    } else {
      log.push(`SKIP  ${inj.file} (anchor & markers missing)`);
    }
  }

  return { dryRun, count: log.length, log };
}
