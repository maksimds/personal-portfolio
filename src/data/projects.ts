// The case studies from src/content/projects/, in order, and where each one lives.
import { getCollection, type CollectionEntry } from 'astro:content';

export type Project = CollectionEntry<'projects'>;

// kalorie.mdx -> /projects/kalorie-case-study.html
export function projectUrl(project: Project): string {
  return `/projects/${project.id}-case-study.html`;
}

// Every case study, published or not, in home page order
export async function getProjects(): Promise<Project[]> {
  return (await getCollection('projects')).sort((a, b) => a.data.order - b.data.order);
}

// The case studies that get a page: the published ones, plus the drafts while previewing with
// `npm run dev`
export async function getBuiltProjects(): Promise<Project[]> {
  return (await getProjects()).filter((p) => p.data.published || import.meta.env.DEV);
}

// The previous and next published case studies around this one. A draft previewed with
// `npm run dev` gets its neighbours as if it were already published.
export async function getNeighbours(project: Project) {
  const list = (await getProjects()).filter((p) => p.data.published || p.id === project.id);
  const i = list.findIndex((p) => p.id === project.id);
  const link = (p?: Project) => p && { href: projectUrl(p), title: p.data.title };
  return { prev: link(list[i - 1]), next: link(list[i + 1]) };
}
