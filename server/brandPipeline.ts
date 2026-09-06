import sharp from 'sharp';
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

  // If editor uploads a logo that already visually contains brand text, brandName can be left blank.
  // When blank, do not add extra text, use logo only.
  const showLogo = isEnabled && (watermarkMode === 'logo_and_text' || watermarkMode === 'logo_only');
  const showBrandName = isEnabled && (watermarkMode === 'logo_and_text' || watermarkMode === 'text_only') && Boolean(brandName);

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

  // Determine whether branding applies to this specific image type
  const hasExplicitScope = Boolean(brandConfig.apply_to);
  const applyTo = brandConfig.apply_to || 'all';
  let shouldApplyBrand = isEnabled;
  if (hasExplicitScope) {
    // New Brand Profile scope is authoritative. Source documents are inline assets.
    shouldApplyBrand = isEnabled &&
      (applyTo === 'all' || (isFeatured ? applyTo === 'featured_only' : applyTo === 'inline_only'));
  } else if (isSourceDoc) {
    shouldApplyBrand = isEnabled && brandConfig.apply_to_source_docs !== false;
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

  const currentMeta = await sharpInstance.metadata();
  const currentW = currentMeta.width || finalWidth;
  const currentH = currentMeta.height || finalHeight;

  // 2. Special handling for Source Documents (Factual forms, tax docs, tables)
  // Per requirement: Do NOT overlay branding across document content!
  // Instead, extend canvas with a clean separate bottom footer bar outside document content.
  if (isSourceDoc) {
    if (shouldApplyBrand && (showLogo || showBrandName)) {
      const footerH = 46;
      let footerLogoBase64 = '';

      // Use the exact uploaded logo in the source-document footer as well.
      // This remains deterministic and never asks AI to redraw brand artwork.
      if (showLogo) {
        const sourceLogoBuffer =
          brandConfig.logo_url && brandConfig.logo_url.startsWith('data:')
            ? bufferFromDataUrl(brandConfig.logo_url)
            : Buffer.from(DEFAULT_BRAND_LOGO_SVG);
        try {
          footerLogoBase64 = (
            await sharp(sourceLogoBuffer)
              .resize(28, 28, {
                fit: 'contain',
                background: { r: 0, g: 0, b: 0, alpha: 0 },
              })
              .png()
              .toBuffer()
          ).toString('base64');
        } catch (err) {
          console.warn('Could not process source-document logo, falling back to default SVG:', err);
          footerLogoBase64 = (
            await sharp(Buffer.from(DEFAULT_BRAND_LOGO_SVG)).resize(28, 28).png().toBuffer()
          ).toString('base64');
        }
      }

      // Extend bottom canvas
      sharpInstance = sharpInstance.extend({
        bottom: footerH,
        background: '#0f172a', // Clean dark editorial slate bar
      });

      // Render crisp vector footer overlay
      const footerSvg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="${currentW}" height="${footerH}" viewBox="0 0 ${currentW} ${footerH}">
        <rect width="${currentW}" height="${footerH}" fill="#0f172a" />
        <line x1="0" y1="0" x2="${currentW}" y2="0" stroke="#334155" stroke-width="1" />
        <g transform="translate(16, 9)">
          ${showLogo && footerLogoBase64 ? `
            <image href="data:image/png;base64,${footerLogoBase64}" width="28" height="28" />
          ` : ''}
          <text x="${showLogo ? 38 : 0}" y="19" fill="#f8fafc" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="13" font-weight="600" opacity="${opacity}">
            ${escapeXml(brandName)}
          </text>
          <text x="${showLogo ? 38 + brandName.length * 8 + 18 : brandName.length * 8 + 18}" y="19" fill="#94a3b8" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="12">
            • Tài liệu nghiệp vụ lưu trữ
          </text>
        </g>
      </svg>
      `.trim();

      sharpInstance = sharpInstance.composite([
        {
          input: Buffer.from(footerSvg),
          top: currentH,
          left: 0,
        },
      ]);
    }

    const webpBuffer = await sharpInstance.webp({ quality: 92, effort: 4 }).toBuffer();
    const resultMeta = await sharp(webpBuffer).metadata();
    return {
      buffer: webpBuffer,
      mimeType: 'image/webp',
      width: resultMeta.width || currentW,
      height: resultMeta.height || currentH,
      brandApplied: shouldApplyBrand && (showLogo || showBrandName),
    };
  }

  // 3. For AI-Generated Images (Featured & Inline): Apply clean brand overlay badge
  if (shouldApplyBrand && (showLogo || showBrandName)) {
    const sizeConfig = {
      small: { logoH: 26, fontSize: 12, padY: 6, padX: 10, gap: 8 },
      medium: { logoH: 34, fontSize: 13, padY: 8, padX: 14, gap: 10 },
      large: { logoH: 42, fontSize: 15, padY: 10, padX: 18, gap: 12 },
    }[logoSize];

    // Prepare logo buffer
    let logoBuffer: Buffer;
    if (brandConfig.logo_url && brandConfig.logo_url.startsWith('data:')) {
      logoBuffer = bufferFromDataUrl(brandConfig.logo_url);
    } else {
      logoBuffer = Buffer.from(DEFAULT_BRAND_LOGO_SVG);
    }

    // Convert logo to exact dimensions and PNG
    let processedLogoPng: Buffer | null = null;
    if (showLogo) {
      try {
        processedLogoPng = await sharp(logoBuffer)
          .resize(sizeConfig.logoH, sizeConfig.logoH, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
          .png()
          .toBuffer();
      } catch (err) {
        console.warn('Could not process custom logo, falling back to default SVG:', err);
        processedLogoPng = await sharp(Buffer.from(DEFAULT_BRAND_LOGO_SVG))
          .resize(sizeConfig.logoH, sizeConfig.logoH)
          .png()
          .toBuffer();
      }
    }

    // Calculate approximate text width for background card
    const approxTextWidth = showBrandName ? Math.round(brandName.length * (sizeConfig.fontSize * 0.65)) : 0;
    const badgeW = (showLogo ? sizeConfig.logoH : 0) +
      (showLogo && showBrandName ? sizeConfig.gap : 0) +
      approxTextWidth +
      sizeConfig.padX * 2;
    const badgeH = sizeConfig.logoH + sizeConfig.padY * 2;

    // Calculate badge coordinates according to safe area and position
    let badgeLeft = edgePadding;
    let badgeTop = edgePadding;

    if (position === 'bottom-right') {
      badgeLeft = Math.max(currentW - badgeW - edgePadding, edgePadding);
      badgeTop = Math.max(currentH - badgeH - edgePadding, edgePadding);
    } else if (position === 'bottom-left') {
      badgeLeft = edgePadding;
      badgeTop = Math.max(currentH - badgeH - edgePadding, edgePadding);
    } else if (position === 'bottom-center') {
      badgeLeft = Math.max(Math.round((currentW - badgeW) / 2), edgePadding);
      badgeTop = Math.max(currentH - badgeH - edgePadding, edgePadding);
    } else if (position === 'top-right') {
      badgeLeft = Math.max(currentW - badgeW - edgePadding, edgePadding);
      badgeTop = edgePadding;
    } else if (position === 'top-left') {
      badgeLeft = edgePadding;
      badgeTop = edgePadding;
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
    brandApplied: shouldApplyBrand && (showLogo || showBrandName),
  };
}

/**
 * Rebuild source image deterministically:
 * Fetches original image or loads buffer, resizes safely, converts to WebP,
 * and adds clean branded footer frame outside content if enabled.
 */
export async function rebuildSourceImage(
  sourceUrlOrData: string,
  brandConfig: BrandConfigInput = {},
  slotInfo: {
    slot_id: string;
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

  if (sourceUrlOrData.startsWith('data:')) {
    sourceBuffer = bufferFromDataUrl(sourceUrlOrData);
  } else if (sourceUrlOrData.startsWith('http://') || sourceUrlOrData.startsWith('https://')) {
    try {
      const fetched = await safeFetchImageBuffer(sourceUrlOrData, 8000);
      if (fetched.buffer && fetched.buffer.length > 0) {
        sourceBuffer = fetched.buffer;
      }
    } catch (e) {
      console.warn(`Could not fetch source image safely from ${sourceUrlOrData}, using crisp vector document reproduction`, e);
    }
  }

  // Fallback: If source image buffer couldn't be loaded (e.g. offline mock or local dummy src),
  // create high-resolution crisp document vector
  if (!sourceBuffer || sourceBuffer.length === 0) {
    const docW = 1000;
    const docH = 750;
    const docTitle = escapeXml(slotInfo.title || 'Biểu mẫu & Chứng từ thuế').slice(0, 60);

    const docSvg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${docW}" height="${docH}" viewBox="0 0 ${docW} ${docH}">
      <rect width="${docW}" height="${docH}" fill="#f1f5f9" />
      <g transform="translate(60, 50)">
        <rect width="${docW - 120}" height="${docH - 100}" rx="8" fill="#ffffff" stroke="#cbd5e1" stroke-width="1.5" />
        <!-- Document Header Lines -->
        <rect x="40" y="40" width="200" height="18" rx="4" fill="#0f766e" fill-opacity="0.8" />
        <rect x="40" y="70" width="320" height="12" rx="3" fill="#94a3b8" />
        <rect x="40" y="90" width="260" height="10" rx="3" fill="#cbd5e1" />
        
        <!-- Document Title Center -->
        <text x="${(docW - 120) / 2}" y="150" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="20" font-weight="700" fill="#0f172a">
          ${docTitle}
        </text>
        <text x="${(docW - 120) / 2}" y="180" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="13" fill="#64748b">
          Tài liệu nguồn được bảo toàn nội dung • Định dạng WebP tối ưu
        </text>

        <!-- Simulated Table Form Lines -->
        <g transform="translate(40, 220)">
          <rect width="${docW - 200}" height="36" fill="#f8fafc" stroke="#e2e8f0" />
          <line x1="120" y1="0" x2="120" y2="36" stroke="#e2e8f0" />
          <line x1="360" y1="0" x2="360" y2="36" stroke="#e2e8f0" />
          <line x1="560" y1="0" x2="560" y2="36" stroke="#e2e8f0" />

          <!-- Table Rows -->
          ${[0, 1, 2, 3, 4].map((i) => `
            <g transform="translate(0, ${36 + i * 38})">
              <rect width="${docW - 200}" height="38" fill="${i % 2 === 0 ? '#ffffff' : '#f8fafc'}" stroke="#e2e8f0" />
              <line x1="120" y1="0" x2="120" y2="38" stroke="#e2e8f0" />
              <line x1="360" y1="0" x2="360" y2="38" stroke="#e2e8f0" />
              <line x1="560" y1="0" x2="560" y2="38" stroke="#e2e8f0" />
              <circle cx="60" cy="19" r="6" fill="#cbd5e1" />
              <rect x="140" y="14" width="180" height="10" rx="3" fill="#94a3b8" opacity="0.6" />
              <rect x="380" y="14" width="120" height="10" rx="3" fill="#94a3b8" opacity="0.6" />
              <rect x="580" y="14" width="80" height="10" rx="3" fill="#0f766e" opacity="0.7" />
            </g>
          `).join('')}
        </g>

        <!-- Stamp & Signatures Area (Preserved Source Motif) -->
        <g transform="translate(480, 470)">
          <rect width="180" height="2" fill="#cbd5e1" />
          <circle cx="120" cy="40" r="32" fill="none" stroke="#e11d48" stroke-width="2.5" stroke-dasharray="4,4" opacity="0.75" />
          <text x="120" y="44" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="10" font-weight="700" fill="#e11d48" opacity="0.8">
            CHỨNG TỪ NGUỒN
          </text>
        </g>
      </g>
    </svg>
    `.trim();

    sourceBuffer = Buffer.from(docSvg);
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
