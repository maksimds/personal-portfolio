// The site's pages, as the page switcher in the top-left pill and the phone menu list them:
// Home, About, then every case study that has a page.
import { getBuiltProjects, projectUrl } from './projects';

export interface PageLink { href: string; title: string; }

export async function getPages(): Promise<PageLink[]> {
  return [
    { href: '/', title: 'Home' },
    { href: '/about.html', title: 'About' },
    ...(await getBuiltProjects()).map((p) => ({ href: projectUrl(p), title: p.data.title })),
  ];
}

// Whether a link points at the page being built. `npm run dev` serves /about where the built
// site has /about.html, and the home page is built as /index.html, so neither counts.
export function isCurrentPage(href: string, pathname: string): boolean {
  const clean = (path: string) => path.replace(/\.html$/, '').replace(/\/index$/, '/');
  return clean(href) === clean(pathname);
}
