import React, { useState } from 'react';
import {
  Download,
  RefreshCw,
  Maximize2,
  CheckCircle2,
  AlertCircle,
  Clock,
  ChevronDown,
  ChevronUp,
  FileImage,
  Sparkles,
  Crown,
  FileText,
} from 'lucide-react';
import { ImageSlotPlan } from '../types';
import { downloadSingleFile } from '../utils/zipExporter';
import { normalizeBasePath } from '../utils/htmlProcessor';

interface ResultGalleryProps {
  plan: ImageSlotPlan[];
  onRegenerateSlot: (slotId: string) => void;
  isGenerating: boolean;
  onPreviewImage: (imageUrl: string, title: string) => void;
  outputBasePath: string;
}

export const ResultGallery: React.FC<ResultGalleryProps> = ({
  plan,
  onRegenerateSlot,
  isGenerating,
  onPreviewImage,
  outputBasePath,
}) => {
  const [expandedDetails, setExpandedDetails] = useState<Record<string, boolean>>({});

  const toggleDetails = (slotId: string) => {
    setExpandedDetails((prev) => ({
      ...prev,
      [slotId]: !prev[slotId],
    }));
  };

  const cleanPath = normalizeBasePath(outputBasePath);

  // Show every selected publishing asset, including source-preserving rebuilds.
  const activeSlots = plan.filter(
    (s) => s.selected || s.status === 'completed' || s.status === 'failed'
  );

  const completedCount = activeSlots.filter(
    (s) => s.status === 'completed' && Boolean(s.image_data_url)
  ).length;
  const failedCount = activeSlots.filter((s) => s.status === 'failed').length;
  const totalCount = activeSlots.length;

  if (activeSlots.length === 0) return null;

  // Separate Featured vs Inline slots
  const hasExplicitFeatured = activeSlots.some((s) => s.type === 'featured');
  const featuredSlots = hasExplicitFeatured
    ? activeSlots.filter((s) => s.type === 'featured')
    : activeSlots.slice(0, 1);
  const inlineSlots = hasExplicitFeatured
    ? activeSlots.filter((s) => s.type !== 'featured')
    : activeSlots.slice(1);

  return (
    <section className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 sm:p-6 mb-6 space-y-7">
      {/* Top summary header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-[#0F766E]" />
            <h2 className="text-base sm:text-lg font-bold text-slate-900">
              {completedCount === totalCount && totalCount > 0
                ? 'Tạo ảnh hoàn tất'
                : isGenerating
                ? 'Đang tiến hành tạo ảnh...'
                : 'Kết quả tạo ảnh bài viết'}
            </h2>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Xem lại ảnh bìa đại diện và các ảnh minh họa trong bài. Bạn có thể phóng to, tải riêng từng ảnh hoặc tạo lại theo ý muốn.
          </p>
        </div>

        {/* Status Badge */}
        <div className="self-start sm:self-auto">
          {completedCount === totalCount && totalCount > 0 ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              {completedCount} / {totalCount} ảnh thành công
            </span>
          ) : isGenerating ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-teal-50 text-[#0F766E] border border-teal-200">
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              Đang tạo: {completedCount} / {totalCount}
            </span>
          ) : failedCount > 0 ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-800 border border-rose-200">
              <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
              {failedCount} ảnh bị lỗi
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700">
              <Clock className="w-3.5 h-3.5 text-slate-500" />
              {completedCount} / {totalCount} đã tạo
            </span>
          )}
        </div>
      </div>

      {/* ======================================================== */}
      {/* SECTION 1: ẢNH BÌA BÀI VIẾT (FEATURED IMAGE) */}
      {/* ======================================================== */}
      {featuredSlots.length > 0 && (
        <div className="space-y-3.5">
          {/* Section Heading with Featured Badge */}
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex items-center gap-2">
              <span className="w-7 h-7 rounded-xl bg-[#0F766E] text-white flex items-center justify-center shadow-2xs">
                <Crown className="w-4 h-4 text-amber-300" />
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm sm:text-base font-bold text-slate-900">
                    Ảnh bìa bài viết
                  </h3>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-[#0F766E] text-white shadow-2xs uppercase tracking-wider">
                    FEATURED &bull; ẢNH BÌA
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Hình ảnh đại diện bài viết tỷ lệ chuẩn 16:9 (1280 &times; 720) &bull; Vị trí: Đầu bài viết &amp; hiển thị trang chủ.
                </p>
              </div>
            </div>
          </div>

          {/* Featured Showcase Card with High Visual Priority */}
          {featuredSlots.map((slot) => {
            const isSuccess = slot.status === 'completed' && Boolean(slot.image_data_url);
            const isFailed = slot.status === 'failed';
            const isSlotGenerating = slot.status === 'generating';
            const filename = slot.final_filename || slot.suggested_filename || `${slot.slot_id}.webp`;
            const isExpanded = expandedDetails[slot.slot_id];

            return (
              <div
                key={slot.slot_id}
                className="bg-gradient-to-br from-teal-50/40 via-white to-teal-50/15 rounded-2xl border-2 border-teal-600/50 p-4 sm:p-6 shadow-xs overflow-hidden"
              >
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6">
                  {/* Left (16:9 Hero Image Container) */}
                  <div className="lg:col-span-7 flex flex-col justify-center">
                    <div className="relative w-full aspect-video bg-slate-900/5 rounded-xl overflow-hidden border border-teal-200/80 flex items-center justify-center shadow-xs">
                      {isSuccess && slot.image_data_url ? (
                        <>
                          <img
                            src={slot.image_data_url}
                            alt={slot.alt || slot.suggested_alt || ''}
                            className="w-full h-full object-cover cursor-pointer hover:scale-102 transition-transform duration-200"
                            onClick={() =>
                              onPreviewImage(slot.image_data_url!, 'Ảnh bìa bài viết (Featured)')
                            }
                          />
                          <button
                            type="button"
                            onClick={() =>
                              onPreviewImage(slot.image_data_url!, 'Ảnh bìa bài viết (Featured)')
                            }
                            className="absolute top-2.5 right-2.5 p-2 bg-black/60 hover:bg-black/80 text-white rounded-lg transition-colors cursor-pointer"
                            title="Xem ảnh bìa phóng to"
                          >
                            <Maximize2 className="w-4 h-4" />
                          </button>
                        </>
                      ) : isSlotGenerating ? (
                        <div className="flex flex-col items-center gap-2 p-8 text-center text-slate-500">
                          <RefreshCw className="w-7 h-7 animate-spin text-[#0F766E]" />
                          <span className="text-xs font-semibold">Đang xử lý ảnh bìa qua Vertex AI...</span>
                        </div>
                      ) : isFailed ? (
                        <div className="flex flex-col items-center gap-1.5 p-8 text-center text-rose-600">
                          <AlertCircle className="w-7 h-7 text-rose-500" />
                          <span className="text-xs font-bold">Tạo ảnh bìa thất bại</span>
                          <span className="text-[11px] text-slate-500 max-w-sm line-clamp-2">
                            {slot.error_message || 'Lỗi kết nối khi gửi yêu cầu'}
                          </span>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center gap-1.5 text-slate-400 p-8 text-center">
                          <FileImage className="w-8 h-8 opacity-40" />
                          <span className="text-xs">Đang chờ tạo ảnh bìa</span>
                        </div>
                      )}

                      {/* Prominent Featured Tag Overlay */}
                      <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5 bg-black/70 text-white text-[10px] font-bold px-2.5 py-1 rounded-md shadow-xs">
                        <Crown className="w-3 h-3 text-amber-300" />
                        <span>ẢNH BÌA &bull; 16:9</span>
                      </div>
                    </div>
                  </div>

                  {/* Right: Metadata & Direct Actions */}
                  <div className="lg:col-span-5 flex flex-col justify-between space-y-3.5">
                    <div className="space-y-2.5">
                      {/* Status & Category Badges */}
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-teal-100/80 text-teal-900 border border-teal-200">
                            Loại: Ảnh bìa chính
                          </span>
                          <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 text-slate-700">
                            Vị trí: Đầu bài viết
                          </span>
                        </div>

                        {isSuccess ? (
                          <span className="text-xs font-bold text-emerald-700 flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                            Đã hoàn tất
                          </span>
                        ) : isFailed ? (
                          <span className="text-xs font-bold text-rose-600 flex items-center gap-1">
                            <AlertCircle className="w-3.5 h-3.5 text-rose-500" />
                            Lỗi
                          </span>
                        ) : null}
                      </div>

                      {/* Editorial Context Preview */}
                      <div className="space-y-1 text-xs">
                        <div className="text-slate-500 text-[11px]">
                          Chiến lược:{' '}
                          <strong className="text-slate-800 font-semibold">
                            {slot.processing_strategy === 'REBUILD_FROM_SOURCE'
                              ? 'Tái tạo chuẩn hóa từ ảnh gốc (Bảo toàn số liệu)'
                              : 'Tạo hình ảnh báo chí mới bằng Vertex AI'}
                          </strong>
                        </div>
                        {slot.alt && (
                          <div className="text-slate-600 text-xs line-clamp-2">
                            <span className="text-slate-400 font-medium">Văn bản Alt:</span> {slot.alt}
                          </div>
                        )}
                        {slot.prompt_summary && (
                          <div className="text-slate-500 text-[11px] line-clamp-2">
                            <span className="text-slate-400 font-medium">Ý tưởng:</span> {slot.prompt_summary}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Featured Actions: Tạo lại & Tải ảnh bìa */}
                    <div className="space-y-2 pt-1 border-t border-teal-100">
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => onRegenerateSlot(slot.slot_id)}
                          disabled={isGenerating || isSlotGenerating}
                          className="h-10 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 shadow-2xs"
                        >
                          <RefreshCw className={`w-3.5 h-3.5 text-slate-500 ${isSlotGenerating ? 'animate-spin' : ''}`} />
                          <span>Tạo lại ảnh bìa</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            if (slot.image_data_url) {
                              downloadSingleFile(filename, slot.image_data_url);
                            }
                          }}
                          disabled={!isSuccess || !slot.image_data_url}
                          className="h-10 rounded-xl bg-[#0F766E] hover:bg-[#115E59] text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          <Download className="w-4 h-4" />
                          <span>Tải ảnh bìa</span>
                        </button>
                      </div>

                      {/* Technical Details Toggle */}
                      <button
                        type="button"
                        onClick={() => toggleDetails(slot.slot_id)}
                        className="text-[11px] text-slate-500 hover:text-slate-800 flex items-center justify-between w-full font-medium cursor-pointer pt-1"
                      >
                        <span>{isExpanded ? 'Ẩn thông tin kỹ thuật' : 'Chi tiết kỹ thuật ảnh bìa'}</span>
                        {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      </button>

                      {isExpanded && (
                        <div className="p-3 rounded-xl bg-white border border-teal-200/80 text-[11px] text-slate-600 space-y-2 animate-in fade-in duration-100 shadow-2xs">
                          <div>
                            <span className="font-semibold text-slate-400 block text-[10px]">Tên file:</span>
                            <span className="font-mono text-slate-900 truncate block font-bold">{filename}</span>
                          </div>
                          <div>
                            <span className="font-semibold text-slate-400 block text-[10px]">Đường dẫn publish:</span>
                            <span className="font-mono text-slate-700 text-[10px] break-all block">{cleanPath}{filename}</span>
                          </div>
                          {slot.final_title && (
                            <div>
                              <span className="font-semibold text-slate-400 block text-[10px]">Tiêu đề (Title):</span>
                              <span className="text-slate-700 block">{slot.final_title}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ======================================================== */}
      {/* SECTION 2: ẢNH MINH HỌA TRONG BÀI (INLINE IMAGES) */}
      {/* ======================================================== */}
      <div className="space-y-3.5 pt-4 border-t border-slate-200">
        {/* Section Heading */}
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center gap-2">
            <span className="w-7 h-7 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center border border-slate-200 shadow-2xs">
              <FileImage className="w-4 h-4 text-slate-600" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm sm:text-base font-bold text-slate-900">
                  Ảnh minh họa trong bài
                </h3>
                <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                  {inlineSlots.length} ảnh nội dung
                </span>
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Các hình ảnh minh họa theo từng đề mục hoặc đoạn văn trong nội dung bài viết.
              </p>
            </div>
          </div>
        </div>

        {/* Empty state if article has no inline slots */}
        {inlineSlots.length === 0 ? (
          <div className="p-6 rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 text-center text-xs text-slate-400">
            Bài viết này chỉ có 1 ảnh bìa chính, không chứa thêm hình ảnh minh họa phụ trong thân bài.
          </div>
        ) : (
          /* Grid of Inline Image Results */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {inlineSlots.map((slot, index) => {
              const isSuccess = slot.status === 'completed' && Boolean(slot.image_data_url);
              const isFailed = slot.status === 'failed';
              const isSlotGenerating = slot.status === 'generating';
              const filename = slot.final_filename || slot.suggested_filename || `${slot.slot_id}.webp`;
              const isExpanded = expandedDetails[slot.slot_id];

              return (
                <div
                  key={slot.slot_id}
                  className="bg-white rounded-2xl border border-slate-200 overflow-hidden flex flex-col hover:border-slate-300 transition-all shadow-xs"
                >
                  {/* Image Preview Container */}
                  <div className="relative w-full aspect-4/3 bg-slate-100 flex items-center justify-center overflow-hidden">
                    {isSuccess && slot.image_data_url ? (
                      <>
                        <img
                          src={slot.image_data_url}
                          alt={slot.alt || slot.suggested_alt || ''}
                          className="w-full h-full object-cover cursor-pointer hover:scale-102 transition-transform duration-200"
                          onClick={() =>
                            onPreviewImage(slot.image_data_url!, `Ảnh minh họa ${index + 1}`)
                          }
                        />
                        <button
                          type="button"
                          onClick={() =>
                            onPreviewImage(slot.image_data_url!, `Ảnh minh họa ${index + 1}`)
                          }
                          className="absolute top-2.5 right-2.5 p-1.5 bg-black/60 hover:bg-black/80 text-white rounded-lg transition-colors cursor-pointer"
                          title="Xem ảnh lớn"
                        >
                          <Maximize2 className="w-3.5 h-3.5" />
                        </button>
                      </>
                    ) : isSlotGenerating ? (
                      <div className="flex flex-col items-center gap-2 p-6 text-center text-slate-500">
                        <RefreshCw className="w-6 h-6 animate-spin text-[#0F766E]" />
                        <span className="text-xs font-semibold">Đang xử lý ảnh qua Vertex AI...</span>
                      </div>
                    ) : isFailed ? (
                      <div className="flex flex-col items-center gap-1.5 p-6 text-center text-rose-600">
                        <AlertCircle className="w-6 h-6 text-rose-500" />
                        <span className="text-xs font-bold">Tạo ảnh thất bại</span>
                        <span className="text-[11px] text-slate-500 line-clamp-2">
                          {slot.error_message || 'Lỗi kết nối khi gửi yêu cầu'}
                        </span>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-1 text-slate-400 p-6 text-center">
                        <FileImage className="w-6 h-6 opacity-40" />
                        <span className="text-xs">Đang chờ tạo ảnh</span>
                      </div>
                    )}

                    {/* Inline badge overlay */}
                    <div className="absolute bottom-2 left-2 bg-black/65 text-white text-[10px] font-medium px-2 py-0.5 rounded">
                      Ảnh nội dung #{index + 1}
                    </div>
                  </div>

                  {/* Card Body & Actions */}
                  <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                    {/* Header & Status */}
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-slate-800">
                          Ảnh minh họa #{index + 1}
                        </span>

                        {isSuccess ? (
                          <span className="text-[11px] font-semibold text-emerald-700 flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            Hoàn tất
                          </span>
                        ) : isFailed ? (
                          <span className="text-[11px] font-semibold text-rose-600 flex items-center gap-1">
                            <AlertCircle className="w-3 h-3 text-rose-500" />
                            Lỗi
                          </span>
                        ) : null}
                      </div>

                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Vị trí: Trong thân bài
                        {slot.nearby_heading && (
                          <span> &bull; Mục: &ldquo;{slot.nearby_heading}&rdquo;</span>
                        )}
                      </p>
                    </div>

                    {/* Primary Actions: Tạo lại & Tải ảnh */}
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => onRegenerateSlot(slot.slot_id)}
                        disabled={isGenerating || isSlotGenerating}
                        className="h-9 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 text-slate-500 ${isSlotGenerating ? 'animate-spin' : ''}`} />
                        <span>Tạo lại</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          if (slot.image_data_url) {
                            downloadSingleFile(filename, slot.image_data_url);
                          }
                        }}
                        disabled={!isSuccess || !slot.image_data_url}
                        className="h-9 rounded-xl bg-[#0F766E] hover:bg-[#115E59] text-white text-xs font-semibold flex items-center justify-center gap-1.5 shadow-2xs transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Tải ảnh</span>
                      </button>
                    </div>

                    {/* Chi tiết ảnh toggle */}
                    <div className="pt-2 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={() => toggleDetails(slot.slot_id)}
                        className="text-[11px] text-slate-500 hover:text-slate-800 flex items-center justify-between w-full font-medium cursor-pointer"
                      >
                        <span>{isExpanded ? 'Ẩn thông tin kỹ thuật' : 'Chi tiết ảnh'}</span>
                        {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                      </button>

                      {isExpanded && (
                        <div className="mt-2.5 p-3 rounded-xl bg-slate-50 border border-slate-200 text-[11px] text-slate-600 space-y-2 animate-in fade-in duration-100">
                          <div>
                            <span className="font-semibold text-slate-400 block text-[10px]">Tên file:</span>
                            <span className="font-mono text-slate-800 truncate block">{filename}</span>
                          </div>
                          <div>
                            <span className="font-semibold text-slate-400 block text-[10px]">Đường dẫn:</span>
                            <span className="font-mono text-slate-700 text-[10px] break-all block">{cleanPath}{filename}</span>
                          </div>
                          {slot.alt && (
                            <div>
                              <span className="font-semibold text-slate-400 block text-[10px]">Mô tả Alt:</span>
                              <span className="text-slate-700 block">{slot.alt}</span>
                            </div>
                          )}
                          {slot.prompt_summary && (
                            <div>
                              <span className="font-semibold text-slate-400 block text-[10px]">Ý tưởng tạo ảnh:</span>
                              <span className="text-slate-600 block line-clamp-3">{slot.prompt_summary}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
};
