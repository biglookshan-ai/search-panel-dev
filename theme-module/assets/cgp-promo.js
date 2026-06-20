/* ============================================================
   cgp-promo.js
   Promotion info pills → popup. Loaded globally so it works on search
   results, collection pages and the search drawer.
   Each pill ([data-cgp-promo]) carries a hidden .cgp-promo__data with the
   full promo content (title / body html / cta html); clicking opens a shared
   popup populated from it. No framework.
   ============================================================ */
(function () {
  'use strict';

  var popup = null;

  function ensurePopup() {
    if (popup) return popup;
    popup = document.createElement('div');
    popup.className = 'cgp-promo-pop';
    popup.hidden = true;
    popup.innerHTML =
      '<div class="cgp-promo-pop__overlay" data-cgp-promo-close></div>' +
      '<div class="cgp-promo-pop__box" role="dialog" aria-modal="true" aria-label="Promotion details">' +
        '<button type="button" class="cgp-promo-pop__close" data-cgp-promo-close aria-label="Close">&times;</button>' +
        '<h3 class="cgp-promo-pop__title"></h3>' +
        '<div class="cgp-promo-pop__body"></div>' +
        '<div class="cgp-promo-pop__cta"></div>' +
      '</div>';
    document.body.appendChild(popup);
    popup.addEventListener('click', function (e) {
      if (e.target.hasAttribute('data-cgp-promo-close')) closePopup();
    });
    return popup;
  }

  function openPopup(data) {
    var p = ensurePopup();
    p.querySelector('.cgp-promo-pop__title').textContent = data.title || '';
    p.querySelector('.cgp-promo-pop__body').innerHTML = data.body || '';
    var cta = p.querySelector('.cgp-promo-pop__cta');
    cta.innerHTML = data.cta || '';
    cta.style.display = (data.cta && data.cta.trim()) ? '' : 'none';
    p.hidden = false;
    document.body.classList.add('cgp-promo-open');
  }

  function closePopup() {
    if (popup) {
      popup.hidden = true;
      document.body.classList.remove('cgp-promo-open');
    }
  }

  // Delegated: works for server-rendered cards, the JS results app and the drawer.
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-cgp-promo]');
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    var data = btn.querySelector('.cgp-promo__data');
    var pick = function (sel, prop) {
      var el = data && data.querySelector(sel);
      return el ? el[prop] : '';
    };
    openPopup({
      title: pick('.cgp-promo__t', 'textContent'),
      body: pick('.cgp-promo__b', 'innerHTML'),
      cta: pick('.cgp-promo__c', 'innerHTML')
    });
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && popup && !popup.hidden) closePopup();
  });
})();
