/* Accessible, dependency-free interactive feature cards and report preview. */
(function () {
  'use strict';
  function init() {
    var root = document.querySelector('.visibility-feature-section');
    if (!root) return;
    var cards = Array.prototype.slice.call(root.querySelectorAll('[data-feature-card]'));
    var title = root.querySelector('[data-feature-preview-title]');
    var summary = root.querySelector('[data-feature-preview-summary]');
    var status = root.querySelector('[data-feature-preview-status]');
    if (!cards.length || !title || !summary || !status) return;

    function activate(card, focus) {
      cards.forEach(function (item) {
        var selected = item === card;
        item.classList.toggle('is-active', selected);
        item.setAttribute('aria-pressed', String(selected));
      });
      title.textContent = card.getAttribute('data-feature-title') || 'Performance capability';
      summary.textContent = card.getAttribute('data-feature-summary') || 'Details depend on available probe and browser data.';
      status.textContent = card.getAttribute('data-feature-status') || 'Availability varies';
      if (focus) card.focus();
    }

    cards.forEach(function (card, index) {
      card.addEventListener('click', function () { activate(card, false); });
      card.addEventListener('keydown', function (event) {
        var next = index;
        if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (index + 1) % cards.length;
        else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (index - 1 + cards.length) % cards.length;
        else if (event.key === 'Home') next = 0;
        else if (event.key === 'End') next = cards.length - 1;
        else return;
        event.preventDefault();
        activate(cards[next], true);
      });
    });
    var initial = cards.find(function (card) { return card.getAttribute('aria-pressed') === 'true'; }) || cards[0];
    activate(initial, false);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
