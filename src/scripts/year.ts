/* ---------- Footer year ---------- */
export function initYear(): void {
  document.querySelectorAll('[data-year]').forEach((el) => {
    el.textContent = String(new Date().getFullYear());
  });
}
