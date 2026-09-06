import { ImageSlotPlan } from '../types';

/**
 * Generate a client-side SVG mockup Data URL for any slot.
 * Ensures instant preview, works offline, and requires zero network roundtrips.
 */
export function generateClientMockSvg(
  slot: ImageSlotPlan,
  articleTitle: string = 'Bài viết kinh tế thuế'
): string {
  const isFeatured = slot.type === 'featured';
  const width = isFeatured ? 1280 : 800;
  const height = isFeatured ? 720 : 600;

  const rawTitle = slot.alt || slot.suggested_alt || slot.concept || slot.suggested_concept || articleTitle;
  const titleText = rawTitle.replace(/[<>"'&]/g, ' ').slice(0, 70);
  const slotName = slot.final_filename || slot.suggested_filename;

  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0f172a" />
      <stop offset="60%" stop-color="#1e293b" />
      <stop offset="100%" stop-color="#0f766e" />
    </linearGradient>
    <linearGradient id="cardGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.12" />
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0.04" />
    </linearGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#bgGrad)" />
  
  <!-- Subtle Grid Pattern -->
  <g stroke="#ffffff" stroke-opacity="0.06" stroke-width="1">
    <line x1="0" y1="${height * 0.25}" x2="${width}" y2="${height * 0.25}" />
    <line x1="0" y1="${height * 0.5}" x2="${width}" y2="${height * 0.5}" />
    <line x1="0" y1="${height * 0.75}" x2="${width}" y2="${height * 0.75}" />
    <line x1="${width * 0.25}" y1="0" x2="${width * 0.25}" y2="${height}" />
    <line x1="${width * 0.5}" y1="0" x2="${width * 0.5}" y2="${height}" />
    <line x1="${width * 0.75}" y1="0" x2="${width * 0.75}" y2="${height}" />
  </g>

  <!-- Editorial Card Badge -->
  <rect x="48" y="44" width="170" height="34" rx="6" fill="#0284c7" fill-opacity="0.9" />
  <text x="58" y="66" fill="#ffffff" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="13" font-weight="700" letter-spacing="1">
    KTDT EDITORIAL
  </text>

  <!-- Slot Tag -->
  <rect x="228" y="44" width="130" height="34" rx="6" fill="#ffffff" fill-opacity="0.15" />
  <text x="238" y="66" fill="#e2e8f0" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="13" font-weight="600">
    ${isFeatured ? 'COVER 16:9' : 'INLINE 4:3'}
  </text>

  <!-- Center Graphical Motifs (Accounting & Business) -->
  <circle cx="${width / 2}" cy="${height / 2 - 25}" r="${isFeatured ? 90 : 70}" fill="none" stroke="#38bdf8" stroke-width="3" stroke-dasharray="6,6" opacity="0.4" />
  <circle cx="${width / 2}" cy="${height / 2 - 25}" r="${isFeatured ? 65 : 50}" fill="#0f766e" opacity="0.35" />
  
  <!-- Graph Bars Motif -->
  <g transform="translate(${width / 2 - 40}, ${height / 2 - 15})">
    <rect x="0" y="0" width="16" height="40" rx="3" fill="#38bdf8" opacity="0.85" />
    <rect x="24" y="-25" width="16" height="65" rx="3" fill="#2dd4bf" opacity="0.95" />
    <rect x="48" y="-45" width="16" height="85" rx="3" fill="#f8fafc" opacity="0.9" />
    <rect x="72" y="-15" width="16" height="55" rx="3" fill="#38bdf8" opacity="0.75" />
  </g>

  <!-- Bottom Card with Concept Description -->
  <rect x="44" y="${height - 135}" width="${width - 88}" height="90" rx="10" fill="url(#cardGrad)" stroke="#ffffff" stroke-opacity="0.15" />
  <text x="64" y="${height - 96}" fill="#f8fafc" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="17" font-weight="600">
    ${titleText}
  </text>
  <text x="64" y="${height - 68}" fill="#94a3b8" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="13">
    Tệp: ${slotName} • Chuẩn SEO biên tập KTDT
  </text>
</svg>
`;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.trim())}`;
}
