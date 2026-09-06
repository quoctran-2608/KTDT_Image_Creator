import React from 'react';
import { X, CheckCircle2, AlertTriangle, XCircle, Globe, Link2, ExternalLink } from 'lucide-react';
import { SourceDiscoverySummaryItem } from '../types';

interface SourceDiscoveryModalProps {
  isOpen: boolean;
  onClose: () => void;
  summaryItems: SourceDiscoverySummaryItem[];
  articleUrl?: string;
  baseUrl?: string;
  onNavigateToSlot?: (slotId: string) => void;
}

export const SourceDiscoveryModal: React.FC<SourceDiscoveryModalProps> = ({
  isOpen,
  onClose,
  summaryItems,
  articleUrl,
  baseUrl,
  onNavigateToSlot,
}) => {
  if (!isOpen) return null;

  const successCount = summaryItems.filter((i) => i.status === 'success').length;
  const warningCount = summaryItems.filter((i) => i.status === 'warning').length;
  const errorCount = summaryItems.filter((i) => i.status === 'error').length;

  return (
    <div
      id="source-discovery-modal-backdrop"
      className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white w-full max-w-2xl rounded-2xl shadow-xl border border-slate-200 overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-teal-50 border border-teal-200 text-[#0F766E] flex items-center justify-center">
              <Globe className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Báo cáo kiểm tra nguồn ảnh gốc
              </h3>
              <p className="text-[11px] text-slate-500">
                Kết quả tìm kiếm và đối soát ảnh từ bài viết đang xuất bản
              </p>
            </div>
          </div>
          <button
            type="button"
            id="close-source-discovery-modal-btn"
            onClick={onClose}
            className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Source Configuration Summary */}
        <div className="px-5 py-3 bg-slate-50 border-b border-slate-200/80 text-xs space-y-1.5">
          {articleUrl ? (
            <div className="flex items-center gap-1.5 text-slate-700 truncate">
              <span className="font-semibold shrink-0 text-slate-500">URL bài viết gốc:</span>
              <a
                href={articleUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="text-[#0F766E] hover:underline truncate flex items-center gap-1"
              >
                <span className="truncate">{articleUrl}</span>
                <ExternalLink className="w-3 h-3 shrink-0" />
              </a>
            </div>
          ) : (
            <div className="text-slate-400 italic">
              Chưa cung cấp URL bài viết gốc (hệ thống sử dụng URL trong HTML hoặc Base URL).
            </div>
          )}

          {baseUrl && (
            <div className="flex items-center gap-1.5 text-slate-700 truncate">
              <span className="font-semibold shrink-0 text-slate-500">Base URL website:</span>
              <span className="font-mono text-slate-800 truncate">{baseUrl}</span>
            </div>
          )}

          {/* Quick stats pills */}
          <div className="flex items-center gap-2 pt-1">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
              <CheckCircle2 className="w-3 h-3" />
              {successCount} ảnh sẵn sàng
            </span>
            {warningCount > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                <AlertTriangle className="w-3 h-3" />
                {warningCount} cần xác nhận
              </span>
            )}
            {errorCount > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                <XCircle className="w-3 h-3" />
                {errorCount} chưa tải được
              </span>
            )}
          </div>
        </div>

        {/* List of slots */}
        <div className="p-5 overflow-y-auto space-y-3 flex-1">
          {summaryItems.length === 0 ? (
            <div className="text-center py-8 text-xs text-slate-400">
              Chưa có dữ liệu kiểm tra. Vui lòng phân tích bài viết trước.
            </div>
          ) : (
            summaryItems.map((item) => (
              <div
                key={item.slot_id}
                className={`p-3.5 rounded-xl border text-xs transition-colors ${
                  item.status === 'success'
                    ? 'bg-emerald-50/40 border-emerald-200/80'
                    : item.status === 'warning'
                    ? 'bg-amber-50/50 border-amber-200'
                    : 'bg-rose-50/40 border-rose-200'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5">
                    <div className="mt-0.5 shrink-0">
                      {item.status === 'success' ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      ) : item.status === 'warning' ? (
                        <AlertTriangle className="w-4 h-4 text-amber-600" />
                      ) : (
                        <XCircle className="w-4 h-4 text-rose-600" />
                      )}
                    </div>
                    <div>
                      <div className="font-bold text-slate-900 flex items-center gap-2">
                        <span>{item.label}</span>
                        <span className="font-mono text-[10px] font-medium text-slate-500 bg-white px-1.5 py-0.5 rounded border border-slate-200">
                          {item.slot_id}
                        </span>
                      </div>
                      <p className="text-slate-600 text-[11px] mt-1 leading-relaxed">
                        {item.message}
                      </p>
                      {item.resolved_url && (
                        <div className="mt-1.5 flex items-center gap-1 text-[11px] text-slate-500 font-mono truncate max-w-md">
                          <Link2 className="w-3 h-3 shrink-0 text-slate-400" />
                          <span className="truncate">{item.resolved_url}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {onNavigateToSlot && (
                    <button
                      type="button"
                      onClick={() => {
                        onNavigateToSlot(item.slot_id);
                        onClose();
                      }}
                      className="shrink-0 text-[11px] font-semibold text-[#0F766E] hover:underline px-2 py-1 rounded-lg hover:bg-teal-50/80 cursor-pointer"
                    >
                      Đến vị trí
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-100 bg-slate-50 flex items-center justify-between text-xs">
          <span className="text-slate-400">
            Bạn có thể dán ảnh hoặc tải file trực tiếp tại từng thẻ ảnh trong Bước 2.
          </span>
          <button
            type="button"
            onClick={onClose}
            className="h-9 px-4 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-800 font-semibold transition-colors cursor-pointer"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};
