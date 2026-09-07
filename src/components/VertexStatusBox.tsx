import React, { useState } from 'react';
import {
  Cpu,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Settings2,
  ChevronDown,
  ChevronUp,
  ShieldCheck,
  Server,
  Sparkles,
  Save,
} from 'lucide-react';
import { VertexConfigStatus } from '../types';

interface VertexStatusBoxProps {
  status: VertexConfigStatus | null;
  onRefresh: () => Promise<void>;
  onUpdateConfig: (newConfig: { projectId?: string; location?: string; model?: string }) => Promise<void>;
}

export const VertexStatusBox: React.FC<VertexStatusBoxProps> = ({
  status,
  onRefresh,
  onUpdateConfig,
}) => {
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  // Form local state for quick editing
  const [projectIdInput, setProjectIdInput] = useState<string>(status?.project_id || '');
  const [locationInput, setLocationInput] = useState<string>(status?.location || 'global');
  const [modelInput, setModelInput] = useState<string>(status?.model || 'gemini-3.1-flash-image');

  const handleRefreshClick = async () => {
    try {
      setIsRefreshing(true);
      await onRefresh();
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSaving(true);
      await onUpdateConfig({
        projectId: projectIdInput.trim(),
        location: locationInput.trim(),
        model: modelInput.trim(),
      });
      setIsEditing(false);
    } finally {
      setIsSaving(false);
    }
  };

  const isReady = status?.is_ready ?? false;
  const hasProject = status?.project_id_configured ?? false;
  const credsDetected = status?.credentials_detected ?? false;

  return (
    <div className="mb-6 bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden transition-all">
      {/* Top summary bar */}
      <div className="px-4 sm:px-5 py-3.5 bg-slate-50/70 border-b border-slate-200/80 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-teal-800 text-white flex items-center justify-center shrink-0 shadow-xs">
            <Cpu className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs sm:text-sm font-bold text-slate-900">
                Hệ thống tạo ảnh Vertex AI (Google Cloud)
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-teal-100 text-teal-800 border border-teal-200">
                Vertex Mode
              </span>
            </div>
            <p className="text-[11px] text-slate-500">
              Quản lý kết nối hạ tầng tạo ảnh qua Vertex AI &mdash; không sử dụng khóa API Gemini cá nhân
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 ml-auto">
          {/* Readiness pill */}
          <div
            className={`px-2.5 py-1 rounded-full text-xs font-semibold flex items-center gap-1.5 border ${
              isReady
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                : 'bg-amber-50 text-amber-800 border-amber-200'
            }`}
          >
            {isReady ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>Sẵn sàng tạo ảnh</span>
              </>
            ) : (
              <>
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                <span>Chưa sẵn sàng</span>
              </>
            )}
          </div>

          {/* Refresh button */}
          <button
            onClick={handleRefreshClick}
            disabled={isRefreshing}
            title="Kiểm tra kết nối Vertex AI"
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-200/70 transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-teal-700' : ''}`} />
          </button>

          {/* Toggle details */}
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="px-2.5 py-1 text-xs font-medium text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors flex items-center gap-1 cursor-pointer"
          >
            <Settings2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{isExpanded ? 'Thu gọn' : 'Chi tiết cấu hình'}</span>
            {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        </div>
      </div>

      {/* Grid of status parameters (Always visible compact overview) */}
      <div className="p-4 sm:p-5 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
        {/* 1. Chế độ Vertex AI */}
        <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
          <div className="text-slate-500 text-[11px] mb-1 font-medium">Chế độ Vertex AI</div>
          <div className="font-bold text-teal-800 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block animate-pulse"></span>
            Bật (Kích hoạt)
          </div>
        </div>

        {/* 2. Project ID */}
        <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
          <div className="text-slate-500 text-[11px] mb-1 font-medium">Project ID</div>
          <div
            className={`font-mono font-bold truncate ${
              hasProject ? 'text-slate-800' : 'text-amber-700'
            }`}
            title={status?.project_id || 'Chưa cấu hình'}
          >
            {hasProject ? status?.project_id : 'Chưa cấu hình'}
          </div>
        </div>

        {/* 3. Khu vực */}
        <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
          <div className="text-slate-500 text-[11px] mb-1 font-medium">Khu vực (Location)</div>
          <div className="font-mono font-bold text-slate-800">
            {status?.location || 'global'}
          </div>
        </div>

        {/* 4. Model ảnh */}
        <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
          <div className="text-slate-500 text-[11px] mb-1 font-medium">Model ảnh</div>
          <div className="font-mono font-bold text-slate-800 truncate" title={status?.model}>
            {status?.model || 'gemini-3.1-flash-image'}
          </div>
        </div>

        {/* 5. Thông tin xác thực */}
        <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
          <div className="text-slate-500 text-[11px] mb-1 font-medium">Thông tin xác thực</div>
          <div className={`font-bold truncate ${credsDetected ? 'text-emerald-700' : 'text-rose-700'}`} title={status?.credential_source}>
            {credsDetected ? 'Đã phát hiện (ADC)' : 'Chưa có'}
          </div>
        </div>

        {/* 6. Sẵn sàng tạo ảnh */}
        <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
          <div className="text-slate-500 text-[11px] mb-1 font-medium">Sẵn sàng tạo ảnh</div>
          <div className={`font-bold flex items-center gap-1 ${isReady ? 'text-emerald-700' : 'text-amber-700'}`}>
            {isReady ? 'Sẵn sàng' : 'Chưa sẵn sàng'}
          </div>
        </div>
      </div>

      {/* Expanded configuration editor */}
      {isExpanded && (
        <div className="px-4 sm:px-5 pb-5 pt-2 border-t border-slate-100 bg-slate-50/50">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
              <Server className="w-3.5 h-3.5 text-teal-700" />
              Tùy chỉnh cấu hình kết nối Vertex AI trong phiên làm việc
            </span>
            <span className="text-[11px] text-slate-500 italic">
              Xác thực bảo mật hoàn toàn ở phía máy chủ (Server-side)
            </span>
          </div>

          <form onSubmit={handleSaveConfig} className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                Google Cloud Project ID
              </label>
              <input
                type="text"
                value={projectIdInput}
                onChange={(e) => setProjectIdInput(e.target.value)}
                disabled={status?.read_only}
                placeholder="Ví dụ: my-gcp-project-id"
                className="w-full px-3 py-1.5 text-xs font-mono rounded-lg border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-teal-600 focus:border-transparent bg-white disabled:bg-slate-100 disabled:text-slate-600 disabled:cursor-not-allowed"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                Khu vực (Region / Location)
              </label>
              <input
                type="text"
                value={locationInput}
                onChange={(e) => setLocationInput(e.target.value)}
                disabled={status?.read_only}
                placeholder="global, us-central1, asia-east1"
                className="w-full px-3 py-1.5 text-xs font-mono rounded-lg border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-teal-600 focus:border-transparent bg-white disabled:bg-slate-100 disabled:text-slate-600 disabled:cursor-not-allowed"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                Tên Model Vertex AI
              </label>
              <input
                type="text"
                value={modelInput}
                onChange={(e) => setModelInput(e.target.value)}
                disabled={status?.read_only}
                placeholder="gemini-3.1-flash-image"
                className="w-full px-3 py-1.5 text-xs font-mono rounded-lg border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-teal-600 focus:border-transparent bg-white disabled:bg-slate-100 disabled:text-slate-600 disabled:cursor-not-allowed"
              />
            </div>

            <div className="sm:col-span-3 flex items-center justify-end gap-2 pt-1">
              {status?.read_only ? (
                <div className="flex items-center gap-1.5 text-xs text-slate-600 bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200">
                  <ShieldCheck className="w-3.5 h-3.5 text-teal-700" />
                  <span>Cấu hình tự động bởi máy chủ (Server Authority)</span>
                </div>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setProjectIdInput(status?.project_id || '');
                      setLocationInput(status?.location || 'global');
                      setModelInput(status?.model || 'gemini-3.1-flash-image');
                    }}
                    className="px-3 py-1.5 text-xs text-slate-600 hover:text-slate-800 cursor-pointer"
                  >
                    Đặt lại
                  </button>
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="px-4 py-1.5 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>{isSaving ? 'Đang lưu...' : 'Lưu & Cập nhật phiên'}</span>
                  </button>
                </>
              )}
            </div>
          </form>

          {status?.status_message && (
            <div className="mt-3 p-2.5 rounded-lg bg-slate-100 text-slate-700 text-[11px] flex items-center gap-2">
              <span className="font-semibold">Trạng thái:</span>
              <span>{status.status_message}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
