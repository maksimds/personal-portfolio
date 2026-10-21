/* ---------- Cursor-following glow (hero and footers) ----------
   A radial gradient (grey edge → coloured centre) drawn with WebGL on every
   element with class "glow" (markup: .glow > .glow__bg > canvas.glow__canvas,
   see src/components/Glow.astro):
   - the centre eases toward the cursor while it's over the glow's own section;
     when the cursor leaves, the hero's glow stays where it is and the footer's
     glides back to its resting position (on a page with a hero, the spot where
     the hero's glow is)
   - the centre colour drifts slowly and steadily through `colors`; all glows
     share one clock, so they always show the same colour
   - the edge is slowly warped by animated noise
   - animated grain dithers the blend, so it only shows in the fade
   - while the cursor is over text marked data-glow-wrap (the About page's
     sections), the glow clears from behind the text and wraps around it as a
     band of colour, so the text stays readable; it lets go when the cursor leaves
   If WebGL is unavailable, the CSS gradient on .glow__bg is used instead;
   it still follows the cursor and changes colour, and fades out over the text
   instead of wrapping around it. */
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
  wrapGap: 0.08,             // around text: the clear space between the text and the band of colour (relative to the radius)
  wrapSpread: 0.18,          // around text: how far the band fades out (relative to the radius)
  wrapSpeed: 3.5             // higher = wraps around the text, and lets go of it, faster
};

type Vec3 = [number, number, number];
interface Point { x: number; y: number; }
interface Box { x: number; y: number; w: number; h: number; }
const BOX_KEYS = ['x', 'y', 'w', 'h'] as const;

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
const glowOuterRgb = hexToRgb(GLOW.outer);
const glowOuter = rgbToOklab(glowOuterRgb);
const glowPalette: Vec3[] = GLOW.colors.map((hex) => {
  const c = rgbToOklab(hexToRgb(hex));
  return c.map((v, i) => v + (glowOuter[i]! - v) * GLOW.pale) as Vec3;
});
const glowSteps = glowPalette.map((c, i) => labDistance(c, glowPalette[(i + 1) % glowPalette.length]!));
const glowAvgStep = glowSteps.reduce((a, b) => a + b, 0) / glowSteps.length || 1;
const glowDurations = glowSteps.map((d) => Math.max(0.001, GLOW.change * d / glowAvgStep));
const glowCycle = glowDurations.reduce((a, d) => a + d, 0);

// Seconds on the shared clock (time since the page loaded; frozen with reduced motion).
function glowTime(): number {
  return glowAnimate ? performance.now() / 1000 : 0;
}

function glowColorAt(seconds: number): Vec3 {
  const palette = glowPalette;
  if (palette.length < 2) return oklabToRgb(palette[0]!);
  let time = seconds % glowCycle;
  let i = 0;
  for (; i < palette.length; i++) {
    if (time < glowDurations[i]! || i === palette.length - 1) break;
    time -= glowDurations[i]!;
  }
  const t = Math.min(1, time / glowDurations[i]!);
  const a = palette[i]!, b = palette[(i + 1) % palette.length]!;
  return oklabToRgb([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
}

// On a page with a hero glow, returns where it is (or where it stopped) as a fraction of the
// hero. The footer's glow rests at the same spot, so the two match. Set by initGlow.
let heroGlowSpot: (() => Point) | null = null;

// The box around an element's contents (without its own padding), in viewport coordinates.
function contentBox(el: Element): Box {
  const range = document.createRange();
  range.selectNodeContents(el);
  const r = range.getBoundingClientRect();
  return { x: r.left, y: r.top, w: r.width, h: r.height };
}

const UNIFORMS = ['uRes', 'uBox', 'uRadius', 'uSpread', 'uGap', 'uClear', 'uTime', 'uInner', 'uOuter', 'uGrain', 'uWarp', 'uSeed'] as const;
type Uniforms = Record<(typeof UNIFORMS)[number], WebGLUniformLocation | null>;

const VERTEX_SHADER = 'attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}';
const FRAGMENT_SHADER = [
  'precision highp float;',
  'uniform vec2 uRes;uniform vec4 uBox;uniform float uRadius;uniform float uSpread;uniform float uGap;uniform float uClear;uniform float uTime;',
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
  // distance from the box the glow is drawn around (centre uBox.xy, half-size uBox.zw; negative
  // inside it). Away from text the box is a point at the glow's centre: the usual round glow.
  ' vec2 e=abs(p-uBox.xy)-uBox.zw;',
  ' float s=length(max(e,0.))+min(max(e.x,e.y),0.);',
  // the colour is strongest uGap outside the box and fades out over uSpread; inside that, it
  // clears over 1/uClear (no clearing while the glow isn't wrapped around text)
  ' float d=s>uGap?(s-uGap)/uSpread:(uGap-s)*uClear;',
  // noise field drifts slowly along a fixed direction (280deg), two octaves
  ' vec2 dir=vec2(0.1736,-0.9848);',
  ' vec2 np=p/uRadius*.9+dir*uTime*.35;',
  ' float n=snoise(vec3(np,uTime))+.5*snoise(vec3(np*2.+7.3,uTime*1.3));',
  ' d+=n/1.5*uWarp;',
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
  // Each glow only follows the cursor while it's over its own section. When the cursor leaves,
  // the footer's glow glides back to its resting position; the others (the hero) stay put.
  const restWhenOutside = surface.matches('.site-footer');
  if (surface.matches('.hero')) {
    heroGlowSpot = () => ({ x: target.x / w, y: target.y / h });
  }

  // Text the glow wraps around while the cursor is over it: anywhere on the page for the
  // page-wide glow (About), inside its own section for the others.
  const wrapTargets = Array.from((surface.matches('.page-glow') ? document : surface)
    .querySelectorAll('[data-glow-wrap]'));
  // How far the glow is wrapped around text (0 = the usual round glow, 1 = a band around it), the
  // box around the text under the cursor, and the box it's wrapped around now. Boxes are in page
  // coordinates, so they scroll with the text.
  let wrap = 0;
  let wrapTo: Box | null = null;
  const box: Box = { x: 0, y: 0, w: 0, h: 0 };

  // The text under the cursor (or in the clear space around it), or null.
  function textUnder(p: Point): Box | null {
    const gap = GLOW.wrapGap * radiusPx();
    for (const el of wrapTargets) {
      const b = contentBox(el);
      if (p.x >= b.x - gap && p.x <= b.x + b.w + gap && p.y >= b.y - gap && p.y <= b.y + b.h + gap) {
        return { x: b.x + window.scrollX, y: b.y + window.scrollY, w: b.w, h: b.h };
      }
    }
    return null;
  }

  function updateTarget(): void {
    wrapTo = pointer ? textUnder(pointer) : null;
    const r = surface.getBoundingClientRect();
    const inside = !!pointer && pointer.x >= r.left && pointer.x <= r.right && pointer.y >= r.top && pointer.y <= r.bottom;
    if (!pointer || (restWhenOutside && !inside)) {
      // Resting position (the glow glides back here when the cursor leaves the footer). Below a
      // hero, the footer's glow rests where the hero's is.
      const rest = restWhenOutside && heroGlowSpot ? heroGlowSpot() : { x: GLOW.x, y: GLOW.y };
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

  // The box the glow is drawn around, as centre and half-size in CSS px relative to the section:
  // a point at the glow's centre, growing into the box around the text as the glow wraps (wr).
  function drawBox(wr: number): [number, number, number, number] {
    if (!wr) return [pos.x, pos.y, 0, 0];
    const r = surface.getBoundingClientRect();
    const cx = box.x + box.w / 2 - r.left - window.scrollX;
    const cy = box.y + box.h / 2 - r.top - window.scrollY;
    return [pos.x + (cx - pos.x) * wr, pos.y + (cy - pos.y) * wr, box.w / 2 * wr, box.h / 2 * wr];
  }

  function draw(): void {
    const time = glowTime();
    const c = glowColorAt(time);
    const radius = radiusPx();
    const wr = wrap * wrap * (3 - 2 * wrap);   // eased in and out
    if (gl && loc && canvas) {
      const [bx, by, hw, hh] = drawBox(wr);
      const gap = GLOW.wrapGap * radius;
      gl.uniform3fv(loc.uInner, c);
      gl.uniform2f(loc.uRes, canvas.width, canvas.height);
      gl.uniform4f(loc.uBox, bx * dpr, by * dpr, hw * dpr, hh * dpr);
      gl.uniform1f(loc.uRadius, radius * dpr);
      gl.uniform1f(loc.uSpread, (radius + (GLOW.wrapSpread - 1) * radius * wr) * dpr);
      gl.uniform1f(loc.uGap, gap * wr * dpr);
      // Inside the band the colour clears over a bit more than the gap, so once wrapped the text sits
      // on the plain background. Half-wrapped, it's only partly cleared, so a small box stays filled in.
      gl.uniform1f(loc.uClear, wr / (1.2 * gap * dpr));
      gl.uniform1f(loc.uTime, time * GLOW.warpSpeed);
      gl.uniform1f(loc.uSeed, glowAnimate ? Math.random() * 100 : 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    } else {
      // Without WebGL the glow fades out over the text instead of wrapping around it.
      const faded = c.map((v, i) => v + (glowOuterRgb[i]! - v) * wr);
      bg.style.setProperty('--glow-x', pos.x + 'px');
      bg.style.setProperty('--glow-y', pos.y + 'px');
      bg.style.setProperty('--glow-r', Math.round(radius) + 'px');
      bg.style.setProperty('--color-accent', 'rgb(' + faded.map((v) => Math.round(v * 255)).join(',') + ')');
    }
  }

  // Wraps around the text under the cursor, or lets go of it. Moving straight from one text to
  // the next, the band glides over to it instead of letting go.
  function stepWrap(dt: number): void {
    const k = 1 - Math.exp(-dt * GLOW.wrapSpeed);
    if (wrapTo) {
      if (!wrap) Object.assign(box, wrapTo);
      else for (const key of BOX_KEYS) box[key] += (wrapTo[key] - box[key]) * k;
    }
    const to = wrapTo ? 1 : 0;
    wrap += (to - wrap) * k;
    if (Math.abs(to - wrap) < 0.001) wrap = to;
  }

  // Whether the glow has caught up with the cursor, and finished wrapping around text or letting go.
  function caughtUp(): boolean {
    return Math.abs(target.x - pos.x) < 0.5 && Math.abs(target.y - pos.y) < 0.5 &&
      wrap === (wrapTo ? 1 : 0) && (!wrapTo || BOX_KEYS.every((key) => Math.abs(wrapTo![key] - box[key]) < 0.5));
  }

  function frame(now: number): void {
    rafId = 0;
    const dt = last ? Math.min((now - last) / 1000, 0.1) : 0;
    last = now;
    const k = 1 - Math.exp(-dt * GLOW.followSpeed);
    pos.x += (target.x - pos.x) * k;
    pos.y += (target.y - pos.y) * k;
    stepWrap(dt);
    draw();
    schedule();
  }

  function schedule(): void {
    // Off screen, the glow moves straight to where it's going, so it's already there when it's
    // scrolled into view (the footer's starts where the hero's stopped, instead of gliding there).
    if (!inView) {
      pos.x = target.x; pos.y = target.y;
      wrap = wrapTo ? 1 : 0;
      if (wrapTo) Object.assign(box, wrapTo);
    }
    if (rafId || !inView || document.hidden) return;
    // Without animation, stop redrawing once the glow has caught up with the cursor.
    if (!glowAnimate && caughtUp()) {
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
    // A band around text moves with it. Without animation nothing else may redraw it.
    if (wrap && !rafId) draw();
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
