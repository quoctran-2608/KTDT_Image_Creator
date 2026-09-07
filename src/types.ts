export type ImageClassification = 'REPLACE_AI' | 'KEEP_ORIGINAL' | 'MANUAL_REVIEW' | 'IGNORE';

export type ProcessingStrategy = 'GENERATE_AI' | 'REBUILD_FROM_SOURCE' | 'NEEDS_DECISION';

// Explicitly separated statuses (prevent conflating pixel retrieval with AI visual analysis)
export type SourceRetrievalStatus = 'not_attempted' | 'loading' | 'success' | 'failed';
export type VisualAnalysisStatus = 'not_started' | 'unavailable' | 'analyzing' | 'success' | 'failed';
export type ProcessingStrategyStatus = 'recommended' | 'manually_selected' | 'needs_decision';

export type SlotType = 'featured' | 'inline';

export type SlotStatus = 'pending' | 'generating' | 'completed' | 'failed' | 'skipped';

export type SourceImageMethod =
  | 'absolute_src'
  | 'live_article'
  | 'live_article_dom'
  | 'article_url_resolve'
  | 'base_url_resolve'
  | 'clipboard'
  | 'clipboard_paste'
  | 'upload'
  | 'manual_upload'
  | 'manual_url'
  | 'html_src';

export type MappingConfidence = 'high' | 'medium' | 'low';

export interface SourceImageInfo {
  method: SourceImageMethod;
  resolved_url: string;
  available: boolean; // Indicates if image pixels were successfully fetched
  source_retrieval_status?: SourceRetrievalStatus;
  visual_analysis_available: boolean; // Strictly true ONLY when AI multimodal visual analysis actually succeeded
  visual_analysis_status?: VisualAnalysisStatus;
  mapping_confidence?: MappingConfidence;
  mapping_reason?: string;
  thumbnail_data_url?: string;
  source_status_label?: string; // e.g. "✓ Đã tải ảnh thực tế"
  source_helper?: string; // e.g. "Nguồn: URL trong HTML", "Nguồn: URL bài viết gốc", "Nguồn: Base URL + src"
  error?: string;
  needs_confirmation?: boolean;
  matched_live_src?: string;
}

export type ReferenceImageChoice = 'none' | 'current_source' | 'custom' | 'custom_upload';

export interface ReferenceImageConfig {
  enabled: boolean;
  choice: ReferenceImageChoice;
  method?: 'current_source' | 'clipboard' | 'upload' | 'none' | string;
  data_url?: string;
  url?: string;
}

export type WatermarkMode = 'logo_and_text' | 'logo_only' | 'text_only' | 'none';

export type WatermarkPosition =
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

export type WatermarkScope = 'all' | 'featured_only' | 'inline_only';

export interface BrandProfile {
  enabled?: boolean;
  brand_name: string; // Tên thương hiệu (để trống nếu logo đã chứa sẵn tên)
  logo_url: string; // Data URL or URL of PNG, WebP, or SVG logo
  logo_uploaded?: boolean;
  watermark_mode: WatermarkMode;
  position: WatermarkPosition;
  logo_size: 'small' | 'medium' | 'large';
  opacity: number; // 0.1 - 1.0 (e.g. 0.85)
  edge_padding: number; // e.g. 24px
  padding?: number; // alias
  apply_to: WatermarkScope;
  default_credit?: string; // e.g. "Kế Toán Diệu Tâm"
  show_credit_in_article: boolean; // default false

  // Backwards compatibility flags
  show_logo?: boolean;
  show_brand_name?: boolean;
  apply_to_featured?: boolean;
  apply_to_ai_inline?: boolean;
  apply_to_source_docs?: boolean;
}

export interface BrandProfileManifest {
  enabled: boolean;
  brand_name: string;
  logo_uploaded: boolean;
  watermark_mode: string;
  position: string;
  opacity: number;
  padding: number;
  apply_to: string;
  apply_to_source_docs: boolean;
  default_credit: string;
  show_credit_in_article: boolean;
  // Optional compatibility fields from older handoff manifests.
  logo_mode?: 'custom_upload' | 'none';
  credit_applied?: string;
}

export interface ImageSlotPlan {
  slot_id: string; // e.g. "feature-1", "inline-1"
  type: SlotType;
  old_src: string;
  old_alt?: string;
  classification: ImageClassification;
  processing_strategy: ProcessingStrategy;
  reason: string; // Vietnamese explanation for classification
  context_heading?: string;
  nearby_heading?: string;
  context_paragraph?: string;
  context_before?: string;
  context_after?: string;
  suggested_concept: string; // Vietnamese prompt idea / visual concept
  suggested_filename: string; // e.g. "thoi-diem-xuat-hoa-don-feature.webp"
  suggested_alt: string; // Human-readable Vietnamese alt
  aspect_ratio: '16:9' | '4:3' | '1:1';
  selected: boolean; // Must produce a new asset
  status: SlotStatus;
  image_data_url?: string; // base64 or object url
  prompt_summary?: string;
  error_message?: string;
  original_index?: number;
  
  // Complete Editorial / SEO Metadata Package
  filename?: string; // e.g. "thoi-diem-xuat-hoa-don-feature.webp"
  alt_text?: string; // Concise Vietnamese accessibility alt text
  title?: string; // Short human-readable title
  caption?: string; // Editorial caption explaining significance in context
  credit?: string; // Brand / source credit (e.g. "Kế Toán Diệu Tâm")
  show_caption?: boolean; // Editor toggle to display <figcaption> caption
  show_credit?: boolean; // Editor toggle to display <figcaption> credit
  width?: number; // e.g. 1280 or 800
  height?: number; // e.g. 720 or 600
  mime_type?: string; // default "image/webp"
  generation_method?: 'vertex_ai' | 'deterministic_rebuild' | 'mock_svg';
  source_slot?: string;
  original_src?: string;
  final_src?: string;
  brand_applied?: boolean;
  brand_profile?: string;
  is_sensitive_source?: boolean;

  // Source image discovery & manual input
  source_image?: SourceImageInfo;
  source_resolved_url?: string;
  source_image_method?: SourceImageMethod;
  source_mapping_confidence?: MappingConfidence;
  source_status_label?: string;
  needs_source_confirmation?: boolean;

  // Optional Reference Image for GENERATE_AI
  reference_image?: ReferenceImageConfig;

  // Multimodal visual analysis & conflict detection
  visual_description?: string;
  textual_description?: string;
  text_visual_conflict?: boolean;
  classification_confidence?: 'high' | 'medium' | 'low';

  // Independent explicitly separated states
  source_retrieval_status?: SourceRetrievalStatus; // not_attempted | loading | success | failed
  visual_analysis_status?: VisualAnalysisStatus; // not_started | unavailable | analyzing | success | failed
  processing_strategy_status?: ProcessingStrategyStatus; // recommended | manually_selected | needs_decision

  // Aliases for compatibility
  final_filename?: string;
  alt?: string;
  concept?: string; // Vietnamese visual idea (editor-facing)
  generation_prompt?: string; // Advanced English prompt for image generator

  // Visual evidence & classification confidence
  confidence?: 'high' | 'medium' | 'low';
  visual_analysis_available?: boolean;
}

export interface SourceDiscoverySummaryItem {
  slot_id: string;
  type: SlotType;
  label: string;
  status: 'success' | 'warning' | 'error';
  method?: string;
  message: string;
  resolved_url?: string;
}

export interface ArticleAnalysis {
  title: string;
  excerpt: string;
  slug: string;
  content_container_selector: string;
  total_inline_images: number;
  replaceable_count: number;
  rebuild_source_count: number;
  keep_count: number;
  manual_count: number;
  needs_decision_count: number;
  ignore_count: number;
  article_url?: string;
  base_url?: string;
  source_discovery_summary?: SourceDiscoverySummaryItem[];
  plan: ImageSlotPlan[];
}

export interface VertexProviderInfo {
  type: 'vertex_ai';
  project_id_configured: boolean;
  location: string;
  model: string;
}

export interface VertexConfigStatus {
  vertex_enabled: boolean;
  project_id_configured: boolean;
  project_id: string;
  location: string;
  model: string;
  credentials_detected: boolean;
  credential_source: string;
  is_ready: boolean;
  status_message?: string;
  read_only?: boolean;
}

export interface ManifestSlotItem {
  slot_id: string;
  type: SlotType;
  processing_strategy: ProcessingStrategy;
  generation_status: SlotStatus;
  original_src: string;
  final_src: string;
  filename: string;
  alt_text: string;
  title: string;
  caption: string;
  credit: string;
  width: number;
  height: number;
  aspect_ratio: string;
  mime_type: string;
  brand_applied: boolean;
  brand_profile: string;
  generation_method: string;
  source_slot?: string;

  // Source & Reference Image tracking in Manifest
  source_image?: SourceImageInfo | any;
  reference_image?: ReferenceImageConfig | any;
  source_resolved_url?: string;
  source_image_method?: string;
  source_status_label?: string;
  reference_image_choice?: string;
  reference_image_used?: boolean;
  visual_description?: string;
  text_visual_conflict?: boolean;
  classification_confidence?: 'high' | 'medium' | 'low';
  source_retrieval_status?: SourceRetrievalStatus;
  visual_analysis_status?: VisualAnalysisStatus;
  processing_strategy_status?: ProcessingStrategyStatus;

  // Additional fields for backward compatibility and deep inspection
  classification?: ImageClassification;
  old_src?: string;
  old_alt?: string;
  proposed_src?: string;
  proposed_filename?: string;
  proposed_alt?: string;
  final_alt?: string;
  final_filename?: string;
  concept?: string;
  generation_prompt?: string;
  prompt_summary?: string;
  confidence?: 'high' | 'medium' | 'low';
  visual_analysis_available?: boolean;
  error_message?: string;
  status?: SlotStatus;
  alt?: string;
  image_data_url?: string;
}

export interface ImageManifest {
  article_title: string;
  article_slug: string;
  article_url?: string;
  base_url?: string;
  source_discovery_summary?: SourceDiscoverySummaryItem[];
  generated_at: string;
  output_base_path: string;
  provider: VertexProviderInfo;
  brand_config?: BrandProfile;
  brand_profile?: BrandProfileManifest;
  featured_image: ManifestSlotItem;
  inline_images: ManifestSlotItem[];
  artifacts_summary: {
    total_slots: number;
    selected_slots: number;
    completed_slots: number;
    failed_slots: number;
    needs_decision_slots: number;
    generated_files?: string[];
    status: 'ready' | 'pending' | 'has_errors';
  };
  updated_html: string;
}
