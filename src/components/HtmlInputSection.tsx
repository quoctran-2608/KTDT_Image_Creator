import React, { useState, useRef, useEffect } from 'react';
import {
  Sparkles,
  ChevronDown,
  RefreshCw,
  CheckCircle2,
  Edit3,
  Trash2,
  Eye,
  BookOpen,
  ArrowRight,
  Globe,
  Link2,
  HelpCircle,
  Activity,
  PlusCircle,
} from 'lucide-react';
import { ArticleAnalysis, ImageSlotPlan } from '../types';
import { SAMPLE_ARTICLES, SampleArticle } from '../utils/sampleArticles';

interface HtmlInputSectionProps {
  htmlSource: string;
  setHtmlSource: (html: string) => void;
  articleUrl: string;
  setArticleUrl: (url: string) => void;
  baseUrl: string;
  setBaseUrl: (url: string) => void;
  articleTitle: string;
  setArticleTitle: (title: string) => void;
  onAnalyze: () => void;
  isAnalyzing: boolean;
  onClear: () => void;
  analysis: ArticleAnalysis | null;
  plan: ImageSlotPlan[];
  onSelectSample: (sample: SampleArticle) => void;
  onContinueToStep2?: () => void;
  onResetAnalysis?: () => void;
  onOpenDiscoveryModal?: () => void;
  onNewArticle?: () => void;
  isBusy?: boolean;
}

export const HtmlInputSection: React.FC<HtmlInputSectionProps> = ({
  htmlSource,
  setHtmlSource,
  articleUrl,
  setArticleUrl,
  baseUrl,
  setBaseUrl,
  articleTitle,
  setArticleTitle,
  onAnalyze,
  isAnalyzing,
  onClear,
  analysis,
  plan,
  onSelectSample,
  onContinueToStep2,
  onResetAnalysis,
  onOpenDiscoveryModal,
  onNewArticle,
  isBusy = false,
}) => {
  const [showSampleMenu, setShowSampleMenu] = useState(false);
  const [isViewingSource, setIsViewingSource] = useState(false);
  const [showUrlHelp, setShowUrlHelp] = useState(false);
  const sampleMenuRef = useRef<HTMLDivElement>(null);

  // Track if baseUrl was manually edited by user
  const isBaseUrlManuallyEdited = useRef(false);

  // Close sample menu on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (sampleMenuRef.current && !sampleMenuRef.current.contains(event.target as Node)) {
        setShowSampleMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Helper to infer Base URL from Article URL
  const handleArticleUrlChange = (newUrl: string) => {
    setArticleUrl(newUrl);

    // Auto-infer base URL if user hasn't typed a custom base URL yet
    if (!isBaseUrlManuallyEdited.current && newUrl.trim()) {
      try {
        const clean = newUrl.trim();
        if (/^https?:\/\//i.test(clean)) {
          const parsed = new URL(clean);
          let pathname = parsed.pathname;
          const lastSlash = pathname.lastIndexOf('/');
          if (lastSlash >= 0) {
            pathname = pathname.substring(0, lastSlash + 1);
          }
          if (!pathname.endsWith('/')) pathname += '/';
          setBaseUrl(`${parsed.origin}${pathname}`);
        }
      } catch {
        // Ignore invalid URL typing
      }
    }
  };

  const handleBaseUrlChange = (newBase: string) => {
    isBaseUrlManuallyEdited.current = Boolean(newBase.trim());
    setBaseUrl(newBase);
  };

  const replaceCount = plan.filter((s) => s.classification === 'REPLACE_AI').length;
  const keepCount = plan.filter((s) => s.classification === 'KEEP_ORIGINAL').length;

  // Case 1: Analysis completed, show compact summary card unless user clicked "Xem source HTML"
  if (analysis && !isViewingSource) {
    return (
      <section className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 sm:p-6 mb-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          {/* Article Summary */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                Đã đọc bài viết
              </span>
              <span className="text-xs text-slate-400">
                {plan.length} vị trí ảnh được phát hiện
              </span>

              {/* URL discovery status */}
              {articleUrl && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-slate-100 text-slate-700">
                  <Globe className="w-3 h-3 text-slate-400" />
                  Bài viết gốc: {new URL(articleUrl).hostname}
                </span>
              )}
            </div>

            <h2 className="text-base sm:text-lg font-bold text-slate-900 leading-snug">
              {analysis.title || 'Bài viết đã biên tập'}
            </h2>

            {/* Counts & Diagnostic Link */}
            <div className="flex flex-wrap items-center gap-3 pt-1 text-xs">
              <span className="font-medium text-[#0F766E] bg-teal-50 px-2.5 py-1 rounded-lg border border-teal-100 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#0F766E]" />
                {replaceCount} ảnh có thể tạo lại
              </span>
              {keepCount > 0 && (
                <span className="font-medium text-amber-800 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-100 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-600" />
                  {keepCount} tài liệu nguồn
                </span>
              )}

              {onOpenDiscoveryModal && (
                <button
                  type="button"
                  id="open-source-discovery-summary-btn"
                  onClick={onOpenDiscoveryModal}
                  className="font-medium text-slate-600 hover:text-[#0F766E] hover:bg-slate-100 px-2 py-1 rounded-lg border border-slate-200 flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <Activity className="w-3.5 h-3.5 text-teal-600" />
                  <span>Kiểm tra nguồn ảnh</span>
                </button>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap items-center gap-2.5 shrink-0 pt-2 md:pt-0">
            <button
              type="button"
              id="view-source-html-btn"
              onClick={() => setIsViewingSource(true)}
              className="h-10 px-3.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Eye className="w-3.5 h-3.5 text-slate-500" />
              <span>Xem source HTML</span>
            </button>

            <button
              type="button"
              id="change-article-btn"
              onClick={() => {
                if (onResetAnalysis) onResetAnalysis();
                setIsViewingSource(true);
              }}
              className="h-10 px-3.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Edit3 className="w-3.5 h-3.5 text-slate-500" />
              <span>Thay bài khác</span>
            </button>

            {onNewArticle && (
              <button
                type="button"
                id="analyzed-card-new-article-btn"
                onClick={onNewArticle}
                disabled={isBusy}
                className={`h-10 px-3.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                  isBusy
                    ? 'opacity-50 cursor-not-allowed bg-slate-100 text-slate-400 border-slate-200'
                    : 'border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300'
                }`}
                title={isBusy ? 'Hệ thống đang xử lý tác vụ...' : 'Xóa dữ liệu để bắt đầu bài viết mới hoàn toàn'}
              >
                <PlusCircle className="w-3.5 h-3.5 text-[#0F766E]" />
                <span>Bài viết mới</span>
              </button>
            )}

            {onContinueToStep2 && (
              <button
                type="button"
                id="continue-to-step-2-btn"
                onClick={onContinueToStep2}
                className="h-10 px-4 rounded-xl bg-[#0F766E] hover:bg-[#115E59] text-white text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
              >
                <span>Kiểm tra ảnh</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </section>
    );
  }

  // Case 2: Input / Edit HTML mode
  return (
    <section className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 sm:p-6 mb-6">
      {/* Title & Description */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 mb-4 border-b border-slate-100">
        <div>
          <h2 className="text-base sm:text-lg font-bold text-slate-900">
            Dán bài viết đã biên tập
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Hệ thống sẽ tìm ảnh bìa và các ảnh minh họa cũ cần xử lý.
          </p>
        </div>

        {analysis && (
          <button
            type="button"
            id="toggle-collapse-source-btn"
            onClick={() => setIsViewingSource(false)}
            className="text-xs text-[#0F766E] hover:underline font-semibold self-start sm:self-auto cursor-pointer"
          >
            ← Thu gọn xem tóm tắt
          </button>
        )}
      </div>

      {/* Large HTML textarea */}
      <div className="relative">
        <textarea
          id="html-source-input"
          value={htmlSource}
          onChange={(e) => setHtmlSource(e.target.value)}
          placeholder={`Dán mã nguồn HTML bài viết vào đây... Ví dụ:
<article class="article-prose">
  <h1>Thời điểm lập hóa đơn điện tử khi bán hàng hóa dịch vụ theo Nghị định 123</h1>
  <p class="lead">Nội dung tóm tắt...</p>
  <img src="old-photo.jpg" alt="Ảnh kế toán">
</article>`}
          rows={10}
          className="w-full font-mono text-xs sm:text-[13px] leading-relaxed p-4 bg-slate-900 text-slate-100 rounded-xl border border-slate-800 focus:outline-hidden focus:ring-2 focus:ring-[#0F766E] placeholder:text-slate-500 resize-y shadow-inner"
          spellCheck={false}
        />
      </div>

      <div className="mt-4 p-4 rounded-xl bg-slate-50 border border-slate-200/80">
        <div className="mb-2">
          <label htmlFor="article-title" className="block text-xs font-bold text-slate-800 uppercase tracking-wider mb-1">
            Tiêu đề bài viết
          </label>
          <p className="text-[11px] text-slate-500 mb-2">Tiêu đề giúp AI hiểu chủ đề chính và đề xuất dòng chữ phù hợp cho ảnh bìa.</p>
          <input
            id="article-title"
            type="text"
            value={articleTitle}
            onChange={(e) => setArticleTitle(e.target.value)}
            placeholder="Ví dụ: Doanh nghiệp lớn lên bằng quản trị, không chỉ bằng doanh thu"
            className="w-full h-9 px-3 text-xs bg-white text-slate-800 rounded-lg border border-slate-200 focus:outline-hidden focus:ring-1 focus:ring-[#0F766E] focus:border-[#0F766E] placeholder:text-slate-400"
          />
        </div>
      </div>

      {/* Optional: Original Article Website Source Information */}
      <div className="mt-4 p-4 rounded-xl bg-slate-50 border border-slate-200/80">
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-[#0F766E]" />
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
              Nguồn ảnh bài viết gốc (Tùy chọn)
            </h3>
          </div>
          <button
            type="button"
            onClick={() => setShowUrlHelp(!showUrlHelp)}
            className="text-[11px] text-slate-400 hover:text-slate-600 flex items-center gap-1 cursor-pointer"
          >
            <HelpCircle className="w-3.5 h-3.5" />
            <span>Cách hoạt động</span>
          </button>
        </div>

        {showUrlHelp && (
          <div className="mb-3 p-3 rounded-lg bg-teal-50/70 border border-teal-100 text-[11px] text-slate-600 leading-relaxed space-y-1">
            <p>
              • <strong>Ưu tiên 1:</strong> Hệ thống ưu tiên lấy ảnh từ bài viết đang xuất bản nếu có URL bài viết gốc.
            </p>
            <p>
              • <strong>Ưu tiên 2:</strong> Nếu không có URL bài viết, hệ thống sẽ tự ghép đường dẫn ảnh tương đối trong HTML với Base URL.
            </p>
            <p>
              • <strong>Ưu tiên 3:</strong> Nếu vẫn không tải được ảnh tự động, bạn luôn có thể dán ảnh từ clipboard hoặc tải file trực tiếp tại từng vị trí ảnh trong Bước 2.
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Field A: URL bài viết gốc */}
          <div>
            <label
              htmlFor="original-article-url-input"
              className="block text-[11px] font-semibold text-slate-700 mb-1"
            >
              URL bài viết gốc:
            </label>
            <div className="relative">
              <input
                id="original-article-url-input"
                type="url"
                value={articleUrl}
                onChange={(e) => handleArticleUrlChange(e.target.value)}
                placeholder="https://mettasingingbowl.com/ktdieutam/example-article.html"
                className="w-full h-9 px-3 text-xs bg-white text-slate-800 rounded-lg border border-slate-200 focus:outline-hidden focus:ring-1 focus:ring-[#0F766E] focus:border-[#0F766E] placeholder:text-slate-400"
              />
            </div>
          </div>

          {/* Field B: Base URL website / thư mục publish */}
          <div>
            <label
              htmlFor="base-url-publish-input"
              className="block text-[11px] font-semibold text-slate-700 mb-1"
            >
              Base URL website / thư mục publish:
            </label>
            <div className="relative">
              <input
                id="base-url-publish-input"
                type="url"
                value={baseUrl}
                onChange={(e) => handleBaseUrlChange(e.target.value)}
                placeholder="https://mettasingingbowl.com/ktdieutam/"
                className="w-full h-9 px-3 text-xs bg-white text-slate-800 rounded-lg border border-slate-200 focus:outline-hidden focus:ring-1 focus:ring-[#0F766E] focus:border-[#0F766E] placeholder:text-slate-400"
              />
            </div>
          </div>
        </div>

        <p className="text-[11px] text-slate-500 mt-2">
          Hệ thống sẽ ưu tiên lấy ảnh từ bài viết đang xuất bản. Nếu không có URL bài viết, hệ thống sẽ thử ghép đường dẫn ảnh trong HTML với Base URL. Nếu vẫn không tải được ảnh, bạn có thể dán hoặc tải ảnh lên tại từng vị trí.
        </p>
      </div>

      {/* Bottom Bar: Action & Sample selection */}
      <div className="mt-4 flex flex-col sm:flex-row items-center justify-between gap-3">
        {/* Left: Sample menu dropdown + clear */}
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative" ref={sampleMenuRef}>
            <button
              type="button"
              id="sample-articles-menu-btn"
              onClick={() => setShowSampleMenu(!showSampleMenu)}
              className="h-10 px-3.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 bg-slate-50/80 hover:bg-slate-100 transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <BookOpen className="w-3.5 h-3.5 text-slate-500" />
              <span>Dùng bài mẫu</span>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            </button>

            {/* Dropdown Menu */}
            {showSampleMenu && (
              <div
                id="sample-articles-dropdown"
                className="absolute left-0 mt-1.5 w-72 sm:w-80 bg-white rounded-xl shadow-lg border border-slate-200 py-1.5 z-20 animate-in fade-in zoom-in-95 duration-100"
              >
                <div className="px-3 py-1 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  Chọn bài viết mẫu kinh tế:
                </div>
                {SAMPLE_ARTICLES.map((sample) => (
                  <button
                    key={sample.id}
                    type="button"
                    onClick={() => {
                      onSelectSample(sample);
                      setShowSampleMenu(false);
                      setIsViewingSource(false);
                    }}
                    className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50 transition-colors flex flex-col gap-0.5 cursor-pointer border-b border-slate-100 last:border-b-0"
                  >
                    <span className="font-semibold text-slate-800 line-clamp-1">
                      {sample.name}
                    </span>
                    <span className="text-[11px] text-slate-500 line-clamp-2">
                      {sample.description}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {htmlSource && (
            <button
              type="button"
              id="clear-html-btn"
              onClick={onClear}
              disabled={isAnalyzing}
              className="h-10 px-3 rounded-xl text-xs text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition-colors flex items-center gap-1 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Xóa</span>
            </button>
          )}

          {analysis && onOpenDiscoveryModal && (
            <button
              type="button"
              onClick={onOpenDiscoveryModal}
              className="h-10 px-3 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Activity className="w-3.5 h-3.5 text-teal-600" />
              <span>Kiểm tra nguồn</span>
            </button>
          )}
        </div>

        {/* Right: Primary CTA */}
        <button
          type="button"
          id="analyze-html-btn"
          onClick={() => {
            onAnalyze();
            setIsViewingSource(false);
          }}
          disabled={isAnalyzing || !htmlSource.trim()}
          className={`w-full sm:w-auto h-11 px-6 rounded-xl font-semibold text-xs sm:text-sm text-white shadow-xs flex items-center justify-center gap-2 transition-all cursor-pointer ${
            isAnalyzing || !htmlSource.trim()
              ? 'bg-slate-300 text-slate-500 cursor-not-allowed shadow-none'
              : 'bg-[#0F766E] hover:bg-[#115E59] active:scale-[0.99]'
          }`}
        >
          {isAnalyzing ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span>Đang phân tích bài viết & tải ảnh nguồn...</span>
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              <span>Phân tích bài viết</span>
            </>
          )}
        </button>
      </div>
    </section>
  );
};
