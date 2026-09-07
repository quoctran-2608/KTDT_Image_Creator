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
} from './src/utils/htmlProcessor';
import {
  slugifyVietnamese,
  ensureWebpExtension,
  generateFeaturedFilename,
  generateInlineFilename,
  makeUniqueFilenames,
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
  model: process.env.VERTEX_MODEL || 'gemini-3.1-flash-image',
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
      model: 'gemini-2.5-flash',
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
      model: 'gemini-2.5-flash',
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

/**
 * 1. Analyze Article HTML and build the Image Plan
 */
app.post('/api/analyze-article', async (req, res) => {
  try {
    const { htmlSource, articleUrl: rawArticleUrl, baseUrl: rawBaseUrl } = req.body;
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
    const { title, excerpt, slug, contentSelector, images, featuredImageInfo } = parsed;

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
      suggested_concept: `Chuyên viên kế toán doanh nghiệp Việt Nam làm việc tại văn phòng hiện đại, ánh sáng tự nhiên, liên quan chủ đề: "${title}"`,
      generation_prompt: `High quality editorial journalism photography of a professional Vietnamese corporate accountant working in a modern office in Vietnam, natural office window lighting, shallow depth of field, 50mm f/2.8 lens, related to: "${title}".`,
      suggested_filename: generateFeaturedFilename(slug),
      suggested_alt: `Ảnh minh họa chuyên viên tài chính kế toán rà soát chứng từ liên quan ${title.toLowerCase()}`,
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

    discoveryResults.forEach((res) => {
      const targetSlot = slots.find((s) => s.slot_id === res.slot_id);
      if (!targetSlot) return;

      targetSlot.source_image = res.source_image;
      targetSlot.source_resolved_url = res.source_image.resolved_url;
      targetSlot.source_image_method = res.source_image.method;
      targetSlot.source_mapping_confidence = res.source_image.mapping_confidence;
      targetSlot.source_status_label = res.source_image.source_status_label;
      targetSlot.needs_source_confirmation = Boolean(res.source_image.needs_confirmation);
      targetSlot.visual_analysis_available = Boolean(res.source_image.available);

      if (res.imageBuffer && res.mimeType) {
        slotImageBuffers.set(res.slot_id, {
          buffer: res.imageBuffer,
          mimeType: res.mimeType,
        });
      }

      // Configure default reference image
      if (targetSlot.type === 'featured') {
        targetSlot.reference_image = {
          enabled: false,
          choice: 'none',
          method: 'none',
        };
      } else {
        if (res.source_image.available && res.source_image.thumbnail_data_url) {
          targetSlot.reference_image = {
            enabled: true,
            choice: 'current_source',
            method: 'current_source',
            data_url: res.source_image.thumbnail_data_url,
          };
        } else {
          targetSlot.reference_image = {
            enabled: false,
            choice: 'none',
            method: 'none',
          };
        }
      }
    });

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
        const promptText = `Bạn là chuyên gia biên tập hình ảnh cho báo chí kinh tế, thuế, kế toán doanh nghiệp Việt Nam (KTDT).
Nhiệm vụ: Phân tích bài viết và xây dựng kế hoạch phân loại, xử lý hình ảnh dựa trên CẢ HAI nguồn bằng chứng:
1. Bằng chứng ngữ cảnh văn bản (tiêu đề, heading mục, đoạn văn xung quanh, src, alt).
2. Bằng chứng thị giác thực tế (xem trực tiếp nội dung các bức ảnh đính kèm nếu có).

Tiêu đề bài viết: "${title}"
Tóm tắt: "${excerpt || 'Không có'}"
Slug: "${slug}"

Danh sách ${images.length} vị trí ảnh trong bài viết:
${images
  .map((img, i) => {
    const slotId = `inline-${i + 1}`;
    const hasVisual = slotImageBuffers.has(slotId);
    const slotObj = slots.find((s) => s.slot_id === slotId);
    return `
[Vị trí ảnh inline #${i + 1}]
- Slot ID: ${slotId}
- Nguồn ảnh cũ (src): ${img.old_src}
- Alt cũ: ${img.old_alt || 'Trống'}
- Tiêu đề mục (heading): ${img.context_heading || 'Không có'}
- Đoạn văn trước ảnh: ${img.context_before || 'Không có'}
- Đoạn văn sau ảnh: ${img.context_after || 'Không có'}
- Phương thức tìm ảnh: ${slotObj?.source_image?.source_status_label || 'Chưa rõ'}
- URL ảnh đã xác định: ${slotObj?.source_resolved_url || 'Chưa có'}
- Phân tích thị giác: ${hasVisual ? 'ĐÃ CÓ ảnh thực tế đính kèm bên dưới' : 'KHÔNG thể tải ảnh thực tế (chỉ phân tích văn bản)'}
- Heuristic ban đầu: ${img.heuristic_classification} (${img.heuristic_reason})
`;
  })
  .join('\n')}

QUY TẮC PHÂN LOẠI & BIÊN TẬP HÌNH ẢNH:
1. QUY TẮC PHÁT HIỆN MÂU THUẪN GIỮA THỊ GIÁC VÀ VĂN BẢN (TEXT-VISUAL CONFLICT):
   - Bằng chứng thị giác thực tế luôn có trọng lượng cao hơn alt text cũ hoặc ngữ cảnh văn bản xung quanh.
   - Nếu alt text hoặc văn bản xung quanh nói về "Bản chụp biểu mẫu thuế", "Hóa đơn", "Chứng từ", "Bản scan", nhưng hình ảnh thực tế cho thấy một người làm việc, xe ô tô, cảnh vật, ảnh stock văn phòng:
     + Đánh dấu \`text_visual_conflict = true\`.
     + Không phân loại thành KEEP_ORIGINAL.
     + Nếu ảnh là stock/ảnh minh họa chung, phân loại là REPLACE_AI (hoặc MANUAL_REVIEW nếu chưa rõ).
     + Nêu rõ trong \`visual_description\` và \`reason\` rằng hình ảnh thực tế khác với mô tả văn bản.

2. NGUYÊN TẮC PHÂN LOẠI KẾT HỢP THỊ GIÁC & VĂN BẢN:
   - TUYỆT ĐỐI KHÔNG phân loại KEEP_ORIGINAL chỉ vì bài viết hay văn bản xung quanh nói về hợp đồng, thuế, luật, hóa đơn.
   - Bằng chứng thị giác (khi có ảnh đính kèm, visual_analysis_available = true):
     + Nếu ảnh thực tế rõ ràng là bản chụp/scan công văn, tờ khai, biểu mẫu nhà nước có mộc đỏ, chữ ký, con dấu, logo đối tác/tạp chí => KEEP_ORIGINAL, confidence: 'high'.
     + Nếu ảnh thực tế là bảng biểu số liệu chi tiết, biểu đồ tài chính, ảnh chụp màn hình phần mềm thực tế (screenshot MISA, eTax...) => MANUAL_REVIEW, confidence: 'high' hoặc 'medium'.
     + Nếu ảnh thực tế là ảnh stock người làm việc, văn phòng, họp bàn, bắt tay, laptop, hoặc ảnh minh họa chung => REPLACE_AI, confidence: 'high'.
   - Khi KHÔNG có ảnh thực tế đính kèm (visual_analysis_available = false - chỉ có ngữ cảnh văn bản):
     + ĐẶC BIỆT CẨN TRỌNG với các loại ảnh nhạy cảm: bản scan/chụp biểu mẫu, screenshots, bảng số liệu, biểu đồ, mẫu tờ khai, con dấu mộc đỏ, chữ ký, logo, tài liệu nguồn:
       TUYỆT ĐỐI KHÔNG tự động kết luận KEEP_ORIGINAL trừ khi có bằng chứng cực kỳ chắc chắn (như đường dẫn URL file /logo.png).
       BẮT BUỘC phân loại là: MANUAL_REVIEW, confidence: 'low', visual_analysis_available: false, reason: "Chưa phân tích được ảnh thực tế; quyết định hiện dựa trên ngữ cảnh văn bản."
     + Dựa trên src/alt: nếu rõ ràng là stock/placeholder hoặc alt có "ảnh minh họa" => REPLACE_AI, confidence: 'high'.
     + Nếu thông tin mâu thuẫn hoặc không đủ bằng chứng => MANUAL_REVIEW, confidence: 'low', reason: "Chưa phân tích được ảnh thực tế; quyết định hiện dựa trên ngữ cảnh văn bản."

3. TIÊU CHUẨN MÔ TẢ ẢNH (AUTO-CLEAN ALT TEXT):
   - TUYỆT ĐỐI KHÔNG chứa từ ngữ mô tả nguồn gốc hoặc trạng thái: "ảnh stock", "ảnh minh họa", "ảnh cũ", "hình cũ", "placeholder", "stock", "cũ".
   - Alt text phải là câu văn mô tả TRỰC TIẾP nội dung thị giác của bức ảnh, viết bằng Tiếng Việt tự nhiên, súc tích, chuẩn trợ năng (accessibility) và biên tập báo chí.

4. CẤU TRÚC Ý TƯỞNG HÌNH ẢNH (2 LỚP):
   - "concept" (Ý tưởng hình ảnh - Tiếng Việt tự nhiên cho biên tập viên).
   - "generation_prompt" (Prompt tạo ảnh Tiếng Anh chi tiết cho Vertex AI).
   - "visual_description": Tóm tắt ngắn gọn những gì mắt người thực sự nhìn thấy trong bức ảnh (nếu có ảnh).
   - "textual_description": Tóm tắt ngắn gọn những gì văn bản / alt xung quanh đề cập.
   - "text_visual_conflict": true nếu có sự mâu thuẫn giữa hình ảnh thực tế và văn bản/alt, false nếu thống nhất.

5. TÁI TẠO SIÊU DỮ LIỆU BÁO CHÍ (EDITORIAL METADATA):
   - TUYỆT ĐỐI KHÔNG dùng chuỗi thô từ tên tệp không dấu (như "Cach lam so sach ke toan tren excel") làm alt, title hay caption.
   - BẮT BUỘC tái tạo toàn diện bằng Tiếng Việt tự nhiên chuẩn mực, có dấu thanh trang trọng:
     + alt: Văn bản thay thế tự nhiên mô tả nội dung ảnh (VD: "Cửa sổ bảng tính Excel dùng để theo dõi và lập sổ sách kế toán.").
     + title: Tiêu đề ảnh súc tích, 5-8 từ, có dấu (VD: "Lập sổ sách kế toán trên Excel").
     + caption: Chú thích ảnh giải thích ý nghĩa ngữ cảnh trong bài viết (VD: "Mẫu bảng tính hỗ trợ kế toán theo dõi và tổng hợp sổ sách trên Excel.").
`;

        // Assemble multimodal parts: text prompt + inlineData for each available image
        const contentsParts: any[] = [{ text: promptText }];

        // Check featured image buffer if available
        if (slotImageBuffers.has('feature-1')) {
          const fb = slotImageBuffers.get('feature-1')!;
          contentsParts.push({
            text: `\n--- [Dữ liệu hình ảnh thực tế của Slot feature-1 (${slots[0].old_src})] ---`,
          });
          contentsParts.push({
            inlineData: {
              mimeType: fb.mimeType,
              data: fb.buffer.toString('base64'),
            },
          });
        }

        images.forEach((img, i) => {
          const slotId = `inline-${i + 1}`;
          if (slotImageBuffers.has(slotId)) {
            const bufObj = slotImageBuffers.get(slotId)!;
            contentsParts.push({
              text: `\n--- [Dữ liệu hình ảnh thực tế của Slot ${slotId} (${img.old_src})] ---`,
            });
            contentsParts.push({
              inlineData: {
                mimeType: bufObj.mimeType,
                data: bufObj.buffer.toString('base64'),
              },
            });
          }
        });

        const response = await ai.models.generateContent({
          model: analysisClient.model,
          contents: [
            {
              role: 'user',
              parts: contentsParts,
            },
          ],
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                featured_concept: { type: Type.STRING },
                featured_generation_prompt: { type: Type.STRING },
                featured_alt: { type: Type.STRING },
                featured_title: { type: Type.STRING },
                featured_caption: { type: Type.STRING },
                inline_updates: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      slot_id: { type: Type.STRING },
                      classification: {
                        type: Type.STRING,
                        description: 'REPLACE_AI, KEEP_ORIGINAL, MANUAL_REVIEW, or IGNORE',
                      },
                      confidence: {
                        type: Type.STRING,
                        description: 'high, medium, or low',
                      },
                      visual_analysis_available: {
                        type: Type.BOOLEAN,
                      },
                      reason: { type: Type.STRING },
                      concept: { type: Type.STRING },
                      generation_prompt: { type: Type.STRING },
                      filename: { type: Type.STRING },
                      alt: { type: Type.STRING },
                      title: { type: Type.STRING },
                      caption: { type: Type.STRING },
                      visual_description: { type: Type.STRING },
                      textual_description: { type: Type.STRING },
                      text_visual_conflict: { type: Type.BOOLEAN },
                    },
                    required: [
                      'slot_id',
                      'classification',
                      'confidence',
                      'visual_analysis_available',
                      'reason',
                      'concept',
                      'generation_prompt',
                      'filename',
                      'alt',
                      'title',
                      'caption',
                    ],
                  },
                },
              },
              required: [
                'featured_concept',
                'featured_generation_prompt',
                'featured_alt',
                'featured_title',
                'featured_caption',
                'inline_updates',
              ],
            },
          },
        });

        if (response.text) {
          const aiResult = JSON.parse(response.text);
          if (aiResult.featured_concept) {
            slots[0].suggested_concept = aiResult.featured_concept;
            slots[0].concept = aiResult.featured_concept;
          }
          if (aiResult.featured_generation_prompt) {
            slots[0].generation_prompt = aiResult.featured_generation_prompt;
          }
          if (aiResult.featured_alt) {
            const cleaned = cleanEditorialAltText(aiResult.featured_alt, title);
            slots[0].suggested_alt = cleaned;
            slots[0].alt = cleaned;
          }
          if (aiResult.featured_title) {
            slots[0].title = aiResult.featured_title;
          }
          if (aiResult.featured_caption) {
            slots[0].caption = aiResult.featured_caption;
          }

          // Featured visual analysis status
          if (slotImageBuffers.has('feature-1')) {
            slots[0].visual_analysis_status = 'success';
            slots[0].visual_analysis_available = true;
          } else {
            slots[0].visual_analysis_status = 'unavailable';
            slots[0].visual_analysis_available = false;
          }
          slots[0].processing_strategy = 'GENERATE_AI';
          slots[0].processing_strategy_status = 'recommended';
          slots[0].selected = true;

          if (Array.isArray(aiResult.inline_updates)) {
            aiResult.inline_updates.forEach((update: any) => {
              const target = slots.find((s) => s.slot_id === update.slot_id);
              if (target) {
                const hasBuffer = slotImageBuffers.has(target.slot_id);

                // SEPARATE SOURCE RETRIEVAL FROM VISUAL ANALYSIS:
                // Visual analysis status is success ONLY if pixels were available and AI analyzed them
                if (hasBuffer && update.visual_analysis_available !== false) {
                  target.visual_analysis_status = 'success';
                  target.visual_analysis_available = true;
                } else {
                  target.visual_analysis_status = 'unavailable';
                  target.visual_analysis_available = false;
                }

                if (
                  ['REPLACE_AI', 'KEEP_ORIGINAL', 'MANUAL_REVIEW', 'IGNORE'].includes(
                    update.classification
                  )
                ) {
                  target.classification = update.classification as ImageClassification;
                }
                if (['high', 'medium', 'low'].includes(update.confidence)) {
                  target.confidence = update.confidence;
                  target.classification_confidence = update.confidence;
                }

                // REFINED PROCESSING STRATEGY LOGIC:
                // When visual analysis succeeds with high confidence and no conflict:
                // automatically recommend one of: GENERATE_AI or REBUILD_FROM_SOURCE.
                // When confidence is low or evidence conflicts or manual review:
                // set NEEDS_DECISION and processing_strategy_status = 'needs_decision'.
                const isHighConfidenceNoConflict =
                  target.confidence === 'high' &&
                  !update.text_visual_conflict &&
                  target.classification !== 'MANUAL_REVIEW';

                if (target.visual_analysis_status === 'success' && isHighConfidenceNoConflict) {
                  if (target.classification === 'KEEP_ORIGINAL') {
                    target.processing_strategy = 'REBUILD_FROM_SOURCE';
                    target.is_sensitive_source = true;
                    target.processing_strategy_status = 'recommended';
                    target.selected = true;
                  } else {
                    target.processing_strategy = 'GENERATE_AI';
                    target.processing_strategy_status = 'recommended';
                    target.selected = true;
                  }
                } else {
                  // Low confidence, conflict, or manual review
                  target.processing_strategy = 'NEEDS_DECISION';
                  target.processing_strategy_status = 'needs_decision';
                  target.selected = false;
                }

                if (update.reason) target.reason = update.reason;
                if (update.concept) {
                  target.suggested_concept = update.concept;
                  target.concept = update.concept;
                }
                if (update.generation_prompt) {
                  target.generation_prompt = update.generation_prompt;
                }
                if (update.filename) {
                  const cleaned = slugifyVietnamese(update.filename, 60);
                  target.suggested_filename = ensureWebpExtension(cleaned);
                }
                if (update.alt) {
                  const cleanedAlt = cleanEditorialAltText(
                    update.alt,
                    target.context_heading || title
                  );
                  target.suggested_alt = cleanedAlt;
                  target.alt = cleanedAlt;
                }
                if (update.title) {
                  target.title = update.title;
                }
                if (update.caption) {
                  target.caption = update.caption;
                }
                if (update.visual_description) {
                  target.visual_description = update.visual_description;
                }
                if (update.textual_description) {
                  target.textual_description = update.textual_description;
                }
                if (typeof update.text_visual_conflict === 'boolean') {
                  target.text_visual_conflict = update.text_visual_conflict;
                }
              }
            });
          }
        }
      } catch (geminiErr) {
        console.warn('Gemini optimization fallback to heuristics:', geminiErr);
        slots.forEach((s) => {
          s.visual_analysis_status = 'failed';
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
            } else {
              s.processing_strategy = 'GENERATE_AI';
              s.processing_strategy_status = 'recommended';
              s.selected = true;
            }
          }
        });
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
              'Vertex AI chưa được cấu hình. Hệ thống hiện chỉ dựa trên ngữ cảnh bài viết; hình ảnh nhạy cảm cần biên tập viên quyết định.';
          } else {
            s.processing_strategy = 'GENERATE_AI';
            s.processing_strategy_status = 'recommended';
            s.selected = true;
            s.reason = 'Ảnh minh họa dựa trên ngữ cảnh bài viết.';
          }
        }
      });
    }

    // Safeguard 1: Ensure feature-1 is always REPLACE_AI and selected
    if (slots[0]) {
      slots[0].classification = 'REPLACE_AI';
      slots[0].processing_strategy = 'GENERATE_AI';
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
          if (s.visual_analysis_available && s.confidence === 'high') {
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
      if (!s.generation_prompt) {
        s.generation_prompt = `Documentary editorial photography of a Vietnamese finance accountant in a modern office in Vietnam, natural light, 50mm lens.`;
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
      title,
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

/**
 * Dedicated server-side image generation function using Vertex AI
 * Builds editorial journalistic prompt, calls Vertex AI Gemini image model, and returns real image data URL
 */
export async function generateImageWithVertex(
  slot: ImageSlotPlan,
  articleTitle: string,
  config: VertexServerConfig
): Promise<{ success: boolean; imageDataUrl: string; promptSummary: string }> {
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
  const visualConcept =
    (slot.generation_prompt && slot.generation_prompt.trim()) ||
    slot.concept ||
    slot.suggested_concept ||
    '';
  const orientation = isFeatured
    ? 'Ảnh ngang tỷ lệ rộng 16:9 (Wide 16:9 landscape aspect ratio), bố cục ảnh bìa báo chí'
    : 'Ảnh ngang tỷ lệ chuẩn 4:3 (Standard 4:3 editorial landscape aspect ratio), minh họa trong bài';

  const prompt = `Professional editorial journalism photography for a prestigious Vietnamese financial, taxation, and corporate magazine.
Topic of article: "${articleTitle || 'Kinh tế, Kế toán và Thuế Việt Nam'}".
${contextHeading}${contextPara}
Visual Subject & Concept: ${visualConcept}.
Composition & Aspect Ratio: ${orientation}. Sharp focus on human subjects, realistic documentary editorial style, shot on 50mm f/2.8 lens with shallow depth of field.
Setting & Atmosphere: Authentic contemporary Vietnamese business office or corporate workspace in Hanoi or Ho Chi Minh City. Natural soft daylight from office windows, minimalist wooden desks, Vietnamese business professionals, modern laptop displaying blurred financial charts.
Tone: Trustworthy, professional, sophisticated, warm neutral lighting.
STRICT NEGATIVE CONSTRAINTS: Absolutely NO text, NO numbers, NO letters, NO words written in the image, NO corporate logos, NO watermarks, NO fake stamps, NO government seals, NO fake tax forms, NO cheesy handshake poses, NO cartoonish 3D render, NO artificial AI artifacts.`;

  // Initialize official Google Gen AI SDK in Vertex AI mode
  const ai = new GoogleGenAI({
    vertexai: true,
    project: config.projectId,
    location: config.location,
  });

  const modelName = config.model || 'gemini-3.1-flash-image';

  try {
    const parts: any[] = [];

    // Optional reference image guidance for AI generation
    if (slot.reference_image?.enabled && slot.reference_image?.choice !== 'none') {
      let refDataUrl = slot.reference_image.data_url;
      if (!refDataUrl && slot.reference_image.choice === 'current_source') {
        refDataUrl = slot.source_image?.thumbnail_data_url || slot.image_data_url;
      }

      if (refDataUrl && refDataUrl.startsWith('data:')) {
        const match = refDataUrl.match(/^data:(image\/[a-zA-Z0-9.+_-]+);base64,(.+)$/);
        if (match) {
          parts.push({
            inlineData: {
              mimeType: match[1],
              data: match[2],
            },
          });
        }
      }
    }

    const referenceGuidance =
      parts.length > 0
        ? '\nREFERENCE IMAGE GUIDANCE: A reference image is provided above solely for subject matter, camera angle, and composition inspiration. Generate an original, brand-new editorial photograph that reinterprets the concept in an authentic Vietnamese business setting. Do NOT copy pixel-for-pixel.'
        : '';

    parts.push({ text: prompt + referenceGuidance });

    const response = await ai.models.generateContent({
      model: modelName,
      contents: [
        {
          role: 'user',
          parts,
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
      throw new Error(
        `Mô hình Vertex AI (${modelName}) phản hồi nhưng không chứa dữ liệu hình ảnh (inlineData rỗng).`
      );
    }

    return {
      success: true,
      imageDataUrl,
      promptSummary: visualConcept,
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
      slot.image_data_url ||
      slot.source_image?.resolved_url ||
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
