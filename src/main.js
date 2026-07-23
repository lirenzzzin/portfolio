import { createInkText } from './ink-text.js';
import { initAudio, tecla, ensureStarted, isMuted, toggleMuted } from './audio.js';
import './scroll-reveal.js';

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Retorno tátil por letra enquanto o nome é digitado.
// Android/Chrome: Vibration API (funciona após um gesto do usuário — ex.: o replay ⟲).
// iOS/Safari: SEM caminho. Não há Vibration API na web, e o único truque conhecido
// (<input switch>, iOS 17.4+) só dispara em toque real do usuário — não serve pra
// digitação automática — e a Apple o corrigiu no iOS 26.5. Então iPhone fica sem tátil.
function haptic() {
  if (reduced) return;
  if (navigator.vibrate) navigator.vibrate(7);
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
  const en = (document.documentElement.lang || '').slice(0, 2) === 'en';
  somBtn.textContent = en ? (m ? 'MUTED' : 'SOUND') : (m ? 'MUDO' : 'SOM');
  somBtn.setAttribute('aria-pressed', m ? 'true' : 'false');
  somBtn.setAttribute('aria-label', en
    ? (m ? 'Muted — turn sound on' : 'Sound on — mute')
    : (m ? 'Áudio mudo — ativar som' : 'Áudio ligado — silenciar'));
}
if (somBtn) {
  pintarSom(); // reflete o estado salvo no load
  somBtn.addEventListener('click', () => {
    toggleMuted();
    pintarSom();
  });
  window.addEventListener('i18n-mudou', pintarSom); // re-traduz ao trocar idioma
}
