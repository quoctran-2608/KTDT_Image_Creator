import { BrandProfile, BrandProfileManifest, WatermarkMode, WatermarkScope } from '../types';

export const BRAND_PROFILE_STORAGE_KEY = 'ktdt:image-rebuilder:brand-profile:v1';

const WATERMARK_MODES: WatermarkMode[] = ['logo_and_text', 'logo_only', 'text_only', 'none'];
const WATERMARK_SCOPES: WatermarkScope[] = ['all', 'featured_only', 'inline_only'];
const WATERMARK_POSITIONS = [
  'bottom-right',
  'bottom-left',
  'top-right',
  'top-left',
  'bottom-center',
  'bottom_right',
  'bottom_left',
  'top_right',
  'top_left',
  'bottom_center',
] as const;
const LOGO_SIZES = ['small', 'medium', 'large'] as const;

/**
 * The single source of truth for global publishing branding defaults.
 * A real logo is opt-in: the safe default uses the configured brand text only.
 */
export const DEFAULT_BRAND_PROFILE: BrandProfile = {
  enabled: true,
  brand_name: 'Kế Toán Diệu Tâm',
  logo_url: '',
  logo_uploaded: false,
  watermark_mode: 'text_only',
  position: 'bottom-right',
  logo_size: 'medium',
  opacity: 0.85,
  edge_padding: 24,
  padding: 24,
  apply_to: 'all',
  apply_to_source_docs: false,
  default_credit: 'Kế Toán Diệu Tâm',
  show_credit_in_article: false,
  // Legacy fields are retained for compatibility with existing payloads.
  show_logo: false,
  show_brand_name: true,
  apply_to_featured: true,
  apply_to_ai_inline: true,
};

export interface ResolvedBrandWatermark {
  showLogo: boolean;
  showBrandName: boolean;
  isApplied: boolean;
  usesTextFallback: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stringValue(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function numberValue(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function isOneOf<T extends readonly string[]>(value: unknown, options: T): value is T[number] {
  return typeof value === 'string' && options.includes(value);
}

function resolveWatermarkMode(profile: Record<string, unknown>): WatermarkMode {
  if (isOneOf(profile.watermark_mode, WATERMARK_MODES)) return profile.watermark_mode;
  if (profile.show_logo === false && profile.show_brand_name === false) return 'none';
  if (profile.show_logo === false) return 'text_only';
  if (profile.show_brand_name === false) return 'logo_only';
  return DEFAULT_BRAND_PROFILE.watermark_mode;
}

function resolveWatermarkScope(profile: Record<string, unknown>): WatermarkScope {
  if (isOneOf(profile.apply_to, WATERMARK_SCOPES)) return profile.apply_to;
  if (profile.apply_to_featured === false && profile.apply_to_ai_inline !== false) return 'inline_only';
  if (profile.apply_to_featured !== false && profile.apply_to_ai_inline === false) return 'featured_only';
  return DEFAULT_BRAND_PROFILE.apply_to;
}

/**
 * Normalizes old, partial, and untrusted persisted settings before they reach UI, API, or manifest.
 */
export function normalizeBrandProfile(profile: Partial<BrandProfile> | unknown = {}): BrandProfile {
  const raw = isRecord(profile) ? profile : {};
  const watermark_mode = resolveWatermarkMode(raw);
  const apply_to = resolveWatermarkScope(raw);
  const brand_name = stringValue(raw.brand_name, DEFAULT_BRAND_PROFILE.brand_name);
  const rawLogoUrl = stringValue(raw.logo_url);
  const logo_url = /^data:image\/[a-zA-Z0-9.+_-]+;base64,/i.test(rawLogoUrl)
    ? rawLogoUrl
    : '';
  const padding = Math.max(
    numberValue(raw.padding, numberValue(raw.edge_padding, DEFAULT_BRAND_PROFILE.padding ?? 24)),
    8
  );
  const position = isOneOf(raw.position, WATERMARK_POSITIONS)
    ? raw.position
    : DEFAULT_BRAND_PROFILE.position;
  const logo_size = isOneOf(raw.logo_size, LOGO_SIZES)
    ? raw.logo_size
    : DEFAULT_BRAND_PROFILE.logo_size;

  return {
    ...DEFAULT_BRAND_PROFILE,
    enabled: booleanValue(raw.enabled, watermark_mode !== 'none'),
    brand_name,
    logo_url,
    logo_uploaded: booleanValue(raw.logo_uploaded, Boolean(logo_url)) && Boolean(logo_url),
    watermark_mode,
    position,
    logo_size,
    opacity: Math.min(Math.max(numberValue(raw.opacity, DEFAULT_BRAND_PROFILE.opacity), 0.1), 1),
    edge_padding: padding,
    padding,
    apply_to,
    // Source documents are deliberately independent from normal inline-image scope.
    apply_to_source_docs: booleanValue(raw.apply_to_source_docs, false),
    default_credit: stringValue(raw.default_credit, brand_name),
    show_credit_in_article: booleanValue(raw.show_credit_in_article, false),
    show_logo: watermark_mode === 'logo_and_text' || watermark_mode === 'logo_only',
    show_brand_name: watermark_mode === 'logo_and_text' || watermark_mode === 'text_only',
    apply_to_featured: apply_to === 'all' || apply_to === 'featured_only',
    apply_to_ai_inline: apply_to === 'all' || apply_to === 'inline_only',
  };
}

export function loadPersistedBrandProfile(): BrandProfile {
  if (typeof window === 'undefined') return DEFAULT_BRAND_PROFILE;

  try {
    const stored = window.localStorage.getItem(BRAND_PROFILE_STORAGE_KEY);
    if (!stored) return DEFAULT_BRAND_PROFILE;
    const parsed: unknown = JSON.parse(stored);
    if (!isRecord(parsed)) throw new Error('Brand Profile stored value must be an object.');
    return normalizeBrandProfile(parsed);
  } catch {
    // A bad or outdated browser value must never prevent the editor from loading.
    try {
      window.localStorage.removeItem(BRAND_PROFILE_STORAGE_KEY);
    } catch {
      // Storage may be unavailable or blocked; use the in-memory safe default.
    }
    return DEFAULT_BRAND_PROFILE;
  }
}

export function persistBrandProfile(profile: BrandProfile): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(BRAND_PROFILE_STORAGE_KEY, JSON.stringify(normalizeBrandProfile(profile)));
  } catch {
    // Keep editing functional when storage is full, disabled, or unavailable.
  }
}

export function clearPersistedBrandProfile(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(BRAND_PROFILE_STORAGE_KEY);
  } catch {
    // Reset still succeeds in memory when storage is unavailable.
  }
}

export function hasUploadedLogo(profile: Pick<BrandProfile, 'logo_url'>): boolean {
  return /^data:image\/[a-zA-Z0-9.+_-]+;base64,/i.test(profile.logo_url || '');
}

/**
 * Resolves the same no-fake-logo behavior used by the server pipeline for UI previews.
 */
export function resolveBrandWatermark(profile: BrandProfile): ResolvedBrandWatermark {
  const enabled = profile.enabled !== false && profile.watermark_mode !== 'none';
  const hasLogo = hasUploadedLogo(profile);
  const wantsLogo =
    profile.watermark_mode === 'logo_and_text' || profile.watermark_mode === 'logo_only';
  const wantsText =
    profile.watermark_mode === 'logo_and_text' || profile.watermark_mode === 'text_only';
  const showLogo = enabled && wantsLogo && hasLogo;
  const showBrandName = enabled && wantsText && Boolean(profile.brand_name.trim());

  return {
    showLogo,
    showBrandName,
    isApplied: showLogo || showBrandName,
    usesTextFallback:
      enabled &&
      profile.watermark_mode === 'logo_and_text' &&
      !hasLogo &&
      showBrandName,
  };
}

export function getEffectiveCredit(slotCredit: string | undefined, profile: BrandProfile): string {
  return slotCredit?.trim() || profile.default_credit?.trim() || profile.brand_name.trim();
}

export function toBrandProfileManifest(profile: BrandProfile): BrandProfileManifest {
  return {
    enabled: profile.enabled !== false && profile.watermark_mode !== 'none',
    brand_name: profile.brand_name,
    logo_uploaded: hasUploadedLogo(profile),
    watermark_mode: profile.watermark_mode,
    position: profile.position,
    opacity: profile.opacity,
    padding: profile.padding ?? profile.edge_padding,
    apply_to: profile.apply_to,
    apply_to_source_docs: Boolean(profile.apply_to_source_docs),
    default_credit: profile.default_credit || profile.brand_name,
    show_credit_in_article: profile.show_credit_in_article,
  };
}
