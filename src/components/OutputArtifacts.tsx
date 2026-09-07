import React, { useState } from 'react';
import {
  Archive,
  Download,
  Copy,
  Check,
  CheckCircle2,
  FileCode,
  FileJson,
  Eye,
  ChevronDown,
  ChevronUp,
  Folder,
  Layers,
  FileImage,
  RefreshCw,
  AlertTriangle,
  Sparkles,
  FileText,
  ShieldCheck,
} from 'lucide-react';
import { ImageManifest, ImageSlotPlan } from '../types';
import { downloadSingleFile, downloadZipPackage, validateHandoffPackage } from '../utils/zipExporter';
import { normalizeBasePath } from '../utils/htmlProcessor';
import {
  buildEditorialImagePack,
  validateEditorialImagePackExport,
} from '../utils/editorialImagePack';

interface OutputArtifactsProps {
  updatedHtml: string;
  manifest: ImageManifest;
  articleSlug: string;
  plan: ImageSlotPlan[];
  outputBasePath: string;
}

export const OutputArtifacts: React.FC<OutputArtifactsProps> = ({
  updatedHtml,
  manifest,
  articleSlug,
  plan,
  outputBasePath,
}) => {
  const [showTechnicalOptions, setShowTechnicalOptions] = useState(false);
  const [activeTab, setActiveTab] = useState<'html' | 'manifest' | 'files' | 'preview'>('html');
  const [copiedType, setCopiedType] = useState<'html' | 'json' | null>(null);
  const [isZipping, setIsZipping] = useState(false);
  const [zipError, setZipError] = useState<string | null>(null);
  const [isPreparingEditorial, setIsPreparingEditorial] = useState(false);
  const [editorialError, setEditorialError] = useState<string | null>(null);
  const [editorialSuccess, setEditorialSuccess] = useState<string | null>(null);
  const [editorialTransport, setEditorialTransport] = useState<'gcs' | 'memory' | null>(null);
  const [editorialFallbackJson, setEditorialFallbackJson] = useState<string | null>(null);

  const cleanPath = normalizeBasePath(outputBasePath);

  const validation = validateHandoffPackage(plan);
  const editorialValidation = validateEditorialImagePackExport(
    { title: manifest.article_title, slug: articleSlug || manifest.article_slug },
    plan
  );

  const completedSlots = plan.filter(
    (s) => s.status === 'completed' && Boolean(s.image_data_url)
  );
  const aiGeneratedSlots = completedSlots.filter(
    (s) => s.processing_strategy === 'GENERATE_AI'
  );
  const rebuiltSourceSlots = completedSlots.filter(
    (s) => s.processing_strategy === 'REBUILD_FROM_SOURCE'
  );

  const copyToClipboard = (text: string, type: 'html' | 'json') => {
    navigator.clipboard.writeText(text);
    setCopiedType(type);
    setTimeout(() => setCopiedType(null), 2000);
  };

  const handleDownloadZip = async () => {
    setZipError(null);
    if (!validation.canExport) {
      setZipError(validation.errors.join(' '));
      return;
    }

    try {
      setIsZipping(true);
      await downloadZipPackage(articleSlug, updatedHtml, manifest, plan, outputBasePath);
    } catch (err: any) {
      console.error('Error generating zip:', err);
      setZipError(err.message || 'Không thể tạo file ZIP. Vui lòng thử lại hoặc tải riêng lẻ.');
    } finally {
      setIsZipping(false);
    }
  };

  const handleCopyForEditorial = async () => {
    setEditorialError(null);
    setEditorialSuccess(null);
    setEditorialTransport(null);
    setEditorialFallbackJson(null);

    if (!validation.canExport || !editorialValidation.canExport) {
      setEditorialError([...validation.errors, ...editorialValidation.errors].join(' '));
      return;
    }

    try {
      setIsPreparingEditorial(true);
      const assets = plan
        .filter((slot) => slot.selected && slot.status === 'completed' && slot.image_data_url)
        .map((slot) => ({
          slot_id: slot.slot_id,
          filename: slot.final_filename || slot.suggested_filename || `${slot.slot_id}.webp`,
          image_data_url: slot.image_data_url,
        }));

      const response = await fetch('/api/editorial-export-assets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assets }),
      });
      const result = await response.json();
      if (!response.ok || !result.success || !Array.isArray(result.assets)) {
        throw new Error(result.error || 'Không thể tạo URL ảnh tạm cho Editorial.');
      }

      const imageUrlsBySlotId: Record<string, string> = {};
      for (const asset of result.assets) {
        if (typeof asset.slot_id !== 'string') {
          throw new Error('Máy chủ trả về URL ảnh Editorial không hợp lệ.');
        }
        const url =
          typeof asset.url === 'string'
            ? asset.url
            : typeof asset.path === 'string'
            ? new URL(asset.path, window.location.origin).href
            : '';
        if (!/^https?:\/\//i.test(url)) {
          throw new Error('Máy chủ trả về URL ảnh Editorial không hợp lệ.');
        }
        imageUrlsBySlotId[asset.slot_id] = url;
      }

      const pack = buildEditorialImagePack(
        { title: manifest.article_title, slug: articleSlug || manifest.article_slug },
        plan,
        imageUrlsBySlotId
      );
      const packJson = JSON.stringify(pack, null, 2);

      try {
        await navigator.clipboard.writeText(packJson);
        setEditorialTransport(result.transport === 'gcs' ? 'gcs' : 'memory');
        setEditorialSuccess('Đã sao chép gói ảnh cho Editorial.');
      } catch {
        setEditorialTransport(result.transport === 'gcs' ? 'gcs' : 'memory');
        setEditorialFallbackJson(packJson);
        setEditorialError(
          'Trình duyệt không cho phép sao chép tự động. Hãy sao chép JSON bên dưới rồi dán vào Editorial.'
        );
      }
    } catch (err: any) {
      setEditorialError(err.message || 'Không thể chuẩn bị gói ảnh cho Editorial.');
    } finally {
      setIsPreparingEditorial(false);
    }
  };

  const handleRetryEditorialCopy = async () => {
    if (!editorialFallbackJson) return;
    try {
      await navigator.clipboard.writeText(editorialFallbackJson);
      setEditorialSuccess('Đã sao chép gói ảnh cho Editorial.');
      setEditorialError(null);
      setEditorialFallbackJson(null);
    } catch {
      setEditorialError('Vẫn không thể sao chép tự động. Hãy chọn toàn bộ JSON và sao chép thủ công.');
    }
  };

  const manifestJsonString = JSON.stringify(manifest, null, 2);

  return (
    <section className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 sm:p-6 mb-8">
      {/* 1. COMPLETION CARD (Clean, Calm, Dominant CTA) */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6 border-b border-slate-100">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            {validation.canExport ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                Đủ điều kiện xuất bản
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                Cần hoàn tất {plan.length - completedSlots.length} ảnh
              </span>
            )}
            <span className="text-xs text-slate-400">
              Quy chuẩn 100% Asset mới &bull; Thương hiệu {manifest.brand_config?.brand_name || 'Kế Toán Diệu Tâm'}
            </span>
          </div>

          <h2 className="text-lg sm:text-xl font-bold text-slate-900">
            {manifest.article_title || 'Gói xuất bản bài viết'}
          </h2>

          <div className="flex flex-wrap items-center gap-2.5 pt-1 text-xs">
            <span className="font-semibold text-teal-800 bg-teal-50 px-3 py-1 rounded-lg border border-teal-100 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-teal-600" />
              {aiGeneratedSlots.length} ảnh AI mới
            </span>

            {rebuiltSourceSlots.length > 0 && (
              <span className="font-semibold text-amber-900 bg-amber-50 px-3 py-1 rounded-lg border border-amber-200 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-amber-700" />
                {rebuiltSourceSlots.length} ảnh tái tạo bảo toàn số liệu
              </span>
            )}

            <span className="font-semibold text-slate-700 bg-slate-100 px-3 py-1 rounded-lg flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-teal-600" />
              Thương hiệu: {manifest.brand_profile?.brand_name || manifest.brand_config?.brand_name || 'Kế Toán Diệu Tâm'} ({manifest.brand_profile?.watermark_mode === 'none' ? 'Tắt watermark' : manifest.brand_profile?.watermark_mode === 'logo_only' ? 'Chỉ logo' : manifest.brand_profile?.watermark_mode === 'text_only' ? 'Chỉ tên' : 'Logo + Tên'})
            </span>

            <span className="font-semibold text-emerald-700 bg-emerald-50 px-3 py-1 rounded-lg border border-emerald-100">
              HTML &amp; Schema.org đồng bộ
            </span>
          </div>
        </div>

        {/* Editorial copy is the primary transport; existing ZIP remains available as a secondary handoff. */}
        <div className="shrink-0 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <button
            type="button"
            onClick={handleCopyForEditorial}
            disabled={isPreparingEditorial || !validation.canExport || !editorialValidation.canExport}
            className={`h-12 px-7 rounded-xl font-bold text-sm shadow-md flex items-center justify-center gap-2.5 transition-all cursor-pointer ${
              !validation.canExport || !editorialValidation.canExport
                ? 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
                : 'bg-[#0F766E] hover:bg-[#115E59] active:scale-[0.99] text-white shadow-teal-900/10'
            }`}
          >
            {isPreparingEditorial ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Đang chuẩn bị URL ảnh...</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                <span>COPY CHO EDITORIAL</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleDownloadZip}
            disabled={isZipping || !validation.canExport}
            className={`h-12 px-7 rounded-xl font-bold text-sm shadow-md flex items-center justify-center gap-2.5 transition-all cursor-pointer ${
              !validation.canExport
                ? 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
                : 'bg-[#0F766E] hover:bg-[#115E59] active:scale-[0.99] text-white shadow-teal-900/10'
            }`}
          >
            {isZipping ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Đang nén file ZIP...</span>
              </>
            ) : (
              <>
                <Archive className="w-4 h-4" />
                <span>Tải gói bàn giao (.ZIP)</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Validation warning message if export blocked */}
      {!validation.canExport && (
        <div className="mt-4 p-3.5 rounded-xl bg-amber-50 border border-amber-300 text-xs text-amber-950 flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
          <div className="leading-relaxed space-y-1">
            <strong className="font-bold text-amber-950 block">
              Chưa đủ điều kiện đóng gói ZIP:
            </strong>
            <ul className="list-disc list-inside space-y-0.5 text-amber-900">
              {validation.errors.map((err, i) => (
                <li key={i}>{err}</li>
              ))}
            </ul>
            <p className="text-[11px] text-amber-800 italic pt-1">
              Mọi ảnh bài viết cần có asset WebP mới hoàn tất trước khi bàn giao sang tòa soạn hoặc CMS.
            </p>
          </div>
        </div>
      )}

      {validation.canExport && !editorialValidation.canExport && (
        <div className="mt-4 p-3.5 rounded-xl bg-amber-50 border border-amber-300 text-xs text-amber-950 flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
          <div className="leading-relaxed space-y-1">
            <strong className="font-bold text-amber-950 block">
              Chưa đủ điều kiện sao chép cho Editorial:
            </strong>
            <ul className="list-disc list-inside space-y-0.5 text-amber-900">
              {editorialValidation.errors.map((err, i) => (
                <li key={i}>{err}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {zipError && (
        <div className="mt-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800">
          {zipError}
        </div>
      )}

      <p className="mt-3 text-xs text-slate-500">
        Sao chép toàn bộ ảnh và metadata để dán vào Editorial.
      </p>

      {editorialSuccess && (
        <div className="mt-4 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-start gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          <div>
            <div>{editorialSuccess}</div>
            {editorialTransport === 'memory' && (
              <div className="mt-1 text-[11px] text-amber-800">
                Đang dùng memory transport cho môi trường development/preview; URL sẽ mất khi server restart.
              </div>
            )}
          </div>
        </div>
      )}

      {editorialError && (
        <div className="mt-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800">
          {editorialError}
        </div>
      )}

      {editorialFallbackJson && (
        <div className="mt-4 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-slate-700">
              Gói JSON để sao chép thủ công
            </span>
            <button
              type="button"
              onClick={handleRetryEditorialCopy}
              className="px-2.5 py-1 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-700 flex items-center gap-1 cursor-pointer"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>Sao chép lại</span>
            </button>
          </div>
          <textarea
            readOnly
            value={editorialFallbackJson}
            onFocus={(event) => event.currentTarget.select()}
            className="w-full min-h-44 p-3 font-mono text-[11px] text-slate-100 bg-slate-950 rounded-xl border border-slate-800 focus:outline-hidden focus:ring-2 focus:ring-teal-600"
            aria-label="Gói JSON Editorial để sao chép thủ công"
          />
        </div>
      )}

      {/* 2. COLLAPSED SECTION: Tùy chọn kỹ thuật */}
      <div className="pt-4">
        <button
          type="button"
          onClick={() => setShowTechnicalOptions(!showTechnicalOptions)}
          className="w-full py-2 px-3 rounded-xl hover:bg-slate-50 text-xs font-semibold text-slate-600 flex items-center justify-between transition-colors cursor-pointer"
        >
          <span className="flex items-center gap-2">
            <FileCode className="w-4 h-4 text-slate-400" />
            <span>Tùy chọn kỹ thuật (Source HTML, Manifest JSON, Danh sách file)</span>
          </span>
          <span className="flex items-center gap-1 text-slate-400">
            <span>{showTechnicalOptions ? 'Thu gọn' : 'Mở rộng'}</span>
            {showTechnicalOptions ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </span>
        </button>

        {showTechnicalOptions && (
          <div className="mt-4 pt-4 border-t border-slate-100 space-y-4 animate-in fade-in duration-100">
            {/* Tab navigation */}
            <div className="flex items-center gap-2 border-b border-slate-200 pb-2 overflow-x-auto text-xs">
              <button
                type="button"
                onClick={() => setActiveTab('html')}
                className={`px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                  activeTab === 'html'
                    ? 'bg-teal-50 text-[#0F766E]'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <FileCode className="w-3.5 h-3.5" />
                <span>Mã nguồn HTML</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('preview')}
                className={`px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                  activeTab === 'preview'
                    ? 'bg-teal-50 text-[#0F766E]'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <Eye className="w-3.5 h-3.5" />
                <span>Xem trước bài viết</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('manifest')}
                className={`px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                  activeTab === 'manifest'
                    ? 'bg-teal-50 text-[#0F766E]'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <FileJson className="w-3.5 h-3.5" />
                <span>JSON Manifest</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('files')}
                className={`px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                  activeTab === 'files'
                    ? 'bg-teal-50 text-[#0F766E]'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <FileImage className="w-3.5 h-3.5" />
                <span>Danh sách file ảnh ({completedSlots.length})</span>
              </button>
            </div>

            {/* Tab 1: HTML View */}
            {activeTab === 'html' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500">
                    Mã HTML đã được cập nhật đường dẫn ảnh mới, semantic &lt;figure&gt;/&lt;figcaption&gt; và Schema.org JSON-LD.
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => copyToClipboard(updatedHtml, 'html')}
                      className="px-2.5 py-1 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 font-medium flex items-center gap-1 cursor-pointer"
                    >
                      {copiedType === 'html' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-slate-400" />}
                      <span>{copiedType === 'html' ? 'Đã chép' : 'Sao chép HTML'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => downloadSingleFile(`${articleSlug || 'article'}.html`, updatedHtml)}
                      className="px-2.5 py-1 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 font-medium flex items-center gap-1 cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5 text-slate-400" />
                      <span>Tải .html</span>
                    </button>
                  </div>
                </div>

                <div className="relative rounded-xl overflow-hidden border border-slate-800 bg-slate-950">
                  <pre className="p-4 font-mono text-xs text-slate-200 overflow-x-auto max-h-80 leading-relaxed">
                    {updatedHtml}
                  </pre>
                </div>
              </div>
            )}

            {/* Tab 2: Preview */}
            {activeTab === 'preview' && (
              <div className="space-y-3">
                <p className="text-xs text-slate-500">
                  Khung xem trước hiển thị trực tiếp nội dung bài viết với các ảnh minh họa và chú thích đã cập nhật.
                </p>
                <div className="rounded-xl border border-slate-200 p-6 bg-slate-50 max-h-96 overflow-y-auto prose prose-slate max-w-none text-xs sm:text-sm">
                  <div dangerouslySetInnerHTML={{ __html: updatedHtml }} />
                </div>
              </div>
            )}

            {/* Tab 3: JSON Manifest */}
            {activeTab === 'manifest' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500">
                    Bản kê khai kỹ thuật JSON lưu trữ toàn bộ trạng thái ánh xạ slot, phân loại, siêu dữ liệu và cấu hình nhận diện thương hiệu.
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => copyToClipboard(manifestJsonString, 'json')}
                      className="px-2.5 py-1 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 font-medium flex items-center gap-1 cursor-pointer"
                    >
                      {copiedType === 'json' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-slate-400" />}
                      <span>{copiedType === 'json' ? 'Đã chép' : 'Sao chép JSON'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => downloadSingleFile('manifest.json', manifestJsonString)}
                      className="px-2.5 py-1 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 font-medium flex items-center gap-1 cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5 text-slate-400" />
                      <span>Tải manifest.json</span>
                    </button>
                  </div>
                </div>

                <div className="relative rounded-xl overflow-hidden border border-slate-800 bg-slate-950">
                  <pre className="p-4 font-mono text-xs text-slate-200 overflow-x-auto max-h-80 leading-relaxed">
                    {manifestJsonString}
                  </pre>
                </div>
              </div>
            )}

            {/* Tab 4: File List & Single Download */}
            {activeTab === 'files' && (
              <div className="space-y-3 text-xs">
                <p className="text-slate-500">
                  Danh sách {completedSlots.length} file ảnh WebP mới với đầy đủ siêu dữ liệu biên tập. Bạn có thể tải từng file:
                </p>
                <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden bg-white">
                  {completedSlots.map((slot) => {
                    const filename = slot.final_filename || slot.suggested_filename || `${slot.slot_id}.webp`;
                    const isAi = slot.processing_strategy === 'GENERATE_AI';
                    return (
                      <div key={slot.slot_id} className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50">
                        <div className="flex items-start sm:items-center gap-3 min-w-0">
                          {slot.image_data_url && (
                            <img
                              src={slot.image_data_url}
                              alt=""
                              className="w-16 h-11 object-cover rounded-lg bg-slate-100 shrink-0 border border-slate-200"
                            />
                          )}
                          <div className="min-w-0 space-y-0.5">
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-bold text-slate-900 truncate">
                                {filename}
                              </span>
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                isAi ? 'bg-teal-50 text-teal-700 border border-teal-200' : 'bg-amber-50 text-amber-800 border border-amber-200'
                              }`}>
                                {isAi ? 'AI' : 'Bảo toàn số liệu'}
                              </span>
                              {slot.width && slot.height && (
                                <span className="text-[11px] text-slate-400 font-mono">
                                  {slot.width}&times;{slot.height}
                                </span>
                              )}
                            </div>
                            <span className="text-[11px] text-slate-400 block truncate">
                              {cleanPath}{filename}
                            </span>
                            {slot.alt && (
                              <p className="text-[11px] text-slate-600 italic truncate max-w-lg">
                                Alt: &ldquo;{slot.alt}&rdquo;
                              </p>
                            )}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            if (slot.image_data_url) {
                              downloadSingleFile(filename, slot.image_data_url);
                            }
                          }}
                          className="self-start sm:self-auto px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-100 font-semibold flex items-center gap-1.5 cursor-pointer shrink-0"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>Tải file WebP</span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
};
