/* ==========================================================================
   Google Analytics
   Counts visits on the live site only (dmaksimoff.com), so your own previews
   and the automatic checks never show up in the reports.
   Paste your Measurement ID (G-…) below. While it's empty, nothing is sent.
   ========================================================================== */
(function () {
  'use strict';

  var MEASUREMENT_ID = '';
  var SITE = 'dmaksimoff.com';

  var host = location.hostname;
  if (!MEASUREMENT_ID || (host !== SITE && host !== 'www.' + SITE)) return;

  // Google's standard tag (gtag.js). Loading it from here keeps the ID in one place.
  window.dataLayer = window.dataLayer || [];
  window.gtag = function () { window.dataLayer.push(arguments); };
  window.gtag('js', new Date());
  window.gtag('config', MEASUREMENT_ID);

  var script = document.createElement('script');
  script.async = true;
  script.src = 'https://www.googletagmanager.com/gtag/js?id=' + MEASUREMENT_ID;
  document.head.appendChild(script);
})();
