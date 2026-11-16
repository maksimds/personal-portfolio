/* ---------- The intro's scripted cursor ----------
   The "Denis" cursor in the home page's intro (src/components/home/Hero.astro) plays a scene on a
   loop, moving the way a hand moves a mouse. The scene has four parts:
   - hello: it goes up beside the clock, waves and opens its chat bubble
   - one for each sticky: it double-clicks the words marked data-cursor-edit, deletes them, types
     them back and clicks on the empty board beside the sticky to let go
   Hello always comes first. The stickies' parts are the same every time, but their order is
   shuffled whenever the scene starts (the page is opened, reloaded or come back to), and it
   never goes first to the sticky it went to first the time before, so no two visits in a row
   play alike. The browser remembers the last order (KEY).

   How it moves (glide, below): every move is a slight arc, not a straight line; it starts fast
   and slows into its target; a longer one takes longer, though not in proportion; a long move to
   something small runs a little past it and comes back. The small irregularities (which way an
   arc bows, the gaps between keys) come from numbers seeded by the order, so one order always
   plays the same way.

   The whole scene is worked out once, as a list of moments, and handed to the browser as
   animations that share one clock: the cursor's place, the arrow's dip on a click, and the chat
   bubble. The words on the stickies follow that same clock (sync, below), so pausing or seeking
   the animation takes the typing with it.

   A sticky's words never leave the page: the "deleted" ones are only see-through (still there
   for screen readers and search engines, and still taking up their room, so no line of the
   sticky ever moves), and its text is put back exactly as it was whenever the cursor isn't
   editing it. The cursor stops while it's off screen, and where it
   isn't drawn at all ("View as list", reduced motion) nothing runs and the text is left alone. */

interface Point { x: number; y: number }
// One sticky's words, and the two places the cursor needs there
interface Spot {
  words: string;
  end: Point;       // the end of the words, where the caret goes
  away: Point;      // on the empty board beside the sticky, for the click that lets go of it
}
interface Editing {
  select: number;                         // the first click: the sticky is selected
  edit: number;                           // the second: the caret is in its text
  done: number;                           // the click away
  typing: { t: number; shown: number }[]; // how many of the words' characters show from each moment on
}
interface Scene {
  duration: number;
  path: (Point & { t: number })[];        // where the cursor's corner is, moment by moment
  clicks: number[];
  chat: { open: number; close: number };
  edits: Editing[];                       // one for each spot, in the spots' order
}

const KEY = 'intro-cursor-order';             // localStorage: the order the parts last played in, as "0312"
// Where it says hello, measured from the intro's top-left corner (the intro is 912 × 472 on the
// canvas): between the clock and the portrait. The chat bubble hangs about 180px to the right of
// the cursor's place and 74px below it, and all of it stays inside the intro from here.
const HELLO: Point = { x: 532, y: 24 };
const TIP = 2.4;                              // the arrow's tip is this far in from the cursor's corner
const FRAME = 16;                             // one moment of a move, in ms

// The same "random" numbers every time for one seed (mulberry32)
function seeded(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let n = Math.imul(a ^ (a >>> 15), 1 | a);
    n = (n + Math.imul(n ^ (n >>> 7), 61 | n)) ^ n;
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
  };
}

// The order to play the parts in this time (part 0 is hello, part 1 the first sticky, and so on):
// hello, then the stickies shuffled, never starting with the sticky the last order started with
function pickOrder(parts: number): number[] {
  const order = Array.from({ length: parts }, (_, i) => i);
  for (let i = parts - 1; i > 1; i--) {
    const j = 1 + Math.floor(Math.random() * i);
    [order[i], order[j]] = [order[j], order[i]];
  }
  let last = '';
  try { last = localStorage.getItem(KEY) ?? ''; } catch { /* private window: any order will do */ }
  if (parts > 2 && String(order[1]) === last[1]) {
    const j = 2 + Math.floor(Math.random() * (parts - 2));
    [order[1], order[j]] = [order[j], order[1]];
  }
  try { localStorage.setItem(KEY, order.join('')); } catch { /* private window: it just isn't remembered */ }
  return order;
}

// How far along a move the hand is at each moment: smooth at both ends (the "minimum jerk" curve
// of a reaching hand), with time bent so it's at its fastest about a third of the way in
const reach = (u: number): number => {
  const w = Math.pow(u, 0.8);
  return w * w * w * (10 - 15 * w + 6 * w * w);
};

function writeScene(home: Point, spots: Spot[], order: number[]): Scene {
  const random = seeded(Number(order.join('')) + 11);
  const path = [{ t: 0, ...home }];
  const clicks: number[] = [];
  const edits: Editing[] = [];
  let chat = { open: 0, close: 0 };
  let t = 0;
  let at = home;

  const wait = (ms: number): void => {
    t += ms;
    path.push({ t, ...at });
  };
  // One move of the hand. bend is how far the arc bows out, as a share of the distance
  const glide = (to: Point, ms?: number, bend = (random() < 0.5 ? -1 : 1) * (0.05 + random() * 0.08)): void => {
    const dx = to.x - at.x;
    const dy = to.y - at.y;
    const far = Math.hypot(dx, dy);
    if (!far) return;
    const time = ms ?? 230 + 140 * Math.log2(far / 40 + 1);
    const steps = Math.max(2, Math.round(time / FRAME));
    for (let i = 1; i <= steps; i++) {
      const s = reach(i / steps);
      // Off the straight line: the arc, and a slight waver on top of it
      const off = far * (bend * 4 * s * (1 - s) + 0.01 * Math.sin(2 * Math.PI * s));
      path.push({
        t: t + (time * i) / steps,
        x: at.x + dx * s - (dy / far) * off,
        y: at.y + dy * s + (dx / far) * off,
      });
    }
    t += time;
    at = to;
  };
  // A long move to something small: a little too far and slightly to one side, then back
  const aim = (to: Point): void => {
    const dx = to.x - at.x;
    const dy = to.y - at.y;
    const far = Math.hypot(dx, dy);
    if (!far) return;
    const past = Math.min(12, far * 0.035);
    glide({ x: to.x + (dx / far) * past - (dy / far) * 3, y: to.y + (dy / far) * past + (dx / far) * 3 });
    wait(60);
    glide(to, 170, 0);
  };
  const click = (): void => {
    clicks.push(t);
    wait(180);
  };

  // Hello: up beside the clock, a quick wave from side to side, and the chat bubble
  const hello = (): void => {
    glide(HELLO);
    for (const [x, y, bend] of [[12, -3, 0.2], [-9, 2, -0.2], [10, -2, 0.2], [0, 0, -0.2]]) {
      glide({ x: HELLO.x + x, y: HELLO.y + y }, 120, bend);
    }
    chat = { open: t, close: t + 4600 };
    wait(5100);
  };

  // A sticky: to the end of its words, where a double click puts the caret; the mouse is moved
  // out of the way, under the text; the words go, a key at a time, and after a moment's thought
  // come back; then a click on the empty board beside the sticky lets go of it
  const rewrite = (spot: Spot, n: number): void => {
    const { words, end } = spot;
    aim({ x: end.x - TIP + 1, y: end.y - TIP });
    wait(260);
    const select = t;
    click();
    const edit = t;
    click();
    wait(200);
    glide({ x: end.x - 36, y: end.y + 58 });

    // Keys aren't evenly spaced: the first backspace is held a little, and a new word takes
    // longer to start
    const typing: Editing['typing'] = [];
    let key = edit + 1000;
    for (let shown = words.length - 1; shown >= 0; shown--) {
      typing.push({ t: key, shown });
      key += shown === words.length - 1 ? 190 : 78 + random() * 44;
    }
    key += 850;
    for (let shown = 1; shown <= words.length; shown++) {
      typing.push({ t: key, shown });
      key += words[shown - 1] === ' ' ? 180 + random() * 90 : 72 + random() * 96;
    }

    wait(Math.max(0, key + 550 - t));
    glide(spot.away);
    wait(220);
    const done = t;
    click();
    edits[n] = { select, edit, done, typing };
  };

  // Hello, then the stickies in this time's order, with a breath between them; then home, and a rest
  wait(1200);
  order.forEach((part, i) => {
    if (i) wait(500 + random() * 700);
    if (part === 0) hello();
    else rewrite(spots[part - 1], part - 1);
  });
  wait(400);
  glide(home);
  wait(2600);

  return { duration: t, path, clicks, chat, edits };
}

export function initIntroCursor(): void {
  const cursor = document.querySelector<HTMLElement>('[data-cursor-script="intro"]');
  if (!cursor || !cursor.animate || !('IntersectionObserver' in window)) return;
  // What it edits: the marked words of each sticky around it, in the page's order
  const edits = Array.from(cursor.parentElement?.querySelectorAll<HTMLElement>('[data-cursor-edit]') ?? [])
    .map((target) => ({ target, sticky: target.closest<HTMLElement>('.sticky'), words: target.textContent ?? '', drawn: '' }))
    .filter((e): e is typeof e & { sticky: HTMLElement } => !!e.sticky && !!e.words);
  if (!edits.length) return;
  const arrow = cursor.querySelector<SVGElement>('.cursor__arrow');
  const bubble = cursor.querySelector<HTMLElement>('.cursor__chat');

  let scene: Scene | null = null;
  let animations: Animation[] = [];
  let frame = 0;
  let visible = false;
  let attempt = 0;        // goes up on every start and stop, so a start that's still waiting knows it's been overtaken

  // Where each sticky's words end and where to click beside it, measured from the corner the
  // cursor is placed from, in the board's own units (so the same at any zoom). The click is in
  // the gap between the sticky and its neighbour: to its right, or to its left for the last one.
  function measure(): Spot[] {
    const board = cursor!.offsetParent as HTMLElement;
    const box = board.getBoundingClientRect();
    const zoom = box.width / board.offsetWidth || 1;
    const x = (px: number): number => (px - box.left) / zoom - board.clientLeft;
    const y = (px: number): number => (px - box.top) / zoom - board.clientTop;
    return edits.map(({ target, sticky, words }, i) => {
      const lines = target.getClientRects();
      const last = lines[lines.length - 1];
      const edge = sticky.getBoundingClientRect();
      const end = { x: x(last.right), y: y(last.top + last.height / 2) };
      const right = i < edits.length - 1 || edits.length === 1;
      return { words, end, away: { x: right ? x(edge.right) + 26 : x(edge.left) - 34, y: end.y + 8 + i * 9 } };
    });
  }

  // A sticky as it is at one moment of the scene: outlined once it's selected; while it's being
  // edited, the caret after the words that show, and the rest see-through, in its place
  function draw(e: (typeof edits)[number], selected: boolean, editing: boolean, shown: number): void {
    const state = `${selected} ${editing} ${shown}`;
    if (state === e.drawn) return;
    e.drawn = state;
    e.sticky.classList.toggle('is-edited', selected);
    if (!editing) {
      if (e.target.childElementCount) e.target.textContent = e.words;
      return;
    }
    // A new caret with every key, so it shows steadily while typing and only blinks in the pauses
    const caret = document.createElement('span');
    caret.className = 'type-caret';
    caret.setAttribute('aria-hidden', 'true');
    const rest = document.createElement('span');
    rest.className = 'type-rest';
    rest.textContent = e.words.slice(shown);
    e.target.replaceChildren(e.words.slice(0, shown), caret, ...(shown < e.words.length ? [rest] : []));
  }

  // Every frame: each sticky's words for the moment the animation is at
  function sync(): void {
    frame = requestAnimationFrame(sync);
    if (!scene || !animations.length) return;
    const t = (Number(animations[0].currentTime) || 0) % scene.duration;
    edits.forEach((e, i) => {
      const times = scene!.edits[i];
      let shown = e.words.length;
      for (const step of times.typing) {
        if (step.t > t) break;
        shown = step.shown;
      }
      draw(e, t >= times.select && t < times.done, t >= times.edit && t < times.done, shown);
    });
  }

  function play(): void {
    animations.forEach((a) => a.play());
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(sync);
  }
  function pause(): void {
    animations.forEach((a) => a.pause());
    cancelAnimationFrame(frame);
  }
  function stop(): void {
    attempt++;
    cancelAnimationFrame(frame);
    animations.forEach((a) => a.cancel());
    animations = [];
    scene = null;
    edits.forEach((e) => draw(e, false, false, e.words.length));
  }

  async function start(): Promise<void> {
    const mine = ++attempt;
    // The words must be where they'll stay before they're measured: the fonts loaded, and the
    // stickies done dropping in (2s at most, in case either never says so)
    await Promise.race([
      Promise.allSettled([document.fonts.ready, ...edits.flatMap((e) => e.sticky.getAnimations().map((a) => a.finished))]),
      new Promise((resolve) => setTimeout(resolve, 2000)),
    ]);
    if (mine !== attempt || !cursor!.getClientRects().length) return;

    const home = { x: cursor!.offsetLeft, y: cursor!.offsetTop };
    const s = writeScene(home, measure(), pickOrder(edits.length + 1));
    const at = (t: number): number => Math.min(1, Math.max(0, t / s.duration));
    const timing: KeyframeAnimationOptions = { duration: s.duration, iterations: Infinity };
    const dip = s.clicks.flatMap((t) => [
      { offset: at(t), scale: '1' },
      { offset: at(t + 70), scale: '0.8' },
      { offset: at(t + 150), scale: '1' },
    ]);
    const shut = { opacity: '0', scale: '0.6' };
    const open = { opacity: '1', scale: '1' };
    scene = s;
    animations = [
      cursor!.animate(s.path.map((p) => ({
        offset: at(p.t),
        translate: `${(p.x - home.x).toFixed(1)}px ${(p.y - home.y).toFixed(1)}px`,
      })), timing),
    ];
    if (arrow) animations.push(arrow.animate([{ offset: 0, scale: '1' }, ...dip, { offset: 1, scale: '1' }], timing));
    if (bubble) {
      animations.push(bubble.animate([
        { offset: 0, ...shut },
        { offset: at(s.chat.open), ...shut },
        { offset: at(s.chat.open + 260), ...open },
        { offset: at(s.chat.close), ...open },
        { offset: at(s.chat.close + 260), ...shut },
        { offset: 1, ...shut },
      ], timing));
    }
    if (visible) play();
    else pause();
  }

  new IntersectionObserver((entries) => {
    visible = entries[entries.length - 1].isIntersecting;
    if (!cursor.getClientRects().length) stop();      // not drawn: "View as list", or reduced motion
    else if (!animations.length) void start();
    else if (visible) play();
    else pause();
  }, { rootMargin: '160px' }).observe(cursor);

  // A page the browser brings back as it was left (the Back button) is a new visit too: the scene
  // starts over, in a new order
  window.addEventListener('pageshow', (e) => {
    if (!e.persisted || !animations.length) return;
    stop();
    void start();
  });
}
