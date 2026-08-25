import { LANGUAGES } from './content.js';

const LAST_SCENE = 13;
const READING_SCENE_KEY = 'darmo-reading-scene';

export function readSavedScene(storage = globalThis.localStorage) {
  try {
    const stored = storage?.getItem?.(READING_SCENE_KEY);
    if (stored === null || stored === undefined || stored === '') return null;
    const value = Number(stored);
    return Number.isInteger(value) && value >= 0 && value <= LAST_SCENE ? value : null;
  } catch {
    return null;
  }
}

export function saveReadingScene(index, storage = globalThis.localStorage) {
  const value = Number(index);
  if (!Number.isInteger(value) || value < 0 || value > LAST_SCENE || typeof storage?.setItem !== 'function') return false;
  try {
    storage.setItem(READING_SCENE_KEY, String(value));
    return true;
  } catch {
    return false;
  }
}

export function parseSceneHash(hash = '') {
  const match = /^#scene-(\d{2})$/.exec(hash);
  if (!match) return null;
  const number = Number(match[1]);
  return number >= 1 && number <= 14 ? number - 1 : null;
}

export function sceneHash(index) {
  const safe = Math.max(0, Math.min(LAST_SCENE, Number(index) || 0));
  return `#scene-${String(safe + 1).padStart(2, '0')}`;
}

export function prefersReducedMotion(matchMedia = globalThis.matchMedia?.bind(globalThis)) {
  return Boolean(matchMedia?.('(prefers-reduced-motion: reduce)').matches);
}

export function createStoryState({
  initialHash = globalThis.location?.hash ?? '',
  writeHash = hash => globalThis.history?.replaceState?.(null, '', hash)
} = {}) {
  let snapshot = {
    language: 'id',
    activeScene: parseSceneHash(initialHash) ?? 0,
    playback: { mode: 'idle', sceneIndex: 0, paragraphId: null, error: null }
  };
  const listeners = new Set();

  const clone = () => ({ ...snapshot, playback: { ...snapshot.playback } });
  const notify = () => {
    const current = clone();
    listeners.forEach(listener => listener(current));
  };

  return {
    getSnapshot: clone,
    setLanguage(lang) {
      if (!LANGUAGES.includes(lang) || lang === snapshot.language) return;
      snapshot = { ...snapshot, language: lang };
      notify();
    },
    setScene(index, { updateHash = true } = {}) {
      const safe = Math.max(0, Math.min(LAST_SCENE, Number(index) || 0));
      snapshot = { ...snapshot, activeScene: safe };
      if (updateHash) writeHash?.(sceneHash(safe));
      notify();
    },
    setPlayback(patch) {
      snapshot = { ...snapshot, playback: { ...snapshot.playback, ...patch } };
      notify();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  };
}
