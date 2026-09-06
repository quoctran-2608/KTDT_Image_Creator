import React, { useRef, useState } from 'react';
import {
  ShieldCheck,
  Upload,
  Image as ImageIcon,
  CheckCircle2,
  Sliders,
  Sparkles,
  FileText,
  X,
  Trash2,
  Eye,
  Info,
  Layers,
  Settings2,
  Check,
} from 'lucide-react';
import { BrandProfile, WatermarkMode, WatermarkPosition, WatermarkScope } from '../types';

interface BrandProfilePanelProps {
  brandProfile: BrandProfile;
  onChange: (profile: BrandProfile) => void;
  isOpen?: boolean;
  onClose?: () => void;
  asModal?: boolean;
}

export const BrandProfilePanel: React.FC<BrandProfilePanelProps> = ({
  brandProfile,
  onChange,
  isOpen = true,
  onClose,
  asModal = false,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeTab, setActiveTab] = useState<'watermark' | 'metadata'>('watermark');

  if (asModal && !isOpen) {
    return null;
  }

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      if (dataUrl) {
        onChange({
          ...brandProfile,
          logo_url: dataUrl,
          logo_uploaded: true,
          show_logo: true,
        });
      }
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveLogo = () => {
    onChange({
      ...brandProfile,
      logo_url: '',
      logo_uploaded: false,
    });
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const currentMode: WatermarkMode =
    brandProfile.watermark_mode ||
    (brandProfile.show_logo !== false || brandProfile.show_brand_name !== false
      ? 'logo_and_text'
      : 'none');

  const currentPosition: WatermarkPosition =
    brandProfile.position || 'bottom-right';

  const currentScope: WatermarkScope = brandProfile.apply_to || 'all';

  const currentPadding = brandProfile.padding || brandProfile.edge_padding || 24;

  const currentOpacity = brandProfile.opacity ?? 0.85;

  const currentLogoSize = brandProfile.logo_size || 'medium';

  const defaultCreditText =
    brandProfile.default_credit || brandProfile.brand_name || 'Kế Toán Diệu Tâm';

  const content = (
    <div className="space-y-6">
      {/* 3 Concepts Clarity Banner (Requirement 4) */}
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
              Đóng dấu logo &amp; chữ trực tiếp lên pixel ảnh bằng công cụ Sharp lập trình. <strong>Không dùng AI vẽ logo</strong> để đảm bảo 100% chuẩn xác.
            </p>
          </div>

          <div className="bg-slate-800/80 rounded-xl p-3 border border-slate-700/60">
            <div className="flex items-center gap-1.5 font-bold text-sky-200 mb-1">
              <Layers className="w-3.5 h-3.5 text-sky-400" />
              2. Metadata biên tập
            </div>
            <p className="text-slate-300 text-[11px] leading-relaxed">
              Bao gồm Alt text, Title, Caption tối ưu SEO và người đọc. Được chỉnh sửa chi tiết theo từng ngữ cảnh bài viết.
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
        {/* Left Column: Brand Identity & Mode */}
        <div className="lg:col-span-7 space-y-5">
          {/* Section A & B: Logo & Brand Name */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 space-y-4 shadow-xs">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-teal-600" />
              Nhận diện &amp; Logo thương hiệu
            </h4>

            {/* Logo Upload Box */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <div className="w-20 h-20 rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 flex items-center justify-center overflow-hidden shrink-0 relative group">
                {brandProfile.logo_url ? (
                  <img
                    src={brandProfile.logo_url}
                    alt="Logo thương hiệu"
                    className="max-w-full max-h-full object-contain p-2"
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center text-slate-400 p-2 text-center">
                    <ImageIcon className="w-6 h-6 mb-1 text-slate-300" />
                    <span className="text-[10px] font-medium text-slate-400">Biểu trưng KTDT</span>
                  </div>
                )}
              </div>

              <div className="flex-1 space-y-2">
                <input
                  type="file"
                  ref={fileInputRef}
                  accept="image/png,image/svg+xml,image/webp"
                  onChange={handleLogoUpload}
                  className="hidden"
                  id="brand-logo-file-input"
                />

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="h-8 px-3 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 font-semibold text-xs text-slate-800 flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
                  >
                    <Upload className="w-3.5 h-3.5 text-teal-600" />
                    <span>{brandProfile.logo_url ? 'Thay đổi logo' : 'Tải logo PNG / SVG'}</span>
                  </button>

                  {brandProfile.logo_url && (
                    <button
                      type="button"
                      onClick={handleRemoveLogo}
                      className="h-8 px-2.5 rounded-xl border border-red-200 bg-red-50 hover:bg-red-100 font-semibold text-xs text-red-700 flex items-center gap-1 transition-colors cursor-pointer"
                      title="Xóa logo tùy chỉnh"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Xóa logo</span>
                    </button>
                  )}
                </div>

                <p className="text-[11px] text-slate-500 leading-normal">
                  {brandProfile.logo_url ? (
                    <span className="text-emerald-700 font-medium flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Đang sử dụng logo tùy chỉnh của bạn (được bảo toàn tỉ lệ khi đóng dấu).
                    </span>
                  ) : (
                    'Khuyên dùng file PNG nền trong suốt hoặc SVG. Nếu chưa tải, hệ thống sẽ dùng biểu trưng nhận diện chuẩn của Diệu Tâm.'
                  )}
                </p>
              </div>
            </div>

            {/* Brand Name Input */}
            <div className="pt-2 border-t border-slate-100">
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-slate-800">
                  Tên thương hiệu xuất bản (Tùy chọn nếu logo đã có sẵn chữ)
                </label>
                {brandProfile.brand_name ? (
                  <span className="text-[10px] text-teal-700 font-medium bg-teal-50 px-2 py-0.5 rounded-md">
                    Có tên thương hiệu
                  </span>
                ) : (
                  <span className="text-[10px] text-amber-700 font-medium bg-amber-50 px-2 py-0.5 rounded-md">
                    Chỉ dùng biểu trưng logo
                  </span>
                )}
              </div>
              <input
                type="text"
                value={brandProfile.brand_name ?? ''}
                onChange={(e) =>
                  onChange({
                    ...brandProfile,
                    brand_name: e.target.value,
                  })
                }
                placeholder="Kế Toán Diệu Tâm"
                className="w-full px-3.5 py-2 text-xs font-medium rounded-xl border border-slate-300 bg-white text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-teal-600"
              />
              <p className="text-[11px] text-slate-500 mt-1 leading-normal">
                💡 <em>Nếu file logo bạn vừa tải lên đã chứa sẵn tên thương hiệu dạng hình ảnh, bạn có thể để trống ô này để hệ thống chỉ đóng dấu logo mà không thêm chữ lặp lại.</em>
              </p>
            </div>
          </div>

          {/* Section C: Watermark Mode */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 space-y-3 shadow-xs">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Chế độ hiển thị Watermark
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {[
                {
                  id: 'logo_and_text' as WatermarkMode,
                  title: 'Logo + Tên thương hiệu',
                  desc: 'Huy hiệu kết hợp biểu trưng và dòng chữ tên thương hiệu.',
                  badge: 'Khuyên dùng',
                },
                {
                  id: 'logo_only' as WatermarkMode,
                  title: 'Chỉ logo',
                  desc: 'Phù hợp khi logo đã vẽ sẵn chữ hoặc muốn phong cách tối giản.',
                  badge: 'Gọn gàng',
                },
                {
                  id: 'text_only' as WatermarkMode,
                  title: 'Chỉ tên thương hiệu',
                  desc: 'Chỉ hiển thị tên dạng chữ nổi bật không kèm biểu tượng.',
                  badge: 'Đơn giản',
                },
                {
                  id: 'none' as WatermarkMode,
                  title: 'Không đóng watermark',
                  desc: 'Ảnh xuất bản xuất nguyên gốc, không can thiệp watermark lên pixel.',
                  badge: 'Tắt đóng dấu',
                },
              ].map((item) => {
                const isSelected = currentMode === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() =>
                      onChange({
                        ...brandProfile,
                        watermark_mode: item.id,
                        enabled: item.id !== 'none',
                        show_logo: item.id === 'logo_and_text' || item.id === 'logo_only',
                        show_brand_name:
                          item.id === 'logo_and_text' || item.id === 'text_only',
                      })
                    }
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                      isSelected
                        ? 'border-teal-600 bg-teal-50/60 ring-1 ring-teal-600'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-1 mb-1">
                        <span
                          className={`text-xs font-bold ${
                            isSelected ? 'text-teal-900' : 'text-slate-800'
                          }`}
                        >
                          {item.title}
                        </span>
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${
                            isSelected
                              ? 'bg-teal-200/80 text-teal-800'
                              : 'bg-slate-100 text-slate-500'
                          }`}
                        >
                          {item.badge}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 leading-normal">
                        {item.desc}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Section D, E, F, G: Position, Size, Opacity, Padding */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 space-y-4 shadow-xs">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Vị trí &amp; Tùy biến hiển thị trên ảnh
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Position */}
              <div>
                <label className="block text-xs font-semibold text-slate-800 mb-1">
                  Vị trí đóng dấu trên khung hình
                </label>
                <select
                  value={currentPosition}
                  onChange={(e) =>
                    onChange({
                      ...brandProfile,
                      position: e.target.value as WatermarkPosition,
                    })
                  }
                  className="w-full px-3 py-2 text-xs font-medium rounded-xl border border-slate-300 bg-white text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-teal-600"
                >
                  <option value="bottom-right">Góc dưới phải (Khuyên dùng chuẩn báo chí)</option>
                  <option value="bottom-left">Góc dưới trái</option>
                  <option value="bottom-center">Góc dưới giữa</option>
                  <option value="top-right">Góc trên phải</option>
                  <option value="top-left">Góc trên trái</option>
                </select>
              </div>

              {/* Logo Size */}
              <div>
                <label className="block text-xs font-semibold text-slate-800 mb-1">
                  Kích thước watermark
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  {[
                    { id: 'small', label: 'Nhỏ (26px)' },
                    { id: 'medium', label: 'Vừa (34px)' },
                    { id: 'large', label: 'Lớn (42px)' },
                  ].map((sz) => (
                    <button
                      key={sz.id}
                      type="button"
                      onClick={() =>
                        onChange({
                          ...brandProfile,
                          logo_size: sz.id as 'small' | 'medium' | 'large',
                        })
                      }
                      className={`py-2 px-1 text-center rounded-xl text-xs font-semibold border transition-colors cursor-pointer ${
                        currentLogoSize === sz.id
                          ? 'border-teal-600 bg-teal-50 text-teal-900 ring-1 ring-teal-600'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {sz.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Opacity Slider */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-slate-800">
                    Độ mờ nhận diện (Opacity)
                  </label>
                  <span className="text-xs font-bold text-teal-700 bg-teal-50 px-2 py-0.5 rounded-md">
                    {Math.round(currentOpacity * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0.1"
                  max="1.0"
                  step="0.05"
                  value={currentOpacity}
                  onChange={(e) =>
                    onChange({
                      ...brandProfile,
                      opacity: parseFloat(e.target.value),
                    })
                  }
                  className="w-full accent-teal-600 cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-slate-400 mt-0.5">
                  <span>10% (Rất mờ)</span>
                  <span>85% (Tiêu chuẩn)</span>
                  <span>100% (Đậm nét)</span>
                </div>
              </div>

              {/* Padding */}
              <div>
                <label className="block text-xs font-semibold text-slate-800 mb-1">
                  Khoảng cách mép ảnh (Lề an toàn)
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  {[
                    { val: 16, label: '16px (Sát mép)' },
                    { val: 24, label: '24px (Chuẩn)' },
                    { val: 32, label: '32px (Rộng rãi)' },
                  ].map((p) => (
                    <button
                      key={p.val}
                      type="button"
                      onClick={() =>
                        onChange({
                          ...brandProfile,
                          edge_padding: p.val,
                          padding: p.val,
                        })
                      }
                      className={`py-2 px-1 text-center rounded-xl text-xs font-semibold border transition-colors cursor-pointer ${
                        currentPadding === p.val
                          ? 'border-teal-600 bg-teal-50 text-teal-900 ring-1 ring-teal-600'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Scope: Apply To */}
            <div className="pt-3 border-t border-slate-100">
              <label className="block text-xs font-semibold text-slate-800 mb-2">
                Phạm vi áp dụng đóng dấu
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {[
                  {
                    id: 'all' as WatermarkScope,
                    title: 'Tất cả ảnh',
                    subtitle: 'Ảnh bìa + Ảnh trong bài',
                  },
                  {
                    id: 'featured_only' as WatermarkScope,
                    title: 'Chỉ ảnh bìa',
                    subtitle: 'Chỉ đóng dấu ảnh đại diện',
                  },
                  {
                    id: 'inline_only' as WatermarkScope,
                    title: 'Chỉ ảnh trong bài',
                    subtitle: 'Không đóng dấu ảnh bìa',
                  },
                ].map((sc) => {
                  const isSelected = currentScope === sc.id;
                  return (
                    <button
                      key={sc.id}
                      type="button"
                      onClick={() =>
                        onChange({
                          ...brandProfile,
                          apply_to: sc.id,
                          apply_to_featured: sc.id === 'all' || sc.id === 'featured_only',
                          apply_to_ai_inline: sc.id === 'all' || sc.id === 'inline_only',
                        })
                      }
                      className={`p-2.5 rounded-xl border text-left transition-colors cursor-pointer ${
                        isSelected
                          ? 'border-teal-600 bg-teal-50 text-teal-950 ring-1 ring-teal-600'
                          : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                      }`}
                    >
                      <div className="font-bold text-xs">{sc.title}</div>
                      <div className="text-[11px] text-slate-500">{sc.subtitle}</div>
                    </button>
                  );
                })}
              </div>
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
                  onChange({
                    ...brandProfile,
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
                    onChange({
                      ...brandProfile,
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

              {/* Dynamic Watermark Badge */}
              {currentMode !== 'none' && (
                <div
                  className="absolute z-20 pointer-events-none transition-all duration-200 flex items-center"
                  style={{
                    ...(currentPosition === 'bottom-right' && {
                      bottom: `${currentPadding / 2}px`,
                      right: `${currentPadding / 2}px`,
                    }),
                    ...(currentPosition === 'bottom-left' && {
                      bottom: `${currentPadding / 2}px`,
                      left: `${currentPadding / 2}px`,
                    }),
                    ...(currentPosition === 'bottom-center' && {
                      bottom: `${currentPadding / 2}px`,
                      left: '50%',
                      transform: 'translateX(-50%)',
                    }),
                    ...(currentPosition === 'top-right' && {
                      top: `${currentPadding / 2}px`,
                      right: `${currentPadding / 2}px`,
                    }),
                    ...(currentPosition === 'top-left' && {
                      top: `${currentPadding / 2}px`,
                      left: `${currentPadding / 2}px`,
                    }),
                  }}
                >
                  <div
                    className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-white/20 shadow-lg backdrop-blur-xs"
                    style={{
                      backgroundColor: `rgba(15, 23, 42, ${currentOpacity * 0.95})`,
                    }}
                  >
                    {(currentMode === 'logo_and_text' || currentMode === 'logo_only') && (
                      <div
                        className="rounded-md overflow-hidden shrink-0 flex items-center justify-center bg-white/10"
                        style={{
                          width:
                            currentLogoSize === 'small'
                              ? '18px'
                              : currentLogoSize === 'large'
                              ? '26px'
                              : '22px',
                          height:
                            currentLogoSize === 'small'
                              ? '18px'
                              : currentLogoSize === 'large'
                              ? '26px'
                              : '22px',
                        }}
                      >
                        {brandProfile.logo_url ? (
                          <img
                            src={brandProfile.logo_url}
                            alt="Watermark logo"
                            className="max-w-full max-h-full object-contain"
                          />
                        ) : (
                          <div className="w-full h-full bg-teal-600 rounded flex items-center justify-center text-[10px] font-bold text-white">
                            KT
                          </div>
                        )}
                      </div>
                    )}

                    {(currentMode === 'logo_and_text' || currentMode === 'text_only') &&
                      Boolean(brandProfile.brand_name) && (
                        <span
                          className="font-semibold text-white tracking-wide truncate max-w-[160px]"
                          style={{
                            fontSize:
                              currentLogoSize === 'small'
                                ? '10px'
                                : currentLogoSize === 'large'
                                ? '12px'
                                : '11px',
                            opacity: currentOpacity,
                          }}
                        >
                          {brandProfile.brand_name}
                        </span>
                      )}
                  </div>
                </div>
              )}

              {currentMode === 'none' && (
                <div className="absolute bottom-3 right-3 z-20 bg-slate-900/80 text-slate-400 text-[10px] px-2 py-1 rounded-md border border-slate-700">
                  Watermark đã tắt
                </div>
              )}
            </div>

            <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
              <span>Được xử lý trực tiếp trên GPU máy chủ</span>
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
