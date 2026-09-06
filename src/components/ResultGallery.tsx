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

  // Filter slots that were selected for AI generation
  const activeSlots = plan.filter(
    (s) => s.classification === 'REPLACE_AI' && (s.selected || s.status === 'completed' || s.status === 'failed')
  );

  const completedCount = activeSlots.filter(
    (s) => s.status === 'completed' && Boolean(s.image_data_url)
  ).length;
  const failedCount = activeSlots.filter((s) => s.status === 'failed').length;
  const totalCount = activeSlots.length;

  if (activeSlots.length === 0) return null;

  return (
    <section className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 sm:p-6 mb-6">
      {/* Top summary header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 mb-5 border-b border-slate-100">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-[#0F766E]" />
            <h2 className="text-base sm:text-lg font-bold text-slate-900">
              {completedCount === totalCount && totalCount > 0
                ? 'Tạo ảnh hoàn tất'
                : isGenerating
                ? 'Đang tiến hành tạo ảnh...'
                : 'Kết quả tạo ảnh'}
            </h2>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Xem lại hình ảnh đã tạo bằng AI. Bạn có thể phóng to, tải riêng từng ảnh hoặc yêu cầu AI tạo lại.
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

      {/* Grid of Results */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {activeSlots.map((slot) => {
          const isFeatured = slot.type === 'featured';
          const isSuccess = slot.status === 'completed' && Boolean(slot.image_data_url);
          const isFailed = slot.status === 'failed';
          const isSlotGenerating = slot.status === 'generating';
          const filename = slot.final_filename || slot.suggested_filename || `${slot.slot_id}.webp`;
          const isExpanded = expandedDetails[slot.slot_id];

          return (
            <div
              key={slot.slot_id}
              className="bg-slate-50/50 rounded-2xl border border-slate-200 overflow-hidden flex flex-col hover:border-slate-300 transition-all shadow-xs"
            >
              {/* Image Preview Container */}
              <div
                className={`relative w-full bg-slate-100 flex items-center justify-center overflow-hidden ${
                  isFeatured ? 'aspect-video' : 'aspect-4/3'
                }`}
              >
                {isSuccess && slot.image_data_url ? (
                  <>
                    <img
                      src={slot.image_data_url}
                      alt={slot.alt || slot.suggested_alt || ''}
                      className="w-full h-full object-cover cursor-pointer hover:scale-102 transition-transform duration-200"
                      onClick={() =>
                        onPreviewImage(
                          slot.image_data_url!,
                          isFeatured ? 'Ảnh bìa bài viết' : `Ảnh minh họa ${slot.slot_id}`
                        )
                      }
                    />
                    <button
                      type="button"
                      onClick={() =>
                        onPreviewImage(
                          slot.image_data_url!,
                          isFeatured ? 'Ảnh bìa bài viết' : `Ảnh minh họa ${slot.slot_id}`
                        )
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

                {/* Aspect ratio tag */}
                <div className="absolute bottom-2 left-2 bg-black/60 text-white text-[10px] font-mono px-2 py-0.5 rounded">
                  {isFeatured ? '16:9 • Bìa' : 'Minh họa'}
                </div>
              </div>

              {/* Card Body & Actions */}
              <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                {/* Status and Title */}
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-slate-800">
                    {isFeatured ? 'Ảnh bìa (Featured)' : `Ảnh minh họa`}
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
                    <div className="mt-2.5 p-3 rounded-xl bg-white border border-slate-200/80 text-[11px] text-slate-600 space-y-2 animate-in fade-in duration-100">
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
    </section>
  );
};
