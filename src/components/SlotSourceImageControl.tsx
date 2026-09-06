import React, { useState, useRef } from 'react';
import {
  Image as ImageIcon,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Copy,
  ExternalLink,
  Upload,
  Clipboard,
  Link,
  Check,
  RefreshCw,
  Eye,
} from 'lucide-react';
import { ImageSlotPlan, SourceImageInfo } from '../types';

interface SlotSourceImageControlProps {
  slot: ImageSlotPlan;
  onUpdateSlot: (updated: Partial<ImageSlotPlan>) => void;
  slotLabel: string;
}

export const SlotSourceImageControl: React.FC<SlotSourceImageControlProps> = ({
  slot,
  onUpdateSlot,
  slotLabel,
}) => {
  const [isEnteringUrl, setIsEnteringUrl] = useState(false);
  const [manualUrl, setManualUrl] = useState('');
  const [copiedLink, setCopiedLink] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const srcInfo: SourceImageInfo = slot.source_image || {
    available: Boolean(slot.image_data_url || slot.old_src),
    method: 'html_src',
    resolved_url: slot.old_src || '',
    thumbnail_data_url: slot.image_data_url,
    source_status_label: slot.old_src ? 'URL trong HTML' : 'Chưa có ảnh',
  };

  const currentPreviewSrc =
    srcInfo.thumbnail_data_url || slot.image_data_url || srcInfo.resolved_url || slot.old_src;

  // Badge label and color determination
  const getBadgeDetails = () => {
    if (srcInfo.available) {
      let helper = 'Nguồn: URL trong HTML';
      if (srcInfo.method === 'manual_upload') helper = 'Nguồn: Tải lên từ máy tính';
      else if (srcInfo.method === 'clipboard_paste') helper = 'Nguồn: Dán từ clipboard';
      else if (srcInfo.method === 'manual_url') helper = 'Nguồn: URL nhập trực tiếp';
      else if (srcInfo.method === 'live_article_dom') helper = 'Nguồn: URL bài viết gốc';
      else if (srcInfo.method === 'base_url_resolve') helper = 'Nguồn: Base URL + src';
      else if (srcInfo.method === 'article_url_resolve') helper = 'Nguồn: URL bài viết';

      return {
        label: '✓ Đã tải ảnh thực tế',
        helper,
        className: 'bg-emerald-50 text-emerald-800 border-emerald-200',
      };
    }

    // Not available / errors
    if (slot.old_src) {
      return {
        label: '⚠ Chưa tải được ảnh thực tế',
        helper: 'URL trong bài không tải được',
        className: 'bg-amber-50 text-amber-800 border-amber-200',
      };
    }
    return {
      label: '○ Chưa có ảnh thực tế',
      helper: 'Chỉ có thẻ img trong HTML',
      className: 'bg-slate-100 text-slate-600 border-slate-200',
    };
  };

  const badge = getBadgeDetails();

  // Copy link handler
  const handleCopyLink = () => {
    const targetUrl = srcInfo.resolved_url || slot.old_src;
    if (targetUrl) {
      navigator.clipboard.writeText(targetUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  // Confirm image match manually
  const handleConfirmSource = () => {
    onUpdateSlot({
      needs_source_confirmation: false,
      source_image: {
        ...srcInfo,
        needs_confirmation: false,
        mapping_confidence: 'high',
        source_status_label: 'Đã biên tập viên xác nhận',
      },
    });
  };

  // Upload local file handler
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const updatedSrcInfo: SourceImageInfo = {
        available: true,
        method: 'manual_upload',
        resolved_url: file.name,
        thumbnail_data_url: dataUrl,
        source_status_label: 'Tải lên từ máy tính',
        mapping_confidence: 'high',
        source_retrieval_status: 'success',
        visual_analysis_status: 'not_started',
        visual_analysis_available: false,
      };

      onUpdateSlot({
        source_image: updatedSrcInfo,
        source_resolved_url: file.name,
        source_image_method: 'manual_upload',
        source_retrieval_status: 'success',
        visual_analysis_status: 'not_started',
        visual_analysis_available: false,
        needs_source_confirmation: false,
        image_data_url: dataUrl,
      });
    };
    reader.readAsDataURL(file);
    if (e.target) e.target.value = '';
  };

  // Clipboard paste handler
  const handlePasteClipboard = async () => {
    try {
      if (!navigator.clipboard?.read) {
        const url = window.prompt('Dán link ảnh hoặc Data URL trực tiếp vào đây:');
        if (url && url.trim()) {
          applyManualUrl(url.trim());
        }
        return;
      }

      const items = await navigator.clipboard.read();
      for (const item of items) {
        const imageType = item.types.find((t) => t.startsWith('image/'));
        if (imageType) {
          const blob = await item.getType(imageType);
          const reader = new FileReader();
          reader.onload = () => {
            const dataUrl = reader.result as string;
            const updatedSrcInfo: SourceImageInfo = {
              available: true,
              method: 'clipboard_paste',
              resolved_url: 'clipboard-image.png',
              thumbnail_data_url: dataUrl,
              source_status_label: 'Dán từ clipboard',
              mapping_confidence: 'high',
              source_retrieval_status: 'success',
              visual_analysis_status: 'not_started',
              visual_analysis_available: false,
            };

            onUpdateSlot({
              source_image: updatedSrcInfo,
              source_resolved_url: 'clipboard-image.png',
              source_image_method: 'clipboard_paste',
              source_retrieval_status: 'success',
              visual_analysis_status: 'not_started',
              visual_analysis_available: false,
              needs_source_confirmation: false,
              image_data_url: dataUrl,
            });
          };
          reader.readAsDataURL(blob);
          return;
        }
      }

      // Fallback: check if text in clipboard is an image URL
      const text = await navigator.clipboard.readText();
      if (text && (text.startsWith('http://') || text.startsWith('https://') || text.startsWith('data:image/'))) {
        applyManualUrl(text.trim());
      } else {
        alert('Không tìm thấy ảnh trong bộ nhớ tạm (Clipboard). Bạn có thể copy ảnh hoặc link ảnh rồi thử lại.');
      }
    } catch (err) {
      const url = window.prompt('Dán URL ảnh hoặc Data URL trực tiếp vào đây:');
      if (url && url.trim()) {
        applyManualUrl(url.trim());
      }
    }
  };

  const applyManualUrl = (url: string) => {
    const updatedSrcInfo: SourceImageInfo = {
      available: true,
      method: 'manual_url',
      resolved_url: url,
      thumbnail_data_url: url.startsWith('data:') ? url : undefined,
      source_status_label: 'URL nhập trực tiếp',
      mapping_confidence: 'high',
      source_retrieval_status: 'success',
      visual_analysis_status: 'not_started',
      visual_analysis_available: false,
    };

    onUpdateSlot({
      source_image: updatedSrcInfo,
      source_resolved_url: url,
      source_image_method: 'manual_url',
      source_retrieval_status: 'success',
      visual_analysis_status: 'not_started',
      visual_analysis_available: false,
      needs_source_confirmation: false,
    });
    setIsEnteringUrl(false);
    setManualUrl('');
  };

  return (
    <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-3">
      {/* Top Header: Label & Status Badge */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 font-bold text-slate-900">
          <ImageIcon className="w-3.5 h-3.5 text-[#0F766E]" />
          <span>Ảnh hiện tại trong bài</span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span
            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${badge.className}`}
          >
            {srcInfo.available ? (
              <CheckCircle2 className="w-3 h-3 shrink-0" />
            ) : (
              <AlertTriangle className="w-3 h-3 shrink-0" />
            )}
            <span>{badge.label}</span>
          </span>

          {/* Optional Helper */}
          {badge.helper && (
            <span className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-slate-200/70 text-slate-700">
              {badge.helper}
            </span>
          )}

          {/* Mapping Confidence Badge */}
          {srcInfo.mapping_confidence && srcInfo.method === 'live_article_dom' && (
            <span
              className={`px-2 py-0.5 rounded-md text-[10px] font-semibold ${
                srcInfo.mapping_confidence === 'high'
                  ? 'bg-emerald-100 text-emerald-800'
                  : srcInfo.mapping_confidence === 'medium'
                  ? 'bg-blue-100 text-blue-800'
                  : 'bg-amber-100 text-amber-800'
              }`}
            >
              Độ khớp: {srcInfo.mapping_confidence === 'high' ? 'Rất cao' : srcInfo.mapping_confidence === 'medium' ? 'Trung bình' : 'Cần xác nhận'}
            </span>
          )}
        </div>
      </div>

      {/* Main Content: Thumbnail & Details */}
      <div className="flex flex-col sm:flex-row items-start gap-3">
        {/* Thumbnail Preview (Left) */}
        <div className="relative w-28 h-20 sm:w-32 sm:h-22 rounded-lg bg-slate-200 border border-slate-300 overflow-hidden shrink-0 flex items-center justify-center group shadow-2xs">
          {currentPreviewSrc ? (
            <>
              <img
                src={currentPreviewSrc}
                alt="Ảnh hiện tại"
                className="w-full h-full object-cover"
                onError={(e) => {
                  // Fallback on broken image link
                  (e.target as HTMLElement).style.display = 'none';
                }}
              />
              <button
                type="button"
                onClick={() => setShowPreviewModal(true)}
                className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white cursor-pointer"
                title="Xem ảnh phóng to"
              >
                <Eye className="w-4 h-4" />
              </button>
            </>
          ) : (
            <div className="text-center p-1 text-slate-400 text-[10px] flex flex-col items-center">
              <ImageIcon className="w-5 h-5 mb-0.5 opacity-40" />
              <span>Chưa có ảnh</span>
            </div>
          )}
        </div>

        {/* Details & URL Resolution (Right) */}
        <div className="flex-1 min-w-0 space-y-1.5 w-full">
          {/* Resolved URL with Copy & External Link */}
          <div className="flex items-center gap-1.5 bg-white p-1.5 rounded-lg border border-slate-200">
            <span className="text-[10px] font-semibold text-slate-400 shrink-0">Nguồn:</span>
            <span
              className="text-[11px] font-mono text-slate-700 truncate flex-1"
              title={srcInfo.resolved_url || slot.old_src || 'Chưa có URL'}
            >
              {srcInfo.resolved_url || slot.old_src || 'Chưa xác định URL'}
            </span>

            {(srcInfo.resolved_url || slot.old_src) && (
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                  title="Sao chép URL ảnh"
                >
                  {copiedLink ? (
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
                {srcInfo.resolved_url && /^https?:\/\//i.test(srcInfo.resolved_url) && (
                  <a
                    href={srcInfo.resolved_url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                    title="Mở ảnh trong tab mới"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
              </div>
            )}
          </div>

          {/* Text-Visual Conflict Alert */}
          {slot.text_visual_conflict && (
            <div className="p-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-[11px] leading-tight">
              <span className="font-bold">⚠ Phát hiện mâu thuẫn: </span>
              <span>
                Ảnh thực tế khác với mô tả Alt text cũ. Hệ thống đã ưu tiên bằng chứng thị giác trực quan để phân loại chính xác.
              </span>
            </div>
          )}

          {/* Confirmation Prompt if needed */}
          {slot.needs_source_confirmation && (
            <div className="flex items-center justify-between gap-2 p-2 rounded-lg bg-amber-50/80 border border-amber-200 text-[11px]">
              <span className="text-amber-900 font-medium">
                Khớp từ bài viết live. Bạn có muốn dùng ảnh này?
              </span>
              <button
                type="button"
                onClick={handleConfirmSource}
                className="px-2.5 py-1 rounded bg-amber-600 hover:bg-amber-700 text-white font-semibold text-[11px] shrink-0 transition-colors cursor-pointer"
              >
                ✓ Xác nhận ảnh đúng
              </button>
            </div>
          )}

          {/* Action Bar to Replace or Upload Source Image */}
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            {/* 1. Paste from clipboard */}
            <button
              type="button"
              onClick={handlePasteClipboard}
              className="px-2 py-1 rounded-md border border-slate-200 bg-white hover:bg-slate-100 text-[11px] font-medium text-slate-700 flex items-center gap-1 transition-colors cursor-pointer"
              title="Dán ảnh trực tiếp từ bộ nhớ tạm (Ctrl+V)"
            >
              <Clipboard className="w-3 h-3 text-slate-500" />
              <span>Dán ảnh (Paste)</span>
            </button>

            {/* 2. Upload from computer */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="px-2 py-1 rounded-md border border-slate-200 bg-white hover:bg-slate-100 text-[11px] font-medium text-slate-700 flex items-center gap-1 transition-colors cursor-pointer"
              title="Chọn file ảnh từ ổ đĩa máy tính"
            >
              <Upload className="w-3 h-3 text-slate-500" />
              <span>Tải từ máy tính</span>
            </button>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept="image/*"
              className="hidden"
            />

            {/* 3. Direct URL input toggle */}
            <button
              type="button"
              onClick={() => setIsEnteringUrl(!isEnteringUrl)}
              className="px-2 py-1 rounded-md border border-slate-200 bg-white hover:bg-slate-100 text-[11px] font-medium text-slate-700 flex items-center gap-1 transition-colors cursor-pointer"
            >
              <Link className="w-3 h-3 text-slate-500" />
              <span>Nhập link ảnh</span>
            </button>
          </div>

          {/* Inline URL Input Form */}
          {isEnteringUrl && (
            <div className="flex items-center gap-1.5 pt-1">
              <input
                type="url"
                value={manualUrl}
                onChange={(e) => setManualUrl(e.target.value)}
                placeholder="https://example.com/path/to/image.jpg"
                className="flex-1 h-8 px-2.5 text-[11px] bg-white rounded border border-slate-300 focus:outline-hidden focus:ring-1 focus:ring-[#0F766E]"
              />
              <button
                type="button"
                onClick={() => {
                  if (manualUrl.trim()) applyManualUrl(manualUrl.trim());
                }}
                disabled={!manualUrl.trim()}
                className="h-8 px-2.5 rounded bg-[#0F766E] hover:bg-[#115E59] text-white text-[11px] font-semibold disabled:opacity-50 cursor-pointer"
              >
                Áp dụng
              </button>
              <button
                type="button"
                onClick={() => setIsEnteringUrl(false)}
                className="h-8 px-2 text-[11px] text-slate-500 hover:bg-slate-100 rounded cursor-pointer"
              >
                Hủy
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Lightbox Modal for Large Preview */}
      {showPreviewModal && currentPreviewSrc && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 cursor-pointer"
          onClick={() => setShowPreviewModal(false)}
        >
          <div className="max-w-2xl max-h-[85vh] bg-white rounded-2xl overflow-hidden p-2 shadow-2xl">
            <img
              src={currentPreviewSrc}
              alt="Ảnh hiện tại phóng to"
              className="max-h-[75vh] w-auto mx-auto rounded-lg object-contain"
            />
            <div className="p-2 text-center text-xs text-slate-500">
              Nhấn ra ngoài để đóng xem trước
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
