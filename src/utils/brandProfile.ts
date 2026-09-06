import { BrandProfile, BrandProfileManifest, WatermarkMode, WatermarkScope } from '../types';

/**
 * The single source of truth for global publishing branding defaults.
 * Slot-level metadata may override credit only in advanced editor controls.
 */
export const DEFAULT_BRAND_PROFILE: BrandProfile = {
  enabled: true,
  brand_name: 'Kế Toán Diệu Tâm',
  logo_url: '',
  logo_uploaded: false,
  watermark_mode: 'logo_and_text',
  position: 'bottom-right',
  logo_size: 'medium',
  opacity: 0.85,
  edge_padding: 24,
  padding: 24,
  apply_to: 'all',
  default_credit: 'Kế Toán Diệu Tâm',
  show_credit_in_article: false,
  // Legacy fields are retained for compatibility with existing payloads.
  show_logo: true,
  show_brand_name: true,
  apply_to_featured: true,
  apply_to_ai_inline: true,
  apply_to_source_docs: true,
};

function resolveWatermarkMode(profile: Partial<BrandProfile>): WatermarkMode {
  if (profile.watermark_mode) return profile.watermark_mode;
  if (profile.show_logo === false && profile.show_brand_name === false) return 'none';
  if (profile.show_logo === false) return 'text_only';
  if (profile.show_brand_name === false) return 'logo_only';
  return DEFAULT_BRAND_PROFILE.watermark_mode;
}

function resolveWatermarkScope(profile: Partial<BrandProfile>): WatermarkScope {
  if (profile.apply_to) return profile.apply_to;
  if (profile.apply_to_featured === false && profile.apply_to_ai_inline !== false) return 'inline_only';
  if (profile.apply_to_featured !== false && profile.apply_to_ai_inline === false) return 'featured_only';
  return DEFAULT_BRAND_PROFILE.apply_to;
}

/**
 * Normalizes old and new brand settings before they reach the UI, API, or manifest.
 */
export function normalizeBrandProfile(profile: Partial<BrandProfile> = {}): BrandProfile {
  const watermark_mode = resolveWatermarkMode(profile);
  const apply_to = resolveWatermarkScope(profile);
  const brand_name = profile.brand_name ?? DEFAULT_BRAND_PROFILE.brand_name;
  const padding = profile.padding ?? profile.edge_padding ?? DEFAULT_BRAND_PROFILE.padding;

  return {
    ...DEFAULT_BRAND_PROFILE,
    ...profile,
    enabled: profile.enabled ?? watermark_mode !== 'none',
    brand_name,
    watermark_mode,
    position: profile.position ?? DEFAULT_BRAND_PROFILE.position,
    logo_size: profile.logo_size ?? DEFAULT_BRAND_PROFILE.logo_size,
    opacity: Math.min(Math.max(profile.opacity ?? DEFAULT_BRAND_PROFILE.opacity, 0.1), 1),
    edge_padding: Math.max(padding ?? 24, 8),
    padding: Math.max(padding ?? 24, 8),
    apply_to,
    default_credit: profile.default_credit ?? brand_name ?? '',
    show_credit_in_article: profile.show_credit_in_article ?? false,
    logo_uploaded: profile.logo_uploaded ?? Boolean(profile.logo_url),
    show_logo: watermark_mode === 'logo_and_text' || watermark_mode === 'logo_only',
    show_brand_name: watermark_mode === 'logo_and_text' || watermark_mode === 'text_only',
    apply_to_featured: apply_to === 'all' || apply_to === 'featured_only',
    apply_to_ai_inline: apply_to === 'all' || apply_to === 'inline_only',
    apply_to_source_docs: apply_to === 'all' || apply_to === 'inline_only',
  };
}

export function getEffectiveCredit(slotCredit: string | undefined, profile: BrandProfile): string {
  return slotCredit?.trim() || profile.default_credit?.trim() || profile.brand_name.trim();
}

export function toBrandProfileManifest(profile: BrandProfile): BrandProfileManifest {
  return {
    enabled: profile.enabled !== false && profile.watermark_mode !== 'none',
    brand_name: profile.brand_name,
    logo_uploaded: Boolean(profile.logo_url || profile.logo_uploaded),
    watermark_mode: profile.watermark_mode,
    position: profile.position,
    opacity: profile.opacity,
    padding: profile.padding ?? profile.edge_padding,
    apply_to: profile.apply_to,
    default_credit: profile.default_credit || profile.brand_name,
    show_credit_in_article: profile.show_credit_in_article,
  };
}
