/**
 * Vietnamese slug generator for semantic image filenames
 */
export function slugifyVietnamese(text: string, maxLength: number = 50): string {
  if (!text) return 'hinh-anh';

  let str = text.toLowerCase();

  // Normalize diacritics
  str = str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  // Specific Vietnamese letter replacements
  str = str
    .replace(/[đĐ]/g, 'd')
    .replace(/[áàảãạăắằẳẵặâấầẩẫậ]/g, 'a')
    .replace(/[éèẻẽẹêếềểễệ]/g, 'e')
    .replace(/[íìỉĩị]/g, 'i')
    .replace(/[óòỏõọôốồổỗộơớờởỡợ]/g, 'o')
    .replace(/[úùủũụưứừửữự]/g, 'u')
    .replace(/[ýỳỷỹỵ]/g, 'y');

  // Replace special characters with spaces
  str = str.replace(/[^a-z0-9\s-]/g, ' ');

  // Collapse whitespace and hyphens
  str = str.trim().replace(/[\s_]+/g, '-');
  str = str.replace(/-+/g, '-');

  // Limit length to avoid overly long filenames
  if (str.length > maxLength) {
    const parts = str.substring(0, maxLength).split('-');
    if (parts.length > 1) {
      parts.pop(); // avoid cutting word midway
      str = parts.join('-');
    } else {
      str = str.substring(0, maxLength - 5);
    }
  }

  return str.replace(/^-+|-+$/g, '') || 'anh-minh-hoa';
}

export function ensureWebpExtension(filename: string): string {
  const clean = filename.replace(/\.[a-zA-Z0-9]+$/, '');
  return `${clean}.webp`;
}

/**
 * Generate semantic, standard featured image filename ending with -feature.webp
 */
export function generateFeaturedFilename(articleSlug: string): string {
  let base = slugifyVietnamese(articleSlug, 65);
  base = base.replace(/-feature$/i, '');
  return `${base}-feature.webp`;
}

/**
 * Generate semantic inline filename reflecting the local section concept
 */
export function generateInlineFilename(
  articleSlug: string,
  sectionConcept: string,
  index: number
): string {
  const cleanSection = slugifyVietnamese(sectionConcept, 40);
  const cleanArticle = slugifyVietnamese(articleSlug, 30);

  // If section already conveys strong context
  if (cleanSection && cleanSection !== 'anh-minh-hoa' && cleanSection !== 'hinh-anh') {
    // Avoid double prefix if section already contains article slug part
    if (cleanSection.startsWith(cleanArticle)) {
      return `${cleanSection}.webp`;
    }
    return `${cleanArticle}-${cleanSection}.webp`;
  }

  return `${cleanArticle}-muc-${index + 1}.webp`;
}

/**
 * Automatically resolve collisions by appending -02, -03, etc.
 */
export function makeUniqueFilenames(filenames: string[]): string[] {
  const result: string[] = [];
  const seenCount = new Map<string, number>();

  for (const rawFilename of filenames) {
    // Ensure lowercase and webp extension
    const baseWithoutExt = rawFilename.replace(/\.webp$/i, '').replace(/\.[a-zA-Z0-9]+$/, '');
    const cleanBase = slugifyVietnamese(baseWithoutExt, 65);

    const currentCount = seenCount.get(cleanBase) || 0;
    if (currentCount === 0) {
      seenCount.set(cleanBase, 1);
      result.push(`${cleanBase}.webp`);
    } else {
      const nextCount = currentCount + 1;
      seenCount.set(cleanBase, nextCount);
      const suffix = nextCount < 10 ? `0${nextCount}` : `${nextCount}`;
      result.push(`${cleanBase}-${suffix}.webp`);
    }
  }

  return result;
}

/**
 * Validate whether a string is a valid HTTP(S) URL
 */
export function isValidHttpUrl(urlString?: string): boolean {
  if (!urlString || typeof urlString !== 'string') return false;
  const trimmed = urlString.trim();
  if (!/^https?:\/\//i.test(trimmed)) return false;
  try {
    const parsed = new URL(trimmed);
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && Boolean(parsed.hostname);
  } catch {
    return false;
  }
}

/**
 * Safely extract a canonical slug candidate from an article URL
 * Rules:
 * - Only HTTP(S)
 * - Take last non-empty segment of pathname
 * - Strip query/hash (handled by URL object)
 * - Safe decodeURIComponent
 * - Strip .html / .htm (case-insensitive)
 * - Malformed URL does not crash
 * - Root / index / generic URL without useful slug -> returns empty string (so it falls back to title)
 */
export function extractSlugFromUrl(urlStr?: string): string {
  if (!isValidHttpUrl(urlStr)) return '';

  try {
    const parsed = new URL(urlStr!.trim());
    let pathname = parsed.pathname;
    try {
      pathname = decodeURIComponent(pathname);
    } catch {
      // Safe fallback if decodeURIComponent fails
    }

    const segments = pathname.split('/').filter(Boolean);
    if (segments.length === 0) return '';

    let lastSegment = segments[segments.length - 1].trim();

    // Strip .html or .htm extension
    lastSegment = lastSegment.replace(/\.html?$/i, '').trim();

    // Ignore generic index/root names
    const genericNames = ['index', 'default', 'home', 'main', 'article', 'post', 'detail', 'news', 'tin-tuc', 'bai-viet'];
    if (genericNames.includes(lastSegment.toLowerCase())) {
      return '';
    }

    const slug = slugifyVietnamese(lastSegment, 65);
    if (slug === 'anh-minh-hoa' || slug === 'hinh-anh' || !slug) {
      return '';
    }

    return slug;
  } catch {
    return '';
  }
}

/**
 * Derive effective canonical article slug with priority:
 * 1. valid articleUrl
 * 2. effectiveArticleTitle
 * 3. parsed slug (from HTML)
 * 4. safe fallback
 */
export function deriveEffectiveArticleSlug(params: {
  articleUrl?: string;
  articleTitle?: string;
  parsedSlug?: string;
  fallback?: string;
}): string {
  // 1. articleUrl
  if (params.articleUrl) {
    const urlSlug = extractSlugFromUrl(params.articleUrl);
    if (urlSlug) {
      return urlSlug;
    }
  }

  // 2. effectiveArticleTitle
  if (params.articleTitle && params.articleTitle.trim()) {
    const titleSlug = slugifyVietnamese(params.articleTitle.trim(), 55);
    if (
      titleSlug &&
      titleSlug !== 'anh-minh-hoa' &&
      titleSlug !== 'hinh-anh' &&
      titleSlug !== 'bai-viet-kinh-te-thue'
    ) {
      return titleSlug;
    }
  }

  // 3. parsed slug
  if (params.parsedSlug && params.parsedSlug.trim()) {
    const cleanParsed = slugifyVietnamese(params.parsedSlug.trim(), 55);
    if (
      cleanParsed &&
      cleanParsed !== 'anh-minh-hoa' &&
      cleanParsed !== 'hinh-anh' &&
      cleanParsed !== 'bai-viet-kinh-te-thue'
    ) {
      return cleanParsed;
    }
  }

  // 4. fallback
  return params.fallback || 'bai-viet-kinh-te-thue';
}
