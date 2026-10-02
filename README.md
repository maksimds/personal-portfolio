# Personal portfolio

A static portfolio site in plain HTML, CSS and a little JavaScript. There's no framework, no build step and no dependencies. The only external request is the fonts from Google Fonts: Syne for headings and the navbar (`--font-display` in `css/styles.css`) and Inter for everything else. The pages fall back to system fonts without them.

```
index.html                     Home: hero with cursor-following glow, "My works" list, footer
about.html                     About page
projects/project-template.html Reusable case-study page
css/styles.css                 All styles
js/main.js                     Mobile menu, scroll-back header, live clock, hero glow, fade-in
images/                        Grey placeholder images (swap for your own)
```

## Run it locally

Any static file server works. From the repo root:

```sh
python3 -m http.server 8080
# then open http://localhost:8080
```

You can also open `index.html` directly in a browser.

## Fill in your content

Every placeholder contains the word `YOUR`, so you can list them all with:

```sh
grep -rn "YOUR" --include=*.html .
```

- **Intro, bio, links:** replace the `[YOUR …]` text. The email link (`YOUR_EMAIL@example.com`) appears in the footer and mobile menu of every page, plus the About page and the case study, so use find-and-replace.
- **Resume and LinkedIn:** the CV icon and every "Resume" link open the resume on Google Docs, and the LinkedIn links go to `linkedin.com/in/denismaksimov1`. To change either, find-and-replace the URL across the three pages.
- **Clock:** in `index.html`, set `data-timezone` on the clock to your IANA time zone, such as `America/New_York`. If you leave it empty, the clock shows the visitor's own time.
- **Photos:** put your images in `images/` and change the `src` (and `width`/`height`, `alt`) on the matching `<img>`. The placeholder file names show the intended aspect ratio.

## Add a new project

1. Copy `projects/project-template.html` to a new file, for example `projects/my-project.html`.
2. Fill in its `[YOUR …]` fields: title, role, timeline, tagline, intro, sections and outcomes.
   - To add an image/text section, copy one `<div class="grid case-row">` block.
   - Add `case-row--flip` to a row to put the image on the right.
   - Point the "next project" link at the bottom to another case study.
3. In `index.html`, copy one `<li class="project">` block inside the "My works" list. Set its `href` to `projects/my-project.html`, then add its thumbnail, name and one-line description.
   - For a logo on a transparent background, add `project__thumb--logo` to the thumbnail's `<div>` so it grows and tilts when the pointer is on the logo (not when hovering the rest of the row). Its hit area is set by the `inset` on `.project__thumb--logo::after` in `css/styles.css`.
   - Side projects go in the same list, after the main projects. They use `class="project project--tall"` for a taller phone-screen thumbnail, and can link straight to an external site if the project has no case study.

## Glow (hero and footers)

The glow behind the home-page hero and behind the footer on every page is drawn with WebGL in `js/main.js`. Each one always follows the cursor, wherever it is on the page, staying inside its own section. Its colour drifts slowly and steadily through a palette, never pausing or jumping. All glows share one clock, so they always show the same colour.

To add the glow to another section, give the section the class `glow` and put this as its first child:

```html
<div class="glow__bg" aria-hidden="true"><canvas class="glow__canvas"></canvas></div>
```

The settings are in the `GLOW` object near the middle of `js/main.js`:

- `colors`: the centre colours, visited in order and then looping. There are 12, ordered around the colour wheel: dark blue, indigo, plum, berry, red, rust, orange, ochre, olive, forest green, teal and petrol blue. Keep neighbouring colours fairly close so each step stays gentle.
- `change`: the average number of seconds to drift from one colour to the next. A full loop takes about 12 × `change`. A bigger step between two colours takes proportionally longer, so the speed stays even.
- `outer`: the edge colour. It should match `--color-bg` in `css/styles.css`.
- `x` / `y`: where the glow sits before the cursor first moves, as fractions of its section's width and height.
- `radius`: how far the glow spreads.
- `followSpeed`: how quickly it catches up with the cursor.
- `grain`, `warp`, `warpSpeed`: the film grain, and how much and how fast the edge distorts.

For visitors who have turned on reduced motion, the glow still follows the cursor but keeps one colour and a still edge. On phones there's no cursor, so the glow stays in its resting spot and keeps changing colour. Browsers without WebGL get a plain CSS gradient that follows the cursor and changes colour, without the grain or the moving edge.

## Cursor

With a mouse, a 24px disc modelled on graffio.co's cursor trails the normal pointer. Each frame it covers 10% of the remaining distance, it stretches along its direction of travel, and it settles back into a circle when the pointer stops. Over the name, nav links, CV/LinkedIn icons, footer links and the About page links it grows to twice its size. The disc is blended with `difference`, so it shows as `#0B0B0B` on the page and `#E3DED3` on text, and it inverts the black hover boxes so their text stays readable. Over the hero and footer glow it stays `#0B0B0B` rather than inverting the glow's colours: a page-coloured copy of the disc sits just above the glow and below the content. Phones and tablets are unaffected, and for visitors who prefer reduced motion the disc follows without trailing or stretching. The code is the "Cursor" section of `js/main.js` (the list of links is `CURSOR_LINKS`), and the styles are `.cursor` and `.cursor-backing` in `css/styles.css`.

## Header

The header has no background only while the page is scrolled all the way to the top. On the home page, the hero's glow shows behind it there. As soon as the page scrolls, it fades to a very light grey (`#f5f5f5`), so text never shows through it. To change that colour, edit `--header-solid-bg` in `css/styles.css`, for example to `var(--color-bg)` to match the page background.

Hovering your name or a nav link fades in a black box behind white text over about 0.9 seconds, and adds a thin ↗ after the word that pushes the next items along. Moving away snaps it back instantly. Keyboard focus shows the same effect. The current page's nav link has a thin underline. The arrow's shape is the `--nav-arrow` image in `css/styles.css`. The footer's Email, Resume and LinkedIn links fade in the same black box over the same 0.9 seconds. Instead of adding an arrow, the → in front of each one turns to point up-right. In the "My works" list, each part of a row reacts only when the pointer is on that part: a thumbnail zooms slightly (a logo thumbnail instead grows and tilts 15° to the right when the pointer is on the logo itself), the title gets the same black box (without the ↗), and the → on the right nudges a little to the left before it glides back. The whole row is still one link, and keyboard focus on a row shows the title box and arrow nudge.

## Deploy

Upload the folder to any static host, such as GitHub Pages, Netlify or Cloudflare Pages. There's nothing to build.
