/* ==========================================================================
   Personal portfolio — scripts
   - mobile menu toggle
   - "scroll back" header (hides on scroll down, shows on scroll up)
   - live local clock in the hero
   - fade-in on scroll
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

  function setMenu(open) {
    body.classList.toggle('menu-open', open);
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

  /* ---------- Scroll-back header ---------- */
  if (header) {
    var lastY = window.scrollY;
    var ticking = false;

    function onScroll() {
      var y = window.scrollY;
      header.classList.toggle('is-scrolled', y > 10);
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

  /* ---------- Hero glow ----------
     A radial gradient (grey edge → blue centre) drawn with WebGL:
     - the centre eases toward the cursor while it is over the hero
     - the edge is slowly warped by animated noise
     - animated grain dithers the blend, so it only shows in the fade
     If WebGL is unavailable, the CSS gradient on .hero__bg is used instead,
     and its position still follows the cursor. */
  var GLOW = {
    inner: '#2f4881',          // centre colour
    outer: '#dedfda',          // edge colour (page background)
    x: 0.61, y: 0.60,          // resting position (fraction of the hero)
    radius: 0.8,               // relative to the hero's size
    followSpeed: 3.2,          // higher = catches up with the cursor faster
    grain: 0.10,               // grain strength (strongest mid-fade, none at either end)
    warp: 0.15,                // how much the edge distorts
    warpSpeed: 0.08            // how fast the distortion changes
  };

  var hero = document.querySelector('.hero');
  var heroBg = hero && hero.querySelector('.hero__bg');
  var canvas = hero && hero.querySelector('.hero__canvas');
  var toggleBtn = hero && hero.querySelector('.hero__toggle');

  if (hero && heroBg) initGlow();

  function hexToRgb(hex) {
    var n = parseInt(hex.slice(1), 16);
    return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
  }

  function initGlow() {
    var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var playing = !reduceMotion;
    var inView = true;
    var rafId = 0;
    var last = 0;
    var elapsed = 0;
    var w = 1, h = 1, dpr = 1;

    // Current and target glow centre, in CSS px relative to the hero.
    var pos = { x: 0, y: 0 };
    var target = { x: 0, y: 0 };
    var hasPointer = false;

    function resetTarget() {
      target.x = w * GLOW.x;
      target.y = h * GLOW.y;
    }

    function radiusPx() {
      // Scales with the hero's shorter side, but never below half its longer side.
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
      gl.uniform3fv(loc.uInner, hexToRgb(GLOW.inner));
      gl.uniform3fv(loc.uOuter, hexToRgb(GLOW.outer));
      gl.uniform1f(loc.uGrain, GLOW.grain);
      gl.uniform1f(loc.uWarp, GLOW.warp);
      return true;
    }

    function resize() {
      var r = hero.getBoundingClientRect();
      var first = w === 1 && h === 1;
      w = Math.max(1, r.width);
      h = Math.max(1, r.height);
      if (!hasPointer) resetTarget();
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
      if (gl) {
        gl.uniform2f(loc.uRes, canvas.width, canvas.height);
        gl.uniform2f(loc.uCenter, pos.x * dpr, pos.y * dpr);
        gl.uniform1f(loc.uRadius, radiusPx() * dpr);
        gl.uniform1f(loc.uTime, elapsed * GLOW.warpSpeed);
        gl.uniform1f(loc.uSeed, playing ? Math.random() * 100 : 0);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      } else {
        heroBg.style.setProperty('--glow-x', pos.x + 'px');
        heroBg.style.setProperty('--glow-y', pos.y + 'px');
        heroBg.style.setProperty('--glow-r', Math.round(radiusPx()) + 'px');
      }
    }

    function frame(now) {
      rafId = 0;
      var dt = last ? Math.min((now - last) / 1000, 0.1) : 0;
      last = now;
      elapsed += dt;
      var k = 1 - Math.exp(-dt * GLOW.followSpeed);
      pos.x += (target.x - pos.x) * k;
      pos.y += (target.y - pos.y) * k;
      draw();
      schedule();
    }

    function schedule() {
      if (!rafId && playing && inView && !document.hidden) rafId = requestAnimationFrame(frame);
    }

    function stop() {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = 0;
      last = 0;
    }

    hero.addEventListener('pointermove', function (e) {
      if (e.pointerType === 'touch') return;
      var r = hero.getBoundingClientRect();
      target.x = e.clientX - r.left;
      target.y = e.clientY - r.top;
      hasPointer = true;
    });
    hero.addEventListener('pointerleave', function () {
      hasPointer = false;
      resetTarget();
    });

    if (toggleBtn) {
      toggleBtn.hidden = false;
      var syncBtn = function () {
        toggleBtn.setAttribute('aria-pressed', String(!playing));
        toggleBtn.setAttribute('aria-label', playing ? 'Pause background animation' : 'Play background animation');
      };
      syncBtn();
      toggleBtn.addEventListener('click', function () {
        playing = !playing;
        syncBtn();
        if (playing) schedule(); else { stop(); draw(); }
      });
    }

    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        inView = entries[0].isIntersecting;
        if (inView) schedule(); else stop();
      }).observe(hero);
    }
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) stop(); else schedule();
    });
    window.addEventListener('resize', resize);

    resize();
    if (gl) canvas.classList.add('is-ready');
    schedule();
  }

  /* ---------- Footer year ---------- */
  document.querySelectorAll('[data-year]').forEach(function (el) {
    el.textContent = new Date().getFullYear();
  });
})();
