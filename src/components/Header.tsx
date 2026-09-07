import React from 'react';
import { Sparkles, PlusCircle } from 'lucide-react';

interface HeaderProps {
  isVertexReady?: boolean;
  onOpenConfigDrawer: () => void;
  onNewArticle?: () => void;
  isBusy?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  isVertexReady = true,
  onOpenConfigDrawer,
  onNewArticle,
  isBusy = false,
}) => {
  return (
    <header className="border-b border-slate-200 bg-white/95 backdrop-blur-md sticky top-0 z-30 shadow-2xs">
      <div className="max-w-[1180px] mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex items-center justify-between gap-3">
        {/* Left Branding */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#0F766E] flex items-center justify-center text-white shadow-xs">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-sm sm:text-base font-bold text-slate-900 leading-tight">
              KTDT AI Image Rebuilder
            </h1>
            <p className="text-xs text-slate-500 font-medium">
              Tạo lại hình ảnh bài viết bằng AI
            </p>
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2 sm:gap-2.5">
          {onNewArticle && (
            <button
              onClick={onNewArticle}
              type="button"
              id="header-new-article-btn"
              disabled={isBusy}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                isBusy
                  ? 'opacity-50 cursor-not-allowed bg-slate-100 text-slate-400 border-slate-200'
                  : 'bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-900 border-slate-200 hover:border-slate-300 shadow-2xs active:scale-[0.98]'
              }`}
              title={isBusy ? 'Hệ thống đang xử lý tác vụ...' : 'Xóa dữ liệu hiện tại để bắt đầu bài viết mới'}
            >
              <PlusCircle className="w-3.5 h-3.5 text-[#0F766E]" />
              <span className="hidden sm:inline">Bắt đầu với bài viết mới</span>
              <span className="sm:hidden">Bài mới</span>
            </button>
          )}

          {/* Compact AI Status Indicator */}
          <button
            onClick={onOpenConfigDrawer}
            type="button"
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all cursor-pointer ${
              isVertexReady
                ? 'bg-emerald-50/90 text-emerald-800 border-emerald-200 hover:bg-emerald-100/90'
                : 'bg-amber-50/90 text-amber-800 border-amber-200 hover:bg-amber-100/90'
            }`}
            title="Nhấn để xem hoặc cập nhật cấu hình hệ thống"
          >
            <span
              className={`w-2 h-2 rounded-full ${
                isVertexReady ? 'bg-emerald-600 animate-pulse' : 'bg-amber-500'
              }`}
            />
            <span>{isVertexReady ? 'AI sẵn sàng' : 'AI chưa cấu hình'}</span>
          </button>
        </div>
      </div>
    </header>
  );
};
