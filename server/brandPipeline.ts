import sharp, { Sharp } from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { safeFetchImageBuffer } from './sourceDiscovery.js';

const __filenameSafe =
  typeof __filename !== 'undefined'
    ? __filename
    : typeof import.meta.url === 'string'
    ? fileURLToPath(import.meta.url)
    : process.cwd();
const __dirnameSafe =
  typeof __dirname !== 'undefined' ? __dirname : path.dirname(__filenameSafe);

export interface BrandConfigInput {
  brand_name?: string;
  logo_url?: string;
  watermark_mode?: 'logo_and_text' | 'logo_only' | 'text_only' | 'none';
  position?:
    | 'bottom-right'
    | 'bottom-left'
    | 'top-right'
    | 'top-left'
    | 'bottom-center'
    | 'bottom_right'
    | 'bottom_left'
    | 'top_right'
    | 'top_left'
    | 'bottom_center';
  logo_size?: 'small' | 'medium' | 'large';
  opacity?: number;
  edge_padding?: number;
  padding?: number;
  apply_to?: 'all' | 'featured_only' | 'inline_only';
  default_credit?: string;
  show_credit_in_article?: boolean;
  enabled?: boolean;
  // legacy aliases
  show_logo?: boolean;
  show_brand_name?: boolean;
  apply_to_featured?: boolean;
  apply_to_ai_inline?: boolean;
  apply_to_source_docs?: boolean;
}

/**
 * Built-in crisp SVG logo for Kế Toán Diệu Tâm (Lotus & Scale Balance Motif)
 * Retained for backward-compatibility only.
 */
export const DEFAULT_BRAND_LOGO_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120">
  <defs>
    <linearGradient id="logoBg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0F766E" />
      <stop offset="100%" stop-color="#0D9488" />
    </linearGradient>
  </defs>
  <rect width="120" height="120" rx="28" fill="url(#logoBg)" />
  <!-- Minimalist Geometric Emblem (Scales & Diamond) -->
  <path d="M60 26 L82 48 L60 70 L38 48 Z" fill="#FFFFFF" fill-opacity="0.95" />
  <circle cx="60" cy="48" r="7" fill="#0F766E" />
  <!-- Balance Beam -->
  <path d="M30 84 Q60 76 90 84" stroke="#FFFFFF" stroke-width="4" stroke-linecap="round" fill="none" />
  <circle cx="34" cy="84" r="5" fill="#FFFFFF" />
  <circle cx="86" cy="84" r="5" fill="#FFFFFF" />
  <path d="M60 70 L60 88" stroke="#FFFFFF" stroke-width="4" stroke-linecap="round" />
</svg>
`.trim();

// Cache for official logo buffer and metadata
let cachedOfficialLogoBuffer: Buffer | null = null;
let officialLogoResolvedPath: string | null = null;
let officialLogoMetadata: { width: number; height: number } | null = null;

// Cache prepared overlay buffers by key: `${targetW}_${targetH}_${opacity}`
const preparedOverlayCache = new Map<string, Buffer>();

/**
 * Resolves the filesystem path to the official KTDT logo across all runtime environments:
 * - Local development (cwd is project root)
 * - Compiled build (node dist/server.cjs)
 * - Cloud Run container deployment
 */
export function resolveOfficialLogoPath(): string | null {
  if (officialLogoResolvedPath && fs.existsSync(officialLogoResolvedPath)) {
    return officialLogoResolvedPath;
  }

  const candidatePaths = [
    path.resolve(process.cwd(), 'server/assets/ktdt-logo.png'),
    path.resolve(process.cwd(), 'dist/server/assets/ktdt-logo.png'),
    path.resolve(__dirnameSafe, '../server/assets/ktdt-logo.png'),
    path.resolve(__dirnameSafe, 'server/assets/ktdt-logo.png'),
    path.resolve(__dirnameSafe, 'assets/ktdt-logo.png'),
    path.resolve(__dirnameSafe, '../dist/server/assets/ktdt-logo.png'),
  ];

  for (const candidate of candidatePaths) {
    try {
      if (fs.existsSync(candidate)) {
        officialLogoResolvedPath = candidate;
        return candidate;
      }
    } catch {
      // Continue search
    }
  }

  return null;
}

/**
 * Returns the cached in-memory Buffer of the official KTDT logo.
 * Does not re-read disk on every request.
 */
export function getOfficialLogoBuffer(): Buffer | null {
  if (cachedOfficialLogoBuffer) {
    return cachedOfficialLogoBuffer;
  }

  const logoPath = resolveOfficialLogoPath();
  if (!logoPath) {
    console.warn('[BrandPipeline] Official KTDT logo not found in candidate paths. Watermark will be skipped.');
    return null;
  }

  try {
    const buffer = fs.readFileSync(logoPath);
    if (buffer && buffer.length > 0) {
      cachedOfficialLogoBuffer = buffer;
      console.log(`[BrandPipeline] Successfully loaded official KTDT logo from: ${logoPath} (${buffer.length} bytes)`);
      return cachedOfficialLogoBuffer;
    }
  } catch (err) {
    console.warn('[BrandPipeline] Failed to read official KTDT logo from disk:', err);
  }

  return null;
}

/**
 * Retrieves official logo pixel dimensions.
 */
export async function getOfficialLogoMetadata(): Promise<{ width: number; height: number } | null> {
  if (officialLogoMetadata) {
    return officialLogoMetadata;
  }
  const buf = getOfficialLogoBuffer();
  if (!buf) return null;

  try {
    const meta = await sharp(buf).metadata();
    if (meta.width && meta.height) {
      officialLogoMetadata = { width: meta.width, height: meta.height };
      return officialLogoMetadata;
    }
  } catch (err) {
    console.warn('[BrandPipeline] Failed to read official logo metadata:', err);
  }
  return null;
}

/**
 * Prepares a transparent PNG overlay buffer with the requested dimensions and opacity.
 * Adds a soft silhouette drop shadow to ensure legibility on both bright and dark backgrounds.
 * Caches prepared overlays in memory for instant reuse.
 */
async function getPreparedLogoOverlay(
  targetW: number,
  targetH: number,
  opacity: number
): Promise<{ overlay: Buffer; width: number; height: number } | null> {
  const cacheKey = `${targetW}_${targetH}_${opacity.toFixed(2)}`;
  const cached = preparedOverlayCache.get(cacheKey);
  if (cached) {
    return { overlay: cached, width: targetW + 4, height: targetH + 4 };
  }

  const logoBuf = getOfficialLogoBuffer();
  if (!logoBuf) return null;

  try {
    // 1. Resize maintaining exact aspect ratio, no crop, no stretch, transparent bg
    const resizedLogo = await sharp(logoBuf)
      .resize(targetW, targetH, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png()
      .toBuffer();

    const { data, info } = await sharp(resizedLogo)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    // 2. Modulate alpha channel for logo opacity
    const logoData = Buffer.from(data);
    for (let i = 3; i < logoData.length; i += 4) {
      logoData[i] = Math.round(logoData[i] * opacity);
    }
    const logoWithOpacity = await sharp(logoData, { raw: info })
      .png()
      .toBuffer();

    // 3. Subtle soft silhouette shadow (pure logo shape shadow, no box/badge)
    const shadowData = Buffer.alloc(data.length);
    for (let i = 0; i < data.length; i += 4) {
      shadowData[i] = 0;
      shadowData[i + 1] = 0;
      shadowData[i + 2] = 0;
      shadowData[i + 3] = Math.round(data[i + 3] * 0.35);
    }
    const blurredShadow = await sharp(shadowData, { raw: info })
      .blur(1.5)
      .png()
      .toBuffer();

    // 4. Combine shadow and logo into a single transparent overlay with 2px padding
    const overlayWidth = info.width + 4;
    const overlayHeight = info.height + 4;

    const overlay = await sharp({
      create: {
        width: overlayWidth,
        height: overlayHeight,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .composite([
        { input: blurredShadow, left: 1, top: 2 },
        { input: logoWithOpacity, left: 1, top: 1 },
      ])
      .png()
      .toBuffer();

    preparedOverlayCache.set(cacheKey, overlay);
    return { overlay, width: overlayWidth, height: overlayHeight };
  } catch (err) {
    console.warn('[BrandPipeline] Error preparing official logo overlay:', err);
    return null;
  }
}

/**
 * Helper to parse buffer from data URL or raw buffer
 */
export function bufferFromDataUrl(dataUrl: string): Buffer {
  if (dataUrl.startsWith('data:')) {
    const base64Part = dataUrl.split(',')[1] || '';
    return Buffer.from(base64Part, 'base64');
  }
  return Buffer.from(dataUrl, 'base64');
}

/**
 * Deterministic Server-Side Branding Pipeline using Sharp
 */
export async function applyBrandingWithSharp(
  inputBuffer: Buffer,
  brandConfig: BrandConfigInput = {},
  options: {
    slotType?: 'featured' | 'inline';
    isSourceDoc?: boolean;
    targetWidth?: number;
    targetHeight?: number;
  } = {}
): Promise<{
  buffer: Buffer;
  mimeType: 'image/webp';
  width: number;
  height: number;
  brandApplied: boolean;
}> {
  const isFeatured = options.slotType === 'featured';
  const isSourceDoc = Boolean(options.isSourceDoc);

  // 1. Initial image load
  let sharpInstance = sharp(inputBuffer);
  let metadata = await sharpInstance.metadata();

  const originalWidth = metadata.width || (isFeatured ? 1280 : 800);
  const originalHeight = metadata.height || (isFeatured ? 720 : 600);

  // Determine target dimensions
  const finalWidth = options.targetWidth || (isFeatured ? 1280 : Math.min(originalWidth, 1200));
  const finalHeight = options.targetHeight || (isFeatured ? 720 : Math.round((finalWidth / originalWidth) * originalHeight));

  // Resize and ensure base image is ready
  sharpInstance = sharpInstance.resize(finalWidth, finalHeight, {
    fit: 'inside',
    withoutEnlargement: true,
  });

  // Calculate real output size
  const resizeScale = Math.min(
    finalWidth / originalWidth,
    finalHeight / originalHeight,
    1
  );
  const currentW = Math.max(1, Math.round(originalWidth * resizeScale));
  const currentH = Math.max(1, Math.round(originalHeight * resizeScale));

  // Source documents have an independent protection policy: normal inline scope never enables them.
  // They receive a footer only when the editor explicitly opts in.
  if (isSourceDoc) {
    const shouldApplySourceBrand =
      brandConfig.enabled !== false && brandConfig.apply_to_source_docs === true;
    return applySourceDocumentBranding(
      sharpInstance,
      currentW,
      currentH,
      shouldApplySourceBrand,
      true,
      brandConfig.logo_url,
      false,
      brandConfig.brand_name || 'Kế Toán Diệu Tâm',
      0.85
    );
  }

  // 2. PRODUCTION BRAND POLICY FOR AI-GENERATED IMAGES (FEATURED & INLINE):
  // - watermark_mode = logo_only
  // - show_logo = true
  // - show_brand_name = false (NO SVG <text>, NO separate text, NO dark badge)
  // - apply_to = all
  // - official logo = server/assets/ktdt-logo.png
  // - Browser cannot disable, change to text_only/none, or substitute logo
  let brandApplied = false;

  const officialMeta = await getOfficialLogoMetadata();
  if (!officialMeta) {
    console.warn('[BrandPipeline] Official KTDT logo not available or failed to load. Skipping watermark application gracefully without crash or fallback.');
  } else {
    try {
      // Sizing guidelines:
      // INLINE: width ~14% of image width, opacity 0.75, bottom-right, edge padding 24px
      // FEATURED: width ~17% of image width, opacity 0.90, bottom-right, edge padding 28px
      const widthRatio = isFeatured ? 0.17 : 0.14;
      const targetOpacity = isFeatured ? 0.90 : 0.75;
      const edgePadding = isFeatured ? 28 : 24;

      const targetLogoW = Math.max(48, Math.min(Math.round(currentW * widthRatio), Math.round(currentW * 0.4)));
      const logoAspect = officialMeta.height / officialMeta.width;
      const targetLogoH = Math.max(32, Math.round(targetLogoW * logoAspect));

      const prepared = await getPreparedLogoOverlay(targetLogoW, targetLogoH, targetOpacity);
      if (prepared) {
        const { overlay, width: overlayW, height: overlayH } = prepared;

        // Position: Bottom-Right with edge padding
        const left = Math.max(0, currentW - overlayW - edgePadding);
        const top = Math.max(0, currentH - overlayH - edgePadding);

        sharpInstance = sharpInstance.composite([
          {
            input: overlay,
            left: Math.round(left),
            top: Math.round(top),
          },
        ]);
        brandApplied = true;
      } else {
        console.warn('[BrandPipeline] Failed to create official logo overlay; proceeding without watermark.');
      }
    } catch (overlayErr) {
      console.warn('[BrandPipeline] Error compositing official logo watermark:', overlayErr);
      brandApplied = false;
    }
  }

  // 4. Output optimized WebP
  const webpBuffer = await sharpInstance.webp({ quality: 90, effort: 4 }).toBuffer();
  const finalMeta = await sharp(webpBuffer).metadata();

  return {
    buffer: webpBuffer,
    mimeType: 'image/webp',
    width: finalMeta.width || currentW,
    height: finalMeta.height || currentH,
    brandApplied,
  };
}

async function applySourceDocumentBranding(
  sharpInstance: Sharp,
  currentW: number,
  currentH: number,
  shouldApplyBrand: boolean,
  wantsLogo: boolean,
  logoDataUrl: string | undefined,
  showBrandName: boolean,
  brandName: string,
  opacity: number
): Promise<{
  buffer: Buffer;
  mimeType: 'image/webp';
  width: number;
  height: number;
  brandApplied: boolean;
}> {
  let footerLogoBase64 = '';
  if (shouldApplyBrand && wantsLogo) {
    const rawLogoBuf = logoDataUrl ? bufferFromDataUrl(logoDataUrl) : getOfficialLogoBuffer();
    if (rawLogoBuf) {
      try {
        footerLogoBase64 = (
          await sharp(rawLogoBuf)
            .resize(28, 28, {
              fit: 'contain',
              background: { r: 0, g: 0, b: 0, alpha: 0 },
            })
            .png()
            .toBuffer()
        ).toString('base64');
      } catch (err) {
        console.warn('Could not process source-document logo; skipping logo:', err);
      }
    }
  }

  const showLogo = Boolean(footerLogoBase64);
  const brandApplied = shouldApplyBrand && (showLogo || showBrandName);
  let output = sharpInstance;

  if (brandApplied) {
    const footerH = 46;
    output = output.extend({ bottom: footerH, background: '#0f172a' });
    const footerSvg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="${currentW}" height="${footerH}" viewBox="0 0 ${currentW} ${footerH}">
        <rect width="${currentW}" height="${footerH}" fill="#0f172a" />
        <line x1="0" y1="0" x2="${currentW}" y2="0" stroke="#334155" stroke-width="1" />
        <g transform="translate(16, 9)">
          ${showLogo ? `<image href="data:image/png;base64,${footerLogoBase64}" width="28" height="28" />` : ''}
          ${showBrandName ? `
            <text x="${showLogo ? 38 : 0}" y="19" fill="#f8fafc" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="13" font-weight="600" opacity="${opacity}">
              ${escapeXml(brandName)}
            </text>
          ` : ''}
        </g>
      </svg>
    `.trim();
    output = output.composite([{ input: Buffer.from(footerSvg), top: currentH, left: 0 }]);
  }

  const webpBuffer = await output.webp({ quality: 92, effort: 4 }).toBuffer();
  const resultMeta = await sharp(webpBuffer).metadata();
  return {
    buffer: webpBuffer,
    mimeType: 'image/webp',
    width: resultMeta.width || currentW,
    height: resultMeta.height || currentH,
    brandApplied,
  };
}

/**
 * Rebuild source image deterministically:
 * Fetches original image or loads buffer, resizes safely, converts to WebP,
 * and adds clean branded footer frame outside content if enabled.
 * 
 * Strict fail-safe: Throws error if source image cannot be loaded.
 * Never creates synthetic SVG, document mock, or replacement graphics.
 */
export async function rebuildSourceImage(
  sourceUrlOrData: string,
  brandConfig: BrandConfigInput = {},
  slotInfo?: {
    slot_id?: string;
    suggested_filename?: string;
    title?: string;
    aspect_ratio?: string;
  }
): Promise<{
  imageDataUrl: string;
  mimeType: 'image/webp';
  width: number;
  height: number;
  brandApplied: boolean;
}> {
  let sourceBuffer: Buffer | null = null;

  const trimmedSource = (sourceUrlOrData || '').trim();
  if (!trimmedSource) {
    throw new Error(
      'Không thể tải ảnh nguồn gốc. REBUILD_FROM_SOURCE đã dừng để tránh tạo nội dung thay thế không chính xác.'
    );
  }

  if (trimmedSource.startsWith('data:')) {
    try {
      sourceBuffer = bufferFromDataUrl(trimmedSource);
    } catch (e: any) {
      throw new Error(
        `Không thể tải ảnh nguồn gốc từ dữ liệu data URL: ${e?.message || 'dữ liệu không hợp lệ'}. REBUILD_FROM_SOURCE đã dừng để tránh tạo nội dung thay thế không chính xác.`
      );
    }
  } else if (trimmedSource.startsWith('http://') || trimmedSource.startsWith('https://')) {
    try {
      const fetched = await safeFetchImageBuffer(trimmedSource, 8000);
      if (fetched?.buffer && fetched.buffer.length > 0) {
        sourceBuffer = fetched.buffer;
      }
    } catch (e: any) {
      console.warn(`Could not fetch source image safely from ${trimmedSource}:`, e);
      throw new Error(
        `Không thể tải ảnh nguồn gốc từ URL (${e?.message || 'kết nối thất bại'}). REBUILD_FROM_SOURCE đã dừng để tránh tạo nội dung thay thế không chính xác.`
      );
    }
  } else {
    throw new Error(
      'Nguồn ảnh không hợp lệ (không phải HTTP/HTTPS hoặc data URL hợp lệ). REBUILD_FROM_SOURCE đã dừng để tránh tạo nội dung thay thế không chính xác.'
    );
  }

  if (!sourceBuffer || sourceBuffer.length === 0) {
    throw new Error(
      'Không thể tải ảnh nguồn gốc. REBUILD_FROM_SOURCE đã dừng để tránh tạo nội dung thay thế không chính xác.'
    );
  }

  // Apply safe source doc branding with Sharp
  const result = await applyBrandingWithSharp(sourceBuffer, brandConfig, {
    slotType: 'inline',
    isSourceDoc: true,
  });

  const base64 = result.buffer.toString('base64');
  return {
    imageDataUrl: `data:image/webp;base64,${base64}`,
    mimeType: 'image/webp',
    width: result.width,
    height: result.height,
    brandApplied: result.brandApplied,
  };
}

function escapeXml(unsafe: string): string {
  return unsafe.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
      default: return c;
    }
  });
}
