import React, { useState } from 'react';
import {
  Sparkles,
  CheckCircle2,
  FileText,
  ChevronDown,
  ChevronUp,
  Image as ImageIcon,
  Folder,
  Sliders,
  ArrowLeft,
  RefreshCw,
  Eye,
  AlertTriangle,
  HelpCircle,
  Wand2,
  ShieldCheck,
  Check,
  Settings2,
  Crown,
  FileImage,
} from 'lucide-react';
import { ArticleAnalysis, BrandProfile, ImageSlotPlan, ProcessingStrategy } from '../types';
import { normalizeBasePath, cleanEditorialAltText } from '../utils/htmlProcessor';
import { BrandProfilePanel } from './BrandProfilePanel';
import { SlotSourceImageControl } from './SlotSourceImageControl';
import { SlotReferenceImageControl } from './SlotReferenceImageControl';

interface ImagePlanTableProps {
  analysis: ArticleAnalysis;
  plan: ImageSlotPlan[];
  brandProfile: BrandProfile;
  onUpdateBrandProfile: (profile: BrandProfile) => void;
  onResetBrandProfile: () => void;
  onUpdateSlot: (index: number, updatedFields: Partial<ImageSlotPlan>) => void;
  onToggleAll: (selected: boolean) => void;
  onGenerateAll: () => void;
  isGenerating: boolean;
  useMockMode: boolean;
  setUseMockMode: (val: boolean) => void;
  outputBasePath: string;
  onOutputBasePathChange: (val: string) => void;
  onBackToStep1?: () => void;
}


const isDirectImageSource = (value?: string) =>
  Boolean(
    value &&
    (
      /^https?:\/\//i.test(value) ||
      /^data:image\//i.test(value)
    )
  );

const hasUsableOriginalSource = (slot: ImageSlotPlan): boolean => {
  if (slot.source_image?.thumbnail_data_url && /^data:image\//i.test(slot.source_image.thumbnail_data_url)) return true;
  if (slot.source_image?.available && isDirectImageSource(slot.source_image?.resolved_url)) return true;
  if (isDirectImageSource(slot.source_resolved_url)) return true;
  if (isDirectImageSource(slot.original_src)) return true;
  if (isDirectImageSource(slot.old_src)) return true;
  return false;
};

export const ImagePlanTable: React.FC<ImagePlanTableProps> = ({
  analysis,
  plan,
  brandProfile,
  onUpdateBrandProfile,
  onResetBrandProfile,
  onUpdateSlot,
  onGenerateAll,
  isGenerating,
  useMockMode,
  setUseMockMode,
  outputBasePath,
  onOutputBasePathChange,
  onBackToStep1,
}) => {
  const [expandedDetails, setExpandedDetails] = useState<Record<string, boolean>>({});
  const [showAdvancedSettings, setShowAdvancedSettings] = useState<boolean>(false);
  const [showBrandPanel, setShowBrandPanel] = useState<boolean>(false);

  const toggleDetails = (slotId: string) => {
    setExpandedDetails((prev) => ({
      ...prev,
      [slotId]: !prev[slotId],
    }));
  };

  const cleanPath = normalizeBasePath(outputBasePath);

  // Separate featured slot and inline slots
  const featuredIndex = plan.findIndex((s) => s.type === 'featured');
  const featuredSlot = featuredIndex !== -1 ? plan[featuredIndex] : plan[0];
  const actualFeaturedIdx = featuredIndex !== -1 ? featuredIndex : 0;

  const inlineSlotsWithIndex = plan
    .map((slot, index) => ({ slot, index }))
    .filter(({ slot }) => slot.type === 'inline');

  // Counts for summary bar
  const generateAiCount = plan.filter(
    (s) => s.processing_strategy === 'GENERATE_AI'
  ).length;
  const rebuildSourceCount = plan.filter(
    (s) => s.processing_strategy === 'GENERATE_FROM_SOURCE_AI'
  ).length;
  const needsDecisionCount = plan.filter(
    (s) => s.processing_strategy === 'NEEDS_DECISION'
  ).length;
  const missingSourceCount = plan.filter(
    (s) =>
      s.selected &&
      s.processing_strategy === 'GENERATE_FROM_SOURCE_AI' &&
      !hasUsableOriginalSource(s)
  ).length;

  const handleStrategyChange = (index: number, strategy: ProcessingStrategy) => {
    let reason = '';
    if (strategy === 'GENERATE_AI') {
      reason = 'Biên tập viên chọn tạo hình ảnh mới hoàn toàn bằng AI.';
    } else if (strategy === 'GENERATE_FROM_SOURCE_AI') {
      reason = 'Biên tập viên chọn dùng ảnh gốc làm tham chiếu để AI tạo một ảnh mới có cùng chủ đề nhưng bố cục và cách thể hiện khác rõ rệt.';
    } else {
      reason = 'Biên tập viên chọn tạo bản mới từ ảnh gốc bảo toàn 100% số liệu.';
    }

    onUpdateSlot(index, {
      processing_strategy: strategy,
      processing_strategy_status: 'manually_selected',
      classification: strategy === 'GENERATE_AI' || strategy === 'GENERATE_FROM_SOURCE_AI' ? 'REPLACE_AI' : 'KEEP_ORIGINAL',
      selected: true,
      reason,
    });
  };

  const handleCleanAlt = (index: number, currentAlt: string, fallbackHint?: string) => {
    const cleaned = cleanEditorialAltText(currentAlt, fallbackHint);
    onUpdateSlot(index, {
      alt: cleaned,
      suggested_alt: cleaned,
      alt_text: cleaned,
    });
  };

  const renderVisualAnalysisBadge = (slot: ImageSlotPlan) => {
    const status =
      slot.visual_analysis_status || (slot.visual_analysis_available ? 'success' : 'unavailable');

    if (status === 'success') {
      return (
        <span
          title="AI đã phân tích trực tiếp pixel ảnh thực tế"
          className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200"
        >
          <Eye className="w-3 h-3 text-emerald-600" />
          ✓ AI đã phân tích nội dung ảnh
        </span>
      );
    }

    if (status === 'analyzing') {
      return (
        <span
          title="Đang phân tích hình ảnh qua AI..."
          className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-blue-50 text-blue-800 border border-blue-200 animate-pulse"
        >
          <RefreshCw className="w-3 h-3 text-blue-600 animate-spin" />
          Đang phân tích ảnh bằng AI...
        </span>
      );
    }

    if (status === 'failed') {
      return (
        <span
          title="Không thể phân tích ảnh bằng AI"
          className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-rose-50 text-rose-800 border border-rose-200"
        >
          <AlertTriangle className="w-3 h-3 text-rose-600" />
          ⚠ Không thể phân tích ảnh bằng AI
        </span>
      );
    }

    // unavailable or not_started
    return (
      <span
        title="Chưa phân tích bằng AI; xử lý dựa trên ngữ cảnh bài viết"
        className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-600 border border-slate-200"
      >
        ○ Chưa phân tích bằng AI
      </span>
    );
  };

  const getDisplayReason = (slot: ImageSlotPlan): string => {
    const isVisualSuccess = slot.visual_analysis_status === 'success';
    if (isVisualSuccess && slot.reason?.includes('Chưa phân tích được ảnh thực tế')) {
      if (slot.visual_description) {
        return `AI đã phân tích nội dung ảnh: ${slot.visual_description}`;
      }
      return 'AI đã nhận diện và phân tích nội dung hình ảnh thực tế.';
    }
    return slot.reason || 'Dựa trên phân tích ngữ cảnh bài viết.';
  };

  return (
    <div className="space-y-6 mb-24">
      {/* Step 2 Header & Utility Controls */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base sm:text-lg font-bold text-slate-900">
                Kiểm tra, siêu dữ liệu &amp; nhận diện thương hiệu
              </h2>
              <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-teal-50 text-[#0F766E] border border-teal-200">
                Quy chuẩn 100% Asset Mới
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Mọi ảnh bài viết đều kết thúc bằng asset mới tối ưu WebP. Với biểu mẫu số liệu, hệ thống ưu tiên Tạo ảnh mới bằng AI hoặc người dùng có thể giữ nguyên bản.
            </p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            <button
              type="button"
              onClick={() => setShowAdvancedSettings(!showAdvancedSettings)}
              className="px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50 flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Sliders className="w-3.5 h-3.5 text-slate-500" />
              <span>{showAdvancedSettings ? 'Ẩn cài đặt' : 'Cài đặt đường dẫn'}</span>
              {showAdvancedSettings ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          </div>
        </div>

        {/* Compact Brand Profile Summary Card / Chip Row (Requirement 7) */}
        <div className="bg-gradient-to-r from-teal-50/80 via-slate-50 to-teal-50/50 rounded-2xl border border-teal-200/80 p-3 sm:p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-2xs">
          <div className="flex flex-wrap items-center gap-2.5 text-xs">
            <div className="flex items-center gap-2 pr-2 border-r border-teal-200/80">
              <div className="w-7 h-7 rounded-xl bg-teal-600 text-white flex items-center justify-center shrink-0 shadow-2xs">
                <ShieldCheck className="w-4 h-4" />
              </div>
              <span className="font-bold text-slate-900">
                Hồ sơ thương hiệu:
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-slate-200/90 font-medium text-slate-700 shadow-2xs">
                <ImageIcon className="w-3 h-3 text-teal-600 shrink-0" />
                Logo: <strong className="font-semibold text-teal-800">Chính thức</strong>
              </span>

              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-slate-200/90 font-medium text-slate-700 shadow-2xs">
                Tên: <strong className="font-semibold text-slate-900">{brandProfile.brand_name ? brandProfile.brand_name : 'Logo đã gồm tên'}</strong>
              </span>

              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-slate-200/90 font-medium text-slate-700 shadow-2xs">
                Watermark:{' '}
                <strong className="font-semibold text-slate-900">
                  {brandProfile.watermark_mode === 'logo_only'
                    ? 'Chỉ logo'
                    : brandProfile.watermark_mode === 'text_only'
                    ? 'Chỉ tên'
                    : brandProfile.watermark_mode === 'none'
                    ? 'Tắt'
                    : 'Logo + Tên'}
                </strong>
              </span>

              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-slate-200/90 font-medium text-slate-700 shadow-2xs">
                Vị trí:{' '}
                <span className="text-slate-800">
                  {brandProfile.position === 'bottom-left'
                    ? 'Góc dưới trái'
                    : brandProfile.position === 'top-right'
                    ? 'Góc trên phải'
                    : brandProfile.position === 'top-left'
                    ? 'Góc trên trái'
                    : brandProfile.position === 'bottom-center'
                    ? 'Góc dưới giữa'
                    : 'Góc dưới phải'}
                </span>
              </span>

              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-slate-200/90 font-medium text-slate-700 shadow-2xs">
                Áp dụng:{' '}
                <span className="text-slate-800">
                  {brandProfile.apply_to === 'featured_only'
                    ? 'Chỉ ảnh bìa'
                    : brandProfile.apply_to === 'inline_only'
                    ? 'Chỉ ảnh trong bài'
                    : 'Tất cả ảnh'}
                </span>
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowBrandPanel(true)}
            className="self-start md:self-auto px-3.5 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-semibold text-xs flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer shrink-0"
          >
            <Settings2 className="w-3.5 h-3.5" />
            <span>Cài đặt thương hiệu</span>
          </button>
        </div>

        {/* Dedicated Brand Profile Modal */}
        <BrandProfilePanel
          brandProfile={brandProfile}
          onChange={onUpdateBrandProfile}
          isOpen={showBrandPanel}
          onClose={() => setShowBrandPanel(false)}
          onReset={onResetBrandProfile}
          asModal={true}
        />

        {/* Global Advanced Settings Panel (Output Path & Demo Mode) */}
        {showAdvancedSettings && (
          <div className="pt-4 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs bg-slate-50/60 p-3.5 rounded-xl animate-in fade-in duration-150">
            <div>
              <label className="block text-slate-700 font-semibold mb-1">
                Thư mục lưu ảnh xuất bản (Output Base Path)
              </label>
              <div className="flex items-center gap-2">
                <Folder className="w-4 h-4 text-slate-400 shrink-0" />
                <input
                  type="text"
                  value={outputBasePath}
                  onChange={(e) => onOutputBasePathChange(e.target.value)}
                  placeholder="uploads/articles/2026/09/"
                  className="flex-1 px-3 py-1.5 font-mono text-xs bg-white rounded-lg border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-[#0F766E]"
                />
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                Mặc định: <code>uploads/articles/{new Date().getFullYear()}/...</code>
              </p>
            </div>

            <div>
              <label className="block text-slate-700 font-semibold mb-1">
                Chế độ thử nghiệm
              </label>
              <div className="flex items-center gap-2 mt-2">
                <input
                  type="checkbox"
                  id="mock-mode-toggle"
                  checked={useMockMode}
                  onChange={(e) => setUseMockMode(e.target.checked)}
                  className="w-4 h-4 text-[#0F766E] rounded border-slate-300 focus:ring-[#0F766E] cursor-pointer"
                />
                <label htmlFor="mock-mode-toggle" className="text-slate-700 cursor-pointer font-medium">
                  Chế độ Demo nhanh (dùng hình mẫu không tốn quota Vertex AI)
                </label>
              </div>
            </div>
          </div>
        )}

        {/* Global Alert if there are unresolved NEEDS_DECISION slots */}
        {needsDecisionCount > 0 && (
          <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-300 text-xs text-amber-950 flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
            <div className="leading-relaxed">
              <strong className="font-bold text-amber-950 block">
                Cần biên tập viên quyết định {needsDecisionCount} vị trí ảnh:
              </strong>
              <span>
                Theo quy chuẩn xuất bản, mọi vị trí ảnh bài viết bắt buộc phải có phương án xử lý rõ ràng (Tạo hình mới bằng AI hoặc Tạo ảnh mới dựa trên ảnh gốc bằng AI) trước khi tiến hành xuất bản.
              </span>
            </div>
          </div>
        )}
      </div>

      {/* 1. FEATURED IMAGE CARD (16:9) */}
      {featuredSlot && (
        <div className="bg-gradient-to-br from-teal-50/40 via-white to-teal-50/15 rounded-2xl border-2 border-teal-600/50 shadow-xs p-5 sm:p-6 overflow-hidden">
          {/* Card Top Header */}
          <div className="flex flex-wrap items-center justify-between gap-2.5 pb-4 mb-4 border-b border-teal-100">
            <div className="flex items-center gap-2.5">
              <span className="px-3 py-1 rounded-lg text-xs font-extrabold bg-[#0F766E] text-white shadow-2xs uppercase tracking-wider flex items-center gap-1.5">
                <Crown className="w-3.5 h-3.5 text-amber-300" />
                <span>FEATURED &bull; ẢNH BÌA BÀI VIẾT</span>
              </span>
              <span className="px-2.5 py-0.5 rounded text-[11px] font-semibold bg-teal-50 text-teal-800 border border-teal-200">
                Vị trí: Đầu bài viết &bull; Tỷ lệ 16:9 (1280 &times; 720)
              </span>
            </div>

            <div className="flex items-center gap-2">
              {renderVisualAnalysisBadge(featuredSlot)}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left: Discovered Source Image Control */}
            <div className="lg:col-span-5 flex flex-col justify-start">
              <SlotSourceImageControl
                slot={featuredSlot}
                onUpdateSlot={(fields) => onUpdateSlot(actualFeaturedIdx, fields)}
                slotLabel="Ảnh bìa bài viết"
              />
            </div>

            {/* Right: Editorial Controls */}
            <div className="lg:col-span-7 space-y-4">
              {/* Strategy Switcher */}
              <div>
                <label className="block text-xs font-semibold text-slate-800 mb-1.5">
                  Chiến lược xử lý ảnh bìa:
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => handleStrategyChange(actualFeaturedIdx, 'GENERATE_AI')}
                    className={`p-2.5 rounded-xl border text-left flex items-start gap-2 transition-all cursor-pointer ${
                      featuredSlot.processing_strategy === 'GENERATE_AI'
                        ? 'border-teal-600 bg-teal-50/70 text-[#0F766E] shadow-2xs font-semibold'
                        : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <Sparkles className="w-4 h-4 text-teal-600 shrink-0 mt-0.5" />
                    <div>
                      <span className="text-xs font-bold block">Tạo hình mới bằng AI</span>
                      <span className="text-[11px] text-slate-500 font-normal">
                        Sinh ảnh nhiếp ảnh hiện đại, đóng dấu watermark bản quyền
                      </span>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleStrategyChange(actualFeaturedIdx, 'GENERATE_FROM_SOURCE_AI')}
                    className={`p-2.5 rounded-xl border text-left flex items-start gap-2 transition-all cursor-pointer ${
                      featuredSlot.processing_strategy === 'GENERATE_FROM_SOURCE_AI'
                        ? 'border-amber-600 bg-amber-50/70 text-amber-900 shadow-2xs font-semibold'
                        : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <FileText className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <span className="text-xs font-bold block">Tạo ảnh mới dựa trên ảnh gốc bằng AI</span>
                      <span className="text-[11px] text-slate-500 font-normal">
                        AI phân tích và tạo ảnh mới với cùng chủ đề, tránh sao chép y hệt
                      </span>
                    </div>
                  </button>
                </div>
              </div>

              {/* Warning if GENERATE_FROM_SOURCE_AI but missing source image */}
              {featuredSlot.processing_strategy === 'GENERATE_FROM_SOURCE_AI' &&
                !hasUsableOriginalSource(featuredSlot) && (
                  <div className="p-3 rounded-xl bg-rose-50 border border-rose-300 text-rose-900 text-xs flex items-center gap-2 font-medium">
                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                    <span>⚠ Cần cung cấp ảnh nguồn để tiếp tục tạo ảnh bìa mới dựa trên ảnh gốc. Dán hoặc tải ảnh lên ở thẻ bên trái.</span>
                  </div>
                )}

              {/* Editor-Facing Vietnamese Concept and Reference Image */}
              {(featuredSlot.processing_strategy === 'GENERATE_AI' || featuredSlot.processing_strategy === 'GENERATE_FROM_SOURCE_AI') && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-800 mb-1">
                      Ý tưởng minh họa (Concept)
                    </label>
                    <textarea
                      rows={2}
                      value={featuredSlot.concept || featuredSlot.suggested_concept || ''}
                      onChange={(e) =>
                        onUpdateSlot(actualFeaturedIdx, {
                          concept: e.target.value,
                          suggested_concept: e.target.value,
                        })
                      }
                      placeholder="Ví dụ: Chuyên viên kế toán doanh nghiệp Việt Nam đang rà soát hóa đơn điện tử trên máy tính tại văn phòng hiện đại."
                      className="w-full px-3.5 py-2 text-xs leading-relaxed rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-[#0F766E] focus:border-transparent bg-slate-50/50 hover:bg-white transition-colors"
                    />
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Mô tả bối cảnh Việt Nam, tone màu sáng và trang phục công sở thực tế.
                    </p>
                  </div>
                  <div className="flex flex-col gap-1 mb-3">
                    <label className="flex items-center gap-2 cursor-pointer w-fit">
                      <input
                        type="checkbox"
                        checked={Boolean(featuredSlot.enable_text_in_image)}
                        onChange={(e) =>
                          onUpdateSlot(actualFeaturedIdx, { enable_text_in_image: e.target.checked })
                        }
                        className="w-4 h-4 text-[#0F766E] rounded border-slate-300 focus:ring-[#0F766E]"
                      />
                      <span className="text-xs font-semibold text-slate-800">Cho phép AI tạo chữ trong ảnh</span>
                    </label>
                    {featuredSlot.enable_text_in_image && (
                      <div className="mt-2 pl-6">
                        <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                          Nội dung chữ (Text/Headline)
                        </label>
                        <input
                          type="text"
                          value={featuredSlot.cover_caption || ""}
                          onChange={(e) =>
                            onUpdateSlot(actualFeaturedIdx, { cover_caption: e.target.value })
                          }
                          placeholder="Để trống để AI tự gợi ý, hoặc nhập nội dung cụ thể..."
                          className="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-300 bg-slate-50/50 hover:bg-white focus:outline-hidden focus:ring-2 focus:ring-[#0F766E]"
                        />
                        <p className="text-[10px] text-slate-400 mt-1">Giới hạn 5-10 từ, tiếng Việt có dấu.</p>
                      </div>
                    )}
                  </div>
                  {/* Reference Image Control for AI */}
                  <SlotReferenceImageControl
                    slot={featuredSlot}
                    onUpdateSlot={(fields) => onUpdateSlot(actualFeaturedIdx, fields)}
                  />
                </div>
              )}

              {/* Complete Metadata Package */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                {/* Alt Text with Auto-Clean Button */}
                <div className="sm:col-span-2">
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-semibold text-slate-800">
                      Văn bản thay thế (Alt text - Chuẩn SEO &amp; Tiếp cận)
                    </label>
                    <button
                      type="button"
                      onClick={() =>
                        handleCleanAlt(
                          actualFeaturedIdx,
                          featuredSlot.alt || featuredSlot.suggested_alt || '',
                          featuredSlot.suggested_concept
                        )
                      }
                      className="text-[11px] text-teal-700 hover:text-teal-900 flex items-center gap-1 font-medium cursor-pointer"
                    >
                      <Wand2 className="w-3 h-3 text-teal-600" />
                      <span>Dọn sạch từ khóa rác</span>
                    </button>
                  </div>
                  <input
                    type="text"
                    value={featuredSlot.alt || featuredSlot.suggested_alt || ''}
                    onChange={(e) =>
                      onUpdateSlot(actualFeaturedIdx, {
                        alt: e.target.value,
                        suggested_alt: e.target.value,
                        alt_text: e.target.value,
                      })
                    }
                    placeholder="Mô tả súc tích cho người khiếm thị và chuẩn SEO..."
                    className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-[#0F766E] focus:border-transparent bg-slate-50/50 hover:bg-white transition-colors"
                  />
                </div>

                {/* Title */}
                <div>
                  <label className="block text-xs font-semibold text-slate-800 mb-1">
                    Tiêu đề ảnh (Title)
                  </label>
                  <input
                    type="text"
                    value={featuredSlot.title || ''}
                    onChange={(e) =>
                      onUpdateSlot(actualFeaturedIdx, { title: e.target.value })
                    }
                    placeholder="Tiêu đề ảnh trực quan..."
                    className="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-300 bg-slate-50/50 hover:bg-white focus:outline-hidden focus:ring-2 focus:ring-[#0F766E]"
                  />
                </div>

                {/* Caption */}
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-800 mb-1">
                    Chú thích ảnh (Caption)
                  </label>
                  <input
                    type="text"
                    value={featuredSlot.caption || ''}
                    onChange={(e) =>
                      onUpdateSlot(actualFeaturedIdx, { caption: e.target.value })
                    }
                    placeholder="Chú thích ngữ cảnh biên tập..."
                    className="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-300 bg-slate-50/50 hover:bg-white focus:outline-hidden focus:ring-2 focus:ring-[#0F766E]"
                  />
                </div>
              </div>

              {/* Display Policy Toggles */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100 text-xs">
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-1.5 cursor-pointer text-slate-700">
                    <input
                      type="checkbox"
                      checked={featuredSlot.show_caption ?? true}
                      onChange={(e) =>
                        onUpdateSlot(actualFeaturedIdx, {
                          show_caption: e.target.checked,
                        })
                      }
                      className="w-3.5 h-3.5 text-[#0F766E] rounded border-slate-300 focus:ring-[#0F766E]"
                    />
                    <span>Hiển thị chú thích trong bài</span>
                  </label>
                </div>

                <button
                  type="button"
                  onClick={() => toggleDetails(featuredSlot.slot_id)}
                  className="text-xs text-slate-500 hover:text-slate-800 flex items-center gap-1 font-medium cursor-pointer ml-auto"
                >
                  <span>{expandedDetails[featuredSlot.slot_id] ? 'Ẩn chi tiết kỹ thuật' : 'Chi tiết kỹ thuật'}</span>
                  {expandedDetails[featuredSlot.slot_id] ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>
              </div>

              {/* Collapsible Advanced Technical Details */}
              {expandedDetails[featuredSlot.slot_id] && (
                <div className="mt-3 p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 text-xs space-y-3 animate-in fade-in duration-100">
                  {featuredSlot.processing_strategy === 'GENERATE_AI' && (
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                        Prompt tạo ảnh (Tiếng Anh - Vertex AI Gemini Imagen)
                      </label>
                      <textarea
                        rows={2}
                        value={featuredSlot.generation_prompt || ''}
                        onChange={(e) =>
                          onUpdateSlot(actualFeaturedIdx, {
                            generation_prompt: e.target.value,
                          })
                        }
                        placeholder="English image prompt passed to Vertex AI..."
                        className="w-full px-2.5 py-1.5 text-xs font-mono bg-white rounded-lg border border-slate-300 focus:outline-hidden focus:ring-1 focus:ring-[#0F766E]"
                      />
                    </div>
                  )}

                  {/* Advanced Credit Override */}
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Ghi đè nguồn / bản quyền (Credit nâng cao - Tùy chọn)
                    </label>
                    <input
                      type="text"
                      value={featuredSlot.credit ?? ''}
                      onChange={(e) =>
                        onUpdateSlot(actualFeaturedIdx, { credit: e.target.value })
                      }
                      placeholder={`Mặc định theo hồ sơ: ${brandProfile.default_credit || brandProfile.brand_name || 'Kế Toán Diệu Tâm'}`}
                      className="w-full px-2.5 py-1.5 text-xs bg-white rounded-lg border border-slate-300 focus:outline-hidden focus:ring-1 focus:ring-teal-600"
                    />
                    <span className="text-[10px] text-slate-400 mt-0.5 block">
                      Để trống để kế thừa tự động từ Hồ sơ thương hiệu ({brandProfile.default_credit || brandProfile.brand_name || 'Kế Toán Diệu Tâm'}).
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 border-t border-slate-200/60">
                    <div>
                      <span className="text-[11px] text-slate-500 block">Tên file khi lưu:</span>
                      <input
                        type="text"
                        value={featuredSlot.final_filename || featuredSlot.suggested_filename || ''}
                        onChange={(e) =>
                          onUpdateSlot(actualFeaturedIdx, {
                            final_filename: e.target.value,
                            filename: e.target.value,
                          })
                        }
                        className="w-full mt-0.5 px-2.5 py-1 text-xs font-mono bg-white rounded border border-slate-200"
                      />
                    </div>
                    <div>
                      <span className="text-[11px] text-slate-500 block">Đường dẫn đầy đủ:</span>
                      <span className="font-mono text-slate-700 text-[11px] truncate block mt-1.5" title={`${cleanPath}${featuredSlot.final_filename || featuredSlot.suggested_filename}`}>
                        {cleanPath}{featuredSlot.final_filename || featuredSlot.suggested_filename}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 2. INLINE IMAGES SECTION */}
      <div className="space-y-4">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center border border-slate-200">
              <FileImage className="w-3.5 h-3.5 text-slate-600" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm sm:text-base font-bold text-slate-900">
                  Ảnh minh họa trong bài (Ảnh nội dung)
                </h3>
                <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-600">
                  {inlineSlotsWithIndex.length} vị trí
                </span>
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Các hình ảnh minh họa cho các đề mục hoặc đoạn văn trong thân bài viết.
              </p>
            </div>
          </div>
        </div>

        {inlineSlotsWithIndex.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-slate-400 text-xs">
            Bài viết không chứa ảnh minh họa nội dung phụ trong thân bài.
          </div>
        ) : (
          <div className="space-y-4">
            {inlineSlotsWithIndex.map(({ slot, index: originalIdx }, inlineOrder) => {
              const isNeedsDecision = slot.processing_strategy === 'NEEDS_DECISION';
              const isAi = slot.processing_strategy === 'GENERATE_AI' || slot.processing_strategy === 'GENERATE_FROM_SOURCE_AI';
              const isRebuildSource = slot.processing_strategy === 'GENERATE_FROM_SOURCE_AI';
              const isExpanded = expandedDetails[slot.slot_id];

              return (
                <div
                  key={slot.slot_id}
                  className={`bg-white rounded-2xl border shadow-xs p-5 sm:p-6 transition-all ${
                    isNeedsDecision
                      ? 'border-amber-400 bg-amber-50/30'
                      : isRebuildSource
                      ? 'border-amber-200 bg-amber-50/10'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  {/* Card Top Bar */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-3 mb-4 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded text-xs font-bold bg-slate-100 text-slate-800 border border-slate-200">
                        Ảnh minh họa #{inlineOrder + 1}
                      </span>
                      <span className="text-xs text-slate-500 hidden sm:inline">
                        (Vị trí: Trong thân bài{slot.nearby_heading ? ` &bull; Mục: "${slot.nearby_heading}"` : ''})
                      </span>
                    </div>

                    {/* Status Badges */}
                    <div className="flex items-center gap-2">
                      {renderVisualAnalysisBadge(slot)}

                      {isNeedsDecision ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-900 border border-amber-300 animate-pulse">
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-700" />
                          ⚠ Cần quyết định
                        </span>
                      ) : isRebuildSource ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                          <FileText className="w-3.5 h-3.5 text-amber-700" />
                          AI &bull; Tạo mới dựa trên ảnh gốc
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-teal-50 text-[#0F766E] border border-teal-200">
                          <CheckCircle2 className="w-3.5 h-3.5 text-teal-600" />
                          Ảnh minh họa (AI)
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                    {/* Left: Original Thumbnail */}
                    {/* Left: Discovered Source Image Control */}
                    <div className="lg:col-span-5 flex flex-col justify-start">
                      <SlotSourceImageControl
                        slot={slot}
                        onUpdateSlot={(fields) => onUpdateSlot(originalIdx, fields)}
                        slotLabel={`Ảnh ${inlineOrder + 1}`}
                      />
                    </div>

                    {/* Right: Information & Controls */}
                    <div className="lg:col-span-7 space-y-3.5">
                      {/* Prominent decision banner if NEEDS_DECISION */}
                      {isNeedsDecision && (
                        <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-300 text-xs text-amber-950 space-y-2">
                          <div className="flex items-center gap-2">
                            <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
                            <strong className="font-bold text-amber-950">
                              Vui lòng chọn chiến lược xử lý cho ảnh này:
                            </strong>
                          </div>
                          <p className="text-amber-900 leading-relaxed">
                            {getDisplayReason(slot)}
                          </p>
                          <div className="flex flex-wrap items-center gap-2 pt-1">
                            <button
                              type="button"
                              onClick={() => handleStrategyChange(originalIdx, 'GENERATE_AI')}
                              className="px-3 py-1.5 rounded-lg bg-teal-700 hover:bg-teal-800 text-white font-bold flex items-center gap-1.5 shadow-2xs cursor-pointer"
                            >
                              <Sparkles className="w-3.5 h-3.5" />
                              <span>Chọn: Tạo hình mới bằng AI</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleStrategyChange(originalIdx, 'GENERATE_FROM_SOURCE_AI')}
                              className="px-3 py-1.5 rounded-lg bg-amber-800 hover:bg-amber-900 text-white font-bold flex items-center gap-1.5 shadow-2xs cursor-pointer"
                            >
                              <FileText className="w-3.5 h-3.5" />
                              <span>Chọn: Tạo ảnh mới dựa trên ảnh gốc bằng AI</span>
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Informational banner if GENERATE_FROM_SOURCE_AI */}
                      {isRebuildSource && !isNeedsDecision && (
                        <div className="p-3 rounded-xl bg-amber-50/80 border border-amber-200 text-xs text-amber-900 flex items-start gap-2.5">
                          <FileText className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                          <div className="leading-relaxed">
                            <strong className="font-semibold block text-amber-950">
                              Tạo ảnh mới dựa trên ảnh gốc bằng AI
                            </strong>
                            <span>
                              AI sẽ dùng ảnh gốc làm ý tưởng để tạo ra một bức ảnh hoàn toàn mới có cùng chủ đề, tránh sao chép y hệt bố cục cũ. (Lưu ý: Không dùng cho hóa đơn, tài liệu)
                            </span>
                          </div>
                        </div>
                      )}

                      {/* Warning if GENERATE_FROM_SOURCE_AI but missing source image */}
                      {slot.processing_strategy === 'GENERATE_FROM_SOURCE_AI' &&
                            !hasUsableOriginalSource(slot) && (
                          <div className="p-3 rounded-xl bg-rose-50 border border-rose-300 text-rose-900 text-xs flex items-center gap-2 font-medium">
                            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                            <span>⚠ Cần cung cấp ảnh nguồn để tiếp tục tạo ảnh mới dựa trên ảnh gốc. Dán hoặc tải ảnh lên ở thẻ bên trái.</span>
                          </div>
                        )}

                      {/* Strategy Switcher Toggle Buttons */}
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-semibold text-slate-700 mr-1">
                          Chiến lược:
                        </span>
                        <button
                          type="button"
                          onClick={() => handleStrategyChange(originalIdx, 'GENERATE_AI')}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                            isAi
                              ? 'bg-[#0F766E] text-white shadow-2xs'
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          }`}
                        >
                          <Sparkles className="w-3.5 h-3.5" />
                          <span>Tạo hình mới bằng AI</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleStrategyChange(originalIdx, 'GENERATE_FROM_SOURCE_AI')}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                            isRebuildSource
                              ? 'bg-amber-800 text-white shadow-2xs'
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          }`}
                        >
                          <FileText className="w-3.5 h-3.5" />
                          <span>Tạo ảnh mới dựa trên ảnh gốc bằng AI</span>
                        </button>
                      </div>

                      {/* Editor-Facing Vietnamese Concept */}
                      {isAi && (
                        <div>
                          <label className="block text-xs font-semibold text-slate-800 mb-1">
                            Ý tưởng hình ảnh (Concept)
                          </label>
                          <textarea
                            rows={2}
                            value={slot.concept || slot.suggested_concept || ''}
                            onChange={(e) =>
                              onUpdateSlot(originalIdx, {
                                concept: e.target.value,
                                suggested_concept: e.target.value,
                              })
                            }
                            placeholder="Ví dụ: Chuyên viên kế toán doanh nghiệp Việt Nam đang rà soát hóa đơn điện tử trên máy tính tại văn phòng hiện đại."
                            className="w-full px-3.5 py-2 text-xs leading-relaxed rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-[#0F766E] focus:border-transparent bg-slate-50/50 hover:bg-white transition-colors"
                          />
                        </div>
                      )}
                  <div className="flex flex-col gap-1 mb-3">
                    <label className="flex items-center gap-2 cursor-pointer w-fit">
                      <input
                        type="checkbox"
                        checked={Boolean(slot.enable_text_in_image)}
                        onChange={(e) =>
                          onUpdateSlot(originalIdx, { enable_text_in_image: e.target.checked })
                        }
                        className="w-4 h-4 text-[#0F766E] rounded border-slate-300 focus:ring-[#0F766E]"
                      />
                      <span className="text-xs font-semibold text-slate-800">Cho phép AI tạo chữ trong ảnh</span>
                    </label>
                    {slot.enable_text_in_image && (
                      <div className="mt-2 pl-6">
                        <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                          Nội dung chữ (Text/Headline)
                        </label>
                        <input
                          type="text"
                          value={slot.cover_caption || ""}
                          onChange={(e) =>
                            onUpdateSlot(originalIdx, { cover_caption: e.target.value })
                          }
                          placeholder="Để trống để AI tự gợi ý, hoặc nhập nội dung cụ thể..."
                          className="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-300 bg-slate-50/50 hover:bg-white focus:outline-hidden focus:ring-2 focus:ring-[#0F766E]"
                        />
                        <p className="text-[10px] text-slate-400 mt-1">Giới hạn 5-10 từ, tiếng Việt có dấu.</p>
                      </div>
                    )}
                  </div>
                      {/* Reference Image Control for AI */}
                      {isAi && (
                        <SlotReferenceImageControl
                          slot={slot}
                          onUpdateSlot={(fields) => onUpdateSlot(originalIdx, fields)}
                        />
                      )}

                      {/* Alt text with Auto-clean */}
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-xs font-semibold text-slate-800">
                            Văn bản thay thế (Alt text)
                          </label>
                          <button
                            type="button"
                            onClick={() =>
                              handleCleanAlt(
                                originalIdx,
                                slot.alt || slot.suggested_alt || '',
                                slot.nearby_heading || slot.suggested_concept
                              )
                            }
                            className="text-[11px] text-teal-700 hover:text-teal-900 flex items-center gap-1 font-medium cursor-pointer"
                          >
                            <Wand2 className="w-3 h-3 text-teal-600" />
                            <span>Dọn sạch từ khóa rác</span>
                          </button>
                        </div>
                        <input
                          type="text"
                          value={slot.alt || slot.suggested_alt || ''}
                          onChange={(e) =>
                            onUpdateSlot(originalIdx, {
                              alt: e.target.value,
                              suggested_alt: e.target.value,
                              alt_text: e.target.value,
                            })
                          }
                          placeholder="Mô tả súc tích cho người khiếm thị và chuẩn SEO..."
                          className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-[#0F766E] focus:border-transparent bg-slate-50/50 hover:bg-white transition-colors"
                        />
                      </div>

                      {/* Metadata Grid (Title, Caption) */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                        <div>
                          <label className="block text-xs font-semibold text-slate-800 mb-1">
                            Tiêu đề ảnh (Title)
                          </label>
                          <input
                            type="text"
                            value={slot.title || ''}
                            onChange={(e) =>
                              onUpdateSlot(originalIdx, { title: e.target.value })
                            }
                            placeholder="Tiêu đề ảnh..."
                            className="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-300 bg-slate-50/50 hover:bg-white focus:outline-hidden focus:ring-2 focus:ring-[#0F766E]"
                          />
                        </div>

                        <div className="sm:col-span-2">
                          <label className="block text-xs font-semibold text-slate-800 mb-1">
                            Chú thích ảnh (Caption)
                          </label>
                          <input
                            type="text"
                            value={slot.caption || ''}
                            onChange={(e) =>
                              onUpdateSlot(originalIdx, { caption: e.target.value })
                            }
                            placeholder="Chú thích ảnh dưới thân bài..."
                            className="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-300 bg-slate-50/50 hover:bg-white focus:outline-hidden focus:ring-2 focus:ring-[#0F766E]"
                          />
                        </div>
                      </div>

                      {/* Toggles & Technical Dropdown */}
                      <div className="pt-2 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 text-xs">
                        <div className="flex items-center gap-4">
                          <label className="flex items-center gap-1.5 cursor-pointer text-slate-700">
                            <input
                              type="checkbox"
                              checked={slot.show_caption ?? true}
                              onChange={(e) =>
                                onUpdateSlot(originalIdx, {
                                  show_caption: e.target.checked,
                                })
                              }
                              className="w-3.5 h-3.5 text-[#0F766E] rounded border-slate-300 focus:ring-[#0F766E]"
                            />
                            <span>Hiển thị chú thích</span>
                          </label>
                        </div>

                        <button
                          type="button"
                          onClick={() => toggleDetails(slot.slot_id)}
                          className="text-xs text-slate-500 hover:text-slate-800 flex items-center gap-1 font-medium cursor-pointer ml-auto"
                        >
                          <span>{isExpanded ? 'Ẩn chi tiết' : 'Chi tiết kỹ thuật'}</span>
                          {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        </button>
                      </div>

                      {/* Collapsible Advanced Details */}
                      {isExpanded && (
                        <div className="mt-3 p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 text-xs space-y-3 animate-in fade-in duration-100">
                          {isAi && (
                            <div>
                              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                                Prompt tạo ảnh (Tiếng Anh - Vertex AI)
                              </label>
                              <textarea
                                rows={2}
                                value={slot.generation_prompt || ''}
                                onChange={(e) =>
                                  onUpdateSlot(originalIdx, {
                                    generation_prompt: e.target.value,
                                  })
                                }
                                placeholder="English generation prompt for Vertex AI..."
                                className="w-full px-2.5 py-1.5 text-xs font-mono bg-white rounded-lg border border-slate-300 focus:outline-hidden focus:ring-1 focus:ring-[#0F766E]"
                              />
                            </div>
                          )}

                          {/* Advanced Credit Override */}
                          <div>
                            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                              Ghi đè nguồn / bản quyền (Credit nâng cao - Tùy chọn)
                            </label>
                            <input
                              type="text"
                              value={slot.credit ?? ''}
                              onChange={(e) =>
                                onUpdateSlot(originalIdx, { credit: e.target.value })
                              }
                              placeholder={`Mặc định theo hồ sơ: ${brandProfile.default_credit || brandProfile.brand_name || 'Kế Toán Diệu Tâm'}`}
                              className="w-full px-2.5 py-1.5 text-xs bg-white rounded-lg border border-slate-300 focus:outline-hidden focus:ring-1 focus:ring-teal-600"
                            />
                            <span className="text-[10px] text-slate-400 mt-0.5 block">
                              Để trống để kế thừa tự động từ Hồ sơ thương hiệu ({brandProfile.default_credit || brandProfile.brand_name || 'Kế Toán Diệu Tâm'}).
                            </span>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 border-t border-slate-200/60">
                            <div>
                              <span className="text-[11px] text-slate-500 block">Tên file:</span>
                              <input
                                type="text"
                                value={slot.final_filename || slot.suggested_filename || ''}
                                onChange={(e) =>
                                  onUpdateSlot(originalIdx, {
                                    final_filename: e.target.value,
                                    filename: e.target.value,
                                  })
                                }
                                className="w-full mt-0.5 px-2.5 py-1 text-xs font-mono bg-white rounded border border-slate-200"
                              />
                            </div>
                            <div>
                              <span className="text-[11px] text-slate-500 block">Đường dẫn đầy đủ:</span>
                              <span className="font-mono text-slate-700 text-[11px] truncate block mt-1.5" title={`${cleanPath}${slot.final_filename || slot.suggested_filename}`}>
                                {cleanPath}{slot.final_filename || slot.suggested_filename}
                              </span>
                            </div>
                          </div>
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

      {/* 3. STICKY ACTION BAR AT BOTTOM OF STEP 2 */}
      <div className="sticky bottom-4 z-20 bg-white/95 backdrop-blur-md border border-slate-200/90 shadow-xl rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="text-xs sm:text-sm text-slate-700 text-center sm:text-left">
          <strong className="text-slate-900 font-bold">
            {generateAiCount} ảnh tạo bằng AI
          </strong>
          {rebuildSourceCount > 0 && (
            <span className="text-amber-900 font-medium">
              {' '}&bull; {rebuildSourceCount} ảnh tạo mới dựa trên ảnh gốc
            </span>
          )}
          {needsDecisionCount > 0 ? (
            <span className="text-rose-700 font-bold block sm:inline sm:ml-2">
              (Còn {needsDecisionCount} vị trí chưa chọn chiến lược)
            </span>
          ) : missingSourceCount > 0 ? (
            <span className="text-rose-700 font-bold block sm:inline sm:ml-2">
              &bull; Còn {missingSourceCount} tài liệu thiếu ảnh nguồn
            </span>
          ) : (
            <span className="text-emerald-700 font-semibold block sm:inline sm:ml-2">
              &bull; 100% vị trí đều có asset mới
            </span>
          )}
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto justify-center sm:justify-end">
          {onBackToStep1 && (
            <button
              type="button"
              onClick={onBackToStep1}
              disabled={isGenerating}
              className="h-11 px-4 rounded-xl border border-slate-200 text-xs sm:text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Quay lại</span>
            </button>
          )}

          <button
            type="button"
            onClick={onGenerateAll}
            disabled={isGenerating || needsDecisionCount > 0 || missingSourceCount > 0}
            className={`h-11 px-6 rounded-xl text-xs sm:text-sm font-bold text-white shadow-md flex items-center justify-center gap-2 transition-all cursor-pointer ${
              isGenerating || needsDecisionCount > 0 || missingSourceCount > 0
                ? 'bg-slate-300 text-slate-500 cursor-not-allowed shadow-none'
                : 'bg-[#0F766E] hover:bg-[#115E59] active:scale-[0.99] shadow-teal-900/10'
            }`}
          >
            {isGenerating ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Đang xử lý &amp; tạo ảnh...</span>
              </>
            ) : needsDecisionCount > 0 ? (
              <>
                <AlertTriangle className="w-4 h-4" />
                <span>Cần chọn chiến lược ({needsDecisionCount})</span>
              </>
            ) : missingSourceCount > 0 ? (
              <>
                <AlertTriangle className="w-4 h-4" />
                <span>Thiếu ảnh nguồn ({missingSourceCount})</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span>✨ Tạo &amp; xử lý toàn bộ ({plan.length} ảnh)</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
