/**
 * search-drawer.js — 即时搜索弹窗交互（P0）
 *
 * - 联想结果通过 Section Rendering API 获取，产品卡 HTML 始终由 Liquid/snippet 渲染。
 * - 最近搜索仅使用 localStorage。
 * - 键盘导航保持焦点在搜索框，通过 aria-activedescendant 指向当前结果。
 */
(() => {
  const RECENT_KEY = 'cgp:recent-searches';
  const OPTION_SELECTOR = 'a[href], button:not([disabled])';
  const TRACK_EVENT_MAP = {
    product: 'search_product_click',
    suggestion: 'search_suggestion_click',
    'popular-term': 'search_suggestion_click',
    'recent-term': 'search_suggestion_click'
  };

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  class SearchDrawer extends HTMLElement {
    connectedCallback() {
      // Re-parent to <body> so no transformed ancestor can offset our
      // position:fixed drawer. The store's custom navbar applies a CSS transform
      // while search results load; with the drawer nested inside it, its
      // style.top:113 rendered ~200px lower (getBoundingClientRect top 310) —
      // that was the intermittent "gap". A transform on an ancestor makes
      // position:fixed relative to THAT ancestor, not the viewport. As a direct
      // child of <body> there is no such ancestor. (appendChild re-fires
      // connectedCallback, which then runs the real init below.)
      if (this.parentElement !== document.body) {
        document.body.appendChild(this);
        return;
      }
      if (this.initialized) return;
      this.initialized = true;

      this.sectionId = this.dataset.sectionId;
      this.debounceMs = parseInt(this.dataset.debounce || '250', 10);
      this.recentLimit = parseInt(this.dataset.recentLimit || '5', 10);
      // Shopify predictive search caps each resource at 10.
      this.productQty = Math.min(parseInt(this.dataset.productQty || '8', 10) || 8, 10);
      this.panel = this.querySelector('#search-drawer-results');
      // Bind to ALL matching search inputs (header, mobile, modal); position
      // relative to whichever one the user actually focuses. Initial input is
      // the first VISIBLE match so a hidden modal input can't mis-position us.
      // When the store's custom navbar (ai-navbar) is present it owns the real,
      // visible search box; a second standard/Dawn theme header also has one
      // (hidden, in a details-modal) which only causes focus/position conflicts.
      // Prefer the navbar inputs when they exist, else fall back to all matches
      // (other templates that use the standard header).
      const allInputs = Array.from(document.querySelectorAll(this.dataset.inputSelector || ''));
      const navInputs = allInputs.filter((el) => /ai-navbar/i.test(el.className || ''));
      this.inputs = navInputs.length ? navInputs : allInputs;
      this.input = this.inputs.find((el) => el.offsetParent !== null) || this.inputs[0] || null;

      if (!this.sectionId || !this.panel || !this.input) return;

      // Apply admin-configured custom tab names BEFORE snapshotting the default
      // panel, so every restore (after a search) keeps them without re-applying.
      this.applyRecTabLabels();
      this.defaultPanelHTML = this.panel.innerHTML;
      this.abortController = null;
      this.timer = null;
      this.requestId = 0;
      this.activeIndex = -1;
      this.optionId = 0;
      this.nativeDisableAttempts = 0;

      this.boundOnFocus = this.onFocus.bind(this);
      this.boundOnInput = this.onInput.bind(this);
      this.boundOnKeydown = this.onKeydown.bind(this);
      this.boundOnKeyup = this.onKeyup.bind(this);
      this.boundOnDocumentClick = this.onDocumentClick.bind(this);
      this.boundOnPanelClick = this.onPanelClick.bind(this);
      this.boundOnPointerover = this.onPointerover.bind(this);
      this.boundOnSubmit = this.onSubmit.bind(this);

      this.prepareInput();
      this.disableNativePredictiveSearch();

      this.inputs.forEach((inp) => {
        inp.addEventListener('focus', this.boundOnFocus, true);
        // Also open on click: re-tapping an already-focused input fires no focus
        // event, so on mobile the drawer wouldn't reopen until the user typed.
        inp.addEventListener('click', this.boundOnFocus, true);
        inp.addEventListener('input', this.boundOnInput, true);
        inp.addEventListener('keydown', this.boundOnKeydown, true);
        inp.addEventListener('keyup', this.boundOnKeyup, true);
        inp.form?.addEventListener('submit', this.boundOnSubmit);
      });
      // Drawer-owned mobile search bar (search-drawer.liquid). The full-screen
      // mobile drawer covers the header input, so it has its own; it reuses the
      // same input/keydown/keyup handlers (which set this.input = currentTarget).
      this.sdInput = this.querySelector('[data-sd-input]');
      this.sdClose = this.querySelector('[data-sd-close]');
      if (this.sdInput) {
        this.sdInput.setAttribute('aria-controls', this.panel.id);
        this.sdInput.addEventListener('input', this.boundOnInput, true);
        this.sdInput.addEventListener('keydown', this.boundOnKeydown, true);
        this.sdInput.addEventListener('keyup', this.boundOnKeyup, true);
      }
      this.sdClose?.addEventListener('click', () => this.close());
      this.panel.addEventListener('click', this.boundOnPanelClick);
      this.panel.addEventListener('pointerover', this.boundOnPointerover);
      document.addEventListener('click', this.boundOnDocumentClick);

      this.createBackdrop();
      this.boundReposition = this.position.bind(this);
      window.addEventListener('resize', this.boundReposition);

      // Cache the search box's RESTING top while the drawer is CLOSED. At that
      // point the custom navbar is always compact, so we never sample it while
      // it's mid-reflow (which it does, racily, during result-loading — the
      // cause of the homepage "jump"). open() uses this cached value and the
      // position then stays frozen for the whole session (the page is scroll-
      // locked while open, so nothing else needs tracking).
      this._restingTop = null;
      this._top = null;
      this._cacheResting = () => { if (this.hidden) this._restingTop = this.measureTop(); };
      window.addEventListener('scroll', this._cacheResting, { passive: true });
      setTimeout(this._cacheResting, 600);
      setTimeout(this._cacheResting, 1800);
      this._restingTimer = setInterval(this._cacheResting, 1000);

      this.renderRecent();
      this.refreshOptions();
    }

    // Top-most visible search box bottom (+6). Prefer-navbar filtering already
    // happened in connectedCallback, so this.inputs are the right candidates.
    measureTop() {
      let bottom = null;
      this.inputs.forEach((el) => {
        if (el.offsetParent === null) return;
        const b = el.getBoundingClientRect().bottom;
        if (b > 0 && (bottom === null || b < bottom)) bottom = b;
      });
      if (bottom === null && this.input) bottom = this.input.getBoundingClientRect().bottom;
      return Math.max(0, Math.round((bottom || 0) + 6));
    }

    createBackdrop() {
      this.backdrop = document.createElement('button');
      this.backdrop.type = 'button';
      this.backdrop.className = 'search-drawer__backdrop';
      this.backdrop.setAttribute('aria-label', 'Close search');
      this.backdrop.hidden = true;
      this.backdrop.addEventListener('click', () => this.close());
      document.body.appendChild(this.backdrop);
    }

    position(immediate) {
      if (this.hidden) return;
      // Both mobile and desktop drop the drawer just below the search box (mobile
      // then fills to the bottom via CSS bottom:0) so the header input stays
      // visible and keeps native focus + keyboard.
      // Use the resting top cached while the drawer was CLOSED (navbar compact),
      // captured on open() and then FROZEN for the whole session. We never
      // re-measure while open, because the custom navbar reflows the search box
      // ~130px during result-loading (racily) and following it made the drawer
      // jump down. The page is scroll-locked while open, so the resting value is
      // the correct top the entire time.
      if (immediate || this._top == null) {
        this._top = (this._restingTop != null ? this._restingTop : this.measureTop());
      }
      this.style.top = this._top + 'px';
      if (this.backdrop) this.backdrop.style.top = this._top + 'px';
    }

    disconnectedCallback() {
      clearTimeout(this.timer);
      this.abortController?.abort();
      if (this.boundReposition) window.removeEventListener('resize', this.boundReposition);
      if (this._cacheResting) window.removeEventListener('scroll', this._cacheResting);
      if (this._restingTimer) clearInterval(this._restingTimer);
      this.backdrop?.remove();

      if (!this.initialized || !this.inputs) return;
      this.inputs.forEach((inp) => {
        inp.removeEventListener('focus', this.boundOnFocus, true);
        inp.removeEventListener('click', this.boundOnFocus, true);
        inp.removeEventListener('input', this.boundOnInput, true);
        inp.removeEventListener('keydown', this.boundOnKeydown, true);
        inp.removeEventListener('keyup', this.boundOnKeyup, true);
        inp.form?.removeEventListener('submit', this.boundOnSubmit);
      });
      this.panel?.removeEventListener('click', this.boundOnPanelClick);
      this.panel?.removeEventListener('pointerover', this.boundOnPointerover);
      document.removeEventListener('click', this.boundOnDocumentClick);
      document.body.classList.remove('search-drawer-open');
      document.body.style.paddingRight = this._prevBodyPad || '';
    }

    prepareInput() {
      (this.inputs || [this.input]).forEach((inp) => {
        inp.setAttribute('autocomplete', 'off');
        inp.setAttribute('role', 'combobox');
        inp.setAttribute('aria-autocomplete', 'list');
        inp.setAttribute('aria-controls', this.panel.id);
        inp.setAttribute('aria-expanded', 'false');
      });
    }

    disableNativePredictiveSearch() {
      const nativePredictive = this.input.closest('predictive-search');
      if (!nativePredictive) return;

      nativePredictive.removeAttribute('open');
      nativePredictive.removeAttribute('results');
      nativePredictive.removeAttribute('loading');
      nativePredictive.querySelector('[data-predictive-search]')?.removeAttribute('style');

      const hasNativeMethods = typeof nativePredictive.getSearchResults === 'function'
        || typeof nativePredictive.open === 'function'
        || typeof nativePredictive.setLiveRegionLoadingState === 'function'
        || typeof nativePredictive.setLiveRegionResults === 'function';

      if (hasNativeMethods && nativePredictive.dataset.searchDrawerSuperseded !== 'true') {
        nativePredictive.dataset.searchDrawerSuperseded = 'true';
        if (typeof nativePredictive.getSearchResults === 'function') nativePredictive.getSearchResults = () => {};
        if (typeof nativePredictive.open === 'function') nativePredictive.open = () => {};
        if (typeof nativePredictive.setLiveRegionLoadingState === 'function') nativePredictive.setLiveRegionLoadingState = () => {};
        if (typeof nativePredictive.setLiveRegionResults === 'function') nativePredictive.setLiveRegionResults = () => {};
      }

      if (!hasNativeMethods && this.nativeDisableAttempts < 10) {
        this.nativeDisableAttempts += 1;
        requestAnimationFrame(() => this.disableNativePredictiveSearch());
      }
    }

    onFocus(event) {
      if (event.currentTarget) this.input = event.currentTarget;
      this.stopNativePredictiveEvent(event);
      this.open();
      this.disableNativePredictiveSearch();
    }

    onInput(event) {
      if (event && event.currentTarget) this.input = event.currentTarget;
      clearTimeout(this.timer);

      const q = this.input.value.trim();
      this.clearActiveOption();

      if (q.length === 0) {
        this.abortController?.abort();
        this.panel.innerHTML = this.defaultPanelHTML;
        this.panel.removeAttribute('aria-busy');
        this.classList.remove('cgp-sd-loading');
        this.renderRecent();
        this.refreshOptions();
        this.open();
        return;
      }

      if (q.length < 2) {
        this.open();
        return;
      }

      this.open();
      this.timer = setTimeout(() => this.fetchResults(q), this.debounceMs);
    }

    onKeydown(event) {
      if (!['ArrowDown', 'ArrowUp', 'Enter', 'Escape'].includes(event.key)) return;

      if (event.key === 'Escape') {
        event.preventDefault();
        this.stopNativePredictiveEvent(event);
        this.close();
        this.input.focus({ preventScroll: true });
        return;
      }

      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        this.stopNativePredictiveEvent(event);
        if (this.hidden) this.open();
        this.moveActiveOption(event.key === 'ArrowDown' ? 1 : -1);
        return;
      }

      if (event.key === 'Enter') {
        if (this.activeIndex > -1) {
          const option = this.getOptions()[this.activeIndex];
          if (option) {
            event.preventDefault();
            this.stopNativePredictiveEvent(event);
            this.activateOption(option);
          }
          return;
        }
        // The drawer-owned (mobile) input has no <form>; Enter goes to the results page.
        if (this.input === this.sdInput) {
          const q = this.input.value.trim();
          if (q) {
            event.preventDefault();
            this.onSubmit();
            window.location.href = (window.routes?.search_url || '/search') + '?q=' + encodeURIComponent(q);
          }
        }
      }
    }

    onKeyup(event) {
      if (!['ArrowDown', 'ArrowUp', 'Enter', 'Escape'].includes(event.key)) return;
      this.stopNativePredictiveEvent(event);
    }

    onSubmit() {
      this.saveRecent(this.input.value);
      this.dispatchEvent(new CustomEvent('search_performed', {
        detail: { query: this.input.value.trim(), results_count: this.countProducts() },
        bubbles: true
      }));
    }

    onDocumentClick(event) {
      if (this.contains(event.target)) return;
      if (event.target === this.input || event.target === this.sdInput) return;
      // Clicking any bound search input must not close the drawer. On mobile,
      // open() switches this.input to the drawer's own input, so the originally
      // tapped header input would otherwise be treated as an outside click and
      // close the drawer on the same tap that opened it.
      if (this.inputs && this.inputs.indexOf(event.target) !== -1) return;
      this.close();
    }

    onPanelClick(event) {
      // A linked custom badge sits inside the card's <a>; intercept it so the
      // click goes to its collection instead of the product (no nested anchors).
      const badgeLink = event.target.closest('.cgp-cbadge--link');
      if (badgeLink && badgeLink.dataset.cgpHref && this.contains(badgeLink)) {
        event.preventDefault();
        event.stopPropagation();
        window.location.href = badgeLink.dataset.cgpHref;
        return;
      }

      // Recommendation tabs: switch panel (and lazy-load a collection's products).
      const recTab = event.target.closest('[data-sd-rectab]');
      if (recTab && this.contains(recTab)) {
        event.preventDefault();
        this.activateRecTab(recTab);
        return;
      }

      const trackTarget = event.target.closest('[data-track]');
      if (!trackTarget || !this.contains(trackTarget)) return;

      this.saveTermFromTrack(trackTarget);
      this.dispatchTrackEvent(trackTarget);
    }

    /* ---------- Recommendation tabs (default panel) ---------- */
    // Override collection tab names with the admin app's custom labels
    // (featured_collections_config.labels, keyed by numeric collection id).
    applyRecTabLabels() {
      const bar = this.panel.querySelector('.sd-rec-tabs[data-sd-tab-cfg]');
      if (!bar) return;
      let labels;
      try { labels = (JSON.parse(bar.dataset.sdTabCfg || '{}') || {}).labels; } catch (_) { return; }
      if (!labels || typeof labels !== 'object') return;
      bar.querySelectorAll('[data-sd-rectab="col"]').forEach((tab) => {
        const name = labels[tab.dataset.collectionId];
        if (name) tab.textContent = name;
      });
    }

    activateRecTab(tab) {
      const kind = tab.dataset.sdRectab;
      const handle = tab.dataset.handle || '';
      this.panel.querySelectorAll('[data-sd-rectab]').forEach((t) => t.classList.toggle('is-active', t === tab));
      // Mobile: keep the tapped tab in view within the horizontally-scrolling bar
      // (no page scroll — only the bar moves).
      const bar = tab.parentElement;
      if (bar && bar.scrollWidth > bar.clientWidth) {
        const l = tab.offsetLeft, r = l + tab.offsetWidth;
        if (l < bar.scrollLeft) bar.scrollLeft = l - 8;
        else if (r > bar.scrollLeft + bar.clientWidth) bar.scrollLeft = r - bar.clientWidth + 8;
      }
      const panels = this.panel.querySelectorAll('[data-sd-recpanel]');
      let target = null;
      panels.forEach((p) => {
        const match = (kind === 'rec') ? (p.dataset.sdRecpanel === 'rec')
          : (p.dataset.sdRecpanel === 'col' && p.dataset.handle === handle);
        p.classList.toggle('is-active', match);
        p.hidden = !match;
        if (match) target = p;
      });
      if (kind === 'col' && target && target.dataset.loaded !== 'true') {
        this.loadRecCollection(target, handle, tab.dataset.url || '', tab.dataset.collectionId || '');
      }
    }

    async loadRecCollection(panel, handle, url, collectionId) {
      panel.dataset.loaded = 'true'; // optimistic — block duplicate loads while fetching
      panel.innerHTML = '<div class="sd-rec-loading">' + esc(this._recLoadingLabel()) + '</div>';
      this._recCache = this._recCache || {};
      let products = this._recCache[handle];
      if (!products) {
        products = await this.fetchCollectionProducts(handle);
        if (products) this._recCache[handle] = products;
      }
      if (!products) { panel.dataset.loaded = 'false'; panel.innerHTML = '<p class="search-drawer__empty">Unable to load. Tap to retry.</p>'; return; }
      const cls = this._recListClass();
      const cards = products.slice(0, this.productQty).map((p) => '<li>' + this.sdCard(p) + '</li>').join('');
      let html = '<ul class="' + cls + '">' + cards + '</ul>';
      if (url) html += '<a class="sd-viewall" href="' + esc(url) + '" data-track="collection" data-collection-id="' + esc(collectionId) + '">' + esc(this._recViewAllLabel()) + ' &rarr;</a>';
      panel.innerHTML = html;
    }

    async fetchCollectionProducts(handle) {
      try {
        const root = (window.Shopify && window.Shopify.routes && window.Shopify.routes.root) || '';
        const base = root ? (root.replace(/\/+$/, '') + '/collections/' + handle) : ('/collections/' + handle);
        const res = await fetch(`${base}?view=cgp-json&_cgp=${Date.now()}`, { credentials: 'same-origin' });
        if (!res.ok) return null;
        const txt = await res.text();
        let data; try { data = JSON.parse(txt); } catch (_) { return null; }
        return (data && data.products) || [];
      } catch (_) { return null; }
    }

    _recListClass() { const ex = this.panel.querySelector('[data-sd-recpanel="rec"] ul'); return ex ? ex.className : 'search-drawer__products'; }
    _recLoadingLabel() { return (window.CGP_CONFIG && CGP_CONFIG.labels && CGP_CONFIG.labels.loading) || 'Loading…'; }
    _recViewAllLabel() { return (window.CGP_CONFIG && CGP_CONFIG.labels && CGP_CONFIG.labels.viewAll) || 'View all'; }

    onPointerover(event) {
      const option = event.target.closest(OPTION_SELECTOR);
      if (!option || !this.panel.contains(option)) return;

      const index = this.getOptions().indexOf(option);
      if (index > -1) this.setActiveOption(index);
    }

    isMobile() {
      return window.matchMedia('(max-width: 749px)').matches;
    }

    open() {
      this.hidden = false;
      // Compensate for the scrollbar the body lock removes — otherwise the page
      // (and the search box) shift right when the drawer opens, the layout
      // "jumps", and the drawer detaches from the box. Pad the body by the
      // scrollbar width and lock BEFORE measuring, so position() reads the
      // final (non-shifted) layout. Reset in close().
      // Mobile uses overlay scrollbars (no gutter to compensate); padding the
      // body there instead CREATES horizontal overflow, which on iOS widens the
      // layout viewport — making the fixed drawer (and the whole page) wider than
      // the screen so cards/search box overflow. Only compensate on desktop.
      const sbw = this.isMobile() ? 0 : (window.innerWidth - document.documentElement.clientWidth);
      this._prevBodyPad = document.body.style.paddingRight;
      if (sbw > 0) document.body.style.paddingRight = sbw + 'px';
      document.body.classList.add('search-drawer-open');
      this._top = null;
      this.position(true);
      this.input?.setAttribute('aria-expanded', 'true');
      if (this.backdrop) this.backdrop.hidden = false;
      // Keep the drawer pinned to the search box for as long as it's open. The
      // homepage header shifts/animates (lazy hero, sticky header) after open and
      // a one-shot measure left a gap; tracking every frame fixes it whatever the
      // cause (header/theme), instead of snapping into place once at the end.
      this.startTracking();
      this.refreshOptions();
      // Fresh random subset of the popular lists each time the default panel opens.
      if (this.input && this.input.value.trim() === '') this.shufflePopular();
    }

    startTracking() {
      this._tracking = true;
      const step = () => {
        if (this.hidden || !this._tracking) return;
        this.position();
        this._raf = requestAnimationFrame(step);
      };
      if (this._raf) cancelAnimationFrame(this._raf);
      this._raf = requestAnimationFrame(step);
    }

    stopTracking() {
      this._tracking = false;
      if (this._raf) cancelAnimationFrame(this._raf);
    }

    // The metaobject can hold unlimited popular terms / collections / products;
    // they're all rendered, and on each open we show a random N per list
    // (N = the drawer's per-list setting via data-cgp-shuffle).
    shufflePopular() {
      this.panel.querySelectorAll('[data-cgp-shuffle]').forEach((container) => {
        const limit = parseInt(container.dataset.cgpShuffle, 10) || 0;
        // Optional per-list config (Featured Products / Collections):
        //   data-cgp-key  — stable localStorage key for this list
        //   data-cgp-cfg  — JSON {refreshSec, pin}
        // refreshSec = 0 → reshuffle every open (default). pin = N first items
        // (saved pinned-first by the admin app) that never shuffle and stay on top.
        const key = container.dataset.cgpKey || '';
        let refreshSec = 0, pinCount = 0;
        try { const c = JSON.parse(container.dataset.cgpCfg || '{}'); refreshSec = +c.refreshSec || 0; pinCount = +c.pin || 0; } catch (e) {}

        // Tag each item with its original DOM index so identity survives reordering.
        const live = Array.from(container.children);
        live.forEach((el, i) => { if (el.dataset.cgpIdx == null) el.dataset.cgpIdx = String(i); });
        const canonical = live.slice().sort((a, b) => (+a.dataset.cgpIdx) - (+b.dataset.cgpIdx));
        const byId = new Map(canonical.map((el) => [el.dataset.cgpIdx, el]));
        const pinned = canonical.slice(0, pinCount);
        const rest = canonical.slice(pinCount);

        // Decide the order of the non-pinned items: reuse the stored order while
        // within the refresh interval, otherwise compute a fresh shuffle.
        const sk = key ? 'cgp-sd-shuffle:' + key : '';
        let order = null;
        if (sk && refreshSec > 0) {
          try {
            const st = JSON.parse(localStorage.getItem(sk) || 'null');
            if (st && Array.isArray(st.order) && (Date.now() - st.ts) < refreshSec * 1000) {
              const restIds = new Set(rest.map((el) => el.dataset.cgpIdx));
              const filtered = st.order.filter((id) => restIds.has(id));
              if (filtered.length === rest.length) order = filtered;
            }
          } catch (e) {}
        }
        if (!order) {
          order = rest.map((el) => el.dataset.cgpIdx);
          for (let i = order.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            const t = order[i]; order[i] = order[j]; order[j] = t;
          }
          if (sk && refreshSec > 0) { try { localStorage.setItem(sk, JSON.stringify({ ts: Date.now(), order })); } catch (e) {} }
        }

        const finalEls = pinned.concat(order.map((id) => byId.get(id)).filter(Boolean));
        const show = limit ? Math.max(limit, pinned.length) : finalEls.length;
        finalEls.forEach((el, idx) => {
          el.hidden = idx >= show;
          container.appendChild(el);
        });
      });
      // Keep the featured-product grid to at most 2 rows for the current width.
      this.capProductRows(this.panel.querySelector('.search-drawer__products'));
      this.refreshOptions();
    }

    // Show at most 2 rows of product cards on desktop/tablet (grid). The grid uses
    // auto-fill columns, so read the actual column count and hide the overflow.
    // Mobile renders a vertical list — keep the selection as-is (no cap).
    capProductRows(grid) {
      if (!grid || this.isMobile()) return;
      const tpl = getComputedStyle(grid).gridTemplateColumns;
      const cols = (tpl && tpl !== 'none') ? tpl.split(' ').filter(Boolean).length : 1;
      const max = Math.max(1, cols) * 2;
      Array.from(grid.children).forEach((el, i) => { if (i >= max) el.hidden = true; });
    }

    close() {
      this.hidden = true;
      this.stopTracking();
      this.input?.setAttribute('aria-expanded', 'false');
      document.body.classList.remove('search-drawer-open');
      document.body.style.paddingRight = this._prevBodyPad || '';
      if (this.backdrop) this.backdrop.hidden = true;
      this.clearActiveOption();
    }

    async fetchResults(q) {
      this.abortController?.abort();
      this.abortController = new AbortController();
      const signal = this.abortController.signal;
      const currentRequest = ++this.requestId;

      this.classList.add('cgp-sd-loading');
      this.panel.setAttribute('aria-busy', 'true');

      try {
        // Fetch predictive (suggestions + categories) AND the results-engine
        // products (cgp-json) in parallel, then render ONCE. The panel keeps the
        // current results until both are ready, then swaps in a single update —
        // no wrong-order/empty flash, no double render.
        const [panelHTML, products] = await Promise.all([
          this.fetchPredictive(q, signal),
          this.fetchCardProducts(q, signal)
        ]);
        if (currentRequest !== this.requestId || q !== this.input.value.trim()) return;

        if (panelHTML != null) {
          this.panel.innerHTML = panelHTML;
          let ul = this.panel.querySelector('.search-drawer__products');
          if (products && products.length) {
            // The engine matched products (incl. collection / sale-tag matches that
            // Shopify predictive misses), so drop the predictive "no results"
            // message and show the products — a query like "summer" / "sale" /
            // "clearance" shouldn't imply a typo when relevant products exist.
            this.panel.querySelectorAll('.search-drawer__empty').forEach((el) => el.remove());
            if (!ul) {
              const col = this.panel.querySelector('.search-drawer__col--right') || this.panel.querySelector('.search-drawer__columns') || this.panel;
              ul = document.createElement('ul');
              ul.className = 'search-drawer__products';
              col.appendChild(ul);
            }
            ul.innerHTML = products.slice(0, this.productQty).map((p) => `<li>${this.sdCard(p)}</li>`).join('');
          }
          this.capProductRows(ul);
          this.open();
          this.refreshOptions();
        }

        const resultsCount = this.countProducts();
        this.dispatchEvent(new CustomEvent('search-drawer:results', { detail: { query: q, results_count: resultsCount }, bubbles: true }));
        this.dispatchEvent(new CustomEvent('search_performed', { detail: { query: q, results_count: resultsCount }, bubbles: true }));
        // Analytics: record the typed query + the engine's TRUE result count
        // (search.results_count). The drawer shows "No results found" + fallback
        // recommendations when the search itself returns 0 — those recommendations
        // are NOT search results, so total=0 IS a real zero-result. Debounced to
        // the settled query; skipped when the fetch failed (total = null).
        clearTimeout(this._aTimer);
        if (typeof this._lastTotal === 'number') {
          const aq = q, ac = this._lastTotal;
          this._aTimer = setTimeout(function () { try { window.CGP_ANALYTICS && window.CGP_ANALYTICS.track('search', { query: aq, resultCount: ac, source: 'drawer', submitted: false }); } catch (e) {} }, 1200);
        }
        if (resultsCount === 0) {
          this.dispatchEvent(new CustomEvent('search_zero_results', { detail: { query: q }, bubbles: true }));
        }
      } catch (err) {
        if (err.name !== 'AbortError') {
          this.dispatchEvent(new CustomEvent('search-drawer:error', { detail: { query: q, message: err.message }, bubbles: true }));
        }
      } finally {
        if (currentRequest === this.requestId) {
          this.classList.remove('cgp-sd-loading');
          this.panel.removeAttribute('aria-busy');
        }
      }
    }

    // Predictive request (suggestions + categories); returns the panel innerHTML
    // (or null on failure, so the caller keeps the current panel).
    async fetchPredictive(q, signal) {
      try {
        const params = new URLSearchParams({
          q,
          section_id: this.sectionId,
          'resources[type]': 'product,collection,page,query',
          'resources[limit]': String(this.productQty),
          'resources[limit_scope]': 'each',
          'resources[options][unavailable_products]': 'last',
          'resources[options][fields]': 'title,product_type,variants.title,vendor'
        });
        const res = await fetch(`${window.routes?.predictive_search_url || '/search/suggest'}?${params}`, { signal });
        if (!res.ok) return null;
        const html = await res.text();
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const fresh = doc.querySelector('#search-drawer-results');
        return fresh ? fresh.innerHTML : null;
      } catch (_) { return null; }
    }

    /* ---------- Products from the results engine (cgp-json) ----------
       Predictive search caps products at ~10 (a mix of lenses + accessories).
       Pull the full matched set from the same endpoint the results page uses
       and apply the same priority ordering. Returns an ordered product array
       (or null on failure, so the caller can fall back to predictive). */
    async fetchCardProducts(q, signal) {
      this._lastTotal = null;   // engine's TRUE result_count (search.results_count); null = fetch failed
      try {
        // Build the search URL from Shopify's localized root so this AJAX request
        // carries the visitor's market/locale (and thus presentment currency). A
        // bare "/search" loses that context and Shopify renders the default market
        // — which is why Safari (non-GBP session) showed a different currency than
        // the page. Fall back to routes.search_url, then "/search".
        const root = (window.Shopify && window.Shopify.routes && window.Shopify.routes.root) || '';
        const base = root ? (root.replace(/\/+$/, '') + '/search') : (window.routes?.search_url || '/search');
        // Append a trailing wildcard so the last (in-progress) term prefix-matches
        // — Shopify regular search otherwise matches whole words inconsistently for
        // short queries (e.g. "sim" returned 1 product, "sime" returned many).
        const url = `${base}?q=${encodeURIComponent(q + '*')}&type=product&view=cgp-json&_cgp=${Date.now()}`;
        const res = await fetch(url, { credentials: 'same-origin', signal });
        const txt = await res.text();
        let data;
        try { data = JSON.parse(txt); } catch (_) { return null; }
        this._lastTotal = (data && typeof data.total === 'number') ? data.total : null;
        return this.prioritise((data && data.products) || [], q);
      } catch (_) { return null; }
    }

    // Float "main product" types (CGP_CONFIG.priorityTypes, e.g. Cine Lens) above
    // accessories; stable, so S&D boost / relevance order is kept within a tier.
    prioritise(list, query) {
      const cfg = window.CGP_CONFIG || {};
      const rules = cfg.sortRules || [];
      const q = String(query || '').trim().toLowerCase();
      let pr = [];
      if (rules.length) {
        if (q) {
          rules.forEach((r) => {
            const hit = (r.keywords || []).some((k) => {
              k = String(k).trim().toLowerCase();
              return k && (q.indexOf(k) !== -1 || k.indexOf(q) !== -1);
            });
            if (hit) pr = pr.concat((r.types || []).map((t) => String(t).trim().toLowerCase()));
          });
        }
      } else {
        pr = String(cfg.priorityTypes || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
      }
      if (!q) return list;
      // Exact-phrase matches (full query appears in the title or product type)
      // ALWAYS float to the top — the strongest relevance signal — even when no
      // type rule fired (e.g. an incomplete word like "dummy batt", which matches
      // no keyword). So "dummy batt(ery)" shows real dummy batteries before a
      // "Battery"-type product that only has "battery" in its title/description.
      // Type priority, if any, is only a secondary sort within each tier.
      return list
        .map((p, i) => {
          const e = (((p.title || '').toLowerCase().indexOf(q) !== -1) || ((p.type || '').toLowerCase().indexOf(q) !== -1)) ? 0 : 1;
          const r = pr.length ? pr.indexOf((p.type || '').toLowerCase()) : -1;
          return { p, i, e, r: r === -1 ? 999 : r };
        })
        .sort((a, b) => (a.e - b.e) || (a.r - b.r) || (a.i - b.i))
        .map((o) => o.p);
    }

    // Compact drawer card built from a cgp-json product (mirrors
    // snippets/search-drawer-product-card.liquid; same CSS classes/vars).
    sdCard(p) {
      const cfg = window.CGP_CONFIG || {};
      const labels = cfg.labels || {};
      const money = (c) => { const v = parseFloat(c); return (isNaN(v) || v <= 0) ? '£TBC' : '£' + (v / 100).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
      const statusMap = { instock: 'in-stock', preorder: 'pre-order', oos: 'out-of-stock' };
      const statusCls = statusMap[p.status] || 'in-stock';
      const statusLabel = labels[p.status] || (p.status === 'preorder' ? 'Pre-Order' : (p.status === 'oos' ? 'Out of Stock' : 'In Stock'));
      const onSale = p.price > 0 && p.compare > p.price;
      // Prefer Shopify-formatted price strings (correct currency symbol + amount
      // for the active market); fall back to local £ formatting for old payloads.
      const curStr = (p.price > 0) ? (p.price_str ? esc(p.price_str) : money(p.price)) : '£TBC';
      const cmpStr = p.compare_str ? esc(p.compare_str) : money(p.compare);
      let h = `<a class="sd-card" href="${esc(p.url)}" data-track="product" data-product-id="${p.id}">`;
      h += '<div class="sd-card__media">';
      if (p.image) h += `<img class="sd-card__img" src="${esc(p.image)}" alt="${esc(p.title)}" loading="lazy">`;
      if (p.image2) h += `<img class="sd-card__img sd-card__img--hover" src="${esc(p.image2)}" alt="" loading="lazy" aria-hidden="true">`;
      if (p.discount > 0 && p.price > 0) h += `<span class="sd-badge sd-badge--discount">${p.discount}${esc(cfg.discountSuffix || '% OFF')}</span>`;
      h += `<span class="sd-badge sd-badge--status sd-badge--${statusCls}">${esc(statusLabel)}</span>`;
      h += this.statusBadges(p);
      h += '</div>';
      h += this.customBadges(p);
      h += '<div class="sd-card__body">';
      h += `<h4 class="sd-card__title">${esc(p.title)}</h4>`;
      h += `<div class="sd-card__price${onSale ? ' sd-card__price--sale' : ''}">`;
      if (onSale) h += `<s class="sd-card__price-compare">${cmpStr}</s>`;
      h += '<span class="sd-card__price-row">';
      if (p.multi && p.price > 0) h += '<span class="sd-card__from">From</span>';
      h += `<span class="sd-card__price-current">${curStr}</span>`;
      h += `<span class="sd-card__vat">${esc(cfg.vatLabel || 'ex.VAT')}</span>`;
      h += '</span></div></div></a>';
      return h;
    }

    // Custom tag badges (CGP_BADGES) BELOW the image, left / right by position.
    // The card is an <a>, so linked badges use span + data-cgp-href (delegated
    // click navigates) to avoid invalid nested anchors.
    customBadges(p) {
      const tags = p.tags || [];
      const badges = (window.CGP_BADGES || []).filter((b) => b.enabled !== false && b.tag && tags.indexOf(b.tag) !== -1);
      if (!badges.length) return '';
      const sideOf = (b) => (/right/i.test(b.position || '') ? 'right' : 'left');
      const render = (side) => {
        const inner = badges.filter((b) => sideOf(b) === side).map((b) => {
          const cls = b.image ? 'cgp-cbadge cgp-cbadge--img' : 'cgp-cbadge';
          const content = b.image ? `<img src="${esc(b.image)}" alt="${esc(b.label)}" loading="lazy">` : esc(b.label);
          const style = b.image ? '' : `background:${esc(b.bg)};color:${esc(b.text)};`;
          return b.link
            ? `<span class="${cls} cgp-cbadge--link" role="link" tabindex="0" data-cgp-href="${esc(b.link)}" style="${style}">${content}</span>`
            : `<span class="${cls}" style="${style}">${content}</span>`;
        }).join('');
        return inner ? `<div class="cgp-cbadges cgp-cbadges--${side}">${inner}</div>` : '';
      };
      const groups = render('left') + render('right');
      return groups ? `<div class="cgp-cbadges-below">${groups}</div>` : '';
    }

    // Product-status badges (CGP_STATUS_BADGES, tag-triggered) overlay the drawer
    // card image bottom-right (distinct from custom badges).
    statusBadges(p) {
      const tags = p.tags || [];
      const items = (window.CGP_STATUS_BADGES || []).filter((b) => b.enabled !== false && b.tag && tags.indexOf(b.tag) !== -1);
      if (!items.length) return '';
      const inner = items.map((b) => `<span class="cgp-statusbadge" style="background:${esc(b.bg)};color:${esc(b.text)};">${esc(b.label || b.tag)}</span>`).join('');
      return `<div class="cgp-statusbadges">${inner}</div>`;
    }

    refreshOptions() {
      this.getOptions().forEach((option) => {
        if (!option.id) option.id = `search-drawer-option-${++this.optionId}`;
        option.setAttribute('role', 'option');
        option.setAttribute('aria-selected', 'false');
        option.tabIndex = -1;
      });
      this.activeIndex = -1;
      this.input?.removeAttribute('aria-activedescendant');
    }

    getOptions() {
      if (!this.panel) return [];
      return Array.from(this.panel.querySelectorAll(OPTION_SELECTOR)).filter((option) => {
        return !option.hidden && option.getAttribute('aria-hidden') !== 'true' && option.offsetParent !== null;
      });
    }

    moveActiveOption(step) {
      const options = this.getOptions();
      if (options.length === 0) return;

      const nextIndex = this.activeIndex === -1
        ? (step > 0 ? 0 : options.length - 1)
        : (this.activeIndex + step + options.length) % options.length;

      this.setActiveOption(nextIndex, options);
    }

    setActiveOption(index, options = this.getOptions()) {
      options.forEach((option) => option.setAttribute('aria-selected', 'false'));

      const option = options[index];
      if (!option) return;

      option.setAttribute('aria-selected', 'true');
      this.activeIndex = index;
      this.input?.setAttribute('aria-activedescendant', option.id);
      option.scrollIntoView({ block: 'nearest' });
    }

    clearActiveOption() {
      this.getOptions().forEach((option) => option.setAttribute('aria-selected', 'false'));
      this.activeIndex = -1;
      this.input?.removeAttribute('aria-activedescendant');
    }

    activateOption(option) {
      this.saveTermFromTrack(option);
      this.dispatchTrackEvent(option);
      option.click();
    }

    countProducts() {
      return this.panel?.querySelectorAll('[data-track="product"]').length || 0;
    }

    dispatchTrackEvent(target) {
      const type = target.dataset.track;
      const eventName = TRACK_EVENT_MAP[type];
      if (!eventName) return;

      const options = this.getOptions();
      this.dispatchEvent(new CustomEvent(eventName, {
        detail: {
          query: this.input?.value.trim() || '',
          suggestion: type === 'product' ? undefined : target.textContent.trim(),
          product_id: target.dataset.productId,
          position: options.indexOf(target) + 1
        },
        bubbles: true
      }));
    }

    saveTermFromTrack(target) {
      const type = target.dataset.track;
      if (!['suggestion', 'popular-term', 'recent-term'].includes(type)) return;
      this.saveRecent(target.textContent);
    }

    stopNativePredictiveEvent(event) {
      if (this.input?.closest('predictive-search')) event.stopImmediatePropagation();
    }

    /* ---------- 最近搜索（localStorage） ---------- */
    saveRecent(term) {
      term = (term || '').replace(/\s+/g, ' ').trim();
      if (!term || this.recentLimit === 0) return;

      try {
        const list = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]')
          .filter((item) => item.toLowerCase() !== term.toLowerCase());
        list.unshift(term);
        localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, this.recentLimit)));
      } catch (_) { /* localStorage 不可用时静默降级 */ }
    }

    renderRecent() {
      const wrap = this.querySelector('[data-recent-searches]');
      const listNode = this.querySelector('[data-recent-list]');
      if (!wrap || !listNode) return;

      let list = [];
      try { list = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); } catch (_) {}

      listNode.textContent = '';
      if (list.length === 0) {
        wrap.hidden = true;
        return;
      }

      list.slice(0, this.recentLimit).forEach((term) => {
        const item = document.createElement('li');
        const link = document.createElement('a');
        link.href = `${window.routes?.search_url || '/search'}?q=${encodeURIComponent(term)}`;
        link.dataset.track = 'recent-term';
        link.textContent = term;
        item.append(link);
        listNode.append(item);
      });

      wrap.hidden = false;
    }
  }

  if (!customElements.get('search-drawer')) {
    customElements.define('search-drawer', SearchDrawer);
  }
})();
