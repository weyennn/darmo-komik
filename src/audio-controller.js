import { activeCue, isLanguageAudioComplete } from './validate.js';

export function createAudioController({
  audio,
  scenes,
  storyAudio = {},
  state,
  onCue = () => {},
  onStatus = () => {},
  onSceneRequest = () => {}
}) {
  let currentScene = state.getSnapshot().playback.sceneIndex ?? 0;
  let currentParagraphId = null;
  let sceneJumping = false;
  let languageSwitchQueue = Promise.resolve();
  let languageSwitchGeneration = 0;
  let languageSwitchResumeIntent = null;
  let seekRequestId = 0;
  let pendingSeekCleanup = null;
  let playbackRequestId = 0;
  let playbackComplete = false;
  let destroyed = false;
  const supportedPlaybackRates = new Set([0.75, 1, 1.25]);
  let playbackRate = supportedPlaybackRates.has(audio.playbackRate) ? audio.playbackRate : 1;

  const trackFor = (index, lang = state.getSnapshot().language) => scenes[index]?.audio?.[lang];
  const fullTrackFor = (lang = state.getSnapshot().language) => storyAudio[lang];
  const sceneForTime = (lang, time) => {
    const anchors = fullTrackFor(lang)?.sceneAnchors ?? [];
    const firstAnchor = anchors.findIndex(Boolean);
    if (firstAnchor < 0) return null;
    let sceneIndex = firstAnchor;
    anchors.forEach((anchor, index) => {
      if (anchor && time >= anchor.start) sceneIndex = index;
    });
    return sceneIndex;
  };
  const sourceMatches = src => {
    const current = audio.currentSrc || audio.src;
    if (!current || !src) return false;
    try {
      const base = globalThis.document?.baseURI ?? 'http://localhost/';
      return new URL(current, base).href === new URL(src, base).href;
    } catch {
      return current === src;
    }
  };

  const report = type => onStatus({
    type,
    sceneIndex: currentScene,
    currentTime: audio.currentTime,
    duration: audio.duration,
    paused: audio.paused,
    playbackRate,
    fullStory: fullTrackFor()?.status === 'available',
    mode: state.getSnapshot().playback.mode
  });
  const applyPlaybackRate = () => { audio.playbackRate = playbackRate; };
  const beginPlaybackRequest = () => ++playbackRequestId;
  const isCurrentPlaybackRequest = requestId => !destroyed && requestId === playbackRequestId;
  const handlePlaybackFailure = (error, requestId) => {
    if (!isCurrentPlaybackRequest(requestId) || error?.name === 'AbortError') return false;
    onError();
    return false;
  };

  function seekCurrentTrack(position) {
    return new Promise((resolve, reject) => {
      const targetPosition = Math.max(0, Math.min(position, Number.isFinite(audio.duration) ? audio.duration : position));
      let settled = false;
      const cleanup = () => {
        audio.removeEventListener('seeked', finish);
        audio.removeEventListener('error', fail);
      };
      const finish = () => {
        if (settled || Math.abs(audio.currentTime - targetPosition) > 0.1) return;
        settled = true;
        cleanup();
        resolve();
      };
      const fail = () => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new Error('Audio seek failed'));
      };
      audio.addEventListener('seeked', finish);
      audio.addEventListener('error', fail);
      audio.currentTime = targetPosition;
      if (!audio.seeking) finish();
    });
  }

  function loadTrackAtPosition(src, position) {
    return new Promise((resolve, reject) => {
      let settled = false;
      let targetPosition = Math.max(0, position);
      const cleanup = () => {
        audio.removeEventListener('loadedmetadata', restorePosition);
        audio.removeEventListener('seeked', finishSeek);
        audio.removeEventListener('error', rejectLoad);
      };
      const finishSeek = () => {
        if (settled) return;
        if (Math.abs(audio.currentTime - targetPosition) > 0.1) return;
        settled = true;
        cleanup();
        resolve();
      };
      const restorePosition = () => {
        if (settled) return;
        const duration = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : position;
        targetPosition = Math.min(Math.max(0, position), duration);
        audio.currentTime = targetPosition;
        finishSeek();
      };
      const rejectLoad = () => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new Error('Audio metadata could not be loaded'));
      };
      audio.addEventListener('loadedmetadata', restorePosition);
      audio.addEventListener('seeked', finishSeek);
      audio.addEventListener('error', rejectLoad);
      audio.src = src;
      audio.load();
      applyPlaybackRate();
    });
  }

  function setPlaybackRate(rate) {
    if (!supportedPlaybackRates.has(rate)) return false;
    playbackRate = rate;
    applyPlaybackRate();
    return true;
  }

  function seekTo(position) {
    const playback = state.getSnapshot().playback;
    if (destroyed || !['scene', 'full-story'].includes(playback.mode) || !Number.isFinite(position)) return false;
    const duration = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : position;
    const targetPosition = Math.min(Math.max(0, position), duration);
    const requestId = ++seekRequestId;
    pendingSeekCleanup?.();
    let settled = false;
    const cleanup = () => {
      audio.removeEventListener('seeked', finish);
      audio.removeEventListener('error', fail);
      if (pendingSeekCleanup === cleanup) pendingSeekCleanup = null;
    };
    const finish = () => {
      if (settled || requestId !== seekRequestId) return;
      settled = true;
      cleanup();
      onTimeUpdate();
    };
    const fail = () => {
      if (settled || requestId !== seekRequestId) return;
      settled = true;
      cleanup();
      onError();
    };
    pendingSeekCleanup = cleanup;
    currentParagraphId = null;
    audio.addEventListener('seeked', finish);
    audio.addEventListener('error', fail);
    audio.currentTime = targetPosition;
    if (!audio.seeking) finish();
    return true;
  }

  const onTimeUpdate = () => {
    if (pendingSeekCleanup) return;
    const lang = state.getSnapshot().language;
    const playback = state.getSnapshot().playback;
    if (playback.mode === 'full-story' && !sceneJumping) {
      const nextScene = sceneForTime(lang, audio.currentTime);
      if (nextScene !== null && nextScene !== currentScene) {
        currentScene = nextScene;
        state.setPlayback({ sceneIndex: nextScene });
        onSceneRequest(nextScene, { auto: true });
      }
    }
    const cues = playback.mode === 'full-story'
      ? fullTrackFor(lang)?.cues ?? []
      : trackFor(currentScene, lang)?.cues ?? [];
    const cue = activeCue(cues, audio.currentTime);
    const paragraphId = cue?.paragraphId ?? null;
    if (paragraphId !== currentParagraphId) {
      currentParagraphId = paragraphId;
      state.setPlayback({ paragraphId });
      onCue({ paragraphId, sceneIndex: currentScene, time: audio.currentTime });
    }
    report(audio.paused ? playbackComplete ? 'complete' : 'paused' : 'playing');
  };

  const onPlay = () => {
    if (audio.paused) {
      report(playbackComplete ? 'complete' : 'paused');
      return;
    }
    playbackComplete = false;
    state.setPlayback({ sceneIndex: currentScene, error: null });
    report('playing');
  };
  const onPause = () => {
    if (state.getSnapshot().playback.mode !== 'idle') state.setPlayback({ paragraphId: currentParagraphId });
    if (!audio.paused) {
      report('playing');
      return;
    }
    report(playbackComplete ? 'complete' : 'paused');
  };
  const onError = () => {
    playbackComplete = false;
    state.setPlayback({ error: 'audio-error', paragraphId: null });
    report('error');
  };
  const onEnded = async () => {
    const playback = state.getSnapshot().playback;
    if (playback.mode !== 'full-story') {
      playbackComplete = true;
      state.setPlayback({ paragraphId: null, error: null });
      report('complete');
      return;
    }
    if (fullTrackFor()?.status === 'available') {
      playbackComplete = true;
      state.setPlayback({ paragraphId: null, error: null });
      report('complete');
      return;
    }
    if (currentScene >= scenes.length - 1) {
      playbackComplete = true;
      state.setPlayback({ paragraphId: null, error: null });
      report('complete');
      return;
    }
    playbackComplete = false;
    currentScene += 1;
    onSceneRequest(currentScene, { auto: true });
    await playScene(currentScene, { preserveMode: true });
  };

  const reportMediaState = () => report(audio.paused ? playbackComplete ? 'complete' : 'available' : 'playing');
  const onLoadedMetadata = reportMediaState;
  const onWaiting = () => {
    if (state.getSnapshot().playback.mode !== 'idle') report('loading');
  };
  const onStalled = () => {
    if (state.getSnapshot().playback.mode !== 'idle') report('buffering');
  };
  const onCanPlay = () => {
    if (state.getSnapshot().playback.mode !== 'idle') reportMediaState();
  };
  const listeners = {
    timeupdate: onTimeUpdate,
    play: onPlay,
    pause: onPause,
    error: onError,
    ended: onEnded,
    loadedmetadata: onLoadedMetadata,
    waiting: onWaiting,
    stalled: onStalled,
    canplay: onCanPlay
  };
  Object.entries(listeners).forEach(([type, listener]) => audio.addEventListener(type, listener));

  async function playScene(index, { preserveMode = false } = {}) {
    if (destroyed || !scenes[index]) return false;
    const requestId = beginPlaybackRequest();
    playbackComplete = false;
    currentScene = index;
    currentParagraphId = null;
    const lang = state.getSnapshot().language;
    const track = trackFor(index, lang);
    if (!track || track.status === 'missing') {
      state.setPlayback({ mode: 'idle', sceneIndex: index, paragraphId: null, error: null });
      report('missing');
      return false;
    }
    if (track.status === 'error') {
      state.setPlayback({ mode: 'idle', sceneIndex: index, paragraphId: null, error: 'audio-error' });
      report('error');
      return false;
    }
    if (!preserveMode) state.setPlayback({ mode: 'scene', sceneIndex: index, paragraphId: null, error: null });
    else state.setPlayback({ sceneIndex: index, paragraphId: null, error: null });
    audio.src = track.src;
    audio.load();
    applyPlaybackRate();
    report('loading');
    try {
      await audio.play();
      if (!isCurrentPlaybackRequest(requestId)) return false;
      report('playing');
      return true;
    } catch (error) {
      return handlePlaybackFailure(error, requestId);
    }
  }

  async function playAll(startIndex = 0) {
    const requestId = beginPlaybackRequest();
    playbackComplete = false;
    const lang = state.getSnapshot().language;
    const fullTrack = fullTrackFor(lang);
    if (fullTrack?.status === 'available') {
      currentScene = Math.max(0, Math.min(scenes.length - 1, startIndex));
      state.setPlayback({ mode: 'full-story', sceneIndex: currentScene, paragraphId: null, error: null });
      onSceneRequest(currentScene, { auto: true });
      const startAnchor = fullTrack.sceneAnchors?.[currentScene];
      report('loading');
      try {
        if (currentScene > 0 && startAnchor && startAnchor.start > 0) await loadTrackAtPosition(fullTrack.src, startAnchor.start);
        else {
          audio.src = fullTrack.src;
          audio.load();
          applyPlaybackRate();
        }
        if (!isCurrentPlaybackRequest(requestId)) return false;
        await audio.play();
        if (!isCurrentPlaybackRequest(requestId)) return false;
        report('playing');
        return true;
      } catch (error) {
        return handlePlaybackFailure(error, requestId);
      }
    }
    if (!isLanguageAudioComplete(scenes, lang)) {
      report('incomplete-language');
      return false;
    }
    currentScene = Math.max(0, Math.min(scenes.length - 1, startIndex));
    state.setPlayback({ mode: 'full-story', sceneIndex: currentScene, paragraphId: null, error: null });
    onSceneRequest(currentScene, { auto: true });
    return playScene(currentScene, { preserveMode: true });
  }

  async function playFullStoryAt(position, index) {
    if (destroyed || !scenes[index]) return false;
    const requestId = beginPlaybackRequest();
    playbackComplete = false;
    const lang = state.getSnapshot().language;
    const fullTrack = fullTrackFor(lang);
    if (fullTrack?.status !== 'available' || !Number.isFinite(position)) {
      currentScene = index;
      state.setPlayback({ mode: 'idle', sceneIndex: index, paragraphId: null, error: null });
      report('missing');
      return false;
    }
    const duration = sourceMatches(fullTrack.src) && Number.isFinite(audio.duration) && audio.duration > 0
      ? audio.duration
      : fullTrack.duration;
    const targetPosition = Math.min(Math.max(0, position), duration);
    sceneJumping = true;
    currentScene = index;
    currentParagraphId = null;
    state.setPlayback({ mode: 'full-story', sceneIndex: index, paragraphId: null, error: null });
    onSceneRequest(index, { auto: false, audio: true });
    audio.pause();
    report('loading');
    try {
      if (sourceMatches(fullTrack.src) && audio.readyState >= 1) {
        await seekCurrentTrack(targetPosition);
      } else {
        await loadTrackAtPosition(fullTrack.src, targetPosition);
      }
      if (!isCurrentPlaybackRequest(requestId)) {
        sceneJumping = false;
        return false;
      }
      await audio.play();
      if (!isCurrentPlaybackRequest(requestId)) {
        sceneJumping = false;
        return false;
      }
      sceneJumping = false;
      report('playing');
      return true;
    } catch (error) {
      sceneJumping = false;
      return handlePlaybackFailure(error, requestId);
    }
  }

  async function playSceneFromFullStory(index) {
    const lang = state.getSnapshot().language;
    const anchor = fullTrackFor(lang)?.sceneAnchors?.[index];
    if (!anchor || !Number.isFinite(anchor.start)) {
      currentScene = index;
      state.setPlayback({ mode: 'idle', sceneIndex: index, paragraphId: null, error: null });
      report('missing');
      return false;
    }
    return playFullStoryAt(anchor.start, index);
  }

  async function playParagraphFromFullStory(paragraphId) {
    const lang = state.getSnapshot().language;
    const fullTrack = fullTrackFor(lang);
    const cue = fullTrack?.cues?.find(candidate => candidate.paragraphId === paragraphId);
    const sceneIndex = scenes.findIndex(scene => scene.paragraphs[lang]?.some(paragraph => paragraph.id === paragraphId));
    if (!cue || !Number.isFinite(cue.start) || sceneIndex < 0) return false;
    return playFullStoryAt(cue.start, sceneIndex);
  }

  function switchLanguage() {
    const playback = state.getSnapshot().playback;
    const mode = playback.mode;
    if (mode !== 'scene' && mode !== 'full-story') return Promise.resolve(false);

    if (!languageSwitchResumeIntent) {
      languageSwitchResumeIntent = {
        previousTime: audio.currentTime,
        shouldResume: !audio.paused,
        sceneIndex: currentScene,
        mode
      };
    }
    audio.pause();
    currentParagraphId = null;
    const generation = ++languageSwitchGeneration;
    const run = languageSwitchQueue.then(async () => {
      const intent = languageSwitchResumeIntent;
      if (!intent || generation !== languageSwitchGeneration) return false;
      const lang = state.getSnapshot().language;
      const fullTrack = fullTrackFor(lang);
      const isCurrent = () => generation === languageSwitchGeneration && !destroyed;
      try {
        if (intent.mode === 'full-story' && fullTrack?.status === 'available') {
          await loadTrackAtPosition(fullTrack.src, intent.previousTime);
          if (!isCurrent()) return false;
          currentScene = intent.sceneIndex;
          state.setPlayback({ mode: 'full-story', sceneIndex: currentScene, paragraphId: null, error: null });
          if (!intent.shouldResume) {
            report('available');
            languageSwitchResumeIntent = null;
            return true;
          }
          await audio.play();
          if (!isCurrent()) return false;
          report('playing');
          languageSwitchResumeIntent = null;
          return true;
        }
        if (intent.mode === 'full-story' && !isLanguageAudioComplete(scenes, lang)) {
          if (!isCurrent()) return false;
          state.setPlayback({ mode: 'idle', paragraphId: null, error: null });
          report('incomplete-language');
          languageSwitchResumeIntent = null;
          return false;
        }
        const track = trackFor(intent.sceneIndex, lang);
        if (!track || track.status !== 'available') {
          if (!isCurrent()) return false;
          state.setPlayback({ mode: 'idle', sceneIndex: intent.sceneIndex, paragraphId: null, error: null });
          report(track?.status === 'error' ? 'error' : 'missing');
          languageSwitchResumeIntent = null;
          return false;
        }
        await loadTrackAtPosition(track.src, intent.previousTime);
        if (!isCurrent()) return false;
        currentScene = intent.sceneIndex;
        state.setPlayback({ mode: intent.mode, sceneIndex: currentScene, paragraphId: null, error: null });
        if (!intent.shouldResume) {
          report('available');
          languageSwitchResumeIntent = null;
          return true;
        }
        await audio.play();
        if (!isCurrent()) return false;
        report('playing');
        languageSwitchResumeIntent = null;
        return true;
      } catch {
        if (!isCurrent()) return false;
        onError();
        languageSwitchResumeIntent = null;
        return false;
      }
    });
    languageSwitchQueue = run.catch(() => false);
    return run;
  }

  async function toggle() {
    if (audio.paused) {
      const mode = state.getSnapshot().playback.mode;
      if (mode === 'scene' || mode === 'full-story') {
        if (playbackComplete) return mode === 'full-story' ? playAll(0) : repeat();
        const requestId = beginPlaybackRequest();
        try {
          await audio.play();
          if (!isCurrentPlaybackRequest(requestId)) return false;
          report('playing');
          return true;
        } catch (error) {
          return handlePlaybackFailure(error, requestId);
        }
      }
      return playScene(currentScene);
    }
    beginPlaybackRequest();
    audio.pause();
    return true;
  }

  function toggleScene(index) {
    const playback = state.getSnapshot().playback;
    if (['scene', 'full-story'].includes(playback.mode) && playback.sceneIndex === index) return toggle();
    return playSceneFromFullStory(index);
  }

  function repeat() {
    const playback = state.getSnapshot().playback;
    const index = Number.isInteger(playback.sceneIndex) ? playback.sceneIndex : currentScene;
    if (playback.mode === 'full-story') return playSceneFromFullStory(index);
    if (playback.mode === 'scene') return playScene(index);
    return Promise.resolve(false);
  }

  function stop() {
    beginPlaybackRequest();
    playbackComplete = false;
    audio.pause();
    currentParagraphId = null;
    state.setPlayback({ mode: 'idle', paragraphId: null, error: null });
    onCue({ paragraphId: null, sceneIndex: currentScene, time: audio.currentTime });
    report('paused');
  }

  function previous() {
    const target = Math.max(0, currentScene - 1);
    onSceneRequest(target, { auto: false });
    return playScene(target);
  }

  function next() {
    const target = Math.min(scenes.length - 1, currentScene + 1);
    onSceneRequest(target, { auto: false });
    return playScene(target);
  }

  function retry() {
    const mode = state.getSnapshot().playback.mode;
    if (mode === 'full-story') return playSceneFromFullStory(currentScene);
    if (mode === 'scene') return playScene(currentScene);
    return fullTrackFor()?.status === 'available'
      ? playSceneFromFullStory(currentScene)
      : playScene(currentScene);
  }

  function destroy() {
    if (destroyed) return;
    pendingSeekCleanup?.();
    stop();
    Object.entries(listeners).forEach(([type, listener]) => audio.removeEventListener(type, listener));
    destroyed = true;
  }

  return { playScene, playAll, playSceneFromFullStory, playParagraphFromFullStory, seekTo, setPlaybackRate, switchLanguage, toggle, toggleScene, repeat, stop, previous, next, retry, destroy };
}
