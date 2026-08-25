import { speakerText, translate, uiText } from './i18n.js';

const escapeHtml = value => String(value ?? '').replace(/[&<>"]/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'
})[character]);

const svgIcon = name => {
  const paths = {
    play: '<path d="M8 5.2v13.6L19 12 8 5.2Z"/>',
    pause: '<path d="M7.5 5.5v13M16.5 5.5v13"/>',
    volume: '<path d="M4 10v4h3l4 3V7l-4 3H4Z"/><path d="M15 9.5a3 3 0 0 1 0 5M17.5 7a6.5 6.5 0 0 1 0 10"/>',
    list: '<path d="M5 6.5h14M5 12h14M5 17.5h14"/><path d="M3 6.5h.01M3 12h.01M3 17.5h.01"/>',
    close: '<path d="m6 6 12 12M18 6 6 18"/>',
    repeat: '<path d="M5 8h11l-2.5-2.5M19 16H8l2.5 2.5"/><path d="M16 8h3v3M8 16H5v-3"/>',
    previous: '<path d="m15 5-7 7 7 7"/>',
    next: '<path d="m9 5 7 7-7 7"/>',
    retry: '<path d="M19 8a7 7 0 1 0 1 5"/><path d="M19 4v4h-4"/>'
  };
  return `<svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8">${paths[name] ?? paths.play}</g></svg>`;
};

function paragraphMarkup(paragraph, lang) {
  const speaker = paragraph.speaker
    ? `<span class="speaker">${escapeHtml(speakerText(lang, paragraph.speaker))}</span>`
    : '';
  const speakerAttribute = paragraph.speaker ? ` data-speaker="${escapeHtml(paragraph.speaker)}"` : '';
  const dialogueSide = paragraph.type === 'dialogue'
    ? (paragraph.speaker === 'darmo' ? 'end' : 'start')
    : null;
  const dialogueSideAttribute = dialogueSide ? ` data-dialogue-side="${dialogueSide}"` : '';
  return `<p id="${escapeHtml(paragraph.id)}" class="readalong readalong--${escapeHtml(paragraph.type)}" data-paragraph-id="${escapeHtml(paragraph.id)}" data-paragraph-type="${escapeHtml(paragraph.type)}"${speakerAttribute}${dialogueSideAttribute}>${speaker}<span class="dialogue-text">${escapeHtml(paragraph.text)}</span></p>`;
}

const formatTime = seconds => {
  const value = Number.isFinite(seconds) && seconds >= 0 ? Math.floor(seconds) : 0;
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
};

const formatCountdown = seconds => formatTime(Math.ceil(Math.max(0, seconds)));

function sceneAudioMarkup(scene, index, lang, storyAudio = {}) {
  const track = storyAudio[lang];
  const anchor = track?.sceneAnchors?.[index];
  const nextAnchor = track?.sceneAnchors?.slice(index + 1).find(candidate => Number.isFinite(candidate?.start));
  const sceneEnd = nextAnchor?.start ?? track?.duration;
  const available = track?.status === 'available'
    && Number.isFinite(anchor?.start)
    && Number.isFinite(sceneEnd)
    && sceneEnd > anchor.start;
  const sceneDuration = available ? sceneEnd - anchor.start : 0;
  const labelKey = available ? 'listenScene' : 'audioUnavailableAction';
  const label = uiText(lang, labelKey);
  const sceneLabel = `${uiText(lang, 'scene')} ${index + 1}`;
  return `<div class="scene__header-audio">
      <button type="button" class="scene__audio-button" data-audio-scene="${index}" data-audio-state="${available ? 'idle' : 'unavailable'}"${available ? ` data-audio-start="${anchor.start}" data-audio-end="${sceneEnd}" data-audio-duration="${sceneDuration}"` : ''} aria-pressed="false" aria-label="${escapeHtml(`${label}, ${sceneLabel}`)}" title="${escapeHtml(`${label}, ${sceneLabel}`)}"${available ? '' : ' disabled'}>
        <span class="scene__audio-icon" aria-hidden="true">${svgIcon(available ? 'play' : 'volume')}</span>
        <span class="scene__audio-text">${escapeHtml(label)}</span>
        ${available ? `<span class="scene__audio-time">${escapeHtml(formatCountdown(sceneDuration))}</span>` : ''}
      </button>
    </div>`;
}

export function renderSceneMarkup(scene, index, lang, storyAudio = {}) {
  const loading = index === 0 ? 'eager' : 'lazy';
  const priority = index === 0 ? ' fetchpriority="high"' : '';
  const paragraphs = scene.paragraphs[lang].map(paragraph => paragraphMarkup(paragraph, lang)).join('');
  const summaryNotice = scene.textStatus[lang] === 'summary-existing'
    ? `<p class="text-status">${escapeHtml(uiText(lang, 'textSummaryNotice'))}</p>` : '';
  const title = translate(scene.title, lang);
  const chapter = translate(scene.chapter, lang);
  const tag = translate(scene.tag, lang);
  const sceneAudio = sceneAudioMarkup(scene, index, lang, storyAudio);
  const header = `<header class="scene__header">
      <div class="scene__heading">
        <div class="scene__kicker">
          <span class="scene__number" aria-hidden="true">${String(index + 1).padStart(2, '0')}</span>
          <p class="scene__chapter">${escapeHtml(chapter)}</p>
        </div>
        <h2 class="scene__title">${escapeHtml(title)}</h2>
        <p class="scene__tag">${escapeHtml(tag)}</p>
      </div>
      ${sceneAudio}
    </header>`
  const beat = `<div class="scene__beat">
      <figure class="scene__art">
        <picture>
          <source type="image/webp" srcset="assets/webp/scenes/${scene.sourceImage.replace('.jpg', '.webp')}" />
          <img src="assets/scenes/${scene.sourceImage}" width="3938" height="2785" loading="${loading}" decoding="async"${priority} alt="${escapeHtml(translate(scene.alt, lang))}">
        </picture>
        <div class="image-error" hidden>
          <p>${escapeHtml(translate(scene.title, lang))}</p>
          <button type="button" data-image-retry="${index}">${svgIcon('retry')}<span>${escapeHtml(uiText(lang, 'retry'))}</span></button>
        </div>
      </figure>
    </div>`;
  const artworkFirst = index > 0;
  return `<article id="${scene.id}" class="scene scene--${scene.palette} scene--${scene.layout}${artworkFirst ? ' scene--artwork-first' : ' scene--opening'}" data-scene-index="${index}">
    ${artworkFirst ? `${beat}${header}` : `${header}${beat}`}
    <section class="readalong-panel" aria-label="${escapeHtml(translate(scene.title, lang))}">
      ${summaryNotice}${paragraphs}
    </section>
  </article>`;
}

export function renderScenes(container, scenes, lang, storyAudio = {}) {
  container.innerHTML = scenes.map((scene, index) => renderSceneMarkup(scene, index, lang, storyAudio)).join('');
}

export function renderSceneIndex(container, scenes, lang) {
  container.innerHTML = scenes.map((scene, index) => `<a href="#${scene.id}" data-index-scene="${index}"><span>${String(index + 1).padStart(2, '0')}</span>${escapeHtml(translate(scene.title, lang))}</a>`).join('');
}

export function renderSupplementary(container, pages, lang) {
  container.innerHTML = pages.map(page => `<figure class="supplementary-page"><picture><source type="image/webp" srcset="assets/webp/scenes/${page.sourceImage.replace('.jpg', '.webp')}"><img src="assets/scenes/${page.sourceImage}" width="3938" height="2785" loading="lazy" decoding="async" alt="${escapeHtml(translate(page.title, lang))}"></picture><figcaption>${escapeHtml(translate(page.title, lang))}</figcaption></figure>`).join('');
}

export function applyLanguage(root, { scenes, supplementaryPages, storyAudio = {}, lang }) {
  root.documentElement.lang = lang;
  renderScenes(root.querySelector('#storyScenes'), scenes, lang, storyAudio);
  renderSceneIndex(root.querySelector('#sceneIndexList'), scenes, lang);
  root.querySelectorAll('[data-language-group] [data-lang]').forEach(button => {
    button.setAttribute('aria-pressed', String(button.dataset.lang === lang));
    if (button.dataset.lang === 'jv') {
      button.querySelector('.button-label').textContent = uiText(lang, 'javaneseSummaryLabel');
      button.setAttribute('aria-label', uiText(lang, 'javaneseSummaryAria'));
    }
  });
  root.querySelector('#entryGateEyebrow').textContent = uiText(lang, 'illustratedStory');
  root.querySelector('#entryGateTitle').textContent = uiText(lang, 'introTitle');
  root.querySelector('#entryGateDescription').textContent = uiText(lang, 'introDescription');
  root.querySelector('#entryGateMeta').textContent = uiText(lang, 'openingMeta');
  root.querySelector('#entryGateSection').textContent = uiText(lang, 'opening');
  root.querySelector('#entryGateFolio').setAttribute('aria-label', uiText(lang, 'opening'));
  root.querySelector('#entryGateAudioNote').textContent = uiText(lang, 'entryAudioNote');
  root.querySelector('#entryGateArtLabel').textContent = uiText(lang, 'coverSwipeHint');
  root.querySelector('#startStoryButton .button-label').textContent = uiText(lang, 'start');
  root.querySelector('#skipLink').textContent = uiText(lang, 'skipStory');
  root.querySelector('#indexButton .button-label').textContent = uiText(lang, 'chooseScene');
  root.querySelector('#sceneIndexTitle').textContent = uiText(lang, 'chooseScene');
  root.querySelector('#closeIndexButton .button-label').textContent = uiText(lang, 'close');
  root.querySelector('#endingEyebrow').textContent = uiText(lang, 'closing');
  root.querySelector('#endingTitle').textContent = uiText(lang, 'endingTitle');
  root.querySelector('#endingDescription').textContent = uiText(lang, 'endingDescription');
  root.querySelector('#replayButton .button-label').textContent = uiText(lang, 'readAgain');
  root.querySelector('#previousAudioButton .button-label').textContent = uiText(lang, 'previous');
  root.querySelector('#previousAudioButton').setAttribute('aria-label', uiText(lang, 'previous'));
  root.querySelector('#audioToggleButton .button-label').textContent = uiText(lang, 'audioUnavailableAction');
  root.querySelector('#audioToggleButton').setAttribute('aria-label', uiText(lang, 'audioUnavailableAction'));
  root.querySelector('#repeatAudioButton .button-label').textContent = uiText(lang, 'repeat');
  root.querySelector('#repeatAudioButton').setAttribute('aria-label', uiText(lang, 'repeatAudio'));
  root.querySelector('#repeatAudioButton').setAttribute('title', uiText(lang, 'repeatAudio'));
  const rateButton = root.querySelector('#playbackRateButton');
  const rate = Number(root.querySelector('#audioElement')?.playbackRate) || 1;
  const rateLabel = `${uiText(lang, 'audioSpeed')} ${rate} ${uiText(lang, 'rateTimes')}`;
  rateButton.setAttribute('aria-label', rateLabel);
  rateButton.setAttribute('title', rateLabel);
  root.querySelector('#returnToNarrationButton .button-label').textContent = uiText(lang, 'returnToNarration');
  root.querySelector('#returnToNarrationButton').setAttribute('aria-label', uiText(lang, 'returnToNarration'));
  root.querySelector('#nextAudioButton .button-label').textContent = uiText(lang, 'next');
  root.querySelector('#nextAudioButton').setAttribute('aria-label', uiText(lang, 'next'));
  root.querySelector('#retryAudioButton .button-label').textContent = uiText(lang, 'retry');
  root.querySelector('#retryAudioButton').setAttribute('aria-label', uiText(lang, 'retry'));
  root.querySelector('#audioDockLabel').textContent = uiText(lang, 'audioLabel');
  root.querySelector('#audioDockStatus').textContent = uiText(lang, 'audioMissing');
  root.querySelector('#audioProgress').setAttribute('aria-label', uiText(lang, 'audioProgress'));
}

export function setActiveScene(root, index, scenes, lang) {
  root.querySelectorAll('.scene').forEach((scene, sceneIndex) => scene.classList.toggle('is-active', sceneIndex === index));
  root.querySelectorAll('#sceneIndexList a[data-index-scene]').forEach((link, sceneIndex) => {
    if (sceneIndex === index) link.setAttribute('aria-current', 'true');
    else link.removeAttribute('aria-current');
  });
  const readingProgress = root.querySelector('#readingProgress');
  readingProgress.value = index + 1;
  readingProgress.max = scenes.length;
  root.querySelector('#storyAnnouncement').textContent = `${uiText(lang, 'scene')} ${index + 1}: ${translate(scenes[index].title, lang)}`;
}

export function setActiveParagraph(root, paragraphId) {
  root.querySelectorAll('.readalong').forEach(paragraph => paragraph.classList.toggle('is-current-paragraph', paragraph.dataset.paragraphId === paragraphId));
}

export function setActiveAudioScene(root, index, {
  playing = false,
  active: shouldMarkActive = true,
  complete = false,
  currentTime = 0,
  lang = 'id'
} = {}) {
  root.querySelectorAll('.scene').forEach((scene, sceneIndex) => {
    const active = shouldMarkActive && sceneIndex === index;
    scene.classList.toggle('is-audio-active', active);
    const button = scene.querySelector('[data-audio-scene]');
    if (!button || button.disabled) return;
    button.setAttribute('aria-pressed', String(active));
    button.dataset.audioState = active && playing ? 'playing' : active ? 'paused' : 'idle';
    const text = button.querySelector('.scene__audio-text');
    if (text) text.textContent = active && playing ? uiText(lang, 'sceneAudioPlaying') : uiText(lang, 'listenScene');
    const sceneIcon = button.querySelector('.scene__audio-icon');
    if (sceneIcon) sceneIcon.innerHTML = svgIcon(active && playing ? 'pause' : 'play');
    const sceneTime = button.querySelector('.scene__audio-time');
    const sceneStart = Number(button.dataset.audioStart);
    const sceneEnd = Number(button.dataset.audioEnd);
    const sceneDuration = Number(button.dataset.audioDuration);
    if (sceneTime && Number.isFinite(sceneDuration)) {
      const remaining = active && Number.isFinite(currentTime) && Number.isFinite(sceneStart) && Number.isFinite(sceneEnd)
        ? sceneEnd - Math.max(sceneStart, currentTime)
        : sceneDuration;
      sceneTime.textContent = active && complete
        ? uiText(lang, 'sceneComplete')
        : active ? `${uiText(lang, 'remaining')} ${formatCountdown(remaining)}`
          : formatCountdown(sceneDuration);
    }
    const sceneLabel = `${uiText(lang, 'scene')} ${sceneIndex + 1}`;
    const accessibleLabel = `${active && playing ? uiText(lang, 'sceneAudioPlaying') : uiText(lang, 'listenScene')}, ${sceneLabel}`;
    button.setAttribute('aria-label', accessibleLabel);
    button.setAttribute('title', accessibleLabel);
  });
}

export function setAudioUiState(root, status, lang) {
  const ready = ['playing', 'paused', 'available'].includes(status.type);
  const loading = ['loading', 'buffering'].includes(status.type);
  const error = status.type === 'error';
  const complete = status.type === 'complete';
  const actionable = ready || loading || complete;
  const hasTimeline = ready || loading || complete;
  const currentTime = Number.isFinite(status.currentTime) ? status.currentTime : 0;
  const duration = Number.isFinite(status.duration) && status.duration > 0 ? status.duration : 0;
  const progress = root.querySelector('#audioProgress');
  const dock = root.querySelector('#audioDock');
  dock.dataset.audioState = error ? 'error' : loading ? 'loading' : hasTimeline ? 'ready' : 'unavailable';
  dock.dataset.audioMode = status.mode === 'full-story' ? 'full-story' : status.mode === 'scene' ? 'scene' : 'idle';
  dock.setAttribute('aria-busy', String(loading));
  const experience = root.querySelector('#storyExperience');
  if (experience) {
    experience.dataset.audioMode = dock.dataset.audioMode;
    experience.dataset.audioState = dock.dataset.audioState;
  }
  progress.hidden = !hasTimeline;
  progress.max = duration || 1;
  progress.value = Math.min(currentTime, progress.max);
  progress.setAttribute('aria-label', uiText(lang, 'audioProgress'));
  root.querySelector('#audioTime').textContent = hasTimeline
    ? `${formatTime(currentTime)} / ${formatTime(duration)}`
    : '— / —';
  const toggleLabel = complete
    ? uiText(lang, 'audioReplay')
    : ready || loading ? (status.type === 'playing' || status.paused === false) ? uiText(lang, 'pauseAudio') : uiText(lang, 'playAudio')
      : uiText(lang, 'audioUnavailableAction');
  root.querySelector('#audioToggleButton .button-label').textContent = toggleLabel;
  root.querySelector('#audioToggleButton').setAttribute('aria-label', toggleLabel);
  root.querySelector('#audioToggleButton .button-icon').innerHTML = svgIcon(actionable
    ? status.type === 'playing' ? 'pause' : 'play'
    : 'volume');
  root.querySelector('#audioToggleButton').disabled = !actionable;
  root.querySelector('#previousAudioButton').disabled = !(ready || loading) || status.fullStory || status.sceneIndex <= 0;
  root.querySelector('#nextAudioButton').disabled = !(ready || loading) || status.fullStory || status.sceneIndex >= 13;
  root.querySelector('#repeatAudioButton').disabled = !actionable;
  root.querySelector('#retryAudioButton').hidden = !error;
  root.querySelector('#audioDockStatus').textContent = error
    ? uiText(lang, 'audioError')
    : complete ? uiText(lang, 'audioComplete')
      : status.type === 'loading' ? uiText(lang, 'audioLoading')
        : status.type === 'buffering' ? uiText(lang, 'audioBuffering')
          : ready ? status.type === 'playing' ? uiText(lang, 'audioPlaying') : uiText(lang, 'audioPaused')
        : uiText(lang, 'audioMissing');
}

export function setAudioStatus(root, status, lang) {
  setAudioUiState(root, status, lang);
}

export function renderAppShell(root, data) {
  applyLanguage(root, data);
  setActiveScene(root, 0, data.scenes, data.lang);
}
