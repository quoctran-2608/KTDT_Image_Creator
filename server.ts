import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import { GoogleGenAI, Type } from '@google/genai';
import { Storage } from '@google-cloud/storage';
import sharp from 'sharp';
import {
  parseArticleHtml,
  cleanEditorialAltText,
  isUnaccentedOrFilenameText,
  generateEditorialTitle,
  generateEditorialCaption,
  isDocumentOrTableVisual,
  buildDocumentTablePrompt,
} from './src/utils/htmlProcessor';
import {
  slugifyVietnamese,
  ensureWebpExtension,
  generateFeaturedFilename,
  generateInlineFilename,
  makeUniqueFilenames,
  deriveEffectiveArticleSlug,
} from './src/utils/slugify';
import { ImageClassification, ImageSlotPlan, SourceDiscoverySummaryItem } from './src/types';
import {
  applyBrandingWithSharp,
  rebuildSourceImage,
  bufferFromDataUrl,
  getOfficialLogoBuffer,
  resolveOfficialLogoPath,
} from './server/brandPipeline';
import {
  safeFetchHtml,
  safeFetchImageBuffer,
  normalizeImageForAiVision,
  parseLiveArticleHtml,
  discoverSingleSlotSource,
  inferBaseUrlFromArticleUrl,
  LiveArticleParseResult,
} from './server/sourceDiscovery';

dotenv.config();

const __filenameResolved =
  typeof __filename !== 'undefined'
    ? __filename
    : typeof import.meta.url === 'string'
    ? fileURLToPath(import.meta.url)
    : process.cwd();
const __dirnameResolved =
  typeof __dirname !== 'undefined' ? __dirname : path.dirname(__filenameResolved);

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const distPath = path.join(process.cwd(), 'dist');
const distIndexPath = path.join(distPath, 'index.html');
const hasBuiltFrontend = fs.existsSync(distIndexPath);

// Body parser with 50mb limit to handle large HTML sources and base64 images
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

/**
 * ============================================================================
 * Vertex AI Configuration & Initialization Layer
 * ============================================================================
 */
interface VertexServerConfig {
  projectId: string;
  location: string;
  model: string;
}

// Initial configuration from server environment variables
const serverVertexConfig: VertexServerConfig = {
  projectId:
    process.env.VERTEX_PROJECT_ID ||
    process.env.GOOGLE_CLOUD_PROJECT ||
    process.env.GCP_PROJECT_ID ||
    '',
  location: process.env.VERTEX_LOCATION || 'global',
  model: process.env.VERTEX_MODEL || 'gemini-3-pro-image',
};

// Handle optional server-side service account JSON configuration
if (process.env.VERTEX_SERVICE_ACCOUNT_JSON) {
  try {
    const sa = JSON.parse(process.env.VERTEX_SERVICE_ACCOUNT_JSON);
    if (sa.project_id && !serverVertexConfig.projectId) {
      serverVertexConfig.projectId = sa.project_id;
    }
    const credPath = '/tmp/vertex-sa-credentials.json';
    fs.writeFileSync(credPath, process.env.VERTEX_SERVICE_ACCOUNT_JSON, { mode: 0o600 });
    process.env.GOOGLE_APPLICATION_CREDENTIALS = credPath;
  } catch (err) {
    console.warn('Không thể đọc VERTEX_SERVICE_ACCOUNT_JSON:', err);
  }
}

// In-memory cache of generated image artifacts for session
const generatedArtifactsCache = new Map<
  string,
  {
    slot_id: string;
    filename: string;
    dataUrl: string;
    mime: string;
    createdAt: string;
  }
>();

const EDITORIAL_EXPORT_TTL_MS = 24 * 60 * 60 * 1000;
const EDITORIAL_EXPORT_BUCKET = process.env.EDITORIAL_EXPORT_BUCKET?.trim() || '';
const editorialExportStorage = EDITORIAL_EXPORT_BUCKET ? new Storage() : null;
const isCloudRun = Boolean(process.env.K_SERVICE);
const isBuiltCloudRun = isCloudRun && hasBuiltFrontend;
const requiresEditorialExportBucket = hasBuiltFrontend;
const editorialExportAssets = new Map<
  string,
  {
    filename: string;
    mime: 'image/webp';
    buffer: Buffer;
    createdAt: number;
  }
>();

function cleanupEditorialExportAssets(now = Date.now()) {
  for (const [token, asset] of editorialExportAssets) {
    if (now - asset.createdAt > EDITORIAL_EXPORT_TTL_MS) {
      editorialExportAssets.delete(token);
    }
  }
}

function safeEditorialFilename(filename: unknown): string {
  const raw = typeof filename === 'string' ? filename : 'editorial-image.webp';
  const cleaned = raw.replace(/[^a-zA-Z0-9._-]/g, '-').replace(/-+/g, '-');
  return cleaned.toLowerCase().endsWith('.webp') ? cleaned : `${cleaned || 'editorial-image'}.webp`;
}

interface EditorialExportAssetInput {
  slot_id: string;
  filename: string;
  image_data_url: string;
}

interface NormalizedEditorialExportAsset {
  slotId: string;
  filename: string;
  webpBuffer: Buffer;
}

async function normalizeEditorialExportAssets(
  assets: unknown
): Promise<NormalizedEditorialExportAsset[]> {
  if (!Array.isArray(assets) || assets.length === 0) {
    throw new Error('Cần ít nhất một asset hoàn tất để xuất sang Editorial.');
  }
  if (assets.length > 100) {
    throw new Error('Số lượng asset xuất vượt giới hạn cho phép.');
  }

  const seenSlots = new Set<string>();
  const normalized: NormalizedEditorialExportAsset[] = [];
  for (const asset of assets as Partial<EditorialExportAssetInput>[]) {
    const slotId = typeof asset.slot_id === 'string' ? asset.slot_id.trim() : '';
    const dataUrl = typeof asset.image_data_url === 'string' ? asset.image_data_url : '';
    if (!slotId || !dataUrl.startsWith('data:image/')) {
      throw new Error('Asset Editorial không hợp lệ hoặc thiếu ảnh hoàn tất.');
    }
    if (seenSlots.has(slotId)) {
      throw new Error(`Asset Editorial bị trùng slot_id: ${slotId}.`);
    }
    seenSlots.add(slotId);

    const sourceBuffer = bufferFromDataUrl(dataUrl);
    if (sourceBuffer.length === 0 || sourceBuffer.length > 20 * 1024 * 1024) {
      throw new Error(`Kích thước asset không hợp lệ: ${slotId}.`);
    }

    // Normalize client mocks and server outputs into the same downloadable WebP transport format.
    const webpBuffer = await sharp(sourceBuffer).webp({ quality: 92, effort: 4 }).toBuffer();
    normalized.push({
      slotId,
      filename: safeEditorialFilename(asset.filename),
      webpBuffer,
    });
  }
  return normalized;
}

async function registerEditorialAssetsInCloudStorage(
  assets: NormalizedEditorialExportAsset[]
): Promise<Array<{ slot_id: string; url: string }>> {
  if (!editorialExportStorage || !EDITORIAL_EXPORT_BUCKET) {
    throw new Error('Cloud Storage chưa được cấu hình cho Editorial export.');
  }

  const bucket = editorialExportStorage.bucket(EDITORIAL_EXPORT_BUCKET);
  const exportId = randomUUID();
  const uploadedFiles: ReturnType<typeof bucket.file>[] = [];
  try {
    const storedAssets: Array<{ slot_id: string; file: ReturnType<typeof bucket.file> }> = [];
    for (const asset of assets) {
      // A per-object opaque prefix prevents filename collisions inside the export request.
      const objectPath = `editorial-export/${exportId}/${randomUUID()}-${asset.filename}`;
      const file = bucket.file(objectPath);
      // Track before upload so rollback also covers a partial object from a failed save.
      uploadedFiles.push(file);
      await file.save(asset.webpBuffer, {
        resumable: false,
        contentType: 'image/webp',
        metadata: { cacheControl: 'private, max-age=300' },
      });
      storedAssets.push({ slot_id: asset.slotId, file });
    }

    return await Promise.all(
      storedAssets.map(async ({ slot_id, file }) => {
        const [url] = await file.getSignedUrl({
          version: 'v4',
          action: 'read',
          expires: Date.now() + EDITORIAL_EXPORT_TTL_MS,
        });
        return { slot_id, url };
      })
    );
  } catch (err) {
    // Best-effort rollback makes a failed pack registration all-or-nothing for callers.
    await Promise.allSettled(uploadedFiles.map((file) => file.delete({ ignoreNotFound: true })));
    throw err;
  }
}

function registerEditorialAssetsInMemory(
  assets: NormalizedEditorialExportAsset[]
): Array<{ slot_id: string; path: string }> {
  cleanupEditorialExportAssets();
  const pending = assets.map((asset) => ({
    token: randomUUID(),
    slot_id: asset.slotId,
    filename: asset.filename,
    buffer: asset.webpBuffer,
  }));

  // Store only after all asset normalization has succeeded, so no partial memory pack is visible.
  for (const asset of pending) {
    editorialExportAssets.set(asset.token, {
      filename: asset.filename,
      mime: 'image/webp',
      buffer: asset.buffer,
      createdAt: Date.now(),
    });
  }
  return pending.map(({ token, slot_id }) => ({
    slot_id,
    path: `/api/editorial-image/${token}`,
  }));
}

// Helper to infer credential presence in runtime environment.
// Note: This only checks environment variables or container environment availability (configuration-only).
// It does not probe actual IAM permissions or verify aiplatform.googleapis.com API enablement.
function getVertexCredentialInfo(): {
  detected: boolean;
  credentials_environment_available: boolean;
  source: string;
  authentication_mode: 'SERVICE_ACCOUNT_JSON' | 'SERVICE_ACCOUNT_FILE' | 'ADC';
} {
  if (process.env.VERTEX_SERVICE_ACCOUNT_JSON) {
    return {
      detected: true,
      credentials_environment_available: true,
      source: 'Service Account JSON (Biến môi trường)',
      authentication_mode: 'SERVICE_ACCOUNT_JSON',
    };
  }
  if (
    process.env.GOOGLE_APPLICATION_CREDENTIALS &&
    fs.existsSync(process.env.GOOGLE_APPLICATION_CREDENTIALS)
  ) {
    return {
      detected: true,
      credentials_environment_available: true,
      source: 'Service Account File (GOOGLE_APPLICATION_CREDENTIALS)',
      authentication_mode: 'SERVICE_ACCOUNT_FILE',
    };
  }
  // Cloud Run / GCP container environment provides Application Default Credentials via metadata server / service identity.
  // This is an environment inference, not an active credential verification probe.
  return {
    detected: true,
    credentials_environment_available: true,
    source: 'Application Default Credentials (ADC / Cloud Compute - suy luận môi trường)',
    authentication_mode: 'ADC',
  };
}

function getVertexReadiness() {
  const creds = getVertexCredentialInfo();
  const hasProject = Boolean(serverVertexConfig.projectId && serverVertexConfig.projectId.trim());
  const isConfigReady = hasProject && creds.credentials_environment_available;

  return {
    vertex_enabled: true,
    configuration_ready: isConfigReady,
    authentication_mode: creds.authentication_mode,
    vertex_api_verified: null as boolean | null,
    verification_scope: 'configuration_only' as const,
    project_id_configured: hasProject,
    project_id: serverVertexConfig.projectId,
    location: serverVertexConfig.location,
    model: serverVertexConfig.model,
    credentials_detected: creds.detected,
    credentials_environment_available: creds.credentials_environment_available,
    credential_source: creds.source,
    is_ready: isConfigReady,
    read_only: hasBuiltFrontend,
    status_message: isConfigReady
      ? 'Cấu hình Vertex AI phía server đã sẵn sàng. Quyền IAM và Vertex API thực tế được xác minh khi thực hiện request Vertex.'
      : !hasProject
      ? 'Chưa thể tạo ảnh: cấu hình Vertex AI hoặc thông tin xác thực chưa sẵn sàng (Thiếu Project ID trên server).'
      : 'Chưa thể tạo ảnh: cấu hình Vertex AI hoặc thông tin xác thực chưa sẵn sàng.',
  };
}

// Lazy initialize client for article analysis: prefers Vertex AI (Cloud Run ADC / service identity) in production, falls back to GEMINI_API_KEY in dev
function getAnalysisClient(): { ai: GoogleGenAI; model: string } | null {
  if (serverVertexConfig.projectId && serverVertexConfig.projectId.trim()) {
    return {
      ai: new GoogleGenAI({
        vertexai: true,
        project: serverVertexConfig.projectId.trim(),
        location: serverVertexConfig.location || 'global',
      }),
      model: 'gemini-3.5-flash',
    };
  }
  const apiKey = process.env.GEMINI_API_KEY;
  if (apiKey) {
    return {
      ai: new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      }),
      model: 'gemini-3.5-flash',
    };
  }
  return null;
}

function getGeminiClient(): GoogleGenAI | null {
  const client = getAnalysisClient();
  return client?.ai || null;
}

// Health check endpoint
app.get('/api/health', (req, res) => {
  const readiness = getVertexReadiness();
  res.json({
    status: 'ok',
    vertex: readiness,
    hasApiKey: Boolean(process.env.GEMINI_API_KEY),
    analysisReady: Boolean(serverVertexConfig.projectId || process.env.GEMINI_API_KEY),
    time: new Date().toISOString(),
  });
});

// Endpoint to serve official brand logo PNG for client UI & live preview
app.get('/api/brand-logo', (_req, res) => {
  const logoBuf = getOfficialLogoBuffer();
  if (!logoBuf) {
    return res.status(404).send('Official logo not found');
  }
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
  res.send(logoBuf);
});

/**
 * Registers completed browser assets for one-way Editorial import.
 * Cloud Storage is required in production so URLs survive Cloud Run instance changes.
 */
app.post('/api/editorial-export-assets', async (req, res) => {
  try {
    const assets = await normalizeEditorialExportAssets(req.body?.assets);
    if (editorialExportStorage) {
      const registered = await registerEditorialAssetsInCloudStorage(assets);
      return res.json({ success: true, transport: 'gcs', assets: registered });
    }
    if (requiresEditorialExportBucket) {
      return res.status(503).json({
        error:
          'Editorial export chưa sẵn sàng trên production: cần cấu hình EDITORIAL_EXPORT_BUCKET cho Cloud Storage.',
      });
    }

    const registered = registerEditorialAssetsInMemory(assets);
    return res.json({ success: true, transport: 'memory', assets: registered });
  } catch (err: any) {
    console.error('Editorial export asset registration failed:', err.message || err);
    return res.status(400).json({
      error: 'Không thể chuẩn bị URL ảnh tạm cho Editorial.',
      details: err.message || String(err),
    });
  }
});

/**
 * Source preview fallback for temporary in-memory assets. Built deployments use Cloud Storage signed URLs.
 */
app.get('/api/editorial-image/:token', (req, res) => {
  if (editorialExportStorage || requiresEditorialExportBucket) {
    return res.status(404).send('Không tìm thấy ảnh tạm.');
  }
  cleanupEditorialExportAssets();
  const token = req.params.token;
  if (!/^[0-9a-f-]{36}$/i.test(token)) {
    return res.status(404).send('Không tìm thấy ảnh tạm.');
  }
  const asset = editorialExportAssets.get(token);
  if (!asset) {
    return res.status(404).send('Ảnh tạm đã hết hạn hoặc không tồn tại.');
  }

  res.setHeader('Content-Type', asset.mime);
  res.setHeader('Content-Length', asset.buffer.length);
  res.setHeader('Content-Disposition', `inline; filename="${asset.filename}"`);
  res.setHeader('Cache-Control', 'private, max-age=300');
  return res.send(asset.buffer);
});

// Vertex AI status query endpoint
app.get('/api/vertex-status', (req, res) => {
  res.json(getVertexReadiness());
});

// Vertex AI configuration update endpoint (allows setting project/location/model for the session)
app.post('/api/vertex-config', (req, res) => {
  // Built production deployment: locking server-managed configuration to prevent public users from mutating shared settings
  if (hasBuiltFrontend) {
    return res.status(403).json({
      error:
        'Cấu hình Vertex AI được quản lý tập trung ở phía máy chủ bởi Quản trị viên (Owner). Không thể thay đổi trong môi trường production.',
      read_only: true,
      config: getVertexReadiness(),
    });
  }

  const { projectId, location, model } = req.body;
  if (typeof projectId === 'string') {
    serverVertexConfig.projectId = projectId.trim();
  }
  if (typeof location === 'string' && location.trim()) {
    serverVertexConfig.location = location.trim();
  }
  if (typeof model === 'string' && model.trim()) {
    serverVertexConfig.model = model.trim();
  }
  res.json({
    success: true,
    config: getVertexReadiness(),
  });
});

/**
 * Helper to fetch external/relative images as inline base64 data for multimodal inspection
 */
async function fetchImageAsInlineData(
  url: string,
  timeoutMs = 3500
): Promise<{ mimeType: string; data: string } | null> {
  if (!url) return null;
  if (url.startsWith('data:image/')) {
    const match = url.match(/^data:(image\/[a-zA-Z0-9\+\-]+);base64,(.+)$/);
    if (match) {
      return { mimeType: match[1], data: match[2] };
    }
  }
  if (!/^https?:\/\//i.test(url)) {
    return null;
  }
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const contentType = res.headers.get('content-type') || 'image/jpeg';
    const mimeType = contentType.split(';')[0].trim();
    if (!mimeType.startsWith('image/')) return null;
    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    if (buffer.length === 0 || buffer.length > 5 * 1024 * 1024) return null;
    return {
      mimeType,
      data: buffer.toString('base64'),
    };
  } catch {
    return null;
  }
}

export const SOURCE_BRANDING_REMOVAL_DIRECTIVE = `\n\nSOURCE BRANDING REMOVAL:
- Ignore and remove all logos, company names, brand names, emblems, seals, badges, watermarks, lettermarks and trademark-like symbols visible in any source/reference image.
- Do NOT reproduce, imitate, redraw, stylize or approximate them.
- Do NOT invent a similar substitute logo.
- Replace branded elements with neutral, generic, unbranded visuals.
- Documents, screens, laptops, forms, products and interfaces must contain no identifiable brand/logo inherited from the source.
- Preserve only subject meaning, never source branding.`;

export const DOC_TABLE_BRANDING_DIRECTIVE = `\n\nDOCUMENT/TABLE VISUAL BRANDING RULES:
- Generic invoice/document/table only
- NO company logo
- NO government-style emblem
- NO seal/stamp
- NO brand name
- NO fake logo placeholder`;

/**
 * Ensures analyzer output and visual concepts do not carry detected source branding into positive generation instructions.
 * If a prompt or concept mentions logos, brands, emblems, or seals from source imagery, strips or neutralizes them.
 */
export function sanitizeBrandingPrompt(text: string): string {
  if (!text) return '';
  let cleaned = text;

  // English phrases describing positive generation or inclusion of logos/brands/emblems/seals
  cleaned = cleaned.replace(/\b(featuring|displaying|showing|bearing|including|incorporating|with|has)\s+(a\s+|the\s+)?(company|corporate|brand|organization|client|bank)?\s*(logo|brand name|brand identity|emblem|badge|seal|stamp|watermark|lettermark|trademark)[^.,;\n]*/gi, '');
  cleaned = cleaned.replace(/\b(reproduce|recreate|draw|include|render|show|display)\s+(the\s+)?(source\s+|original\s+)?(logo|branding|brand name|emblem|seal|stamp)[^.,;\n]*/gi, '');
  
  // Vietnamese phrases describing positive generation or inclusion of logos/brands/emblems/seals
  cleaned = cleaned.replace(/\b(kèm theo|hiển thị|chứa|có|mang|thể hiện|giữ lại|tái hiện)\s+(logo|thương hiệu|nhãn hiệu|biểu tượng|con dấu|mộc đỏ|huy hiệu)[^.,;\n]*/gi, '');
  cleaned = cleaned.replace(/\b(logo|thương hiệu|nhãn hiệu|con dấu|mộc đỏ)\s+(của|từ|trên)\s+(ảnh gốc|công ty|doanh nghiệp|tài liệu|ngân hàng)[^.,;\n]*/gi, '');

  // Clean up any double spaces or awkward punctuation left over
  cleaned = cleaned.replace(/\s{2,}/g, ' ').replace(/\s+([,.;])/g, '$1').trim();
  return cleaned;
}

/**
 * 1. Analyze Article HTML and build the Image Plan
 */
app.post('/api/analyze-article', async (req, res) => {
  try {
    const { htmlSource, articleUrl: rawArticleUrl, baseUrl: rawBaseUrl, articleTitle } = req.body;
    if (!htmlSource || typeof htmlSource !== 'string') {
      return res.status(400).json({ error: 'Nguồn mã HTML không hợp lệ hoặc đang để trống.' });
    }

    const articleUrl = (rawArticleUrl || '').trim();
    let baseUrl = (rawBaseUrl || '').trim();
    if (!baseUrl && articleUrl) {
      baseUrl = inferBaseUrlFromArticleUrl(articleUrl);
    }

    // Step 1: Parse HTML and extract structure & inline images
    const parsed = parseArticleHtml(htmlSource);
    const { title, excerpt, slug: parsedSlug, contentSelector, images, featuredImageInfo } = parsed;

    const effectiveArticleTitle =
      typeof articleTitle === 'string' && articleTitle.trim()
        ? articleTitle.trim()
        : title || 'Bài viết kinh tế thuế';

    const slug = deriveEffectiveArticleSlug({
      articleUrl,
      articleTitle: effectiveArticleTitle,
      parsedSlug,
      fallback: 'bai-viet-kinh-te-thue',
    });

    // Build default slots from extracted images
    const slots: ImageSlotPlan[] = [];

    // Always Slot 1: Featured Image (Required: exactly 1)
    const featuredSlot: ImageSlotPlan = {
      slot_id: 'feature-1',
      type: 'featured',
      old_src: featuredImageInfo?.old_src || '',
      old_alt: featuredImageInfo?.old_alt || '',
      classification: 'REPLACE_AI',
      processing_strategy: 'GENERATE_AI',
      confidence: 'high',
      visual_analysis_available: false,
      reason: 'Ảnh đại diện chính (Featured Image) đại diện cho toàn bộ chủ đề bài viết.',
      suggested_concept: `Chuyên viên kế toán doanh nghiệp Việt Nam làm việc tại văn phòng hiện đại, ánh sáng tự nhiên, liên quan chủ đề: "${effectiveArticleTitle}"`,
      generation_prompt: `High quality editorial journalism photography of a professional Vietnamese corporate accountant working in a modern office in Vietnam, natural office window lighting, shallow depth of field, 50mm f/2.8 lens, related to: "${effectiveArticleTitle}".`,
      suggested_filename: generateFeaturedFilename(slug),
      suggested_alt: `Ảnh minh họa chuyên viên tài chính kế toán rà soát chứng từ liên quan ${effectiveArticleTitle.toLowerCase()}`,
      aspect_ratio: '16:9',
      selected: true,
      status: 'pending',
    };
    slots.push(featuredSlot);

    // Inline slots (N slots corresponding to existing images)
    images.forEach((img, idx) => {
      const slotId = `inline-${idx + 1}`;
      const isReplace = img.heuristic_classification === 'REPLACE_AI';
      const strategy =
        img.heuristic_classification === 'KEEP_ORIGINAL'
          ? 'REBUILD_FROM_SOURCE'
          : 'GENERATE_AI';

      slots.push({
        slot_id: slotId,
        type: 'inline',
        old_src: img.old_src,
        old_alt: img.old_alt,
        classification: img.heuristic_classification,
        processing_strategy: strategy,
        is_sensitive_source: img.heuristic_classification === 'KEEP_ORIGINAL',
        confidence: img.heuristic_confidence,
        visual_analysis_available: false,
        reason: img.heuristic_reason,
        context_heading: img.context_heading,
        context_paragraph: img.context_paragraph,
        context_before: img.context_before,
        context_after: img.context_after,
        suggested_concept: img.suggested_concept,
        generation_prompt: img.generation_prompt,
        suggested_filename: generateInlineFilename(slug, img.suggested_filename_suffix, idx),
        suggested_alt: img.suggested_alt,
        aspect_ratio: '4:3',
        selected: true,
        status: 'pending',
        original_index: img.index,
      });
    });

    // Step 2: Live Article Fetching (if articleUrl provided)
    let liveArticleData: LiveArticleParseResult | null = null;
    if (articleUrl) {
      try {
        const liveHtml = await safeFetchHtml(articleUrl);
        if (liveHtml) {
          liveArticleData = parseLiveArticleHtml(liveHtml, articleUrl);
        }
      } catch (liveErr) {
        console.warn('Could not fetch live article HTML:', liveErr);
      }
    }

    // Step 3: Run 5-stage source discovery concurrently for all slots
    const discoveryPromises = slots.map((slot) =>
      discoverSingleSlotSource(
        {
          slot_id: slot.slot_id,
          type: slot.type,
          old_src: slot.old_src,
          old_alt: slot.old_alt || slot.suggested_alt,
          context_heading: slot.context_heading || title,
          context_paragraph: slot.context_paragraph,
          original_index: slot.original_index,
        },
        {
          articleUrl,
          baseUrl,
          liveArticleData,
        }
      )
    );

    const discoveryResults = await Promise.all(discoveryPromises);

    // Attach discovery results and default reference image settings
    const slotImageBuffers = new Map<string, { buffer: Buffer; mimeType: string }>();

    for (const res of discoveryResults) {
      const targetSlot = slots.find((s) => s.slot_id === res.slot_id);
      if (!targetSlot) continue;

      targetSlot.source_image = res.source_image;
      targetSlot.source_resolved_url = res.source_image.resolved_url;
      targetSlot.source_image_method = res.source_image.method;
      targetSlot.source_mapping_confidence = res.source_image.mapping_confidence;
      targetSlot.source_status_label = res.source_image.source_status_label;
      targetSlot.needs_source_confirmation = Boolean(res.source_image.needs_confirmation);
      targetSlot.visual_analysis_available = Boolean(res.source_image.available);

      if (res.imageBuffer && res.mimeType) {
        const normalized = await normalizeImageForAiVision(res.imageBuffer);
        if (normalized) {
          slotImageBuffers.set(res.slot_id, {
            buffer: normalized.buffer,
            mimeType: normalized.mimeType,
          });
        }
      }

      // Configure default reference image (Disabled by default for all GENERATE_AI slots)
      targetSlot.reference_image = {
        enabled: false,
        choice: 'none',
        method: 'none',
      };
    }

    // Step 4: If AI analysis is available (Vertex AI via ADC in production or Gemini API key in dev), enhance concepts, alt texts, and classifications
    const analysisClient = getAnalysisClient();
    const ai = analysisClient?.ai || null;

    // Initialize explicit status separation across all slots
    slots.forEach((s) => {
      s.source_retrieval_status = s.source_image?.available ? 'success' : 'failed';
      s.visual_analysis_status = ai ? 'analyzing' : 'unavailable';
      s.visual_analysis_available = false; // Strictly false until visual analysis actually succeeds!
      s.processing_strategy_status =
        s.processing_strategy === 'NEEDS_DECISION' ? 'needs_decision' : 'recommended';
    });

        if (ai && analysisClient) {
      try {
        const analyzeFeatured = async () => {
          const promptText = `Bạn là chuyên gia biên tập hình ảnh cho báo chí kinh tế, thuế, kế toán doanh nghiệp Việt Nam (KTDT).
Tiêu đề bài viết: "${effectiveArticleTitle}"
Tóm tắt: "${excerpt || 'Không có'}"
Slug: "${slug}"

Nhiệm vụ: Đề xuất ý tưởng (concept), câu lệnh tạo ảnh (prompt) và các metadata cho ảnh đại diện chính (Featured Image).
Phân tích thị giác (Nếu có ảnh đính kèm):
1. Xác định "visual_type" (ví dụ: "document", "screenshot", "illustration", "banner", "photo", "form", "invoice").
2. Nếu là tài liệu, biểu mẫu, hóa đơn, công văn, chứa dữ liệu nhạy cảm hoặc dày đặc chữ -> "is_sensitive_document: true".
3. Trích xuất "primary_headline" nếu ảnh có chữ lớn/nổi bật, và "primary_caption" nếu có dòng chữ phụ trợ nổi bật.

QUY TẮC BẮT BUỘC VỀ THƯƠNG HIỆU & LOGO NGUỒN (SOURCE BRANDING REMOVAL):
- Nếu phát hiện logo, tên thương hiệu, nhãn hàng, con dấu, watermark, biểu tượng của tổ chức/doanh nghiệp trong ảnh nguồn: coi đó là thành phần cần loại bỏ hoàn toàn, TUYỆT ĐỐI KHÔNG mang vào ý tưởng tạo ảnh mới.
- KHÔNG đưa tên thương hiệu, mô tả logo, nhãn hiệu, huy hiệu, con dấu từ ảnh gốc vào "featured_concept", "featured_generation_prompt" hay các trường metadata.
- Mọi hình ảnh và đối tượng đề xuất phải trung tính, không mang nhãn hiệu (unbranded, generic).
- Với tài liệu/hóa đơn/bảng biểu: chỉ đề xuất mẫu trung tính (generic invoice/document/table), KHÔNG có logo công ty, KHÔNG có quốc huy/biểu tượng hành chính, KHÔNG có con dấu/mộc đỏ, KHÔNG có tên thương hiệu, KHÔNG có ô giả logo.

YÊU CẦU:
- featured_concept: Ý tưởng bằng Tiếng Việt (trung tính, không chứa thương hiệu từ ảnh gốc).
- featured_generation_prompt: Bằng Tiếng Anh. Nếu có ảnh gốc đính kèm và không nhạy cảm, viết prompt dựa trên ý nghĩa của ảnh gốc nhưng tạo bố cục hoàn toàn mới, loại bỏ toàn bộ logo/thương hiệu của ảnh gốc.
- featured_cover_caption: Đề xuất một câu tiêu đề tiếng Việt ngắn gọn.
- featured_alt, featured_title, featured_caption: Theo quy chuẩn báo chí.
- enable_text_in_image: true (vì ảnh bìa luôn có text) hoặc dựa trên ảnh gốc.
`;
          const contentsParts: any[] = [{ text: promptText }];
          if (slotImageBuffers.has('feature-1')) {
            const fb = slotImageBuffers.get('feature-1');
            contentsParts.push({ text: `\n--- [Dữ liệu hình ảnh thực tế của Slot feature-1] ---` });
            contentsParts.push({
              inlineData: {
                mimeType: fb.mimeType,
                data: fb.buffer.toString('base64'),
              },
            });
          }

          try {
          const response = await ai.models.generateContent({
            model: analysisClient.model,
            contents: [{ role: 'user', parts: contentsParts }],
            config: {
              responseMimeType: 'application/json',
              responseSchema: {
                type: 'OBJECT',
                properties: {
                  featured_concept: { type: 'STRING' },
                  featured_generation_prompt: { type: 'STRING' },
                  featured_alt: { type: 'STRING' },
                  featured_title: { type: 'STRING' },
                  featured_caption: { type: 'STRING' },
                  featured_cover_caption: { type: 'STRING' },
                  enable_text_in_image: { type: 'BOOLEAN' },
                  visual_type: { type: 'STRING' },
                  has_text: { type: 'BOOLEAN' },
                  text_density: { type: 'STRING' },
                  primary_headline: { type: 'STRING' },
                  primary_caption: { type: 'STRING' },
                  is_sensitive_document: { type: 'BOOLEAN' }
                }
              }
            }
          });
          const result = JSON.parse(response.text);
          const targetSlot = slots[0];
          if (targetSlot) {
            const hasVisual = slotImageBuffers.has('feature-1');
            targetSlot.suggested_concept = sanitizeBrandingPrompt(result.featured_concept || targetSlot.suggested_concept);
            targetSlot.generation_prompt = sanitizeBrandingPrompt(result.featured_generation_prompt || targetSlot.generation_prompt);
            targetSlot.suggested_alt = result.featured_alt || targetSlot.suggested_alt;
            targetSlot.title = result.featured_title;
            targetSlot.caption = result.featured_caption;
            targetSlot.cover_caption = result.featured_cover_caption;
            targetSlot.enable_text_in_image = result.enable_text_in_image ?? true;
            
            targetSlot.visual_type = result.visual_type;
            targetSlot.has_text = result.has_text;
            targetSlot.text_density = result.text_density;
            targetSlot.primary_headline = result.primary_headline;
            targetSlot.primary_caption = result.primary_caption;
            targetSlot.is_sensitive_source = result.is_sensitive_document;
            
            targetSlot.visual_analysis_status = hasVisual ? 'success' : 'unavailable';
            targetSlot.visual_analysis_available = hasVisual;
          }
        } catch (e) {
          console.error('Featured AI analysis failed:', e);
          if (slots[0]) {
            slots[0].visual_analysis_status = 'failed';
            slots[0].visual_analysis_available = false;
          }
        }
        };

        const inlinePromises = images.map(async (img, i) => {
          const slotId = `inline-${i + 1}`;
          const slotObj = slots.find((s) => s.slot_id === slotId);
          if (!slotObj) return;
          const hasVisual = slotImageBuffers.has(slotId);
          
          const promptText = `Bạn là chuyên gia biên tập hình ảnh báo chí (KTDT).
Tiêu đề bài viết: "${effectiveArticleTitle}"
Tóm tắt: "${excerpt || 'Không có'}"

Phân tích ảnh nguồn sau đây:
- Vị trí ảnh: ${slotId}
- Nguồn ảnh cũ: ${img.old_src}
- Alt cũ: ${img.old_alt || 'Trống'}
- Tiêu đề mục: ${img.context_heading || 'Không có'}
- Đoạn văn trước: ${img.context_before || 'Không có'}
- Đoạn văn sau: ${img.context_after || 'Không có'}
- Phân tích thị giác: ${hasVisual ? 'ĐÃ CÓ ảnh đính kèm.' : 'KHÔNG có ảnh đính kèm, chỉ dùng văn bản.'}

QUY TẮC:
1. Xác định "visual_type" (ví dụ: "document", "screenshot", "illustration", "banner", "photo", "form", "invoice", "table", "spreadsheet", "financial_statement").
2. Nếu là tài liệu, biểu mẫu, hóa đơn, công văn, screenshot phần mềm chứa dữ liệu nhạy cảm hoặc dày đặc chữ -> "is_sensitive_document: true".
3. Trích xuất "primary_headline" nếu ảnh có chữ lớn/nổi bật, và "primary_caption" nếu có dòng chữ phụ trợ nổi bật.
4. QUY TẮC BẮT BUỘC VỀ THƯƠNG HIỆU & LOGO NGUỒN (SOURCE BRANDING REMOVAL):
   - TUYỆT ĐỐI KHÔNG mang bất kỳ logo, thương hiệu công ty, nhãn hiệu, biểu tượng, con dấu (seal/stamp), huy hiệu nào từ ảnh nguồn vào "concept" hay "generation_prompt". Coi đó là chi tiết phải loại bỏ hoàn toàn.
   - Thay thế mọi chi tiết thương hiệu bằng hình ảnh công sở hoặc tài liệu kế toán trung tính, không gắn nhãn hiệu.
   - Với tài liệu/hóa đơn/bảng biểu: chỉ tạo dạng biểu mẫu/bảng biểu giải thích trung tính (generic invoice/document/table), KHÔNG có logo công ty, KHÔNG có quốc huy/biểu tượng hành chính, KHÔNG có con dấu/mộc đỏ, KHÔNG có tên thương hiệu, KHÔNG có ô giữ chỗ logo giả.
5. Xác định "classification":
   - Nếu is_sensitive_document = true -> MANUAL_REVIEW, confidence: 'high'
   - Nếu ảnh phong cảnh/minh họa/banner/stock -> GENERATE_FROM_SOURCE_AI
   - Nếu mâu thuẫn giữa chữ và ảnh -> MANUAL_REVIEW
6. Gợi ý concept (Tiếng Việt) và generation_prompt (Tiếng Anh) cho chiến lược GENERATE_AI:
   - NẾU ảnh nguồn thuộc nhóm tài liệu/bảng biểu/hóa đơn/chứng từ/biểu mẫu (visual_type là invoice, accounting document, form, table, spreadsheet, financial statement, structured document, hoặc ảnh chứa bảng dữ liệu/hóa đơn/chứng từ):
     + KHÔNG yêu cầu AI sao chép hóa đơn/tài liệu gốc.
     + concept (Tiếng Việt): Đề xuất dạng ảnh minh họa đồ họa báo chí kinh tế / explainer visual giải thích nghiệp vụ kế toán về chủ đề liên quan. Thể hiện các yếu tố trực quan như: mẫu chứng từ/hóa đơn tinh gọn, bảng số liệu kế toán có dòng và cột rõ ràng, các khối đối chiếu/điều chỉnh, máy tính cầm tay hoặc bảng tính phù hợp. TUYỆT ĐỐI KHÔNG đưa logo, thương hiệu, con dấu vào concept.
     + generation_prompt (Tiếng Anh): Ưu tiên dạng professional Vietnamese accounting editorial illustration / explainer visual. Ví dụ tinh thần: "Create a clean unbranded Vietnamese accounting editorial visual about [chủ đề nghiệp vụ bằng tiếng Anh]. Show a newly designed generic invoice/document together with a structured accounting table containing clear rows, columns and adjustment blocks. Generic invoice/document/table only, with no company logo, no government emblem, no seal or stamp, no brand name. The visual communicates invoice adjustment and bookkeeping using a new composition and neutral visuals without reproducing the original document, company information or exact figures."
     + Ảnh mới phải: khác bố cục tài liệu gốc rõ rệt; không chép nguyên layout; không chép số liệu, tên doanh nghiệp, mã số thuế hoặc nội dung nhạy cảm của hóa đơn gốc; chỉ giữ Ý NGHĨA nghiệp vụ/chủ đề; tuyệt đối loại bỏ toàn bộ logo/thương hiệu ảnh gốc.
     + Nếu enable_text_in_image = true: chỉ dùng headline đã được hệ thống chọn (cover_caption), tuyệt đối KHÔNG OCR toàn bộ tài liệu.
   - NẾU ảnh nguồn là người/văn phòng thông thường (photo, office, person):
     + Giữ phong cách documentary editorial journalism photography: chuyên viên kế toán làm việc tại văn phòng hiện đại ở Việt Nam, ánh sáng tự nhiên từ cửa sổ, ống kính 50mm f/2.8, không chứa logo hoặc biểu tượng thương hiệu của ảnh nguồn.
7. Nếu GENERATE_FROM_SOURCE_AI (chỉ áp dụng cho ảnh minh họa/phong cảnh/stock KHÔNG nhạy cảm, KHÔNG phải hóa đơn/tài liệu):
   - Ý TƯỞNG TẠO ẢNH: AI sẽ tạo MỘT ẢNH MỚI. Ảnh mới phải GIỮ Ý NGHĨA CHÍNH của ảnh cũ, nhưng KHÁC ĐỦ NHIỀU để không bị xem là bắt chước (thay đổi góc máy, bố cục, ánh sáng).
   - Loại bỏ hoàn toàn logo, thương hiệu, watermark hoặc con dấu xuất hiện trong ảnh nguồn.
   - Nếu ảnh gốc có chữ nổi bật -> "enable_text_in_image: true", và gợi ý lại nội dung chữ trong "cover_caption" (viết lại cho hay, không copy nguyên văn).
   - "generation_prompt" (Tiếng Anh) phải ghi rõ: "preserve the same core topic, do NOT make a near-duplicate, create a clearly new composition, remove all source logos and watermarks."
`;

          const contentsParts: any[] = [{ text: promptText }];
          if (hasVisual) {
            const bufObj = slotImageBuffers.get(slotId);
            contentsParts.push({ text: `\n--- [Dữ liệu hình ảnh] ---` });
            contentsParts.push({
              inlineData: {
                mimeType: bufObj.mimeType,
                data: bufObj.buffer.toString('base64'),
              },
            });
          }

          try {
            const response = await ai.models.generateContent({
              model: analysisClient.model,
              contents: [{ role: 'user', parts: contentsParts }],
              config: {
                responseMimeType: 'application/json',
                responseSchema: {
                  type: 'OBJECT',
                  properties: {
                    visual_type: { type: 'STRING' },
                    has_text: { type: 'BOOLEAN' },
                    text_density: { type: 'STRING' },
                    primary_headline: { type: 'STRING' },
                    primary_caption: { type: 'STRING' },
                    is_sensitive_document: { type: 'BOOLEAN' },
                    classification: { type: 'STRING', description: 'GENERATE_FROM_SOURCE_AI, IGNORE, MANUAL_REVIEW' },
                    confidence: { type: 'STRING', description: 'high, medium, low' },
                    reason: { type: 'STRING' },
                    concept: { type: 'STRING' },
                    generation_prompt: { type: 'STRING' },
                    alt: { type: 'STRING' },
                    title: { type: 'STRING' },
                    caption: { type: 'STRING' },
                    cover_caption: { type: 'STRING' },
                    enable_text_in_image: { type: 'BOOLEAN' },
                    visual_description: { type: 'STRING' },
                    textual_description: { type: 'STRING' }
                  }
                }
              }
            });
            const result = JSON.parse(response.text);
            
            slotObj.classification = result.classification === 'GENERATE_FROM_SOURCE_AI' ? 'REPLACE_AI' : (result.classification || slotObj.classification);
            slotObj.enable_text_in_image = result.enable_text_in_image ?? Boolean(result.primary_headline);
            slotObj.cover_caption = result.cover_caption || result.primary_headline || '';
            
            const isSensitiveDoc = Boolean(
              result.is_sensitive_document ||
              isDocumentOrTableVisual({
                visual_type: result.visual_type,
                visual_description: result.visual_description,
                textual_description: result.textual_description,
                is_sensitive_document: result.is_sensitive_document,
                old_src: slotObj.old_src,
                old_alt: slotObj.old_alt,
              })
            );

            if (result.classification === 'GENERATE_FROM_SOURCE_AI') {
              if (hasVisual && !isSensitiveDoc) {
                slotObj.processing_strategy = 'GENERATE_FROM_SOURCE_AI';
                slotObj.processing_strategy_status = 'recommended';
                slotObj.selected = true;
              } else {
                slotObj.processing_strategy = 'GENERATE_AI';
                slotObj.processing_strategy_status = 'recommended';
                slotObj.selected = true;
              }
            } else if (result.classification === 'KEEP_ORIGINAL') {
              slotObj.processing_strategy = 'REBUILD_FROM_SOURCE';
              slotObj.processing_strategy_status = 'recommended';
              slotObj.selected = true;
            } else if (result.is_sensitive_document) {
              slotObj.processing_strategy = 'NEEDS_DECISION';
              slotObj.processing_strategy_status = 'needs_decision';
              slotObj.selected = false;
            } else {
              slotObj.processing_strategy = 'NEEDS_DECISION';
              slotObj.processing_strategy_status = 'needs_decision';
              slotObj.selected = false;
            }
            
            slotObj.confidence = result.confidence || slotObj.confidence;
            slotObj.reason = result.reason || slotObj.reason;
            if (result.concept) {
              slotObj.suggested_concept = sanitizeBrandingPrompt(result.concept);
              slotObj.concept = slotObj.suggested_concept;
            }
            slotObj.generation_prompt = sanitizeBrandingPrompt(result.generation_prompt || slotObj.generation_prompt);
            
            if (result.alt) {
              slotObj.suggested_alt = result.alt;
              slotObj.alt = result.alt;
            }
            slotObj.title = result.title;
            slotObj.caption = result.caption;
            
            slotObj.visual_type = result.visual_type;
            slotObj.has_text = result.has_text;
            slotObj.text_density = result.text_density;
            slotObj.primary_headline = result.primary_headline;
            slotObj.primary_caption = result.primary_caption;
            slotObj.is_sensitive_source = result.is_sensitive_document;
            slotObj.visual_description = result.visual_description;
            slotObj.textual_description = result.textual_description;
            
            slotObj.visual_analysis_status = hasVisual ? 'success' : 'unavailable';
            slotObj.visual_analysis_available = hasVisual;
            
            if (result.is_sensitive_document) {
              slotObj.reason = "Không khuyến nghị AI tạo lại từ ảnh gốc (ảnh chứa dữ liệu biểu mẫu/tài liệu). " + slotObj.reason;
            }
          } catch (e) {
            console.error(`AI analysis failed for ${slotId}:`, e);
            slotObj.visual_analysis_status = 'failed';
            slotObj.visual_analysis_available = false;
          }
        });

        await Promise.allSettled([analyzeFeatured(), ...inlinePromises]);
      } catch (err: any) {
        console.error('AI Multimodal Classification Error:', err);
      }
    } else {
      // Vertex AI not configured
      slots.forEach((s) => {
        s.visual_analysis_status = 'unavailable';
        s.visual_analysis_available = false;
        if (s.slot_id === 'feature-1') {
          s.processing_strategy = 'GENERATE_AI';
          s.processing_strategy_status = 'recommended';
          s.selected = true;
        } else {
          if (s.is_sensitive_source || s.confidence === 'low' || s.classification === 'MANUAL_REVIEW') {
            s.processing_strategy = 'NEEDS_DECISION';
            s.processing_strategy_status = 'needs_decision';
            s.selected = false;
            s.reason =
              'AI chưa được cấu hình. Hình ảnh nhạy cảm cần biên tập viên quyết định.';
          } else {
            s.processing_strategy = 'GENERATE_AI';
            s.processing_strategy_status = 'recommended';
            s.selected = true;
            s.reason = 'Ảnh minh họa dựa trên ngữ cảnh bài viết.';
          }
        }
      });
    }
    // Safeguard 1: Ensure feature-1 is selected and uses an AI strategy
    if (slots[0]) {
      slots[0].classification = 'REPLACE_AI';
      if (slots[0].processing_strategy !== 'GENERATE_FROM_SOURCE_AI') {
        slots[0].processing_strategy = 'GENERATE_AI';
      }
      slots[0].processing_strategy_status = 'recommended';
      slots[0].selected = true;
      slots[0].suggested_alt = cleanEditorialAltText(slots[0].suggested_alt || '', title);
      slots[0].alt = slots[0].suggested_alt;
    }

    // Safeguard 2: Conservative classification for sensitive images when visual analysis is unavailable
    slots.forEach((s, idx) => {
      if (s.slot_id !== 'feature-1') {
        const textEvidence = `${s.old_src || ''} ${s.old_alt || ''} ${s.context_heading || ''} ${s.context_paragraph || ''} ${s.suggested_concept || ''}`.toLowerCase();

        const isSensitiveType =
          /bản scan|bản chụp|scanned|scan-form|screenshot|chụp màn hình|bảng số liệu|bảng biểu|biểu đồ|chart|table|mẫu số|tờ khai|công văn|quyết định|mộc đỏ|con dấu|chữ ký|signature|seal|stamp|pháp lý|tài liệu gốc|source material|logo/i.test(
            textEvidence
          );
        const isDirectLogoAsset = /(\/logo\.|logo-|-logo|favicon\.|brand-logo)/i.test(s.old_src || '');

        if (!s.visual_analysis_available) {
          if (isSensitiveType && !isDirectLogoAsset && s.classification === 'KEEP_ORIGINAL') {
            s.classification = 'MANUAL_REVIEW';
            s.processing_strategy = 'NEEDS_DECISION';
            s.processing_strategy_status = 'needs_decision';
            s.confidence = 'low';
            s.reason = 'Chưa phân tích được ảnh thực tế; quyết định hiện dựa trên ngữ cảnh văn bản.';
            s.selected = false;
          }
        }

        if (s.confidence === 'low' || s.classification === 'MANUAL_REVIEW') {
          s.processing_strategy = 'NEEDS_DECISION';
          s.processing_strategy_status = 'needs_decision';
          s.selected = false;
          if (!s.reason || s.reason.includes('Chưa đủ chứng cứ')) {
            s.reason = 'Chưa phân tích được ảnh thực tế; quyết định hiện dựa trên ngữ cảnh văn bản.';
          }
        } else if (s.classification === 'REPLACE_AI') {
          if (s.visual_analysis_available && s.confidence === 'high' && s.processing_strategy !== 'GENERATE_FROM_SOURCE_AI') {
            s.processing_strategy = 'GENERATE_AI';
            s.processing_strategy_status = 'recommended';
            s.selected = true;
          }
        }

        // Sensitive-document safeguard: never allow GENERATE_FROM_SOURCE_AI for document/table/sensitive source
        if (s.processing_strategy === 'GENERATE_FROM_SOURCE_AI') {
          if (s.is_sensitive_source || s.is_sensitive_document || isDocumentOrTableVisual(s)) {
            s.processing_strategy = 'GENERATE_AI';
            s.processing_strategy_status = 'recommended';
            s.selected = true;
          }
        }
      }

      // Metadata regeneration safeguard: Ensure Alt, Title, and Caption are natural Vietnamese with proper diacritics
      s.suggested_alt = cleanEditorialAltText(s.suggested_alt || s.alt || '', s.context_heading || title);
      s.alt = s.suggested_alt;
      s.alt_text = s.suggested_alt;

      if (!s.title || isUnaccentedOrFilenameText(s.title)) {
        s.title = generateEditorialTitle(s.context_heading, s.alt, title, idx);
      }
      if (!s.caption || isUnaccentedOrFilenameText(s.caption)) {
        s.caption = generateEditorialCaption(s.context_heading, s.context_before, title);
      }
    });

    // Step 5: Ensure all filenames are strictly unique and properly formatted
    slots[0].suggested_filename = generateFeaturedFilename(slug);

    const rawFilenames = slots.map((s, idx) => {
      if (idx === 0) return slots[0].suggested_filename;
      return s.suggested_filename || `inline-${idx}.webp`;
    });
    const uniqueFilenames = makeUniqueFilenames(rawFilenames);
    slots.forEach((s, idx) => {
      s.suggested_filename = uniqueFilenames[idx];
      s.final_filename = uniqueFilenames[idx];
      s.alt = s.suggested_alt;
      s.concept = s.suggested_concept;
      if (!s.generation_prompt || s.generation_prompt.includes('50mm lens')) {
        if (isDocumentOrTableVisual(s)) {
          const docPrompt = buildDocumentTablePrompt(s.context_heading || s.title || effectiveArticleTitle);
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

    // Step 6: Generate Diagnostic Summary for "Kiểm tra nguồn ảnh"
    const source_discovery_summary: SourceDiscoverySummaryItem[] = slots.map((slot, idx) => {
      const isFeat = slot.type === 'featured';
      const label = isFeat ? 'Ảnh bìa (Featured Image)' : `Ảnh inline #${idx}`;
      const srcInfo = slot.source_image;

      let status: 'success' | 'warning' | 'error' = 'success';
      let message = '';

      if (srcInfo?.available) {
        if (slot.needs_source_confirmation || srcInfo.mapping_confidence === 'low') {
          status = 'warning';
          message = `Đã tìm thấy ảnh nhưng độ tin cậy thấp hoặc cần xác nhận (${srcInfo.source_status_label || srcInfo.method}).`;
        } else if (slot.text_visual_conflict) {
          status = 'warning';
          message = `Đã tải được ảnh thực tế nhưng phát hiện mâu thuẫn với Alt text cũ.`;
        } else {
          status = 'success';
          message = `Tải thành công ảnh thực tế từ ${srcInfo.source_status_label || 'nguồn bài viết'}.`;
        }
      } else {
        status = 'error';
        message = srcInfo?.error || 'Chưa tải được ảnh thực tế. Cho phép dán ảnh hoặc tải file tại vị trí này.';
      }

      return {
        slot_id: slot.slot_id,
        type: slot.type,
        label,
        status,
        method: srcInfo?.source_status_label || srcInfo?.method || 'Chưa xác định',
        message,
        resolved_url: srcInfo?.resolved_url || slot.old_src,
      };
    });

    const replaceable_count = slots.filter((s) => s.classification === 'REPLACE_AI').length;
    const rebuild_source_count = slots.filter((s) => s.processing_strategy === 'REBUILD_FROM_SOURCE').length;
    const keep_count = slots.filter((s) => s.classification === 'KEEP_ORIGINAL').length;
    const manual_count = slots.filter((s) => s.classification === 'MANUAL_REVIEW').length;
    const needs_decision_count = slots.filter((s) => s.processing_strategy === 'NEEDS_DECISION').length;
    const ignore_count = slots.filter((s) => s.classification === 'IGNORE').length;

    return res.json({
      title: effectiveArticleTitle,
      effective_article_title: effectiveArticleTitle,
      excerpt,
      slug,
      content_container_selector: contentSelector,
      total_inline_images: images.length,
      replaceable_count,
      rebuild_source_count,
      keep_count,
      manual_count,
      needs_decision_count,
      ignore_count,
      article_url: articleUrl,
      base_url: baseUrl,
      source_discovery_summary,
      plan: slots,
    });
  } catch (error: any) {
    console.error('Error analyzing article:', error);
    return res.status(500).json({
      error: `Lỗi khi phân tích mã HTML: ${error.message || 'Không xác định'}`,
    });
  }
});

async function validateGeneratedHeadline(
  ai: GoogleGenAI,
  imageDataUrl: string,
  expectedHeadline: string
): Promise<{ success: boolean; detectedText: string }> {
  try {
    const match = imageDataUrl.match(/^data:(image\/[a-zA-Z0-9.+_-]+);base64,(.+)$/);
    if (!match) return { success: false, detectedText: '' };
    const mimeType = match[1];
    const data = match[2];

    const response = await ai.models.generateContent({
      model: 'gemini-3.5-flash',
      contents: [
        {
          role: 'user',
          parts: [
            { inlineData: { mimeType, data } },
            { text: 'Read ONLY the prominent headline text visible in this image.\nReturn only the text you can read. Do not explain. If there is no text, return "NONE".' },
          ],
        },
      ],
    });
    
    let detectedText = response.text || '';
    detectedText = detectedText.replace(/\n/g, ' ').trim();
    if (detectedText.toUpperCase() === 'NONE') detectedText = '';

    const normalizeStr = (s: string) => {
       return s.normalize('NFC').replace(/[.,/#!$%^&*;:{}=\-_`~()]/g,"").replace(/\s{2,}/g," ").trim().toLowerCase();
    };

    const expectedNorm = normalizeStr(expectedHeadline);
    const detectedNorm = normalizeStr(detectedText);

    return {
      success: expectedNorm === detectedNorm,
      detectedText: detectedText
    };
  } catch(err) {
    console.error('Validation error:', err);
    return { success: false, detectedText: 'ERROR' };
  }
}

/**
 * Dedicated server-side image generation function using Vertex AI
 * Builds editorial journalistic prompt, calls Vertex AI Gemini image model, and returns real image data URL
 */
export async function generateImageWithVertex(
  slot: ImageSlotPlan,
  articleTitle: string,
  config: VertexServerConfig
): Promise<{ 
  success: boolean; 
  imageDataUrl: string; 
  promptSummary: string;
  coverTextValidation?: 'success'|'failed';
  coverTextDetected?: string;
  coverTextExpected?: string;
  coverTextAttempts?: number;
}> {
  // Determine aspect ratio: Featured 16:9, Inline 4:3 (unless explicitly 1:1)
  const isFeatured =
    slot.type === 'featured' || slot.slot_id === 'feature-1' || slot.slot_id?.startsWith('feature');
  let targetRatio = isFeatured ? '16:9' : '4:3';
  if (slot.aspect_ratio === '16:9') targetRatio = '16:9';
  else if (slot.aspect_ratio === '4:3') targetRatio = '4:3';
  else if (slot.aspect_ratio === '1:1') targetRatio = '1:1';

  // Build rich editorial prompt combining: article title, local context, concept, visual style rules, aspect ratio
  const contextHeading = slot.context_heading ? `Chủ đề phần nội dung: "${slot.context_heading}". ` : '';
  const contextPara = slot.context_paragraph
    ? `Bối cảnh chi tiết đoạn văn: "${slot.context_paragraph.slice(0, 260)}". `
    : '';
  const rawConcept =
    (slot.generation_prompt && slot.generation_prompt.trim()) ||
    slot.concept ||
    slot.suggested_concept ||
    '';
  const visualConcept = sanitizeBrandingPrompt(rawConcept);
  const orientation = isFeatured
    ? 'Ảnh ngang tỷ lệ rộng 16:9 (Wide 16:9 landscape aspect ratio), bố cục ảnh bìa báo chí'
    : 'Ảnh ngang tỷ lệ chuẩn 4:3 (Standard 4:3 editorial landscape aspect ratio), minh họa trong bài';

  const isDocVisual = isDocumentOrTableVisual(slot);

  let textRenderingDirective = '';
  let negativeConstraints = 'STRICT NEGATIVE CONSTRAINTS: Absolutely NO text, NO numbers, NO letters, NO words written in the image, NO corporate logos, NO brand names, NO company names, NO government-style emblems, NO seals, NO stamps, NO badges, NO watermarks, NO lettermarks, NO trademark-like symbols, NO fake logo placeholders, NO fake tax forms, NO cheesy handshake poses, NO cartoonish 3D render, NO artificial AI artifacts.';
  
  if (slot.enable_text_in_image && slot.cover_caption && slot.cover_caption.trim()) {
    textRenderingDirective = `\n\nARTICLE TOPIC:\n"${articleTitle || ''}"\n\nEXACT VIETNAMESE COVER HEADLINE TO RENDER:\n"${slot.cover_caption.trim()}"\n\nRender the EXACT Vietnamese headline shown above.\nPreserve every Vietnamese letter, accent mark, capitalization and word order.\nDo not translate it.\nDo not paraphrase it.\nDo not add words.\nDo not remove words.\nDo not create a second headline.\nDesign it as an intentional part of the editorial cover (1-3 lines, highly legible, strong contrast, professional typography).\nEnsure the text does not cover important faces or key visual blocks.\nLeave the bottom-right corner empty and safe for a later logo insertion.`;
    negativeConstraints = isDocVisual
      ? 'STRICT NEGATIVE CONSTRAINTS: Do NOT OCR or copy full text from any original document. Do NOT reproduce real company names, real tax identification numbers, or confidential figures. Render ONLY the requested headline text. Do NOT create corporate logos, brand names, watermarks, stamps, seals, government-style emblems, or fake logo placeholders. Generic invoice/document/table only. No cartoonish 3D render, no distorted AI artifacts.'
      : 'STRICT NEGATIVE CONSTRAINTS: Absolutely NO corporate logos, brand names, company names, emblems, seals, stamps, badges, watermarks, lettermarks, trademark-like symbols, or fake logo placeholders. Do not add any random decorative text other than the EXACT headline requested. Do not use cartoonish 3D renders or artificial AI artifacts.';
  } else if (isFeatured || slot.enable_text_in_image === false) {
    // Ensure no text if not enabled
    negativeConstraints = isDocVisual
      ? 'STRICT NEGATIVE CONSTRAINTS: Absolutely NO text, NO numbers, NO letters, NO words written in the image, NO corporate logos, NO brand names, NO company names, NO government-style emblems, NO seals, NO stamps, NO watermarks, NO lettermarks, NO fake logo placeholders. Generic invoice/document/table only. Do NOT reproduce the original document layout, do NOT copy confidential figures, real company names, or tax codes. No cartoonish 3D render, no artificial AI artifacts.'
      : 'STRICT NEGATIVE CONSTRAINTS: Absolutely NO text, NO numbers, NO letters, NO words written in the image, NO corporate logos, NO brand names, NO company names, NO government-style emblems, NO seals, NO stamps, NO watermarks, NO lettermarks, NO fake logo placeholders, NO fake tax forms, NO cheesy handshake poses, NO cartoonish 3D render, NO artificial AI artifacts.';
  }

  const docBrandingExtra = isDocVisual ? DOC_TABLE_BRANDING_DIRECTIVE : '';

  let prompt: string;
  if (isDocVisual) {
    prompt = `Professional Vietnamese accounting editorial illustration and explainer visual for a prestigious financial, taxation, and corporate magazine.
Topic of article: "${articleTitle || 'Kinh tế, Kế toán và Thuế Việt Nam'}".
${contextHeading}${contextPara}
Visual Subject & Concept: ${visualConcept}.
Key Visual Elements: A newly designed, simplified generic unbranded invoice or accounting document sheet, structured financial table blocks with clear visible rows and columns, adjustment rows and accounting entries, calculation blocks, clean accounting worksheet or laptop interface where appropriate. Generic invoice, document and table only: absolutely NO company logo, NO government-style emblem, NO seal or stamp, NO brand name, and NO fake logo placeholder. The visual immediately communicates Vietnamese accounting bookkeeping, invoice handling, and structured data tables.
Composition & Visual Style: ${orientation}. Clean modern graphic explainer illustration style with refined typography, balanced layout, professional corporate color palette (teal, navy, slate, warm paper tone). High clarity and sophistication.
Strict Privacy & Non-Duplication: Genuinely brand new composition. Do NOT copy the layout or trace the original document. Do NOT include real company names, real tax identification numbers, confidential figures, signatures, or official red stamps. Preserve only the accounting workflow meaning and topic.${textRenderingDirective}${SOURCE_BRANDING_REMOVAL_DIRECTIVE}${docBrandingExtra}

${negativeConstraints}`;
  } else {
    prompt = `Professional editorial journalism photography for a prestigious Vietnamese financial, taxation, and corporate magazine.
Topic of article: "${articleTitle || 'Kinh tế, Kế toán và Thuế Việt Nam'}".
${contextHeading}${contextPara}
Visual Subject & Concept: ${visualConcept}.
Composition & Aspect Ratio: ${orientation}. Sharp focus on human subjects, realistic documentary editorial style, shot on 50mm f/2.8 lens with shallow depth of field.
Setting & Atmosphere: Authentic contemporary Vietnamese business office or corporate workspace in Hanoi or Ho Chi Minh City. Natural soft daylight from office windows, minimalist wooden desks, Vietnamese business professionals, modern laptop displaying blurred financial charts.
Tone: Trustworthy, professional, sophisticated, warm neutral lighting.${textRenderingDirective}${SOURCE_BRANDING_REMOVAL_DIRECTIVE}${docBrandingExtra}

${negativeConstraints}`;
  }

  // Initialize official Google Gen AI SDK in Vertex AI mode
  const ai = new GoogleGenAI({
    vertexai: true,
    project: config.projectId,
    location: config.location,
  });

  const modelName = config.model || 'gemini-3-pro-image';

  let variationDirective = '';
  if (slot.variationAttempt && slot.variationAttempt > 0) {
    const directions = [
      'different camera angle',
      'different framing',
      'different subject arrangement',
      'different Vietnamese office environment',
      'wider environmental composition',
      'closer documentary composition',
      'different lighting direction',
      'minimalist editorial composition',
    ];
    const direction = directions[(slot.variationAttempt - 1) % directions.length];
    variationDirective = `\nREGENERATION DIRECTIVE: Create a genuinely new visual variation. Do not repeat the previous composition. Focus on: ${direction}.`;
  }

  try {
    const parts: any[] = [];

    // Safest simple rule: check if slot represents a sensitive document/table/source
    const isSensitiveVisual = Boolean(
      slot.is_sensitive_source ||
      slot.is_sensitive_document ||
      isDocumentOrTableVisual(slot)
    );

    const isSourceAiStrategy = slot.processing_strategy === 'GENERATE_FROM_SOURCE_AI';

    if (isSensitiveVisual) {
      if (isSourceAiStrategy) {
        throw new Error('Không cho phép gửi dữ liệu điểm ảnh (source pixels) của hóa đơn, bảng biểu hoặc tài liệu nhạy cảm tới mô hình sinh ảnh.');
      }
      if (slot.reference_image) {
        slot.reference_image.enabled = false;
      }
    }

    // Optional reference image guidance for AI generation (strictly disabled/ignored for sensitive visuals)
    const useReference =
      !isSensitiveVisual &&
      (isSourceAiStrategy || Boolean(slot.reference_image?.enabled && slot.reference_image?.choice !== 'none'));
    
    if (useReference) {
      let rawBuffer = null;
      let rawMime = '';

      if (isSourceAiStrategy) {
        // Strict sensitive-document safeguard: do NOT send source pixels to Gemini image generation
        if (slot.is_sensitive_source || slot.is_sensitive_document || isDocumentOrTableVisual(slot)) {
          throw new Error('Không cho phép gửi dữ liệu điểm ảnh (source pixels) của hóa đơn, bảng biểu hoặc tài liệu nhạy cảm tới mô hình sinh ảnh.');
        }

        // Must use original source priority for GENERATE_FROM_SOURCE_AI
        const potentialUrl = slot.source_image?.thumbnail_data_url || slot.source_image?.resolved_url || slot.source_resolved_url || slot.original_src || slot.old_src;
        if (potentialUrl && potentialUrl.startsWith('data:')) {
          const match = potentialUrl.match(/^data:([a-zA-Z0-9+/]+);base64,(.+)$/);
          if (match) {
            rawMime = match[1];
            rawBuffer = Buffer.from(match[2], 'base64');
          }
        } else if (potentialUrl && potentialUrl.startsWith('http')) {
          try {
            // Must fetch safely
            const fetched = await safeFetchImageBuffer(potentialUrl);
            if (fetched && fetched.buffer) {
               rawBuffer = fetched.buffer;
               rawMime = fetched.mimeType;
            }
          } catch (err) {
            console.warn('Could not fetch reference image from url', err);
          }
        }
        
        if (!rawBuffer) {
          throw new Error('Không tìm thấy ảnh gốc hợp lệ để tạo ảnh mới dựa trên ảnh nguồn.');
        }
      } else {
        // Standard reference image choice
        let choice = slot.reference_image?.choice || 'current_source';
        let potentialUrl = slot.reference_image?.data_url;
        if (!potentialUrl && choice === 'current_source') {
          potentialUrl = slot.source_image?.thumbnail_data_url || slot.source_image?.resolved_url || slot.source_resolved_url || slot.old_src;
        }
        if (potentialUrl && potentialUrl.startsWith('data:')) {
          const match = potentialUrl.match(/^data:([a-zA-Z0-9+/]+);base64,(.+)$/);
          if (match) {
            rawMime = match[1];
            rawBuffer = Buffer.from(match[2], 'base64');
          }
        } else if (potentialUrl && potentialUrl.startsWith('http')) {
          try {
            const fetched = await safeFetchImageBuffer(potentialUrl);
            if (fetched && fetched.buffer) {
               rawBuffer = fetched.buffer;
               rawMime = fetched.mimeType;
            }
          } catch (err) {}
        }
      }

      if (rawBuffer) {
        // Normalize using existing helper
        let finalBuffer = rawBuffer;
        let finalMime = rawMime;
        try {
          const normalized = await normalizeImageForAiVision(rawBuffer);
          if (!normalized) {
            if (isSourceAiStrategy) {
              throw new Error('Không thể chuẩn hóa ảnh nguồn để gửi AI.');
            }
          } else {
            finalBuffer = normalized.buffer;
            finalMime = normalized.mimeType;
          }
        } catch(e) {
          if (isSourceAiStrategy) {
            throw new Error('Không thể chuẩn hóa ảnh nguồn để gửi AI.');
          }
        }

        parts.push({
          inlineData: {
            mimeType: finalMime,
            data: finalBuffer.toString('base64')
          }
        });
      }
    }
    let referenceGuidance = '';
    if (parts.length > 0) {
      if (isSourceAiStrategy) {
        referenceGuidance = '\n\nSOURCE RECREATION DIRECTIVE:\n- Preserve the same core meaning/topic\n- Create a genuinely new composition\n- Do NOT create a near-duplicate\n- Do NOT trace the original\n- Do NOT copy the exact layout\n- Change framing/camera angle\n- Change subject arrangement\n- Change background/environment where appropriate\n- Change lighting/mood\n- Use different visual treatment\n- Preserve semantic meaning, not visual duplication\n- REMOVE ALL SOURCE BRANDING: Strictly ignore and remove all logos, company names, brand names, emblems, seals, badges, watermarks and trademark-like symbols from the source image. Replace with neutral, generic, unbranded visuals.';
      } else {
        referenceGuidance = '\n\nREFERENCE IMAGE GUIDANCE: A reference image is provided above solely for subject matter, camera angle, and composition inspiration. Generate an original, brand-new editorial photograph that reinterprets the concept in an authentic Vietnamese business setting. Do NOT copy pixel-for-pixel.\n- REMOVE ALL SOURCE BRANDING: Strictly ignore and remove all logos, company names, brand names, emblems, seals, badges, watermarks and trademark-like symbols from the reference image. Replace with neutral, generic, unbranded visuals.';
      }
    }
    parts.push({ text: prompt + variationDirective + referenceGuidance });

    let attempts = 0;
    const maxAttempts = 3;
    let finalImageDataUrl = '';
    let coverTextValidation: 'success' | 'failed' | undefined;
    let coverTextDetected: string | undefined;

    while (attempts < maxAttempts) {
      attempts++;
      
      const currentParts = [...parts];
      if (attempts > 1 && slot.cover_caption) {
         currentParts[currentParts.length - 1] = { 
           text: prompt + variationDirective + referenceGuidance + `\n\nRETRY DIRECTIVE: The previous attempt did not render the exact Vietnamese headline.\nRender EXACTLY:\n"${slot.cover_caption}"\nDo not alter any character or Vietnamese accent mark.`
         };
      }

      const response = await ai.models.generateContent({
        model: modelName,
        contents: [
          {
            role: 'user',
            parts: currentParts,
          },
        ],
        config: {
          imageConfig: {
            aspectRatio: targetRatio as any,
          },
        },
      });

      let imageDataUrl = '';
      if (response.candidates && response.candidates[0]?.content?.parts) {
        for (const part of response.candidates[0].content.parts) {
          if (part.inlineData && part.inlineData.data) {
            const mime = part.inlineData.mimeType || 'image/png';
            imageDataUrl = `data:${mime};base64,${part.inlineData.data}`;
            break;
          }
        }
      }

      if (!imageDataUrl) {
        if (attempts >= maxAttempts) {
          throw new Error(
            `Mô hình Vertex AI (${modelName}) phản hồi nhưng không chứa dữ liệu hình ảnh (inlineData rỗng) sau ${attempts} lần thử.`
          );
        }
        continue;
      }

      finalImageDataUrl = imageDataUrl;

      if (slot.enable_text_in_image && slot.cover_caption && slot.cover_caption.trim()) {
        const valRes = await validateGeneratedHeadline(ai, finalImageDataUrl, slot.cover_caption);
        coverTextDetected = valRes.detectedText;
        if (valRes.success) {
          coverTextValidation = 'success';
          break; // Validated, exit loop
        } else {
          coverTextValidation = 'failed';
          console.warn(`Validation failed on attempt ${attempts}. Expected: "${slot.cover_caption}", Detected: "${coverTextDetected}"`);
        }
      } else {
        break; // No validation needed
      }
    }

    return {
      success: true,
      imageDataUrl: finalImageDataUrl,
      promptSummary: visualConcept,
      coverTextValidation,
      coverTextDetected,
      coverTextExpected: slot.cover_caption,
      coverTextAttempts: attempts,
    };
  } catch (err: any) {
    console.error(`Vertex AI generation error with model ${modelName}:`, err);
    throw err;
  }
}

/**
 * 2. Generate Single Image using Vertex AI
 */
app.post('/api/generate-image', async (req, res) => {
  try {
    const { slot, articleTitle } = req.body;
    if (!slot || !slot.suggested_concept) {
      return res.status(400).json({ error: 'Thiếu thông tin vị trí ảnh hoặc mô tả concept.' });
    }

    // Safety rule: KEEP_ORIGINAL slots must NEVER be sent to image generation
    if (slot.classification === 'KEEP_ORIGINAL') {
      return res.status(400).json({
        error: 'Vị trí ảnh này được phân loại là KEEP_ORIGINAL (tài liệu/biểu mẫu/dữ liệu gốc), không được phép tạo ảnh thay thế.',
      });
    }

    // Sensitive-document safeguard: Invoice/document/form/table/sensitive source must NOT use GENERATE_FROM_SOURCE_AI
    if (
      slot.processing_strategy === 'GENERATE_FROM_SOURCE_AI' &&
      (slot.is_sensitive_source || slot.is_sensitive_document || isDocumentOrTableVisual(slot))
    ) {
      return res.status(400).json({
        error:
          'Không cho phép tạo ảnh dựa trên ảnh gốc (GENERATE_FROM_SOURCE_AI) đối với hóa đơn, chứng từ, biểu mẫu, bảng biểu hoặc tài liệu nhạy cảm. Vui lòng chọn Tạo hình mới bằng AI (GENERATE_AI).',
      });
    }

    // Check Vertex AI configuration and credentials readiness
    const readiness = getVertexReadiness();
    if (!readiness.is_ready) {
      return res.status(400).json({
        error: 'Chưa thể tạo ảnh: cấu hình Vertex AI hoặc thông tin xác thực chưa sẵn sàng.',
        notReady: true,
        details: readiness.status_message,
        readiness,
      });
    }

    // Call Vertex AI generation
    const result = await generateImageWithVertex(slot, articleTitle, serverVertexConfig);

    // Apply deterministic branding and WebP optimization using Sharp
    let finalImageDataUrl = result.imageDataUrl;
    let finalWidth = slot.type === 'featured' ? 1280 : 800;
    let finalHeight = slot.type === 'featured' ? 720 : 600;
    let brandApplied = false;

    try {
      const rawBuffer = bufferFromDataUrl(result.imageDataUrl);
      const branded = await applyBrandingWithSharp(rawBuffer, req.body.brandConfig, {
        slotType: slot.type,
        isSourceDoc: false,
      });
      finalImageDataUrl = `data:image/webp;base64,${branded.buffer.toString('base64')}`;
      finalWidth = branded.width;
      finalHeight = branded.height;
      brandApplied = branded.brandApplied;
    } catch (sharpErr) {
      console.warn('Sharp branding pipeline warning (using raw result):', sharpErr);
    }

    // Cache generated artifact in server session storage
    const filename = slot.final_filename || slot.suggested_filename || `${slot.slot_id}.webp`;
    generatedArtifactsCache.set(filename, {
      slot_id: slot.slot_id,
      filename,
      dataUrl: finalImageDataUrl,
      mime: 'image/webp',
      createdAt: new Date().toISOString(),
    });

    return res.json({
      success: true,
      imageDataUrl: finalImageDataUrl,
      promptSummary: result.promptSummary,
      width: finalWidth,
      height: finalHeight,
      mime_type: 'image/webp',
      brand_applied: brandApplied,
      generation_method: 'vertex_ai',
      cover_text_validation: result.coverTextValidation,
      cover_text_detected: result.coverTextDetected,
      cover_text_expected: result.coverTextExpected,
      cover_text_attempts: result.coverTextAttempts,
      provider: {
        type: 'vertex_ai',
        project_id_configured: Boolean(serverVertexConfig.projectId),
        location: serverVertexConfig.location,
        model: serverVertexConfig.model,
      },
    });
  } catch (error: any) {
    console.error('API generate-image with Vertex AI error:', error);
    const rawMsg = error.message || String(error);

    let friendlyError = `Tạo ảnh Vertex AI thất bại: ${rawMsg}`;
    if (/aiplatform\.googleapis\.com.*disabled|Service Disabled/i.test(rawMsg)) {
      friendlyError = `Dịch vụ Vertex AI (aiplatform.googleapis.com) chưa được kích hoạt trên project Google Cloud (${serverVertexConfig.projectId}). Vui lòng kích hoạt API này trong Google Cloud Console.`;
    } else if (/PERMISSION_DENIED|403/i.test(rawMsg)) {
      friendlyError = `Không có quyền truy cập Vertex AI trên project (${serverVertexConfig.projectId}): Vui lòng kiểm tra quyền hạn của Service Account hoặc ADC (vai trò Vertex AI User).`;
    } else if (/NOT_FOUND|404|Project not found/i.test(rawMsg)) {
      friendlyError = `Không tìm thấy Project ID Google Cloud (${serverVertexConfig.projectId}). Vui lòng kiểm tra lại cấu hình Project ID trong khung cấu hình Vertex AI.`;
    } else if (/quota|RESOURCE_EXHAUSTED|429/i.test(rawMsg)) {
      friendlyError = `Hạn mức tài nguyên Vertex AI tạm thời bị giới hạn (Quota Exceeded). Vui lòng thử lại sau giây lát.`;
    }

    return res.status(500).json({
      error: friendlyError,
      rawError: rawMsg,
      provider: {
        type: 'vertex_ai',
        project_id_configured: Boolean(serverVertexConfig.projectId),
        location: serverVertexConfig.location,
        model: serverVertexConfig.model,
      },
    });
  }
});

/**
 * 3. Deterministic Source Rebuilder for Sensitive Documents (REBUILD_FROM_SOURCE)
 * Generates a NEW WebP asset from the original image (resize, optimize, safe branding outside content)
 */
app.post('/api/rebuild-source-image', async (req, res) => {
  try {
    const { slot, brandConfig } = req.body;
    if (!slot) {
      return res.status(400).json({ error: 'Thiếu thông tin vị trí ảnh cần tạo bản mới.' });
    }

    const sourceUrl =
      slot.source_image?.thumbnail_data_url ||
      slot.source_image?.resolved_url ||
      slot.source_resolved_url ||
      slot.old_src ||
      slot.original_src ||
      '';
    if (!sourceUrl || !sourceUrl.trim()) {
      return res.status(400).json({
        error:
          'Không thể tải ảnh nguồn gốc (thiếu URL hoặc dữ liệu ảnh nguồn). REBUILD_FROM_SOURCE đã dừng để tránh tạo nội dung thay thế không chính xác.',
      });
    }
    const result = await rebuildSourceImage(sourceUrl, brandConfig, {
      slot_id: slot.slot_id,
      suggested_filename: slot.suggested_filename,
      title: slot.alt || slot.suggested_alt || slot.concept || 'Biểu mẫu chứng từ',
      aspect_ratio: slot.aspect_ratio,
    });

    const filename = slot.final_filename || slot.suggested_filename || `${slot.slot_id}.webp`;
    generatedArtifactsCache.set(filename, {
      slot_id: slot.slot_id,
      filename,
      dataUrl: result.imageDataUrl,
      mime: 'image/webp',
      createdAt: new Date().toISOString(),
    });

    return res.json({
      success: true,
      imageDataUrl: result.imageDataUrl,
      promptSummary: 'Bản WebP mới tạo từ tài liệu nguồn (bảo toàn 100% nội dung số liệu)',
      width: result.width,
      height: result.height,
      mime_type: 'image/webp',
      brand_applied: result.brandApplied,
      generation_method: 'deterministic_rebuild',
    });
  } catch (err: any) {
    console.error('API rebuild-source-image error:', err);
    return res.status(500).json({ error: err.message || 'Không thể tạo bản mới từ tài liệu gốc.' });
  }
});

/**
 * 4. Fallback High-Quality Mock Generator for testing/offline/demo mode
 * Creates an elegant editorial SVG with subtle gradients, editorial labels, and accounting graphics
 */
app.post('/api/generate-mock-image', async (req, res) => {
  try {
    const { slot, articleTitle, brandConfig } = req.body;
    const isFeatured = slot.type === 'featured';
    const width = isFeatured ? 1280 : 800;
    const height = isFeatured ? 720 : 600;

    const titleText = (slot.suggested_alt || slot.suggested_concept || 'KTDT Editorial')
      .replace(/"/g, "'")
      .slice(0, 60);

    const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#0f172a" />
          <stop offset="50%" stop-color="#1e293b" />
          <stop offset="100%" stop-color="#0f766e" />
        </linearGradient>
        <linearGradient id="cardGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="#ffffff" stop-opacity="0.12" />
          <stop offset="100%" stop-color="#ffffff" stop-opacity="0.04" />
        </linearGradient>
      </defs>
      <rect width="${width}" height="${height}" fill="url(#bg)" />
      
      <!-- Subtle Grid Pattern -->
      <g stroke="#ffffff" stroke-opacity="0.05" stroke-width="1">
        <line x1="0" y1="${height * 0.25}" x2="${width}" y2="${height * 0.25}" />
        <line x1="0" y1="${height * 0.5}" x2="${width}" y2="${height * 0.5}" />
        <line x1="0" y1="${height * 0.75}" x2="${width}" y2="${height * 0.75}" />
        <line x1="${width * 0.25}" y1="0" x2="${width * 0.25}" y2="${height}" />
        <line x1="${width * 0.5}" y1="0" x2="${width * 0.5}" y2="${height}" />
        <line x1="${width * 0.75}" y1="0" x2="${width * 0.75}" y2="${height}" />
      </g>

      <!-- Editorial Card Badge -->
      <rect x="48" y="48" width="180" height="36" rx="6" fill="#0284c7" fill-opacity="0.9" />
      <text x="58" y="71" fill="#ffffff" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="14" font-weight="600" letter-spacing="1">
        KTDT EDITORIAL
      </text>

      <!-- Slot Tag -->
      <rect x="238" y="48" width="120" height="36" rx="6" fill="#ffffff" fill-opacity="0.15" />
      <text x="248" y="71" fill="#e2e8f0" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="13" font-weight="500">
        ${isFeatured ? 'COVER 16:9' : 'INLINE 4:3'}
      </text>

      <!-- Center Graphical Motifs (Accounting & Business) -->
      <circle cx="${width / 2}" cy="${height / 2 - 30}" r="${isFeatured ? 90 : 70}" fill="none" stroke="#38bdf8" stroke-width="3" stroke-dasharray="6,6" opacity="0.4" />
      <circle cx="${width / 2}" cy="${height / 2 - 30}" r="${isFeatured ? 65 : 50}" fill="#0f766e" opacity="0.3" />
      
      <!-- Graph Bars -->
      <g transform="translate(${width / 2 - 40}, ${height / 2 - 20})">
        <rect x="0" y="0" width="16" height="40" rx="3" fill="#38bdf8" opacity="0.85" />
        <rect x="24" y="-25" width="16" height="65" rx="3" fill="#2dd4bf" opacity="0.95" />
        <rect x="48" y="-45" width="16" height="85" rx="3" fill="#f8fafc" opacity="0.9" />
        <rect x="72" y="-15" width="16" height="55" rx="3" fill="#38bdf8" opacity="0.75" />
      </g>

      <!-- Bottom Card with Concept Description -->
      <rect x="48" y="${height - 140}" width="${width - 96}" height="92" rx="10" fill="url(#cardGrad)" stroke="#ffffff" stroke-opacity="0.15" />
      <text x="72" y="${height - 100}" fill="#f8fafc" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="18" font-weight="600">
        ${titleText}
      </text>
      <text x="72" y="${height - 72}" fill="#94a3b8" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="13">
        Tệp: ${slot.suggested_filename} | Định dạng WebP chuẩn SEO biên tập KTDT
      </text>
    </svg>
    `;

    // Process through Sharp to WebP with brand overlay
    let finalImageDataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
    let finalWidth = width;
    let finalHeight = height;
    let brandApplied = false;

    try {
      const svgBuf = Buffer.from(svg);
      const branded = await applyBrandingWithSharp(svgBuf, brandConfig, {
        slotType: slot.type,
        isSourceDoc: slot.classification === 'KEEP_ORIGINAL' || slot.processing_strategy === 'REBUILD_FROM_SOURCE',
        targetWidth: width,
        targetHeight: height,
      });
      finalImageDataUrl = `data:image/webp;base64,${branded.buffer.toString('base64')}`;
      finalWidth = branded.width;
      finalHeight = branded.height;
      brandApplied = branded.brandApplied;
    } catch (sharpErr) {
      console.warn('Sharp mock branding warning:', sharpErr);
    }

    return res.json({
      success: true,
      imageDataUrl: finalImageDataUrl,
      promptSummary: `Ảnh demo: ${slot.suggested_concept}`,
      width: finalWidth,
      height: finalHeight,
      mime_type: 'image/webp',
      brand_applied: brandApplied,
      generation_method: 'mock_svg',
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// Start Express Server with Vite middleware
async function startServer() {
  const isProduction =
    process.env.NODE_ENV === 'production' ||
    Boolean(process.env.K_SERVICE) ||
    Boolean(__filenameResolved && __filenameResolved.includes('dist'));

  if (!isProduction) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(distIndexPath);
    });
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    const logoPath = resolveOfficialLogoPath();
    if (logoPath) {
      console.log(`[Startup] Official brand logo active at: ${logoPath}`);
    } else {
      console.warn('[Startup] Warning: Official brand logo not found in candidate paths.');
    }
    console.log(`KTDT AI Image Rebuilder server running at http://0.0.0.0:${PORT}`);
  });

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      if (isProduction) {
        console.error(
          `[Startup Fatal] Port ${PORT} is already in use. In production (Cloud Run), the server must listen strictly on process.env.PORT (${PORT}) without port fallback. Startup failed.`
        );
        process.exit(1);
      }

      const fallbackPort = Number(process.env.DEFAULT_APP_PORT) || 3000;
      if (PORT !== fallbackPort) {
        console.warn(
          `[Startup] Port ${PORT} is in use (development port collision). Falling back to port ${fallbackPort}...`
        );
        app.listen(fallbackPort, '0.0.0.0', () => {
          console.log(`KTDT AI Image Rebuilder server running at http://0.0.0.0:${fallbackPort}`);
        });
        return;
      }
    }
    throw err;
  });
}

startServer();
