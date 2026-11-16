/* ---------- The intro's scripted cursor ----------
   The "Denis" cursor in the home page's intro (src/components/home/Hero.astro) plays a scene,
   moving the way a hand moves a mouse. It has two parts:
   - the welcome, played once: it drags out a rectangle just above the intro (the sign marked
     data-cursor-welcome) from one corner to the other, types the sign's words into it ("Welcome
     to my portfolio") and clicks back down on the board, where it rests, to let go. The sign stays.
   - then round the stickies, over and over: on each one it double-clicks the words marked
     data-cursor-edit, deletes them, types them back and clicks on the empty board beside the
     sticky to let go
   The stickies are the same every round, but their order is shuffled whenever the scene starts
   (the page is opened, reloaded or come back to), and it never goes first to the sticky it went
   to first the time before, so no two visits in a row play alike. The browser remembers the last
   order (KEY).

   How it moves (glide, below): every move is a slight arc, not a straight line; it starts fast
   and slows into its target; a longer one takes longer, though not in proportion; a long move to
   something small runs a little past it and comes back. The small irregularities (which way an
   arc bows, the gaps between keys) come from numbers seeded by the order, so one order always
   plays the same way.

   The whole scene is worked out once, as a list of moments, and handed to the browser as
   animations that share one clock: the cursor's place, the arrow's dip on a click, and the
   sign's size as it's dragged out. The welcome's animations play once and then hold their last
   moment; the rounds' start where the welcome ends and repeat. The words on the sign and the
   stickies follow that same clock (sync, below), so pausing or seeking the animations takes the
   typing with them.

   A sticky's words never leave the page: the "deleted" ones are only see-through (still there
   for screen readers and search engines, and still taking up their room, so no line of the
   sticky ever moves), and its text is put back exactly as it was whenever the cursor isn't
   editing it. The sign is decoration, hidden from screen readers. The cursor stops while it's
   off screen, and where it isn't drawn at all ("View as list", reduced motion) nothing runs, the
   sign isn't there and the stickies' text is left alone. */

interface Point { x: number; y: number }
// One sticky's words, and the two places the cursor needs there
interface Spot {
  words: string;
  end: Point;       // the end of the words, where the caret goes
  away: Point;      // on the empty board beside the sticky, for the click that lets go of it
}
// The sign's words, and where its top-left corner is and how big it is once it's drawn
interface Sign extends Point {
  words: string;
  width: number;
  height: number;
}
type Typing = { t: number; shown: number }[];   // how many of the words' characters show from each moment on
interface Editing {
  select: number;                         // the first click: the sticky is selected
  edit: number;                           // the second: the caret is in its text
  done: number;                           // the click away
  typing: Typing;
}
interface Drawing {
  start: number;                          // the drag starts from the sign's top-left corner: the sign is there, selected
  size: { t: number; width: number; height: number }[];   // how far it's been dragged out, moment by moment
  edit: number;                           // the caret is in it
  done: number;                           // the click away
  typing: Typing;
}
interface Scene {
  first: number;                          // how long the welcome takes: the rounds start after it
  round: number;                          // how long one round of the stickies takes
  path: (Point & { t: number })[];        // where the cursor's corner is, moment by moment, through the welcome and one round
  presses: { down: number; up: number }[];   // the mouse button: a click, or held down for a drag
  drawing: Drawing | null;
  edits: Editing[];                       // one for each spot, in the spots' order, in the first round
}

const KEY = 'intro-cursor-order';             // localStorage: the order the parts last played in, as "0312"
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

// The order to play the parts in this time (part 0 is the welcome, part 1 the first sticky, and
// so on): the welcome, then the stickies shuffled, never starting with the sticky the last order
// started with
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

function writeScene(home: Point, sign: Sign | null, spots: Spot[], order: number[]): Scene {
  const random = seeded(Number(order.join('')) + 11);
  const path = [{ t: 0, ...home }];
  const presses: Scene['presses'] = [];
  const edits: Editing[] = [];
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
    presses.push({ down: t, up: t + 70 });
    wait(180);
  };
  // The words going in a key at a time from the moment given; returns when the last key is down.
  // Keys aren't evenly spaced: a new word takes longer to start
  const type = (words: string, from: number, typing: Typing): number => {
    let key = from;
    for (let shown = 1; shown <= words.length; shown++) {
      typing.push({ t: key, shown });
      if (shown < words.length) key += words[shown - 1] === ' ' ? 180 + random() * 90 : 72 + random() * 96;
    }
    return key;
  };

  // The welcome: the button down on the sign's top-left corner and the sign dragged out to its
  // bottom-right (it's there from the moment the mouse moves); let go, and the caret is in it; the mouse moved a little out of the way, the
  // words typed, and a click back down on the empty board where the cursor rests lets go of it
  const welcome = (box: Sign): Drawing => {
    glide({ x: box.x - TIP, y: box.y - TIP });
    wait(240);
    const press = t;
    wait(110);
    const start = t;
    // A gentle arc: the sign's corner follows the tip, and a deeper one would have the sign, wide
    // and low, get shorter again at one end of the drag
    const from = path.length;
    glide({ x: box.x + box.width - TIP, y: box.y + box.height - TIP }, undefined, (random() < 0.5 ? -1 : 1) * (0.035 + random() * 0.015));
    const size = path.slice(from).map((p) => ({
      t: p.t,
      width: Math.max(0, p.x + TIP - box.x),
      height: Math.max(0, p.y + TIP - box.y),
    }));
    wait(90);
    presses.push({ down: press, up: t });
    wait(280);
    const edit = t;
    glide({ x: box.x + box.width + 30, y: box.y + box.height - 8 });

    const typing: Typing = [];
    const last = type(box.words, edit + 900, typing);
    wait(Math.max(0, last + 650 - t));
    glide(home);
    wait(200);
    const done = t;
    click();
    return { start, size, edit, done, typing };
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

    // The first backspace is held a little
    const typing: Typing = [];
    let key = edit + 1000;
    for (let shown = words.length - 1; shown >= 0; shown--) {
      typing.push({ t: key, shown });
      key += shown === words.length - 1 ? 190 : 78 + random() * 44;
    }
    const last = type(words, key + 850, typing);

    wait(Math.max(0, last + 550 - t));
    glide(spot.away);
    wait(220);
    const done = t;
    click();
    edits[n] = { select, edit, done, typing };
  };

  // The welcome; then a round: the stickies in this time's order, with a breath before each, then
  // home, and a rest. The round starts and ends at home, so it can play over and over
  wait(1200);
  const drawing = sign && welcome(sign);
  const first = t;
  order.slice(1).forEach((part, i) => {
    wait(i ? 500 + random() * 700 : 1200);
    rewrite(spots[part - 1], part - 1);
  });
  wait(400);
  glide(home);
  wait(2600);

  return { first, round: t - first, path, presses, drawing, edits };
}

export function initIntroCursor(): void {
  const cursor = document.querySelector<HTMLElement>('[data-cursor-script="intro"]');
  if (!cursor || !cursor.animate || !('IntersectionObserver' in window)) return;
  // What it edits: the marked words of each sticky around it, in the page's order
  const edits = Array.from(cursor.parentElement?.querySelectorAll<HTMLElement>('[data-cursor-edit]') ?? [])
    .map((target) => ({ target, sticky: target.closest<HTMLElement>('.sticky'), words: target.textContent ?? '', drawn: '' }))
    .filter((e): e is typeof e & { sticky: HTMLElement } => !!e.sticky && !!e.words);
  // What it draws: the welcome sign, and the words it types into it
  const signEl = cursor.parentElement?.querySelector<HTMLElement>('[data-cursor-welcome]');
  const signText = signEl?.querySelector<HTMLElement>('.shape__text') ?? signEl;
  const sign = signEl && signText?.textContent ? { el: signEl, text: signText, words: signText.textContent, drawn: '' } : null;
  if (!edits.length && !sign) return;
  const arrow = cursor.querySelector<SVGElement>('.cursor__arrow');

  let scene: Scene | null = null;
  let animations: Animation[] = [];
  let clock: Animation | null = null;     // the rounds' cursor animation, whose time is the scene's
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

  // A new caret with every key, so it shows steadily while typing and only blinks in the pauses
  function caret(): HTMLElement {
    const el = document.createElement('span');
    el.className = 'type-caret';
    el.setAttribute('aria-hidden', 'true');
    return el;
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
    const rest = document.createElement('span');
    rest.className = 'type-rest';
    rest.textContent = e.words.slice(shown);
    e.target.replaceChildren(e.words.slice(0, shown), caret(), ...(shown < e.words.length ? [rest] : []));
  }

  // The sign at one moment: outlined while it's selected, with the words typed so far, and the
  // caret after them while it's being typed into. Its text grows from the middle, as it does in a
  // shape on a board.
  function drawSign(selected: boolean, editing: boolean, shown: number): void {
    if (!sign) return;
    const state = `${selected} ${editing} ${shown}`;
    if (state === sign.drawn) return;
    sign.drawn = state;
    sign.el.classList.toggle('is-edited', selected);
    sign.text.replaceChildren(sign.words.slice(0, shown), ...(editing ? [caret()] : []));
  }

  // How many characters show at a moment, going by the keys pressed before it
  function shownAt(typing: Typing, t: number, before: number): number {
    let shown = before;
    for (const step of typing) {
      if (step.t > t) break;
      shown = step.shown;
    }
    return shown;
  }

  // Every frame: the sign's words and each sticky's for the moment the animations are at. Until
  // the rounds start, the stickies are left as they are.
  function sync(): void {
    frame = requestAnimationFrame(sync);
    if (!scene || !clock) return;
    const s = scene;
    const now = Number(clock.currentTime) || 0;
    if (s.drawing) {
      const d = s.drawing;
      drawSign(now >= d.start && now < d.done, now >= d.edit && now < d.done, shownAt(d.typing, now, 0));
    }
    const t = now < s.first ? -1 : s.first + ((now - s.first) % s.round);
    edits.forEach((e, i) => {
      const times = s.edits[i];
      draw(e, t >= times.select && t < times.done, t >= times.edit && t < times.done, shownAt(times.typing, t, e.words.length));
    });
  }

  // The welcome's animations hold their last moment once they're over (that's how the sign stays
  // drawn), and play() would start one of those over: they're left as they are
  const over = (a: Animation): boolean => a.playState === 'finished';
  function play(): void {
    animations.forEach((a) => { if (!over(a)) a.play(); });
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(sync);
  }
  function pause(): void {
    animations.forEach((a) => { if (!over(a)) a.pause(); });
    cancelAnimationFrame(frame);
  }
  function stop(): void {
    attempt++;
    cancelAnimationFrame(frame);
    animations.forEach((a) => a.cancel());
    animations = [];
    clock = null;
    scene = null;
    edits.forEach((e) => draw(e, false, false, e.words.length));
    drawSign(false, false, sign?.words.length ?? 0);
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

    // The sign's place and size are its own, as the styles set them (the cursor's corner and the
    // sign are both placed from the intro's corner)
    const home = { x: cursor!.offsetLeft, y: cursor!.offsetTop };
    const box = sign && { words: sign.words, x: sign.el.offsetLeft, y: sign.el.offsetTop, width: sign.el.offsetWidth, height: sign.el.offsetHeight };
    const s = writeScene(home, box, measure(), pickOrder(edits.length + 1));

    // Two clocks' worth of offsets: the welcome's, from the start to s.first, and a round's, from
    // s.first to its end
    const clamp = (n: number): number => Math.min(1, Math.max(0, n));
    const inWelcome = (t: number): number => clamp(t / s.first);
    const inRound = (t: number): number => clamp((t - s.first) / s.round);
    const once: KeyframeAnimationOptions = { duration: s.first, fill: 'forwards' };
    const rounds: KeyframeAnimationOptions = { duration: s.round, delay: s.first, iterations: Infinity };
    const place = (p: Point): string => `${(p.x - home.x).toFixed(1)}px ${(p.y - home.y).toFixed(1)}px`;
    const dip = (presses: Scene['presses'], at: (t: number) => number): Keyframe[] => [
      { offset: 0, scale: '1' },
      ...presses.flatMap(({ down, up }) => [
        { offset: at(down), scale: '1' },
        { offset: at(down + 70), scale: '0.8' },
        ...(up > down + 70 ? [{ offset: at(up), scale: '0.8' }] : []),
        { offset: at(Math.max(up, down + 70) + 80), scale: '1' },
      ]),
      { offset: 1, scale: '1' },
    ];
    const inFirst = s.presses.filter((p) => p.down < s.first);
    const inRounds = s.presses.filter((p) => p.down >= s.first);

    // The welcome's first, so the rounds' (made later) take over once they start
    scene = s;
    animations = [
      cursor!.animate(s.path.filter((p) => p.t <= s.first).map((p) => ({ offset: inWelcome(p.t), translate: place(p) })), once),
    ];
    if (arrow) animations.push(arrow.animate(dip(inFirst, inWelcome), once));
    if (sign && box && s.drawing) {
      const d = s.drawing;
      const px = (n: number): string => `${n.toFixed(1)}px`;
      const unseen = { opacity: '0', width: '0px', height: '0px' };
      animations.push(sign.el.animate([
        { offset: 0, ...unseen },
        { offset: inWelcome(d.start), ...unseen },
        { offset: inWelcome(d.start), opacity: '1', width: '0px', height: '0px' },
        ...d.size.map((z) => ({ offset: inWelcome(z.t), opacity: '1', width: px(z.width), height: px(z.height) })),
        { offset: 1, opacity: '1', width: px(box.width), height: px(box.height) },
      ], once));
    }
    clock = cursor!.animate(s.path.filter((p) => p.t >= s.first).map((p) => ({ offset: inRound(p.t), translate: place(p) })), rounds);
    animations.push(clock);
    if (arrow) animations.push(arrow.animate(dip(inRounds, inRound), rounds));
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
  // starts over, welcome and all, in a new order
  window.addEventListener('pageshow', (e) => {
    if (!e.persisted || !animations.length) return;
    stop();
    void start();
  });
}
