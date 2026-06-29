const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
let STORE = '';
// Pin glyph as an inline SVG (no emoji).
const PIN_SVG = '<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M12 2l2.6 5.9 6.4.5-4.9 4.2 1.5 6.3L12 15.9 6.4 18.9l1.5-6.3L3 8.4l6.4-.5z"/></svg>';

// ---- i18n (per-user language, persisted in localStorage) ----
const I18N = {
  zh: {
    'tab.custom': '自定义', 'tab.boosts': 'Boosts / 同义词', 'tab.system': '系统设置',
    'sub.promo': '促销活动标签', 'sub.attr': '产品属性标签', 'sub.sort': '产品排序规则',
    'sub.featured': '热门推荐', 'sub.banner': '促销 Banner',
    'loading': '加载中…',
    'boosts.intro': '搜索结果的 Boosts / 同义词 / 筛选器在官方 Search & Discovery app 里设置:',
    'boosts.product': 'Product boosts 排名提升', 'boosts.syn': 'Synonyms 同义词',
    'boosts.open': '打开 Search & Discovery',
    'boosts.note': '官方界面受 Shopify 限制无法内嵌到本 app,点击会在 Shopify 后台新标签打开。',
    'sys.store': '当前店铺', 'sys.lang': '语言', 'sys.storeTitle': '店铺信息', 'sys.langTitle': '界面语言',
    'apply.title': '写入主题',
    'apply.desc': '把搜索引擎模块写入选定主题(建议只选草稿/未发布主题)。先「试运行」看清单,确认无误再「正式写入」。',
    'apply.theme': '主题', 'apply.refresh': '刷新', 'apply.dry': '试运行 (dry run)', 'apply.go': '正式写入',
    'edit': '编辑', 'close': '关闭', 'expand': '展开', 'save': '保存', 'create': '创建', 'del': '删除',
    'enable': '启用', 'addEntry': '+ 新增', 'addLabel': '+ 新增标签', 'addRule': '+ 新增规则',
    'saved': '已保存 ✓', 'deleted': '已删除 ✓', 'enabledMsg': '已启用', 'disabledMsg': '已停用',
    'confirmDel': '确定删除这个条目?', 'confirmDelLabel': '确定删除这个标签?', 'confirmDelRule': '确定删除这条排序规则?',
    'noResult': '无结果', 'empty': '(空)', 'none': '(无)', 'newEntry': '新条目',
    'emptyType': '这个类型还没有条目,也读不到字段。请先在 Shopify 后台给它加一条,再回来这里管理。',
    'badge.over.right': '右', 'badge.over.left': '左', 'badge.bottomRight': '图片右下角',
    'labelFallback': '(标签)', 'newBadge': '新标签', 'noTag': '(未设 tag)',
    'attr.note': '产品属性标签:按 tag 匹配,显示在图片右下角(叠在图上)。',
    'label.tagHint': '(产品标签,用于匹配;可下拉选或自己输入)',
    'label.imageHint': '(图片 gid,留空用文字)',
    'label.posHint': '(图片下方:左 / 右)',
    'label.linkHint': '(字段用 URL 类型;填了才可点击跳转,留空则为纯展示徽章)',
    'pos.left': '左 left', 'pos.right': '右 right',
    'sr.kw': '关键词', 'sr.types': '类型',
    'sr.filter': '搜索关键词或类型…', 'sr.order.recent': '默认顺序', 'sr.order.alpha': '关键词 A-Z',
    'sr.order.kwDesc': '关键词数 多→少', 'sr.order.typeDesc': '类型数 多→少',
    'sr.import': '⬆ 批量导入规则(从表格粘贴)',
    'sr.importHint': '每行一条规则。直接从 Excel 复制「Keywords」「Priority Types」两列粘贴(Tab 分隔即可,有没有 Category 列都行);关键词/类型各自用逗号分隔。会自动忽略表头行。',
    'sr.importBtn': '导入', 'sr.noMatch': '没有匹配的规则。',
    'sr.importNone': '没解析到有效规则(每行需 关键词<Tab>类型)',
    'sr.importConfirm': '将新建 %n 条规则,确定?', 'sr.importDone': '导入完成:',
    'sr.kwFieldHint': '(每行一个,匹配任意一个即应用此规则)',
    'sr.typeFieldHint': '(每行一个,产品类型按这个顺序排在前面)',
    'sp.noEntry': '还没有 search_panel 条目。请在 Shopify 后台新建一条(handle 通常为 main)。',
    'sp.popular': '热门搜索词', 'sp.popularHint': '(每行一个,搜索框聚焦时显示)',
    'sp.products': '热门产品', 'sp.collections': '热门合集',
    'sp.bannerImg': 'Banner 图片', 'sp.bannerImgHint': '(gid://shopify/MediaImage/…;建议在 Shopify 后台选)',
    'sp.bannerLink': 'Banner 链接', 'sp.bannerAlt': 'Banner 替代文字',
    'sp.searchProduct': '搜索产品添加…', 'sp.searchCollection': '搜索集合添加…',
    'sp.refresh': '随机刷新间隔:', 'sp.now': '立即(每次打开都换)', 'sp.min': '分钟', 'sp.hour': '小时', 'sp.day': '天',
    'sp.pinHint': '置顶项不参与随机,始终排在最前', 'sp.emptyAdd': '还没有添加。用上面搜索框添加。', 'pin': '置顶',
    'sp.savedNoCfg': '已保存(刷新间隔/置顶未存:metaobject 缺 %s 字段)',
    'items': '个',
    'bulk.sel': '已选 %n 项', 'bulk.up': '↑ 上移', 'bulk.down': '↓ 下移', 'bulk.del': '删除选中', 'bulk.clr': '取消选择',
    'theme.loading': '加载中…', 'theme.online': '线上',
    'apply.running': '运行中…', 'apply.dryDone': '试运行完成', 'apply.doneToast': '写入完成 ✓',
    'apply.dryHead': '【试运行,未实际写入】\n', 'apply.doneHead': '【已写入】\n',
    'apply.onlineWarn': '这是线上主题!确定要直接写入线上吗?建议改用草稿主题。仍要继续?',
    'init.embedErr': '此 app 是嵌入式的,需在 Shopify 后台 → Apps → Search Panel Dev 里打开,不要直接开 Railway 网址。',
    'tab.insights': '数据洞察', 'ins.range': '时间范围', 'ins.7': '近 7 天', 'ins.30': '近 30 天', 'ins.90': '近 90 天',
    'ins.overview': '概览', 'ins.searchHistory': '搜索历史', 'ins.topSearches': '热门搜索', 'ins.nav': '分类导航', 'ins.clickHistory': '点击历史', 'ins.topClicks': '最常点击',
    'ins.searches': '搜索次数', 'ins.submitted': '提交次数', 'ins.zero': '零结果', 'ins.zeroRate': '零结果率', 'ins.clicks': '点击数', 'ins.drawerClicks': '弹窗点击', 'ins.resultsClicks': '结果页点击', 'ins.recClicks': '推荐位点击', 'ins.sessions': '独立访客',
    'ins.colTime': '时间', 'ins.colQuery': '搜索词', 'ins.colResults': '结果数', 'ins.colSource': '来源', 'ins.colType': '类型', 'ins.colTarget': '目标', 'ins.colFromQuery': '来源搜索词', 'ins.colCount': '次数', 'ins.colZero': '其中零结果', 'ins.colDrawerN': '弹窗', 'ins.colResultsN': '结果页', 'ins.colRecN': '推荐位', 'ins.colTotal': '合计', 'ins.navTotal': '分类导航',
    'ins.srcDrawer': '弹窗', 'ins.srcResults': '结果页', 'ins.srcRecommendation': '推荐位', 'ins.tProduct': '产品', 'ins.tCollection': '集合',
    'ins.prev': '上一页', 'ins.next': '下一页', 'ins.pageOf': '第 %n 页', 'ins.total': '共 %n 条', 'ins.none': '—',
    'ins.empty': '这个时间段还没有数据。确认主题埋点已推送、且前台未拒绝分析 cookie。',
    'ins.disabled': '分析未启用(后端未连数据库)。',
    'ins.reset': '清空数据', 'ins.resetConfirm': '确定清空所有搜索分析数据?此操作不可恢复,用于在修复埋点后从干净的数据重新开始。', 'ins.resetDone': '已清空 ✓',
  },
  en: {
    'tab.custom': 'Customization', 'tab.boosts': 'Boosts / Synonyms', 'tab.system': 'System',
    'sub.promo': 'Promotion Labels', 'sub.attr': 'Product Attribute Labels', 'sub.sort': 'Product Sort Rules',
    'sub.featured': 'Recommendations', 'sub.banner': 'Promo Banner',
    'loading': 'Loading…',
    'boosts.intro': 'Boosts / synonyms / filters for search results are configured in the official Search & Discovery app:',
    'boosts.product': 'Product boosts', 'boosts.syn': 'Synonyms',
    'boosts.open': 'Open Search & Discovery',
    'boosts.note': "The official UI can't be embedded here (Shopify restriction); it opens in a new Shopify admin tab.",
    'sys.store': 'Store', 'sys.lang': 'Language', 'sys.storeTitle': 'Store', 'sys.langTitle': 'Language',
    'apply.title': 'Apply to theme',
    'apply.desc': 'Write the search-engine modules into the selected theme (prefer a draft/unpublished theme). Run "Dry run" first to review, then "Apply".',
    'apply.theme': 'Theme', 'apply.refresh': 'Refresh', 'apply.dry': 'Dry run', 'apply.go': 'Apply',
    'edit': 'Edit', 'close': 'Close', 'expand': 'Expand', 'save': 'Save', 'create': 'Create', 'del': 'Delete',
    'enable': 'Enabled', 'addEntry': '+ Add', 'addLabel': '+ Add label', 'addRule': '+ Add rule',
    'saved': 'Saved ✓', 'deleted': 'Deleted ✓', 'enabledMsg': 'Enabled', 'disabledMsg': 'Disabled',
    'confirmDel': 'Delete this entry?', 'confirmDelLabel': 'Delete this label?', 'confirmDelRule': 'Delete this sort rule?',
    'noResult': 'No results', 'empty': '(empty)', 'none': '(none)', 'newEntry': 'New entry',
    'emptyType': 'No entries and no readable fields for this type yet. Add one in the Shopify admin first, then manage it here.',
    'badge.over.right': 'right', 'badge.over.left': 'left', 'badge.bottomRight': 'image bottom-right',
    'labelFallback': '(label)', 'newBadge': 'New label', 'noTag': '(no tag)',
    'attr.note': 'Product attribute label: matched by tag, shown over the image bottom-right.',
    'label.tagHint': '(product tag used to match; pick from the list or type your own)',
    'label.imageHint': '(image gid; leave empty to use text)',
    'label.posHint': '(below the image: left / right)',
    'label.linkHint': '(use a URL field type; if set the badge is clickable, otherwise display-only)',
    'pos.left': 'left', 'pos.right': 'right',
    'sr.kw': 'Keywords', 'sr.types': 'Types',
    'sr.filter': 'Search keywords or types…', 'sr.order.recent': 'Default order', 'sr.order.alpha': 'Keyword A-Z',
    'sr.order.kwDesc': 'Keyword count ↓', 'sr.order.typeDesc': 'Type count ↓',
    'sr.import': '⬆ Bulk import rules (paste from a sheet)',
    'sr.importHint': 'One rule per line. Paste the "Keywords" and "Priority Types" columns straight from Excel (Tab-separated; a Category column is fine too). Separate keywords/types with commas. The header row is skipped automatically.',
    'sr.importBtn': 'Import', 'sr.noMatch': 'No matching rules.',
    'sr.importNone': 'No valid rules parsed (each line needs keywords<Tab>types)',
    'sr.importConfirm': 'Create %n rules?', 'sr.importDone': 'Imported: ',
    'sr.kwFieldHint': '(one per line; matching any one applies this rule)',
    'sr.typeFieldHint': '(one per line; product types float to the front in this order)',
    'sp.noEntry': 'No search_panel entry yet. Create one in the Shopify admin (handle is usually "main").',
    'sp.popular': 'Popular terms', 'sp.popularHint': '(one per line; shown when the search box is focused)',
    'sp.products': 'Featured products', 'sp.collections': 'Featured collections',
    'sp.bannerImg': 'Banner image', 'sp.bannerImgHint': '(gid://shopify/MediaImage/…; pick in the Shopify admin)',
    'sp.bannerLink': 'Banner link', 'sp.bannerAlt': 'Banner alt text',
    'sp.searchProduct': 'Search products to add…', 'sp.searchCollection': 'Search collections to add…',
    'sp.refresh': 'Random refresh interval:', 'sp.now': 'Instant (reshuffle every open)', 'sp.min': 'minutes', 'sp.hour': 'hours', 'sp.day': 'days',
    'sp.pinHint': 'Pinned items skip the shuffle and always stay first', 'sp.emptyAdd': 'Nothing added yet. Use the search box above.', 'pin': 'Pin',
    'sp.savedNoCfg': 'Saved (refresh interval / pin not stored: metaobject is missing the %s field)',
    'items': '',
    'bulk.sel': '%n selected', 'bulk.up': '↑ Up', 'bulk.down': '↓ Down', 'bulk.del': 'Remove selected', 'bulk.clr': 'Clear selection',
    'theme.loading': 'Loading…', 'theme.online': 'live',
    'apply.running': 'Running…', 'apply.dryDone': 'Dry run complete', 'apply.doneToast': 'Applied ✓',
    'apply.dryHead': '[Dry run — nothing written]\n', 'apply.doneHead': '[Applied]\n',
    'apply.onlineWarn': 'This is the LIVE theme! Write directly to live? A draft theme is recommended. Continue anyway?',
    'init.embedErr': 'This app is embedded — open it from Shopify admin → Apps → Search Panel Dev, not the Railway URL directly.',
    'tab.insights': 'Insights', 'ins.range': 'Range', 'ins.7': 'Last 7 days', 'ins.30': 'Last 30 days', 'ins.90': 'Last 90 days',
    'ins.overview': 'Overview', 'ins.searchHistory': 'Search history', 'ins.topSearches': 'Top searches', 'ins.nav': 'Category nav', 'ins.clickHistory': 'Click history', 'ins.topClicks': 'Most clicked',
    'ins.searches': 'Searches', 'ins.submitted': 'Submitted', 'ins.zero': 'Zero-result', 'ins.zeroRate': 'Zero-result rate', 'ins.clicks': 'Clicks', 'ins.drawerClicks': 'Drawer clicks', 'ins.resultsClicks': 'Results clicks', 'ins.recClicks': 'Recommendation clicks', 'ins.sessions': 'Unique visitors',
    'ins.colTime': 'Time', 'ins.colQuery': 'Query', 'ins.colResults': 'Results', 'ins.colSource': 'Source', 'ins.colType': 'Type', 'ins.colTarget': 'Target', 'ins.colFromQuery': 'From query', 'ins.colCount': 'Count', 'ins.colZero': 'Of which zero', 'ins.colDrawerN': 'Drawer', 'ins.colResultsN': 'Results', 'ins.colRecN': 'Recommendation', 'ins.colTotal': 'Total', 'ins.navTotal': 'Category nav',
    'ins.srcDrawer': 'Drawer', 'ins.srcResults': 'Results', 'ins.srcRecommendation': 'Recommendation', 'ins.tProduct': 'Product', 'ins.tCollection': 'Collection',
    'ins.prev': 'Prev', 'ins.next': 'Next', 'ins.pageOf': 'Page %n', 'ins.total': '%n total', 'ins.none': '—',
    'ins.empty': 'No data for this range yet. Make sure the theme instrumentation is pushed and visitors have not declined analytics cookies.',
    'ins.disabled': 'Analytics not enabled (backend has no database).',
    'ins.reset': 'Clear data', 'ins.resetConfirm': 'Clear ALL search analytics data? This cannot be undone — use it to start fresh after fixing instrumentation.', 'ins.resetDone': 'Cleared ✓',
  },
};
let LANG = localStorage.getItem('cgp-admin-lang') || 'zh';
function t(k, n) {
  let s = (I18N[LANG] && I18N[LANG][k]);
  if (s == null) s = I18N.zh[k];
  if (s == null) s = k;
  if (n != null) s = String(s).replace('%n', n).replace('%s', n);
  return s;
}
function applyI18n() {
  document.documentElement.lang = LANG;
  document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll('[data-i18n-ph]').forEach((el) => { el.placeholder = t(el.dataset.i18nPh); });
}
function setLang(l) {
  LANG = l;
  localStorage.setItem('cgp-admin-lang', l);
  document.querySelectorAll('#lang-toggle button').forEach((b) => b.classList.toggle('is-active', b.dataset.lang === l));
  applyI18n();
  // Re-render the active dynamic panel in the new language.
  if (document.querySelector('#tab-meta.is-active')) {
    const sub = document.querySelector('#tab-meta .subtab.is-active');
    if (sub) loadType(sub.dataset.type);
  } else if (document.querySelector('#tab-insights.is-active')) {
    loadInsights();
  }
}

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

// ---- routing (App Bridge ui-nav-menu paths ↔ tabs/subtabs) ----
const ROUTES = {
  '/': { tab: 'meta', sub: 'search_panel_featured' },
  '/featured': { tab: 'meta', sub: 'search_panel_featured' },
  '/sort': { tab: 'meta', sub: 'cgp_sort_rule' },
  '/promo': { tab: 'meta', sub: 'cgp_badge' },
  '/attributes': { tab: 'meta', sub: 'cgp_status_badge' },
  '/banner': { tab: 'meta', sub: 'search_panel_banner' },
  '/insights': { tab: 'insights', sub: null },
  '/boosts': { tab: 'links', sub: null },
  '/system': { tab: 'system', sub: null },
};
const SUB_PATH = { search_panel_featured: '/featured', cgp_sort_rule: '/sort', cgp_badge: '/promo', cgp_status_badge: '/attributes', search_panel_banner: '/banner' };
function currentPath() {
  const tabEl = document.querySelector('.tab.is-active');
  const tab = tabEl && tabEl.dataset.tab;
  if (tab === 'insights') return '/insights';
  if (tab === 'links') return '/boosts';
  if (tab === 'system') return '/system';
  const subEl = document.querySelector('.subtab.is-active');
  const sub = subEl && subEl.dataset.type;
  return SUB_PATH[sub] || '/';
}
// Keep the URL in sync so the Shopify admin nav highlights the active item.
function syncUrl() { try { history.replaceState(null, '', currentPath() + location.search); } catch (e) {} }
function applyRoute(pathname) {
  const r = ROUTES[pathname] || ROUTES['/'];
  document.querySelectorAll('.tab').forEach((x) => x.classList.toggle('is-active', x.dataset.tab === r.tab));
  document.querySelectorAll('.panel').forEach((p) => p.classList.toggle('is-active', p.id === 'tab-' + r.tab));
  if (r.tab === 'system') { loadThemes(); return; }
  if (r.tab === 'insights') { loadInsights(); return; }
  if (r.tab === 'links') return;
  const sub = r.sub || 'search_panel_featured';
  document.querySelectorAll('.subtab').forEach((x) => x.classList.toggle('is-active', x.dataset.type === sub));
  loadType(sub);
}

// ---- tabs ----
document.querySelectorAll('.tab').forEach((b) => b.addEventListener('click', () => {
  document.querySelectorAll('.tab').forEach((x) => x.classList.toggle('is-active', x === b));
  document.querySelectorAll('.panel').forEach((p) => p.classList.toggle('is-active', p.id === 'tab-' + b.dataset.tab));
  if (b.dataset.tab === 'system') loadThemes();
  if (b.dataset.tab === 'insights') loadInsights();
  syncUrl();
}));
document.querySelectorAll('#tab-meta .subtab').forEach((b) => b.addEventListener('click', () => {
  document.querySelectorAll('#tab-meta .subtab').forEach((x) => x.classList.toggle('is-active', x === b));
  loadType(b.dataset.type);
  syncUrl();
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
    return `<label>${label}
      <textarea data-key="${key}" data-kind="list" rows="3">${esc(lines)}</textarea></label>`;
  }
  if (field.kind === 'color') {
    const v = value || '#000000';
    return `<label>${label}
      <span class="colorrow"><input type="color" value="${esc(v)}" oninput="this.nextElementSibling.value=this.value"/>
      <input type="text" data-key="${key}" data-kind="text" value="${esc(v)}"/></span></label>`;
  }
  if (field.kind === 'ref') {
    return `<label>${label} <span class="hint">(gid://…)</span>
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
  body.innerHTML = '<p class="muted">' + t('loading') + '</p>';
  // The search panel is split into two subtabs (Featured / Banner) that both
  // read the same search_panel metaobject.
  const fetchType = (type === 'search_panel_featured' || type === 'search_panel_banner') ? 'search_panel' : type;
  try {
    const { entries, fields } = await api('GET', '/api/metaobjects/' + fetchType);
    FIELDS = fields || [];
    if (type === 'cgp_badge' || type === 'cgp_status_badge') return renderBadges(entries, type);
    if (type === 'cgp_sort_rule') return renderSortRules(entries);
    if (type === 'search_panel_featured') return renderSearchPanelFeatured(entries);
    if (type === 'search_panel_banner') return renderSearchPanelBanner(entries);
    if (!FIELDS.length && !entries.length) {
      body.innerHTML = '<p class="muted">' + t('emptyType') + '</p>';
      return;
    }
    let html = `<div class="rows">`;
    entries.forEach((e) => { html += entryCard(FIELDS, e); });
    html += `</div><button class="btn btn-primary" id="add-entry">${t('addEntry')}</button>`;
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
  const title = isNew ? t('newEntry') : esc(entry.displayName || entry.handle || entry.id);
  return `<form class="entry" data-entry data-id="${esc(entry.id)}">
    <div class="entry-head"><b>${title}</b></div>
    ${inner}
    <div class="entry-actions">
      <button type="button" class="btn btn-primary" data-act="save">${isNew ? t('create') : t('save')}</button>
      ${entry.id ? `<button type="button" class="btn btn-danger" data-act="del">${t('del')}</button>` : ''}
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
      toast(t('saved'));
      loadType(TYPE);
    } catch (e) { toast(e.message, false); }
  });
  const del = form.querySelector('[data-act="del"]');
  if (del) del.addEventListener('click', async () => {
    if (!confirm(t('confirmDel'))) return;
    try { await api('DELETE', '/api/metaobjects/' + TYPE, { id: form.dataset.id }); toast(t('deleted')); loadType(TYPE); }
    catch (e) { toast(e.message, false); }
  });
}

// ---- cgp_badge (promotion labels) + cgp_status_badge (product attribute labels) ----
const BADGE_POS_VALUES = ['bottom-left', 'bottom-right'];

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
  body.innerHTML = `<div class="list"></div><button class="btn btn-primary" id="add-entry">${t('addLabel')}</button>`;
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
  const label = f.label || f.tag || t('labelFallback');
  const on = f.enabled !== 'false';
  const meta = type === 'cgp_status_badge' ? t('badge.bottomRight') : (/right/i.test(f.position || '') ? t('badge.over.right') : t('badge.over.left'));
  const el = document.createElement('div');
  el.className = 'card';
  el.dataset.id = entry.id || '';
  el.innerHTML = `
    <div class="summary">
      <span class="swatch" style="background:${esc(bg)};color:${esc(tc)}">${esc(label)}</span>
      <span class="grow"><b>${esc(f.tag || (isNew ? t('newBadge') : t('noTag')))}</b> <span class="muted">· ${esc(meta)}</span></span>
      <label class="inline"><input type="checkbox" data-toggle ${on ? 'checked' : ''}/> ${t('enable')}</label>
      <button type="button" class="btn btn-sm" data-edit>${isNew ? t('expand') : t('edit')}</button>
    </div>
    <div class="detail" data-detail hidden></div>`;
  const toggle = el.querySelector('[data-toggle]');
  toggle.addEventListener('change', async () => {
    if (!el.dataset.id) return; // unsaved new row
    try { await api('PUT', '/api/metaobjects/' + type, { id: el.dataset.id, fields: { enabled: toggle.checked ? 'true' : 'false' } }); toast(toggle.checked ? t('enabledMsg') : t('disabledMsg')); }
    catch (e) { toggle.checked = !toggle.checked; toast(e.message, false); }
  });
  const detail = el.querySelector('[data-detail]');
  const editBtn = el.querySelector('[data-edit]');
  editBtn.addEventListener('click', () => {
    if (detail.hidden) {
      if (!detail.dataset.loaded) { detail.innerHTML = badgeDetailHtml(entry, type); detail.dataset.loaded = '1'; bindBadgeDetail(el, type); }
      detail.hidden = false;
    } else detail.hidden = true;
    editBtn.textContent = detail.hidden ? t('edit') : t('close');
    editBtn.classList.toggle('btn-primary', !detail.hidden);
  });
  return el;
}

function badgeDetailHtml(entry, type) {
  const f = entry.fields || {};
  const isStatus = type === 'cgp_status_badge';
  const curPos = /right/i.test(f.position || '') ? 'bottom-right' : 'bottom-left';
  const posLbl = { 'bottom-left': t('pos.left'), 'bottom-right': t('pos.right') };
  const sel = BADGE_POS_VALUES.map((v) => `<option value="${v}" ${curPos === v ? 'selected' : ''}>${posLbl[v]}</option>`).join('');
  const colorRow = (key, def) => `<span class="colorrow"><input type="color" value="${esc(f[key] || def)}" oninput="this.nextElementSibling.value=this.value"/><input type="text" data-key="${key}" data-kind="text" value="${esc(f[key] || def)}"/></span>`;
  return `
    ${isStatus ? `<p class="hint">${t('attr.note')}</p>` : ''}
    <label>Tag <span class="hint">${t('label.tagHint')}</span><input type="text" data-key="tag" data-kind="text" list="all-tags" value="${esc(f.tag || '')}"/></label>
    <label>Label<input type="text" data-key="label" data-kind="text" value="${esc(f.label || '')}"/></label>
    ${isStatus ? '' : `<label>Image <span class="hint">${t('label.imageHint')}</span><input type="text" data-key="image" data-kind="text" value="${esc(f.image || '')}"/></label>`}
    <label>Background ${colorRow('background', '#1c222d')}</label>
    <label>Text color ${colorRow('text_color', '#ffffff')}</label>
    ${isStatus ? '' : `<label>Position <span class="hint">${t('label.posHint')}</span><select data-key="position" data-kind="text">${sel}</select></label>`}
    ${isStatus ? '' : `<label>Link <span class="hint">${t('label.linkHint')}</span><input type="text" data-key="link" data-kind="text" value="${esc(linkUrl(f.link))}" placeholder="https://...../collections/..."/></label>`}
    <label class="inline"><input type="checkbox" data-key="enabled" data-kind="bool" ${f.enabled !== 'false' ? 'checked' : ''}/> ${t('enable')}</label>
    <div class="entry-actions">
      <button type="button" class="btn btn-primary" data-act="save">${t('save')}</button>
      ${entry.id ? `<button type="button" class="btn btn-danger" data-act="del">${t('del')}</button>` : ''}
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
      toast(t('saved'));
      loadType(type);
    } catch (e) { toast(e.message, false); }
  });
  const del = detail.querySelector('[data-act="del"]');
  if (del) del.addEventListener('click', async () => {
    if (!confirm(t('confirmDelLabel'))) return;
    try { await api('DELETE', '/api/metaobjects/' + type, { id: card.dataset.id }); toast(t('deleted')); loadType(type); }
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
      <input type="search" id="sr-filter" placeholder="${t('sr.filter')}" value="${esc(SR_FILTER)}" />
      <select id="sr-order">
        <option value="recent">${t('sr.order.recent')}</option>
        <option value="alpha">${t('sr.order.alpha')}</option>
        <option value="kw_desc">${t('sr.order.kwDesc')}</option>
        <option value="type_desc">${t('sr.order.typeDesc')}</option>
      </select>
    </div>
    <div class="list" id="sr-list"></div>
    <button class="btn btn-primary" id="add-entry">${t('addRule')}</button>
    <details class="card" style="margin-top:14px">
      <summary style="padding:12px 14px;cursor:pointer;font-weight:600">${t('sr.import')}</summary>
      <div class="detail" style="display:block">
        <p class="hint">${t('sr.importHint')}</p>
        <textarea id="sr-import" rows="6" placeholder="dzofilm, nisi, cine, lens&#9;Cine Lens, Lens Adapter"></textarea>
        <div class="entry-actions"><button class="btn btn-primary" id="sr-import-btn">${t('sr.importBtn')}</button></div>
      </div>
    </details>`;
  $('#sr-order').value = SR_ORDER;
  $('#sr-filter').addEventListener('input', (e) => { SR_FILTER = e.target.value; paintSortRules(); });
  $('#sr-order').addEventListener('change', (e) => { SR_ORDER = e.target.value; paintSortRules(); });
  $('#add-entry').addEventListener('click', () => {
    const row = sortRuleCardEl({ id: '', keywords: [], types: [] }, true);
    $('#sr-list').prepend(row);
    row.querySelector('[data-edit]').click();
  });
  $('#sr-import-btn').addEventListener('click', async () => {
    const lines = ($('#sr-import').value || '').split('\n').map((l) => l.replace(/\r$/, '')).filter((l) => l.trim());
    const rules = [];
    for (const line of lines) {
      const parts = line.split('\t').map((s) => s.trim());
      if (parts.length < 2) continue;
      const typesStr = parts[parts.length - 1];
      const kwStr = parts[parts.length - 2];
      if (/^keywords?$/i.test(kwStr) || /^priority types$/i.test(typesStr)) continue; // header row
      const keywords = kwStr.split(',').map((s) => s.trim()).filter(Boolean);
      const types = typesStr.split(',').map((s) => s.trim()).filter(Boolean);
      if (keywords.length && types.length) rules.push({ keywords, types });
    }
    if (!rules.length) { toast(t('sr.importNone'), false); return; }
    if (!confirm(t('sr.importConfirm', rules.length))) return;
    let ok = 0;
    for (const r of rules) {
      try { await api('POST', '/api/metaobjects/cgp_sort_rule', { fields: { keywords: JSON.stringify(r.keywords), priority_types: JSON.stringify(r.types) } }); ok++; }
      catch (e) { console.error('import rule failed', r, e); }
    }
    toast(t('sr.importDone') + ok + '/' + rules.length);
    loadType('cgp_sort_rule');
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
  if (!view.length) { list.innerHTML = `<p class="muted">${t('sr.noMatch')}</p>`; return; }
  view.forEach((r) => list.appendChild(sortRuleCardEl(r)));
}

function sortRuleCardEl(rule, isNew = false) {
  const el = document.createElement('div');
  el.className = 'card';
  el.dataset.id = rule.id || '';
  el.innerHTML = `
    <div class="summary">
      <span class="grow">
        <b>${t('sr.kw')}:</b> ${esc(joinPreview(rule.keywords) || t('empty'))}
        <br><span class="muted"><b>${t('sr.types')}:</b> ${esc(joinPreview(rule.types) || t('empty'))}</span>
      </span>
      <button type="button" class="btn btn-sm" data-edit>${isNew ? t('expand') : t('edit')}</button>
    </div>
    <div class="detail" data-detail hidden></div>`;
  const detail = el.querySelector('[data-detail]');
  const btn = el.querySelector('[data-edit]');
  btn.addEventListener('click', () => {
    if (detail.hidden) {
      if (!detail.dataset.loaded) { detail.innerHTML = sortRuleDetailHtml(rule); detail.dataset.loaded = '1'; bindSortRuleDetail(el); }
      detail.hidden = false;
    } else detail.hidden = true;
    btn.textContent = detail.hidden ? t('edit') : t('close');
    btn.classList.toggle('btn-primary', !detail.hidden);
  });
  return el;
}

function sortRuleDetailHtml(rule) {
  return `
    <label>Keywords <span class="hint">${t('sr.kwFieldHint')}</span>
      <textarea data-key="keywords" data-kind="list" rows="4">${esc(rule.keywords.join('\n'))}</textarea></label>
    <label>Priority types <span class="hint">${t('sr.typeFieldHint')}</span>
      <textarea data-key="priority_types" data-kind="list" rows="4">${esc(rule.types.join('\n'))}</textarea></label>
    <div class="entry-actions">
      <button type="button" class="btn btn-primary" data-act="save">${t('save')}</button>
      ${rule.id ? `<button type="button" class="btn btn-danger" data-act="del">${t('del')}</button>` : ''}
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
      toast(t('saved'));
      loadType('cgp_sort_rule');
    } catch (e) { toast(e.message, false); }
  });
  const del = detail.querySelector('[data-act="del"]');
  if (del) del.addEventListener('click', async () => {
    if (!confirm(t('confirmDelRule'))) return;
    try { await api('DELETE', '/api/metaobjects/cgp_sort_rule', { id: card.dataset.id }); toast(t('deleted')); loadType('cgp_sort_rule'); }
    catch (e) { toast(e.message, false); }
  });
}

// ---- search_panel: split into Featured (terms/products/collections) + Banner ----
function renderSearchPanelFeatured(entries) {
  const body = $('#meta-body');
  if (!entries.length) { body.innerHTML = `<p class="muted">${t('sp.noEntry')}</p>`; return; }
  body.innerHTML = '';
  entries.forEach((e) => {
    const f = e.fields || {};
    const wrap = document.createElement('div');
    wrap.className = 'panel-entry';
    wrap.appendChild(simpleModuleEl(e.id, t('sp.popular'), joinPreview(parseList(f.popular_terms), 8) || t('empty'),
      `<label>${t('sp.popular')} <span class="hint">${t('sp.popularHint')}</span>
        <textarea data-key="popular_terms" data-kind="list" rows="6">${esc(parseList(f.popular_terms).join('\n'))}</textarea></label>`));
    wrap.appendChild(refModuleEl(e.id, 'featured_products', t('sp.products'), parseList(f.featured_products), 'product', 'featured_products_config', f.featured_products_config));
    wrap.appendChild(refModuleEl(e.id, 'featured_collections', t('sp.collections'), parseList(f.featured_collections), 'collection', 'featured_collections_config', f.featured_collections_config));
    body.appendChild(wrap);
  });
}

function renderSearchPanelBanner(entries) {
  const body = $('#meta-body');
  if (!entries.length) { body.innerHTML = `<p class="muted">${t('sp.noEntry')}</p>`; return; }
  body.innerHTML = '';
  entries.forEach((e) => {
    const f = e.fields || {};
    const wrap = document.createElement('div');
    wrap.className = 'panel-entry';
    wrap.appendChild(simpleModuleEl(e.id, t('sp.bannerImg'), f.banner_image || t('none'),
      `<label>${t('sp.bannerImg')} <span class="hint">${t('sp.bannerImgHint')}</span>
        <input type="text" data-key="banner_image" data-kind="text" value="${esc(f.banner_image || '')}"/></label>`));
    wrap.appendChild(simpleModuleEl(e.id, t('sp.bannerLink'), f.banner_link || t('none'),
      `<label>${t('sp.bannerLink')}<input type="text" data-key="banner_link" data-kind="text" value="${esc(f.banner_link || '')}"/></label>`));
    wrap.appendChild(simpleModuleEl(e.id, t('sp.bannerAlt'), f.banner_alt || t('none'),
      `<label>${t('sp.bannerAlt')}<input type="text" data-key="banner_alt" data-kind="text" value="${esc(f.banner_alt || '')}"/></label>`));
    body.appendChild(wrap);
  });
}

function moduleToggle(card) {
  const detail = card.querySelector('[data-detail]');
  const btn = card.querySelector('[data-edit]');
  btn.addEventListener('click', () => {
    detail.hidden = !detail.hidden;
    btn.textContent = detail.hidden ? t('edit') : t('close');
    btn.classList.toggle('btn-primary', !detail.hidden);
    if (!detail.hidden && card._onOpen && !card._opened) { card._opened = true; card._onOpen(); }
  });
}

function simpleModuleEl(entryId, title, preview, detailHtml) {
  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML = `
    <div class="summary"><span class="grow"><b>${esc(title)}</b> <span class="muted">· ${esc(String(preview))}</span></span>
      <button type="button" class="btn btn-sm" data-edit>${t('edit')}</button></div>
    <div class="detail" data-detail hidden>${detailHtml}
      <div class="entry-actions"><button type="button" class="btn btn-primary" data-act="save">${t('save')}</button></div></div>`;
  moduleToggle(card);
  card.querySelector('[data-act="save"]').addEventListener('click', async () => {
    try { await api('PUT', '/api/metaobjects/search_panel', { id: entryId, fields: collectFields(card.querySelector('[data-detail]')) }); toast(t('saved')); }
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
  const itemsSuffix = t('items') ? (' ' + t('items')) : '';
  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML = `
    <div class="summary"><span class="grow"><b>${esc(title)}</b> <span class="muted" data-count>· ${gids.length}${itemsSuffix}</span></span>
      <button type="button" class="btn btn-sm" data-edit>${t('edit')}</button></div>
    <div class="detail" data-detail hidden>
      <div class="picker"><input type="search" data-search placeholder="${kind === 'product' ? t('sp.searchProduct') : t('sp.searchCollection')}"/>
        <div class="picker-results" data-results hidden></div></div>
      <div class="refresh-row">
        <span>${t('sp.refresh')}</span>
        <span class="rr-ctl">
          <input type="number" min="0" data-rn/>
          <select data-runit>
            <option value="0">${t('sp.now')}</option>
            <option value="60">${t('sp.min')}</option>
            <option value="3600">${t('sp.hour')}</option>
            <option value="86400">${t('sp.day')}</option>
          </select>
        </span>
        <span class="hint">${t('sp.pinHint')}</span>
      </div>
      <div class="bulkbar" data-bulk hidden></div>
      <div class="chips" data-chips></div>
      <div class="entry-actions"><button type="button" class="btn btn-primary" data-act="save">${t('save')}</button></div>
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
    bulkEl.innerHTML = `<span>${t('bulk.sel', selected.size)}</span>
      <button type="button" class="btn btn-sm" data-bup>${t('bulk.up')}</button>
      <button type="button" class="btn btn-sm" data-bdown>${t('bulk.down')}</button>
      <button type="button" class="btn btn-sm btn-danger" data-bdel>${t('bulk.del')}</button>
      <button type="button" class="btn btn-sm" data-bclr>${t('bulk.clr')}</button>`;
    bulkEl.querySelector('[data-bup]').onclick = () => moveSelected('up');
    bulkEl.querySelector('[data-bdown]').onclick = () => moveSelected('down');
    bulkEl.querySelector('[data-bdel]').onclick = () => { gids = gids.filter((g) => !selected.has(g)); selected.clear(); paint(); };
    bulkEl.querySelector('[data-bclr]').onclick = () => { selected.clear(); paint(); };
  }

  function paint() {
    countEl.textContent = '· ' + gids.length + itemsSuffix;
    chipsEl.innerHTML = gids.length ? gids.map((g, i) => {
      const m = meta[g] || {};
      const img = m.image ? `<img src="${esc(m.image)}" alt=""/>` : '<span class="noimg"></span>';
      return `<div class="chip${pinned.has(g) ? ' is-pinned' : ''}" draggable="true" data-gid="${esc(g)}">
        <input type="checkbox" class="chip-sel" data-sel ${selected.has(g) ? 'checked' : ''}/>
        <span class="drag">⠿</span>
        ${img}<span class="chip-name" title="${esc(g)}">${esc(m.title || g)}</span>
        <button type="button" class="chip-btn chip-pin${pinned.has(g) ? ' on' : ''}" data-pin title="${t('pin')}">${PIN_SVG}</button>
        <button type="button" class="chip-btn" data-up ${i === 0 ? 'disabled' : ''}>↑</button>
        <button type="button" class="chip-btn" data-down ${i === gids.length - 1 ? 'disabled' : ''}>↓</button>
        <button type="button" class="chip-btn chip-x" data-remove>✕</button></div>`;
    }).join('') : `<p class="muted">${t('sp.emptyAdd')}</p>`;
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
        ).join('') : `<div class="result muted">${t('noResult')}</div>`;
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
      try {
        await api('PUT', '/api/metaobjects/search_panel', { id: entryId, fields });
        toast(t('saved'));
      } catch (err) {
        // The *_config field is optional — if the metaobject doesn't have it,
        // still save the product/collection list (just without refresh/pin config).
        if (cfgField && /does not exist/i.test(err.message || '')) {
          delete fields[cfgField];
          await api('PUT', '/api/metaobjects/search_panel', { id: entryId, fields });
          toast(t('sp.savedNoCfg', cfgField));
        } else { throw err; }
      }
      countEl.textContent = '· ' + gids.length + itemsSuffix;
      paint();
    } catch (e) { toast(e.message, false); }
  });
  return card;
}

// ---- themes / apply ----
async function loadThemes() {
  const sel = $('#theme-select');
  sel.innerHTML = `<option>${t('theme.loading')}</option>`;
  try {
    const { themes } = await api('GET', '/api/themes');
    sel.innerHTML = themes.map((th) => `<option value="${th.id}">${esc(th.name)} ${th.role === 'main' ? '(' + t('theme.online') + ')' : '(' + th.role + ')'}</option>`).join('');
  } catch (e) { sel.innerHTML = `<option>${esc(e.message)}</option>`; }
}
$('#theme-refresh').addEventListener('click', loadThemes);

async function runApply(dryRun) {
  const id = $('#theme-select').value;
  const opt = $('#theme-select').selectedOptions[0];
  if (!id) return;
  if (!dryRun && /线上|live|main/.test(opt.textContent) && !confirm(t('apply.onlineWarn'))) return;
  const log = $('#apply-log');
  log.textContent = t('apply.running');
  try {
    const r = await api('POST', `/api/themes/${id}/apply`, { dryRun });
    log.textContent = (dryRun ? t('apply.dryHead') : t('apply.doneHead')) + r.log.join('\n');
    toast(dryRun ? t('apply.dryDone') : t('apply.doneToast'));
  } catch (e) { log.textContent = e.message; toast(e.message, false); }
}
$('#btn-dryrun').addEventListener('click', () => runApply(true));
$('#btn-apply').addEventListener('click', () => runApply(false));

// ---- search insights ----
let INS_DAYS = 7, INS_SUB = 'overview', INS_PAGE = 1;
function insSub(sub) {
  INS_SUB = sub; INS_PAGE = 1;
  document.querySelectorAll('#tab-insights [data-ins]').forEach((b) => b.classList.toggle('is-active', b.dataset.ins === sub));
  loadInsights();
}
async function loadInsights() {
  const body = $('#insights-body');
  if (!body) return;
  body.innerHTML = '<p class="muted">' + t('loading') + '</p>';
  try {
    if (INS_SUB === 'searchHistory' || INS_SUB === 'clickHistory') return renderInsHistory(body);
    const s = await api('GET', '/api/insights/summary?days=' + INS_DAYS);
    if (!s.enabled) { body.innerHTML = '<p class="muted">' + t('ins.disabled') + '</p>'; return; }
    if (INS_SUB === 'topSearches') return renderInsTopSearches(body, s);
    if (INS_SUB === 'nav') return renderInsNav(body, s);
    if (INS_SUB === 'topClicks') return renderInsTopClicks(body, s);
    return renderInsOverview(body, s);
  } catch (e) { body.innerHTML = '<p class="err">' + esc(e.message) + '</p>'; }
}
function insStat(label, val, sub) {
  return '<div class="card ins-stat"><div class="ins-stat__label">' + esc(label) + '</div><div class="ins-stat__val">' + esc(String(val)) + '</div>'
    + (sub ? '<div class="ins-stat__sub">' + esc(sub) + '</div>' : '') + '</div>';
}
function renderInsOverview(body, s) {
  const tt = s.totals || {};
  const sub = tt.submitted || 0;
  const zr = tt.searches ? Math.round((tt.zero / tt.searches) * 100) : 0;   // zero-result rate over (de-duped) searches
  let h = '<div class="ins-stats">';
  h += insStat(t('ins.searches'), tt.searches || 0);
  h += insStat(t('ins.submitted'), sub);
  h += insStat(t('ins.zeroRate'), zr + '%', (tt.zero || 0) + ' / ' + (tt.searches || 0));
  h += insStat(t('ins.navTotal'), tt.nav || 0);
  h += insStat(t('ins.sessions'), tt.sessions || 0);
  h += insStat(t('ins.drawerClicks'), tt.drawer_clicks || 0);
  h += insStat(t('ins.resultsClicks'), tt.results_clicks || 0);
  h += insStat(t('ins.recClicks'), tt.rec_clicks || 0);
  h += '</div>';
  body.innerHTML = h;
}
function insTable(head, rowsHtml) { return '<table class="ins-table"><thead><tr>' + head + '</tr></thead><tbody>' + rowsHtml + '</tbody></table>'; }
function renderInsTopSearches(body, s) {
  const rows = s.top || [];
  if (!rows.length) { body.innerHTML = '<p class="muted">' + t('ins.empty') + '</p>'; return; }
  const h = rows.map((r) => '<tr><td>' + esc(r.query) + '</td><td class="num">' + r.n + '</td><td class="num">' + (r.zero ? '<span class="ins-zero">' + r.zero + '</span>' : 0) + '</td></tr>').join('');
  body.innerHTML = insTable('<th>' + t('ins.colQuery') + '</th><th class="num">' + t('ins.colCount') + '</th><th class="num">' + t('ins.colZero') + '</th>', h);
}
function renderInsNav(body, s) {
  const rows = s.nav || [];
  if (!rows.length) { body.innerHTML = '<p class="muted">' + t('ins.empty') + '</p>'; return; }
  const h = rows.map((r) => '<tr><td>' + esc(r.query) + '</td><td class="num">' + r.n + '</td><td class="num">' + (r.zero ? '<span class="ins-zero">' + r.zero + '</span>' : 0) + '</td></tr>').join('');
  body.innerHTML = insTable('<th>' + t('ins.colQuery') + '</th><th class="num">' + t('ins.colCount') + '</th><th class="num">' + t('ins.colZero') + '</th>', h);
}
function renderInsTopClicks(body, s) {
  const rows = s.clicks || [];
  if (!rows.length) { body.innerHTML = '<p class="muted">' + t('ins.empty') + '</p>'; return; }
  const h = rows.map((r) => '<tr><td>' + esc(r.title || r.target_id) + '</td><td>' + insType(r.target_type) + '</td><td class="num">' + (r.drawer_n || 0) + '</td><td class="num">' + (r.results_n || 0) + '</td><td class="num">' + (r.rec_n || 0) + '</td><td class="num">' + r.n + '</td></tr>').join('');
  body.innerHTML = insTable('<th>' + t('ins.colTarget') + '</th><th>' + t('ins.colType') + '</th><th class="num">' + t('ins.colDrawerN') + '</th><th class="num">' + t('ins.colResultsN') + '</th><th class="num">' + t('ins.colRecN') + '</th><th class="num">' + t('ins.colTotal') + '</th>', h);
}
async function renderInsHistory(body) {
  const kind = INS_SUB === 'clickHistory' ? 'clicks' : 'searches';
  let e;
  try { e = await api('GET', '/api/insights/events?kind=' + kind + '&days=' + INS_DAYS + '&page=' + INS_PAGE + '&size=50'); }
  catch (err) { body.innerHTML = '<p class="err">' + esc(err.message) + '</p>'; return; }
  if (!e.enabled) { body.innerHTML = '<p class="muted">' + t('ins.disabled') + '</p>'; return; }
  if (!e.rows.length) { body.innerHTML = '<p class="muted">' + t('ins.empty') + '</p>'; return; }
  let head, rowsHtml;
  if (kind === 'searches') {
    head = '<th>' + t('ins.colTime') + '</th><th>' + t('ins.colQuery') + '</th><th class="num">' + t('ins.colResults') + '</th><th>' + t('ins.colSource') + '</th>';
    rowsHtml = e.rows.map((r) => '<tr><td class="ins-time">' + insTime(r.ts) + '</td><td>' + esc(r.query || t('ins.none')) + '</td><td class="num">' + (r.result_count === 0 ? '<span class="ins-zero">0</span>' : (r.result_count == null ? t('ins.none') : r.result_count)) + '</td><td>' + insSrc(r.source) + '</td></tr>').join('');
  } else {
    head = '<th>' + t('ins.colTime') + '</th><th>' + t('ins.colType') + '</th><th>' + t('ins.colTarget') + '</th><th>' + t('ins.colSource') + '</th><th>' + t('ins.colFromQuery') + '</th>';
    rowsHtml = e.rows.map((r) => '<tr><td class="ins-time">' + insTime(r.ts) + '</td><td>' + insType(r.target_type) + '</td><td>' + esc(r.title || r.target_id || t('ins.none')) + '</td><td>' + insSrc(r.source) + '</td><td>' + esc(r.query || t('ins.none')) + '</td></tr>').join('');
  }
  const pages = Math.max(1, Math.ceil(e.total / e.size));
  let h = insTable(head, rowsHtml);
  h += '<div class="ins-pager"><button class="btn btn-sm" data-ins-prev ' + (INS_PAGE <= 1 ? 'disabled' : '') + '>' + t('ins.prev') + '</button>'
    + '<span class="muted">' + t('ins.pageOf', INS_PAGE) + ' / ' + pages + ' · ' + t('ins.total', e.total) + '</span>'
    + '<button class="btn btn-sm" data-ins-next ' + (INS_PAGE >= pages ? 'disabled' : '') + '>' + t('ins.next') + '</button></div>';
  body.innerHTML = h;
  const pv = body.querySelector('[data-ins-prev]'); if (pv && INS_PAGE > 1) pv.addEventListener('click', () => { INS_PAGE--; renderInsHistory(body); });
  const nx = body.querySelector('[data-ins-next]'); if (nx && INS_PAGE < pages) nx.addEventListener('click', () => { INS_PAGE++; renderInsHistory(body); });
}
function insTime(ts) { try { return new Date(ts).toLocaleString(LANG === 'zh' ? 'zh-CN' : 'en-GB', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }); } catch (e) { return esc(String(ts)); } }
function insType(tp) { return tp === 'collection' ? t('ins.tCollection') : t('ins.tProduct'); }
function insSrc(s) { return s === 'results' ? t('ins.srcResults') : (s === 'recommendation' ? t('ins.srcRecommendation') : (s === 'drawer' ? t('ins.srcDrawer') : t('ins.none'))); }

// ---- init ----
(async () => {
  // Sidebar collapse (persisted per user).
  const appEl = document.getElementById('app');
  if (localStorage.getItem('cgp-admin-collapsed') === '1') appEl.classList.add('is-collapsed');
  const sbToggle = document.getElementById('sidebar-toggle');
  if (sbToggle) sbToggle.addEventListener('click', () => {
    appEl.classList.toggle('is-collapsed');
    localStorage.setItem('cgp-admin-collapsed', appEl.classList.contains('is-collapsed') ? '1' : '0');
  });
  // Language toggle (works even before the Shopify session resolves).
  document.querySelectorAll('#lang-toggle button').forEach((b) => {
    b.classList.toggle('is-active', b.dataset.lang === LANG);
    b.addEventListener('click', () => setLang(b.dataset.lang));
  });
  applyI18n();
  document.querySelectorAll('#tab-insights [data-ins]').forEach((b) => b.addEventListener('click', () => insSub(b.dataset.ins)));
  const insRange = $('#ins-range');
  if (insRange) insRange.addEventListener('change', (e) => { INS_DAYS = +e.target.value || 7; INS_PAGE = 1; loadInsights(); });
  const insReset = $('#ins-reset');
  if (insReset) insReset.addEventListener('click', async () => {
    if (!confirm(t('ins.resetConfirm'))) return;
    try { await api('POST', '/api/insights/reset'); toast(t('ins.resetDone')); INS_PAGE = 1; loadInsights(); }
    catch (e) { toast(e.message, false); }
  });
  try {
    const tk = await sessionToken();
    STORE = (decodeJwtPayload(tk).dest || '').replace(/^https?:\/\//, '');
    const handle = STORE.replace('.myshopify.com', '');
    const sd = `https://admin.shopify.com/store/${handle}/apps/search-and-discovery`;
    $('#sd-link').href = sd;
    $('#boosts-link').href = sd + '/search/product-boosts';
    $('#synonyms-link').href = sd + '/search/synonyms';
    $('#store').textContent = STORE + ' ✓';
    applyRoute(location.pathname);
  } catch (e) {
    $('#store').textContent = String(e.message || e);
    $('#meta-body').innerHTML = '<p class="err">' + esc(String(e.message || e)) + '</p>' +
      '<p class="muted">' + t('init.embedErr') + '</p>';
  }
})();
