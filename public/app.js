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
function fieldInput(fd, value) {
  const t = fd.type?.name || 'single_line_text_field';
  const id = 'f_' + fd.key;
  if (t === 'boolean') {
    return `<label class="inline"><input type="checkbox" data-key="${fd.key}" data-kind="bool" ${value === 'true' ? 'checked' : ''}/> ${esc(fd.name)}</label>`;
  }
  if (t.startsWith('list.')) {
    let lines = '';
    try { lines = (JSON.parse(value || '[]') || []).join('\n'); } catch { lines = value || ''; }
    return `<label>${esc(fd.name)} <span class="hint">(每行一个)</span>
      <textarea data-key="${fd.key}" data-kind="list" rows="3">${esc(lines)}</textarea></label>`;
  }
  if (t === 'color') {
    const v = value || '#000000';
    return `<label>${esc(fd.name)}
      <span class="colorrow"><input type="color" value="${esc(v)}" oninput="this.nextElementSibling.value=this.value"/>
      <input type="text" data-key="${fd.key}" data-kind="text" value="${esc(v)}"/></span></label>`;
  }
  if (t.includes('file_reference') || t.includes('image')) {
    return `<label>${esc(fd.name)} <span class="hint">(图片请在 Shopify 后台该 Metaobject 里设置)</span>
      <input type="text" data-key="${fd.key}" data-kind="text" value="${esc(value || '')}" placeholder="gid://... 或留空"/></label>`;
  }
  const rows = (t.includes('multi_line') || t.includes('rich_text')) ? 4 : 1;
  if (rows > 1) return `<label>${esc(fd.name)}<textarea data-key="${fd.key}" data-kind="text" rows="${rows}">${esc(value || '')}</textarea></label>`;
  return `<label>${esc(fd.name)}<input type="text" data-key="${fd.key}" data-kind="text" value="${esc(value || '')}"/></label>`;
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

let DEF = null, TYPE = '';

async function loadType(type) {
  TYPE = type;
  const body = $('#meta-body');
  body.innerHTML = '<p class="muted">加载中…</p>';
  try {
    const { definition, entries, availableTypes } = await api('GET', '/api/metaobjects/' + type);
    DEF = definition;
    if (!definition) {
      body.innerHTML = `<p class="err">找不到类型 "${esc(type)}" 的 Metaobject 定义。</p>` +
        `<p class="muted">这个店铺现有的 Metaobject 类型:<br>${(availableTypes || []).map((t) => '<code>' + esc(t) + '</code>').join('、') || '(无)'}</p>` +
        `<p class="muted">如果你的角标/排序/面板用的是上面别的 handle,告诉我实际名字,我改一下映射。</p>`;
      return;
    }
    const fds = definition.fieldDefinitions || [];
    let html = `<div class="rows">`;
    entries.forEach((e) => { html += entryCard(fds, e); });
    html += `</div><button class="btn btn-primary" id="add-entry">+ 新增</button>`;
    body.innerHTML = html;
    body.querySelectorAll('[data-entry]').forEach(bindEntry);
    $('#add-entry').addEventListener('click', () => {
      const wrap = document.createElement('div');
      wrap.innerHTML = entryCard(fds, { id: '', handle: '', fields: {} }, true);
      $('.rows').appendChild(wrap.firstElementChild);
      bindEntry($('.rows').lastElementChild);
    });
  } catch (e) { body.innerHTML = `<p class="err">${esc(e.message)}</p>`; }
}

function entryCard(fds, entry, isNew = false) {
  const inner = fds.map((fd) => fieldInput(fd, entry.fields[fd.key])).join('');
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
