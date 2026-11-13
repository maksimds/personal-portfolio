/* ---------- Connectors ----------
   Draws each connector (src/components/board/Connector.astro) from the boxes of the two objects
   it joins: out of the middle of one object's side, into the middle of the other's, turning at
   right angles with rounded corners (or in one curve), with an arrowhead at the end and the label
   on the middle of the line. Everything is measured in the units of the element the connector is
   positioned in, so it stays right while the board is zoomed. Drawn again whenever the window or
   either object changes size, and once the objects have finished dropping in. */

type Side = 'top' | 'right' | 'bottom' | 'left';
interface Point { x: number; y: number; }
interface Box { left: number; top: number; right: number; bottom: number; }

const GAP = 8;         // between an object's edge and the line's end
const CORNER = 12;     // how round the line's corners are
const OUT: Record<Side, Point> = {
  top: { x: 0, y: -1 },
  right: { x: 1, y: 0 },
  bottom: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
};
const OPPOSITE: Record<Side, Side> = { top: 'bottom', right: 'left', bottom: 'top', left: 'right' };

const n = (value: number): string => value.toFixed(1);
const isSide = (value: string | undefined): value is Side => !!value && value in OUT;

// An element's box in the coordinates of `parent` (as if the board weren't zoomed)
function boxIn(el: Element, parent: HTMLElement): Box {
  const box = el.getBoundingClientRect();
  const base = parent.getBoundingClientRect();
  const scale = parent.offsetWidth ? base.width / parent.offsetWidth : 1;
  const x = base.left + parent.clientLeft * scale;
  const y = base.top + parent.clientTop * scale;
  return { left: (box.left - x) / scale, top: (box.top - y) / scale, right: (box.right - x) / scale, bottom: (box.bottom - y) / scale };
}

// The middle of one side of a box, a little way out from it
function anchor(box: Box, side: Side): Point {
  const cx = (box.left + box.right) / 2;
  const cy = (box.top + box.bottom) / 2;
  const edge = { top: { x: cx, y: box.top }, right: { x: box.right, y: cy }, bottom: { x: cx, y: box.bottom }, left: { x: box.left, y: cy } }[side];
  return { x: edge.x + OUT[side].x * GAP, y: edge.y + OUT[side].y * GAP };
}

// Which side of `a` faces `b`: across whichever gap between them is wider
function facing(a: Box, b: Box): Side {
  const dx = Math.max(b.left - a.right, a.left - b.right);
  const dy = Math.max(b.top - a.bottom, a.top - b.bottom);
  if (dx > dy) return b.left >= a.right ? 'right' : 'left';
  return b.top >= a.bottom ? 'bottom' : 'top';
}

// The corners of a right-angled route from `start` (leaving by side `a`) to `end` (arriving at side `b`)
function elbow(start: Point, a: Side, end: Point, b: Side): Point[] {
  const upright = (side: Side) => side === 'top' || side === 'bottom';
  if (upright(a) && upright(b)) {
    const y = (start.y + end.y) / 2;
    return [start, { x: start.x, y }, { x: end.x, y }, end];
  }
  if (!upright(a) && !upright(b)) {
    const x = (start.x + end.x) / 2;
    return [start, { x, y: start.y }, { x, y: end.y }, end];
  }
  return upright(a) ? [start, { x: start.x, y: end.y }, end] : [start, { x: end.x, y: start.y }, end];
}

// A path through the points, each corner rounded off
function rounded(points: Point[]): string {
  let d = `M${n(points[0]!.x)} ${n(points[0]!.y)}`;
  for (let i = 1; i < points.length - 1; i++) {
    const before = points[i - 1]!;
    const corner = points[i]!;
    const after = points[i + 1]!;
    const lenIn = Math.hypot(corner.x - before.x, corner.y - before.y);
    const lenOut = Math.hypot(after.x - corner.x, after.y - corner.y);
    const r = Math.min(CORNER, lenIn / 2, lenOut / 2);
    if (r < 1) { d += ` L${n(corner.x)} ${n(corner.y)}`; continue; }
    const p1 = { x: corner.x - ((corner.x - before.x) / lenIn) * r, y: corner.y - ((corner.y - before.y) / lenIn) * r };
    const p2 = { x: corner.x + ((after.x - corner.x) / lenOut) * r, y: corner.y + ((after.y - corner.y) / lenOut) * r };
    d += ` L${n(p1.x)} ${n(p1.y)} Q${n(corner.x)} ${n(corner.y)} ${n(p2.x)} ${n(p2.y)}`;
  }
  const last = points[points.length - 1]!;
  return `${d} L${n(last.x)} ${n(last.y)}`;
}

function draw(connector: HTMLElement): void {
  const parent = connector.offsetParent as HTMLElement | null;
  const from = document.getElementById(connector.dataset.from ?? '');
  const to = document.getElementById(connector.dataset.to ?? '');
  const line = connector.querySelector<SVGPathElement>('.connector__line');
  const head = connector.querySelector<SVGPathElement>('.connector__head');
  // Not drawn when it isn't shown (phones), or when either object is missing or hidden
  if (!parent || !from || !to || !line || !head || !from.getClientRects().length || !to.getClientRects().length) {
    connector.classList.remove('is-ready');
    return;
  }

  const a = boxIn(from, parent);
  const b = boxIn(to, parent);
  const fromSide = isSide(connector.dataset.fromSide) ? connector.dataset.fromSide : facing(a, b);
  const toSide = isSide(connector.dataset.toSide) ? connector.dataset.toSide : OPPOSITE[fromSide];
  const start = anchor(a, fromSide);
  const tip = anchor(b, toSide);
  // The line arrives straight at the side, so the arrowhead points the opposite way to "out"
  const dir = { x: -OUT[toSide].x, y: -OUT[toSide].y };
  const size = connector.classList.contains('connector--thick') ? 14 : 10;
  // The line stops inside the arrowhead, so its round end doesn't show past the point
  const end = { x: tip.x - dir.x * (size - 2), y: tip.y - dir.y * (size - 2) };

  // Every point the line passes through or is pulled towards: the drawing fits inside their box
  let points: Point[];
  if (connector.hasAttribute('data-curved')) {
    const reach = Math.max(40, Math.hypot(tip.x - start.x, tip.y - start.y) * 0.4);
    const c1 = { x: start.x + OUT[fromSide].x * reach, y: start.y + OUT[fromSide].y * reach };
    const c2 = { x: end.x + OUT[toSide].x * reach, y: end.y + OUT[toSide].y * reach };
    line.setAttribute('d', `M${n(start.x)} ${n(start.y)} C${n(c1.x)} ${n(c1.y)} ${n(c2.x)} ${n(c2.y)} ${n(end.x)} ${n(end.y)}`);
    points = [start, c1, c2, tip];
  } else {
    points = elbow(start, fromSide, end, toSide);
    line.setAttribute('d', rounded(points));
    points = [...points, tip];
  }

  // The <svg> is sized to the drawing (plus room for the arrowhead and the line's width) and its
  // viewBox set to match, so the path's numbers stay the board's own. A drawing that only
  // overflowed a tiny <svg> could be skipped by the browser when that corner is off screen.
  const svg = connector.querySelector<SVGSVGElement>('.connector__svg');
  if (svg) {
    const pad = size + 4;
    const left = Math.min(...points.map((p) => p.x)) - pad;
    const top = Math.min(...points.map((p) => p.y)) - pad;
    const width = Math.max(...points.map((p) => p.x)) + pad - left;
    const height = Math.max(...points.map((p) => p.y)) + pad - top;
    svg.setAttribute('viewBox', `${n(left)} ${n(top)} ${n(width)} ${n(height)}`);
    svg.style.cssText = `left:${n(left)}px;top:${n(top)}px;width:${n(width)}px;height:${n(height)}px`;
  }

  const back = { x: tip.x - dir.x * size, y: tip.y - dir.y * size };
  const half = size * 0.5;
  head.setAttribute('d', `M${n(tip.x)} ${n(tip.y)} L${n(back.x - dir.y * half)} ${n(back.y + dir.x * half)} L${n(back.x + dir.y * half)} ${n(back.y - dir.x * half)}Z`);

  const label = connector.querySelector<HTMLElement>('.connector__label');
  if (label) {
    const middle = line.getPointAtLength(line.getTotalLength() / 2);
    label.style.left = n(middle.x) + 'px';
    label.style.top = n(middle.y) + 'px';
  }
  connector.classList.add('is-ready');
}

let connectors: HTMLElement[] = [];
let frame = 0;

// Draws every connector again, once, on the next frame (so many changes at once cost one drawing)
export function updateConnectors(): void {
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(() => connectors.forEach(draw));
}

export function initConnectors(): void {
  connectors = Array.from(document.querySelectorAll<HTMLElement>('[data-connector]'));
  if (!connectors.length) return;

  updateConnectors();
  window.addEventListener('resize', updateConnectors);
  window.addEventListener('load', updateConnectors);          // images have their sizes by now
  document.fonts?.ready.then(updateConnectors);               // and the text its final width
  // An object that drops in is 8px off its place until it settles
  document.addEventListener('animationend', updateConnectors, true);
  if ('ResizeObserver' in window) {
    const sizes = new ResizeObserver(updateConnectors);
    connectors.forEach((connector) => {
      [connector.dataset.from, connector.dataset.to].forEach((id) => {
        const el = document.getElementById(id ?? '');
        if (el) sizes.observe(el);
      });
      if (connector.offsetParent) sizes.observe(connector.offsetParent);
    });
  }
}
