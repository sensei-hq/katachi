// Fade a section up the first time it scrolls into view (the .reveal style lives in uno.config.js). Without an
// IntersectionObserver (or on the server) the section simply shows.
export function reveal(node: HTMLElement, delay = 0) {
  node.classList.add('reveal');
  if (delay) node.style.setProperty('--reveal-delay', `${delay}ms`);
  if (typeof IntersectionObserver === 'undefined') { node.dataset.shown = ''; return {}; }
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { node.dataset.shown = ''; io.disconnect(); }
  }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
  io.observe(node);
  return { destroy: () => io.disconnect() };
}
