const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
let STORE = '';

async function sessionToken() {
  if (!window.shopify || !window.shopify.idToken) throw new Error('请在 Shopify 后台里打开此 app(嵌入式)');
  return await window.shopify.idToken();
}
async function api(method, path, body) {
  const t = await sessionToken();
  const res = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + t },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || res.statusText);
  return json;
}
function decodeJwtPayload(t) {
  let s = t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
  s += '='.repeat((4 - (s.length % 4)) % 4);
  return JSON.parse(atob(s));
}

function toast(msg, ok = true) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'toast ' + (ok ? 'ok' : 'err');
  t.hidden = false;
  setTimeout(() => { t.hidden = true; }, 3200);
}

// ---- tabs ----
document.querySelectorAll('.tab').forEach((b) => b.addEventListener('click', () => {
  document.querySelectorAll('.tab').forEach((x) => x.classList.toggle('is-active', x === b));
  document.querySelectorAll('.panel').forEach((p) => p.classList.toggle('is-active', p.id === 'tab-' + b.dataset.tab));
  if (b.dataset.tab === 'apply') loadThemes();
}));
document.querySelectorAll('.subtab').forEach((b) => b.addEventListener('click', () => {
  document.querySelectorAll('.subtab').forEach((x) => x.classList.toggle('is-active', x === b));
  loadType(b.dataset.type);
}));

// ---- field rendering ----
// field = { key, name, kind }  kind: bool | list | color | ref | text
function fieldInput(field, value) {
  const label = esc(field.name || field.key);
  const key = field.key;
  if (field.kind === 'bool') {
    return `<label class="inline"><input type="checkbox" data-key="${key}" data-kind="bool" ${value === 'true' ? 'checked' : ''}/> ${label}</label>`;
  }
  if (field.kind === 'list') {
    let lines = '';
    try { lines = (JSON.parse(value || '[]') || []).join('\n'); } catch { lines = value || ''; }
    return `<label>${label} <span class="hint">(每行一个)</span>
      <textarea data-key="${key}" data-kind="list" rows="3">${esc(lines)}</textarea></label>`;
  }
  if (field.kind === 'color') {
    const v = value || '#000000';
    return `<label>${label}
      <span class="colorrow"><input type="color" value="${esc(v)}" oninput="this.nextElementSibling.value=this.value"/>
      <input type="text" data-key="${key}" data-kind="text" value="${esc(v)}"/></span></label>`;
  }
  if (field.kind === 'ref') {
    return `<label>${label} <span class="hint">(引用/图片:gid://… 多个用逗号或每行一个;建议在 Shopify 后台设)</span>
      <input type="text" data-key="${key}" data-kind="text" value="${esc(value || '')}" placeholder="gid://..."/></label>`;
  }
  return `<label>${label}<input type="text" data-key="${key}" data-kind="text" value="${esc(value || '')}"/></label>`;
}

// Shopify "Link" field type stores a JSON object {url,text}; the UI edits a
// plain URL string, so we unwrap on display and re-wrap on save.
function linkUrl(v) {
  if (!v) return '';
  try { const o = JSON.parse(v); if (o && typeof o === 'object' && o.url) return o.url; } catch (e) {}
  return v;
}

function collectFields(formEl) {
  const fields = {};
  formEl.querySelectorAll('[data-key]').forEach((el) => {
    const kind = el.dataset.kind;
    if (kind === 'bool') fields[el.dataset.key] = el.checked ? 'true' : 'false';
    else if (kind === 'list') {
      const arr = el.value.split('\n').map((x) => x.trim()).filter(Boolean);
      fields[el.dataset.key] = JSON.stringify(arr);
    } else fields[el.dataset.key] = el.value;
  });
  return fields;
}

let FIELDS = [], TYPE = '';

async function loadType(type) {
  TYPE = type;
  const body = $('#meta-body');
  body.innerHTML = '<p class="muted">加载中…</p>';
  try {
    const { entries, fields } = await api('GET', '/api/metaobjects/' + type);
    FIELDS = fields || [];
    if (type === 'cgp_badge') return renderBadges(entries, 'cgp_badge');
    if (type === 'cgp_status_badge') return renderBadges(entries, 'cgp_status_badge');
    if (type === 'cgp_sort_rule') return renderSortRules(entries);
    if (type === 'search_panel') return renderSearchPanel(entries);
    if (!FIELDS.length && !entries.length) {
      body.innerHTML = '<p class="muted">这个类型还没有条目,也读不到字段。请先在 Shopify 后台给它加一条,再回来这里管理。</p>';
      return;
    }
    let html = `<div class="rows">`;
    entries.forEach((e) => { html += entryCard(FIELDS, e); });
    html += `</div><button class="btn btn-primary" id="add-entry">+ 新增</button>`;
    body.innerHTML = html;
    body.querySelectorAll('[data-entry]').forEach(bindEntry);
    $('#add-entry').addEventListener('click', () => {
      const wrap = document.createElement('div');
      wrap.innerHTML = entryCard(FIELDS, { id: '', handle: '', fields: {} }, true);
      $('.rows').appendChild(wrap.firstElementChild);
      bindEntry($('.rows').lastElementChild);
    });
  } catch (e) { body.innerHTML = `<p class="err">${esc(e.message)}</p>`; }
}

function entryCard(fields, entry, isNew = false) {
  const inner = fields.map((f) => fieldInput(f, entry.fields[f.key])).join('');
  const title = isNew ? '新条目' : esc(entry.displayName || entry.handle || entry.id);
  return `<form class="entry" data-entry data-id="${esc(entry.id)}">
    <div class="entry-head"><b>${title}</b></div>
    ${inner}
    <div class="entry-actions">
      <button type="button" class="btn btn-primary" data-act="save">${isNew ? '创建' : '保存'}</button>
      ${entry.id ? '<button type="button" class="btn btn-danger" data-act="del">删除</button>' : ''}
    </div>
  </form>`;
}

function bindEntry(form) {
  form.querySelector('[data-act="save"]').addEventListener('click', async () => {
    try {
      const fields = collectFields(form);
      const id = form.dataset.id;
      if (id) await api('PUT', '/api/metaobjects/' + TYPE, { id, fields });
      else await api('POST', '/api/metaobjects/' + TYPE, { fields });
      toast('已保存 ✓');
      loadType(TYPE);
    } catch (e) { toast(e.message, false); }
  });
  const del = form.querySelector('[data-act="del"]');
  if (del) del.addEventListener('click', async () => {
    if (!confirm('确定删除这个条目?')) return;
    try { await api('DELETE', '/api/metaobjects/' + TYPE, { id: form.dataset.id }); toast('已删除 ✓'); loadType(TYPE); }
    catch (e) { toast(e.message, false); }
  });
}

// ---- cgp_badge + cgp_status_badge: list view + quick enable toggle + detail ----
// cgp_badge = custom badges below the image (left/right, optional link/image).
// cgp_status_badge = product-status badges over the image bottom-right (text only).
const BADGE_POS = ['left', 'right'];

// Load all store product tags once into a shared <datalist> for tag pickers.
let TAGS_LOADED = false;
async function loadTags() {
  if (TAGS_LOADED) return;
  TAGS_LOADED = true;
  let dl = document.getElementById('all-tags');
  if (!dl) { dl = document.createElement('datalist'); dl.id = 'all-tags'; document.body.appendChild(dl); }
  try {
    const { tags } = await api('GET', '/api/product-tags');
    dl.innerHTML = (tags || []).map((t) => `<option value="${esc(t)}"></option>`).join('');
  } catch (e) { TAGS_LOADED = false; }
}

function renderBadges(entries, type) {
  type = type || 'cgp_badge';
  loadTags();
  const body = $('#meta-body');
  body.innerHTML = '<div class="list"></div><button class="btn btn-primary" id="add-entry">+ 新增角标</button>';
  const list = $('.list');
  entries.forEach((e) => list.appendChild(badgeCardEl(e, false, type)));
  $('#add-entry').addEventListener('click', () => {
    const init = type === 'cgp_status_badge'
      ? { enabled: 'true', background: '#1c222d', text_color: '#ffffff' }
      : { position: 'left', enabled: 'true', background: '#1c222d', text_color: '#ffffff' };
    const card = badgeCardEl({ id: '', fields: init }, true, type);
    list.appendChild(card);
    card.querySelector('[data-edit]').click();
  });
}

function badgeCardEl(entry, isNew = false, type = 'cgp_badge') {
  const f = entry.fields || {};
  const bg = f.background || '#1c222d', tc = f.text_color || '#ffffff';
  const label = f.label || f.tag || '(角标)';
  const on = f.enabled !== 'false';
  const meta = type === 'cgp_status_badge' ? '图片右下角' : (/right/i.test(f.position || '') ? '右' : '左');
  const el = document.createElement('div');
  el.className = 'card';
  el.dataset.id = entry.id || '';
  el.innerHTML = `
    <div class="summary">
      <span class="swatch" style="background:${esc(bg)};color:${esc(tc)}">${esc(label)}</span>
      <span class="grow"><b>${esc(f.tag || (isNew ? '新角标' : '(未设 tag)'))}</b> <span class="muted">· ${esc(meta)}</span></span>
      <label class="inline"><input type="checkbox" data-toggle ${on ? 'checked' : ''}/> 启用</label>
      <button type="button" class="btn btn-sm" data-edit>${isNew ? '展开' : '编辑'}</button>
    </div>
    <div class="detail" data-detail hidden></div>`;
  const toggle = el.querySelector('[data-toggle]');
  toggle.addEventListener('change', async () => {
    if (!el.dataset.id) return; // unsaved new row
    try { await api('PUT', '/api/metaobjects/' + type, { id: el.dataset.id, fields: { enabled: toggle.checked ? 'true' : 'false' } }); toast(toggle.checked ? '已启用' : '已停用'); }
    catch (e) { toggle.checked = !toggle.checked; toast(e.message, false); }
  });
  const detail = el.querySelector('[data-detail]');
  const editBtn = el.querySelector('[data-edit]');
  editBtn.addEventListener('click', () => {
    if (detail.hidden) {
      if (!detail.dataset.loaded) { detail.innerHTML = badgeDetailHtml(entry, type); detail.dataset.loaded = '1'; bindBadgeDetail(el, type); }
      detail.hidden = false;
    } else detail.hidden = true;
    editBtn.textContent = detail.hidden ? '编辑' : '关闭';
    editBtn.classList.toggle('btn-primary', !detail.hidden);
  });
  return el;
}

function badgeDetailHtml(entry, type) {
  const f = entry.fields || {};
  const isStatus = type === 'cgp_status_badge';
  const sel = BADGE_POS.map((p) => `<option value="${p}" ${(/right/i.test(f.position || '') ? 'right' : 'left') === p ? 'selected' : ''}>${p === 'left' ? '左 left' : '右 right'}</option>`).join('');
  const colorRow = (key, def) => `<span class="colorrow"><input type="color" value="${esc(f[key] || def)}" oninput="this.nextElementSibling.value=this.value"/><input type="text" data-key="${key}" data-kind="text" value="${esc(f[key] || def)}"/></span>`;
  return `
    ${isStatus ? '<p class="hint">产品状态角标:按 tag 匹配,显示在图片右下角(叠在图上)。</p>' : ''}
    <label>Tag <span class="hint">(产品标签,用于匹配;可下拉选或自己输入)</span><input type="text" data-key="tag" data-kind="text" list="all-tags" value="${esc(f.tag || '')}"/></label>
    <label>Label <span class="hint">(显示文字)</span><input type="text" data-key="label" data-kind="text" value="${esc(f.label || '')}"/></label>
    ${isStatus ? '' : `<label>Image <span class="hint">(图片 gid,留空用文字)</span><input type="text" data-key="image" data-kind="text" value="${esc(f.image || '')}"/></label>`}
    <label>Background 背景色 ${colorRow('background', '#1c222d')}</label>
    <label>Text color 文字色 ${colorRow('text_color', '#ffffff')}</label>
    ${isStatus ? '' : `<label>Position 位置 <span class="hint">(图片下方:左 / 右)</span><select data-key="position" data-kind="text">${sel}</select></label>`}
    ${isStatus ? '' : `<label>Link 链接 <span class="hint">(字段用 URL 类型;填了才可点击跳转,留空则为纯展示徽章)</span><input type="text" data-key="link" data-kind="text" value="${esc(linkUrl(f.link))}" placeholder="https://...../collections/..."/></label>`}
    <label class="inline"><input type="checkbox" data-key="enabled" data-kind="bool" ${f.enabled !== 'false' ? 'checked' : ''}/> Enabled 启用</label>
    <div class="entry-actions">
      <button type="button" class="btn btn-primary" data-act="save">保存</button>
      ${entry.id ? '<button type="button" class="btn btn-danger" data-act="del">删除</button>' : ''}
    </div>`;
}

function bindBadgeDetail(card, type) {
  type = type || 'cgp_badge';
  const detail = card.querySelector('[data-detail]');
  detail.querySelector('[data-act="save"]').addEventListener('click', async () => {
    try {
      const fields = collectFields(detail);
      const id = card.dataset.id;
      if (id) await api('PUT', '/api/metaobjects/' + type, { id, fields });
      else await api('POST', '/api/metaobjects/' + type, { fields });
      toast('已保存 ✓');
      loadType(type);
    } catch (e) { toast(e.message, false); }
  });
  const del = detail.querySelector('[data-act="del"]');
  if (del) del.addEventListener('click', async () => {
    if (!confirm('确定删除这个角标?')) return;
    try { await api('DELETE', '/api/metaobjects/' + type, { id: card.dataset.id }); toast('已删除 ✓'); loadType(type); }
    catch (e) { toast(e.message, false); }
  });
}

// ---- cgp_sort_rule: list + filter + sort + expandable edit ----
function parseList(v) { try { const a = JSON.parse(v || '[]'); return Array.isArray(a) ? a : []; } catch { return []; } }
function joinPreview(arr, max = 4) {
  const a = arr.slice(0, max).join(', ');
  return arr.length > max ? a + ` … (+${arr.length - max})` : a;
}

let SORT_RULES = [], SR_FILTER = '', SR_ORDER = 'recent';

function renderSortRules(entries) {
  SORT_RULES = entries.map((e) => ({
    id: e.id,
    keywords: parseList(e.fields.keywords),
    types: parseList(e.fields.priority_types),
  }));
  const body = $('#meta-body');
  body.innerHTML = `
    <div class="toolbar">
      <input type="search" id="sr-filter" placeholder="搜索关键词或类型…" value="${esc(SR_FILTER)}" />
      <select id="sr-order">
        <option value="recent">默认顺序</option>
        <option value="alpha">关键词 A-Z</option>
        <option value="kw_desc">关键词数 多→少</option>
        <option value="type_desc">类型数 多→少</option>
      </select>
    </div>
    <div class="list" id="sr-list"></div>
    <button class="btn btn-primary" id="add-entry">+ 新增规则</button>`;
  $('#sr-order').value = SR_ORDER;
  $('#sr-filter').addEventListener('input', (e) => { SR_FILTER = e.target.value; paintSortRules(); });
  $('#sr-order').addEventListener('change', (e) => { SR_ORDER = e.target.value; paintSortRules(); });
  $('#add-entry').addEventListener('click', () => {
    const row = sortRuleCardEl({ id: '', keywords: [], types: [] }, true);
    $('#sr-list').prepend(row);
    row.querySelector('[data-edit]').click();
  });
  paintSortRules();
}

function paintSortRules() {
  const f = SR_FILTER.trim().toLowerCase();
  let view = SORT_RULES.filter((r) =>
    !f || r.keywords.some((k) => k.toLowerCase().includes(f)) || r.types.some((t) => t.toLowerCase().includes(f))
  );
  if (SR_ORDER === 'alpha') view = view.slice().sort((a, b) => (a.keywords[0] || '').localeCompare(b.keywords[0] || ''));
  else if (SR_ORDER === 'kw_desc') view = view.slice().sort((a, b) => b.keywords.length - a.keywords.length);
  else if (SR_ORDER === 'type_desc') view = view.slice().sort((a, b) => b.types.length - a.types.length);
  const list = $('#sr-list');
  list.innerHTML = '';
  if (!view.length) { list.innerHTML = '<p class="muted">没有匹配的规则。</p>'; return; }
  view.forEach((r) => list.appendChild(sortRuleCardEl(r)));
}

function sortRuleCardEl(rule, isNew = false) {
  const el = document.createElement('div');
  el.className = 'card';
  el.dataset.id = rule.id || '';
  el.innerHTML = `
    <div class="summary">
      <span class="grow">
        <b>关键词:</b> ${esc(joinPreview(rule.keywords) || '(空)')}
        <br><span class="muted"><b>类型:</b> ${esc(joinPreview(rule.types) || '(空)')}</span>
      </span>
      <button type="button" class="btn btn-sm" data-edit>${isNew ? '展开' : '编辑'}</button>
    </div>
    <div class="detail" data-detail hidden></div>`;
  const detail = el.querySelector('[data-detail]');
  const btn = el.querySelector('[data-edit]');
  btn.addEventListener('click', () => {
    if (detail.hidden) {
      if (!detail.dataset.loaded) { detail.innerHTML = sortRuleDetailHtml(rule); detail.dataset.loaded = '1'; bindSortRuleDetail(el); }
      detail.hidden = false;
    } else detail.hidden = true;
    btn.textContent = detail.hidden ? '编辑' : '关闭';
    btn.classList.toggle('btn-primary', !detail.hidden);
  });
  return el;
}

function sortRuleDetailHtml(rule) {
  return `
    <label>Keywords 关键词 <span class="hint">(每行一个,匹配任意一个即应用此规则)</span>
      <textarea data-key="keywords" data-kind="list" rows="4">${esc(rule.keywords.join('\n'))}</textarea></label>
    <label>Priority types 优先类型 <span class="hint">(每行一个,产品类型按这个顺序排在前面)</span>
      <textarea data-key="priority_types" data-kind="list" rows="4">${esc(rule.types.join('\n'))}</textarea></label>
    <div class="entry-actions">
      <button type="button" class="btn btn-primary" data-act="save">保存</button>
      ${rule.id ? '<button type="button" class="btn btn-danger" data-act="del">删除</button>' : ''}
    </div>`;
}

function bindSortRuleDetail(card) {
  const detail = card.querySelector('[data-detail]');
  detail.querySelector('[data-act="save"]').addEventListener('click', async () => {
    try {
      const fields = collectFields(detail);
      const id = card.dataset.id;
      if (id) await api('PUT', '/api/metaobjects/cgp_sort_rule', { id, fields });
      else await api('POST', '/api/metaobjects/cgp_sort_rule', { fields });
      toast('已保存 ✓');
      loadType('cgp_sort_rule');
    } catch (e) { toast(e.message, false); }
  });
  const del = detail.querySelector('[data-act="del"]');
  if (del) del.addEventListener('click', async () => {
    if (!confirm('确定删除这条排序规则?')) return;
    try { await api('DELETE', '/api/metaobjects/cgp_sort_rule', { id: card.dataset.id }); toast('已删除 ✓'); loadType('cgp_sort_rule'); }
    catch (e) { toast(e.message, false); }
  });
}

// ---- search_panel: per-field modules, save independently ----
function renderSearchPanel(entries) {
  const body = $('#meta-body');
  if (!entries.length) {
    body.innerHTML = '<p class="muted">还没有 search_panel 条目。请在 Shopify 后台新建一条(handle 通常为 main)。</p>';
    return;
  }
  body.innerHTML = '';
  entries.forEach((e) => body.appendChild(searchPanelEl(e)));
}

function searchPanelEl(entry) {
  const f = entry.fields || {};
  const wrap = document.createElement('div');
  wrap.className = 'panel-entry';
  const h = document.createElement('h3');
  h.className = 'panel-title';
  h.textContent = entry.handle || entry.id;
  wrap.appendChild(h);

  wrap.appendChild(simpleModuleEl(entry.id, 'Popular Terms 热门搜索词', joinPreview(parseList(f.popular_terms), 8) || '(空)',
    `<label>热门搜索词 <span class="hint">(每行一个,搜索框聚焦时显示)</span>
      <textarea data-key="popular_terms" data-kind="list" rows="6">${esc(parseList(f.popular_terms).join('\n'))}</textarea></label>`));

  wrap.appendChild(refModuleEl(entry.id, 'featured_products', 'Featured Products 热门产品', parseList(f.featured_products), 'product', 'featured_products_config', f.featured_products_config));
  wrap.appendChild(refModuleEl(entry.id, 'featured_collections', 'Featured Collections 热门集合', parseList(f.featured_collections), 'collection', 'featured_collections_config', f.featured_collections_config));

  wrap.appendChild(simpleModuleEl(entry.id, 'Banner Image 横幅图片', f.banner_image || '(无)',
    `<label>Banner image GID <span class="hint">(gid://shopify/MediaImage/…;建议在 Shopify 后台选)</span>
      <input type="text" data-key="banner_image" data-kind="text" value="${esc(f.banner_image || '')}"/></label>`));
  wrap.appendChild(simpleModuleEl(entry.id, 'Banner Link 横幅链接', f.banner_link || '(无)',
    `<label>Banner link<input type="text" data-key="banner_link" data-kind="text" value="${esc(f.banner_link || '')}"/></label>`));
  wrap.appendChild(simpleModuleEl(entry.id, 'Banner Alt 替代文字', f.banner_alt || '(无)',
    `<label>Banner alt<input type="text" data-key="banner_alt" data-kind="text" value="${esc(f.banner_alt || '')}"/></label>`));
  return wrap;
}

function moduleToggle(card) {
  const detail = card.querySelector('[data-detail]');
  const btn = card.querySelector('[data-edit]');
  btn.addEventListener('click', () => {
    detail.hidden = !detail.hidden;
    btn.textContent = detail.hidden ? '编辑' : '关闭';
    btn.classList.toggle('btn-primary', !detail.hidden);
    if (!detail.hidden && card._onOpen && !card._opened) { card._opened = true; card._onOpen(); }
  });
}

function simpleModuleEl(entryId, title, preview, detailHtml) {
  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML = `
    <div class="summary"><span class="grow"><b>${esc(title)}</b> <span class="muted">· ${esc(String(preview))}</span></span>
      <button type="button" class="btn btn-sm" data-edit>编辑</button></div>
    <div class="detail" data-detail hidden>${detailHtml}
      <div class="entry-actions"><button type="button" class="btn btn-primary" data-act="save">保存</button></div></div>`;
  moduleToggle(card);
  card.querySelector('[data-act="save"]').addEventListener('click', async () => {
    try { await api('PUT', '/api/metaobjects/search_panel', { id: entryId, fields: collectFields(card.querySelector('[data-detail]')) }); toast('已保存 ✓'); }
    catch (e) { toast(e.message, false); }
  });
  return card;
}

// Picker module for list-of-references (products / collections): chips with
// image+name, reorder, remove, and a search-to-add box (Shopify-native style).
function parseCfg(v) { try { const c = JSON.parse(v || '{}'); return { refreshSec: +c.refreshSec || 0, pin: +c.pin || 0 }; } catch { return { refreshSec: 0, pin: 0 }; } }
function refreshUnit(s) { if (!s) return 0; if (s % 86400 === 0) return 86400; if (s % 3600 === 0) return 3600; return 60; }
function refreshNum(s) { const u = refreshUnit(s); return u ? Math.round(s / u) : 0; }

function refModuleEl(entryId, key, title, initialGids, kind, cfgField, cfgValue) {
  let gids = (initialGids || []).slice();
  const meta = {};
  const selected = new Set();
  let dragGid = null;
  const cfg = parseCfg(cfgValue);
  const pinned = new Set(gids.slice(0, cfg.pin)); // first `pin` items are pinned
  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML = `
    <div class="summary"><span class="grow"><b>${esc(title)}</b> <span class="muted" data-count>· ${gids.length} 个</span></span>
      <button type="button" class="btn btn-sm" data-edit>编辑</button></div>
    <div class="detail" data-detail hidden>
      <div class="picker"><input type="search" data-search placeholder="搜索${kind === 'product' ? '产品' : '集合'}添加…"/>
        <div class="picker-results" data-results hidden></div></div>
      <div class="refresh-row">
        <span>随机刷新间隔:</span>
        <input type="number" min="0" data-rn style="width:70px"/>
        <select data-runit>
          <option value="0">立即(每次打开都换)</option>
          <option value="60">分钟</option>
          <option value="3600">小时</option>
          <option value="86400">天</option>
        </select>
        <span class="hint">📌 置顶项不参与随机,始终排在最前</span>
      </div>
      <div class="bulkbar" data-bulk hidden></div>
      <div class="chips" data-chips></div>
      <div class="entry-actions"><button type="button" class="btn btn-primary" data-act="save">保存</button></div>
    </div>`;
  const chipsEl = card.querySelector('[data-chips]');
  const countEl = card.querySelector('[data-count]');
  const resultsEl = card.querySelector('[data-results]');
  const searchEl = card.querySelector('[data-search]');
  const bulkEl = card.querySelector('[data-bulk]');
  card.querySelector('[data-runit]').value = String(refreshUnit(cfg.refreshSec));
  card.querySelector('[data-rn]').value = String(refreshNum(cfg.refreshSec));

  // Move the whole selected group up/down by one relative to unselected items.
  function moveSelected(dir) {
    const sel = gids.filter((g) => selected.has(g));
    if (!sel.length) return;
    const rest = gids.filter((g) => !selected.has(g));
    const firstPos = gids.findIndex((g) => selected.has(g));
    const unselBefore = gids.slice(0, firstPos).filter((g) => !selected.has(g)).length;
    const at = Math.max(0, Math.min(rest.length, unselBefore + (dir === 'up' ? -1 : 1)));
    rest.splice(at, 0, ...sel);
    gids = rest;
    paint();
  }

  function paintBulk() {
    if (!selected.size) { bulkEl.hidden = true; bulkEl.innerHTML = ''; return; }
    bulkEl.hidden = false;
    bulkEl.innerHTML = `<span>已选 ${selected.size} 项</span>
      <button type="button" class="btn btn-sm" data-bup>↑ 上移</button>
      <button type="button" class="btn btn-sm" data-bdown>↓ 下移</button>
      <button type="button" class="btn btn-sm btn-danger" data-bdel>删除选中</button>
      <button type="button" class="btn btn-sm" data-bclr>取消选择</button>`;
    bulkEl.querySelector('[data-bup]').onclick = () => moveSelected('up');
    bulkEl.querySelector('[data-bdown]').onclick = () => moveSelected('down');
    bulkEl.querySelector('[data-bdel]').onclick = () => { gids = gids.filter((g) => !selected.has(g)); selected.clear(); paint(); };
    bulkEl.querySelector('[data-bclr]').onclick = () => { selected.clear(); paint(); };
  }

  function paint() {
    countEl.textContent = '· ' + gids.length + ' 个';
    chipsEl.innerHTML = gids.length ? gids.map((g, i) => {
      const m = meta[g] || {};
      const img = m.image ? `<img src="${esc(m.image)}" alt=""/>` : '<span class="noimg"></span>';
      return `<div class="chip${pinned.has(g) ? ' is-pinned' : ''}" draggable="true" data-gid="${esc(g)}">
        <input type="checkbox" class="chip-sel" data-sel ${selected.has(g) ? 'checked' : ''}/>
        <span class="drag" title="拖动排序">⠿</span>
        ${img}<span class="chip-name" title="${esc(g)}">${esc(m.title || g)}</span>
        <button type="button" class="chip-btn chip-pin${pinned.has(g) ? ' on' : ''}" data-pin title="置顶/取消置顶">📌</button>
        <button type="button" class="chip-btn" data-up ${i === 0 ? 'disabled' : ''}>↑</button>
        <button type="button" class="chip-btn" data-down ${i === gids.length - 1 ? 'disabled' : ''}>↓</button>
        <button type="button" class="chip-btn chip-x" data-remove>✕</button></div>`;
    }).join('') : '<p class="muted">还没有添加。用上面搜索框添加。</p>';
    chipsEl.querySelectorAll('.chip').forEach((chip) => {
      const g = chip.dataset.gid;
      chip.querySelector('[data-sel]').addEventListener('change', (e) => { if (e.target.checked) selected.add(g); else selected.delete(g); paintBulk(); });
      chip.querySelector('[data-remove]').addEventListener('click', () => { gids = gids.filter((x) => x !== g); selected.delete(g); pinned.delete(g); paint(); });
      chip.querySelector('[data-pin]').addEventListener('click', () => { if (pinned.has(g)) pinned.delete(g); else pinned.add(g); paint(); });
      const up = chip.querySelector('[data-up]'); if (up && !up.disabled) up.addEventListener('click', () => { const i = gids.indexOf(g); [gids[i - 1], gids[i]] = [gids[i], gids[i - 1]]; paint(); });
      const dn = chip.querySelector('[data-down]'); if (dn && !dn.disabled) dn.addEventListener('click', () => { const i = gids.indexOf(g); [gids[i + 1], gids[i]] = [gids[i], gids[i + 1]]; paint(); });
      chip.addEventListener('dragstart', (e) => { dragGid = g; chip.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; });
      chip.addEventListener('dragend', () => { dragGid = null; chipsEl.querySelectorAll('.chip').forEach((c) => c.classList.remove('dragging', 'dragover')); });
      chip.addEventListener('dragover', (e) => { e.preventDefault(); chip.classList.add('dragover'); });
      chip.addEventListener('dragleave', () => chip.classList.remove('dragover'));
      chip.addEventListener('drop', (e) => { e.preventDefault(); chip.classList.remove('dragover'); if (!dragGid || dragGid === g) return; const from = gids.indexOf(dragGid); gids.splice(from, 1); const to = gids.indexOf(g); gids.splice(to, 0, dragGid); paint(); });
    });
    paintBulk();
  }

  card._onOpen = async () => {
    paint();
    if (!gids.length) return;
    try { (await api('POST', '/api/nodes', { ids: gids })).items.forEach((it) => { meta[it.id] = it; }); paint(); } catch (e) {}
  };
  moduleToggle(card);

  let timer = null;
  searchEl.addEventListener('input', () => {
    clearTimeout(timer);
    const q = searchEl.value.trim();
    if (!q) { resultsEl.hidden = true; resultsEl.innerHTML = ''; return; }
    timer = setTimeout(async () => {
      try {
        const path = (kind === 'product' ? '/api/products/search?q=' : '/api/collections/search?q=') + encodeURIComponent(q);
        const { items } = await api('GET', path);
        resultsEl.innerHTML = items.length ? items.map((it) =>
          `<div class="result" data-id="${esc(it.id)}" data-title="${esc(it.title)}" data-image="${esc(it.image)}">${it.image ? `<img src="${esc(it.image)}"/>` : '<span class="noimg"></span>'}<span>${esc(it.title)}</span></div>`
        ).join('') : '<div class="result muted">无结果</div>';
        resultsEl.hidden = false;
        resultsEl.querySelectorAll('.result[data-id]').forEach((r) => r.addEventListener('click', () => {
          const id = r.dataset.id;
          if (!gids.includes(id)) { gids.push(id); meta[id] = { title: r.dataset.title, image: r.dataset.image }; paint(); }
          searchEl.value = ''; resultsEl.hidden = true; resultsEl.innerHTML = '';
        }));
      } catch (e) { resultsEl.innerHTML = '<div class="result err">' + esc(e.message) + '</div>'; resultsEl.hidden = false; }
    }, 250);
  });

  card.querySelector('[data-act="save"]').addEventListener('click', async () => {
    try {
      // 置顶项排到最前面（按当前顺序），剩下的保持原顺序。
      gids = [...gids.filter((g) => pinned.has(g)), ...gids.filter((g) => !pinned.has(g))];
      const runit = parseInt(card.querySelector('[data-runit]').value, 10) || 0;
      const rn = parseInt(card.querySelector('[data-rn]').value, 10) || 0;
      const refreshSec = runit === 0 ? 0 : Math.max(0, rn) * runit;
      const fields = { [key]: JSON.stringify(gids) };
      if (cfgField) fields[cfgField] = JSON.stringify({ refreshSec, pin: gids.filter((g) => pinned.has(g)).length });
      await api('PUT', '/api/metaobjects/search_panel', { id: entryId, fields });
      countEl.textContent = '· ' + gids.length + ' 个';
      paint();
      toast('已保存 ✓');
    } catch (e) { toast(e.message, false); }
  });
  return card;
}

// ---- themes / apply ----
async function loadThemes() {
  const sel = $('#theme-select');
  sel.innerHTML = '<option>加载中…</option>';
  try {
    const { themes } = await api('GET', '/api/themes');
    sel.innerHTML = themes.map((t) => `<option value="${t.id}">${esc(t.name)} ${t.role === 'main' ? '(线上)' : '(' + t.role + ')'}</option>`).join('');
  } catch (e) { sel.innerHTML = `<option>${esc(e.message)}</option>`; }
}
$('#theme-refresh').addEventListener('click', loadThemes);

async function runApply(dryRun) {
  const id = $('#theme-select').value;
  const opt = $('#theme-select').selectedOptions[0];
  if (!id) return;
  if (!dryRun && /线上|main/.test(opt.textContent) && !confirm('这是线上主题!确定要直接写入线上吗?建议改用草稿主题。仍要继续?')) return;
  const log = $('#apply-log');
  log.textContent = '运行中…';
  try {
    const r = await api('POST', `/api/themes/${id}/apply`, { dryRun });
    log.textContent = (dryRun ? '【试运行,未实际写入】\n' : '【已写入】\n') + r.log.join('\n');
    toast(dryRun ? '试运行完成' : '写入完成 ✓');
  } catch (e) { log.textContent = e.message; toast(e.message, false); }
}
$('#btn-dryrun').addEventListener('click', () => runApply(true));
$('#btn-apply').addEventListener('click', () => runApply(false));

// ---- init ----
(async () => {
  try {
    const t = await sessionToken();
    STORE = (decodeJwtPayload(t).dest || '').replace(/^https?:\/\//, '');
    const handle = STORE.replace('.myshopify.com', '');
    const sd = `https://admin.shopify.com/store/${handle}/apps/search-and-discovery`;
    $('#sd-link').href = sd;
    $('#boosts-link').href = sd + '/search/product-boosts';
    $('#synonyms-link').href = sd + '/search/synonyms';
    $('#store').textContent = STORE + ' ✓';
    loadType('cgp_badge');
  } catch (e) {
    $('#store').textContent = String(e.message || e);
    $('#meta-body').innerHTML = '<p class="err">' + esc(String(e.message || e)) + '</p>' +
      '<p class="muted">此 app 是嵌入式的,需在 <b>Shopify 后台 → Apps → Search Panel Dev</b> 里打开,不要直接开 Railway 网址。</p>';
  }
})();
