import React, { useState, useEffect } from 'react';
import {
  X,
  Cpu,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Save,
  Server,
  ShieldCheck,
  Info,
} from 'lucide-react';
import { VertexConfigStatus } from '../types';

interface SystemConfigDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  status: VertexConfigStatus | null;
  onRefresh: () => Promise<void>;
  onUpdateConfig: (newConfig: { projectId?: string; location?: string; model?: string }) => Promise<void>;
}

export const SystemConfigDrawer: React.FC<SystemConfigDrawerProps> = ({
  isOpen,
  onClose,
  status,
  onRefresh,
  onUpdateConfig,
}) => {
  const [projectIdInput, setProjectIdInput] = useState<string>('');
  const [locationInput, setLocationInput] = useState<string>('global');
  const [modelInput, setModelInput] = useState<string>('gemini-3.1-flash-image');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (status) {
      setProjectIdInput(status.project_id || '');
      setLocationInput(status.location || 'global');
      setModelInput(status.model || 'gemini-3.1-flash-image');
    }
  }, [status]);

  if (!isOpen) return null;

  const handleRefreshClick = async () => {
    try {
      setIsRefreshing(true);
      await onRefresh();
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSaving(true);
      setSaveFeedback(null);
      await onUpdateConfig({
        projectId: projectIdInput.trim(),
        location: locationInput.trim(),
        model: modelInput.trim(),
      });
      setSaveFeedback('Đã cập nhật cấu hình kết nối thành công.');
      setTimeout(() => setSaveFeedback(null), 3000);
    } finally {
      setIsSaving(false);
    }
  };

  const isReady = status?.is_ready ?? false;
  const hasProject = status?.project_id_configured ?? false;
  const credsDetected = status?.credentials_detected ?? false;

  return (
    <div className="fixed inset-0 z-50 flex justify-end" aria-labelledby="drawer-title" role="dialog" aria-modal="true">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      {/* Drawer Panel */}
      <div className="relative w-full max-w-md bg-white h-full shadow-2xl flex flex-col z-10 border-l border-slate-200 animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#0F766E] text-white flex items-center justify-center shrink-0 shadow-xs">
              <Cpu className="w-4 h-4" />
            </div>
            <div>
              <h2 id="drawer-title" className="text-sm font-bold text-slate-900">
                Cấu hình hệ thống
              </h2>
              <p className="text-[11px] text-slate-500">
                Kết nối hạ tầng tạo ảnh Vertex AI
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
            title="Đóng"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Status Banner */}
          <div
            className={`p-3.5 rounded-xl border flex items-start gap-3 ${
              isReady
                ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900'
                : 'bg-amber-50/70 border-amber-200 text-amber-900'
            }`}
          >
            {isReady ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            )}
            <div className="text-xs">
              <span className="font-bold block">
                {isReady ? 'Hệ thống sẵn sàng tạo ảnh' : 'Chưa sẵn sàng tạo ảnh'}
              </span>
              <p className="mt-0.5 text-slate-600 leading-relaxed">
                {status?.status_message || (isReady ? 'Kết nối Vertex AI hoạt động bình thường.' : 'Vui lòng kiểm tra lại Project ID hoặc thông tin xác thực.')}
              </p>
            </div>
          </div>

          {/* Quick Overview Badges */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
              <span className="text-[11px] text-slate-500 block mb-1">Nền tảng</span>
              <span className="font-semibold text-slate-800 flex items-center gap-1.5">
                <Server className="w-3.5 h-3.5 text-[#0F766E]" />
                Vertex AI (GCP)
              </span>
            </div>
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
              <span className="text-[11px] text-slate-500 block mb-1">Xác thực máy chủ</span>
              <span className={`font-semibold flex items-center gap-1.5 ${credsDetected ? 'text-emerald-700' : 'text-amber-700'}`}>
                <ShieldCheck className="w-3.5 h-3.5" />
                {credsDetected ? 'Đã phát hiện (ADC)' : 'Chưa có'}
              </span>
            </div>
          </div>

          {/* Form Fields */}
          <form onSubmit={handleSave} className="space-y-4">
            {status?.read_only && (
              <div className="p-3 bg-teal-50/70 rounded-xl border border-teal-200 text-xs text-teal-900 flex items-start gap-2">
                <Info className="w-4 h-4 text-teal-700 shrink-0 mt-0.5" />
                <div className="leading-relaxed">
                  <span className="font-semibold block">Cấu hình được quản lý bởi máy chủ (Server Authority)</span>
                  Ứng dụng đang chạy ở chế độ triển khai dùng chung. Thông số Google Cloud và Vertex AI được nạp tự động qua biến môi trường của chủ sở hữu (Owner). Người dùng không cần và không thể chỉnh sửa các thông số này.
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-800 mb-1">
                Google Cloud Project ID
              </label>
              <input
                type="text"
                value={projectIdInput}
                onChange={(e) => setProjectIdInput(e.target.value)}
                disabled={status?.read_only}
                placeholder="Ví dụ: my-gcp-project-id"
                className="w-full px-3 py-2 text-xs font-mono rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-[#0F766E] focus:border-transparent bg-white disabled:bg-slate-100 disabled:text-slate-600 disabled:cursor-not-allowed"
              />
              <p className="text-[11px] text-slate-400 mt-1">
                {hasProject ? 'Đã liên kết Project ID.' : 'Bắt buộc để tính cước dịch vụ qua tài khoản Google Cloud của cơ quan.'}
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-800 mb-1">
                Khu vực (Region / Location)
              </label>
              <input
                type="text"
                value={locationInput}
                onChange={(e) => setLocationInput(e.target.value)}
                disabled={status?.read_only}
                placeholder="global, us-central1, asia-east1"
                className="w-full px-3 py-2 text-xs font-mono rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-[#0F766E] focus:border-transparent bg-white disabled:bg-slate-100 disabled:text-slate-600 disabled:cursor-not-allowed"
              />
              <p className="text-[11px] text-slate-400 mt-1">
                Mặc định khuyến nghị: <code>global</code>
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-800 mb-1">
                Mô hình tạo ảnh (Model)
              </label>
              <input
                type="text"
                value={modelInput}
                onChange={(e) => setModelInput(e.target.value)}
                disabled={status?.read_only}
                placeholder="gemini-3.1-flash-image"
                className="w-full px-3 py-2 text-xs font-mono rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-[#0F766E] focus:border-transparent bg-white disabled:bg-slate-100 disabled:text-slate-600 disabled:cursor-not-allowed"
              />
              <p className="text-[11px] text-slate-400 mt-1">
                Mặc định: <code>gemini-3.1-flash-image</code>
              </p>
            </div>

            {saveFeedback && (
              <div className="p-2.5 rounded-lg bg-emerald-50 text-emerald-800 text-xs border border-emerald-200 flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>{saveFeedback}</span>
              </div>
            )}

            <div className="pt-2 flex items-center gap-2">
              {status?.read_only ? (
                <div className="flex-1 h-10 rounded-xl bg-slate-100 text-slate-500 text-xs font-medium flex items-center justify-center gap-1.5 border border-slate-200">
                  <ShieldCheck className="w-4 h-4 text-teal-700" />
                  <span>Cấu hình tự động bởi máy chủ</span>
                </div>
              ) : (
                <button
                  type="submit"
                  disabled={isSaving}
                  className="flex-1 h-10 rounded-xl bg-[#0F766E] hover:bg-[#115E59] text-white text-xs font-semibold flex items-center justify-center gap-2 shadow-xs transition-colors cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{isSaving ? 'Đang lưu...' : 'Lưu cấu hình'}</span>
                </button>
              )}

              <button
                type="button"
                onClick={handleRefreshClick}
                disabled={isRefreshing}
                title="Kiểm tra lại kết nối"
                className="h-10 px-3 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-100 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-[#0F766E]' : ''}`} />
                <span className="hidden sm:inline">Kiểm tra</span>
              </button>
            </div>
          </form>

          {/* Security & Guidance Note */}
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-[11px] text-slate-500 space-y-1.5">
            <div className="font-semibold text-slate-700 flex items-center gap-1">
              <Info className="w-3 h-3 text-[#0F766E]" />
              Nguyên tắc an toàn thông tin:
            </div>
            <p className="leading-relaxed">
              Toàn bộ xác thực diễn ra an toàn ở tầng máy chủ (Server-side ADC). Không lưu khóa bảo mật hoặc thông tin nhạy cảm ở trình duyệt.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 bg-slate-50/50 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-medium text-slate-700 hover:bg-slate-200 transition-colors cursor-pointer"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};
