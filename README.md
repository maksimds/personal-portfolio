# Personal portfolio

A static portfolio site in plain HTML, CSS and a little JavaScript. There's no framework, no build step and no dependencies. The only external request is the Inter font from Google Fonts, and the pages fall back to system fonts without it.

```
index.html                     Home: hero, Work list, Side Projects, footer
about.html                     About page
photography.html               Photo grid
projects/project-template.html Reusable case-study page
css/styles.css                 All styles
js/main.js                     Mobile menu, scroll-back header, live clock, fade-in
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

## Add a photo

In `photography.html`, copy one `<li>` inside `.photo-grid`. Add the class `photo--wide` to make a photo span both columns on desktop.

## Deploy

Upload the folder to any static host, such as GitHub Pages, Netlify or Cloudflare Pages. There's nothing to build.
