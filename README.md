# KTDT AI Image Rebuilder

## KTDT_IMAGE_PACK v1

Sau khi mọi ảnh đã hoàn tất ở Bước 3, nút **COPY CHO EDITORIAL** tạo và sao chép một gói JSON để dán/import vào Editorial.

```json
{
  "protocol": "KTDT_IMAGE_PACK",
  "version": 1,
  "article": { "title": "…", "slug": "…" },
  "featured": {
    "image_url": "https://image-creator.example/api/editorial-image/…",
    "filename": "…webp",
    "alt": "",
    "title": "",
    "caption": "",
    "credit": ""
  },
  "inline_images": [
    {
      "old_src": "đường-dẫn-ảnh-cũ-trong-HTML",
      "image_url": "https://image-creator.example/api/editorial-image/…",
      "filename": "…webp",
      "alt": "",
      "title": "",
      "caption": "",
      "credit": ""
    }
  ],
  "meta": { "exported_at": "…" }
}
```

- `old_src` giữ nguyên ảnh cũ để Editorial xác định vị trí thay inline.
- `image_url` là URL vận chuyển tạm, chỉ tồn tại trong bộ nhớ Image Creator cho đến khi hết hạn hoặc server khởi động lại.
- Gói không chứa `data:image`, blob URL hoặc dữ liệu base64.
- Đây là copy/paste một chiều; Image Creator không gọi API, OAuth hay webhook của Editorial.
