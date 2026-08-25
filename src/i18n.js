import { LANGUAGES } from './content.js';

const UI = {
  start: { id: 'Mulai', jv: 'Wiwiti', en: 'Start' },
  startStory: { id: 'Mulai cerita', jv: 'Wiwiti crita', en: 'Start story' },
  startReading: { id: 'Mulai membaca', jv: 'Miwiti maca', en: 'Start reading' },
  startFromBeginning: { id: 'Mulai dari awal', jv: 'Wiwiti saka wiwitan', en: 'Start from the beginning' },
  skipStory: { id: 'Lewati ke cerita', jv: 'Langsung menyang crita', en: 'Skip to the story' },
  illustratedStory: { id: 'Cerita bergambar', jv: 'Crita mawa gambar', en: 'Illustrated story' },
  opening: { id: 'Pembukaan', jv: 'Pambuka', en: 'Opening' },
  openingMeta: { id: '14 adegan · cerita bergambar', jv: '14 adegan · crita mawa gambar', en: '14 scenes · illustrated story' },
  introTitle: {
    id: 'Darmo memulai perjalanan.',
    jv: 'Darmo miwiti lelakon.',
    en: 'Darmo begins a journey.'
  },
  introDescription: {
    id: 'Ikuti Darmo dari dermaga hingga mantra ketulusan.',
    jv: 'Tutna Darmo saka dermaga nganti mantra ketulusan.',
    en: 'Follow Darmo from the harbour to the mantra of sincerity.'
  },
  entryAudioNote: {
    id: 'Audio keseluruhan dimulai dari tombol ini.',
    jv: 'Audio sakabehe diwiwiti saka tombol iki.',
    en: 'The full-story audio begins from this button.'
  },
  chooseScene: { id: 'Pilih adegan', jv: 'Pilih adegan', en: 'Choose a scene' },
  aboutActivities: { id: 'Tentang & Aktivitas', jv: 'Babagan & Kagiyatan', en: 'About & Activities' },
  closing: { id: 'Penutup', jv: 'Panutup', en: 'Closing' },
  endingTitle: {
    id: 'Kekuatan tumbuh dari hati yang tulus.',
    jv: 'Kekuwatan tuwuh saka ati kang tulus.',
    en: 'Strength grows from a sincere heart.'
  },
  endingDescription: {
    id: 'Kepercayaan, usaha, dan keberanian untuk meminta maaf menjadi inti perjalanan Darmo.',
    jv: 'Kapercayan, usaha, lan wani njaluk ngapura dadi inti lelakone Darmo.',
    en: 'Faith, effort, and the courage to apologize are at the heart of Darmo’s journey.'
  },
  readAgain: { id: 'Baca dari awal', jv: 'Waca saka wiwitan', en: 'Read from the beginning' },
  audioLabel: { id: 'Narasi audio', jv: 'Narasi audio', en: 'Audio narration' },
  audioUnavailableAction: { id: 'Audio belum tersedia', jv: 'Audio durung kasedhiya', en: 'Audio unavailable' },
  audioComing: { id: 'Rekaman audio akan tersedia', jv: 'Rekaman audio bakal kasedhiya', en: 'Audio recordings coming soon' },
  audioMissing: { id: 'Rekaman audio belum tersedia', jv: 'Rekaman audio durung kasedhiya', en: 'Audio recording is not available yet' },
  audioError: { id: 'Audio gagal dimuat', jv: 'Audio gagal dimuat', en: 'Audio failed to load' },
  audioLoading: { id: 'Memuat audio…', jv: 'Ngamot audio…', en: 'Loading audio…' },
  audioBuffering: { id: 'Koneksi lambat…', jv: 'Koneksi alon…', en: 'Slow connection…' },
  audioComplete: { id: 'Cerita selesai diputar', jv: 'Crita wis rampung diputer', en: 'Story playback complete' },
  audioPlaying: { id: 'Narasi sedang diputar', jv: 'Narasi lagi diputer', en: 'Narration is playing' },
  audioPaused: { id: 'Narasi dijeda', jv: 'Narasi dipause', en: 'Narration is paused' },
  audioReplay: { id: 'Putar ulang cerita', jv: 'Puter maneh crita', en: 'Play the story again' },
  pauseAudio: { id: 'Jeda audio', jv: 'Jeda audio', en: 'Pause audio' },
  playAudio: { id: 'Putar audio', jv: 'Puter audio', en: 'Play audio' },
  retry: { id: 'Coba lagi', jv: 'Coba maneh', en: 'Try again' },
  playAll: { id: 'Putar seluruh cerita', jv: 'Puter crita sakabehe', en: 'Play the full story' },
  listenScene: { id: 'Dengarkan adegan', jv: 'Rungokna adegan', en: 'Listen to this scene' },
  listenParagraph: { id: 'Dengarkan dialog ini', jv: 'Rungokna dialog iki', en: 'Listen to this dialogue' },
  audioProgress: { id: 'Kemajuan audio', jv: 'Kemajuan audio', en: 'Audio progress' },
  audioSpeed: { id: 'Kecepatan audio', jv: 'Kacepetan audio', en: 'Audio speed' },
  rateTimes: { id: 'kali', jv: 'kaping', en: 'times' },
  returnToNarration: { id: 'Kembali ke narasi', jv: 'Bali menyang narasi', en: 'Return to narration' },
  remaining: { id: 'Sisa', jv: 'Sisa', en: 'Remaining' },
  sceneComplete: { id: 'Selesai', jv: 'Rampung', en: 'Complete' },
  listenSlide: { id: 'Dengarkan bagian ini', jv: 'Rungokna bagean iki', en: 'Listen to this part' },
  sceneAudioPlaying: { id: 'Sedang dibacakan', jv: 'Lagi diwacakake', en: 'Playing this part' },
  previous: { id: 'Sebelumnya', jv: 'Sadurunge', en: 'Previous' },
  next: { id: 'Berikutnya', jv: 'Sabanjure', en: 'Next' },
  repeat: { id: 'Ulangi', jv: 'Baleni', en: 'Repeat' },
  repeatAudio: { id: 'Ulangi audio', jv: 'Baleni audio', en: 'Repeat audio' },
  close: { id: 'Tutup', jv: 'Tutup', en: 'Close' },
  scene: { id: 'Adegan', jv: 'Adegan', en: 'Scene' },
  textSummaryNotice: {
    id: 'Teks Jawa tersedia dalam versi ringkas.',
    jv: 'Teks Jawa kasedhiya ing versi ringkes.',
    en: 'Javanese text is currently available as a summary.'
  },
  languageCue: {
    id: 'Membaca dalam Bahasa Indonesia',
    jv: 'Maca nganggo basa Jawa',
    en: 'Reading in English'
  },
  previousScene: { id: 'Adegan sebelumnya', jv: 'Adegan sadurunge', en: 'Previous scene' },
  nextScene: { id: 'Lanjut ke adegan berikutnya', jv: 'Terusake menyang adegan sabanjure', en: 'Continue to next scene' },
  continueReading: { id: 'Geser untuk lanjut', jv: 'Geser kanggo nerusake', en: 'Scroll to continue' },
  coverSwipeHint: { id: 'Geser untuk melihat halaman berikutnya', jv: 'Geser kanggo ndeleng kaca sabanjure', en: 'Swipe to see the next page' },
  javaneseSummaryLabel: { id: 'Jawa', jv: 'Jawa', en: 'Javanese' },
  javaneseSummaryAria: { id: 'Bahasa Jawa', jv: 'Basa Jawa', en: 'Javanese' }
};

const SPEAKERS = {
  darmo: { id: 'Darmo', jv: 'Darmo', en: 'Darmo' },
  master: { id: 'Ki Guru', jv: 'Ki Guru', en: 'Master' },
  students: { id: 'Para murid', jv: 'Para murid', en: 'Students' },
  soundEffect: { id: 'Efek suara', jv: 'Efek swara', en: 'Sound effect' }
};

export function translate(value, lang) {
  if (!value || !LANGUAGES.includes(lang)) return '';
  return value[lang] ?? '';
}

export function uiText(lang, key) {
  return translate(UI[key], lang);
}

export function speakerText(lang, key) {
  return translate(SPEAKERS[key], lang);
}

export { UI, SPEAKERS };
