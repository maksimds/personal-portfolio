// The case studies: one .mdx file each in src/content/projects/. The file name is the address:
// kalorie.mdx becomes /projects/kalorie-case-study.html. Files starting with _ (the template) are skipped.
import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const projects = defineCollection({
  loader: glob({ base: './src/content/projects', pattern: ['*.mdx', '!_*'] }),
  schema: z.object({
    // Order on the home page and in the previous/next links
    order: z.number(),
    // false: not built yet, and shown on the home page as a "coming soon" row without a link.
    // `npm run dev` still shows it, so you can preview it while you write.
    published: z.boolean(),

    // The page's heading, also its name on the home page and in the previous/next links
    title: z.string(),
    // The browser tab title, before " — Denis Maksimov". Defaults to the heading.
    pageTitle: z.string().optional(),
    subtitle: z.string(),
    status: z.string(),
    // For search results (<meta name="description">)
    description: z.string(),

    // The home page row
    listDescription: z.string(),
    // Images are file names in src/assets/images/, e.g. "kalorie-app.png"
    thumb: z.string(),
    // How far the logo sits from the thumbnail's edges (--logo-inset) and its corner radius (--logo-radius)
    thumbInset: z.string().optional(),
    thumbRadius: z.string().optional(),

    // The big image under the heading. With logo: true it's a logo on the page background, sized
    // with logoWidth (--logo-width) and logoTrim (--logo-trim, the share of empty space around it).
    hero: z.object({
      src: z.string(),
      logo: z.boolean().default(false),
      logoWidth: z.string().optional(),
      logoTrim: z.number().optional(),
    }),

    // "Project details" under the intro. wide: true spans the full width (Team).
    facts: z.array(z.object({
      label: z.string(),
      value: z.string(),
      wide: z.boolean().default(false),
    })),
  }),
});

export const collections = { projects };
