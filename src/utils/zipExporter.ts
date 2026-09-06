import JSZip from 'jszip';
import { ImageManifest, ImageSlotPlan } from '../types';

/**
 * Convert an image data URL (SVG or others) to a real WebP data URL using offscreen canvas
 */
export async function ensureWebpDataUrl(
  dataUrl: string,
  width = 1200,
  height = 675
): Promise<{ dataUrl: string; base64: string; mime: string }> {
  if (!dataUrl.startsWith('data:')) {
    return { dataUrl, base64: '', mime: 'image/webp' };
  }

  const parts = dataUrl.split(',');
  const mimeMatch = parts[0].match(/:(.*?);/);
  const mime = mimeMatch ? mimeMatch[1] : 'image/webp';
  const base64Data = parts[1];

  // If already WebP or PNG/JPEG binary, return as is
  if (mime === 'image/webp' || mime === 'image/png' || mime === 'image/jpeg') {
    return { dataUrl, base64: base64Data, mime };
  }

  // If SVG, convert to WebP canvas blob
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const webpUrl = canvas.toDataURL('image/webp', 0.92);
          if (webpUrl.startsWith('data:image/webp')) {
            const b64 = webpUrl.split(',')[1];
            resolve({ dataUrl: webpUrl, base64: b64, mime: 'image/webp' });
            return;
          }
        }
      } catch (err) {
        console.warn('Canvas WebP conversion error:', err);
      }
      resolve({ dataUrl, base64: base64Data, mime });
    };
    img.onerror = () => {
      resolve({ dataUrl, base64: base64Data, mime });
    };
    img.src = dataUrl;
  });
}

export interface HandoffValidationResult {
  canExport: boolean;
  unresolvedCount: number;
  unresolvedSlots: ImageSlotPlan[];
  missingAssets: ImageSlotPlan[];
  errors: string[];
}

/**
 * Validates that every existing article image slot ends with a new asset
 * and no slots are left unresolved in NEEDS_DECISION or uncompleted.
 */
export function validateHandoffPackage(plan: ImageSlotPlan[]): HandoffValidationResult {
  const unresolvedSlots = plan.filter(
    (s) => s.processing_strategy === 'NEEDS_DECISION' || (!s.selected && s.status !== 'completed')
  );
  const missingAssets = plan.filter(
    (s) => !s.image_data_url || s.status !== 'completed'
  );
  const errors: string[] = [];

  if (unresolvedSlots.length > 0) {
    errors.push(
      `Còn ${unresolvedSlots.length} vị trí ảnh chưa được quyết định chiến lược xử lý (${unresolvedSlots.map((s) => s.slot_id).join(', ')}).`
    );
  }

  if (missingAssets.length > 0) {
    errors.push(
      `Còn ${missingAssets.length} vị trí ảnh chưa tạo xong asset mới (${missingAssets.map((s) => s.slot_id).join(', ')}). Mọi ảnh bài viết bắt buộc phải có file WebP mới trước khi bàn giao.`
    );
  }

  return {
    canExport: errors.length === 0,
    unresolvedCount: unresolvedSlots.length,
    unresolvedSlots,
    missingAssets,
    errors,
  };
}

/**
 * Creates and downloads a zip package containing:
 * - images with exact output path structure (e.g. uploads/articles/YYYY/MM/[filename].webp)
 * - manifest.json
 * - [slug]-updated.html
 */
export async function downloadZipPackage(
  articleSlug: string,
  updatedHtml: string,
  manifest: ImageManifest,
  plan: ImageSlotPlan[],
  basePath = 'uploads/articles/2026/09/',
  bypassValidation = false
): Promise<void> {
  if (!bypassValidation) {
    const validation = validateHandoffPackage(plan);
    if (!validation.canExport) {
      throw new Error(validation.errors.join(' '));
    }
  }

  const zip = new JSZip();
  const folderName = articleSlug || 'ktdt-article-images';

  // Normalize basePath for ZIP path without leading slash
  let cleanZipBasePath = basePath.replace(/^\/+/, '');
  if (cleanZipBasePath && !cleanZipBasePath.endsWith('/')) {
    cleanZipBasePath += '/';
  }

  // 1. Add all completed selected images
  for (const slot of plan) {
    if (slot.image_data_url && slot.status === 'completed' && slot.selected) {
      const filename = slot.final_filename || slot.suggested_filename;
      const dataUrl = slot.image_data_url;

      const isFeatured = slot.type === 'featured';
      const width = isFeatured ? 1280 : 800;
      const height = isFeatured ? 720 : 600;

      const converted = await ensureWebpDataUrl(dataUrl, width, height);

      if (converted.base64) {
        // Place in both the configured output path and flat images/ folder for convenience
        if (cleanZipBasePath) {
          zip.file(`${cleanZipBasePath}${filename}`, converted.base64, { base64: true });
        }
        zip.file(`images/${filename}`, converted.base64, { base64: true });
      }
    }
  }

  // 2. Add manifest.json
  const manifestClean = {
    ...manifest,
    updated_html: undefined, // keep manifest json lightweight in zip, HTML is in separate file
  };
  zip.file('manifest.json', JSON.stringify(manifestClean, null, 2));

  // 3. Add updated HTML file
  const htmlFilename = `${folderName}-updated.html`;
  zip.file(htmlFilename, updatedHtml);

  // 4. Generate and trigger download
  const blob = await zip.generateAsync({ type: 'blob' });
  const downloadUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = downloadUrl;
  a.download = `${folderName}-bundle.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(downloadUrl);
}

/**
 * Triggers download of single file (e.g. image, html, json)
 */
export function downloadSingleFile(filename: string, content: string | Blob, mimeType = 'text/plain') {
  let blob: Blob;
  if (content instanceof Blob) {
    blob = content;
  } else if (content.startsWith('data:')) {
    // Data URL
    const byteString = atob(content.split(',')[1]);
    const mime = content.split(',')[0].split(':')[1].split(';')[0];
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i++) {
      ia[i] = byteString.charCodeAt(i);
    }
    blob = new Blob([ab], { type: mime });
  } else {
    blob = new Blob([content], { type: mimeType });
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
