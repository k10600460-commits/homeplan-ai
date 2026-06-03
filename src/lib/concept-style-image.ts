const PRIORITY: Array<{ key: string; keywords: string[] }> = [
  { key: "farmhouse",    keywords: ["farmhouse"] },
  { key: "craftsman",    keywords: ["craftsman", "bungalow"] },
  { key: "transitional", keywords: ["transitional"] },
  { key: "traditional",  keywords: ["european", "hill country", "tudor", "georgian", "santa barbara", "mediterranean", "colonial"] },
  { key: "contemporary", keywords: ["contemporary", "modern", "prairie"] },
];

/** Maps a free-text style string to the filename key used in /concept-styles/. */
export function styleToImageKey(style: string): string {
  const n = style.toLowerCase().trim();
  for (const { key, keywords } of PRIORITY) {
    if (keywords.some(kw => n.includes(kw))) return key;
  }
  return "default";
}

/**
 * Returns the image src for a plan's exterior concept photo.
 * Phase 2: if imageUrl is present on the plan it takes highest priority.
 */
export function conceptImageSrc(style: string, imageUrl?: string | null): string {
  if (imageUrl) return imageUrl;
  return `/concept-styles/${styleToImageKey(style)}.jpg`;
}
