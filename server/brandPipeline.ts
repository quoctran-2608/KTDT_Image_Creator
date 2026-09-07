import sharp, { Sharp } from 'sharp';
import { safeFetchImageBuffer } from './sourceDiscovery.js';

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
 * Clean vector with transparent background
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
  const brandName = (brandConfig.brand_name || '').trim();
  const hasUploadedLogo = /^data:image\/[a-zA-Z0-9.+_-]+;base64,/i.test(
    brandConfig.logo_url || ''
  );

  // Watermark mode resolution
  let watermarkMode: 'logo_and_text' | 'logo_only' | 'text_only' | 'none' = 'logo_and_text';
  if (brandConfig.watermark_mode) {
    watermarkMode = brandConfig.watermark_mode;
  } else if (brandConfig.show_logo === false && brandConfig.show_brand_name === false) {
    watermarkMode = 'none';
  } else if (brandConfig.show_logo === false) {
    watermarkMode = 'text_only';
  } else if (brandConfig.show_brand_name === false) {
    watermarkMode = 'logo_only';
  }

  const isEnabled = brandConfig.enabled !== false && watermarkMode !== 'none';

  // A logo is only valid when the editor supplied an exact image data URL.
  // Never synthesize, redraw, or fall back to a built-in logo in production output.
  const wantsLogo = watermarkMode === 'logo_and_text' || watermarkMode === 'logo_only';
  const showBrandName =
    isEnabled &&
    (watermarkMode === 'logo_and_text' || watermarkMode === 'text_only') &&
    Boolean(brandName);

  const rawPosition = (brandConfig.position || 'bottom-right').replace('_', '-');
  const position = (
    ['bottom-right', 'bottom-left', 'top-right', 'top-left', 'bottom-center'].includes(rawPosition)
      ? rawPosition
      : 'bottom-right'
  ) as 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left' | 'bottom-center';

  const logoSize = brandConfig.logo_size || 'medium';
  const opacity = Math.min(Math.max(brandConfig.opacity ?? 0.85, 0.1), 1.0);
  const edgePadding = Math.max(brandConfig.padding ?? brandConfig.edge_padding ?? 24, 8);

  const isFeatured = options.slotType === 'featured';
  const isSourceDoc = Boolean(options.isSourceDoc);

  // Determine whether branding applies to generated featured and inline images.
  const hasExplicitScope = Boolean(brandConfig.apply_to);
  const applyTo = brandConfig.apply_to || 'all';
  let shouldApplyBrand = isEnabled;
  if (hasExplicitScope) {
    shouldApplyBrand = isEnabled &&
      (applyTo === 'all' || (isFeatured ? applyTo === 'featured_only' : applyTo === 'inline_only'));
  } else if (isFeatured) {
    shouldApplyBrand = isEnabled && brandConfig.apply_to_featured !== false;
  } else {
    shouldApplyBrand = isEnabled && brandConfig.apply_to_ai_inline !== false;
  }

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

  // Sharp metadata does not resolve resize transforms. Calculate the real output size
  // so a watermark composite never exceeds a small source image with withoutEnlargement.
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
      isEnabled && brandConfig.apply_to_source_docs === true;
    return applySourceDocumentBranding(
      sharpInstance,
      currentW,
      currentH,
      shouldApplySourceBrand,
      wantsLogo,
      hasUploadedLogo ? brandConfig.logo_url : undefined,
      showBrandName,
      brandName,
      opacity
    );
  }

  // 2. For AI-Generated Images (Featured & Inline): Apply clean brand overlay badge.
  const baseSizeConfig = {
      small: { logoH: 26, fontSize: 12, padY: 6, padX: 10, gap: 8 },
      medium: { logoH: 34, fontSize: 13, padY: 8, padX: 14, gap: 10 },
      large: { logoH: 42, fontSize: 15, padY: 10, padX: 18, gap: 12 },
    }[logoSize];
  const textWidthAtBaseSize = showBrandName
    ? Math.round(brandName.length * (baseSizeConfig.fontSize * 0.65))
    : 0;
  const baseBadgeW =
    (wantsLogo ? baseSizeConfig.logoH : 0) +
    (wantsLogo && showBrandName ? baseSizeConfig.gap : 0) +
    textWidthAtBaseSize +
    baseSizeConfig.padX * 2;
  const baseBadgeH = baseSizeConfig.logoH + baseSizeConfig.padY * 2;
  const badgeScale = Math.min(1, currentW / baseBadgeW, currentH / baseBadgeH);
  const sizeConfig = {
    logoH: Math.max(1, Math.floor(baseSizeConfig.logoH * badgeScale)),
    fontSize: Math.max(1, Math.floor(baseSizeConfig.fontSize * badgeScale)),
    padY: Math.max(1, Math.floor(baseSizeConfig.padY * badgeScale)),
    padX: Math.max(1, Math.floor(baseSizeConfig.padX * badgeScale)),
    gap: Math.max(1, Math.floor(baseSizeConfig.gap * badgeScale)),
  };
  const safeEdgePadding = Math.min(
    Math.max(Math.floor(edgePadding * badgeScale), 0),
    Math.max(0, Math.floor(Math.min(currentW, currentH) / 8))
  );

  let processedLogoPng: Buffer | null = null;
  if (shouldApplyBrand && wantsLogo && hasUploadedLogo) {
    try {
      processedLogoPng = await sharp(bufferFromDataUrl(brandConfig.logo_url!))
        .resize({
          width: sizeConfig.logoH,
          height: sizeConfig.logoH,
          fit: 'contain',
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .png()
        .toBuffer();
    } catch (err) {
      console.warn('Could not process uploaded logo; skipping logo watermark:', err);
    }
  }
  const showLogo = Boolean(processedLogoPng);
  const brandApplied = shouldApplyBrand && (showLogo || showBrandName);

  if (brandApplied) {

    // Calculate approximate text width for background card
    const approxTextWidth = showBrandName ? Math.round(brandName.length * (sizeConfig.fontSize * 0.65)) : 0;
    const badgeW = (showLogo ? sizeConfig.logoH : 0) +
      (showLogo && showBrandName ? sizeConfig.gap : 0) +
      approxTextWidth +
      sizeConfig.padX * 2;
    const badgeH = sizeConfig.logoH + sizeConfig.padY * 2;

    // Calculate badge coordinates according to safe area and position
    let badgeLeft = safeEdgePadding;
    let badgeTop = safeEdgePadding;

    if (position === 'bottom-right') {
      badgeLeft = Math.max(currentW - badgeW - safeEdgePadding, 0);
      badgeTop = Math.max(currentH - badgeH - safeEdgePadding, 0);
    } else if (position === 'bottom-left') {
      badgeLeft = safeEdgePadding;
      badgeTop = Math.max(currentH - badgeH - safeEdgePadding, 0);
    } else if (position === 'bottom-center') {
      badgeLeft = Math.max(Math.round((currentW - badgeW) / 2), 0);
      badgeTop = Math.max(currentH - badgeH - safeEdgePadding, 0);
    } else if (position === 'top-right') {
      badgeLeft = Math.max(currentW - badgeW - safeEdgePadding, 0);
      badgeTop = safeEdgePadding;
    } else if (position === 'top-left') {
      badgeLeft = safeEdgePadding;
      badgeTop = safeEdgePadding;
    }

    // Render composite badge as SVG backdrop with text and embedded logo
    const logoBase64 = processedLogoPng ? processedLogoPng.toString('base64') : '';
    const logoX = sizeConfig.padX;
    const logoY = sizeConfig.padY;
    const textX = logoX + (showLogo ? sizeConfig.logoH + sizeConfig.gap : 0);
    const textY = badgeH / 2 + sizeConfig.fontSize * 0.35;

    const badgeSvg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${badgeW}" height="${badgeH}" viewBox="0 0 ${badgeW} ${badgeH}">
      <defs>
        <filter id="shadow" x="-10%" y="-10%" width="130%" height="130%">
          <feDropShadow dx="0" dy="2" stdDeviation="4" flood-color="#000000" flood-opacity="0.35" />
        </filter>
        <linearGradient id="badgeBg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#0f172a" stop-opacity="${opacity * 0.95}" />
          <stop offset="100%" stop-color="#1e293b" stop-opacity="${opacity * 0.92}" />
        </linearGradient>
      </defs>
      <rect width="${badgeW}" height="${badgeH}" rx="10" fill="url(#badgeBg)" stroke="#ffffff" stroke-opacity="0.15" stroke-width="1" filter="url(#shadow)" />
      ${showLogo && logoBase64 ? `
        <image href="data:image/png;base64,${logoBase64}" x="${logoX}" y="${logoY}" width="${sizeConfig.logoH}" height="${sizeConfig.logoH}" />
      ` : ''}
      ${showBrandName ? `
        <text x="${textX}" y="${textY}" fill="#ffffff" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="${sizeConfig.fontSize}" font-weight="600" opacity="${opacity}">
          ${escapeXml(brandName)}
        </text>
      ` : ''}
    </svg>
    `.trim();

    sharpInstance = sharpInstance.composite([
      {
        input: Buffer.from(badgeSvg),
        top: Math.round(badgeTop),
        left: Math.round(badgeLeft),
      },
    ]);
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
  if (shouldApplyBrand && wantsLogo && logoDataUrl) {
    try {
      footerLogoBase64 = (
        await sharp(bufferFromDataUrl(logoDataUrl))
          .resize(28, 28, {
            fit: 'contain',
            background: { r: 0, g: 0, b: 0, alpha: 0 },
          })
          .png()
          .toBuffer()
      ).toString('base64');
    } catch (err) {
      console.warn('Could not process uploaded source-document logo; skipping logo:', err);
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
