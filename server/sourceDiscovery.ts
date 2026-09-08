import { parse, HTMLElement } from 'node-html-parser';
import {
  SourceImageMethod,
  MappingConfidence,
  SourceImageInfo,
  SourceRetrievalStatus,
  VisualAnalysisStatus,
} from '../src/types';

/**
 * ============================================================================
 * SSRF Protection & Safe Server-Side Fetching Utilities
 * ============================================================================
 */

// Hostnames and IP patterns that must never be fetched
const BLOCKED_HOSTNAMES = [
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '::1',
  'metadata.google.internal',
  '169.254.169.254',
  'metadata.internal',
];

/**
 * Checks whether an IP address or hostname belongs to private/internal network ranges
 */
export function isPrivateOrInternalHost(host: string): boolean {
  if (!host) return true;
  const cleanHost = host.toLowerCase().trim();

  // Explicitly blocked hostnames
  if (BLOCKED_HOSTNAMES.includes(cleanHost)) {
    return true;
  }

  // IPv6 loopback or link-local
  if (cleanHost.startsWith('fe80:') || cleanHost.startsWith('fc00:') || cleanHost === '::1') {
    return true;
  }

  // Check IPv4 ranges
  const ipv4Regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
  const match = cleanHost.match(ipv4Regex);
  if (match) {
    const octet1 = parseInt(match[1], 10);
    const octet2 = parseInt(match[2], 10);

    // 127.0.0.0/8 (Loopback)
    if (octet1 === 127) return true;
    // 10.0.0.0/8 (Private)
    if (octet1 === 10) return true;
    // 172.16.0.0/12 (Private: 172.16.x.x - 172.31.x.x)
    if (octet1 === 172 && octet2 >= 16 && octet2 <= 31) return true;
    // 192.168.0.0/16 (Private)
    if (octet1 === 192 && octet2 === 168) return true;
    // 169.254.0.0/16 (Link-local & Cloud metadata)
    if (octet1 === 169 && octet2 === 254) return true;
    // 0.0.0.0/8
    if (octet1 === 0) return true;
  }

  return false;
}

/**
 * Validates that a target URL is a safe external HTTP/HTTPS URL
 */
export function validateSafeUrl(rawUrl: string): { isValid: boolean; url?: URL; reason?: string } {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return { isValid: false, reason: 'URL không được để trống.' };
  }

  try {
    const parsed = new URL(rawUrl.trim());

    // Protocol restriction: only http: and https:
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { isValid: false, reason: `Giao thức không được hỗ trợ: ${parsed.protocol}` };
    }

    // Host checking
    if (isPrivateOrInternalHost(parsed.hostname)) {
      return { isValid: false, reason: `Địa chỉ máy chủ nội bộ hoặc không an toàn: ${parsed.hostname}` };
    }

    return { isValid: true, url: parsed };
  } catch (err: any) {
    return { isValid: false, reason: `URL không hợp lệ: ${err.message}` };
  }
}

/**
 * Safe fetcher for external images with size limit, timeout, redirect limit, and SSRF checks
 */
export async function safeFetchImageBuffer(
  targetUrl: string,
  timeoutMs = 4500,
  maxSizeBytes = 8 * 1024 * 1024 // 8 MB max
): Promise<{ buffer: Buffer; mimeType: string } | null> {
  if (!targetUrl) return null;

  // Handle data URLs directly
  if (targetUrl.startsWith('data:image/')) {
    const match = targetUrl.match(/^data:(image\/[a-zA-Z0-9\+\-]+);base64,(.+)$/);
    if (match) {
      try {
        const buf = Buffer.from(match[2], 'base64');
        const sharp = (await import('sharp')).default;
        const optimizedBuffer = await sharp(buf).resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
        return { mimeType: 'image/webp', buffer: optimizedBuffer };
      } catch {
        return null;
      }
    }
  }

  const validation = validateSafeUrl(targetUrl);
  if (!validation.isValid || !validation.url) {
    return null;
  }

  let currentUrl = targetUrl;
  let redirects = 0;
  const maxRedirects = 3;

  while (redirects <= maxRedirects) {
    const stepVal = validateSafeUrl(currentUrl);
    if (!stepVal.isValid) return null;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      const response = await fetch(currentUrl, {
        signal: controller.signal,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 KTDT-Image-Bot/2.0',
          Accept: 'image/webp,image/png,image/jpeg,image/*;q=0.8',
        },
        redirect: 'manual', // Handle redirects manually to enforce SSRF validation at every hop
      });

      clearTimeout(timeout);

      // Handle redirect
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location');
        if (!location) return null;
        currentUrl = new URL(location, currentUrl).href;
        redirects++;
        continue;
      }

      if (!response.ok) return null;

      const contentType = (response.headers.get('content-type') || '').toLowerCase();
      const mimeType = contentType.split(';')[0].trim();
      // Allow image MIME or binary octet-stream if URL clearly looks like an image
      const isImageMime = mimeType.startsWith('image/');
      const hasImageExt = /\.(webp|png|jpe?g|gif|svg)$/i.test(new URL(currentUrl).pathname);
      if (!isImageMime && !hasImageExt) {
        return null;
      }

      const contentLength = parseInt(response.headers.get('content-length') || '0', 10);
      if (contentLength > maxSizeBytes) {
        return null;
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      if (buffer.length === 0 || buffer.length > maxSizeBytes) {
        return null;
      }
      try {
        const sharp = (await import('sharp')).default;
        const optimizedBuffer = await sharp(buffer)
           .resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true })
           .webp({ quality: 80 })
           .toBuffer();
        return { buffer: optimizedBuffer, mimeType: 'image/webp' };
      } catch (e) {
        console.error('Sharp optimization failed', e);
        return null;
      }
    } catch {
      return null;
    }
  }

  return null;
}

/**
 * Safe fetcher for HTML page (Live Article)
 */
export async function safeFetchHtml(
  pageUrl: string,
  timeoutMs = 5000,
  maxSizeBytes = 3 * 1024 * 1024 // 3 MB max HTML
): Promise<string | null> {
  const validation = validateSafeUrl(pageUrl);
  if (!validation.isValid || !validation.url) return null;

  let currentUrl = pageUrl;
  let redirects = 0;
  const maxRedirects = 3;

  while (redirects <= maxRedirects) {
    const stepVal = validateSafeUrl(currentUrl);
    if (!stepVal.isValid) return null;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      const response = await fetch(currentUrl, {
        signal: controller.signal,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 KTDT-Bot/2.0',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        redirect: 'manual',
      });

      clearTimeout(timeout);

      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location');
        if (!location) return null;
        currentUrl = new URL(location, currentUrl).href;
        redirects++;
        continue;
      }

      if (!response.ok) return null;
      const text = await response.text();
      return text.slice(0, maxSizeBytes);
    } catch {
      return null;
    }
  }

  return null;
}

/**
 * ============================================================================
 * URL Resolution & Inference Helpers
 * ============================================================================
 */

/**
 * Resolves a relative or absolute URL against a base or article URL using standards-compliant logic
 */
export function resolveUrl(src: string, baseUrlOrArticleUrl?: string): string | null {
  if (!src || typeof src !== 'string') return null;
  const cleanSrc = src.trim();

  // If already an absolute http/https URL
  if (/^https?:\/\//i.test(cleanSrc)) {
    return cleanSrc;
  }

  if (cleanSrc.startsWith('data:image/')) {
    return cleanSrc;
  }

  if (!baseUrlOrArticleUrl || !baseUrlOrArticleUrl.trim()) {
    return null;
  }

  try {
    let cleanBase = baseUrlOrArticleUrl.trim();
    // If the base does not start with http/https, add https://
    if (!/^https?:\/\//i.test(cleanBase)) {
      cleanBase = `https://${cleanBase}`;
    }

    const resolved = new URL(cleanSrc, cleanBase);
    return resolved.href;
  } catch {
    return null;
  }
}

/**
 * Automatically infers a sensible publish base URL from an article URL
 * Example: https://mettasingingbowl.com/ktdieutam/example-article.html -> https://mettasingingbowl.com/ktdieutam/
 */
export function inferBaseUrlFromArticleUrl(articleUrl: string): string {
  if (!articleUrl || typeof articleUrl !== 'string') return '';
  const clean = articleUrl.trim();
  if (!/^https?:\/\//i.test(clean)) return '';

  try {
    const url = new URL(clean);
    let pathname = url.pathname;

    // Strip trailing file like index.html or article.html
    const lastSlash = pathname.lastIndexOf('/');
    if (lastSlash >= 0) {
      pathname = pathname.substring(0, lastSlash + 1);
    }
    if (!pathname.endsWith('/')) {
      pathname += '/';
    }

    return `${url.origin}${pathname}`;
  } catch {
    return '';
  }
}

/**
 * ============================================================================
 * Live Article Parsing & Mapping
 * ============================================================================
 */

export interface LiveArticleImageItem {
  index: number;
  live_src: string;
  live_alt: string;
  context_heading: string;
  context_paragraph: string;
  filename: string;
  is_featured: boolean;
}

export interface LiveArticleParseResult {
  title: string;
  featured_image?: LiveArticleImageItem;
  inline_images: LiveArticleImageItem[];
}

/**
 * Parses live article HTML and extracts strictly article-content images (ignoring header, footer, logo, ads)
 */
export function parseLiveArticleHtml(html: string, pageUrl: string): LiveArticleParseResult {
  const root = parse(html);

  // Title
  let title = '';
  const h1 = root.querySelector('h1');
  if (h1 && h1.text.trim()) {
    title = h1.text.trim();
  }

  // Content container
  const candidateSelectors = [
    '.article-prose',
    '.article-content',
    '.entry-content',
    '.post-content',
    '.article__content',
    '.detail-content',
    'article',
    'main',
  ];

  let contentEl: HTMLElement | null = null;
  for (const sel of candidateSelectors) {
    const el = root.querySelector(sel);
    if (el) {
      contentEl = el;
      break;
    }
  }
  if (!contentEl) {
    contentEl = root.querySelector('body') || root;
  }

  // Dedicated featured image
  const featuredSelectors = [
    '.article-featured-image img',
    '.featured-image img',
    '.article-feature-image img',
    '.post-thumbnail img',
    'figure.feature img',
    'figure.featured-image img',
  ];

  let featuredEl: HTMLElement | null = null;
  for (const sel of featuredSelectors) {
    const el = root.querySelector(sel);
    if (el) {
      featuredEl = el;
      break;
    }
  }

  let featuredItem: LiveArticleImageItem | undefined;
  if (featuredEl) {
    const rawSrc = featuredEl.getAttribute('src') || '';
    const resolved = resolveUrl(rawSrc, pageUrl);
    if (resolved) {
      featuredItem = {
        index: 0,
        live_src: resolved,
        live_alt: featuredEl.getAttribute('alt') || '',
        context_heading: title,
        context_paragraph: '',
        filename: extractFilenameFromUrl(resolved),
        is_featured: true,
      };
    }
  }

  // Inline images inside article content container
  const rawImgs = contentEl.querySelectorAll('img');
  const inlineList: LiveArticleImageItem[] = [];

  rawImgs.forEach((img, idx) => {
    if (featuredEl && img === featuredEl) return;

    // Ignore tiny spacer or 1x1 pixels
    const width = img.getAttribute('width');
    const height = img.getAttribute('height');
    if (width === '1' && height === '1') return;

    const rawSrc = img.getAttribute('src') || '';
    if (!rawSrc) return;

    // Check if spacer / divider / logo
    if (/spacer|pixel|tracking|clear\.gif|transparent\.png/i.test(rawSrc)) return;

    const resolved = resolveUrl(rawSrc, pageUrl);
    if (!resolved) return;

    // Find nearest heading
    let heading = '';
    let curr: HTMLElement | null = (img.parentNode as HTMLElement) || null;
    while (curr && curr !== contentEl) {
      let prev = curr.previousElementSibling;
      while (prev) {
        if (/^h[2-4]$/i.test(prev.tagName)) {
          heading = prev.text.trim();
          break;
        }
        prev = prev.previousElementSibling;
      }
      if (heading) break;
      curr = (curr.parentNode as HTMLElement) || null;
    }

    inlineList.push({
      index: idx + 1,
      live_src: resolved,
      live_alt: img.getAttribute('alt') || '',
      context_heading: heading,
      context_paragraph: '',
      filename: extractFilenameFromUrl(resolved),
      is_featured: false,
    });
  });

  return {
    title,
    featured_image: featuredItem,
    inline_images: inlineList,
  };
}

export function extractFilenameFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const parts = parsed.pathname.split('/');
    return parts[parts.length - 1] || '';
  } catch {
    const clean = url.split('?')[0].split('#')[0];
    const parts = clean.split('/');
    return parts[parts.length - 1] || '';
  }
}

/**
 * Calculates string similarity (0.0 to 1.0) using bigram Sorensen-Dice coefficient
 */
export function stringSimilarity(str1: string, str2: string): number {
  const s1 = (str1 || '').toLowerCase().replace(/[^a-z0-9à-ỹ]/g, '');
  const s2 = (str2 || '').toLowerCase().replace(/[^a-z0-9à-ỹ]/g, '');
  if (!s1 || !s2) return 0;
  if (s1 === s2) return 1;
  if (s1.length < 2 || s2.length < 2) return s1 === s2 ? 1 : 0;

  const getBigrams = (str: string) => {
    const bigrams = new Map<string, number>();
    for (let i = 0; i < str.length - 1; i++) {
      const bg = str.slice(i, i + 2);
      bigrams.set(bg, (bigrams.get(bg) || 0) + 1);
    }
    return bigrams;
  };

  const bg1 = getBigrams(s1);
  const bg2 = getBigrams(s2);

  let intersection = 0;
  for (const [bg, count1] of bg1.entries()) {
    const count2 = bg2.get(bg) || 0;
    intersection += Math.min(count1, count2);
  }

  const total = (s1.length - 1) + (s2.length - 1);
  return (2 * intersection) / total;
}

/**
 * Maps an edited slot to the most probable live article image using multiple pieces of evidence
 */
export function mapEditedSlotToLiveImages(
  slot: {
    type: 'featured' | 'inline';
    old_src: string;
    old_alt?: string;
    context_heading?: string;
    context_paragraph?: string;
    original_index?: number;
  },
  liveData: LiveArticleParseResult
): {
  matchedItem: LiveArticleImageItem | null;
  confidence: MappingConfidence;
  score: number;
  reason: string;
} {
  // Case 1: Featured Image
  if (slot.type === 'featured') {
    if (liveData.featured_image) {
      return {
        matchedItem: liveData.featured_image,
        confidence: 'high',
        score: 0.95,
        reason: 'Khớp với vị trí ảnh bìa chính (featured image) của bài viết đang xuất bản.',
      };
    }
    // Fallback: first live inline image if only 1 image exists
    if (liveData.inline_images.length === 1) {
      return {
        matchedItem: liveData.inline_images[0],
        confidence: 'medium',
        score: 0.7,
        reason: 'Khớp với ảnh duy nhất trên trang bài viết đang xuất bản.',
      };
    }
    return {
      matchedItem: null,
      confidence: 'low',
      score: 0,
      reason: 'Trang bài viết gốc không có ảnh bìa chuyên dụng rõ ràng.',
    };
  }

  // Case 2: Inline slot
  const slotFilename = extractFilenameFromUrl(slot.old_src);
  const slotAlt = (slot.old_alt || '').toLowerCase().trim();
  const slotHeading = (slot.context_heading || '').toLowerCase().trim();

  let bestMatch: LiveArticleImageItem | null = null;
  let highestScore = -1;
  let matchReason = '';

  for (const liveImg of liveData.inline_images) {
    let score = 0;

    // Signal A: Filename exact match or similarity (up to 0.45)
    if (slotFilename && liveImg.filename) {
      if (slotFilename.toLowerCase() === liveImg.filename.toLowerCase()) {
        score += 0.45;
      } else {
        const fnSim = stringSimilarity(slotFilename, liveImg.filename);
        score += fnSim * 0.4;
      }
    }

    // Signal B: Alt text similarity (up to 0.30)
    if (slotAlt && liveImg.live_alt) {
      const altSim = stringSimilarity(slotAlt, liveImg.live_alt);
      score += altSim * 0.3;
    }

    // Signal C: Heading similarity (up to 0.25)
    if (slotHeading && liveImg.context_heading) {
      const headSim = stringSimilarity(slotHeading, liveImg.context_heading);
      score += headSim * 0.25;
    }

    // Signal D: DOM order proximity (up to 0.15)
    if (typeof slot.original_index === 'number' && slot.original_index > 0) {
      const indexDiff = Math.abs(slot.original_index - liveImg.index);
      if (indexDiff === 0) {
        score += 0.15;
      } else if (indexDiff === 1) {
        score += 0.08;
      }
    }

    if (score > highestScore) {
      highestScore = score;
      bestMatch = liveImg;
    }
  }

  if (!bestMatch || highestScore < 0.25) {
    // If no strong match, but DOM order matches exactly
    if (
      typeof slot.original_index === 'number' &&
      slot.original_index > 0 &&
      liveData.inline_images[slot.original_index - 1]
    ) {
      const fallbackItem = liveData.inline_images[slot.original_index - 1];
      return {
        matchedItem: fallbackItem,
        confidence: 'low',
        score: 0.35,
        reason: 'Ước tính theo thứ tự xuất hiện (DOM order), cần xác nhận lại.',
      };
    }

    return {
      matchedItem: null,
      confidence: 'low',
      score: 0,
      reason: 'Không tìm thấy ảnh tương ứng đáng tin cậy trên bài viết gốc.',
    };
  }

  let confidence: MappingConfidence = 'low';
  if (highestScore >= 0.65) {
    confidence = 'high';
    matchReason = 'Độ tin cậy cao: Khớp tên file / ngữ cảnh alt / tiêu đề mục trên bài viết gốc.';
  } else if (highestScore >= 0.4) {
    confidence = 'medium';
    matchReason = 'Độ tin cậy trung bình: Khớp một phần tiêu đề hoặc vị trí xuất hiện.';
  } else {
    confidence = 'low';
    matchReason = 'Độ tin cậy thấp: Chưa đủ chứng cứ xác định chính xác, cần biên tập viên kiểm tra.';
  }

  return {
    matchedItem: bestMatch,
    confidence,
    score: highestScore,
    reason: matchReason,
  };
}

/**
 * ============================================================================
 * 5-Stage Original Image Discovery Pipeline
 * ============================================================================
 */

export interface DiscoveryInputSlot {
  slot_id: string;
  type: 'featured' | 'inline';
  old_src: string;
  old_alt?: string;
  context_heading?: string;
  context_paragraph?: string;
  original_index?: number;
}

export interface DiscoveredSlotResult {
  slot_id: string;
  source_image: SourceImageInfo;
  imageBuffer?: Buffer;
  mimeType?: string;
}

/**
 * Discovers the actual original image pixels for a single slot using the 5 priorities
 */
export async function discoverSingleSlotSource(
  slot: DiscoveryInputSlot,
  options: {
    articleUrl?: string;
    baseUrl?: string;
    liveArticleData?: LiveArticleParseResult | null;
  }
): Promise<DiscoveredSlotResult> {
  const { articleUrl, baseUrl, liveArticleData } = options;
  const oldSrc = (slot.old_src || '').trim();

  // PRIORITY 1 — ABSOLUTE SRC
  if (/^https?:\/\//i.test(oldSrc)) {
    const fetched = await safeFetchImageBuffer(oldSrc);
    if (fetched) {
      return {
        slot_id: slot.slot_id,
        imageBuffer: fetched.buffer,
        mimeType: fetched.mimeType,
        source_image: {
          method: 'absolute_src',
          resolved_url: oldSrc,
          available: true,
          source_retrieval_status: 'success',
          visual_analysis_available: false,
          visual_analysis_status: 'not_started',
          mapping_confidence: 'high',
          mapping_reason: 'Tải thành công trực tiếp từ URL tuyệt đối trong mã HTML.',
          source_status_label: '✓ Đã tải ảnh thực tế',
          source_helper: 'Nguồn: URL trong HTML',
          thumbnail_data_url: `data:${fetched.mimeType};base64,${fetched.buffer.toString('base64')}`,
        },
      };
    }
  }

  // Data URL in src
  if (oldSrc.startsWith('data:image/')) {
    const fetched = await safeFetchImageBuffer(oldSrc);
    if (fetched) {
      return {
        slot_id: slot.slot_id,
        imageBuffer: fetched.buffer,
        mimeType: fetched.mimeType,
        source_image: {
          method: 'absolute_src',
          resolved_url: 'data:image/...',
          available: true,
          source_retrieval_status: 'success',
          visual_analysis_available: false,
          visual_analysis_status: 'not_started',
          mapping_confidence: 'high',
          mapping_reason: 'Dữ liệu ảnh nhúng trực tiếp dạng data URL trong HTML.',
          source_status_label: '✓ Đã tải ảnh thực tế',
          source_helper: 'Nguồn: Dữ liệu ảnh nhúng sẵn',
          thumbnail_data_url: oldSrc,
        },
      };
    }
  }

  // PRIORITY 2 — LIVE ARTICLE PAGE
  if (liveArticleData && articleUrl) {
    const mapping = mapEditedSlotToLiveImages(slot, liveArticleData);
    if (mapping.matchedItem && mapping.confidence !== 'low') {
      const fetched = await safeFetchImageBuffer(mapping.matchedItem.live_src);
      if (fetched) {
        return {
          slot_id: slot.slot_id,
          imageBuffer: fetched.buffer,
          mimeType: fetched.mimeType,
          source_image: {
            method: 'live_article',
            resolved_url: mapping.matchedItem.live_src,
            available: true,
            source_retrieval_status: 'success',
            visual_analysis_available: false,
            visual_analysis_status: 'not_started',
            mapping_confidence: mapping.confidence,
            mapping_reason: mapping.reason,
            matched_live_src: mapping.matchedItem.live_src,
            source_status_label: '✓ Đã tải ảnh thực tế',
            source_helper: 'Nguồn: URL bài viết gốc',
            thumbnail_data_url: `data:${fetched.mimeType};base64,${fetched.buffer.toString('base64')}`,
          },
        };
      }
    } else if (mapping.matchedItem && mapping.confidence === 'low') {
      // Matched but low confidence -> try to fetch, but flag as needs_confirmation
      const fetched = await safeFetchImageBuffer(mapping.matchedItem.live_src);
      if (fetched) {
        return {
          slot_id: slot.slot_id,
          imageBuffer: fetched.buffer,
          mimeType: fetched.mimeType,
          source_image: {
            method: 'live_article',
            resolved_url: mapping.matchedItem.live_src,
            available: true,
            source_retrieval_status: 'success',
            visual_analysis_available: false,
            visual_analysis_status: 'not_started',
            mapping_confidence: 'low',
            mapping_reason: mapping.reason,
            needs_confirmation: true,
            matched_live_src: mapping.matchedItem.live_src,
            source_status_label: '✓ Đã tải ảnh thực tế',
            source_helper: 'Nguồn: URL bài viết gốc (cần xác nhận)',
            thumbnail_data_url: `data:${fetched.mimeType};base64,${fetched.buffer.toString('base64')}`,
          },
        };
      }
    }
  }

  // PRIORITY 3 — RESOLVE RELATIVE SRC AGAINST ARTICLE URL
  if (articleUrl && oldSrc) {
    const resolved = resolveUrl(oldSrc, articleUrl);
    if (resolved && resolved !== oldSrc) {
      const fetched = await safeFetchImageBuffer(resolved);
      if (fetched) {
        return {
          slot_id: slot.slot_id,
          imageBuffer: fetched.buffer,
          mimeType: fetched.mimeType,
          source_image: {
            method: 'article_url_resolve',
            resolved_url: resolved,
            available: true,
            source_retrieval_status: 'success',
            visual_analysis_available: false,
            visual_analysis_status: 'not_started',
            mapping_confidence: 'high',
            mapping_reason: 'Ghép nối đường dẫn tương đối với URL bài viết gốc.',
            source_status_label: '✓ Đã tải ảnh thực tế',
            source_helper: 'Nguồn: URL bài viết gốc',
            thumbnail_data_url: `data:${fetched.mimeType};base64,${fetched.buffer.toString('base64')}`,
          },
        };
      }
    }
  }

  // PRIORITY 4 — RESOLVE AGAINST BASE URL
  if (baseUrl && oldSrc) {
    const resolved = resolveUrl(oldSrc, baseUrl);
    if (resolved && resolved !== oldSrc) {
      const fetched = await safeFetchImageBuffer(resolved);
      if (fetched) {
        return {
          slot_id: slot.slot_id,
          imageBuffer: fetched.buffer,
          mimeType: fetched.mimeType,
          source_image: {
            method: 'base_url_resolve',
            resolved_url: resolved,
            available: true,
            source_retrieval_status: 'success',
            visual_analysis_available: false,
            visual_analysis_status: 'not_started',
            mapping_confidence: 'high',
            mapping_reason: 'Ghép nối đường dẫn ảnh trong HTML với Base URL.',
            source_status_label: '✓ Đã tải ảnh thực tế',
            source_helper: 'Nguồn: Base URL + src',
            thumbnail_data_url: `data:${fetched.mimeType};base64,${fetched.buffer.toString('base64')}`,
          },
        };
      }
    }
  }

  // PRIORITY 5 — MANUAL SOURCE (Failed automatic discovery)
  return {
    slot_id: slot.slot_id,
    source_image: {
      method: 'upload',
      resolved_url: oldSrc || '',
      available: false,
      source_retrieval_status: 'failed',
      visual_analysis_available: false,
      visual_analysis_status: 'unavailable',
      mapping_confidence: 'low',
      mapping_reason: 'Chưa tải được ảnh gốc tự động. Bạn có thể dán ảnh trực tiếp hoặc tải ảnh lên.',
      source_status_label: 'Chưa có ảnh gốc',
      source_helper: 'URL không tải được ảnh thực tế',
      error: 'Không thể tải ảnh từ URL trong HTML hoặc bài viết xuất bản.',
    },
  };
}
