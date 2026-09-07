import React from 'react';
import {
  ShieldCheck,
  Check,
  Sparkles,
  Layers,
  Eye,
  Info,
  X,
  RotateCcw,
  CheckCircle2,
  Lock,
} from 'lucide-react';
import { BrandProfile } from '../types';

interface BrandProfilePanelProps {
  brandProfile: BrandProfile;
  onChange: (profile: BrandProfile) => void;
  isOpen?: boolean;
  onClose?: () => void;
  onReset?: () => void;
  asModal?: boolean;
}

export const BrandProfilePanel: React.FC<BrandProfilePanelProps> = ({
  brandProfile,
  onChange,
  isOpen = true,
  onClose,
  onReset,
  asModal = false,
}) => {
  if (asModal && !isOpen) {
    return null;
  }

  const defaultCreditText =
    brandProfile.default_credit || brandProfile.brand_name || 'Kế Toán Diệu Tâm';

  const updateProfile = (changes: Partial<BrandProfile>) => {
    const next: BrandProfile = {
      ...brandProfile,
      ...changes,
      // Always enforce official production watermark invariants on update
      enabled: true,
      logo_url: '/api/brand-logo',
      logo_uploaded: true,
      watermark_mode: 'logo_only',
      position: 'bottom-right',
      apply_to: 'all',
      show_logo: true,
      show_brand_name: false,
      apply_to_featured: true,
      apply_to_ai_inline: true,
    };
    if ('brand_name' in changes && !brandProfile.default_credit) {
      next.default_credit = changes.brand_name || '';
    }
    onChange(next);
  };

  const content = (
    <div className="space-y-6">
      {/* 3 Concepts Clarity Banner */}
      <div className="bg-slate-900 text-slate-100 rounded-2xl p-4 sm:p-5 border border-slate-800 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <Info className="w-4 h-4 text-teal-400 shrink-0" />
          <span className="text-xs font-bold tracking-wide uppercase text-teal-300">
            Quy chuẩn xuất bản KTDT: Phân định 3 tầng thông tin
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
          <div className="bg-slate-800/80 rounded-xl p-3 border border-slate-700/60">
            <div className="flex items-center gap-1.5 font-bold text-teal-200 mb-1">
              <ShieldCheck className="w-3.5 h-3.5 text-teal-400" />
              1. Watermark đồ họa
            </div>
            <p className="text-slate-300 text-[11px] leading-relaxed">
              Đóng dấu logo trực tiếp lên pixel ảnh bằng Sharp trên server. <strong>Không dùng AI vẽ logo</strong> để đảm bảo 100% chuẩn xác nhận diện thương hiệu.
            </p>
          </div>

          <div className="bg-slate-800/80 rounded-xl p-3 border border-slate-700/60">
            <div className="flex items-center gap-1.5 font-bold text-sky-200 mb-1">
              <Layers className="w-3.5 h-3.5 text-sky-400" />
              2. Metadata biên tập
            </div>
            <p className="text-slate-300 text-[11px] leading-relaxed">
              Bao gồm Alt text, Title, Caption tối ưu SEO và người đọc. Được biên tập viên kiểm tra chi tiết theo từng ngữ cảnh bài viết.
            </p>
          </div>

          <div className="bg-slate-800/80 rounded-xl p-3 border border-slate-700/60">
            <div className="flex items-center gap-1.5 font-bold text-amber-200 mb-1">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              3. Nguồn &amp; Bản quyền (Credit)
            </div>
            <p className="text-slate-300 text-[11px] leading-relaxed">
              Kế thừa toàn cục từ hồ sơ này vào Manifest JSON &amp; Schema SEO. Không hiển thị lặp lại gây rối trên từng thẻ ảnh.
            </p>
          </div>
        </div>
      </div>

      {/* Main Configuration Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Brand Identity & Read-Only Watermark Specification */}
        <div className="lg:col-span-7 space-y-5">
          {/* Section A & B: Logo & Brand Identity (Official read-only) */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 space-y-4 shadow-xs">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-teal-600" />
                Nhận diện &amp; Logo thương hiệu chính thức
              </h4>
              <span className="text-[10px] font-semibold text-teal-800 bg-teal-50 border border-teal-200/80 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                <Lock className="w-3 h-3 text-teal-600" />
                Hệ thống tự động (Read-only)
              </span>
            </div>

            {/* Official Logo Display Box (Read-only) */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 p-4 rounded-xl bg-slate-50/80 border border-slate-200/70">
              <div className="w-28 h-20 rounded-xl border border-slate-200 bg-white flex items-center justify-center overflow-hidden shrink-0 shadow-2xs p-2">
                <img
                  src="/api/brand-logo"
                  alt="Logo Kế Toán Diệu Tâm"
                  className="max-w-full max-h-full object-contain"
                />
              </div>

              <div className="flex-1 space-y-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-sm font-bold text-slate-900 mr-1">
                    Kế Toán Diệu Tâm
                  </span>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-teal-100 text-teal-800 border border-teal-200/60">
                    Logo chính thức
                  </span>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-sky-100 text-sky-800 border border-sky-200/60">
                    Watermark tự động
                  </span>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-amber-100 text-amber-900 border border-amber-200/60">
                    Chỉ logo
                  </span>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-slate-200 text-slate-800 border border-slate-300/60">
                    Áp dụng cho tất cả ảnh
                  </span>
                </div>
                <p className="text-[11px] text-slate-600 leading-normal">
                  Hệ thống sử dụng logo chính thức nền trong suốt (biểu tượng và dòng chữ “Kế Toán Diệu Tâm”) đóng dấu tự động server-side cho ảnh bìa (Featured) và ảnh minh họa (Inline). Không cần tải logo thủ công.
                </p>
              </div>
            </div>
          </div>

          {/* Section C: Production Watermark Policy (Read-Only) */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 space-y-3.5 shadow-xs">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-teal-600" />
                Quy chuẩn đóng dấu Watermark Production
              </h4>
              <span className="text-[10px] font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200/80 px-2 py-0.5 rounded-full flex items-center gap-1">
                <Check className="w-3 h-3 text-emerald-600" />
                Quy định cố định
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded-xl bg-slate-50/80 border border-slate-200/70 space-y-1">
                <div className="text-[11px] text-slate-500 font-medium">Chế độ hiển thị</div>
                <div className="font-bold text-slate-900 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-teal-600"></span>
                  Chỉ logo (Logo-only)
                </div>
                <p className="text-[11px] text-slate-500 leading-normal">
                  Logo chính thức đã kết hợp sẵn biểu trưng và tên thương hiệu, không chèn chữ trùng lặp.
                </p>
              </div>

              <div className="p-3 rounded-xl bg-slate-50/80 border border-slate-200/70 space-y-1">
                <div className="text-[11px] text-slate-500 font-medium">Vị trí đóng dấu</div>
                <div className="font-bold text-slate-900 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-teal-600"></span>
                  Góc dưới phải (Bottom-Right)
                </div>
                <p className="text-[11px] text-slate-500 leading-normal">
                  Vị trí chuẩn báo chí chuyên nghiệp, cân đối và không che khuất nội dung trung tâm.
                </p>
              </div>

              <div className="p-3 rounded-xl bg-slate-50/80 border border-slate-200/70 space-y-1">
                <div className="text-[11px] text-slate-500 font-medium">Phạm vi áp dụng</div>
                <div className="font-bold text-slate-900 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-teal-600"></span>
                  Tất cả ảnh (All images)
                </div>
                <p className="text-[11px] text-slate-500 leading-normal">
                  Áp dụng đồng bộ cho toàn bộ ảnh bìa (Featured) và ảnh minh họa (Inline) của bài viết.
                </p>
              </div>

              <div className="p-3 rounded-xl bg-slate-50/80 border border-slate-200/70 space-y-1">
                <div className="text-[11px] text-slate-500 font-medium">Tỷ lệ kích thước &amp; Độ mờ</div>
                <div className="font-bold text-slate-900 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-teal-600"></span>
                  Featured: 17% (0.90) | Inline: 14% (0.75)
                </div>
                <p className="text-[11px] text-slate-500 leading-normal">
                  Tự động căn chỉnh theo tỷ lệ pixel khung hình, đảm bảo tính thẩm mỹ và độ tương phản cao.
                </p>
              </div>
            </div>

            {/* Source Documents Branding Policy Toggle */}
            <div className="pt-3 border-t border-slate-100">
              <label className="flex items-start gap-3 p-3 rounded-xl border border-slate-200 bg-slate-50/70 hover:bg-slate-50 cursor-pointer transition-colors">
                <input
                  type="checkbox"
                  checked={Boolean(brandProfile.apply_to_source_docs)}
                  onChange={(e) =>
                    updateProfile({
                      apply_to_source_docs: e.target.checked,
                    })
                  }
                  className="w-4 h-4 mt-0.5 text-teal-600 rounded border-slate-300 focus:ring-teal-600 cursor-pointer"
                />
                <div className="space-y-1">
                  <span className="font-bold text-xs text-slate-800 block">
                    Đóng dấu lên tài liệu nguồn / biểu mẫu
                  </span>
                  <p className="text-[11px] text-slate-500 leading-normal">
                    Áp dụng thanh chân trang bảo toàn 100% số liệu biểu mẫu, bảng số hoặc chứng từ khi tái tạo từ ảnh gốc.
                  </p>
                </div>
              </label>
            </div>
          </div>
        </div>

        {/* Right Column: Global Credit Policy & Live Simulator Preview */}
        <div className="lg:col-span-5 space-y-5">
          {/* Section I & J: Global Credit & Article Output Policy */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 space-y-4 shadow-xs">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-amber-600" />
              Chính sách Credit &amp; Xuất bản toàn cục
            </h4>

            {/* Default Credit Value */}
            <div>
              <label className="block text-xs font-semibold text-slate-800 mb-1">
                Tên nguồn / Bản quyền mặc định (Default Credit)
              </label>
              <input
                type="text"
                value={defaultCreditText}
                onChange={(e) =>
                  updateProfile({
                    default_credit: e.target.value,
                  })
                }
                placeholder="Kế Toán Diệu Tâm"
                className="w-full px-3.5 py-2 text-xs font-medium rounded-xl border border-slate-300 bg-white text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-teal-600"
              />
              <p className="text-[11px] text-slate-500 mt-1.5 leading-normal">
                Giá trị này tự động ghi vào Manifest JSON và Schema.org Article. Biên tập viên không cần gõ lại trên từng ảnh.
              </p>
            </div>

            {/* Show Credit In Article Toggle */}
            <div className="pt-3 border-t border-slate-100">
              <label className="flex items-start gap-3 p-3 rounded-xl border border-slate-200 bg-slate-50/70 hover:bg-slate-50 cursor-pointer transition-colors">
                <input
                  type="checkbox"
                  checked={Boolean(brandProfile.show_credit_in_article)}
                  onChange={(e) =>
                    updateProfile({
                      show_credit_in_article: e.target.checked,
                    })
                  }
                  className="w-4 h-4 mt-0.5 text-teal-600 rounded border-slate-300 focus:ring-teal-600 cursor-pointer"
                />
                <div className="space-y-1">
                  <span className="font-bold text-xs text-slate-800 block">
                    Hiển thị dòng chữ Nguồn trong mã HTML bài viết (Mặc định: TẮT)
                  </span>
                  <p className="text-[11px] text-slate-500 leading-normal">
                    Khi bật, mã HTML xuất bản sẽ tự động chèn thêm đoạn{' '}
                    <code className="bg-slate-200/80 px-1 py-0.5 rounded text-[10px] text-slate-700 font-mono">
                      &lt;span class=&quot;image-credit&quot;&gt;Nguồn: {defaultCreditText}&lt;/span&gt;
                    </code>{' '}
                    vào trong thẻ chú thích <code className="font-mono text-[10px]">&lt;figcaption&gt;</code>.
                  </p>
                </div>
              </label>
            </div>
          </div>

          {/* Live Simulator Preview */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 space-y-3 shadow-xs">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                <Eye className="w-4 h-4 text-teal-600" />
                Mô phỏng dấu watermark thực tế
              </h4>
              <span className="text-[11px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                Xem trước thời gian thực
              </span>
            </div>

            {/* Realistic canvas box */}
            <div className="relative aspect-16/10 rounded-xl overflow-hidden bg-slate-800 border border-slate-700 shadow-inner flex items-center justify-center select-none">
              {/* Simulated photo background */}
              <div className="absolute inset-0 bg-gradient-to-br from-slate-700 via-teal-950 to-slate-900 opacity-90" />
              <div className="absolute inset-0 bg-[radial-gradient(#38bdf8_1px,transparent_1px)] [background-size:16px_16px] opacity-15" />

              <div className="relative z-10 text-center px-4">
                <span className="text-xs font-medium text-slate-300">
                  Khung cảnh ảnh minh họa bài viết
                </span>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  1280 x 720 px &bull; Tỷ lệ 16:9
                </p>
              </div>

              {/* Dynamic Official Logo Overlay */}
              <div
                className="absolute z-20 pointer-events-none transition-all duration-200"
                style={{
                  bottom: '16px',
                  right: '16px',
                }}
              >
                <img
                  src="/api/brand-logo"
                  alt="Logo chính thức Kế Toán Diệu Tâm"
                  className="h-9 sm:h-11 w-auto object-contain drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]"
                  style={{ opacity: 0.85 }}
                />
              </div>
            </div>

            <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
              <span>Được xử lý quyết định bằng Sharp trên máy chủ</span>
              <span className="font-semibold text-teal-700 flex items-center gap-1">
                <Check className="w-3.5 h-3.5" />
                Sắc nét 100%
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  if (asModal) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
        <div className="bg-slate-50 rounded-3xl border border-slate-200/80 w-full max-w-5xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
          {/* Modal Header */}
          <div className="flex items-center justify-between px-6 py-4 bg-white border-b border-slate-200 shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-teal-600 text-white flex items-center justify-center shadow-xs">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Cài đặt thương hiệu &amp; Bản quyền (Brand Profile)
                </h3>
                <p className="text-xs text-slate-500">
                  Cấu hình watermark tự động, logo thương hiệu và thông tin credit tập trung cho toàn bộ bài viết.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {onReset && (
                <button
                  type="button"
                  onClick={onReset}
                  className="px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 font-semibold text-xs transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Khôi phục mặc định</span>
                </button>
              )}
              {onClose && (
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-semibold text-xs transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  <span>Xong &amp; Áp dụng</span>
                </button>
              )}
              {onClose && (
                <button
                  type="button"
                  onClick={onClose}
                  className="w-8 h-8 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-slate-500 hover:text-slate-800 flex items-center justify-center transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Modal Body */}
          <div className="p-6 overflow-y-auto max-h-[calc(90vh-80px)]">{content}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-slate-50 rounded-2xl border border-slate-200 p-5 sm:p-6 space-y-6">
      <div className="flex items-center justify-between pb-4 border-b border-slate-200">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-teal-600 text-white flex items-center justify-center shadow-xs">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm sm:text-base font-bold text-slate-900">
              Hồ sơ nhận diện thương hiệu (Brand Profile)
            </h3>
            <p className="text-xs text-slate-500">
              Cấu hình watermark tự động và thông tin credit tập trung cho toàn bài viết.
            </p>
          </div>
        </div>
      </div>
      {content}
    </div>
  );
};
