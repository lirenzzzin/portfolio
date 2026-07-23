import * as THREE from 'three';
import { MSDFTextGeometry } from 'three-msdf-text-utils';

const PAPER = 0xdcd7cd;

// Loader de assets da fonte (singleton reutilizável)
let assetsPromise = null;
function loadFontAssets() {
  if (!assetsPromise) {
    assetsPromise = Promise.all([
      fetch('font/EBGaramond.json').then((r) => r.json()),
      new THREE.TextureLoader().loadAsync('font/ebgaramond.png'),
    ]).then(([font, atlas]) => {
      atlas.minFilter = THREE.LinearFilter;
      atlas.magFilter = THREE.LinearFilter;
      atlas.generateMipmaps = false;
      return { font, atlas };
    });
  }
  return assetsPromise;
}

// Fábrica do Material de Tinta (Shader idêntico ao hero existente — NÃO alterar)
function createInkMaterial(atlas) {
  const uniforms = {
    uMap: { value: atlas },
    uColor: { value: new THREE.Color(0x201c17) }, // preenchimento (tinta levemente levantada)
    uEdge: { value: new THREE.Color(0x0f0d0a) },  // borda mais escura (migração de pigmento)
    uProgress: { value: 0 },
    uInk: { value: 1 },
    uOpacity: { value: 1 },
  };

  const material = new THREE.ShaderMaterial({
    transparent: true,
    side: THREE.DoubleSide,
    extensions: { derivatives: true },
    uniforms,
    vertexShader: /* glsl */ `
      attribute float letterIndex;
      varying vec2 vUv;
      varying vec2 vPos;
      varying float vLetterIndex;
      void main(){
        vUv = uv;
        vPos = position.xy;              // coord contínua em px ao longo da palavra
        vLetterIndex = letterIndex;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;
      uniform sampler2D uMap;
      uniform vec3 uColor;
      uniform vec3 uEdge;
      uniform float uProgress;
      uniform float uInk;
      uniform float uOpacity;
      varying vec2 vUv;
      varying vec2 vPos;
      varying float vLetterIndex;

      // simplex 2D — Ashima Arts (MIT)
      vec3 mod289(vec3 x){return x - floor(x*(1.0/289.0))*289.0;}
      vec2 mod289(vec2 x){return x - floor(x*(1.0/289.0))*289.0;}
      vec3 permute(vec3 x){return mod289(((x*34.0)+1.0)*x);}
      float snoise(vec2 v){
        const vec4 C = vec4(0.211324865405187,0.366025403784439,-0.577350269189626,0.024390243902439);
        vec2 i=floor(v+dot(v,C.yy));
        vec2 x0=v-i+dot(i,C.xx);
        vec2 i1=(x0.x>x0.y)?vec2(1.0,0.0):vec2(0.0,1.0);
        vec4 x12=x0.xyxy+C.xxzz; x12.xy-=i1;
        i=mod289(i);
        vec3 p=permute(permute(i.y+vec3(0.0,i1.y,1.0))+i.x+vec3(0.0,i1.x,1.0));
        vec3 m=max(0.5-vec3(dot(x0,x0),dot(x12.xy,x12.xy),dot(x12.zw,x12.zw)),0.0);
        m=m*m; m=m*m;
        vec3 x=2.0*fract(p*C.www)-1.0;
        vec3 hh=abs(x)-0.5; vec3 ox=floor(x+0.5); vec3 a0=x-ox;
        m*=1.79284291400159-0.85373472095314*(a0*a0+hh*hh);
        vec3 g; g.x=a0.x*x0.x+hh.x*x0.y; g.yz=a0.yz*x12.xz+hh.yz*x12.yw;
        return 130.0*dot(m,g);
      }
      float median(float r,float g,float b){ return max(min(r,g),min(max(r,g),b)); }

      void main(){
        vec3 s = texture2D(uMap, vUv).rgb;
        float sigDist = median(s.r,s.g,s.b);

        // ruído multi-oitava distorce o limiar -> tinta (coord em px, contínua)
        vec2 nuv = vPos;
        float n = snoise(nuv * 0.9) * 0.030 + snoise(nuv * 0.16) * 0.055;
        n *= uInk;
        float distorted = sigDist + n;

        // reveal por caractere: a tinta inunda do núcleo pra fora
        float reveal = clamp(uProgress - vLetterIndex, 0.0, 1.0);
        float threshold = mix(1.30, 0.5, reveal);

        float aa = fwidth(distorted);
        float alpha = clamp((distorted - threshold) / max(aa, 1e-4) + 0.5, 0.0, 1.0);

        // escurecimento de borda (anel de pigmento no limiar em avanço)
        float edgeBand = 1.0 - smoothstep(0.0, 0.10, abs(distorted - threshold));
        vec3 col = mix(uColor, uEdge, edgeBand * 0.85);

        float a = alpha * uOpacity;
        if (a < 0.01) discard;
        gl_FragColor = vec4(col, a);
      }
    `,
  });

  return { material, uniforms };
}

/**
 * Componente reutilizável de texto em tinta WebGL.
 * @param {Object} options
 * @param {HTMLElement} options.el - Elemento contêiner do texto
 * @param {string} options.text - Texto a ser renderizado em WebGL
 * @param {HTMLCanvasElement} [options.canvas] - Canvas existente opcional (para o hero)
 * @param {boolean} [options.autoReveal=false] - Se true, dispara o reveal automaticamente na criação
 * @param {boolean} [options.isHero=false] - Se true, mantém o loop rAF ativo continuamente (comportamento do hero)
 */
export async function createInkText({ el, text, canvas: existingCanvas, autoReveal = false, isHero = false, onChar = null }) {
  if (!el || !text) return null;

  // Guardas: se reduced-motion ou sem WebGL -> mantém fallback HTML estático
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function hasWebGL() {
    try {
      const c = document.createElement('canvas');
      return !!(window.WebGLRenderingContext && (c.getContext('webgl') || c.getContext('experimental-webgl')));
    } catch (e) {
      return false;
    }
  }

  if (reduced || !hasWebGL()) {
    return null;
  }

  const { font, atlas } = await loadFontAssets();

  // Se o canvas não foi fornecido, cria um canvas absoluto sobre o elemento
  let canvas = existingCanvas;
  let createdCanvas = false;
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.className = 'ink-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    el.appendChild(canvas);
    createdCanvas = true;
  }

  // Envolve o texto HTML existente em uma span interna para controle de visibilidade
  if (!el.querySelector('.ink-text-content')) {
    const textSpan = document.createElement('span');
    textSpan.className = 'ink-text-content';
    while (el.firstChild && el.firstChild !== canvas) {
      textSpan.appendChild(el.firstChild);
    }
    el.insertBefore(textSpan, canvas);
  }

  // Garante posicionamento relativo no elemento pai
  if (getComputedStyle(el).position === 'static') {
    el.style.position = 'relative';
    el.style.display = 'inline-block';
  }

  // Marca os atributos data para ativação CSS
  el.setAttribute('data-ink', 'on');
  document.body.setAttribute('data-webgl', 'on');

  // Geometria MSDF (width finito é OBRIGATÓRIO conforme MSDF_NAN_DIAGNOSIS.md)
  const geometry = new MSDFTextGeometry({ text, font, width: 4000, align: 'left' });
  geometry.computeBoundingBox();
  const bb = geometry.boundingBox;
  const w = bb.max.x - bb.min.x;
  const h = bb.max.y - bb.min.y;
  const cx = bb.min.x + w / 2;
  const cy = bb.min.y + h / 2;

  // Shader & Mesh
  const { material, uniforms } = createInkMaterial(atlas);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false; // frustumCulled false é OBRIGATÓRIO (evita NaN no boundingSphere)

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 100);
  camera.position.z = 10;
  scene.add(mesh);

  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setClearColor(PAPER, 0);

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const cw = Math.max(1, rect.width);
    const ch = Math.max(1, rect.height);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(dpr);
    renderer.setSize(cw, ch, false);
    camera.left = -cw / 2;
    camera.right = cw / 2;
    camera.top = ch / 2;
    camera.bottom = -ch / 2;
    camera.updateProjectionMatrix();

    const scale = (cw / 1.10) / w;
    mesh.scale.set(scale, -scale, scale);
    // Centraliza SOMENTE via mesh.position (NUNCA usar geometry.translate/center)
    mesh.position.set(-cx * scale, cy * scale, 0);
  }

  window.addEventListener('resize', resize);
  resize();

  // Tratamento de perda de contexto WebGL: remove canvas e restaura texto HTML
  canvas.addEventListener('webglcontextlost', (ev) => {
    ev.preventDefault();
    dispose();
  });

  const N = text.length;
  let progress = 0;
  let inkTarget = 1;
  let isRevealing = false;
  let isDone = false;
  let animFrameId = null;
  let lastChar = 0;
  const clock = new THREE.Clock();

  function renderFrame() {
    const dt = Math.min(clock.getDelta(), 0.05);

    if (isRevealing) {
      progress = Math.min(progress + dt * 7.0, N + 1);
      uniforms.uProgress.value = progress;

      // som por caractere: dispara quando floor(progress) avança (sincronia aparição↔som)
      if (onChar) {
        const fl = Math.floor(progress);
        if (fl > lastChar && lastChar < N) {
          onChar();
          lastChar = fl;
        }
      }

      if (progress >= N) {
        inkTarget = 0.28; // assenta em texto quase nítido
      }
      uniforms.uInk.value += (inkTarget - uniforms.uInk.value) * Math.min(1, dt * 3);

      // Quando o reveal termina e a tinta assenta, encerra o rAF nas manchetes (economiza GPU)
      if (progress >= N && Math.abs(uniforms.uInk.value - 0.28) < 0.01) {
        uniforms.uInk.value = 0.28;
        isRevealing = false;
        if (!isHero) {
          isDone = true;
        }
      }
    }

    renderer.render(scene, camera);

    if (!isDone) {
      animFrameId = requestAnimationFrame(renderFrame);
    }
  }

  function reveal() {
    if (isRevealing || (isDone && !isHero)) return;
    progress = 0;
    lastChar = 0;
    inkTarget = 1;
    uniforms.uProgress.value = 0;
    uniforms.uInk.value = 1;
    isRevealing = true;
    isDone = false;
    if (!animFrameId) {
      clock.start();
      animFrameId = requestAnimationFrame(renderFrame);
    }
  }

  function dispose() {
    if (animFrameId) {
      cancelAnimationFrame(animFrameId);
      animFrameId = null;
    }
    window.removeEventListener('resize', resize);
    el.removeAttribute('data-ink');
    if (createdCanvas && canvas.parentNode) {
      canvas.parentNode.removeChild(canvas);
    }
    geometry.dispose();
    material.dispose();
    renderer.dispose();
  }

  if (autoReveal) {
    reveal();
  } else {
    // Renderiza quadro inicial estático até o gatilho de reveal
    renderer.render(scene, camera);
  }

  return {
    reveal,
    dispose,
    uniforms,
    mesh,
    camera,
    geometry,
  };
}
