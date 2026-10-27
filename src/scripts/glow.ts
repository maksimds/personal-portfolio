/* ---------- Cursor-following glow (hero and footers) ----------
   A radial gradient (grey edge → coloured centre) drawn with WebGL on every
   element with class "glow" (markup: .glow > .glow__bg > canvas.glow__canvas,
   see src/components/Glow.astro):
   - the centre eases toward the cursor while it's over the glow's own section,
     and stays where it is when the cursor leaves. The footer's glow starts where
     the hero's is (on a page with a hero) and keeps matching it until the cursor
     first comes over the footer; from then on it moves on its own
   - the centre colour drifts slowly and steadily through `colors`; all glows
     share one clock, so they always show the same colour
   - the edge is slowly warped by animated noise
   - animated grain dithers the blend, so it only shows in the fade
   - it gets paler while the cursor is on text or a picture in front of it (in
     its own section; for the About page's page-wide glow, the page's content
     and the footer), so the text is easier to read
   If WebGL is unavailable, the CSS gradient on .glow__bg is used instead;
   it still follows the cursor, changes colour and gets paler. */
const GLOW = {
  colors: [                  // centre colours, visited in order, then looping.
                             // Ordered around the colour wheel so each step is a small one.
    '#2f4881',               // dark blue
    '#3b3783',               // indigo
    '#4e2a6a',               // dark plum
    '#6a2352',               // dark berry
    '#7a1f2b',               // dark red
    '#86301a',               // rust
    '#9a4612',               // dark orange
    '#8a5a12',               // dark ochre
    '#55591c',               // dark olive
    '#26553a',               // forest green
    '#1d5a52',               // dark teal
    '#1f4c6b'                // petrol blue
  ],
  change: 8,                 // average seconds to drift from one colour to the next
  outer: '#e3ded3',          // edge colour (page background)
  pale: 0.10,                // how much paler the centre is than `colors` (share mixed toward `outer`)
  x: 0.61, y: 0.60,          // resting position (fraction of the section)
  radius: 0.8,               // relative to the section's size
  followSpeed: 3.2,          // higher = catches up with the cursor faster
  grain: 0.10,               // grain strength (strongest mid-fade, none at either end)
  warp: 0.15,                // how much the edge distorts
  warpSpeed: 0.08,           // how fast the distortion changes
  hoverPale: 0.30,           // how much paler it gets on text or a picture (share mixed toward `outer`)
  hoverPaleTime: 0.9         // seconds to pale, and to come back, eased in and out (like the links' hover)
};

type Vec3 = [number, number, number];
interface Point { x: number; y: number; }

function hexToRgb(hex: string): Vec3 {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
}

// Colours are blended in OKLab, a perceptual colour space, so a change looks
// equally paced from start to finish instead of rushing through part of it.
function toLinear(c: number): number { return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
function toSrgb(c: number): number { return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055; }

function rgbToOklab(rgb: Vec3): Vec3 {
  const r = toLinear(rgb[0]), g = toLinear(rgb[1]), b = toLinear(rgb[2]);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s
  ];
}

function oklabToRgb(lab: Vec3): Vec3 {
  const l = Math.pow(lab[0] + 0.3963377774 * lab[1] + 0.2158037573 * lab[2], 3);
  const m = Math.pow(lab[0] - 0.1055613458 * lab[1] - 0.0638541728 * lab[2], 3);
  const s = Math.pow(lab[0] - 0.0894841775 * lab[1] - 1.2914855480 * lab[2], 3);
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
  ].map((c) => Math.min(1, Math.max(0, toSrgb(c)))) as Vec3;
}

function labDistance(a: Vec3, b: Vec3): number {
  return Math.sqrt(Math.pow(a[0] - b[0], 2) + Math.pow(a[1] - b[1], 2) + Math.pow(a[2] - b[2], 2));
}

// Shared colour timeline. The colour drifts continuously at one steady speed,
// never pausing: a bigger step between two colours simply takes proportionally longer.
// With reduced motion the colour, grain and edge stay still (the glow still follows the cursor).
let glowAnimate = true;
const glowOuter = rgbToOklab(hexToRgb(GLOW.outer));

// An OKLab colour mixed `share` of the way toward the edge colour, which makes it paler.
function paler(c: Vec3, share: number): Vec3 {
  return c.map((v, i) => v + (glowOuter[i]! - v) * share) as Vec3;
}

const glowPalette: Vec3[] = GLOW.colors.map((hex) => paler(rgbToOklab(hexToRgb(hex)), GLOW.pale));
const glowSteps = glowPalette.map((c, i) => labDistance(c, glowPalette[(i + 1) % glowPalette.length]!));
const glowAvgStep = glowSteps.reduce((a, b) => a + b, 0) / glowSteps.length || 1;
const glowDurations = glowSteps.map((d) => Math.max(0.001, GLOW.change * d / glowAvgStep));
const glowCycle = glowDurations.reduce((a, d) => a + d, 0);

// Seconds on the shared clock (time since the page loaded; frozen with reduced motion).
function glowTime(): number {
  return glowAnimate ? performance.now() / 1000 : 0;
}

// The centre colour at `seconds` on the shared clock, made paler by `pale` (see paler).
function glowColorAt(seconds: number, pale = 0): Vec3 {
  const palette = glowPalette;
  if (palette.length < 2) return oklabToRgb(paler(palette[0]!, pale));
  let time = seconds % glowCycle;
  let i = 0;
  for (; i < palette.length; i++) {
    if (time < glowDurations[i]! || i === palette.length - 1) break;
    time -= glowDurations[i]!;
  }
  const t = Math.min(1, time / glowDurations[i]!);
  const a = palette[i]!, b = palette[(i + 1) % palette.length]!;
  return oklabToRgb(paler([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t], pale));
}

// On a page with a hero glow, returns where it is (or where it stopped) as a fraction of the
// hero. The footer's glow starts at the same spot, so the two match until the cursor comes
// over the footer. Set by initGlow.
let heroGlowSpot: (() => Point) | null = null;

// The lines of the text nodes among `nodes`, each stretched up and down by half the line spacing
// (plus half a pixel so rounding in the line height can't leave a gap), so the lines of one
// paragraph meet halfway.
function lineRects(nodes: Iterable<Node>): DOMRect[] {
  const rects: DOMRect[] = [];
  const range = document.createRange();
  for (const node of nodes) {
    if (node.nodeType !== Node.TEXT_NODE || !node.textContent?.trim() || !node.parentElement) continue;
    const lineHeight = parseFloat(getComputedStyle(node.parentElement).lineHeight);   // NaN for "normal": lines don't stretch
    range.selectNodeContents(node);
    for (const r of range.getClientRects()) {
      const stretch = lineHeight > r.height ? (lineHeight - r.height) / 2 + 0.5 : 0;
      rects.push(new DOMRect(r.left, r.top - stretch, r.width, r.height + stretch * 2));
    }
  }
  return rects;
}

// Whether a point (viewport coordinates) is on a picture inside `areas` (like the About photo with
// its frame and mat, or an icon) or on their text: on a line, between its first and last letter,
// not in the space after a short line or between a heading and its paragraph. Lines of one
// paragraph meet halfway, so moving down through a paragraph doesn't count as leaving it.
// A block marked data-glow-block (the home hero's location and status lines) counts as a whole: anywhere from
// its first line to its last, between the left of its text and the end of its longest line.
function onContent(p: Point, areas: Element[]): boolean {
  // The deepest element at the point, so the text under it is one of its own text nodes
  const el = document.elementFromPoint(p.x, p.y);
  if (!el || !areas.some((area) => area.contains(el))) return false;
  if (el.closest('figure, picture, img, svg')) return true;
  const block = el.closest('[data-glow-block]');
  if (block) {
    const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
    const nodes: Node[] = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    const lines = lineRects(nodes);
    return lines.length > 0 &&
      p.x >= Math.min(...lines.map((r) => r.left)) && p.x <= Math.max(...lines.map((r) => r.right)) &&
      p.y >= Math.min(...lines.map((r) => r.top)) && p.y <= Math.max(...lines.map((r) => r.bottom));
  }
  return lineRects(el.childNodes).some((r) => p.x >= r.left && p.x <= r.right && p.y >= r.top && p.y <= r.bottom);
}

const UNIFORMS = ['uRes', 'uCenter', 'uRadius', 'uTime', 'uInner', 'uOuter', 'uGrain', 'uWarp', 'uSeed'] as const;
type Uniforms = Record<(typeof UNIFORMS)[number], WebGLUniformLocation | null>;

const VERTEX_SHADER = 'attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}';
const FRAGMENT_SHADER = [
  'precision highp float;',
  'uniform vec2 uRes;uniform vec2 uCenter;uniform float uRadius;uniform float uTime;',
  'uniform vec3 uInner;uniform vec3 uOuter;uniform float uGrain;uniform float uWarp;uniform float uSeed;',
  // 3D simplex noise (Ashima Arts / Stefan Gustavson, MIT)
  'vec3 m289(vec3 x){return x-floor(x*(1./289.))*289.;}',
  'vec4 m289(vec4 x){return x-floor(x*(1./289.))*289.;}',
  'vec4 perm(vec4 x){return m289(((x*34.)+1.)*x);}',
  'vec4 tis(vec4 r){return 1.79284291400159-.85373472095314*r;}',
  'float snoise(vec3 v){',
  ' const vec2 C=vec2(1./6.,1./3.);const vec4 D=vec4(0.,.5,1.,2.);',
  ' vec3 i=floor(v+dot(v,C.yyy));vec3 x0=v-i+dot(i,C.xxx);',
  ' vec3 g=step(x0.yzx,x0.xyz);vec3 l=1.-g;vec3 i1=min(g.xyz,l.zxy);vec3 i2=max(g.xyz,l.zxy);',
  ' vec3 x1=x0-i1+C.xxx;vec3 x2=x0-i2+C.yyy;vec3 x3=x0-D.yyy;',
  ' i=m289(i);',
  ' vec4 p=perm(perm(perm(i.z+vec4(0.,i1.z,i2.z,1.))+i.y+vec4(0.,i1.y,i2.y,1.))+i.x+vec4(0.,i1.x,i2.x,1.));',
  ' float n_=.142857142857;vec3 ns=n_*D.wyz-D.xzx;',
  ' vec4 j=p-49.*floor(p*ns.z*ns.z);vec4 x_=floor(j*ns.z);vec4 y_=floor(j-7.*x_);',
  ' vec4 x=x_*ns.x+ns.yyyy;vec4 y=y_*ns.x+ns.yyyy;vec4 h=1.-abs(x)-abs(y);',
  ' vec4 b0=vec4(x.xy,y.xy);vec4 b1=vec4(x.zw,y.zw);',
  ' vec4 s0=floor(b0)*2.+1.;vec4 s1=floor(b1)*2.+1.;vec4 sh=-step(h,vec4(0.));',
  ' vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;',
  ' vec3 p0=vec3(a0.xy,h.x);vec3 p1=vec3(a0.zw,h.y);vec3 p2=vec3(a1.xy,h.z);vec3 p3=vec3(a1.zw,h.w);',
  ' vec4 nm=tis(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));p0*=nm.x;p1*=nm.y;p2*=nm.z;p3*=nm.w;',
  ' vec4 m=max(.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.);m=m*m;',
  ' return 42.*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));}',
  'float hash(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233))+uSeed)*43758.5453);}',
  'void main(){',
  ' vec2 p=vec2(gl_FragCoord.x,uRes.y-gl_FragCoord.y);',
  ' vec2 q=(p-uCenter)/uRadius;',
  // noise field drifts slowly along a fixed direction (280deg), two octaves
  ' vec2 dir=vec2(0.1736,-0.9848);',
  ' vec2 np=p/uRadius*.9+dir*uTime*.35;',
  ' float n=snoise(vec3(np,uTime))+.5*snoise(vec3(np*2.+7.3,uTime*1.3));',
  ' float d=length(q)+n/1.5*uWarp;',
  ' float t=smoothstep(.1,1.05,d);',
  ' t=clamp(t+(hash(gl_FragCoord.xy)-.5)*uGrain*4.*t*(1.-t),0.,1.);',
  ' gl_FragColor=vec4(mix(uInner,uOuter,t),1.);',
  '}'
].join('\n');

// Compiles the shaders and sets up the full-screen triangle. Returns the uniform locations,
// or null if this WebGL can't run them.
function setupGL(gl: WebGLRenderingContext): Uniforms | null {
  function compile(type: number, src: string): WebGLShader | null {
    const s = gl.createShader(type);
    if (!s) return null;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null;
  }
  const v = compile(gl.VERTEX_SHADER, VERTEX_SHADER);
  const f = compile(gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
  if (!v || !f) return null;
  const prog = gl.createProgram();
  if (!prog) return null;
  gl.attachShader(prog, v);
  gl.attachShader(prog, f);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
  gl.useProgram(prog);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const a = gl.getAttribLocation(prog, 'a');
  gl.enableVertexAttribArray(a);
  gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);

  const loc = {} as Uniforms;
  UNIFORMS.forEach((n) => {
    loc[n] = gl.getUniformLocation(prog, n);
  });
  gl.uniform3fv(loc.uOuter, hexToRgb(GLOW.outer));
  gl.uniform1f(loc.uGrain, GLOW.grain);
  gl.uniform1f(loc.uWarp, GLOW.warp);
  return loc;
}

function initGlow(surface: HTMLElement, bg: HTMLElement): void {
  const canvas = bg.querySelector<HTMLCanvasElement>('.glow__canvas');
  let inView = true;
  let rafId = 0;
  let last = 0;
  let w = 1, h = 1, dpr = 1;

  // Current and target glow centre, in CSS px relative to the section.
  const pos: Point = { x: 0, y: 0 };
  const target: Point = { x: 0, y: 0 };
  let pointer: Point | null = null;   // last cursor position in viewport coordinates
  let wasInside = false;
  // Each glow only follows the cursor while it's over its own section, and stays put when the
  // cursor leaves. The footer's glow matches the hero's until the cursor first comes over the footer.
  let matchHero = surface.matches('.site-footer');
  if (surface.matches('.hero')) {
    heroGlowSpot = () => ({ x: target.x / w, y: target.y / h });
  }
  // The glow gets paler while the cursor is on text or a picture in front of it: in its own
  // section, or for the page-wide glow (About), in the page's content and the footer. How far it
  // has paled (0 = not at all, 1 = by GLOW.hoverPale, before easing), and where it's going.
  const paleAreas = surface.matches('.page-glow')
    ? Array.from(document.querySelectorAll('main, .site-footer'))
    : [surface];
  let pale = 0;
  let paleTo = 0;

  function updateTarget(): void {
    paleTo = pointer && onContent(pointer, paleAreas) ? 1 : 0;
    const r = surface.getBoundingClientRect();
    const inside = !!pointer && pointer.x >= r.left && pointer.x <= r.right && pointer.y >= r.top && pointer.y <= r.bottom;
    if (inside) matchHero = false;
    if (!pointer || matchHero) {
      // Starting position. Below a hero, the footer's glow starts where the hero's is.
      const rest = matchHero && heroGlowSpot ? heroGlowSpot() : { x: GLOW.x, y: GLOW.y };
      target.x = w * rest.x;
      target.y = h * rest.y;
      return;
    }
    if (!inside && !wasInside) {
      // The cursor is elsewhere on the page: the glow stays where it is (inside the section if it resized).
      target.x = Math.min(target.x, w);
      target.y = Math.min(target.y, h);
      return;
    }
    wasInside = inside;
    // Track the cursor, kept inside this section so the glow stays visible. On the way out,
    // this stops the glow at the edge the cursor left by.
    target.x = Math.min(Math.max(pointer.x - r.left, 0), w);
    target.y = Math.min(Math.max(pointer.y - r.top, 0), h);
  }

  function radiusPx(): number {
    // Scales with the section's shorter side, but never below half its longer side.
    return GLOW.radius * Math.max(Math.min(w, h), 0.5 * Math.max(w, h));
  }

  let gl: WebGLRenderingContext | null = null;
  let loc: Uniforms | null = null;
  if (canvas) {
    try {
      gl = (canvas.getContext('webgl', { antialias: false, alpha: false, preserveDrawingBuffer: false }) ||
            canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null;
    } catch { gl = null; }
  }
  if (gl) {
    loc = setupGL(gl);
    if (!loc) gl = null;
  }

  function resize(): void {
    const r = surface.getBoundingClientRect();
    const first = w === 1 && h === 1;
    w = Math.max(1, r.width);
    h = Math.max(1, r.height);
    updateTarget();
    if (first) { pos.x = target.x; pos.y = target.y; }
    if (gl && canvas) {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      gl.viewport(0, 0, canvas.width, canvas.height);
    }
    draw();
  }

  function draw(): void {
    const time = glowTime();
    const c = glowColorAt(time, GLOW.hoverPale * pale * pale * (3 - 2 * pale));   // eased in and out
    if (gl && loc && canvas) {
      gl.uniform3fv(loc.uInner, c);
      gl.uniform2f(loc.uRes, canvas.width, canvas.height);
      gl.uniform2f(loc.uCenter, pos.x * dpr, pos.y * dpr);
      gl.uniform1f(loc.uRadius, radiusPx() * dpr);
      gl.uniform1f(loc.uTime, time * GLOW.warpSpeed);
      gl.uniform1f(loc.uSeed, glowAnimate ? Math.random() * 100 : 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    } else {
      bg.style.setProperty('--glow-x', pos.x + 'px');
      bg.style.setProperty('--glow-y', pos.y + 'px');
      bg.style.setProperty('--glow-r', Math.round(radiusPx()) + 'px');
      bg.style.setProperty('--color-accent', 'rgb(' + c.map((v) => Math.round(v * 255)).join(',') + ')');
    }
  }

  function frame(now: number): void {
    rafId = 0;
    const dt = last ? Math.min((now - last) / 1000, 0.1) : 0;
    last = now;
    const k = 1 - Math.exp(-dt * GLOW.followSpeed);
    pos.x += (target.x - pos.x) * k;
    pos.y += (target.y - pos.y) * k;
    // At a steady pace, so turning back halfway takes as long as it took to get there
    const step = dt / GLOW.hoverPaleTime;
    pale = paleTo > pale ? Math.min(paleTo, pale + step) : Math.max(paleTo, pale - step);
    draw();
    schedule();
  }

  function schedule(): void {
    // Off screen, the glow moves straight to where it's going, so it's already there when it's
    // scrolled into view (the footer's starts where the hero's stopped, instead of gliding there).
    if (!inView) { pos.x = target.x; pos.y = target.y; pale = paleTo; }
    if (rafId || !inView || document.hidden) return;
    // Without animation, stop redrawing once the glow has caught up with the cursor (and paled).
    if (!glowAnimate && Math.abs(target.x - pos.x) < 0.5 && Math.abs(target.y - pos.y) < 0.5 && pale === paleTo) {
      last = 0;
      return;
    }
    rafId = requestAnimationFrame(frame);
  }

  function stop(): void {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
    last = 0;
  }

  window.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') return;
    pointer = { x: e.clientX, y: e.clientY };
    updateTarget();
    schedule();
  }, { passive: true });
  // Scrolling moves the section under a still cursor, so re-aim the glow.
  window.addEventListener('scroll', () => {
    if (pointer) { updateTarget(); schedule(); }
  }, { passive: true });

  // Only animate while the section is on screen and the tab is visible.
  if ('IntersectionObserver' in window) {
    new IntersectionObserver((entries) => {
      inView = entries[0]!.isIntersecting;
      if (inView) schedule(); else stop();
    }).observe(surface);
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop(); else schedule();
  });
  window.addEventListener('resize', resize);

  resize();
  if (gl && canvas) canvas.classList.add('is-ready');
  schedule();
}

export function initGlows(): void {
  glowAnimate = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  document.querySelectorAll<HTMLElement>('.glow').forEach((surface) => {
    const bg = surface.querySelector<HTMLElement>('.glow__bg');
    if (bg) initGlow(surface, bg);
  });
}
