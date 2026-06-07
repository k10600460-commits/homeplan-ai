const PRIORITY: Array<{ key: string; keywords: string[] }> = [
  { key: "farmhouse",    keywords: ["farmhouse"] },
  { key: "craftsman",    keywords: ["craftsman", "bungalow"] },
  { key: "transitional", keywords: ["transitional"] },
  { key: "contemporary", keywords: ["contemporary", "modern", "prairie"] },
  { key: "ranch",        keywords: ["ranch"] },
  { key: "colonial",     keywords: ["colonial"] },
  { key: "traditional",  keywords: ["european", "hill country", "tudor", "georgian", "santa barbara", "mediterranean"] },
];

/** Maps a free-text style string to the filename key used for real storage photos. */
export function styleToImageKey(style: string): string {
  const n = style.toLowerCase().trim();
  for (const { key, keywords } of PRIORITY) {
    if (keywords.some(kw => n.includes(kw))) return key;
  }
  return "default";
}

const STYLE_IMG_BASE = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/plan-images/demo`;

const STYLE_IMAGE_URL: Record<string, string> = {
  farmhouse:    `${STYLE_IMG_BASE}/modern_farmhouse.png`,
  craftsman:    `${STYLE_IMG_BASE}/craftsman.png`,
  transitional: `${STYLE_IMG_BASE}/transitional.png`,
  contemporary: `${STYLE_IMG_BASE}/contemporary.png`,
  ranch:        `${STYLE_IMG_BASE}/ranch.png`,
  colonial:     `${STYLE_IMG_BASE}/colonial.png`,
  traditional:  `${STYLE_IMG_BASE}/colonial.png`,   // closest real photo for european/tudor/etc
  default:      `${STYLE_IMG_BASE}/transitional.png`, // neutral fallback
};

export function styleImageUrl(style: string): string {
  return STYLE_IMAGE_URL[styleToImageKey(style)] ?? STYLE_IMAGE_URL.default;
}

/**
 * Returns the image src for a plan's exterior concept photo.
 * - If the buyer switched style away from the base, always show that style's real photo.
 * - Otherwise, prefer the plan's own imageUrl (concept-specific hero).
 * - Fallback to the style's real photo (replaces old placeholder).
 */
export function conceptImageSrc(
  style: string,
  imageUrl?: string | null,
  opts?: { baseStyle?: string },
): string {
  const switched = opts?.baseStyle != null && style !== opts.baseStyle;
  if (switched) return styleImageUrl(style);
  if (imageUrl) return imageUrl;
  return styleImageUrl(style);
}
