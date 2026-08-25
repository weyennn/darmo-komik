import { scenes, supplementaryPages } from './content.js';
import { createStoryState, prefersReducedMotion, saveReadingScene } from './state.js';
import { validateContent, validateStoryAudio } from './validate.js';
import { createAudioController } from './audio-controller.js';
import { storyAudio } from './story-audio.js';
import { applyLanguage, renderAppShell, setActiveAudioScene, setActiveParagraph, setActiveScene, setAudioStatus } from './render.js';
import { nextPrefetchIndexes, selectActiveScene, trapFocus } from './navigation.js';
import { uiText } from './i18n.js';

const errors = [...validateContent(scenes), ...validateStoryAudio(storyAudio, scenes)];
if (errors.length) throw new Error(`Invalid story content:\n${errors.join('\n')}`);

const state = createStoryState();
const audio = document.querySelector('#audioElement');
let observer;
let indexTrigger = null;
let autoScrolling = false;
let storyStarted = false;
let paragraphScrollFrame = 0;
let dockClearanceFrame = 0;
let narrationReturnFrame = 0;
let programmaticScrollId = 0;
let latestAudioStatus = { type: 'missing', mode: 'idle' };
const playbackRates = [1, 1.25, 0.75];
const readableDockClearance = 15;

function syncAudioDockArtworkClearance() {
  const dock = document.querySelector('#audioDock');
  if (!dock || dock.hidden) return;
  const dockRect = dock.getBoundingClientRect();
  const protectedContent = document.querySelectorAll('.scene__art, .scene__header, .readalong, .text-status, .image-error, .supplementary-page, #ending');
  const overlapsReadableContent = [...protectedContent].some(content => {
    const contentRect = content.getBoundingClientRect();
    const overlapWidth = Math.min(dockRect.right, contentRect.right) - Math.max(dockRect.left, contentRect.left);
    const verticalClearance = dockRect.top - contentRect.bottom;
    const reachesDockZone = contentRect.top < dockRect.bottom && verticalClearance < readableDockClearance;
    return overlapWidth > 1 && reachesDockZone;
  });
  // The supplied artwork and read-along copy are both primary story content.
  // The global controls yield rather than obscuring or crowding either one; each
  // scene retains its own inline audio CTA while the dock is parked.
  const parked = storyStarted && overlapsReadableContent;
  const statusOnly = parked && ['loading', 'buffering'].includes(latestAudioStatus.type);
  if (parked && !statusOnly && dock.contains(document.activeElement)) {
    document.querySelector('#mainContent')?.focus({ preventScroll: true });
  }
  dock.classList.toggle('is-parked-for-artwork', parked);
  dock.classList.toggle('is-loading-status-only', statusOnly);
  document.querySelector('#storyExperience')?.classList.toggle('has-parked-audio-dock', parked);
  dock.inert = parked && !statusOnly;
  dock.setAttribute('aria-hidden', String(parked && !statusOnly));
}

function requestAudioDockArtworkClearance() {
  if (dockClearanceFrame) return;
  dockClearanceFrame = window.requestAnimationFrame(() => {
    dockClearanceFrame = 0;
    syncAudioDockArtworkClearance();
  });
}

function activeNarrationTarget() {
  return document.querySelector('.scene.is-audio-active .readalong.is-current-paragraph')
    ?? document.querySelector('.scene.is-audio-active');
}

function syncReturnToNarrationVisibility() {
  const button = document.querySelector('#returnToNarrationButton');
  const activeStatus = ['playing', 'paused', 'available', 'loading', 'buffering'].includes(latestAudioStatus.type);
  const target = activeNarrationTarget();
  if (!storyStarted || !activeStatus || !target) {
    button.hidden = true;
    return;
  }
  const rect = target.getBoundingClientRect();
  const headerBottom = (document.querySelector('#siteHeader')?.getBoundingClientRect().bottom ?? 0) + 12;
  const dock = document.querySelector('#audioDock');
  const dockTop = dock && !dock.hidden && !dock.classList.contains('is-parked-for-artwork')
    ? dock.getBoundingClientRect().top - 12
    : window.innerHeight - 12;
  button.hidden = rect.bottom > headerBottom && rect.top < dockTop;
}

function requestReturnToNarrationVisibility() {
  if (narrationReturnFrame) return;
  narrationReturnFrame = window.requestAnimationFrame(() => {
    narrationReturnFrame = 0;
    syncReturnToNarrationVisibility();
  });
}

function returnToActiveNarration() {
  const target = activeNarrationTarget();
  if (!target) return;
  document.querySelector('#returnToNarrationButton').hidden = true;
  target.scrollIntoView({
    block: 'center',
    inline: 'nearest',
    behavior: prefersReducedMotion() ? 'auto' : 'smooth'
  });
  window.setTimeout(requestReturnToNarrationVisibility, prefersReducedMotion() ? 0 : 650);
}

function updatePlaybackRateButton(rate = audio.playbackRate || 1, lang = state.getSnapshot().language) {
  const button = document.querySelector('#playbackRateButton');
  const visibleRate = Number(rate.toFixed(2));
  button.querySelector('.playback-rate-value').textContent = `${visibleRate}×`;
  const label = `${uiText(lang, 'audioSpeed')} ${visibleRate} ${uiText(lang, 'rateTimes')}`;
  button.setAttribute('aria-label', label);
  button.setAttribute('title', label);
}

function keepParagraphAboveDock(paragraphId) {
  if (!storyStarted || !paragraphId || paragraphScrollFrame) return;
  paragraphScrollFrame = window.requestAnimationFrame(() => {
    paragraphScrollFrame = 0;
    const paragraph = document.querySelector(`.readalong[data-paragraph-id="${CSS.escape(paragraphId)}"]`);
    const dock = document.querySelector('#audioDock');
    const header = document.querySelector('#siteHeader');
    if (!paragraph || !dock || dock.hidden) return;
    const panel = paragraph.closest('.readalong-panel');
    const scene = paragraph.closest('.scene');
    const artwork = scene?.querySelector('.scene__art');
    const paragraphRect = paragraph.getBoundingClientRect();
    const panelRect = panel?.getBoundingClientRect();
    const artworkRect = artwork?.getBoundingClientRect();
    const dockRect = dock.getBoundingClientRect();
    const topClearance = (header?.getBoundingClientRect().bottom ?? 0) + 16;
    const bottomClearance = dockRect.top - 16;
    // Audio may highlight text while the reader is still looking at the artwork.
    // Do not pull the page down while a meaningful part of that slide is visible.
    const artworkVisibleTop = Math.max(artworkRect?.top ?? 0, topClearance);
    const artworkVisibleBottom = Math.min(artworkRect?.bottom ?? 0, bottomClearance);
    if (artworkRect && artworkVisibleBottom - artworkVisibleTop > 24) return;
    // Once the artwork is out of the reading window, keep the active paragraph clear
    // of the header and fixed audio rail.
    if (!panelRect || panelRect.top >= bottomClearance || panelRect.bottom <= topClearance) return;
    if (paragraphRect.bottom > bottomClearance || paragraphRect.top < topClearance) {
      paragraph.scrollIntoView({ block: 'center', inline: 'nearest', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    }
  });
}

function scrollToScene(index, { auto = false } = {}) {
  const behavior = auto || prefersReducedMotion() ? 'auto' : 'smooth';
  const scrollId = ++programmaticScrollId;
  let released = false;
  autoScrolling = true;
  document.querySelector(`#${scenes[index].id}`)?.scrollIntoView({
    block: 'start',
    behavior
  });
  state.setScene(index);
  if (storyStarted) saveReadingScene(index);
  setActiveScene(document, index, scenes, state.getSnapshot().language);
  prefetchNear(index);
  const releaseObserver = () => {
    if (released || scrollId !== programmaticScrollId) return;
    released = true;
    autoScrolling = false;
    bindObserver();
    requestAudioDockArtworkClearance();
  };
  if (behavior === 'smooth' && 'onscrollend' in window) {
    window.addEventListener('scrollend', releaseObserver, { once: true });
  }
  window.setTimeout(releaseObserver, behavior === 'smooth' ? 1800 : 0);
}

const audioController = createAudioController({
  audio,
  scenes,
  storyAudio,
  state,
  onCue: cue => {
    setActiveParagraph(document, cue.paragraphId);
    keepParagraphAboveDock(cue.paragraphId);
    requestReturnToNarrationVisibility();
  },
  onStatus: status => {
    latestAudioStatus = status;
    setAudioStatus(document, status, state.getSnapshot().language);
    setActiveAudioScene(document, status.sceneIndex, {
      playing: status.type === 'playing',
      active: ['playing', 'paused', 'available', 'loading', 'buffering', 'complete'].includes(status.type) && status.mode !== 'idle',
      complete: status.type === 'complete',
      currentTime: status.currentTime,
      lang: state.getSnapshot().language
    });
    requestAudioDockArtworkClearance();
    requestReturnToNarrationVisibility();
  },
  onSceneRequest: scrollToScene
});

function cyclePlaybackRate() {
  const current = Number(audio.playbackRate) || 1;
  const index = playbackRates.findIndex(rate => Math.abs(rate - current) < 0.01);
  const nextRate = playbackRates[(index + 1 + playbackRates.length) % playbackRates.length];
  if (audioController.setPlaybackRate(nextRate)) updatePlaybackRateButton(nextRate);
}

function prefetchNear(index) {
  nextPrefetchIndexes(index, scenes.length).forEach(next => {
    const href = `assets/webp/scenes/${scenes[next].sourceImage.replace('.jpg', '.webp')}`;
    if (document.head.querySelector(`link[data-prefetch="${next}"]`)) return;
    const link = document.createElement('link');
    link.rel = 'prefetch';
    link.as = 'image';
    link.href = href;
    link.dataset.prefetch = String(next);
    document.head.append(link);
  });
}

function bindObserver() {
  observer?.disconnect();
  observer = new IntersectionObserver(entries => {
    if (autoScrolling) return;
    const index = selectActiveScene(entries);
    if (index === null || index === state.getSnapshot().activeScene) return;
    state.setScene(index);
    if (storyStarted) saveReadingScene(index);
    setActiveScene(document, index, scenes, state.getSnapshot().language);
    prefetchNear(index);
  }, { rootMargin: `-${document.querySelector('#siteHeader').offsetHeight + 1}px 0px -70%`, threshold: 0 });
  document.querySelectorAll('.scene').forEach(scene => observer.observe(scene));
}

function applyCurrentLanguage(lang) {
  const playback = state.getSnapshot().playback;
  const active = state.getSnapshot().activeScene;
  applyLanguage(document, { scenes, supplementaryPages, storyAudio, lang });
  updatePlaybackRateButton(audio.playbackRate, lang);
  setActiveScene(document, active, scenes, lang);
  bindObserver();
  requestAudioDockArtworkClearance();
  if (storyStarted && ['scene', 'full-story'].includes(playback.mode)) {
    void audioController.switchLanguage();
  }
}

function openIndex(trigger) {
  indexTrigger = trigger;
  const aside = document.querySelector('#sceneIndex');
  aside.setAttribute('aria-hidden', 'false');
  aside.inert = false;
  document.querySelector('#siteHeader').inert = true;
  document.querySelector('#mainContent').inert = true;
  document.querySelector('#audioDock').inert = true;
  document.querySelector('#indexBackdrop').hidden = false;
  trigger?.setAttribute('aria-expanded', 'true');
  document.body.classList.add('is-index-open');
  document.querySelector('#sceneIndexTitle').focus();
}

function closeIndex() {
  const aside = document.querySelector('#sceneIndex');
  aside.setAttribute('aria-hidden', 'true');
  aside.inert = true;
  document.querySelector('#siteHeader').inert = false;
  document.querySelector('#mainContent').inert = false;
  document.querySelector('#audioDock').inert = false;
  document.querySelector('#indexBackdrop').hidden = true;
  indexTrigger?.setAttribute('aria-expanded', 'false');
  document.body.classList.remove('is-index-open');
  indexTrigger?.focus();
}

function retryImage(button) {
  const scene = button.closest('.scene');
  const image = scene?.querySelector('img');
  const fallback = scene?.querySelector('.image-error');
  if (!image) return;
  const index = Number(button.dataset.imageRetry);
  const sourceImage = scenes[index]?.sourceImage;
  if (!sourceImage) return;
  fallback.hidden = true;
  image.hidden = false;
  scene.querySelectorAll('picture source').forEach(source => source.remove());
  image.src = `assets/scenes/${sourceImage}?retry=${Date.now()}`;
}

function fallbackPictureToJpg(image) {
  const picture = image.closest('picture');
  if (!picture || image.dataset.jpgFallbackApplied === 'true') return false;
  picture.querySelectorAll('source').forEach(source => source.remove());
  image.dataset.jpgFallbackApplied = 'true';
  image.src = image.getAttribute('src')?.replace(/\?.*$/, '') ?? image.src;
  return true;
}

function showImageError(image) {
  if (fallbackPictureToJpg(image)) return;
  const figure = image.closest('.scene__art');
  if (!figure) return;
  image.hidden = true;
  figure.querySelector('.image-error').hidden = false;
}

renderAppShell(document, { scenes, supplementaryPages, storyAudio, lang: state.getSnapshot().language });
bindObserver();
setActiveScene(document, state.getSnapshot().activeScene, scenes, state.getSnapshot().language);

function showAudioDock() {
  const dock = document.querySelector('#audioDock');
  dock.hidden = false;
  dock.setAttribute('aria-hidden', 'false');
  requestAudioDockArtworkClearance();
}

function startStory({ sceneIndex = state.getSnapshot().activeScene } = {}) {
  if (storyStarted) return;
  storyStarted = true;
  const gate = document.querySelector('#entryGate');
  const experience = document.querySelector('#storyExperience');
  const audioDock = document.querySelector('#audioDock');
  audioDock.hidden = false;
  audioDock.setAttribute('aria-hidden', 'false');
  gate.setAttribute('aria-hidden', 'true');
  gate.inert = true;
  gate.classList.add('is-exiting');
  experience.hidden = false;
  experience.inert = false;
  experience.setAttribute('aria-hidden', 'false');
  document.body.classList.remove('is-entry-locked');
  experience.classList.add('is-entering');
  bindObserver();
  window.addEventListener('scroll', requestAudioDockArtworkClearance, { passive: true });
  window.addEventListener('scroll', requestReturnToNarrationVisibility, { passive: true });
  window.addEventListener('resize', requestAudioDockArtworkClearance);
  window.addEventListener('resize', requestReturnToNarrationVisibility);
  scrollToScene(sceneIndex, { auto: true });
  requestAudioDockArtworkClearance();
  document.querySelector('#mainContent')?.focus({ preventScroll: true });
  void audioController.playAll(sceneIndex);
  window.requestAnimationFrame(() => experience.classList.add('is-entered'));
  window.setTimeout(() => {
    gate.hidden = true;
    gate.classList.remove('is-exiting');
  }, prefersReducedMotion() ? 0 : 460);
  window.setTimeout(() => {
    experience.classList.remove('is-entering', 'is-entered');
  }, prefersReducedMotion() ? 0 : 600);
}

document.addEventListener('input', event => {
  if (event.target.matches('#audioProgress')) {
    audioController.seekTo(Number(event.target.value));
  }
});

document.addEventListener('click', event => {
  const target = event.target.closest('button, a');
  if (!target) return;
  if (target.matches('[data-lang]')) {
    state.setLanguage(target.dataset.lang);
    applyCurrentLanguage(target.dataset.lang);
  } else if (target.id === 'indexButton') {
    openIndex(target);
  } else if (['closeIndexButton', 'indexBackdrop'].includes(target.id)) {
    closeIndex();
  } else if (target.matches('[data-index-scene]')) {
    event.preventDefault();
    const index = Number(target.dataset.indexScene);
    closeIndex();
    scrollToScene(index);
  } else if (target.matches('[data-navigate-scene]')) {
    const index = Number(target.dataset.navigateScene);
    if (index >= 0 && index < scenes.length) scrollToScene(index);
  } else if (target.matches('[data-audio-scene]')) {
    event.preventDefault();
    showAudioDock();
    void audioController.toggleScene(Number(target.dataset.audioScene));
  } else if (target.matches('[data-image-retry]')) {
    retryImage(target);
  } else if (target.id === 'playAllButton') {
    audioController.playAll(state.getSnapshot().activeScene);
  } else if (target.id === 'audioToggleButton') {
    audioController.toggle();
  } else if (target.id === 'previousAudioButton') {
    audioController.previous();
  } else if (target.id === 'nextAudioButton') {
    audioController.next();
  } else if (target.id === 'repeatAudioButton') {
    void audioController.repeat();
  } else if (target.id === 'playbackRateButton') {
    cyclePlaybackRate();
  } else if (target.id === 'retryAudioButton') {
    void audioController.retry();
  } else if (target.id === 'returnToNarrationButton') {
    returnToActiveNarration();
  } else if (target.id === 'startStoryButton') {
    startStory();
  } else if (target.id === 'replayButton') {
    scrollToScene(0);
  }
});

document.addEventListener('error', event => {
  if (event.target instanceof HTMLImageElement) showImageError(event.target);
}, true);

document.addEventListener('keydown', event => {
  const index = document.querySelector('#sceneIndex');
  if (index.getAttribute('aria-hidden') === 'false') {
    if (event.key === 'Escape') closeIndex();
    else trapFocus(index, event, document.querySelector('#sceneIndexTitle'));
  }
}, true);

window.addEventListener('hashchange', () => {
  const match = /^#scene-(\d{2})$/.exec(location.hash);
  if (!match) return;
  const index = Number(match[1]) - 1;
  if (index < 0 || index >= scenes.length) return;
  if (!storyStarted) {
    state.setScene(index, { updateHash: false });
    return;
  }
  scrollToScene(index);
});

window.addEventListener('beforeunload', () => {
  observer?.disconnect();
  audioController.destroy();
}, { once: true });
