# Denis Maksimov
### Design Portfolio

This is my design portfolio website, live at [dmaksimoff.com](https://dmaksimoff.com). I'm Denis Maksimov, a product designer at dōTERRA based in Cincinnati, OH, and a senior at the University of Cincinnati majoring in IT/Software Development, graduating in May 2027. Born and raised in Moscow, I moved to the United States at 17, but my path in design started earlier: I opened Figma for the first time at 15 and landed my first freelance project at 16. Today I design mobile apps, websites, platforms and design systems, and I like owning the whole process, from ideation to the final prototypes, so that what users need and what the business needs end up in the same product. I'm looking for full-time design roles after graduation, so feel free to explore my case studies on the site or reach out on [LinkedIn](https://www.linkedin.com/in/denismaksimov1).

## Development

The site is built with [Astro](https://astro.build) and TypeScript. The pages share one layout and a set of components in `src/`, and each case study is a single MDX file in `src/content/projects/`. You'll need Node.js 22.12 or newer, and Google Chrome for the browser checks.

```sh
npm install     # once
npm run dev     # live preview at http://localhost:4321, updates as you edit
npm test        # builds the site into dist/ and runs every check
```

`npm test` checks that the HTML is valid, that every link and image exists, that the animations end up visible at four screen sizes (also with reduced motion and without JavaScript), and that no template placeholders are left on a published page. On a Mac it also compares every page with saved screenshots.

Every push to `Main` is published to [dmaksimoff.com](https://dmaksimoff.com) by GitHub Actions (`.github/workflows/deploy.yml`). The same checks run first, and the site only goes live if all of them pass. Pushes to other branches and pull requests get the checks without publishing.
