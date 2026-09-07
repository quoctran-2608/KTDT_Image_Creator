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
- `image_url` là URL vận chuyển tạm. Production dùng signed GET URL từ Cloud Storage; development/AI Studio preview không có bucket có thể dùng memory fallback.
- Gói không chứa `data:image`, blob URL hoặc dữ liệu base64.
- Đây là copy/paste một chiều; Image Creator không gọi API, OAuth hay webhook của Editorial.

### Cloud Run transport

- Production cần `EDITORIAL_EXPORT_BUCKET=<bucket-name>`. Image Creator dùng Application Default Credentials/service identity của Cloud Run để upload object tạm dưới `editorial-export/<export-uuid>/<asset-uuid>-<safe-filename>.webp`.
- Mỗi URL là signed `GET` URL có hạn 24 giờ; URL không phụ thuộc instance Node/Cloud Run đã nhận yêu cầu Copy.
- Cấu hình lifecycle rule trên bucket để tự xóa prefix `editorial-export/` sau thời hạn phù hợp (ví dụ 1–2 ngày). Đây là cấu hình Google Cloud ngoài code.
- Service account Cloud Run cần quyền ghi/xóa object trong bucket và quyền ký URL V4 (thường cần `iam.serviceAccounts.signBlob`/Service Account Token Creator tùy cấu hình IAM).
- Nếu production thiếu `EDITORIAL_EXPORT_BUCKET`, Copy bị từ chối rõ ràng thay vì rơi về memory. Memory fallback chỉ dùng khi không chạy production và mất khi server restart.
