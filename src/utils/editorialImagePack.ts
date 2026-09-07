import { ImageSlotPlan } from '../types';

export interface KTDTImagePackImage {
  image_url: string;
  filename: string;
  alt: string;
  title: string;
  caption: string;
  credit: string;
}

export interface KTDTImagePackInlineImage extends KTDTImagePackImage {
  old_src: string;
}

export interface KTDTImagePackV1 {
  protocol: 'KTDT_IMAGE_PACK';
  version: 1;
  article: {
    title: string;
    slug: string;
  };
  featured: KTDTImagePackImage;
  inline_images: KTDTImagePackInlineImage[];
  meta: {
    exported_at: string;
  };
}

export interface EditorialPackValidationResult {
  canExport: boolean;
  errors: string[];
}

export interface EditorialPackArticle {
  title: string;
  slug?: string;
}

function filenameFor(slot: ImageSlotPlan): string {
  return slot.final_filename || slot.suggested_filename || '';
}

function metadataFor(slot: ImageSlotPlan, imageUrl: string): KTDTImagePackImage {
  return {
    image_url: imageUrl,
    filename: filenameFor(slot),
    alt: slot.alt_text || slot.alt || slot.suggested_alt || '',
    title: slot.title || '',
    caption: slot.caption || '',
    // Global Brand Profile credit is not editorial attribution. Export only an explicit slot override.
    credit: slot.credit?.trim() || '',
  };
}

function isCompletedImage(slot: ImageSlotPlan): boolean {
  return Boolean(slot.selected && slot.status === 'completed' && slot.image_data_url);
}

function normalizedOldSrc(oldSrc: string): string {
  return oldSrc.trim();
}

export function validateEditorialImagePackExport(
  article: EditorialPackArticle,
  plan: ImageSlotPlan[]
): EditorialPackValidationResult {
  const errors: string[] = [];
  const featuredSlots = plan.filter((slot) => slot.type === 'featured');
  const inlineSlots = plan.filter((slot) => slot.type === 'inline');

  if (!article.title.trim()) {
    errors.push('Bài viết chưa có tiêu đề để tạo gói Editorial.');
  }
  if (featuredSlots.length !== 1) {
    errors.push('Gói Editorial cần đúng một ảnh bìa (Featured) trong kế hoạch.');
  } else if (!isCompletedImage(featuredSlots[0])) {
    errors.push('Ảnh bìa chưa hoàn tất hoặc chưa có asset ảnh mới.');
  }

  for (const slot of inlineSlots) {
    if (!isCompletedImage(slot)) {
      errors.push(`Ảnh nội dung ${slot.slot_id} chưa hoàn tất hoặc chưa có asset ảnh mới.`);
    }
    if (!slot.old_src?.trim()) {
      errors.push(
        `Ảnh nội dung ${slot.slot_id} không còn thông tin ảnh cũ để Editorial xác định vị trí thay.`
      );
    }
  }

  const duplicateOldSrc = new Set<string>();
  const seenOldSrc = new Set<string>();
  for (const slot of inlineSlots) {
    const key = normalizedOldSrc(slot.old_src || '');
    if (!key) continue;
    if (seenOldSrc.has(key)) duplicateOldSrc.add(key);
    seenOldSrc.add(key);
  }
  if (duplicateOldSrc.size > 0) {
    errors.push(
      `Có ${duplicateOldSrc.size} URL ảnh cũ bị trùng. Hãy xử lý mapping trước khi sao chép cho Editorial.`
    );
  }

  const unresolvedSlots = plan.filter(
    (slot) => slot.processing_strategy === 'NEEDS_DECISION'
  );
  if (unresolvedSlots.length > 0) {
    errors.push(
      `Còn ${unresolvedSlots.length} vị trí chưa quyết định chiến lược xử lý (${unresolvedSlots
        .map((slot) => slot.slot_id)
        .join(', ')}).`
    );
  }

  return { canExport: errors.length === 0, errors };
}

export function buildEditorialImagePack(
  article: EditorialPackArticle,
  plan: ImageSlotPlan[],
  imageUrlsBySlotId: Record<string, string>,
  exportedAt = new Date().toISOString()
): KTDTImagePackV1 {
  const validation = validateEditorialImagePackExport(article, plan);
  if (!validation.canExport) {
    throw new Error(validation.errors.join(' '));
  }

  const featured = plan.find((slot) => slot.type === 'featured');
  if (!featured) {
    throw new Error('Không tìm thấy ảnh bìa để tạo gói Editorial.');
  }

  const featuredUrl = imageUrlsBySlotId[featured.slot_id];
  if (!isHttpUrl(featuredUrl)) {
    throw new Error('Ảnh bìa chưa nhận được URL HTTP(S) tải được.');
  }

  const inline_images = plan
    .filter((slot) => slot.type === 'inline')
    .map((slot) => {
      const imageUrl = imageUrlsBySlotId[slot.slot_id];
      if (!isHttpUrl(imageUrl)) {
        throw new Error(`Ảnh nội dung ${slot.slot_id} chưa nhận được URL HTTP(S) tải được.`);
      }
      return {
        old_src: slot.old_src,
        ...metadataFor(slot, imageUrl),
      };
    });

  const pack: KTDTImagePackV1 = {
    protocol: 'KTDT_IMAGE_PACK',
    version: 1,
    article: {
      title: article.title.trim(),
      slug: article.slug || '',
    },
    featured: metadataFor(featured, featuredUrl),
    inline_images,
    meta: {
      exported_at: exportedAt,
    },
  };

  const contractValidation = validateEditorialImagePack(pack);
  if (!contractValidation.canExport) {
    throw new Error(contractValidation.errors.join(' '));
  }
  return pack;
}

export function validateEditorialImagePack(
  pack: KTDTImagePackV1
): EditorialPackValidationResult {
  const errors: string[] = [];
  if (pack.protocol !== 'KTDT_IMAGE_PACK') errors.push('Protocol Editorial không hợp lệ.');
  if (pack.version !== 1) errors.push('Version Editorial không hợp lệ.');
  if (!pack.article?.title?.trim()) errors.push('article.title là bắt buộc.');
  if (!pack.featured || !isHttpUrl(pack.featured.image_url)) {
    errors.push('featured.image_url phải là URL HTTP(S).');
  }
  if (!Array.isArray(pack.inline_images)) {
    errors.push('inline_images phải là mảng.');
  } else {
    for (const image of pack.inline_images) {
      if (!image.old_src?.trim()) errors.push('Mỗi ảnh nội dung phải có old_src.');
      if (!isHttpUrl(image.image_url)) {
        errors.push(`Ảnh nội dung ${image.old_src || '(không rõ)'} phải có URL HTTP(S).`);
      }
    }
  }

  const serialized = JSON.stringify(pack);
  if (/data:image\/|blob:|image_data_url|base64/i.test(serialized)) {
    errors.push('Gói Editorial không được chứa data URL, blob URL hoặc dữ liệu base64.');
  }
  return { canExport: errors.length === 0, errors };
}

function isHttpUrl(value: string | undefined): boolean {
  return Boolean(value && /^https?:\/\//i.test(value));
}
