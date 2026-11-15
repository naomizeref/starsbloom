// Load background demos only near the viewport. Off-screen autoplay videos
// otherwise compete with the hero and keep the document's load event pending.
(() => {
  // The menu must work before the larger Webflow bundle initializes.
  const menu = document.querySelector('.w-nav-button');
  const header = document.querySelector('.header-wrapper');
  if (menu && header) {
    menu.setAttribute('role', 'button');
    menu.setAttribute('tabindex', '0');
    menu.setAttribute('aria-label', 'menu');
    const toggle = event => {
      if (menu.hasAttribute('aria-controls')) return;
      event.preventDefault(); event.stopImmediatePropagation();
      const open = header.classList.toggle('bloom-nav-open');
      menu.setAttribute('aria-expanded', String(open));
    };
    menu.addEventListener('click', toggle, true);
    menu.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') toggle(event);
      if (event.key === 'Escape' && header.classList.contains('bloom-nav-open')) toggle(event);
    }, true);
    const ready = new MutationObserver(() => {
      if (!menu.hasAttribute('aria-controls')) return;
      ready.disconnect();
      // Preserve an already-open menu as Webflow takes over its behavior.
      if (header.classList.contains('bloom-nav-open')) {
        header.classList.remove('bloom-nav-open');
        menu.click();
      }
    });
    ready.observe(menu, { attributes: true, attributeFilter: ['aria-controls'] });
  }
  const videos = document.querySelectorAll('video[data-lazy-video]');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const load = video => {
    if (video.dataset.loaded) return;
    video.dataset.loaded = 'true';
    video.querySelectorAll('source[data-src]').forEach(source => { source.src = source.dataset.src; });
    video.load();
  };
  const update = (video, visible) => {
    if (!visible || document.hidden || reducedMotion.matches) { video.pause(); return; }
    load(video);
    video.play().catch(() => { /* Autoplay may be blocked; keep the poster. */ });
  };
  if (!('IntersectionObserver' in window)) return;
  const visible = new Set();
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) visible.add(entry.target); else visible.delete(entry.target);
      update(entry.target, entry.isIntersecting);
    });
  }, { rootMargin: '150px' });
  videos.forEach(video => observer.observe(video));
  document.addEventListener('visibilitychange', () => videos.forEach(video => update(video, visible.has(video))));
  reducedMotion.addEventListener('change', () => videos.forEach(video => update(video, visible.has(video))));
})();
