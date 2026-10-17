/* ---------- Live clock ----------
   <span data-clock data-timezone="America/New_York"></span>
   Leave data-timezone empty to show the visitor's own local time. */
export function initClock(): void {
  const clocks = document.querySelectorAll<HTMLElement>('[data-clock]');

  function tick(): void {
    const now = new Date();
    clocks.forEach((el) => {
      const opts: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit', second: '2-digit' };
      const tz = el.getAttribute('data-timezone');
      if (tz) opts.timeZone = tz;
      try {
        el.textContent = now.toLocaleTimeString('en-US', opts);
      } catch {
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
}
