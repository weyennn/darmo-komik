export function selectActiveScene(entries) {
  const visible = entries.filter(entry => entry.isIntersecting);
  if (!visible.length) return null;
  visible.sort((a, b) => b.intersectionRatio - a.intersectionRatio);
  return Number(visible[0].target.dataset.sceneIndex);
}

export function nextPrefetchIndexes(index, total, count = 2) {
  return Array.from({ length: count }, (_, offset) => index + offset + 1).filter(candidate => candidate < total);
}

export function trapFocus(container, event, initialFocus = null) {
  if (event.key !== 'Tab') return;
  const focusable = [...container.querySelectorAll('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])')];
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable.at(-1);
  const active = document.activeElement;
  if (event.shiftKey && event.target === initialFocus) {
    event.preventDefault();
    first.focus();
  } else if (event.shiftKey && (active === first || active === initialFocus || !focusable.includes(active))) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}
