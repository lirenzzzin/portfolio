// Áudio do site: teclas de máquina (WebAudio) + trilha noir em loop.
// Autoplay só depois de um gesto do usuário; estado mudo persiste em localStorage.

let ctx = null;
let keyBuffer = null;
let bufferLoading = null;
let music = null;
let started = false;
let activeVoices = 0;

function readMuted() {
  try { return localStorage.getItem('audio-mudo') === '1'; } catch (e) { return false; }
}
let muted = readMuted();

function ensureCtx() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  return ctx;
}

function loadKeyBuffer() {
  if (!bufferLoading) {
    const c = ensureCtx();
    if (!c) return Promise.resolve(null);
    bufferLoading = fetch('audio/typewriter-key.mp3')
      .then((r) => r.arrayBuffer())
      .then((ab) => c.decodeAudioData(ab))
      .then((buf) => { keyBuffer = buf; return buf; })
      .catch(() => null);
  }
  return bufferLoading;
}

function ensureMusic() {
  if (!music) {
    music = new Audio('audio/trilha-noir.mp3');
    music.loop = true;
    music.volume = 0.14; // baixo
    music.preload = 'auto';
  }
  return music;
}

// Libera o áudio no primeiro gesto (o browser bloqueia antes disso).
function start() {
  if (started) return;
  started = true;
  const c = ensureCtx();
  if (c && c.state === 'suspended') c.resume();
  if (!muted) ensureMusic().play().catch(() => {});
}

export function initAudio() {
  ensureCtx();
  loadKeyBuffer();
  ensureMusic();

  const unlock = () => {
    start();
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
    window.removeEventListener('touchstart', unlock);
    window.removeEventListener('scroll', unlock);
  };
  window.addEventListener('pointerdown', unlock, { passive: true });
  window.addEventListener('keydown', unlock);
  window.addEventListener('touchstart', unlock, { passive: true });
  window.addEventListener('scroll', unlock, { passive: true });
}

// Garante contexto ativo e retorna quando puder tocar (usado pelo replay do hero).
export async function ensureStarted() {
  start();
  if (ctx && ctx.state === 'suspended') {
    try { await ctx.resume(); } catch (e) { /* noop */ }
  }
}

// Toca uma tecla com variação leve de pitch (±6%) e volume (±15%).
// Nunca sobrepõe mais de ~3 instâncias.
export function tecla(volume = 0.5) {
  if (muted || !started || !keyBuffer || !ctx) return;
  if (ctx.state !== 'running') return;
  if (activeVoices >= 3) return;

  const src = ctx.createBufferSource();
  src.buffer = keyBuffer;
  src.playbackRate.value = 1 + (Math.random() * 2 - 1) * 0.06;

  const g = ctx.createGain();
  g.gain.value = Math.max(0, volume * (1 + (Math.random() * 2 - 1) * 0.15));

  src.connect(g).connect(ctx.destination);
  activeVoices++;
  src.onended = () => { activeVoices = Math.max(0, activeVoices - 1); };
  src.start();
}

export function isMuted() { return muted; }

export function setMuted(m) {
  muted = m;
  try { localStorage.setItem('audio-mudo', m ? '1' : '0'); } catch (e) { /* noop */ }
  if (m) {
    if (music) music.pause();
  } else if (started) {
    ensureMusic().play().catch(() => {});
  }
}

export function toggleMuted() {
  setMuted(!muted);
  return muted;
}
