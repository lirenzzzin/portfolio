import gsap from 'gsap';
import ScrollTrigger from 'gsap/ScrollTrigger';
import { createInkText } from './ink-text.js';

gsap.registerPlugin(ScrollTrigger);

// Elementos com datilografia ativa, pra poder matar/restaurar quando a língua trocar.
const active = new Map(); // el -> { tween, full }

function revertEl(el) {
  const entry = active.get(el);
  if (!entry) return;
  if (entry.tween) entry.tween.kill();
  gsap.set(el, { clearProps: 'filter,transform,opacity,willChange' });
  el.style.visibility = 'visible';
  active.delete(el);
}

// ---- fila de revelação (ordem do documento, concorrência 2) ----
// O ScrollTrigger só ENFILEIRA. Um "pump" processa a fila mantendo no MÁXIMO 2 blocos
// consecutivos revelando ao mesmo tempo (o N+1 pode começar enquanto o N revela, mas
// nunca se pula ordem). Se o usuário já rolou muito além de um bloco, ele é resolvido
// instantâneo (visível, sem animar) pra fila não acumular.
const MAX_CONCORRENTES = 2;
const fila = [];
let ativos = 0;
const isMobile = window.matchMedia('(max-width: 46rem)').matches;

function enfileirar(el) {
  if (fila.includes(el) || active.has(el)) return;
  fila.push(el);
  pump();
}

function pump() {
  while (ativos < MAX_CONCORRENTES && fila.length) {
    const el = fila.shift();
    // se já rolou pra fora (bloco acima do topo do viewport), resolve instantâneo
    if (el.getBoundingClientRect().bottom < 0) {
      el.style.visibility = 'visible';
      continue;
    }
    ativos++;
    revealBlock(el, () => { ativos--; pump(); });
  }
}

// Revelação "tinta assentando": o bloco entra desfocado, transparente e um pouco abaixo,
// e sobe entrando em foco. Desktop usa blur (bonito); mobile evita blur (custa FPS no
// celular — pesquisa 2026) e faz só fade + subida. Estado final = texto puro (preto + halo
// do CSS). Nível de bloco: sem spans → imune ao bug de empilhamento e à troca de idioma.
function revealBlock(el, onDone) {
  if (active.has(el)) { if (onDone) onDone(); return; }

  el.style.visibility = 'visible'; // anti-FOUC: visível só quando a revelação começa
  const fromBlur = isMobile ? 0 : 12;
  gsap.set(el, {
    opacity: 0,
    y: isMobile ? 14 : 20,
    filter: fromBlur ? `blur(${fromBlur}px)` : 'none',
    willChange: 'opacity, transform, filter',
  });
  const tween = gsap.to(el, {
    opacity: 1,
    y: 0,
    filter: fromBlur ? 'blur(0px)' : 'none',
    duration: isMobile ? 0.42 : 0.5,
    ease: 'power3.out',
    onComplete: () => {
      gsap.set(el, { clearProps: 'filter,transform,opacity,willChange' });
      active.delete(el);
      if (onDone) onDone();
    },
  });

  active.set(el, { tween });
}

// CRÍTICO: o toggle PT/EN troca textContent. Mata tweens ativos e limpa os estilos
// inline ANTES do aplicar(), e retoma a fila (o onComplete do tween morto não dispara).
function killAllSplits() {
  for (const el of [...active.keys()]) revertEl(el);
  ativos = 0;
  pump();
}
if (typeof window !== 'undefined') {
  window.__killSplits = killAllSplits;
}

const TYPE_SELECTOR = [
  '.tese span',
  '.funcao',
  '.legenda-retrato',
  '.cinta',
  '.situacao',
  '.campo dt',
  '.campo dd',
  '.anotacao .rotulo',
  '.anotacao p',
  '.foto-materia .abrir',
  '.terreno-titulo',
  '.bloco h4',
  '.bloco li',
  '.recorte-frase p',
].join(',');

export async function initScrollReveal() {
  // Guarda: reduced-motion → página estática completa (sem split, sem áudio de teclas).
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return;
  }

  // Scroll suave (lerp) — ScrollSmoother sobre os wrappers #smooth-wrapper/#smooth-content.
  // Touch fica nativo (smoothTouch:false): iOS/Android já têm inércia própria.
  let smoother = null;
  try {
    const mod = await import('gsap/ScrollSmoother');
    const ScrollSmoother = mod.ScrollSmoother || mod.default;
    gsap.registerPlugin(ScrollSmoother);
    smoother = ScrollSmoother.create({
      wrapper: '#smooth-wrapper',
      content: '#smooth-content',
      smooth: 1.25,
      smoothTouch: false,
    });
  } catch (e) {
    console.warn('[scroll] ScrollSmoother indisponível, scroll nativo:', e);
  }

  // botão "Contato" do cabeçalho → rola suave até a seção de contato (final)
  const btnContato = document.querySelector('[data-goto-contato]');
  const alvoContato = document.querySelector('#contato');
  if (btnContato && alvoContato) {
    btnContato.addEventListener('click', () => {
      if (smoother) {
        // 'bottom bottom': alinha o fim da seção com o fim da viewport → desce até o final do papel
        smoother.scrollTo(alvoContato, true, 'bottom bottom');
      } else {
        alvoContato.scrollIntoView({ behavior: 'smooth', block: 'end' });
      }
    });
  }

  // Texto corrido e rótulos: datilografia letra a letra (fila). Configurado PRIMEIRO
  // pra revelar prontamente o above-fold (as manchetes abaixo dependem de await do WebGL).
  const alvos = document.querySelectorAll(TYPE_SELECTOR);
  alvos.forEach((el) => {
    ScrollTrigger.create({
      trigger: el,
      start: 'top 78%',   /* escreve depois que a folha já materializou ali */
      once: true,
      onEnter: () => enfileirar(el),
    });
  });

  // Manchetes das matérias: reveal de tinta WebGL próprio (mantém). SEM teclas de
  // máquina — o som de datilografia toca APENAS na introdução do hero (o nome).
  const registros = document.querySelectorAll('.registro');
  for (const registro of registros) {
    const h3 = registro.querySelector('h3');
    if (!h3) continue;

    const headlineText = h3.textContent.trim();
    try {
      const inkInstance = await createInkText({ el: h3, text: headlineText });
      if (inkInstance) {
        ScrollTrigger.create({
          trigger: registro,
          start: 'top 82%',
          once: true,
          onEnter: () => inkInstance.reveal(),
        });
      } else {
        // sem WebGL: a manchete datilografa como texto normal (na fila)
        ScrollTrigger.create({
          trigger: h3, start: 'top 88%', once: true, onEnter: () => enfileirar(h3),
        });
      }
    } catch (err) {
      console.warn('[scroll-reveal] manchete em tinta falhou, usando datilografia:', err);
      ScrollTrigger.create({
        trigger: h3, start: 'top 88%', once: true, onEnter: () => enfileirar(h3),
      });
    }
  }
}

// Inicializa automaticamente se carregado no navegador
if (typeof window !== 'undefined') {
  if (document.querySelector('body')) {
    initScrollReveal();
  } else {
    document.addEventListener('DOMContentLoaded', initScrollReveal);
  }
}
