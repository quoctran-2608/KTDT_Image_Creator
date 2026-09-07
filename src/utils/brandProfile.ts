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
 * Uses official KTDT logo as exclusive server-side watermark.
 */
export const DEFAULT_BRAND_PROFILE: BrandProfile = {
  enabled: true,
  brand_name: 'Kế Toán Diệu Tâm',
  logo_url: '/api/brand-logo',
  logo_uploaded: true,
  watermark_mode: 'logo_only',
  position: 'bottom-right',
  logo_size: 'medium',
  opacity: 0.85,
  edge_padding: 24,
  padding: 24,
  apply_to: 'all',
  apply_to_source_docs: false,
  default_credit: 'Kế Toán Diệu Tâm',
  show_credit_in_article: false,
  // Official production policy
  show_logo: true,
  show_brand_name: false,
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
 * Guarantees that official production watermark policy is always applied and prevents stale
 * localStorage values (such as none, text_only, logo_and_text, or disabled state) from corrupting the UI.
 */
export function normalizeBrandProfile(profile: Partial<BrandProfile> | unknown = {}): BrandProfile {
  const raw = isRecord(profile) ? profile : {};
  const brand_name = stringValue(raw.brand_name, DEFAULT_BRAND_PROFILE.brand_name) || 'Kế Toán Diệu Tâm';

  return {
    ...DEFAULT_BRAND_PROFILE,
    enabled: true,
    brand_name,
    logo_url: '/api/brand-logo',
    logo_uploaded: true,
    watermark_mode: 'logo_only',
    position: 'bottom-right',
    logo_size: 'medium',
    opacity: 0.85,
    edge_padding: 24,
    padding: 24,
    apply_to: 'all',
    // Source documents are deliberately independent from normal inline-image scope.
    apply_to_source_docs: booleanValue(raw.apply_to_source_docs, false),
    default_credit: stringValue(raw.default_credit, brand_name) || brand_name,
    show_credit_in_article: booleanValue(raw.show_credit_in_article, false),
    show_logo: true,
    show_brand_name: false,
    apply_to_featured: true,
    apply_to_ai_inline: true,
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
  if (!profile.logo_url) return false;
  if (profile.logo_url === '/api/brand-logo') return true;
  return /^data:image\/[a-zA-Z0-9.+_-]+;base64,/i.test(profile.logo_url);
}

/**
 * Resolves the official logo watermark behavior for UI previews.
 */
export function resolveBrandWatermark(_profile?: BrandProfile): ResolvedBrandWatermark {
  return {
    showLogo: true,
    showBrandName: false,
    isApplied: true,
    usesTextFallback: false,
  };
}

export function getEffectiveCredit(slotCredit: string | undefined, profile: BrandProfile): string {
  return slotCredit?.trim() || profile.default_credit?.trim() || profile.brand_name.trim();
}

export function toBrandProfileManifest(profile: BrandProfile): BrandProfileManifest {
  const normalized = normalizeBrandProfile(profile);
  return {
    enabled: true,
    brand_name: normalized.brand_name,
    logo_uploaded: true,
    watermark_mode: 'logo_only',
    position: 'bottom-right',
    opacity: 0.85,
    padding: 24,
    apply_to: 'all',
    apply_to_source_docs: Boolean(normalized.apply_to_source_docs),
    default_credit: normalized.default_credit || normalized.brand_name,
    show_credit_in_article: Boolean(normalized.show_credit_in_article),
  };
}
