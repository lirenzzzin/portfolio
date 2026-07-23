import { createInkText } from './ink-text.js';
import { initAudio, tecla, ensureStarted, isMuted, toggleMuted } from './audio.js';
import './scroll-reveal.js';

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Retorno tátil por letra enquanto o nome é digitado.
// Android/Chrome: Vibration API (funciona após um gesto do usuário — ex.: o replay ⟲).
// iOS/Safari: NÃO expõe Vibration API na web (a Apple bloqueia). Tentamos o truque do
// <input switch> (Safari 17.4+), mas é best-effort e pode simplesmente não vibrar.
let iosHaptic = null;
if (typeof navigator !== 'undefined' && !('vibrate' in navigator) && document.body) {
  const lbl = document.createElement('label');
  lbl.setAttribute('aria-hidden', 'true');
  lbl.style.cssText = 'position:absolute;left:-9999px;width:0;height:0;overflow:hidden';
  lbl.innerHTML = '<input type="checkbox" switch tabindex="-1">';
  document.body.appendChild(lbl);
  iosHaptic = lbl;
}
function haptic() {
  if (reduced) return;
  if (navigator.vibrate) { navigator.vibrate(7); return; }
  if (iosHaptic) { try { iosHaptic.click(); } catch (e) { /* noop */ } }
}

// Áudio: prepara buffers e libera no primeiro gesto (reduced-motion não afeta áudio,
// mas se estiver mudo no localStorage nada toca — garantido dentro do audio.js).
initAudio();

const heroEl = document.querySelector('.nome-caixa');
const heroCanvas = document.querySelector('.hero-canvas');

if (heroEl) {
  createInkText({
    el: heroEl,
    text: 'Lorenzzo Linares',
    canvas: heroCanvas,
    autoReveal: true,
    isHero: true,
    onChar: () => { tecla(0.5); haptic(); }, // som + tique tátil, sincronizados com a letra
  }).then((heroInstance) => {
    if (heroInstance) {
      window.__hero = heroInstance;
    }
  }).catch((err) => {
    console.error('[hero] falhou, mantendo fallback:', err);
    document.body.removeAttribute('data-webgl');
  });
}

// Botão replay "⟲": re-dispara o reveal do hero — agora com som (é gesto do usuário).
const replayBtn = document.querySelector('.replay-hero');
if (replayBtn) {
  if (reduced || !window.WebGLRenderingContext) {
    replayBtn.hidden = true;
  }
  replayBtn.addEventListener('click', async () => {
    await ensureStarted();
    if (window.__hero && typeof window.__hero.reveal === 'function') {
      window.__hero.reveal();
    }
  });
}

// Botão SOM/MUDO no cabeçalho.
const somBtn = document.querySelector('[data-audio-toggle]');
function pintarSom() {
  const m = isMuted();
  somBtn.textContent = m ? 'MUDO' : 'SOM';
  somBtn.setAttribute('aria-pressed', m ? 'true' : 'false');
  somBtn.setAttribute('aria-label', m ? 'Áudio mudo — ativar som' : 'Áudio ligado — silenciar');
}
if (somBtn) {
  pintarSom(); // reflete o estado salvo no load
  somBtn.addEventListener('click', () => {
    toggleMuted();
    pintarSom();
  });
}
