/* ==========================================================================
   Personal portfolio — scripts
   - mobile menu toggle
   - "scroll back" header (hides on scroll down, shows on scroll up)
   - live local clock in the hero
   - fade-in on scroll
   - cursor-following glow behind the hero and footers
   - current year in the footer
   ========================================================================== */
(function () {
  'use strict';

  var root = document.documentElement;
  var body = document.body;
  root.classList.add('js');

  /* ---------- Header height (used for page offset + mobile menu) ---------- */
  var header = document.querySelector('.site-header');

  function setHeaderHeight() {
    if (!header) return;
    root.style.setProperty('--header-height', header.getBoundingClientRect().height + 'px');
  }
  setHeaderHeight();
  window.addEventListener('resize', setHeaderHeight);

  /* ---------- Mobile menu ---------- */
  var toggle = document.querySelector('.menu-toggle');
  var menu = document.getElementById('mobile-menu');
  // The page under the full-screen menu, made inert while it's open so Tab stays in the menu
  var behindMenu = document.querySelectorAll('main, .site-footer');

  function setMenu(open) {
    body.classList.toggle('menu-open', open);
    behindMenu.forEach(function (el) { el.inert = open; });
    if (toggle) {
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    }
    if (menu) menu.setAttribute('aria-hidden', String(!open));
    if (open && header) header.classList.remove('is-hidden');
  }

  if (toggle && menu) {
    toggle.addEventListener('click', function () {
      setMenu(!body.classList.contains('menu-open'));
    });

    menu.addEventListener('click', function (e) {
      if (e.target.closest('a')) setMenu(false);
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && body.classList.contains('menu-open')) {
        setMenu(false);
        toggle.focus();
      }
    });

    // Close the overlay if the window is widened past the mobile breakpoint.
    window.matchMedia('(min-width: 768px)').addEventListener('change', function (mq) {
      if (mq.matches) setMenu(false);
    });
  }

  /* ---------- Scroll-back header ----------
     Hides on scroll down and returns on scroll up. It's see-through only when the
     page is scrolled all the way to the top; anywhere else it has a solid
     background, so the text underneath never shows through it. */
  if (header) {
    var lastY = window.scrollY;
    var ticking = false;

    function onScroll() {
      var y = window.scrollY;
      header.classList.toggle('is-solid', y > 1);
      if (!body.classList.contains('menu-open')) {
        var goingDown = y > lastY;
        header.classList.toggle('is-hidden', goingDown && y > header.offsetHeight);
      }
      lastY = y;
      ticking = false;
    }

    window.addEventListener('scroll', function () {
      if (!ticking) {
        window.requestAnimationFrame(onScroll);
        ticking = true;
      }
    }, { passive: true });
    window.addEventListener('resize', onScroll);
    onScroll();
  }

  /* ---------- Live clock ----------
     <span data-clock data-timezone="America/New_York"></span>
     Leave data-timezone empty to show the visitor's own local time. */
  var clocks = document.querySelectorAll('[data-clock]');

  function tick() {
    var now = new Date();
    clocks.forEach(function (el) {
      var opts = { hour: 'numeric', minute: '2-digit', second: '2-digit' };
      var tz = el.getAttribute('data-timezone');
      if (tz) opts.timeZone = tz;
      try {
        el.textContent = now.toLocaleTimeString('en-US', opts);
      } catch (err) {
        // Invalid time zone string: fall back to the visitor's local time.
        delete opts.timeZone;
        el.textContent = now.toLocaleTimeString('en-US', opts);
      }
    });
  }

  if (clocks.length) {
    tick();
    setInterval(tick, 1000);
  }

  /* ---------- Fade in on scroll ---------- */
  var revealEls = document.querySelectorAll('.reveal');

  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          io.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.05 });

    revealEls.forEach(function (el) { io.observe(el); });
  } else {
    revealEls.forEach(function (el) { el.classList.add('is-visible'); });
  }

  /* ---------- Cursor-following glow (hero and footers) ----------
     A radial gradient (grey edge → coloured centre) drawn with WebGL on every
     element with class "glow" (markup: .glow > .glow__bg > canvas.glow__canvas):
     - the centre always eases toward the cursor, wherever it is on the page,
       kept inside its own section so it stays visible
     - the centre colour drifts slowly and steadily through `colors`; all glows
       share one clock, so they always show the same colour
     - the edge is slowly warped by animated noise
     - animated grain dithers the blend, so it only shows in the fade
     If WebGL is unavailable, the CSS gradient on .glow__bg is used instead;
     it still follows the cursor and changes colour. */
  var GLOW = {
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
    warpSpeed: 0.08            // how fast the distortion changes
  };

  function hexToRgb(hex) {
    var n = parseInt(hex.slice(1), 16);
    return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
  }

  // Colours are blended in OKLab, a perceptual colour space, so a change looks
  // equally paced from start to finish instead of rushing through part of it.
  function toLinear(c) { return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
  function toSrgb(c) { return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055; }

  function rgbToOklab(rgb) {
    var r = toLinear(rgb[0]), g = toLinear(rgb[1]), b = toLinear(rgb[2]);
    var l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    var m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    var s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    return [
      0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
      1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
      0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s
    ];
  }

  function oklabToRgb(lab) {
    var l = Math.pow(lab[0] + 0.3963377774 * lab[1] + 0.2158037573 * lab[2], 3);
    var m = Math.pow(lab[0] - 0.1055613458 * lab[1] - 0.0638541728 * lab[2], 3);
    var s = Math.pow(lab[0] - 0.0894841775 * lab[1] - 1.2914855480 * lab[2], 3);
    return [
      4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
      -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
      -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
    ].map(function (c) { return Math.min(1, Math.max(0, toSrgb(c))); });
  }

  function labDistance(a, b) {
    return Math.sqrt(Math.pow(a[0] - b[0], 2) + Math.pow(a[1] - b[1], 2) + Math.pow(a[2] - b[2], 2));
  }

  // Shared colour timeline. The colour drifts continuously at one steady speed,
  // never pausing: a bigger step between two colours simply takes proportionally longer.
  // With reduced motion the colour, grain and edge stay still (the glow still follows the cursor).
  var glowAnimate = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var glowOuter = rgbToOklab(hexToRgb(GLOW.outer));
  var glowPalette = GLOW.colors.map(function (hex) {
    var c = rgbToOklab(hexToRgb(hex));
    return c.map(function (v, i) { return v + (glowOuter[i] - v) * GLOW.pale; });
  });
  var glowSteps = glowPalette.map(function (c, i) { return labDistance(c, glowPalette[(i + 1) % glowPalette.length]); });
  var glowAvgStep = glowSteps.reduce(function (a, b) { return a + b; }, 0) / glowSteps.length || 1;
  var glowDurations = glowSteps.map(function (d) { return Math.max(0.001, GLOW.change * d / glowAvgStep); });
  var glowCycle = glowDurations.reduce(function (a, d) { return a + d; }, 0);

  // Seconds on the shared clock (time since the page loaded; frozen with reduced motion).
  function glowTime() {
    return glowAnimate ? performance.now() / 1000 : 0;
  }

  function glowColorAt(seconds) {
    var palette = glowPalette;
    if (palette.length < 2) return oklabToRgb(palette[0]);
    var time = seconds % glowCycle;
    for (var i = 0; i < palette.length; i++) {
      if (time < glowDurations[i] || i === palette.length - 1) break;
      time -= glowDurations[i];
    }
    var t = Math.min(1, time / glowDurations[i]);
    var a = palette[i], b = palette[(i + 1) % palette.length];
    return oklabToRgb([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
  }

  function initGlow(surface) {
    var bg = surface.querySelector('.glow__bg');
    var canvas = bg.querySelector('.glow__canvas');
    var inView = true;
    var rafId = 0;
    var last = 0;
    var w = 1, h = 1, dpr = 1;

    // Current and target glow centre, in CSS px relative to the section.
    var pos = { x: 0, y: 0 };
    var target = { x: 0, y: 0 };
    var pointer = null;   // last cursor position in viewport coordinates
    // The footer's glow only follows the cursor while it's over the footer; elsewhere the glow
    // tracks the cursor anywhere on the page.
    var onlyWhenInside = surface.matches('.site-footer');

    function updateTarget() {
      var r = surface.getBoundingClientRect();
      var inside = !!pointer && pointer.x >= r.left && pointer.x <= r.right && pointer.y >= r.top && pointer.y <= r.bottom;
      if (!pointer || (onlyWhenInside && !inside)) {
        // Resting position (the glow glides back here when the cursor leaves the footer)
        target.x = w * GLOW.x;
        target.y = h * GLOW.y;
        return;
      }
      // Track the cursor, kept inside this section so the glow stays visible.
      target.x = Math.min(Math.max(pointer.x - r.left, 0), w);
      target.y = Math.min(Math.max(pointer.y - r.top, 0), h);
    }

    function radiusPx() {
      // Scales with the section's shorter side, but never below half its longer side.
      return GLOW.radius * Math.max(Math.min(w, h), 0.5 * Math.max(w, h));
    }

    var gl = null, prog = null, loc = {};
    if (canvas) {
      try {
        gl = canvas.getContext('webgl', { antialias: false, alpha: false, preserveDrawingBuffer: false }) ||
             canvas.getContext('experimental-webgl');
      } catch (err) { gl = null; }
    }
    if (gl && !setupGL()) gl = null;

    function setupGL() {
      var vs = 'attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}';
      var fs = [
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

      function compile(type, src) {
        var s = gl.createShader(type);
        gl.shaderSource(s, src);
        gl.compileShader(s);
        return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null;
      }
      var v = compile(gl.VERTEX_SHADER, vs);
      var f = compile(gl.FRAGMENT_SHADER, fs);
      if (!v || !f) return false;
      prog = gl.createProgram();
      gl.attachShader(prog, v);
      gl.attachShader(prog, f);
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return false;
      gl.useProgram(prog);

      var buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      var a = gl.getAttribLocation(prog, 'a');
      gl.enableVertexAttribArray(a);
      gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);

      ['uRes', 'uCenter', 'uRadius', 'uTime', 'uInner', 'uOuter', 'uGrain', 'uWarp', 'uSeed'].forEach(function (n) {
        loc[n] = gl.getUniformLocation(prog, n);
      });
      gl.uniform3fv(loc.uOuter, hexToRgb(GLOW.outer));
      gl.uniform1f(loc.uGrain, GLOW.grain);
      gl.uniform1f(loc.uWarp, GLOW.warp);
      return true;
    }

    function resize() {
      var r = surface.getBoundingClientRect();
      var first = w === 1 && h === 1;
      w = Math.max(1, r.width);
      h = Math.max(1, r.height);
      updateTarget();
      if (first) { pos.x = target.x; pos.y = target.y; }
      if (gl) {
        dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
        gl.viewport(0, 0, canvas.width, canvas.height);
      }
      draw();
    }

    function draw() {
      var time = glowTime();
      var c = glowColorAt(time);
      if (gl) {
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
        bg.style.setProperty('--color-accent', 'rgb(' + c.map(function (v) { return Math.round(v * 255); }).join(',') + ')');
      }
    }

    function frame(now) {
      rafId = 0;
      var dt = last ? Math.min((now - last) / 1000, 0.1) : 0;
      last = now;
      var k = 1 - Math.exp(-dt * GLOW.followSpeed);
      pos.x += (target.x - pos.x) * k;
      pos.y += (target.y - pos.y) * k;
      draw();
      schedule();
    }

    function schedule() {
      if (rafId || !inView || document.hidden) return;
      // Without animation, stop redrawing once the glow has caught up with the cursor.
      if (!glowAnimate && Math.abs(target.x - pos.x) < 0.5 && Math.abs(target.y - pos.y) < 0.5) {
        last = 0;
        return;
      }
      rafId = requestAnimationFrame(frame);
    }

    function stop() {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = 0;
      last = 0;
    }

    window.addEventListener('pointermove', function (e) {
      if (e.pointerType === 'touch') return;
      pointer = { x: e.clientX, y: e.clientY };
      updateTarget();
      schedule();
    }, { passive: true });
    // Scrolling moves the section under a still cursor, so re-aim the glow.
    window.addEventListener('scroll', function () {
      if (pointer) { updateTarget(); schedule(); }
    }, { passive: true });

    // Only animate while the section is on screen and the tab is visible.
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        inView = entries[0].isIntersecting;
        if (inView) schedule(); else stop();
      }).observe(surface);
    }
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) stop(); else schedule();
    });
    window.addEventListener('resize', resize);

    resize();
    if (gl) canvas.classList.add('is-ready');
    schedule();
  }

  document.querySelectorAll('.glow').forEach(function (surface) {
    if (surface.querySelector('.glow__bg')) initGlow(surface);
  });

  /* ---------- Cursor ----------
     Modelled on graffio.co's cursor. With a mouse, a 24px disc trails the normal pointer (each
     frame it covers 10% of the remaining distance), stretches along its direction of travel and
     settles back into a circle when the pointer stops. Over a link it grows to twice its size.
     The disc is blended with "difference" (see .cursor in css/styles.css), so it shows as the text
     colour on the page and as the page colour on text and the black hover boxes. Touch screens
     are unaffected.
     Commented out for now, along with the .cursor styles in css/styles.css. To bring it back,
     remove the comment markers around the code below and around those styles. */
  /*
  var CURSOR_LINKS = '.site-title, .site-nav a, .icon-link, .footer-link, .about__links .link, .back-link, .arrow-link, .case-nav__link';

  function initCursor() {
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    var still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    var disc = document.createElement('div');
    disc.className = 'cursor';
    disc.setAttribute('aria-hidden', 'true');
    body.appendChild(disc);

    var pointer = { x: 0, y: 0 };      // where the mouse is
    var pos = { x: 0, y: 0 };          // where the disc is drawn
    var prev = { x: 0, y: 0 };
    var size = 1;                      // 1 normally, 2 over a link
    var scaleX = 1, scaleY = 1, rotation = 0;
    var overLink = false;
    var frame = 0, last = 0, shown = false;

    function lerp(a, b, t) { return a + (b - a) * t; }
    // The per-frame factors are tuned for 60fps; this keeps the same feel at any refresh rate.
    function ease(perFrame, frames) { return 1 - Math.pow(1 - perFrame, frames); }

    // Glow sections: a page-coloured copy of the disc sits just above the glow and below the
    // content, so under the disc the glow is hidden and the disc shows the text colour there
    // instead of the glow's inverted colours. (It's positioned inside the section rather than
    // fixed, because a fixed one would be drawn over the section's text.)
    var backings = [].map.call(document.querySelectorAll('.glow__bg'), function (bg) {
      var el = document.createElement('div');
      el.className = 'cursor-backing';
      bg.appendChild(el);
      return el;
    });
    function setVisible(on) {
      disc.classList.toggle('is-visible', on);
      backings.forEach(function (el) { el.classList.toggle('is-visible', on); });
    }

    function render() {
      var t = ' rotate(' + rotation + 'deg) scale(' + scaleX + ',' + scaleY + ')';
      disc.style.transform = 'translate3d(' + pos.x + 'px,' + pos.y + 'px,0)' + t;
      backings.forEach(function (el) {
        var r = el.parentNode.getBoundingClientRect();
        el.style.transform = 'translate3d(' + (pos.x - r.left) + 'px,' + (pos.y - r.top) + 'px,0)' + t;
      });
    }

    function loop(now) {
      var frames = last ? Math.min((now - last) / (1000 / 60), 4) : 1;   // time since the last frame, in 60fps frames
      last = now;
      var targetSize = overLink ? 2 : 1;

      if (still) {
        pos.x = pointer.x; pos.y = pointer.y;
        size = scaleX = scaleY = targetSize;
        rotation = 0;
      } else {
        pos.x = lerp(pos.x, pointer.x, ease(0.1, frames));
        pos.y = lerp(pos.y, pointer.y, ease(0.1, frames));
        size = lerp(size, targetSize, ease(0.1, frames));
        // Stretch along the direction of travel, more the faster it moves
        var vx = (pos.x - prev.x) / frames, vy = (pos.y - prev.y) / frames;   // px per 60fps frame
        var speed = Math.sqrt(vx * vx + vy * vy) * 0.04;
        rotation = Math.atan2(vy, vx) * 180 / Math.PI;
        scaleX = size + Math.min(speed, 1);
        scaleY = size - Math.min(speed, 0.3);
      }
      prev.x = pos.x;
      prev.y = pos.y;

      var settled = Math.abs(size - targetSize) < 0.001 &&
        Math.abs(pos.x - pointer.x) < 0.05 && Math.abs(pos.y - pointer.y) < 0.05;
      if (settled) {
        pos.x = prev.x = pointer.x; pos.y = prev.y = pointer.y;
        size = scaleX = scaleY = targetSize;
        rotation = 0;
      }
      render();
      frame = settled ? 0 : requestAnimationFrame(loop);
      if (settled) last = 0;
    }
    function wake() { if (!frame) frame = requestAnimationFrame(loop); }

    document.addEventListener('pointermove', function (e) {
      if (e.pointerType === 'touch') { setVisible(false); return; }
      pointer.x = e.clientX;
      pointer.y = e.clientY;
      if (!shown) {
        pos.x = prev.x = pointer.x; pos.y = prev.y = pointer.y;   // start where the pointer is
        render();
        shown = true;
      }
      setVisible(true);
      overLink = !!(e.target.closest && e.target.closest(CURSOR_LINKS));
      wake();
    }, { passive: true });

    // Content can scroll under a still pointer, so check what it's over again.
    window.addEventListener('scroll', function () {
      if (!shown) return;
      var el = document.elementFromPoint(pointer.x, pointer.y);
      overLink = !!(el && el.closest(CURSOR_LINKS));
      wake();
    }, { passive: true });

    document.addEventListener('mouseout', function (e) {
      if (e.relatedTarget) return;      // the pointer left the window
      setVisible(false);
      overLink = false;
    });
  }
  initCursor();
  */

  /* ---------- Embedded prototypes ----------
     A link with data-embed="<id>" opens and closes the panel with that id (just below it). The
     iframe, whose URL is the panel's data-src, is only created the first time it opens, so the page
     doesn't load the embed until someone asks for it. A panel without data-src just reveals what's
     already in it (e.g. a "before" screenshot). Without JavaScript the link simply opens the
     prototype or image in a new tab. */
  document.querySelectorAll('[data-embed]').forEach(function (link) {
    var panel = document.getElementById(link.getAttribute('data-embed'));
    if (!panel) return;
    var label = link.querySelector('[data-embed-label]');
    var closedText = label ? label.textContent : '';
    var openText = link.getAttribute('data-embed-open-label') || closedText;
    link.setAttribute('role', 'button');
    link.setAttribute('aria-expanded', 'false');
    link.setAttribute('aria-controls', panel.id);
    link.addEventListener('click', function (e) {
      e.preventDefault();
      var open = link.getAttribute('aria-expanded') !== 'true';
      if (open && panel.hasAttribute('data-src') && !panel.querySelector('iframe')) {
        var frame = document.createElement('iframe');
        frame.src = panel.getAttribute('data-src');
        frame.title = panel.getAttribute('data-title') || '';
        frame.allowFullscreen = true;
        (panel.querySelector('.case-embed__frame') || panel).appendChild(frame);
      }
      link.setAttribute('aria-expanded', String(open));
      panel.classList.toggle('is-open', open);
      panel.inert = !open;
      if (label) label.textContent = open ? openText : closedText;
    });
    // As a role="button", the link should also toggle on Space (a plain link only reacts to Enter).
    link.addEventListener('keydown', function (e) {
      if (e.key === ' ') {
        e.preventDefault();
        link.click();
      }
    });
  });

  /* ---------- Back links ----------
     A link with data-back returns to the previous page when the visitor came from this site;
     otherwise it follows its href (the home page). */
  document.querySelectorAll('[data-back]').forEach(function (link) {
    link.addEventListener('click', function (e) {
      var fromHere = false;
      try { fromHere = !!document.referrer && new URL(document.referrer).origin === location.origin; } catch (err) {}
      if (fromHere && history.length > 1) {
        e.preventDefault();
        history.back();
      }
    });
  });

  /* ---------- Footer year ---------- */
  document.querySelectorAll('[data-year]').forEach(function (el) {
    el.textContent = new Date().getFullYear();
  });
})();
