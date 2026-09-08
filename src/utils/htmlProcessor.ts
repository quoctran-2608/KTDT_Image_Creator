import { parse, HTMLElement } from 'node-html-parser';
import {
  slugifyVietnamese,
  generateFeaturedFilename,
  generateInlineFilename,
  makeUniqueFilenames,
  deriveEffectiveArticleSlug,
} from './slugify';
import { ArticleAnalysis, ImageClassification, ImageSlotPlan, BrandProfile } from '../types';

export interface ExtractedImageInfo {
  index: number;
  old_src: string;
  old_alt: string;
  context_heading: string;
  context_paragraph: string;
  context_before: string;
  context_after: string;
  heuristic_classification: ImageClassification;
  heuristic_reason: string;
  heuristic_confidence: 'high' | 'medium' | 'low';
  suggested_concept: string;
  generation_prompt?: string;
  suggested_filename_suffix: string;
  suggested_alt: string;
}

export interface ParsedArticleResult {
  title: string;
  excerpt: string;
  slug: string;
  contentSelector: string;
  images: ExtractedImageInfo[];
  featuredImageInfo?: {
    old_src: string;
    old_alt: string;
    has_dedicated_element: boolean;
  };
}

export const CLASSIFICATION_DEFAULT_REASONS: Record<ImageClassification, string> = {
  REPLACE_AI: 'Ảnh minh họa cũ dạng stock/concept, tạo hình mới bằng AI.',
  KEEP_ORIGINAL: 'Tài liệu, biểu mẫu hoặc dữ liệu nguồn: tạo bản mới từ ảnh gốc, bảo toàn nội dung số liệu.',
  MANUAL_REVIEW: 'Cần biên tập viên chọn: Tạo hình mới bằng AI hoặc Tạo bản mới từ ảnh gốc.',
  IGNORE: 'Không thuộc nội dung bài viết hoặc không cần xử lý.',
};

/**
 * Checks if a string looks like an unaccented filename or slug rather than finished Vietnamese editorial copy.
 */
export function isUnaccentedOrFilenameText(text: string): boolean {
  if (!text || !text.trim()) return true;
  const clean = text.trim();
  if (/\.(webp|jpg|jpeg|png|gif|svg|bmp|tiff)$/i.test(clean)) return true;
  if (/^[a-z0-9\-_]+$/i.test(clean)) return true;
  const hasVietnameseDiacritics = /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/i.test(clean);
  if (!hasVietnameseDiacritics && clean.length > 4) {
    const vnUnaccentedWords = /\b(cach|lam|so|sach|ke|toan|hoa|don|thue|doanh|nghiep|bao|cao|chung|tu|quy|trinh|to|khai|tai|khoan|tien|luong|nop|mau|bieu|bang|tinh|excel|misa|phan|mem)\b/i;
    if (vnUnaccentedWords.test(clean)) return true;
  }
  return false;
}

/**
 * Generates a short, human-readable editorial image title (not duplicate of article title, not keyword stuffed)
 */
export function generateEditorialTitle(
  heading = '',
  alt = '',
  articleTitle = '',
  index = 0
): string {
  // Prefer heading if available and has diacritics
  let seed = '';
  if (heading && !isUnaccentedOrFilenameText(heading)) {
    seed = heading;
  } else if (alt && !isUnaccentedOrFilenameText(alt)) {
    seed = alt;
  } else if (heading) {
    seed = heading;
  } else {
    seed = articleTitle || `Mục hình ảnh ${index + 1}`;
  }

  seed = seed
    .replace(/^(\d+[\.\)]|[IVXLCDM]+[\.\)])\s*/i, '')
    .replace(/\b(ảnh stock|ảnh minh họa|ảnh cũ|placeholder|hình cũ|bản scan|chứng từ)\b/gi, '')
    .replace(/["“”'']/g, '')
    .trim();

  // If seed is still unaccented or looks like filename, synthesize or map to proper Vietnamese
  if (isUnaccentedOrFilenameText(seed)) {
    const lower = seed.toLowerCase();
    if (lower.includes('so sach') || lower.includes('excel')) {
      seed = 'Lập sổ sách kế toán trên Excel';
    } else if (lower.includes('hoa don')) {
      seed = 'Thời điểm và quy trình xuất hóa đơn';
    } else if (lower.includes('thue') || lower.includes('to khai')) {
      seed = 'Rà soát hồ sơ và kê khai thuế';
    } else if (articleTitle && !isUnaccentedOrFilenameText(articleTitle)) {
      seed = articleTitle;
    }
  }

  if (!seed || seed.length < 5) {
    seed = articleTitle || `Mục hình ảnh ${index + 1}`;
  }

  // Cap to 5-8 words natural Vietnamese title
  const words = seed.split(/\s+/).slice(0, 8).join(' ');
  const capitalized = words.charAt(0).toUpperCase() + words.slice(1);
  return capitalized;
}

/**
 * Generates a natural Vietnamese editorial caption explaining why the image matters in nearby context
 */
export function generateEditorialCaption(
  heading = '',
  contextBefore = '',
  articleTitle = ''
): string {
  const cleanHeading = (heading || '')
    .replace(/^(\d+[\.\)]|[IVXLCDM]+[\.\)])\s*/i, '')
    .replace(/["“”'']/g, '')
    .trim();

  if (cleanHeading && !isUnaccentedOrFilenameText(cleanHeading)) {
    return `Quy trình và căn cứ thực hiện theo quy định liên quan đến ${cleanHeading.toLowerCase()}.`;
  }

  if (cleanHeading && isUnaccentedOrFilenameText(cleanHeading)) {
    const lower = cleanHeading.toLowerCase();
    if (lower.includes('so sach') || lower.includes('excel')) {
      return 'Mẫu bảng tính hỗ trợ kế toán theo dõi và tổng hợp sổ sách trên Excel.';
    }
  }

  if (contextBefore && contextBefore.length > 25 && !isUnaccentedOrFilenameText(contextBefore)) {
    const firstSentence = contextBefore.split(/[.\n]/)[0].trim().slice(0, 85);
    return `${firstSentence}.`;
  }

  if (articleTitle && !isUnaccentedOrFilenameText(articleTitle)) {
    return `Chi tiết đối chiếu chứng từ và hồ sơ theo quy định về ${articleTitle.toLowerCase()}.`;
  }

  return 'Chi tiết đối chiếu chứng từ và hồ sơ tài chính kế toán theo quy định hiện hành.';
}

/**
 * Normalizes an output base path (e.g., 'uploads/articles/2026/09' -> 'uploads/articles/2026/09/')
 */
export function normalizeBasePath(basePath: string): string {
  if (!basePath || !basePath.trim()) return '';
  let clean = basePath.trim();
  if (!clean.endsWith('/')) {
    clean += '/';
  }
  return clean;
}

/**
 * Auto-clean editorial alt text:
 * - Removes source-descriptive words like "ảnh stock", "ảnh minh họa", "ảnh cũ", "hình cũ", "placeholder", "stock", "cũ"
 * - Rewrites alt text into a clean description of the image content
 * - Maintains concise, natural Vietnamese prioritizing accessibility and editorial clarity
 * - Detects unaccented filename strings and regenerates natural Vietnamese with proper diacritics
 */
export function cleanEditorialAltText(alt: string, fallbackSubject = ''): string {
  if (!alt || typeof alt !== 'string') {
    alt = '';
  }

  let cleaned = alt.trim();

  // Strip file extensions if filename was passed as alt
  cleaned = cleaned.replace(/\.(webp|jpg|jpeg|png|gif|svg)$/i, '');

  // Strip leading noise prefixes (case-insensitive)
  cleaned = cleaned.replace(
    /^(ảnh stock|hình stock|ảnh minh họa|hình ảnh minh họa|hình minh họa|bức ảnh minh họa|ảnh chụp|hình ảnh|bức ảnh|ảnh|hình|photo of|image of|stock photo of|illustration of)\s*(cho|về|của|mô tả)?\s*[:\-\—]?\s*/i,
    ''
  );

  // Remove occurrences of legacy / source-descriptive compound terms
  cleaned = cleaned.replace(
    /\b(ảnh stock|anh stock|stock photo|ảnh minh họa|anh minh hoa|hình minh họa|hinh minh hoa|ảnh cũ|anh cu|hình cũ|hinh cu|placeholder|via placeholder|dummy image)\b/gi,
    ''
  );

  // Remove standalone "stock" or "placeholder"
  cleaned = cleaned.replace(/\b(stock|placeholder)\b/gi, '');

  // Remove source-descriptive word "cũ" when modifying nouns (e.g. "chứng từ bán hàng cũ" -> "chứng từ bán hàng", "bản scan cũ" -> "bản scan")
  cleaned = cleaned.replace(/\s+\bcũ\b/gi, '');

  // Clean trailing or dangling "minh họa"
  cleaned = cleaned.replace(/\s+minh họa$/i, '');

  // Clean redundant whitespace and double punctuation
  cleaned = cleaned
    .replace(/[,\:\-\—]\s*[,\:\-\—]+/g, ',')
    .replace(/\s+/g, ' ')
    .replace(/^[,\:\-\—\.\s]+|[,\:\-\—\.\s]+$/g, '')
    .trim();

  // Check if alt is unaccented filename-derived text (e.g. "Cach lam so sach ke toan tren excel")
  if (isUnaccentedOrFilenameText(cleaned)) {
    const lower = cleaned.toLowerCase();
    if (lower.includes('so sach') || lower.includes('excel')) {
      cleaned = 'Cửa sổ bảng tính Excel dùng để theo dõi và lập sổ sách kế toán';
    } else if (fallbackSubject && !isUnaccentedOrFilenameText(fallbackSubject)) {
      const cleanSubject = fallbackSubject
        .replace(/^(\d+[\.\)]|[IVXLCDM]+[\.\)])\s*/i, '')
        .replace(/["“”'']/g, '')
        .trim();
      cleaned = `Chuyên viên kế toán rà soát chứng từ liên quan đến ${cleanSubject.toLowerCase()} tại văn phòng`;
    } else {
      cleaned = 'Chuyên viên tài chính kế toán rà soát chứng từ và đối chiếu số liệu tại văn phòng';
    }
  }

  // If text is empty or too short / degraded
  if (cleaned.length < 8) {
    if (fallbackSubject && fallbackSubject.trim() && !isUnaccentedOrFilenameText(fallbackSubject)) {
      const cleanSubject = fallbackSubject
        .replace(/^(\d+[\.\)]|[IVXLCDM]+[\.\)])\s*/i, '')
        .replace(/["“”'']/g, '')
        .trim();
      cleaned = `Chuyên viên kế toán rà soát hồ sơ liên quan đến ${cleanSubject.toLowerCase()} tại văn phòng`;
    } else {
      cleaned = 'Chuyên viên kế toán kiểm tra chứng từ bán hàng và đối chiếu số liệu tại văn phòng';
    }
  }

  // Capitalize the first letter
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

/**
 * Detect whether an image slot represents or is derived from an invoice, document, form,
 * table, spreadsheet, financial statement, chart, or structured accounting data.
 * Prefer actual image evidence (visual_type, descriptions, old_src, old_alt, sensitive flag).
 * Does NOT classify an ordinary photo as document/table merely because article headings or paragraphs
 * contain generic accounting words such as "hạch toán".
 */
export function isDocumentOrTableVisual(slot: {
  visual_type?: string;
  visual_description?: string;
  textual_description?: string;
  is_sensitive_source?: boolean;
  is_sensitive_document?: boolean;
  old_src?: string;
  old_alt?: string;
}): boolean {
  // 1. Visual type from AI multimodal analysis
  const vt = (slot.visual_type || '').toLowerCase().trim();
  if (
    /invoice|receipt|document|accounting_document|form|table|spreadsheet|statement|financial_statement|chart|sheet|bill|structured_document/i.test(
      vt
    )
  ) {
    return true;
  }

  // 2. Multimodal visual & textual descriptions of the actual image
  const desc = `${slot.visual_description || ''} ${slot.textual_description || ''}`.toLowerCase();
  if (
    /hóa đơn|hoa don|chứng từ|chung tu|bảng biểu|bang bieu|bảng số liệu|bang so lieu|bảng tính|tờ khai|báo cáo tài chính|phiếu thu|phiếu chi|bảng kê|invoice|receipt|spreadsheet|financial statement|accounting table|balance sheet|data table/i.test(
      desc
    )
  ) {
    return true;
  }

  // 3. Explicit document/table/invoice/form signals from the image itself (old_src, old_alt)
  // Strictly excludes generic accounting words like "hạch toán" and does NOT check context_heading / context_paragraph
  const imageEvidence = `${slot.old_src || ''} ${slot.old_alt || ''}`.toLowerCase();
  if (
    /hóa đơn|hoa don|invoice|chứng từ|chung tu|bảng biểu|bang bieu|bảng số liệu|bang so lieu|bảng kê|bang ke|biểu mẫu|bieu mau|tờ khai|to khai|báo cáo tài chính|bao cao tai chinh|bảng tính|bang tinh|spreadsheet|table|financial statement|accounting document|phiếu xuất|phieu xuat|phiếu nhập|phieu nhap|mẫu số|mau-so|to-khai/i.test(
      imageEvidence
    )
  ) {
    return true;
  }

  // 4. Sensitive source / document when appropriate (except explicit pure logo)
  if (slot.is_sensitive_source || slot.is_sensitive_document) {
    const isLogo = /(\/logo\.|logo-|-logo|\/icons\/|brand-logo)/i.test(slot.old_src || '');
    if (!isLogo) return true;
  }

  return false;
}

/**
 * Builds specialized concept and generation prompt for document/table/invoice explainer visual
 */
export function buildDocumentTablePrompt(topic: string): { concept: string; generation_prompt: string } {
  const cleanTopic = topic.replace(/^(\d+[\.\)]|[IVXLCDM]+[\.\)])\s*/i, '').trim() || 'nghiệp vụ kế toán';
  return {
    concept: `Hình ảnh minh họa đồ họa báo chí kinh tế trực quan (explainer visual) về ${cleanTopic.toLowerCase()}. Thiết kế mẫu hóa đơn/chứng từ tinh gọn được trình bày cùng bảng số liệu kế toán rõ ràng các dòng, cột và khối điều chỉnh, bố cục hiện đại, không sao chép tài liệu gốc.`,
    generation_prompt: `Clean professional Vietnamese accounting editorial illustration and explainer visual about ${cleanTopic.toLowerCase()}. Show a newly designed simplified invoice/document sheet together with a structured accounting table containing clear rows, columns and adjustment blocks. The visual should immediately communicate invoice adjustment and bookkeeping, while using a completely new composition and not reproducing the original document, company information or exact figures.`,
  };
}

/**
 * Intelligent heuristics to classify images with high precision:
 * - CRITICAL: Distinguishes between the IMAGE ITSELF (src, alt, filename) and the TOPIC OF THE TEXT.
 *   Never infers an image is an official/legal document merely because the surrounding article discusses
 *   laws, contracts, tax, invoices, or regulations.
 * - REPLACE_AI: generic stock photography (picsum.photos, unsplash...), generic business people,
 *   office/accounting scenes, discussions, conceptual illustrations, or alt/filenames explicitly saying "ảnh minh họa".
 * - When visual analysis is unavailable (visual_analysis_available = false) and classification concerns
 *   sensitive image types (scanned forms, official documents, screenshots, tables, charts, legal/tax forms,
 *   stamped or signed documents, logos, source materials):
 *   DO NOT confidently auto-classify as KEEP_ORIGINAL unless evidence is very strong (e.g. direct /logo.png URL).
 *   Prefer MANUAL_REVIEW with confidence 'low' and reason:
 *   "Chưa phân tích được ảnh thực tế; quyết định hiện dựa trên ngữ cảnh văn bản."
 * - IGNORE: decorative spacers, 1x1 tracking pixels.
 */
export function classifyImageHeuristically(
  src: string,
  alt: string,
  heading = '',
  paragraph = '',
  contextBefore = '',
  contextAfter = ''
): { classification: ImageClassification; reason: string; confidence: 'high' | 'medium' | 'low' } {
  const cleanSrc = (src || '').toLowerCase();
  const cleanAlt = (alt || '').toLowerCase();
  const imgSelf = `${cleanSrc} ${cleanAlt}`;

  // 0. Ignore spacers / tracking pixels / dividers
  if (/spacer|pixel|tracking|clear\.gif|transparent\.png|divider/i.test(cleanSrc)) {
    return {
      classification: 'IGNORE',
      reason: CLASSIFICATION_DEFAULT_REASONS.IGNORE,
      confidence: 'high',
    };
  }

  // 1. Definite Logo asset URL on the image itself
  if (/(\/logo\.|logo-|-logo|\/icons\/|favicon\.|brand-logo|site-logo)/i.test(cleanSrc)) {
    return {
      classification: 'KEEP_ORIGINAL',
      reason: 'Biểu trưng hoặc logo nhận diện thương hiệu gốc.',
      confidence: 'high',
    };
  }

  // 2. Sensitive image types: Scanned forms, official documents, stamp/seal, signature, legal/tax forms,
  //    screenshots, tables, charts, or source materials.
  //    When visual analysis is unavailable, be conservative: DO NOT confidently classify as KEEP_ORIGINAL.
  //    Instead prefer MANUAL_REVIEW with low confidence.
  const isSensitiveSourceMaterial =
    /bản chụp|ban chup|bản scan|ban scan|scanned|scan-form|scanned-form|scan_\d/i.test(imgSelf) ||
    /dấu mộc|dau moc|mộc đỏ|moc do|con dấu|con dau|chữ ký|chu ky|signature|seal|stamp/i.test(imgSelf) ||
    /mẫu số\s*\d+|mẫu số\s*0\d|mau-so-|mau_so_|tờ khai số|to-khai-|to_khai_/i.test(imgSelf) ||
    /giấy chứng nhận|gcn|giấy phép đăng ký kinh doanh|dkkd|công văn|quyết định số/i.test(imgSelf) ||
    /^(logo|biểu trưng|nhãn hiệu)\b/i.test(cleanAlt);

  const isDataChartOrScreenshot =
    /bảng số liệu|bảng thống kê|bảng so sánh|bảng tổng hợp|bang-so-lieu|bang-bieu|bang_bieu|table-vat-comparison|biểu đồ|bieu-do|chart|graph|diagram|sơ đồ quy trình|flowchart|infographic/i.test(
      imgSelf
    ) ||
    /screenshot|chụp màn hình|chup-man-hinh|giao diện phần mềm|giao diện misa|giao diện etax|giao diện fast/i.test(
      imgSelf
    );

  if (isSensitiveSourceMaterial || isDataChartOrScreenshot) {
    return {
      classification: 'MANUAL_REVIEW',
      reason: 'Chưa phân tích được ảnh thực tế; quyết định hiện dựa trên ngữ cảnh văn bản.',
      confidence: 'low',
    };
  }

  // 3. Evidence of ordinary illustrative / stock-like images:
  // - generic stock photography / demo image providers (picsum.photos, unsplash, pexels, etc.)
  // - filenames or alt text explicitly saying "ảnh minh họa", "ảnh stock", "ảnh tư liệu", "illustration"
  // - generic business people, office scenes, discussions, meetings, accounting scenes
  const isStockProvider =
    /picsum\.photos|unsplash\.com|pexels\.com|pixabay\.com|placeholder|via\.placeholder|loremflickr|dummyimage|freepik|shutterstock|istockphoto|gettyimages/i.test(
      cleanSrc
    );

  const isExplicitIllustration =
    /ảnh minh họa|anh minh hoa|ảnh stock|anh stock|ảnh tư liệu|anh tu lieu|stock photo|illustration|minh họa|minh hoa|concept/i.test(
      imgSelf
    );

  const isGenericBusinessScene =
    /nhân viên|chuyên viên|kế toán ngồi|trao đổi|thảo luận|họp bàn|bắt tay|văn phòng|bàn làm việc|máy tính|laptop|doanh nhân|người làm việc|business|discussion|meeting|office|accountant/i.test(
      imgSelf
    );

  if (isStockProvider || isExplicitIllustration || isGenericBusinessScene) {
    return {
      classification: 'REPLACE_AI',
      reason: 'Ảnh minh họa cũ dạng stock/concept, có thể thay bằng ảnh AI mới.',
      confidence: 'high',
    };
  }

  // 4. Context check: only if caption or nearby instructions explicitly reference numbered UI actions
  if (/bước \d|step \d|nhấn vào|click chuột|bấm chọn|hộp thoại|dialog/i.test(`${heading} ${paragraph}`)) {
    return {
      classification: 'MANUAL_REVIEW',
      reason: 'Chưa phân tích được ảnh thực tế; quyết định hiện dựa trên ngữ cảnh văn bản.',
      confidence: 'low',
    };
  }

  // 5. Ambiguous or neutral: MANUAL_REVIEW with low confidence
  return {
    classification: 'MANUAL_REVIEW',
    reason: 'Chưa phân tích được ảnh thực tế; quyết định hiện dựa trên ngữ cảnh văn bản.',
    confidence: 'low',
  };
}

/**
 * Robustly extract preceding paragraph and succeeding paragraph for an image element
 */
function extractLocalParagraphContext(
  img: HTMLElement,
  proseElement: HTMLElement
): { context_before: string; context_after: string } {
  // Find top-level block inside proseElement containing this img
  let blockEl: HTMLElement | null = img;
  while (
    blockEl &&
    blockEl.parentNode &&
    blockEl.parentNode !== proseElement &&
    blockEl.parentNode.nodeType === 1
  ) {
    blockEl = blockEl.parentNode as HTMLElement;
  }

  let context_before = '';
  let context_after = '';

  // 1. Walk backward for preceding paragraph
  if (blockEl) {
    let prev = blockEl.previousElementSibling;
    while (prev) {
      if (prev.tagName.toLowerCase() === 'p' && prev.text.trim()) {
        context_before = prev.text.trim();
        break;
      }
      const pList = prev.querySelectorAll('p');
      if (pList.length > 0) {
        const lastP = pList[pList.length - 1];
        if (lastP && lastP.text.trim()) {
          context_before = lastP.text.trim();
          break;
        }
      }
      prev = prev.previousElementSibling;
    }
  }

  // Fallback: If img was inside a p with text before it
  if (!context_before) {
    const parentP = img.closest('p');
    if (parentP && parentP.text.trim()) {
      context_before = parentP.text.trim();
    }
  }

  // 2. Walk forward for succeeding paragraph
  if (blockEl) {
    let next = blockEl.nextElementSibling;
    while (next) {
      if (next.tagName.toLowerCase() === 'p' && next.text.trim()) {
        context_after = next.text.trim();
        break;
      }
      const firstP = next.querySelector('p');
      if (firstP && firstP.text.trim()) {
        context_after = firstP.text.trim();
        break;
      }
      next = next.nextElementSibling;
    }
  }

  // Fallback: Check figcaption if inside figure
  if (!context_after) {
    const figCaption = img.closest('figure')?.querySelector('figcaption');
    if (figCaption && figCaption.text.trim()) {
      context_after = figCaption.text.trim();
    }
  }

  const cleanText = (t: string) => {
    const res = t.replace(/\s+/g, ' ').trim();
    if (res.length > 220) {
      return res.substring(0, 217) + '...';
    }
    return res;
  };

  return {
    context_before: cleanText(context_before),
    context_after: cleanText(context_after),
  };
}

/**
 * Generate human-readable, visual, non-stuffed Vietnamese Alt text describing what would be visually shown
 */
function createEditorialAltText(heading: string, oldAlt: string, index: number): string {
  // If oldAlt is human-written and descriptive (not a generic filename or stub)
  if (oldAlt && oldAlt.trim().length > 10 && !oldAlt.toLowerCase().includes('.jpg') && !oldAlt.toLowerCase().includes('.png')) {
    const cleaned = cleanEditorialAltText(oldAlt, heading);
    if (cleaned && cleaned.length > 8) {
      return cleaned;
    }
  }

  if (heading) {
    // Strip section numbers like "1. ", "II. "
    const cleanHeading = heading.replace(/^(\d+[\.\)]|[IVXLCDM]+[\.\)])\s*/i, '').trim();
    return cleanEditorialAltText(`Chuyên viên kế toán thực hiện rà soát hồ sơ và đối chiếu số liệu liên quan đến ${cleanHeading.toLowerCase()} tại văn phòng`, heading);
  }

  return cleanEditorialAltText('Chuyên viên tài chính kế toán thảo luận chứng từ và đối chiếu số liệu trên máy tính xách tay');
}

/**
 * Parse article HTML and extract prose container and inline images
 */
export function parseArticleHtml(html: string): ParsedArticleResult {
  const root = parse(html);

  // Extract Title
  let title = '';
  const h1 = root.querySelector('h1');
  if (h1 && h1.text.trim()) {
    title = h1.text.trim();
  } else {
    const ogTitle = root.querySelector('meta[property="og:title"]')?.getAttribute('content');
    if (ogTitle) {
      title = ogTitle.trim();
    } else {
      const titleTag = root.querySelector('title');
      if (titleTag && titleTag.text.trim()) {
        title = titleTag.text.trim().split(/[-|–]/)[0].trim();
      }
    }
  }
  if (!title) {
    title = 'Bài viết kinh tế thuế';
  }

  // Extract Excerpt
  let excerpt = '';
  const metaDesc =
    root.querySelector('meta[name="description"]')?.getAttribute('content') ||
    root.querySelector('meta[property="og:description"]')?.getAttribute('content');
  if (metaDesc) {
    excerpt = metaDesc.trim();
  } else {
    const lead = root.querySelector('.lead, .sapo, .excerpt, .summary, .article-summary');
    if (lead && lead.text.trim()) {
      excerpt = lead.text.trim();
    } else {
      const firstP = root.querySelector('p');
      if (firstP && firstP.text.trim().length > 30) {
        excerpt = firstP.text.trim();
      }
    }
  }

  // Determine Slug
  const slug = slugifyVietnamese(title);

  // Locate Content Prose Container
  const candidateSelectors = [
    '.article-prose',
    '.article-content',
    '.entry-content',
    '.post-content',
    '.article__content',
    '.detail-content',
    'article',
    'main',
    '.content',
  ];

  let proseElement: HTMLElement | null = null;
  let chosenSelector = 'body';

  for (const sel of candidateSelectors) {
    const el = root.querySelector(sel);
    if (el) {
      proseElement = el;
      chosenSelector = sel;
      break;
    }
  }

  if (!proseElement) {
    proseElement = root.querySelector('body') || root;
    chosenSelector = 'toàn bộ nội dung (body)';
  }

  // Identify dedicated featured image element in the document if present
  const featuredSelectors = [
    '.article-featured-image img',
    '.featured-image img',
    '.article-feature-image img',
    '.post-thumbnail img',
    'figure.feature img',
    'figure.featured-image img',
    'figure.article-featured-image img',
    '.entry-thumbnail img',
    '.post-cover img',
  ];

  let dedicatedFeaturedImg: HTMLElement | null = null;
  for (const sel of featuredSelectors) {
    const el = root.querySelector(sel);
    if (el) {
      dedicatedFeaturedImg = el;
      break;
    }
  }

  const ogImage = root.querySelector('meta[property="og:image"]')?.getAttribute('content') || '';
  const twitterImage = root.querySelector('meta[name="twitter:image"]')?.getAttribute('content') || '';
  const featuredOldSrc = dedicatedFeaturedImg?.getAttribute('src') || ogImage || twitterImage || '';
  const featuredOldAlt = dedicatedFeaturedImg?.getAttribute('alt') || '';

  // Extract inline images strictly inside prose container (excluding dedicated featured image)
  const rawImgElements = proseElement.querySelectorAll('img');
  const inlineImgElements: HTMLElement[] = [];

  rawImgElements.forEach((img) => {
    // Exclude if it is the dedicated featured image element
    if (dedicatedFeaturedImg && img === dedicatedFeaturedImg) {
      return;
    }
    // Exclude if inside a dedicated featured figure/container
    let curr: HTMLElement | null = img.parentNode as HTMLElement;
    let isInsideFeaturedContainer = false;
    while (curr && curr !== proseElement) {
      const cls = ((curr.getAttribute('class') || '') + ' ' + (curr.tagName || '')).toLowerCase();
      if (/article-featured-image|featured-image|post-thumbnail|entry-thumbnail/i.test(cls)) {
        isInsideFeaturedContainer = true;
        break;
      }
      curr = (curr.parentNode as HTMLElement) || null;
    }
    if (isInsideFeaturedContainer) {
      return;
    }

    // Ignore tiny spacers or tracker 1x1 pixels
    const width = img.getAttribute('width');
    const height = img.getAttribute('height');
    if (width === '1' && height === '1') {
      return;
    }

    inlineImgElements.push(img);
  });

  const images: ExtractedImageInfo[] = [];

  inlineImgElements.forEach((img, index) => {
    const old_src = img.getAttribute('src') || '';
    const old_alt = img.getAttribute('alt') || '';

    // Find nearest preceding heading
    let heading = '';
    let current: HTMLElement | null = (img.parentNode as HTMLElement) || null;
    // Walk back through siblings or parent siblings
    while (current && current !== proseElement) {
      let prev = current.previousElementSibling;
      while (prev) {
        if (/^h[2-4]$/i.test(prev.tagName)) {
          heading = prev.text.trim();
          break;
        }
        const innerH = prev.querySelector('h2, h3, h4');
        if (innerH) {
          heading = innerH.text.trim();
          break;
        }
        prev = prev.previousElementSibling;
      }
      if (heading) break;
      current = (current.parentNode as HTMLElement) || null;
    }

    // Extract preceding and succeeding paragraphs for local context
    const { context_before, context_after } = extractLocalParagraphContext(img, proseElement);

    // Nearby text fallback if context_before was empty
    let paragraph = context_before || context_after || '';

    const { classification, reason, confidence } = classifyImageHeuristically(
      old_src,
      old_alt,
      heading,
      paragraph,
      context_before,
      context_after
    );

    // Concept and filename seed from local section concept
    const contextKeyword = heading || old_alt || (context_before ? context_before.slice(0, 40) : `muc-${index + 1}`);
    const slugSuffix = slugifyVietnamese(contextKeyword, 40);

    const editorialAlt = createEditorialAltText(heading, old_alt, index);
    const cleanHeading = heading.replace(/^(\d+[\.\)]|[IVXLCDM]+[\.\)])\s*/i, '').trim();

    const isDocOrTable = isDocumentOrTableVisual({
      old_src,
      old_alt,
    });

    let vietnameseConcept: string;
    let englishPrompt: string;

    if (isDocOrTable) {
      const docPrompt = buildDocumentTablePrompt(cleanHeading || title || 'nghiệp vụ kế toán');
      vietnameseConcept = docPrompt.concept;
      englishPrompt = docPrompt.generation_prompt;
    } else {
      vietnameseConcept = cleanHeading
        ? `Chuyên viên kế toán doanh nghiệp Việt Nam đang làm việc với hồ sơ chứng từ liên quan đến ${cleanHeading.toLowerCase()} tại văn phòng hiện đại.`
        : `Chuyên viên tài chính kế toán rà soát số liệu và chứng từ thuế tại văn phòng doanh nghiệp hiện đại.`;

      englishPrompt = cleanHeading
        ? `Documentary editorial photography of a Vietnamese finance professional reviewing invoice records related to ${cleanHeading.toLowerCase()} at a modern office desk in Vietnam, natural soft daylight, professional corporate atmosphere.`
        : `Documentary editorial photography of a Vietnamese accountant working at a modern office desk in Vietnam, natural window lighting, 50mm lens.`;
    }

    images.push({
      index,
      old_src,
      old_alt,
      context_heading: heading,
      context_paragraph: paragraph,
      context_before,
      context_after,
      heuristic_classification: classification,
      heuristic_reason: reason,
      heuristic_confidence: confidence,
      suggested_concept: vietnameseConcept,
      generation_prompt: englishPrompt,
      suggested_filename_suffix: slugSuffix || `muc-${index + 1}`,
      suggested_alt: editorialAlt,
    });
  });

  return {
    title,
    excerpt,
    slug,
    contentSelector: chosenSelector,
    images,
    featuredImageInfo: {
      old_src: featuredOldSrc,
      old_alt: featuredOldAlt,
      has_dedicated_element: Boolean(dedicatedFeaturedImg),
    },
  };
}

/**
 * Update HTML source by replacing only src and alt of replaced inline images
 * and updating the featured image references (og:image, twitter:image, dedicated featured block)
 * Preserves the original HTML structure strictly without touching unselected images.
 */
export function updateArticleHtml(
  originalHtml: string,
  plan: ImageSlotPlan[],
  options: {
    updateFeaturedImage?: boolean;
    imagePathPrefix?: string; // e.g. "uploads/articles/2026/09/"
    onlyCompleted?: boolean;
    brandProfile?: BrandProfile;
    showCreditInArticle?: boolean;
  } = {}
): string {
  const root = parse(originalHtml);
  const prefix = normalizeBasePath(options.imagePathPrefix ?? 'uploads/articles/2026/09/');
  const escapeHtml = (value: string) =>
    value.replace(/[&<>"']/g, (char) => {
      const entities: Record<string, string> = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        '\'': '&#39;',
      };
      return entities[char];
    });

  // Locate the same prose container
  const candidateSelectors = [
    '.article-prose',
    '.article-content',
    '.entry-content',
    '.post-content',
    '.article__content',
    '.detail-content',
    'article',
    'main',
    '.content',
  ];

  let proseElement: HTMLElement | null = null;
  for (const sel of candidateSelectors) {
    const el = root.querySelector(sel);
    if (el) {
      proseElement = el;
      break;
    }
  }
  if (!proseElement) {
    proseElement = root.querySelector('body') || root;
  }

  // Identify dedicated featured image in DOM if present
  const featuredSelectors = [
    '.article-featured-image img',
    '.featured-image img',
    '.article-feature-image img',
    '.post-thumbnail img',
    'figure.feature img',
    'figure.featured-image img',
    'figure.article-featured-image img',
    '.entry-thumbnail img',
    '.post-cover img',
  ];

  let dedicatedFeaturedImg: HTMLElement | null = null;
  for (const sel of featuredSelectors) {
    const el = root.querySelector(sel);
    if (el) {
      dedicatedFeaturedImg = el;
      break;
    }
  }

  // State rule verification for image replacement:
  // SUCCESS state ONLY: slot.selected && slot.status === 'completed' && Boolean(slot.image_data_url)
  // For all other states (PLANNED, GENERATING, FAILED, SKIPPED, KEEP_ORIGINAL):
  // preserve original src and original alt (and preserve original og:image).
  const isSlotSuccess = (slot: ImageSlotPlan) =>
    Boolean(slot.selected && slot.status === 'completed' && slot.image_data_url);

  // 1. Handle Featured Image update (Strictly isolated from inline images)
  const featuredPlan = plan.find((p) => p.type === 'featured');
  if (featuredPlan && options.updateFeaturedImage !== false) {
    if (isSlotSuccess(featuredPlan)) {
      const finalFilename = featuredPlan.final_filename || featuredPlan.suggested_filename;
      const newFeaturedSrc = `${prefix}${finalFilename}`;
      const finalAlt = featuredPlan.alt || featuredPlan.suggested_alt;

      // Update og:image meta tag
      const ogImage = root.querySelector('meta[property="og:image"]');
      if (ogImage) {
        ogImage.setAttribute('content', newFeaturedSrc);
      }

      // Update twitter:image meta tag if present
      const twitterImage = root.querySelector('meta[name="twitter:image"]');
      if (twitterImage) {
        twitterImage.setAttribute('content', newFeaturedSrc);
      }

      // Update dedicated featured image container in the body if present
      if (dedicatedFeaturedImg) {
        dedicatedFeaturedImg.setAttribute('src', newFeaturedSrc);
        if (finalAlt) {
          dedicatedFeaturedImg.setAttribute('alt', finalAlt);
        }
        if (featuredPlan.title) {
          dedicatedFeaturedImg.setAttribute('title', featuredPlan.title);
        }

        const figureParent = dedicatedFeaturedImg.parentNode as HTMLElement | null;
        const isFigure = figureParent?.tagName?.toLowerCase() === 'figure';
        const showCaption = Boolean(featuredPlan.show_caption && featuredPlan.caption);
        const showCreditAllowed = Boolean(
          options.showCreditInArticle ?? options.brandProfile?.show_credit_in_article ?? false
        );
        const effectiveCredit =
          featuredPlan.credit ||
          options.brandProfile?.default_credit ||
          options.brandProfile?.brand_name ||
          '';
        const showCredit =
          showCreditAllowed &&
          featuredPlan.show_credit !== false &&
          Boolean(effectiveCredit);

        if (isFigure && (showCaption || showCredit)) {
          const figcaptionContent = [
            showCaption
              ? `<span class="image-caption">${escapeHtml(featuredPlan.caption || '')}</span>`
              : '',
            showCredit
              ? `<span class="image-credit">Nguồn: ${escapeHtml(effectiveCredit)}</span>`
              : '',
          ]
            .filter(Boolean)
            .join(' ');
          const existingFigcaption = figureParent.querySelector('figcaption');
          if (existingFigcaption) {
            existingFigcaption.set_content(figcaptionContent);
          } else {
            figureParent.insertAdjacentHTML(
              'beforeend',
              `<figcaption class="article-figcaption">${figcaptionContent}</figcaption>`
            );
          }
        }
      }
    }
    // If featuredPlan has not succeeded, og:image and dedicatedFeaturedImg remain untouched.
  }

  // 2. Handle Inline Images update (Strictly isolated from featured image)
  const rawImgElements = proseElement.querySelectorAll('img');
  const inlineImgElements: HTMLElement[] = [];

  rawImgElements.forEach((img) => {
    if (dedicatedFeaturedImg && img === dedicatedFeaturedImg) {
      return;
    }
    let curr: HTMLElement | null = img.parentNode as HTMLElement;
    let isInsideFeaturedContainer = false;
    while (curr && curr !== proseElement) {
      const cls = ((curr.getAttribute('class') || '') + ' ' + (curr.tagName || '')).toLowerCase();
      if (/article-featured-image|featured-image|post-thumbnail|entry-thumbnail/i.test(cls)) {
        isInsideFeaturedContainer = true;
        break;
      }
      curr = (curr.parentNode as HTMLElement) || null;
    }
    if (isInsideFeaturedContainer) {
      return;
    }

    const width = img.getAttribute('width');
    const height = img.getAttribute('height');
    if (width === '1' && height === '1') {
      return;
    }

    inlineImgElements.push(img);
  });

  const inlinePlans = plan.filter((p) => p.type === 'inline');

  inlinePlans.forEach((slotPlan) => {
    // Strict safety rule: Only replace if generation has succeeded (SUCCESS)
    if (!isSlotSuccess(slotPlan)) {
      return;
    }

    // Match by original index first among true inlineImgElements, then fallback to old_src
    let targetImg: HTMLElement | null = null;
    if (slotPlan.original_index !== undefined && inlineImgElements[slotPlan.original_index]) {
      targetImg = inlineImgElements[slotPlan.original_index];
    } else {
      targetImg = inlineImgElements.find((img) => img.getAttribute('src') === slotPlan.old_src) || null;
    }

    if (targetImg) {
      const finalFilename = slotPlan.final_filename || slotPlan.suggested_filename || `${slotPlan.slot_id}.webp`;
      const newSrc = `${prefix}${finalFilename}`;
      const finalAlt = slotPlan.alt_text || slotPlan.alt || slotPlan.suggested_alt || '';
      const finalTitle = slotPlan.title || '';

      targetImg.setAttribute('src', newSrc);
      if (finalAlt) {
        targetImg.setAttribute('alt', finalAlt);
      }
      if (finalTitle) {
        targetImg.setAttribute('title', finalTitle);
      }

      // Check if caption or credit display policy is enabled
      const showCaption = slotPlan.show_caption && slotPlan.caption;
      const showCreditAllowed = Boolean(
        options.showCreditInArticle ?? options.brandProfile?.show_credit_in_article ?? false
      );
      const effectiveCredit =
        slotPlan.credit || options.brandProfile?.default_credit || options.brandProfile?.brand_name || '';
      const showCredit = showCreditAllowed && Boolean(slotPlan.show_credit !== false) && Boolean(effectiveCredit);

      if (showCaption || showCredit) {
        const captionText = showCaption ? slotPlan.caption : '';
        const creditText = showCredit ? effectiveCredit : '';

        // Check if targetImg already has a parent <figure>
        let figureParent: HTMLElement | null = null;
        let p = targetImg.parentNode as HTMLElement;
        if (p && p.tagName && p.tagName.toLowerCase() === 'figure') {
          figureParent = p;
        }

        const figcaptionContent = [
          captionText ? `<span class="image-caption">${escapeHtml(captionText)}</span>` : '',
          creditText ? `<span class="image-credit">Nguồn: ${escapeHtml(creditText)}</span>` : '',
        ].filter(Boolean).join(' ');

        if (figureParent) {
          const existingFigcaption = figureParent.querySelector('figcaption');
          if (existingFigcaption) {
            existingFigcaption.set_content(figcaptionContent);
          } else {
            figureParent.insertAdjacentHTML('beforeend', `<figcaption class="article-figcaption">${figcaptionContent}</figcaption>`);
          }
        }
      }
    }
  });

  // Synchronize Schema.org JSON-LD Article/BlogPosting image if featured image succeeded
  if (featuredPlan && isSlotSuccess(featuredPlan)) {
    const finalFilename = featuredPlan.final_filename || featuredPlan.suggested_filename;
    const newFeaturedSrc = `${prefix}${finalFilename}`;

    const jsonLdScripts = root.querySelectorAll('script[type="application/ld+json"]');
    jsonLdScripts.forEach((script) => {
      try {
        const rawJson = script.text.trim();
        if (!rawJson) return;
        const parsedJson = JSON.parse(rawJson);
        let modified = false;

        const updateLdObject = (obj: any) => {
          if (!obj || typeof obj !== 'object') return;
          if (obj['@type'] && /Article|BlogPosting|NewsArticle|WebPage/i.test(String(obj['@type']))) {
            if (obj.image) {
              if (typeof obj.image === 'string') {
                obj.image = newFeaturedSrc;
                modified = true;
              } else if (Array.isArray(obj.image) && obj.image.length > 0) {
                obj.image[0] = newFeaturedSrc;
                modified = true;
              } else if (typeof obj.image === 'object' && obj.image.url) {
                obj.image.url = newFeaturedSrc;
                modified = true;
              }
            }
            if (obj.primaryImageOfPage) {
              if (typeof obj.primaryImageOfPage === 'string') {
                obj.primaryImageOfPage = newFeaturedSrc;
                modified = true;
              } else if (typeof obj.primaryImageOfPage === 'object' && obj.primaryImageOfPage.url) {
                obj.primaryImageOfPage.url = newFeaturedSrc;
                modified = true;
              }
            }
          }
          for (const key of Object.keys(obj)) {
            if (typeof obj[key] === 'object') {
              updateLdObject(obj[key]);
            }
          }
        };

        updateLdObject(parsedJson);
        if (modified) {
          script.set_content(JSON.stringify(parsedJson, null, 2));
        }
      } catch {
        // Safe ignore on malformed JSON-LD scripts
      }
    });
  }

  return root.toString();
}

/**
 * Complete, fast local analysis and slot planning without network dependency.
 * Guaranteed to never fail or throw JSON syntax errors.
 */
export function analyzeArticleLocally(
  htmlSource: string,
  options?: { articleUrl?: string; articleTitle?: string }
): ArticleAnalysis {
  const parsed = parseArticleHtml(htmlSource);
  const { title, excerpt, slug: parsedSlug, contentSelector, images, featuredImageInfo } = parsed;

  const effectiveTitle =
    typeof options?.articleTitle === 'string' && options.articleTitle.trim()
      ? options.articleTitle.trim()
      : title || 'Bài viết kinh tế thuế';

  const slug = deriveEffectiveArticleSlug({
    articleUrl: options?.articleUrl,
    articleTitle: effectiveTitle,
    parsedSlug,
    fallback: 'bai-viet-kinh-te-thue',
  });

  const slots: ImageSlotPlan[] = [];

  // Slot 1: Featured Image (16:9, ALWAYS GENERATE_AI)
  const featuredSlot: ImageSlotPlan = {
    slot_id: 'feature-1',
    type: 'featured',
    old_src: featuredImageInfo?.old_src || '',
    old_alt: featuredImageInfo?.old_alt || '',
    classification: 'REPLACE_AI',
    processing_strategy: 'GENERATE_AI',
    processing_strategy_status: 'recommended',
    confidence: 'high',
    source_retrieval_status: 'not_attempted',
    visual_analysis_status: 'unavailable',
    visual_analysis_available: false,
    reason: 'Ảnh đại diện chính (Featured Image) đại diện cho toàn bộ chủ đề bài viết.',
    suggested_concept: `Chuyên viên kế toán doanh nghiệp Việt Nam làm việc tại văn phòng hiện đại, ánh sáng tự nhiên, liên quan chủ đề: "${effectiveTitle}"`,
    generation_prompt: `High quality editorial journalism photo of a professional Vietnamese corporate accountant working in a contemporary office in Vietnam, daylight, shallow depth of field, 50mm f/2.8 lens, related to: "${effectiveTitle}".`,
    suggested_filename: generateFeaturedFilename(slug),
    suggested_alt: cleanEditorialAltText(
      `Chuyên viên tài chính kế toán rà soát chứng từ liên quan ${effectiveTitle.toLowerCase()}`,
      effectiveTitle
    ),
    aspect_ratio: '16:9',
    selected: true,
    status: 'pending',
    title: generateEditorialTitle('', '', effectiveTitle, 0),
    caption: generateEditorialCaption('', '', effectiveTitle),
    credit: 'Kế Toán Diệu Tâm',
    show_caption: false,
    show_credit: false,
    width: 1280,
    height: 720,
    mime_type: 'image/webp',
    brand_applied: true,
    brand_profile: 'Kế Toán Diệu Tâm',
    generation_method: 'vertex_ai',
  };
  slots.push(featuredSlot);

  // Inline slots
  images.forEach((img, idx) => {
    const slotId = `inline-${idx + 1}`;
    const cleanImgSrc = (img.old_src || '').toLowerCase();
    const cleanImgAlt = (img.old_alt || '').toLowerCase();
    const selfText = `${cleanImgSrc} ${cleanImgAlt}`;

    const isSensitive =
      /bản chụp|ban chup|bản scan|ban scan|scanned|scan-form|scanned-form|scan_\d/i.test(selfText) ||
      /dấu mộc|dau moc|mộc đỏ|moc do|con dấu|con dau|chữ ký|chu ky|signature|seal|stamp/i.test(selfText) ||
      /mẫu số\s*\d+|mẫu số\s*0\d|mau-so-|mau_so_|tờ khai số|to-khai-|to_khai_/i.test(selfText) ||
      /bảng số liệu|bảng thống kê|bảng so sánh|bảng tổng hợp|bang-so-lieu|bang-bieu|bang_bieu|table-vat-comparison|biểu đồ|bieu-do|chart|graph|diagram|sơ đồ quy trình|flowchart/i.test(selfText) ||
      /screenshot|chụp màn hình|chup-man-hinh|giao diện/i.test(selfText) ||
      /(\/logo\.|logo-|-logo|\/icons\/|brand-logo)/i.test(cleanImgSrc);

    const isExplicitStockOrConcept =
      /picsum\.photos|unsplash\.com|pexels\.com|pixabay\.com|placeholder|via\.placeholder|loremflickr|dummyimage/i.test(cleanImgSrc) ||
      /ảnh minh họa|anh minh hoa|ảnh stock|anh stock|ảnh tư liệu|stock photo|illustration|concept/i.test(selfText) ||
      /nhân viên|chuyên viên|kế toán ngồi|trao đổi|thảo luận|họp bàn|bắt tay|văn phòng|bàn làm việc/i.test(selfText);

    let strategy: 'GENERATE_AI' | 'REBUILD_FROM_SOURCE' | 'NEEDS_DECISION' = 'GENERATE_AI';
    let classification: ImageClassification = 'REPLACE_AI';
    let reason = 'Ảnh minh họa dạng stock/concept, tạo hình mới bằng AI.';
    let isSelected = true;
    let confidence: 'high' | 'medium' | 'low' = 'high';

    if (isSensitive) {
      strategy = 'REBUILD_FROM_SOURCE';
      classification = 'KEEP_ORIGINAL';
      reason = 'Biểu mẫu hoặc tài liệu nguồn: tạo bản mới từ ảnh gốc (bảo toàn số liệu, chuyển WebP).';
      isSelected = true; // Every existing image must end with a new asset!
      confidence = 'high';
    } else if (!isExplicitStockOrConcept && img.heuristic_confidence === 'low') {
      strategy = 'NEEDS_DECISION';
      classification = 'MANUAL_REVIEW';
      reason = 'Cần biên tập viên chọn: Tạo hình mới bằng AI hoặc Tạo bản mới từ ảnh gốc.';
      isSelected = false; // editor must choose first
      confidence = 'low';
    }

    const cleanAlt = cleanEditorialAltText(img.suggested_alt, img.context_heading || title);
    const editorialTitle = generateEditorialTitle(img.context_heading, cleanAlt, title, idx);
    const editorialCaption = generateEditorialCaption(img.context_heading, img.context_before, title);

    slots.push({
      slot_id: slotId,
      type: 'inline',
      old_src: img.old_src,
      old_alt: img.old_alt,
      classification,
      processing_strategy: strategy,
      processing_strategy_status: strategy === 'NEEDS_DECISION' ? 'needs_decision' : 'recommended',
      confidence,
      source_retrieval_status: img.old_src?.startsWith('data:') ? 'success' : 'not_attempted',
      visual_analysis_status: 'unavailable',
      visual_analysis_available: false,
      reason,
      context_heading: img.context_heading,
      context_paragraph: img.context_paragraph,
      context_before: img.context_before,
      context_after: img.context_after,
      suggested_concept: img.suggested_concept,
      generation_prompt: img.generation_prompt,
      suggested_filename: generateInlineFilename(slug, img.suggested_filename_suffix, idx),
      suggested_alt: cleanAlt,
      aspect_ratio: '4:3',
      selected: isSelected,
      status: 'pending',
      original_index: img.index,
      is_sensitive_source: isSensitive,
      title: editorialTitle,
      caption: editorialCaption,
      credit: 'Kế Toán Diệu Tâm',
      show_caption: false,
      show_credit: false,
      width: 800,
      height: 600,
      mime_type: 'image/webp',
      brand_applied: true,
      brand_profile: 'Kế Toán Diệu Tâm',
      generation_method: strategy === 'REBUILD_FROM_SOURCE' ? 'deterministic_rebuild' : 'vertex_ai',
    });
  });

  // Ensure unique filenames across slots
  slots[0].suggested_filename = generateFeaturedFilename(slug);
  const rawFilenames = slots.map((s, idx) => {
    if (idx === 0) return slots[0].suggested_filename;
    return s.suggested_filename || `inline-${idx}.webp`;
  });
  const uniqueFilenames = makeUniqueFilenames(rawFilenames);
  slots.forEach((s, idx) => {
    s.suggested_filename = uniqueFilenames[idx];
    s.final_filename = uniqueFilenames[idx];
    s.filename = uniqueFilenames[idx];
    s.alt = s.suggested_alt;
    s.alt_text = s.suggested_alt;
    s.concept = s.suggested_concept;
    if (!s.generation_prompt || s.generation_prompt.includes('50mm lens')) {
      if (isDocumentOrTableVisual(s)) {
        const docPrompt = buildDocumentTablePrompt(s.context_heading || s.title || effectiveTitle);
        s.generation_prompt = docPrompt.generation_prompt;
        if (!s.concept || s.concept.includes('văn phòng hiện đại')) {
          s.concept = docPrompt.concept;
          s.suggested_concept = docPrompt.concept;
        }
      } else if (!s.generation_prompt) {
        s.generation_prompt = `Documentary editorial photography of a Vietnamese finance accountant in a modern office in Vietnam, natural light, 50mm lens.`;
      }
    }
  });

  const replaceable_count = slots.filter((s) => s.processing_strategy === 'GENERATE_AI').length;
  const rebuild_source_count = slots.filter((s) => s.processing_strategy === 'REBUILD_FROM_SOURCE').length;
  const needs_decision_count = slots.filter((s) => s.processing_strategy === 'NEEDS_DECISION').length;

  return {
    title: effectiveTitle,
    effective_article_title: effectiveTitle,
    excerpt,
    slug,
    content_container_selector: contentSelector,
    total_inline_images: images.length,
    replaceable_count,
    rebuild_source_count,
    keep_count: 0, // KEEP_ORIGINAL is no longer a successful final article-image state
    manual_count: needs_decision_count,
    needs_decision_count,
    ignore_count: 0,
    plan: slots,
  };
}
