# Personal portfolio

A static portfolio site in plain HTML, CSS and a little JavaScript. There's no framework, no build step and no dependencies. The only external request is the Inter and Inter Tight fonts from Google Fonts, and the pages fall back to system fonts without them.

```
index.html                     Home: hero with cursor-following glow, Work list, Side Projects, footer
about.html                     About page
projects/project-template.html Reusable case-study page
css/styles.css                 All styles
js/main.js                     Mobile menu, scroll-back header, live clock, hero glow, fade-in
images/                        Grey placeholder images (swap for your own)
assets/                        Put resume.pdf here
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

- **Name, intro, bio, links:** replace the `[YOUR …]` text. The email (`YOUR_EMAIL@example.com`) and LinkedIn (`YOUR_LINKEDIN`) links appear in the footer and mobile menu of every page, plus the About page and the case study, so use find-and-replace.
- **Resume:** save your PDF as `assets/resume.pdf`. All the "Resume" links already point there.
- **Clock:** in `index.html`, set `data-timezone` on the clock to your IANA time zone, such as `America/New_York`. If you leave it empty, the clock shows the visitor's own time.
- **Photos:** put your images in `images/` and change the `src` (and `width`/`height`, `alt`) on the matching `<img>`. The placeholder file names show the intended aspect ratio.

## Add a new project

1. Copy `projects/project-template.html` to a new file, for example `projects/my-project.html`.
2. Fill in its `[YOUR …]` fields: title, role, timeline, tagline, intro, sections and outcomes.
   - To add an image/text section, copy one `<div class="grid case-row">` block.
   - Add `case-row--flip` to a row to put the image on the right.
   - Point the "next project" link at the bottom to another case study.
3. In `index.html`, copy one `<li class="project">` block inside the Work list. Set its `href` to `projects/my-project.html`, then add its thumbnail, name and one-line description.
   - Side projects work the same way. Use the Side Projects list, and link straight to an external site if the project has no case study.

## Hero glow

The blue glow behind the hero is drawn with WebGL in `js/main.js`. Its settings are in the `GLOW` object near the middle of that file:

- `inner` / `outer`: the centre colour and the edge colour. `outer` should match `--color-bg` in `css/styles.css`.
- `x` / `y`: where the glow rests when the cursor isn't over the hero, as fractions of the hero's width and height.
- `radius`: how far the glow spreads.
- `followSpeed`: how quickly it catches up with the cursor.
- `grain`, `warp`, `warpSpeed`: the film grain, and how much and how fast the edge distorts.

The round button at the bottom right of the hero pauses and resumes the animation. The glow also pauses when the hero is off-screen or the tab is hidden, and it starts paused for visitors who have turned on reduced motion. Browsers without WebGL get a plain CSS gradient that follows the cursor, without the grain or the moving edge.

## Deploy

Upload the folder to any static host, such as GitHub Pages, Netlify or Cloudflare Pages. There's nothing to build.
