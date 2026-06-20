/* ============================================================
   cgp-card.js
   Behaviour for the custom product card (search + collection).
   - Variant dropdown -> live price / compare / discount / image /
     stock status / add-to-cart state (everything follows the variant)
   - Add to cart (AJAX) + cart-drawer refresh
   - Discount filter pill bar (client-side bands, current page)
   - Infinite scroll (optional)
   Config comes from window.CGP_CONFIG (injected in layout/theme.liquid).
   No framework. Re-binds after Section Rendering swaps the grid.
   ============================================================ */
(function () {
  'use strict';

  var CFG = window.CGP_CONFIG || {
    imageFollowsVariant: false, showInstock: true, paginationType: 'paginate',
    labels: { instock: 'In Stock', preorder: 'Pre Order', oos: 'Out of Stock' }
  };

  var MONEY = function (cents) {
    var v = parseFloat(cents);
    if (isNaN(v)) return '';
    return '£' + (v / 100).toLocaleString('en-GB', {
      minimumFractionDigits: 2, maximumFractionDigits: 2
    });
  };

  /* Stock status of a variant option — mirrors snippets/cgp-variant-status.liquid
     and the JSON templates:
       instock  = UK Inventory or EW Inventory metafield > 0 (real or buffer warehouse)
       preorder = both 0 but the variant allows overselling (inventory_policy = continue)
       oos      = both 0 and policy = deny */
  function computeStatus(opt) {
    var uk = parseInt(opt.dataset.uk || '0', 10);
    var ew = parseInt(opt.dataset.ew || '0', 10);
    if (uk > 0 || ew > 0) return 'instock';
    if (opt.dataset.policy === 'continue') return 'preorder';
    return 'oos';
  }

  /* ---------- Variant selection: everything follows the variant ---------- */
  function onVariantChange(select) {
    var opt = select.selectedOptions[0];
    if (!opt) return;
    var card = select.closest('[data-cgp-card]');
    if (!card) return;

    var price = opt.dataset.price;
    var compare = parseFloat(opt.dataset.compare || '0');

    /* Price */
    var priceBox = card.querySelector('[data-cgp-price]');
    if (priceBox) {
      var cur = priceBox.querySelector('[data-cgp-current]');
      var cmp = priceBox.querySelector('[data-cgp-compare]');
      if (cur) cur.textContent = MONEY(price);
      if (compare > parseFloat(price)) {
        if (!cmp) {
          cmp = document.createElement('span');
          cmp.className = 'cgp-card__price-compare';
          cmp.setAttribute('data-cgp-compare', '');
          priceBox.insertBefore(cmp, cur);
        }
        cmp.textContent = MONEY(compare);
      } else if (cmp) {
        cmp.remove();
      }
    }

    /* Discount badge */
    var badge = card.querySelector('[data-cgp-discount-badge]');
    if (badge) {
      if (compare > parseFloat(price)) {
        var pct = Math.round((compare - parseFloat(price)) / compare * 100);
        badge.textContent = pct + (badge.dataset.suffix || '% OFF');
        badge.classList.remove('cgp-hidden');
      } else {
        badge.classList.add('cgp-hidden');
      }
    }

    /* Stock status badge */
    var status = computeStatus(opt);
    var statusEl = card.querySelector('[data-cgp-status]');
    if (statusEl) {
      statusEl.classList.remove('cgp-badge--instock', 'cgp-badge--preorder', 'cgp-badge--oos');
      statusEl.classList.add('cgp-badge--' + status);
      statusEl.textContent = (CFG.labels && CFG.labels[status]) || status;
      if (status === 'instock' && CFG.showInstock === false) {
        statusEl.classList.add('cgp-hidden');
      } else {
        statusEl.classList.remove('cgp-hidden');
      }
    }
    card.classList.remove('cgp-card--instock', 'cgp-card--preorder', 'cgp-card--oos');
    card.classList.add('cgp-card--' + status);
    card.dataset.status = status;

    /* Image — only when the merchant opted into "image follows variant" */
    if (CFG.imageFollowsVariant) {
      var img = card.querySelector('.cgp-card__img');
      if (img && img.tagName === 'IMG') {
        img.src = opt.dataset.image || img.dataset.cgpMainImage || img.src;
        img.removeAttribute('srcset');
      }
    }

    /* Add-to-cart button: variant id + stock (disable only when out of stock) */
    var atc = card.querySelector('[data-cgp-add-cart]');
    if (atc) {
      atc.dataset.variantId = opt.value;
      atc.disabled = (status === 'oos');
    }

    /* Wishlist: keep selected variant in sync */
    var wl = card.querySelector('.xb-wishlist__add');
    if (wl) wl.setAttribute('xb-product-variant', opt.value);
  }

  /* ---------- Add to cart + drawer refresh ---------- */
  function setLoading(btn, on) {
    if (!btn) return;
    if (on) {
      btn.classList.add('cgp-is-loading');
      btn.disabled = true;
      if (!btn.querySelector('.cgp-spinner')) {
        var s = document.createElement('span');
        s.className = 'cgp-spinner';
        btn.appendChild(s);
      }
    } else {
      btn.classList.remove('cgp-is-loading');
      btn.disabled = false;
      var sp = btn.querySelector('.cgp-spinner');
      if (sp) sp.remove();
    }
  }

  async function refreshCartDrawer() {
    var drawer = document.querySelector('cart-drawer');
    if (!drawer) return;
    try {
      var res = await fetch(window.location.pathname + '?sections=cart-drawer,cart-icon-bubble');
      var sections = await res.json();
      var parse = function (html, sel) {
        return new DOMParser().parseFromString(html, 'text/html').querySelector(sel);
      };
      var root = document.querySelector('#CartDrawer');
      if (root && sections['cart-drawer']) {
        var nd = parse(sections['cart-drawer'], '#CartDrawer');
        if (nd) root.innerHTML = nd.innerHTML;
      }
      var bubble = document.querySelector('#cart-icon-bubble');
      if (bubble && sections['cart-icon-bubble']) {
        var nb = parse(sections['cart-icon-bubble'], '#cart-icon-bubble');
        if (nb) bubble.innerHTML = nb.innerHTML;
      }
      var hasItems = !!document.querySelector('#CartDrawer .cart-item, #CartDrawer cart-drawer-items .cart-items');
      drawer.classList.toggle('is-empty', !hasItems);
      var inner = drawer.querySelector('.drawer__inner');
      if (inner) inner.classList.toggle('is-empty', !hasItems);
      var overlay = drawer.querySelector('#CartDrawer-Overlay');
      if (overlay) overlay.addEventListener('click', drawer.close.bind(drawer));
      if (typeof drawer.open === 'function') drawer.open();
    } catch (e) {
      if (typeof drawer.open === 'function') drawer.open();
    }
  }

  async function onAddToCart(btn) {
    var variantId = btn.dataset.variantId;
    if (!variantId) return;
    setLoading(btn, true);
    try {
      var res = await fetch('/cart/add.js', {
        method: 'POST',
        headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: variantId, quantity: 1 })
      });
      if (!res.ok) {
        var err = await res.json();
        alert((err && err.description) || 'Could not add to cart');
        return;
      }
      await refreshCartDrawer();
      // Keep the button coloured so the shopper sees it's now in the cart.
      btn.classList.add('cgp-action-btn--added');
    } catch (e) {
      alert('Network error — please try again.');
    } finally {
      setLoading(btn, false);
    }
  }

  /* ---------- Top filter bar (stock status + discount bands) ----------
     Both filters are combined: a product is shown only if it matches BOTH
     the active discount band and the active stock status. Counts + empty
     state are recomputed from the current page's products. */
  var filterState = { dmin: -1, dmax: Infinity, stock: 'all' };

  function bandMatch(d, min, max) {
    if (min < 0) return true;            // "All"
    return d > min && d <= max;           // min < d <= max
  }

  function applyFilters() {
    var grid = document.querySelector('#product-grid, .product-grid');
    if (!grid) return;
    var shown = 0;
    grid.querySelectorAll('[data-cgp-card]').forEach(function (card) {
      var d = parseInt(card.dataset.discount, 10) || 0;
      var st = card.dataset.status || 'instock';
      var ok = bandMatch(d, filterState.dmin, filterState.dmax) &&
               (filterState.stock === 'all' || st === filterState.stock);
      var li = card.closest('.grid__item') || card;
      li.style.display = ok ? '' : 'none';
      if (ok) shown++;
    });
    var empty = document.querySelector('[data-cgp-filter-empty]');
    if (empty) empty.style.display = shown === 0 ? '' : 'none';
  }

  // Live "(n)" counts on every pill; hide discount bands with zero products.
  function recountBars() {
    var grid = document.querySelector('#product-grid, .product-grid');
    if (!grid) return;
    var cards = grid.querySelectorAll('[data-cgp-card]');
    var total = cards.length;

    document.querySelectorAll('[data-cgp-discount-bar] [data-cgp-min]').forEach(function (pill) {
      if (!pill.dataset.cgpLabel) pill.dataset.cgpLabel = pill.textContent.trim();
      var min = parseFloat(pill.dataset.cgpMin);
      var max = parseFloat(pill.dataset.cgpMax);
      if (isNaN(max)) max = Infinity;
      var count = min < 0 ? total : 0;
      if (min >= 0) cards.forEach(function (c) {
        if (bandMatch(parseInt(c.dataset.discount, 10) || 0, min, max)) count++;
      });
      pill.textContent = pill.dataset.cgpLabel + ' (' + count + ')';
      pill.style.display = (min >= 0 && count === 0) ? 'none' : '';
    });

    document.querySelectorAll('[data-cgp-stock-bar] [data-cgp-status]').forEach(function (pill) {
      if (!pill.dataset.cgpLabel) pill.dataset.cgpLabel = pill.textContent.trim();
      var want = pill.dataset.cgpStatus;
      var count = want === 'all' ? total : 0;
      if (want !== 'all') cards.forEach(function (c) {
        if ((c.dataset.status || 'instock') === want) count++;
      });
      pill.textContent = pill.dataset.cgpLabel + ' (' + count + ')';
      pill.style.display = (want !== 'all' && count === 0) ? 'none' : '';
    });
  }

  function initDiscountBar(bar) {
    if (bar.dataset.cgpBound) return;
    bar.dataset.cgpBound = '1';
    bar.addEventListener('click', function (e) {
      var pill = e.target.closest('[data-cgp-min]');
      if (!pill) return;
      filterState.dmin = parseFloat(pill.dataset.cgpMin);
      var mx = parseFloat(pill.dataset.cgpMax);
      filterState.dmax = isNaN(mx) ? Infinity : mx;
      bar.querySelectorAll('[data-cgp-min]').forEach(function (p) {
        p.classList.toggle('is-active', p === pill);
      });
      applyFilters();
    });
  }

  function initStockBar(bar) {
    if (bar.dataset.cgpBound) return;
    bar.dataset.cgpBound = '1';
    bar.addEventListener('click', function (e) {
      var pill = e.target.closest('[data-cgp-status]');
      if (!pill) return;
      filterState.stock = pill.dataset.cgpStatus;
      bar.querySelectorAll('[data-cgp-status]').forEach(function (p) {
        p.classList.toggle('is-active', p === pill);
      });
      applyFilters();
    });
  }

  /* ---------- Infinite scroll ---------- */
  function initInfinite() {
    if (CFG.paginationType !== 'infinite') return;
    var grid = document.querySelector('ul.product-grid[data-cgp-next]');
    if (!grid || grid.dataset.cgpInfinite) return;
    grid.dataset.cgpInfinite = '1';

    // Hide the numbered pagination
    document.querySelectorAll('.pagination-wrapper').forEach(function (el) { el.style.display = 'none'; });

    var loading = false;
    function maybeLoad() {
      if (loading) return;
      var next = grid.getAttribute('data-cgp-next');
      if (!next) return;
      var rect = grid.getBoundingClientRect();
      if (rect.bottom > window.innerHeight + 700) return;
      loading = true;
      fetch(next).then(function (r) { return r.text(); }).then(function (html) {
        var doc = new DOMParser().parseFromString(html, 'text/html');
        var newGrid = doc.querySelector('ul.product-grid');
        if (newGrid) {
          Array.prototype.slice.call(newGrid.children).forEach(function (li) {
            grid.appendChild(li);
          });
          grid.setAttribute('data-cgp-next', newGrid.getAttribute('data-cgp-next') || '');
        } else {
          grid.setAttribute('data-cgp-next', '');
        }
        bind(grid);
        recountBars();
        applyFilters();
        loading = false;
        maybeLoad();
      }).catch(function () { loading = false; });
    }

    var ticking = false;
    window.addEventListener('scroll', function () {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () { maybeLoad(); ticking = false; });
    }, { passive: true });
    maybeLoad();
  }

  /* ---------- Bind everything ---------- */
  function bind(root) {
    root = root || document;
    root.querySelectorAll('[data-cgp-variant]').forEach(function (sel) {
      if (sel.dataset.cgpBound) return;
      sel.dataset.cgpBound = '1';
      sel.addEventListener('change', function () { onVariantChange(sel); });
    });
    root.querySelectorAll('[data-cgp-add-cart]').forEach(function (btn) {
      if (btn.dataset.cgpBound) return;
      btn.dataset.cgpBound = '1';
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        onAddToCart(btn);
      });
    });
    /* Wishlist heart (see helpers above). Empty heart → let the app add, then
       reflect the real (localStorage) state. Red heart → open the wishlist
       drawer (the app can't remove from our injected cards). */
    root.querySelectorAll('.cgp-card .xb-wishlist__btn-custom').forEach(function (wrap) {
      if (wrap.dataset.cgpWlBound) return;
      wrap.dataset.cgpWlBound = '1';
      wrap.addEventListener('click', function (e) {
        if (e.target.closest('.xb-wishlist__remove')) {
          e.preventDefault();
          e.stopPropagation();
          openWishlist();
          return;
        }
        // Adding: optimistic red for snappiness, then reconcile with real state.
        wrap.classList.add('cgp-wl-on');
        setTimeout(function () { syncWishlist(document); }, 700);
        setTimeout(function () { syncWishlist(document); }, 1600);
      });
    });
    syncWishlist(root);
    root.querySelectorAll('[data-cgp-discount-bar]').forEach(initDiscountBar);
    root.querySelectorAll('[data-cgp-stock-bar]').forEach(initStockBar);
  }

  /* ---------- Keep the "added" colour in sync with the real cart ----------
     So removing an item in the cart drawer reverts its card button to grey. */
  async function syncCartButtons() {
    var inCart = {};
    try {
      var cart = await (await fetch('/cart.js', { headers: { 'Accept': 'application/json' } })).json();
      (cart.items || []).forEach(function (i) { inCart[String(i.variant_id)] = true; });
    } catch (e) { return; }
    document.querySelectorAll('[data-cgp-add-cart]').forEach(function (btn) {
      var vid = btn.dataset.variantId;
      btn.classList.toggle('cgp-action-btn--added', !!(vid && inCart[vid]));
    });
  }

  var cartObserver = null;
  function observeCart() {
    if (cartObserver) return;
    var cart = document.querySelector('cart-drawer') || document.querySelector('#CartDrawer');
    if (!cart) return;
    var t = null;
    cartObserver = new MutationObserver(function () {
      clearTimeout(t);
      t = setTimeout(syncCartButtons, 150);
    });
    cartObserver.observe(cart, { childList: true, subtree: true });
  }

  /* ---------- Wishlist heart (XB Wishlist app) ----------
     The app only wires up cards inside its configured collection selector, so it
     never binds our injected search/collection cards: the "add" click works
     (delegated) but it can't reveal/remove the heart on our cards, and it briefly
     flips inline display while processing — which made the heart vanish. We own
     the heart's visibility via .cgp-wl-on (CSS !important) and read the app's own
     localStorage so our state always matches its header badge. Removal isn't
     supported on our cards, so the red heart opens the app's wishlist drawer. */
  function wishlistedIds() {
    var set = {};
    try {
      var d = JSON.parse(localStorage.getItem('xb_wishlist_data') || '[]');
      if (Array.isArray(d)) d.forEach(function (it) { if (it && it.productId != null) set[String(it.productId)] = true; });
    } catch (e) {}
    return set;
  }
  function syncWishlist(root) {
    root = root || document;
    var ids = wishlistedIds();
    root.querySelectorAll('.cgp-card .xb-wishlist__btn-custom').forEach(function (wrap) {
      var add = wrap.querySelector('.xb-wishlist__add');
      var pid = add && add.getAttribute('xb-product-id');
      wrap.classList.toggle('cgp-wl-on', !!(pid && ids[pid]));
    });
  }
  function openWishlist() {
    var opener = document.querySelector('xb-wishlist-header .xb-header__icon') ||
                 document.querySelector('xb-wishlist-header');
    if (opener) opener.click();
  }

  var observer = null;
  function observeGrid() {
    var container = document.querySelector('#ProductGridContainer');
    if (!container) return;
    if (!observer) {
      observer = new MutationObserver(function () {
        // Disconnect while we touch the DOM (bind sets data-attrs, recount
        // rewrites pill text) so our own writes don't re-trigger the observer
        // — that re-entrancy is what froze the page.
        observer.disconnect();
        bind(document);
        recountBars();
        observer.observe(container, { childList: true, subtree: true });
      });
    }
    observer.disconnect();
    observer.observe(container, { childList: true, subtree: true });
  }

  function init() {
    bind(document);
    recountBars();
    initInfinite();
    observeGrid();
    syncCartButtons();
    observeCart();
  }

  // Exposed so the client-side search app (cgp-search-app.js) can wire up the
  // cards it renders (variant change + add-to-cart) without duplicating logic.
  window.cgpBindCards = function (root) { bind(root || document); };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  document.addEventListener('shopify:section:load', init);
})();
