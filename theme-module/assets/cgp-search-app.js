/* ============================================================
   cgp-search-app.js
   Client-side faceted results (Option A) for search + collection.
   S&D powers WHAT matches (relevance/synonyms); this app fetches the full
   matched set as JSON, builds accurate facets (Brands / Availability /
   Product type / On sale / Price), filters/sorts, and lazy-renders cards.
   Card markup mirrors snippets/cgp-card-product.liquid → existing CSS +
   cgp-card.js (variant change / add-to-cart) apply via window.cgpBindCards.
   ============================================================ */
(function () {
  'use strict';

  var mount = document.querySelector('[data-cgp-search-app]');
  if (!mount) return;

  var CFG = window.CGP_CONFIG || {};
  var BADGES = (window.CGP_BADGES || []).filter(function (b) { return b.enabled !== false && b.tag; });
  var ENDPOINT = mount.dataset.endpoint || '/search?q=' + encodeURIComponent(mount.dataset.q || '');
  // On the search page, use the page's REAL query string so structured/faceted
  // queries (e.g. q=product_type:"Slider") are reproduced exactly. The Liquid
  // data-endpoint uses `search.terms | url_encode`, which can lose such queries —
  // the cgp-json fetch then returned 0 and the app fell back to the native layout.
  if (/\/search(\b|$|\.)/.test(location.pathname) && location.search.indexOf('q=') !== -1) {
    var sqs = location.search;
    if (sqs.indexOf('type=') === -1) sqs += '&type=product';
    ENDPOINT = location.pathname + sqs;
  }
  var MAX_PAGES = 20;
  var CHUNK = parseInt(CFG.perPage, 10) || 24;
  var SHOW_SIDEBAR = CFG.showSidebar !== false;
  // Search vs collection: different valid Shopify sort_by values.
  // value '' = no sort_by → search:relevance, collection:its own Admin sort order.
  var IS_SEARCH = ENDPOINT.indexOf('/search') !== -1;
  var SORTS = IS_SEARCH
    ? [['', 'Relevance'], ['price-ascending', 'Price: Low to High'], ['price-descending', 'Price: High to Low']]
    : [['', 'Featured'], ['best-selling', 'Best selling'], ['created-descending', 'Newest'], ['created-ascending', 'Oldest'], ['price-ascending', 'Price: Low to High'], ['price-descending', 'Price: High to Low'], ['title-ascending', 'Title A–Z'], ['title-descending', 'Title Z–A']];
  // Current search term (empty on collection pages).
  var QUERY = (function () { var m = ENDPOINT.match(/[?&]q=([^&]*)/); return m ? decodeURIComponent(m[1].replace(/\+/g, ' ')) : ''; })();
  // Which product types float above the rest, for THIS query. Rule-based
  // (CGP_CONFIG.sortRules: keyword→types) when rules exist; otherwise the single
  // cgp_search_priority_types setting. No rule match / no query → no reorder.
  var PRIORITY = (function () {
    var rules = CFG.sortRules || [];
    if (rules.length) {
      var q = QUERY.trim().toLowerCase();
      if (!q) return [];
      var types = [];
      rules.forEach(function (r) {
        var hit = (r.keywords || []).some(function (k) {
          k = String(k).trim().toLowerCase();
          return k && (q.indexOf(k) !== -1 || k.indexOf(q) !== -1);
        });
        if (hit) types = types.concat(r.types || []);
      });
      return types.map(function (t) { return String(t).trim().toLowerCase(); });
    }
    return String(CFG.priorityTypes || '').split(',').map(function (s) { return s.trim().toLowerCase(); }).filter(Boolean);
  })();

  // Current collection handle (collection pages only). Used to hide a custom badge
  // whose link points back to THIS collection — e.g. a "Summer Sale" badge linking
  // to /collections/summer-sale is redundant on the summer-sale collection page.
  var collMatch = location.pathname.match(/\/collections\/([^\/?#]+)/);
  var CUR_COLLECTION = collMatch ? decodeURIComponent(collMatch[1]).toLowerCase() : '';
  function linkCollectionHandle(link) {
    if (!link) return '';
    var m = String(link).match(/\/collections\/([^\/?#]+)/);
    return m ? decodeURIComponent(m[1]).toLowerCase() : '';
  }
  // Status badges have no link, so their "own collection" = the collection whose
  // handle matches the badge's tag (Shopify handleize), e.g. tag "Clearance" → clearance.
  function handleizeTag(t) {
    return String(t || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }

  var FACETS = [
    { key: 'brands', title: 'Brands' },
    { key: 'status', title: 'Availability' },
    { key: 'types', title: 'Product type' },
    { key: 'sale', title: 'On sale' },
    { key: 'price', title: 'Price, £' }
  ];

  var money = function (cents) {
    var v = parseFloat(cents);
    // No / zero price → "£TBC" (To Be Confirmed) instead of £0.00.
    if (isNaN(v) || v <= 0) return '£TBC';
    return '£' + (v / 100).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };
  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  var band = function (d) { return d > 0 ? Math.floor(d / 10) * 10 : null; };

  var ALL = [];
  var state = { brands: {}, types: {}, status: {}, sale: {}, pmin: null, pmax: null, sort: '' };
  var rendered = 0, view = [];
  var MODE = CFG.paginationType === 'infinite' ? 'infinite' : 'paginate';
  var page = 1;

  // One-stop diagnostic: type CGP_DEBUG in the console to see everything.
  window.CGP_DEBUG = { endpoint: ENDPOINT, fetched: 0, pages: 0 };

  /* ---------- Fetch ---------- */
  function fetchPage(pageNum) {
    var sep = ENDPOINT.indexOf('?') === -1 ? '?' : '&';
    // Don't send page=1 — Shopify canonical-redirects ?page=1 and can drop the
    // collection's products; match the working base view URL for the first page.
    // No custom Accept header + a cache-buster so the fetch behaves like a normal
    // browser navigation (a JSON Accept header / CDN cache returned 0 products
    // for collection fetches even though the same URL works in the browser).
    var url = ENDPOINT + sep + 'view=cgp-json' + (pageNum > 1 ? '&page=' + pageNum : '') + (state.sort ? '&sort_by=' + encodeURIComponent(state.sort) : '') + '&_cgp=' + Date.now();
    return fetch(url, { credentials: 'same-origin' })
      .then(function (r) { return r.text(); })
      .then(function (txt) {
        try { return JSON.parse(txt); }
        catch (e) {
          window.CGP_DEBUG['page' + pageNum + 'ParseError'] = String(e) + ' | first 120 chars: ' + txt.slice(0, 120);
          console.warn('[cgp-search-app] page ' + pageNum + ' did not return JSON:', txt.slice(0, 200));
          return { products: [] };
        }
      })
      .catch(function (e) {
        window.CGP_DEBUG['page' + pageNum + 'FetchError'] = String(e);
        console.warn('[cgp-search-app] page ' + pageNum + ' fetch failed:', e);
        return { products: [] };
      });
  }
  function fallback(reason) {
    window.CGP_DEBUG.fallback = reason;
    console.warn('[cgp-search-app] falling back to server results (' + reason + ')');
    // Reveal the server-rendered results (hidden by default to avoid a flash).
    document.documentElement.classList.add('cgp-app-failed');
    mount.style.display = 'none';
  }
  function safeRun(label, fn) {
    try { fn(); return true; }
    catch (e) {
      window.CGP_DEBUG[label + 'Error'] = String(e && e.stack || e);
      console.error('[cgp-search-app] ' + label + ' error:', e);
      return false;
    }
  }
  function fetchAll() {
    return fetchPage(1).then(function (first) {
      ALL = (first && first.products) || [];
      window.CGP_DEBUG.fetched = ALL.length;
      window.CGP_DEBUG.pages = (first && first.pages) || 0;
      window.CGP_DEBUG.total = (first && first.total) || 0;
      // A genuinely-empty collection/search still returns a valid JSON object
      // (numeric total/pages). Only fall back to the native layout when the fetch
      // or parse actually FAILED (fetchPage returns a bare {products:[]} then).
      var realResponse = first && (typeof first.total === 'number' || typeof first.pages === 'number');
      if (!ALL.length) {
        if (!realResponse) { fallback('no products from ' + ENDPOINT); return; }
        if (!safeRun('build', build)) { fallback('build threw'); return; }
        safeRun('update', update); // render our own empty state ("No products found")
        return;
      }
      if (!safeRun('build', build)) { fallback('build threw'); return; }
      var pages = Math.min(first.pages || 1, MAX_PAGES);
      var rest = [];
      for (var p = 2; p <= pages; p++) rest.push(fetchPage(p));
      return Promise.all(rest).then(function (results) {
        results.forEach(function (res) { if (res && res.products) ALL = ALL.concat(res.products); });
        window.CGP_DEBUG.fetched = ALL.length;
        safeRun('update', update);
      });
    });
  }
  // Fetch every page in the current sort order; return the combined product list.
  function fetchAllPages() {
    return fetchPage(1).then(function (first) {
      var all = (first && first.products) || [];
      var pages = Math.min((first && first.pages) || 1, MAX_PAGES);
      var rest = [];
      for (var p = 2; p <= pages; p++) rest.push(fetchPage(p));
      return Promise.all(rest).then(function (results) {
        results.forEach(function (res) { if (res && res.products) all = all.concat(res.products); });
        return all;
      });
    });
  }
  // Sorting is server-side (Shopify sort_by). Changing Sort re-fetches in the new
  // order; filters stay client-side (no re-fetch) and preserve that order.
  function reloadForSort() {
    fetchAllPages().then(function (all) {
      if (!all.length) return;
      ALL = all;
      window.CGP_DEBUG.fetched = ALL.length;
      page = 1;
      safeRun('update', update);
    });
  }

  /* ---------- Filtering ---------- */
  function isEmpty(o) { for (var k in o) { if (o[k]) return false; } return true; }
  function matches(p, exclude) {
    if (exclude !== 'brands' && !isEmpty(state.brands) && !state.brands[p.vendor]) return false;
    if (exclude !== 'types' && !isEmpty(state.types) && !state.types[p.type]) return false;
    if (exclude !== 'status' && !isEmpty(state.status) && !state.status[p.status]) return false;
    if (exclude !== 'sale' && !isEmpty(state.sale)) {
      var b = band(p.discount);
      if (b === null || !state.sale[b]) return false;
    }
    if (exclude !== 'price') {
      var pr = p.price / 100;
      if (state.pmin != null && pr < state.pmin) return false;
      if (state.pmax != null && pr > state.pmax) return false;
    }
    return true;
  }
  // Default search order: keep relevance/boosts, but float "main product" types
  // (PRIORITY) above accessories. Stable sort, so boost order is preserved per tier.
  function applyPriority(list) {
    if (!IS_SEARCH || state.sort !== '' || !PRIORITY.length) return list;
    return list.map(function (p, i) {
      var r = PRIORITY.indexOf((p.type || '').toLowerCase());
      return { p: p, i: i, r: r === -1 ? 999 : r };
    }).sort(function (a, b) { return (a.r - b.r) || (a.i - b.i); }).map(function (o) { return o.p; });
  }
  function tally(exclude, keyFn) {
    var m = {};
    for (var i = 0; i < ALL.length; i++) {
      var p = ALL[i];
      if (!matches(p, exclude)) continue;
      var k = keyFn(p);
      if (k === null || k === undefined || k === '') continue;
      m[k] = (m[k] || 0) + 1;
    }
    return m;
  }

  /* ---------- Facet rows ---------- */
  function rowsFor(key) {
    if (key === 'brands') {
      var bm = tally('brands', function (p) { return p.vendor; });
      return Object.keys(bm).sort().map(function (v) { return { value: v, label: v, count: bm[v], checked: !!state.brands[v] }; });
    }
    if (key === 'types') {
      var tm = tally('types', function (p) { return p.type; });
      return Object.keys(tm).sort().map(function (v) { return { value: v, label: v, count: tm[v], checked: !!state.types[v] }; });
    }
    if (key === 'status') {
      var sm = tally('status', function (p) { return p.status; });
      var order = [['instock', (CFG.labels && CFG.labels.instock) || 'In Stock'],
                   ['preorder', (CFG.labels && CFG.labels.preorder) || 'Pre Order'],
                   ['oos', (CFG.labels && CFG.labels.oos) || 'Out of Stock']];
      return order.filter(function (o) { return sm[o[0]]; }).map(function (o) {
        return { value: o[0], label: o[1], count: sm[o[0]], checked: !!state.status[o[0]] };
      });
    }
    if (key === 'sale') {
      var salem = tally('sale', function (p) { return band(p.discount); });
      return Object.keys(salem).map(Number).sort(function (a, b) { return a - b; }).map(function (n) {
        return { value: n, label: n + '–' + (n + 10) + '%', count: salem[n], checked: !!state.sale[n] };
      });
    }
    return [];
  }
  function rowsHTML(key, rows) {
    return rows.map(function (r) {
      return '<label class="cgp-facet__row"><input type="checkbox" data-facet="' + key + '" value="' + esc(r.value) + '"' +
        (r.checked ? ' checked' : '') + '><span>' + esc(r.label) + '</span><em>(' + r.count + ')</em></label>';
    }).join('');
  }
  function priceHTML() {
    var prices = ALL.filter(function (p) { return matches(p, 'price'); }).map(function (p) { return p.price / 100; });
    var lo = prices.length ? Math.floor(Math.min.apply(null, prices)) : 0;
    var hi = prices.length ? Math.ceil(Math.max.apply(null, prices)) : 0;
    var hasVal = state.pmin != null || state.pmax != null;
    return '<div class="cgp-facet__price">' +
      '<input type="number" class="cgp-price-min" placeholder="' + lo + '" value="' + (state.pmin != null ? state.pmin : '') + '">' +
      '<span>–</span>' +
      '<input type="number" class="cgp-price-max" placeholder="' + hi + '" value="' + (state.pmax != null ? state.pmax : '') + '">' +
      '<button type="button" class="cgp-price-apply">Go</button>' +
      (hasVal ? '<button type="button" class="cgp-price-clear" aria-label="Clear price">&times;</button>' : '') +
      '</div>';
  }
  function bodyHTML(key) {
    if (key === 'price') return priceHTML();
    return rowsHTML(key, rowsFor(key));
  }
  function activeCount(key) {
    if (key === 'price') return (state.pmin != null || state.pmax != null) ? 1 : 0;
    return Object.keys(state[key]).filter(function (k) { return state[key][k]; }).length;
  }

  /* ---------- Render facets (sidebar + dropdowns) ---------- */
  function renderFacets() {
    if (SHOW_SIDEBAR) {
      var aside = mount.querySelector('.cgp-app__facets');
      if (aside) {
        aside.innerHTML = FACETS.map(function (f) {
          return '<div class="cgp-facet"><div class="cgp-facet__title">' + esc(f.title) + '</div><div class="cgp-facet__body">' + bodyHTML(f.key) + '</div></div>';
        }).join('');
      }
    }
    FACETS.forEach(function (f) {
      var panel = mount.querySelector('[data-panel="' + f.key + '"]');
      if (panel) panel.innerHTML = bodyHTML(f.key);
      var n = mount.querySelector('[data-ddn="' + f.key + '"]');
      if (n) { var c = activeCount(f.key); n.textContent = c ? ' (' + c + ')' : ''; }
    });
    // Mobile/tablet filter sheet: all facet groups in one scrollable list.
    var sheetBody = mount.querySelector('[data-cgp-sheet-body]');
    if (sheetBody) {
      sheetBody.innerHTML = FACETS.map(function (f) {
        return '<div class="cgp-facet"><div class="cgp-facet__title">' + esc(f.title) + '</div><div class="cgp-facet__body">' + bodyHTML(f.key) + '</div></div>';
      }).join('');
    }
    var totalActive = FACETS.reduce(function (acc, f) { return acc + activeCount(f.key); }, 0);
    var fn = mount.querySelector('[data-filtern]');
    if (fn) fn.textContent = totalActive ? ' (' + totalActive + ')' : '';
    var applyBtn = mount.querySelector('[data-cgp-filter-apply]');
    if (applyBtn) applyBtn.textContent = 'Show ' + view.length + ' results';
    bindFacets();
  }
  function bindFacets() {
    mount.querySelectorAll('input[data-facet]').forEach(function (cb) {
      if (cb.dataset.b) return; cb.dataset.b = '1';
      cb.addEventListener('change', function () {
        var f = cb.dataset.facet, v = cb.value;
        if (f === 'sale') v = Number(v);
        if (cb.checked) state[f][v] = true; else delete state[f][v];
        update();
      });
    });
    mount.querySelectorAll('.cgp-price-apply').forEach(function (btn) {
      if (btn.dataset.b) return; btn.dataset.b = '1';
      btn.addEventListener('click', function () {
        var box = btn.closest('.cgp-facet__price');
        var mn = box.querySelector('.cgp-price-min').value, mx = box.querySelector('.cgp-price-max').value;
        state.pmin = mn === '' ? null : parseFloat(mn);
        state.pmax = mx === '' ? null : parseFloat(mx);
        update();
      });
    });
    mount.querySelectorAll('.cgp-price-clear').forEach(function (btn) {
      if (btn.dataset.b) return; btn.dataset.b = '1';
      btn.addEventListener('click', function () { state.pmin = null; state.pmax = null; update(); });
    });
  }

  /* ---------- Cards ---------- */
  // Custom badges (CGP_BADGES) render BELOW the image; position picks the side
  // ("right" → right, else left). Linked badges are real <a> (underlined via CSS).
  function cbadgeSide(p, side) {
    var tags = p.tags || [];
    var items = BADGES.filter(function (b) {
      var s = /right/i.test(b.position || '') ? 'right' : 'left';
      if (s !== side || tags.indexOf(b.tag) === -1) return false;
      // Hide a badge that links back to the collection we're currently viewing
      // (when the setting is enabled).
      if (CFG.hideSelfCollectionBadge !== false && CUR_COLLECTION && linkCollectionHandle(b.link) === CUR_COLLECTION) return false;
      return true;
    });
    if (!items.length) return '';
    var inner = items.map(function (b) {
      var cls = b.image ? 'cgp-cbadge cgp-cbadge--img' : 'cgp-cbadge';
      var content = b.image ? '<img src="' + esc(b.image) + '" alt="' + esc(b.label) + '" loading="lazy">' : esc(b.label);
      var style = b.image ? '' : 'background:' + esc(b.bg) + ';color:' + esc(b.text) + ';';
      if (b.link) return '<a class="' + cls + ' cgp-cbadge--link" href="' + esc(b.link) + '" style="' + style + '" data-track="custom-badge">' + content + '</a>';
      return '<span class="' + cls + '" style="' + style + '">' + content + '</span>';
    }).join('');
    return '<div class="cgp-cbadges cgp-cbadges--' + side + '">' + inner + '</div>';
  }
  function badgesBelow(p) {
    var g = cbadgeSide(p, 'left') + cbadgeSide(p, 'right');
    return g ? '<div class="cgp-cbadges-below">' + g + '</div>' : '';
  }
  // Product-status badges (CGP_STATUS_BADGES, tag-triggered) overlay the image
  // bottom-right. Distinct from custom badges; multiple stack.
  function statusBadges(p) {
    var tags = p.tags || [];
    var hideSelf = CFG.hideSelfCollectionStatusBadge !== false && CUR_COLLECTION;
    var items = (window.CGP_STATUS_BADGES || []).filter(function (b) {
      if (b.enabled === false || !b.tag || tags.indexOf(b.tag) === -1) return false;
      // On its own collection page (handle == handleize(tag)), hide it.
      if (hideSelf && handleizeTag(b.tag) === CUR_COLLECTION) return false;
      return true;
    });
    if (!items.length) return '';
    var inner = items.map(function (b) {
      return '<span class="cgp-statusbadge" style="background:' + esc(b.bg) + ';color:' + esc(b.text) + ';">' + esc(b.label || b.tag) + '</span>';
    }).join('');
    return '<div class="cgp-statusbadges">' + inner + '</div>';
  }
  function cardHTML(p) {
    var curDisc = (p.price > 0 && p.compare > p.price) ? Math.round((p.compare - p.price) / p.compare * 100) : 0;
    var statusLabel = (CFG.labels && CFG.labels[p.status]) || p.status;
    var hideStatus = (p.status === 'instock' && CFG.showInstock === false) ? ' cgp-hidden' : '';
    var h = '<div class="cgp-card cgp-card--' + p.status + '" data-cgp-card data-product-id="' + p.id + '" data-discount="' + p.discount + '" data-status="' + p.status + '">';
    h += '<div class="cgp-card__media"><a href="' + esc(p.url) + '" class="cgp-card__media-link" tabindex="-1" aria-hidden="true">';
    h += p.image ? '<img class="cgp-card__img" data-cgp-main-image="' + esc(p.image) + '" src="' + esc(p.image) + '" alt="' + esc(p.title) + '" loading="lazy">' : '<div class="cgp-card__img"></div>';
    if (p.image2) h += '<img class="cgp-card__img cgp-card__img--hover" src="' + esc(p.image2) + '" alt="" loading="lazy" aria-hidden="true">';
    h += '</a>';
    if (CFG.showDiscountBadge !== false) {
      h += '<span class="cgp-badge cgp-badge--discount' + (curDisc > 0 ? '' : ' cgp-hidden') + '" data-cgp-discount-badge data-suffix="' + esc(CFG.discountSuffix || '% OFF') + '">' + curDisc + (CFG.discountSuffix || '% OFF') + '</span>';
    }
    h += '<span class="cgp-badge cgp-badge--status cgp-badge--' + p.status + hideStatus + '" data-cgp-status>' + esc(statusLabel) + '</span>';
    h += statusBadges(p);
    h += '</div>';
    h += badgesBelow(p);
    h += '<div class="cgp-card__info">';
    if (p.promos && p.promos.length) {
      h += '<div class="cgp-promos">';
      p.promos.forEach(function (pr) {
        h += '<button type="button" class="cgp-promo" data-cgp-promo><span class="cgp-promo__label">' + esc(pr.label) + '</span>' +
             '<span class="cgp-promo__data" hidden><span class="cgp-promo__t">' + esc(pr.title) + '</span>' +
             '<span class="cgp-promo__b">' + (pr.body || '') + '</span><span class="cgp-promo__c">' + (pr.cta || '') + '</span></span></button>';
      });
      h += '</div>';
    }
    h += '<a href="' + esc(p.url) + '" class="cgp-card__title-link"><h3 class="cgp-card__title">' + esc(p.title) + '</h3></a>';
    if (p.multi && p.variants && p.variants.length) {
      h += '<div class="cgp-card__options">';
      if (CFG.showOptionLabel) h += '<label class="cgp-card__option-label">' + esc(p.option_name) + ':</label>';
      h += '<select class="cgp-card__variant" data-cgp-variant aria-label="' + esc(p.option_name || 'Variant') + '">';
      p.variants.forEach(function (v) {
        h += '<option value="' + v.id + '" data-price="' + v.price + '" data-compare="' + (v.compare || 0) + '" data-price-str="' + esc(v.price_str || '') + '" data-compare-str="' + esc(v.compare_str || '') + '" data-image="' + esc(v.image || '') + '" data-available="' + v.available + '" data-policy="' + esc(v.policy) + '" data-uk="' + (v.uk || 0) + '" data-ew="' + (v.ew || 0) + '"' + (v.id === p.sel ? ' selected' : '') + '>' + esc(v.title) + '</option>';
      });
      h += '</select></div>';
    }
    // Prefer Shopify-formatted strings (correct currency for the active market);
    // fall back to local £ formatting for old payloads without *_str.
    var curStr = (p.price > 0) ? (p.price_str || money(p.price)) : '£TBC';
    var cmpStr = p.compare_str || money(p.compare);
    h += '<div class="cgp-card__price-actions"><div class="cgp-card__price" data-cgp-price>';
    if (p.price > 0 && p.compare > p.price) h += '<span class="cgp-card__price-compare" data-cgp-compare>' + esc(cmpStr) + '</span>';
    h += '<span class="cgp-card__price-current" data-cgp-current>' + esc(curStr) + '</span>';
    h += '<span class="cgp-card__price-vat">' + esc(CFG.vatLabel || 'ex.VAT') + '</span></div>';
    if (CFG.showWishlist || CFG.showAddCart) {
      // XB Wishlist needs the product handle to render the item in its drawer
      // (without it the wishlist opens blank even though the item was recorded).
      var wlHandle = (String(p.url || '').match(/\/products\/([^\/?#]+)/) || [])[1] || '';
      var wlStock = p.status !== 'oos' ? 'true' : 'false';
      h += '<div class="cgp-card__actions">';
      if (CFG.showWishlist) {
        h += '<div class="xb-wishlist__btn-custom"><div class="xb-wishlist__add" xb-product-id="' + p.id + '" xb-product-title="' + esc(p.title) + '" xb-product-variant="' + p.sel + '" xb-is-in-stock="' + wlStock + '" xb-product-handle="' + esc(wlHandle) + '"><button type="button" class="cgp-action-btn" aria-label="Add to wishlist"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg></button></div><div class="xb-wishlist__loading" xb-product-id="' + p.id + '">Loading...</div><div class="xb-wishlist__remove" xb-product-id="' + p.id + '" xb-is-in-stock="' + wlStock + '"><button type="button" class="cgp-action-btn cgp-action-btn--active" aria-label="Remove from wishlist"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg></button></div></div>';
      }
      if (CFG.showAddCart) {
        h += '<button type="button" class="cgp-action-btn cgp-card__add-cart" data-cgp-add-cart data-variant-id="' + p.sel + '"' + (p.status === 'oos' ? ' disabled' : '') + ' aria-label="Add to cart"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path></svg></button>';
      }
      h += '</div>';
    }
    h += '</div></div></div>';
    return h;
  }
  function liFor(p) {
    try { return '<li class="grid__item">' + cardHTML(p) + '</li>'; }
    catch (e) { console.error('[cgp-search-app] card render error for product', p && p.id, e); return ''; }
  }
  function appendCards(list) {
    var grid = mount.querySelector('.cgp-app__grid');
    if (!grid) return;
    var frag = document.createElement('div');
    frag.innerHTML = list.map(liFor).join('');
    while (frag.firstChild) grid.appendChild(frag.firstChild);
    if (window.cgpBindCards) window.cgpBindCards(grid);
  }
  function loadMore() {
    appendCards(view.slice(rendered, rendered + CHUNK));
    rendered = Math.min(rendered + CHUNK, view.length);
    var more = mount.querySelector('.cgp-app__more');
    if (more && rendered >= view.length) more.innerHTML = '';
  }
  function pageNavHTML(totalPages) {
    if (totalPages <= 1) return '';
    var h = '<div class="cgp-pagenav">';
    var add = function (n, lbl, cls) { h += '<button type="button" class="cgp-pagebtn ' + (cls || '') + '" data-page="' + n + '">' + (lbl || n) + '</button>'; };
    if (page > 1) add(page - 1, '‹');
    var from = Math.max(1, page - 2), to = Math.min(totalPages, page + 2);
    if (from > 1) { add(1); if (from > 2) h += '<span class="cgp-pagedots">…</span>'; }
    for (var i = from; i <= to; i++) add(i, i, i === page ? 'is-active' : '');
    if (to < totalPages) { if (to < totalPages - 1) h += '<span class="cgp-pagedots">…</span>'; add(totalPages); }
    if (page < totalPages) add(page + 1, '›');
    return h + '</div>';
  }
  function renderGrid() {
    var grid = mount.querySelector('.cgp-app__grid');
    if (!grid) return;
    grid.innerHTML = '';
    var more = mount.querySelector('.cgp-app__more');
    if (!view.length) {
      grid.innerHTML = '<li class="cgp-app__empty">' + esc(CFG.emptyText || 'No products found.') + '</li>';
      if (more) more.innerHTML = '';
      return;
    }
    if (MODE === 'infinite') {
      rendered = 0;
      appendCards(view.slice(0, CHUNK));
      rendered = Math.min(CHUNK, view.length);
      if (more) {
        more.innerHTML = rendered < view.length ? '<button type="button" class="cgp-app__more-btn">Load more</button>' : '';
        var b = more.querySelector('.cgp-app__more-btn');
        if (b) b.addEventListener('click', loadMore);
      }
    } else {
      var totalPages = Math.max(1, Math.ceil(view.length / CHUNK));
      if (page > totalPages) page = 1;
      var start = (page - 1) * CHUNK;
      appendCards(view.slice(start, start + CHUNK));
      if (more) {
        more.innerHTML = pageNavHTML(totalPages);
        more.querySelectorAll('.cgp-pagebtn').forEach(function (btn) {
          btn.addEventListener('click', function () {
            page = parseInt(btn.dataset.page, 10);
            renderGrid();
            var top = mount.getBoundingClientRect().top + window.pageYOffset - 90;
            window.scrollTo({ top: top, behavior: 'smooth' });
          });
        });
      }
    }
  }

  /* ---------- Update ---------- */
  function update() {
    view = applyPriority(ALL.filter(function (p) { return matches(p, null); }));
    page = 1;
    rendered = 0;
    var count = mount.querySelector('.cgp-app__count');
    if (count) count.textContent = view.length + ' results';
    renderFacets();
    renderGrid();
  }

  /* ---------- Build layout ---------- */
  function build() {
    if (!mount.querySelector('.cgp-app')) {
      var dropdowns = FACETS.map(function (f) {
        return '<details class="cgp-dd"><summary class="cgp-dd__btn">' + esc(f.title) + '<span class="cgp-dd__n" data-ddn="' + f.key + '"></span></summary><div class="cgp-dd__panel" data-panel="' + f.key + '"></div></details>';
      }).join('');
      mount.innerHTML =
        '<div class="cgp-app' + (SHOW_SIDEBAR ? ' cgp-app--sidebar' : '') + '">' +
          '<div class="cgp-app__top' + (CFG.stickyBar ? ' cgp-app__top--sticky' : '') + '">' +
            '<div class="cgp-app__bar"><span class="cgp-app__count"></span></div>' +
            '<div class="cgp-app__dd">' +
              '<button type="button" class="cgp-app__filterbtn" data-cgp-filter-open>' +
                '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon></svg>' +
                'Filter<span class="cgp-app__filtern" data-filtern></span></button>' +
              dropdowns +
              '<label class="cgp-app__sortwrap">Sort by: <select class="cgp-app__sort">' +
                SORTS.map(function (o) { return '<option value="' + o[0] + '">' + o[1] + '</option>'; }).join('') +
              '</select></label></div>' +
          '</div>' +
          '<div class="cgp-app__body">' +
            (SHOW_SIDEBAR ? '<aside class="cgp-app__facets"></aside>' : '') +
            '<div class="cgp-app__main">' +
              '<ul class="grid product-grid cgp-app__grid grid--' + (CFG.columnsMobile || 2) + '-col-tablet-down grid--' + (CFG.columnsDesktop || 4) + '-col-desktop"></ul>' +
              '<div class="cgp-app__more"></div>' +
            '</div>' +
          '</div>' +
          // Mobile/tablet filter sheet (full-screen). Facets rendered into it by renderFacets().
          '<div class="cgp-app__sheet" data-cgp-sheet hidden>' +
            '<div class="cgp-app__sheet-head"><span>Filter</span><button type="button" class="cgp-app__sheet-x" data-cgp-filter-close aria-label="Close">&times;</button></div>' +
            '<div class="cgp-app__sheet-body" data-cgp-sheet-body></div>' +
            '<div class="cgp-app__sheet-foot">' +
              '<button type="button" class="cgp-app__sheet-clear" data-cgp-filter-clear>Clear all</button>' +
              '<button type="button" class="cgp-app__sheet-apply" data-cgp-filter-apply>Show results</button>' +
            '</div>' +
          '</div>' +
        '</div>';
      // Explicit grid column counts — CSS reads these vars (Dawn grid--N classes
      // were collapsing to 1 column on mobile).
      var gridEl = mount.querySelector('.cgp-app__grid');
      if (gridEl) {
        gridEl.style.setProperty('--cgp-cols-desktop', CFG.columnsDesktop || 4);
        gridEl.style.setProperty('--cgp-cols-mobile', CFG.columnsMobile || 2);
      }
      // Filter sheet open/close/clear (mobile/tablet). Facet changes update results
      // live behind the full-screen sheet; "Show results" just closes it.
      var sheet = mount.querySelector('[data-cgp-sheet]');
      function closeSheet() { sheet.hidden = true; document.body.classList.remove('cgp-sheet-open'); }
      mount.querySelector('[data-cgp-filter-open]').addEventListener('click', function () { sheet.hidden = false; document.body.classList.add('cgp-sheet-open'); });
      mount.querySelector('[data-cgp-filter-close]').addEventListener('click', closeSheet);
      mount.querySelector('[data-cgp-filter-apply]').addEventListener('click', closeSheet);
      mount.querySelector('[data-cgp-filter-clear]').addEventListener('click', function () {
        state.brands = {}; state.types = {}; state.status = {}; state.sale = {}; state.pmin = null; state.pmax = null;
        update();
      });
      mount.querySelector('.cgp-app__sort').addEventListener('change', function (e) { state.sort = e.target.value; reloadForSort(); });
      window.addEventListener('scroll', function () {
        if (MODE !== 'infinite' || rendered >= view.length) return;
        var grid = mount.querySelector('.cgp-app__grid');
        if (grid && grid.getBoundingClientRect().bottom < window.innerHeight + 500) loadMore();
      }, { passive: true });
      // close dropdowns on outside click
      document.addEventListener('click', function (e) {
        mount.querySelectorAll('details.cgp-dd[open]').forEach(function (d) {
          if (!d.contains(e.target)) d.removeAttribute('open');
        });
      });
    }
    update();
  }

  /* ---------- Boot ---------- */
  // Server results are hidden by default (html.js .cgp-server-results) so there's
  // no flash; if the app fails, fallback() reveals them via .cgp-app-failed.
  fetchAll().catch(function (e) {
    console.error('[cgp-search-app] fetch error:', e);
    fallback('fetch threw');
  });
})();
