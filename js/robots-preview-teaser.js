(function () {
  'use strict';
  const teaser = document.getElementById('rd-ai-crawler-teaser');
  const urlNode = document.getElementById('rd-url');
  if (!teaser || !urlNode) return;
  let checked = '';
  async function inspect() {
    const url = (urlNode.textContent || '').trim();
    if (!/^https?:\/\//i.test(url) || url === checked) return;
    checked = url;
    try {
      const response = await fetch('/api/robots-preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) });
      const result = await response.json().catch(() => ({}));
      if (response.ok && result.available && result.any_ai_allowed) teaser.hidden = false;
    } catch (_) { /* A failed preview is not evidence of crawler permission. */ }
  }
  const observer = new MutationObserver(inspect);
  observer.observe(urlNode, { childList: true, subtree: true, characterData: true });
  inspect();
}());