// The images in src/assets/images/, by file name. Pages and case studies refer to them that way
// (src: "kalorie-home.png"); <Img> (src/components/Img.astro) turns them into the smaller AVIF and
// WebP versions Astro makes at build time. Each file's width and height come from the file itself.
import type { ImageMetadata } from 'astro';

const files = import.meta.glob<{ default: ImageMetadata }>('../assets/images/*', { eager: true });

const byName = new Map(Object.entries(files).map(([path, mod]) => [path.split('/').pop()!, mod.default]));

export function getImageFile(name: string): ImageMetadata {
  const image = byName.get(name);
  if (!image) throw new Error(`No image named "${name}" in src/assets/images/`);
  return image;
}
