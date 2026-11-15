/* ---------- The intro's scripted cursor ----------
   The "Denis" cursor in the home page's intro (src/components/home/Hero.astro) plays a short
   scene on a loop, moving the way a hand moves a mouse: it waves and says hello, wanders over the
   stickies, then double-clicks the words marked data-cursor-edit on one of them, deletes them,
   types them back, clicks away and goes home.

   How it moves (glide, below): every move is a slight arc, not a straight line; it starts fast
   and slows into its target; a longer one takes longer, though not in proportion; a long move to
   something small runs a little past it and comes back. Nothing here is random from one visit to
   the next (the "random" numbers come from a fixed seed), so the scene is always the same.

   The whole scene is worked out once, as a list of moments, and handed to the browser as
   animations that share one clock: the cursor's place, the arrow's dip on a click, and the chat
   bubble. The words on the sticky follow that same clock (sync, below), so pausing or seeking
   the animation takes the typing with it.

   The sticky's words never leave the page: the "deleted" ones are only hidden from sight (still
   there for screen readers and search engines), and the sticky's text is put back exactly as it
   was whenever the cursor isn't editing it. The cursor stops while it's off screen, and where it
   isn't drawn at all ("View as list", reduced motion) nothing runs and the text is left alone. */

interface Point { x: number; y: number }
interface Scene {
  duration: number;
  path: (Point & { t: number })[];        // where the cursor's corner is, moment by moment
  clicks: number[];
  chat: { open: number; close: number };
  select: number;                         // the first click: the sticky is selected
  edit: number;                           // the second: the caret is in its text
  done: number;                           // the click away
  typing: { t: number; shown: number }[]; // how many of the words' characters show from each moment on
}

// Places in the intro, measured from its top-left corner (the intro is 912 × 472 on the canvas).
// The name tag hangs 65px to the right of a place and 38px below it, and the chat bubble about
// 180px and 74px, so each is far enough from the edges for all of it to stay inside.
const HELLO: Point = { x: 532, y: 24 };       // between the clock and the portrait
const YELLOW: Point = { x: 196, y: 322 };     // the empty part of the first sticky
const GREEN: Point = { x: 470, y: 352 };      // and of the second
const BLANK: Point = { x: 604, y: 302 };      // between the second and third stickies
const TIP = 2.4;                              // the arrow's tip is this far in from the cursor's corner
const FRAME = 16;                             // one moment of a move, in ms

// The same "random" numbers every time (mulberry32)
function seeded(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let n = Math.imul(a ^ (a >>> 15), 1 | a);
    n = (n + Math.imul(n ^ (n >>> 7), 61 | n)) ^ n;
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
  };
}

// How far along a move the hand is at each moment: smooth at both ends (the "minimum jerk" curve
// of a reaching hand), with time bent so it's at its fastest about a third of the way in
const reach = (u: number): number => {
  const w = Math.pow(u, 0.8);
  return w * w * w * (10 - 15 * w + 6 * w * w);
};

function writeScene(home: Point, textEnd: Point, words: string): Scene {
  const random = seeded(11);
  const path = [{ t: 0, ...home }];
  const clicks: number[] = [];
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
  wait(1200);
  glide(HELLO);
  for (const [x, y, bend] of [[12, -3, 0.2], [-9, 2, -0.2], [10, -2, 0.2], [0, 0, -0.2]]) {
    glide({ x: HELLO.x + x, y: HELLO.y + y }, 120, bend);
  }
  const chat = { open: t, close: t + 4600 };
  wait(5100);

  // A look around the stickies
  aim(YELLOW);
  wait(1500);
  glide({ x: YELLOW.x + 24, y: YELLOW.y - 16 }, 420);
  wait(900);
  glide(GREEN);
  wait(1100);

  // To the end of the words: a double click puts the caret there, then the mouse is moved out of
  // the way, under the text
  aim({ x: textEnd.x - TIP + 1, y: textEnd.y - TIP });
  wait(260);
  const select = t;
  click();
  const edit = t;
  click();
  wait(200);
  glide({ x: textEnd.x - 36, y: textEnd.y + 58 });

  // The words go, a key at a time, and after a moment's thought come back. Keys aren't evenly
  // spaced: the first backspace is held a little, and a new word takes longer to start
  const typing: Scene['typing'] = [];
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

  // A click on the empty board lets go of the sticky; then home, and a rest
  wait(key + 550 - t);
  glide(BLANK);
  wait(220);
  const done = t;
  click();
  wait(320);
  glide(home);
  wait(2600);

  return { duration: t, path, clicks, chat, select, edit, done, typing };
}

export function initIntroCursor(): void {
  const cursor = document.querySelector<HTMLElement>('[data-cursor-script="intro"]');
  const target = document.querySelector<HTMLElement>('[data-cursor-edit]');
  const sticky = target?.closest<HTMLElement>('.sticky');
  if (!cursor || !target || !sticky || !cursor.animate || !('IntersectionObserver' in window)) return;
  const arrow = cursor.querySelector<SVGElement>('.cursor__arrow');
  const bubble = cursor.querySelector<HTMLElement>('.cursor__chat');
  const words = target.textContent ?? '';

  let scene: Scene | null = null;
  let animations: Animation[] = [];
  let frame = 0;
  let drawn = '';
  let visible = false;
  let attempt = 0;        // goes up on every start and stop, so a start that's still waiting knows it's been overtaken

  // The end of the words, measured from the corner the cursor is placed from, in the board's own
  // units (so the same at any zoom)
  function textEnd(): Point {
    const board = cursor!.offsetParent as HTMLElement;
    const box = board.getBoundingClientRect();
    const zoom = box.width / board.offsetWidth || 1;
    const lines = target!.getClientRects();
    const last = lines[lines.length - 1];
    return {
      x: (last.right - box.left) / zoom - board.clientLeft,
      y: (last.top + last.height / 2 - box.top) / zoom - board.clientTop,
    };
  }

  // The sticky as it is at one moment of the scene: outlined once it's selected; while it's being
  // edited, the caret after the words that show, and the rest hidden from sight only
  function draw(selected: boolean, editing: boolean, shown: number): void {
    const state = `${selected} ${editing} ${shown}`;
    if (state === drawn) return;
    drawn = state;
    sticky!.classList.toggle('is-edited', selected);
    if (!editing) {
      if (target!.childElementCount) target!.textContent = words;
      return;
    }
    // A new caret with every key, so it shows steadily while typing and only blinks in the pauses
    const caret = document.createElement('span');
    caret.className = 'type-caret';
    caret.setAttribute('aria-hidden', 'true');
    const hidden = document.createElement('span');
    hidden.className = 'visually-hidden';
    hidden.textContent = words.slice(shown);
    target!.replaceChildren(words.slice(0, shown), caret, ...(shown < words.length ? [hidden] : []));
  }

  // Every frame: the sticky's words for the moment the animation is at
  function sync(): void {
    frame = requestAnimationFrame(sync);
    if (!scene || !animations.length) return;
    const t = (Number(animations[0].currentTime) || 0) % scene.duration;
    let shown = words.length;
    for (const step of scene.typing) {
      if (step.t > t) break;
      shown = step.shown;
    }
    draw(t >= scene.select && t < scene.done, t >= scene.edit && t < scene.done, shown);
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
    draw(false, false, words.length);
  }

  async function start(): Promise<void> {
    const mine = ++attempt;
    // The words must be where they'll stay before they're measured: the fonts loaded, and the
    // sticky done dropping in (2s at most, in case either never says so)
    await Promise.race([
      Promise.allSettled([document.fonts.ready, ...sticky!.getAnimations().map((a) => a.finished)]),
      new Promise((resolve) => setTimeout(resolve, 2000)),
    ]);
    if (mine !== attempt || !cursor!.getClientRects().length) return;

    const home = { x: cursor!.offsetLeft, y: cursor!.offsetTop };
    const s = writeScene(home, textEnd(), words);
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
}
