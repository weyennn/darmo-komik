import { AUDIO_STATUSES, LANGUAGES } from './content.js';

const EXPECTED_IMAGES = Array.from({ length: 14 }, (_, index) => `page-${String(index + 6).padStart(2, '0')}.jpg`);
const EXPECTED_SCRIPT_SCENES = [[1], [2], [3], [4, 5], [6], [7], [8], [9], [10], [10], [11], [12], [12], [13, 14]];
const TYPES = new Set(['narration', 'dialogue', 'thought', 'effect', 'moral']);
const PALETTES = new Set(['padepokan', 'exclusion', 'sea', 'miracle', 'resolution']);
const LAYOUTS = new Set(['text-left', 'text-right', 'text-below']);
const SPEAKERS = new Set(['darmo', 'master', 'students', 'soundEffect']);
const TEXT_STATUSES = new Set(['vo-complete', 'summary-existing']);

export function validateCues(cues, paragraphs, duration, path = 'cues') {
  return validateCueList(cues, new Set(paragraphs.map(paragraph => paragraph.id)), duration, path);
}

function validateCueList(cues, paragraphIds, duration, path) {
  const errors = [];
  let previousEnd = 0;
  cues.forEach((cue, index) => {
    const cuePath = `${path}[${index}]`;
    if (!paragraphIds.has(cue.paragraphId)) errors.push(`${cuePath}.paragraphId: unknown`);
    if (!Number.isFinite(cue.start) || cue.start < 0) errors.push(`${cuePath}.start: invalid`);
    if (!Number.isFinite(cue.end) || cue.end <= cue.start) errors.push(`${cuePath}.end: invalid`);
    if (index > 0 && cue.start < previousEnd) errors.push(`${cuePath}.start: overlaps previous cue`);
    if (Number.isFinite(duration) && cue.end > duration) errors.push(`${cuePath}.end: exceeds duration`);
    previousEnd = cue.end;
  });
  return errors;
}

export function validateStoryCues(cues, scenes, duration, path = 'storyCues') {
  const paragraphIds = new Set(
    scenes.flatMap(scene => Object.values(scene.paragraphs).flat()).map(paragraph => paragraph.id)
  );
  return validateCueList(cues, paragraphIds, duration, path);
}

export function validateSceneAnchors(anchors, duration, path = 'sceneAnchors') {
  const errors = [];
  if (!Array.isArray(anchors) || anchors.length !== 14) {
    return [`${path}: expected 14 scene anchors`];
  }
  let previousStart = -Infinity;
  anchors.forEach((anchor, index) => {
    const anchorPath = `${path}[${index}]`;
    if (!anchor || anchor.sceneIndex !== index) errors.push(`${anchorPath}: invalid scene index`);
    if (!Number.isFinite(anchor?.start) || anchor.start < 0) errors.push(`${anchorPath}.start: invalid`);
    if (Number.isFinite(anchor?.start) && anchor.start < previousStart) errors.push(`${anchorPath}.start: not ordered`);
    if (Number.isFinite(duration) && Number.isFinite(anchor?.start) && anchor.start > duration) errors.push(`${anchorPath}.start: exceeds duration`);
    if (Number.isFinite(anchor?.start)) previousStart = anchor.start;
  });
  return errors;
}

export function validateContent(scenes) {
  const errors = [];
  if (!Array.isArray(scenes) || scenes.length !== 14) {
    return [`scenes: expected 14, got ${Array.isArray(scenes) ? scenes.length : 'non-array'}`];
  }
  const sceneIds = new Set();
  const imageIds = new Set();
  scenes.forEach((scene, sceneIndex) => {
    const expectedId = `scene-${String(sceneIndex + 1).padStart(2, '0')}`;
    const path = scene.id || `scenes[${sceneIndex}]`;
    if (scene.id !== expectedId) errors.push(`${path}.id: expected ${expectedId}`);
    if (sceneIds.has(scene.id)) errors.push(`${path}.id: duplicate`);
    sceneIds.add(scene.id);
    if (scene.sourceImage !== EXPECTED_IMAGES[sceneIndex]) errors.push(`${path}.sourceImage: expected ${EXPECTED_IMAGES[sceneIndex]}`);
    if (imageIds.has(scene.sourceImage)) errors.push(`${path}.sourceImage: duplicate`);
    imageIds.add(scene.sourceImage);
    if (JSON.stringify(scene.scriptScenes) !== JSON.stringify(EXPECTED_SCRIPT_SCENES[sceneIndex])) errors.push(`${path}.scriptScenes: incorrect provenance`);
    if (!PALETTES.has(scene.palette)) errors.push(`${path}.palette: invalid`);
    if (!LAYOUTS.has(scene.layout)) errors.push(`${path}.layout: invalid`);

    for (const lang of LANGUAGES) {
      for (const field of ['title', 'chapter', 'tag', 'alt']) {
        if (!scene[field]?.[lang]?.trim()) errors.push(`${path}.${field}.${lang}: empty`);
      }
      if (!TEXT_STATUSES.has(scene.textStatus?.[lang])) errors.push(`${path}.textStatus.${lang}: invalid`);
      if (!Array.isArray(scene.paragraphRefs?.[lang]) || scene.paragraphRefs[lang].length === 0) errors.push(`${path}.paragraphRefs.${lang}: empty`);
      const paragraphs = scene.paragraphs?.[lang];
      if (!Array.isArray(paragraphs) || paragraphs.length === 0) {
        errors.push(`${path}.paragraphs.${lang}: empty`);
      } else {
        const paragraphIds = new Set();
        paragraphs.forEach((paragraph, index) => {
          const paragraphPath = `${path}.paragraphs.${lang}[${index}]`;
          if (!paragraph.id?.trim()) errors.push(`${paragraphPath}.id: empty`);
          if (paragraphIds.has(paragraph.id)) errors.push(`${paragraphPath}.id: duplicate`);
          paragraphIds.add(paragraph.id);
          if (!TYPES.has(paragraph.type)) errors.push(`${paragraphPath}.type: invalid`);
          if (paragraph.type === 'narration' && paragraph.speaker !== null) errors.push(`${paragraphPath}.speaker: narration must be null`);
          if (paragraph.type !== 'narration' && !SPEAKERS.has(paragraph.speaker)) errors.push(`${paragraphPath}.speaker: invalid`);
          if (!paragraph.text?.trim()) errors.push(`${paragraphPath}.text: empty`);
        });
      }
      const track = scene.audio?.[lang];
      if (!track || !AUDIO_STATUSES.includes(track.status)) errors.push(`${path}.audio.${lang}.status: invalid`);
      if (!track?.src?.endsWith(`/${scene.id}.mp3`)) errors.push(`${path}.audio.${lang}.src: invalid`);
      if (track?.src && !track.src.startsWith(`assets/audio/${lang}/`)) errors.push(`${path}.audio.${lang}.src: invalid language route`);
      if (track?.status === 'available' && (!Number.isFinite(track.duration) || track.duration <= 0)) errors.push(`${path}.audio.${lang}.duration: required`);
      if (track?.status === 'available' && (!Array.isArray(track.cues) || track.cues.length !== paragraphs?.length)) errors.push(`${path}.audio.${lang}.cues: required for every paragraph`);
      if (Array.isArray(paragraphs) && Array.isArray(track?.cues)) errors.push(...validateCues(track.cues, paragraphs, track.duration, `${path}.audio.${lang}.cues`));
    }
  });
  return errors;
}

export function isLanguageAudioComplete(scenes, lang) {
  return LANGUAGES.includes(lang) && scenes.length === 14 && scenes.every(scene => {
    const track = scene.audio?.[lang];
    const paragraphs = scene.paragraphs?.[lang];
    return track?.status === 'available'
      && Number.isFinite(track.duration)
      && track.duration > 0
      && Array.isArray(paragraphs)
      && Array.isArray(track.cues)
      && track.cues.length === paragraphs.length
      && validateCues(track.cues, paragraphs, track.duration).length === 0;
  });
}

export function validateStoryAudio(storyAudio, scenes = []) {
  const errors = [];
  for (const lang of LANGUAGES) {
    const track = storyAudio?.[lang];
    if (!track || track.status !== 'available') {
      errors.push(`storyAudio.${lang}.status: expected available`);
      continue;
    }
    if (track.src !== `assets/audio/${lang}/story.mp3`) errors.push(`storyAudio.${lang}.src: invalid`);
    if (!Number.isFinite(track.duration) || track.duration <= 0) errors.push(`storyAudio.${lang}.duration: required`);
    if (!Array.isArray(track.cues)) errors.push(`storyAudio.${lang}.cues: expected array`);
    else errors.push(...validateStoryCues(track.cues, scenes, track.duration, `storyAudio.${lang}.cues`));
    errors.push(...validateSceneAnchors(track.sceneAnchors, track.duration, `storyAudio.${lang}.sceneAnchors`));
  }
  return errors;
}

export function activeCue(cues, time) {
  return cues.find(cue => time >= cue.start && time < cue.end) ?? null;
}
