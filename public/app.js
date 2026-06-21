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
    if (type === 'cgp_badge') return renderBadges(entries);
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

// ---- cgp_badge: list view + quick enable toggle + expandable detail ----
const BADGE_POS = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];

function renderBadges(entries) {
  const body = $('#meta-body');
  body.innerHTML = '<div class="list"></div><button class="btn btn-primary" id="add-entry">+ 新增角标</button>';
  const list = $('.list');
  entries.forEach((e) => list.appendChild(badgeCardEl(e)));
  $('#add-entry').addEventListener('click', () => {
    const card = badgeCardEl({ id: '', fields: { position: 'bottom-left', enabled: 'true', background: '#1c222d', text_color: '#ffffff' } }, true);
    list.appendChild(card);
    card.querySelector('[data-edit]').click();
  });
}

function badgeCardEl(entry, isNew = false) {
  const f = entry.fields || {};
  const bg = f.background || '#1c222d', tc = f.text_color || '#ffffff';
  const label = f.label || f.tag || '(角标)';
  const on = f.enabled !== 'false';
  const el = document.createElement('div');
  el.className = 'card';
  el.dataset.id = entry.id || '';
  el.innerHTML = `
    <div class="summary">
      <span class="swatch" style="background:${esc(bg)};color:${esc(tc)}">${esc(label)}</span>
      <span class="grow"><b>${esc(f.tag || (isNew ? '新角标' : '(未设 tag)'))}</b> <span class="muted">· ${esc(f.position || '')}</span></span>
      <label class="inline"><input type="checkbox" data-toggle ${on ? 'checked' : ''}/> 启用</label>
      <button type="button" class="btn btn-sm" data-edit>${isNew ? '展开' : '编辑'}</button>
    </div>
    <div class="detail" data-detail hidden></div>`;
  const toggle = el.querySelector('[data-toggle]');
  toggle.addEventListener('change', async () => {
    if (!el.dataset.id) return; // unsaved new row
    try { await api('PUT', '/api/metaobjects/cgp_badge', { id: el.dataset.id, fields: { enabled: toggle.checked ? 'true' : 'false' } }); toast(toggle.checked ? '已启用' : '已停用'); }
    catch (e) { toggle.checked = !toggle.checked; toast(e.message, false); }
  });
  const detail = el.querySelector('[data-detail]');
  el.querySelector('[data-edit]').addEventListener('click', () => {
    if (detail.hidden) {
      if (!detail.dataset.loaded) { detail.innerHTML = badgeDetailHtml(entry); detail.dataset.loaded = '1'; bindBadgeDetail(el); }
      detail.hidden = false;
    } else detail.hidden = true;
  });
  return el;
}

function badgeDetailHtml(entry) {
  const f = entry.fields || {};
  const sel = BADGE_POS.map((p) => `<option value="${p}" ${f.position === p ? 'selected' : ''}>${p}</option>`).join('');
  const colorRow = (key, def) => `<span class="colorrow"><input type="color" value="${esc(f[key] || def)}" oninput="this.nextElementSibling.value=this.value"/><input type="text" data-key="${key}" data-kind="text" value="${esc(f[key] || def)}"/></span>`;
  return `
    <label>Tag <span class="hint">(产品标签,用于匹配)</span><input type="text" data-key="tag" data-kind="text" value="${esc(f.tag || '')}"/></label>
    <label>Label <span class="hint">(显示文字)</span><input type="text" data-key="label" data-kind="text" value="${esc(f.label || '')}"/></label>
    <label>Image <span class="hint">(图片 gid,留空用文字)</span><input type="text" data-key="image" data-kind="text" value="${esc(f.image || '')}"/></label>
    <label>Background 背景色 ${colorRow('background', '#1c222d')}</label>
    <label>Text color 文字色 ${colorRow('text_color', '#ffffff')}</label>
    <label>Position 位置<select data-key="position" data-kind="text">${sel}</select></label>
    <label class="inline"><input type="checkbox" data-key="enabled" data-kind="bool" ${f.enabled !== 'false' ? 'checked' : ''}/> Enabled 启用</label>
    <div class="entry-actions">
      <button type="button" class="btn btn-primary" data-act="save">保存</button>
      ${entry.id ? '<button type="button" class="btn btn-danger" data-act="del">删除</button>' : ''}
    </div>`;
}

function bindBadgeDetail(card) {
  const detail = card.querySelector('[data-detail]');
  detail.querySelector('[data-act="save"]').addEventListener('click', async () => {
    try {
      const fields = collectFields(detail);
      const id = card.dataset.id;
      if (id) await api('PUT', '/api/metaobjects/cgp_badge', { id, fields });
      else await api('POST', '/api/metaobjects/cgp_badge', { fields });
      toast('已保存 ✓');
      loadType('cgp_badge');
    } catch (e) { toast(e.message, false); }
  });
  const del = detail.querySelector('[data-act="del"]');
  if (del) del.addEventListener('click', async () => {
    if (!confirm('确定删除这个角标?')) return;
    try { await api('DELETE', '/api/metaobjects/cgp_badge', { id: card.dataset.id }); toast('已删除 ✓'); loadType('cgp_badge'); }
    catch (e) { toast(e.message, false); }
  });
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
