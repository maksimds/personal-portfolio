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

  /* ---------- Footer year ---------- */
  document.querySelectorAll('[data-year]').forEach(function (el) {
    el.textContent = new Date().getFullYear();
  });
})();
