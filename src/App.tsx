import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { StepIndicator, WorkflowStep } from './components/StepIndicator';
import { HtmlInputSection } from './components/HtmlInputSection';
import { ImagePlanTable } from './components/ImagePlanTable';
import { ResultGallery } from './components/ResultGallery';
import { OutputArtifacts } from './components/OutputArtifacts';
import { ImageModal } from './components/ImageModal';
import { SystemConfigDrawer } from './components/SystemConfigDrawer';
import { SAMPLE_ARTICLES, SampleArticle } from './utils/sampleArticles';
import {
  ArticleAnalysis,
  BrandProfile,
  ImageManifest,
  ImageSlotPlan,
  ManifestSlotItem,
  VertexConfigStatus,
} from './types';
import {
  updateArticleHtml,
  normalizeBasePath,
  analyzeArticleLocally,
  cleanEditorialAltText,
  generateEditorialTitle,
  generateEditorialCaption,
} from './utils/htmlProcessor';
import { generateClientMockSvg } from './utils/mockImageGenerator';
import { AlertCircle, ArrowLeft, ArrowRight, Sparkles } from 'lucide-react';
import { SourceDiscoveryModal } from './components/SourceDiscoveryModal';

export default function App() {
  // Prepopulate with Sample 1 so editor immediately has content to inspect/test
  const [htmlSource, setHtmlSource] = useState<string>(SAMPLE_ARTICLES[0].html);
  const [articleUrl, setArticleUrl] = useState<string>(SAMPLE_ARTICLES[0].url || '');
  const [baseUrl, setBaseUrl] = useState<string>('');
  const [showDiscoveryModal, setShowDiscoveryModal] = useState<boolean>(false);
  const [analysis, setAnalysis] = useState<ArticleAnalysis | null>(null);
  const [plan, setPlan] = useState<ImageSlotPlan[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [useMockMode, setUseMockMode] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [previewModal, setPreviewModal] = useState<{ imageUrl: string; title: string } | null>(
    null
  );

  // Brand Profile & Watermark Config
  const [brandProfile, setBrandProfile] = useState<BrandProfile>({
    brand_name: 'Kế Toán Diệu Tâm',
    logo_url: '',
    show_logo: true,
    show_brand_name: true,
    position: 'bottom-right',
    logo_size: 'medium',
    opacity: 0.85,
    edge_padding: 24,
    apply_to_featured: true,
    apply_to_ai_inline: true,
    apply_to_source_docs: true,
  });

  // 3-Step Workflow State
  const [currentStep, setCurrentStep] = useState<WorkflowStep>(1);

  // Vertex AI System Config Drawer
  const [vertexStatus, setVertexStatus] = useState<VertexConfigStatus | null>(null);
  const [showConfigDrawer, setShowConfigDrawer] = useState<boolean>(false);

  // Configurable Output Base Path
  const currentYearMonth = `${new Date().getFullYear()}/${String(new Date().getMonth() + 1).padStart(2, '0')}`;
  const [outputBasePath, setOutputBasePath] = useState<string>(`uploads/articles/${currentYearMonth}/`);

  // Fetch Vertex AI status
  const fetchVertexStatus = async () => {
    try {
      const res = await fetch('/api/vertex-status');
      if (res.ok) {
        const data = await res.json();
        setVertexStatus(data);
      }
    } catch (err) {
      console.warn('Lỗi khi kiểm tra trạng thái Vertex AI:', err);
    }
  };

  useEffect(() => {
    fetchVertexStatus();
  }, []);

  const handleUpdateVertexConfig = async (newConfig: {
    projectId?: string;
    location?: string;
    model?: string;
  }) => {
    try {
      const res = await fetch('/api/vertex-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newConfig),
      });
      if (res.ok) {
        const data = await res.json();
        setVertexStatus(data.config);
      }
    } catch (err) {
      console.error('Lỗi khi cập nhật cấu hình Vertex AI:', err);
    }
  };

  // Handler to load sample article
  const handleSelectSample = (sample: SampleArticle) => {
    setHtmlSource(sample.html);
    setArticleUrl(sample.url || '');
    setBaseUrl('');
    setAnalysis(null);
    setPlan([]);
    setErrorMessage(null);
    setCurrentStep(1);
  };

  const handleOutputBasePathChange = (newPath: string) => {
    setOutputBasePath(newPath);
    const clean = normalizeBasePath(newPath);
    setPlan((prev) =>
      prev.map((slot) => ({
        ...slot,
        final_src: `${clean}${slot.final_filename || slot.suggested_filename}`,
      }))
    );
  };

  // 1. Analyze Article HTML with resilient dual-layer parsing
  const handleAnalyze = async () => {
    if (!htmlSource.trim()) return;

    try {
      setIsAnalyzing(true);
      setErrorMessage(null);

      let data: ArticleAnalysis | null = null;

      // Layer 1: Attempt server analyze endpoint with Gemini enhancement and 5-stage discovery
      try {
        const response = await fetch('/api/analyze-article', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ htmlSource, articleUrl, baseUrl }),
        });

        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          const json = await response.json();
          if (response.ok && json.plan) {
            data = json;
          } else if (json.error) {
            console.warn('Server analyzer returned error, using local fallback:', json.error);
          }
        } else {
          console.warn('Server returned non-JSON response, switching to local parser.');
        }
      } catch (networkErr) {
        console.warn('Network call to /api/analyze-article failed, switching to local parser:', networkErr);
      }

      // Layer 2: Fast client-side fallback - guaranteed to never throw syntax errors
      if (!data) {
        data = analyzeArticleLocally(htmlSource);
      }

      const cleanPath = normalizeBasePath(outputBasePath);
      const initializedPlan: ImageSlotPlan[] = (data.plan || []).map((slot: ImageSlotPlan) => {
        const cleanedAlt = cleanEditorialAltText(
          slot.alt || slot.suggested_alt || '',
          slot.nearby_heading || slot.context_heading || slot.suggested_concept
        );
        const contextHint = slot.nearby_heading || slot.context_heading || data?.title || '';
        const title = slot.title || generateEditorialTitle(cleanedAlt, contextHint);
        const caption = slot.caption || generateEditorialCaption(cleanedAlt, contextHint);
        const credit = slot.credit || brandProfile.brand_name;
        const isSensitive = slot.is_sensitive_source || slot.classification === 'KEEP_ORIGINAL';
        const strategy = slot.processing_strategy || (isSensitive ? 'REBUILD_FROM_SOURCE' : 'GENERATE_AI');

        return {
          ...slot,
          selected: true,
          processing_strategy: strategy,
          classification: strategy === 'GENERATE_AI' ? 'REPLACE_AI' : 'KEEP_ORIGINAL',
          is_sensitive_source: isSensitive,
          final_filename: slot.final_filename || slot.suggested_filename,
          final_src: slot.final_src || `${cleanPath}${slot.suggested_filename}`,
          alt: cleanedAlt,
          suggested_alt: cleanedAlt,
          alt_text: cleanedAlt,
          title,
          caption,
          credit,
          show_caption: true,
          show_credit: true,
          concept: slot.concept || slot.suggested_concept,
          generation_prompt: slot.generation_prompt || '',
        };
      });

      setAnalysis(data);
      setPlan(initializedPlan);

      // Auto advance to Step 2 upon successful analysis
      setCurrentStep(2);
    } catch (err: any) {
      console.error('Analyze error:', err);
      try {
        const localData = analyzeArticleLocally(htmlSource);
        const cleanPath = normalizeBasePath(outputBasePath);
        const initializedPlan: ImageSlotPlan[] = (localData.plan || []).map((slot: ImageSlotPlan) => {
          const cleanedAlt = cleanEditorialAltText(
            slot.alt || slot.suggested_alt || '',
            slot.nearby_heading || slot.context_heading || slot.suggested_concept
          );
          const contextHint = slot.nearby_heading || slot.context_heading || localData?.title || '';
          const title = slot.title || generateEditorialTitle(cleanedAlt, contextHint);
          const caption = slot.caption || generateEditorialCaption(cleanedAlt, contextHint);
          const credit = slot.credit || brandProfile.brand_name;
          const isSensitive = slot.is_sensitive_source || slot.classification === 'KEEP_ORIGINAL';
          const strategy = slot.processing_strategy || (isSensitive ? 'REBUILD_FROM_SOURCE' : 'GENERATE_AI');

          return {
            ...slot,
            selected: true,
            processing_strategy: strategy,
            classification: strategy === 'GENERATE_AI' ? 'REPLACE_AI' : 'KEEP_ORIGINAL',
            is_sensitive_source: isSensitive,
            final_filename: slot.final_filename || slot.suggested_filename,
            final_src: slot.final_src || `${cleanPath}${slot.suggested_filename}`,
            alt: cleanedAlt,
            suggested_alt: cleanedAlt,
            alt_text: cleanedAlt,
            title,
            caption,
            credit,
            show_caption: true,
            show_credit: true,
            concept: slot.concept || slot.suggested_concept,
          };
        });
        setAnalysis(localData);
        setPlan(initializedPlan);
        setCurrentStep(2);
      } catch (emergencyErr: any) {
        setErrorMessage('Không thể phân tích mã nguồn HTML. Vui lòng kiểm tra lại cấu trúc bài viết.');
      }
    } finally {
      setIsAnalyzing(false);
    }
  };

  // 2. Update a slot in the plan
  const handleUpdateSlot = (index: number, updatedFields: Partial<ImageSlotPlan>) => {
    setPlan((prev) => {
      const next = [...prev];
      const cleanPath = normalizeBasePath(outputBasePath);
      const updated = { ...next[index], ...updatedFields };

      // Keep final_filename and final_src synchronized
      if (updatedFields.suggested_filename && !updatedFields.final_filename) {
        updated.final_filename = updatedFields.suggested_filename;
        updated.final_src = `${cleanPath}${updatedFields.suggested_filename}`;
      } else if (updatedFields.final_filename) {
        updated.final_src = `${cleanPath}${updatedFields.final_filename}`;
      }

      if (updatedFields.suggested_alt && !updatedFields.alt) {
        updated.alt = updatedFields.suggested_alt;
      }

      if (updatedFields.suggested_concept && !updatedFields.concept) {
        updated.concept = updatedFields.suggested_concept;
      }

      next[index] = updated;
      return next;
    });
  };

  // 3. Toggle select all slots
  const handleToggleAll = (selected: boolean) => {
    setPlan((prev) => prev.map((slot) => ({ ...slot, selected })));
  };

  // 4. Batch Generate All Selected Images using Vertex AI and Deterministic Rebuild
  const handleGenerateAll = async () => {
    // Check if any slot is still in NEEDS_DECISION state
    const unresolved = plan.filter(
      (s) => s.selected && s.processing_strategy === 'NEEDS_DECISION'
    );
    if (unresolved.length > 0) {
      setErrorMessage(
        `Còn ${unresolved.length} vị trí ảnh cần chọn chiến lược xử lý (Tạo hình mới bằng AI hoặc Tạo bản mới từ ảnh gốc) trước khi tiếp tục.`
      );
      return;
    }

    const selectedSlots = plan.filter((s) => s.selected);
    if (selectedSlots.length === 0) {
      setErrorMessage('Vui lòng chọn ít nhất một vị trí ảnh để xử lý.');
      return;
    }

    const requiresAi = selectedSlots.some(
      (s) => s.processing_strategy === 'GENERATE_AI'
    );

    // Check Vertex AI configuration and credentials readiness if any slot needs AI
    if (requiresAi && !useMockMode && !vertexStatus?.is_ready) {
      const missingReason = !vertexStatus?.project_id_configured
        ? 'Chưa cấu hình Project ID Google Cloud. Vui lòng nhấn vào trạng thái AI ở góc phải để nhập Project ID.'
        : 'Chưa phát hiện thông tin xác thực Google Cloud (ADC / Service Account).';
      setErrorMessage(
        `Chưa thể tạo ảnh AI: cấu hình Vertex AI hoặc thông tin xác thực chưa sẵn sàng. ${missingReason}`
      );
      setShowConfigDrawer(true);
      return;
    }

    setIsGenerating(true);
    setErrorMessage(null);

    // Advance to Step 3 so editor immediately views generation and handover
    setCurrentStep(3);

    const cleanPath = normalizeBasePath(outputBasePath);

    // Process sequentially so completed slots immediately render and errors are localized
    for (let i = 0; i < plan.length; i++) {
      const currentSlot = plan[i];

      if (!currentSlot.selected) {
        continue;
      }

      // Mark slot as generating
      setPlan((prev) => {
        const next = [...prev];
        next[i] = { ...next[i], status: 'generating', error_message: undefined };
        return next;
      });

      // Strategy A: REBUILD_FROM_SOURCE (preserve numbers, forms, signatures, etc.)
      if (currentSlot.processing_strategy === 'REBUILD_FROM_SOURCE') {
        try {
          const response = await fetch('/api/rebuild-source-image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              slot: currentSlot,
              brandConfig: brandProfile,
            }),
          });

          const contentType = response.headers.get('content-type') || '';
          if (contentType.includes('application/json')) {
            const resData = await response.json();
            if (response.ok && resData.success && resData.imageDataUrl) {
              setPlan((prev) => {
                const next = [...prev];
                const fname = next[i].final_filename || next[i].suggested_filename;
                next[i] = {
                  ...next[i],
                  status: 'completed',
                  image_data_url: resData.imageDataUrl,
                  prompt_summary: 'Bản tái tạo tối ưu từ tài liệu gốc, bảo toàn số liệu & đóng dấu nhận diện ngoài lề',
                  final_filename: fname,
                  final_src: `${cleanPath}${fname}`,
                  width: resData.width || 800,
                  height: resData.height || 600,
                  mime_type: 'image/webp',
                  brand_applied: Boolean(resData.brand_applied),
                  brand_profile: brandProfile.brand_name,
                  generation_method: 'deterministic_rebuild',
                  alt: next[i].alt || next[i].suggested_alt,
                  concept: next[i].concept || next[i].suggested_concept,
                  error_message: undefined,
                };
                return next;
              });
            } else {
              throw new Error(resData.error || resData.details || 'Lỗi khi tái tạo ảnh tài liệu gốc.');
            }
          } else {
            const rawText = await response.text();
            throw new Error(`Máy chủ phản hồi không đúng (${response.status}): ${rawText.slice(0, 100)}`);
          }
        } catch (err: any) {
          setPlan((prev) => {
            const next = [...prev];
            next[i] = {
              ...next[i],
              status: 'failed',
              error_message: err.message || 'Không thể tái tạo ảnh tài liệu gốc.',
            };
            return next;
          });
        }
        continue;
      }

      // Strategy B: GENERATE_AI (photorealistic editorial photography via Vertex AI)
      if (currentSlot.processing_strategy === 'GENERATE_AI') {
        try {
          let imageDataUrl: string | null = null;
          let promptSummary = currentSlot.suggested_concept;
          let brandApplied = true;

          if (useMockMode) {
            imageDataUrl = generateClientMockSvg(currentSlot, analysis?.title);
            promptSummary = `Ảnh minh họa mẫu (Demo): ${currentSlot.suggested_concept}`;
          } else {
            const response = await fetch('/api/generate-image', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                slot: currentSlot,
                articleTitle: analysis?.title || 'Bài viết kinh tế thuế',
                brandConfig: brandProfile,
              }),
            });

            const contentType = response.headers.get('content-type') || '';
            if (contentType.includes('application/json')) {
              const resData = await response.json();
              if (response.ok && resData.success && resData.imageDataUrl) {
                imageDataUrl = resData.imageDataUrl;
                promptSummary = resData.promptSummary || currentSlot.suggested_concept;
                brandApplied = resData.brand_applied ?? true;
              } else {
                const errMsg = resData.error || resData.details || 'Không thể tạo ảnh từ Vertex AI.';
                throw new Error(errMsg);
              }
            } else {
              const rawText = await response.text();
              throw new Error(`Máy chủ phản hồi không đúng định dạng (${response.status}): ${rawText.slice(0, 100)}`);
            }
          }

          if (imageDataUrl) {
            setPlan((prev) => {
              const next = [...prev];
              const fname = next[i].final_filename || next[i].suggested_filename;
              next[i] = {
                ...next[i],
                status: 'completed',
                image_data_url: imageDataUrl,
                prompt_summary: promptSummary,
                final_filename: fname,
                final_src: `${cleanPath}${fname}`,
                width: next[i].aspect_ratio === '16:9' ? 1280 : 800,
                height: next[i].aspect_ratio === '16:9' ? 720 : 600,
                mime_type: 'image/webp',
                brand_applied: brandApplied,
                brand_profile: brandProfile.brand_name,
                generation_method: 'vertex_ai',
                alt: next[i].alt || next[i].suggested_alt,
                concept: next[i].concept || next[i].suggested_concept,
                error_message: undefined,
              };
              return next;
            });
          }
        } catch (err: any) {
          setPlan((prev) => {
            const next = [...prev];
            next[i] = {
              ...next[i],
              status: 'failed',
              error_message: err.message || 'Lỗi kết nối khi tạo ảnh qua Vertex AI.',
            };
            return next;
          });
        }
      }
    }

    setIsGenerating(false);
  };

  // 5. Regenerate Single Slot (AI or Rebuild)
  const handleRegenerateSlot = async (slotId: string) => {
    const slotIndex = plan.findIndex((s) => s.slot_id === slotId);
    if (slotIndex === -1) return;

    const currentSlot = plan[slotIndex];
    const isRebuild = currentSlot.processing_strategy === 'REBUILD_FROM_SOURCE';

    if (!isRebuild && !useMockMode && !vertexStatus?.is_ready) {
      const missingReason = !vertexStatus?.project_id_configured
        ? 'Chưa cấu hình Project ID Google Cloud. Vui lòng mở Cấu hình hệ thống để nhập Project ID.'
        : 'Chưa phát hiện thông tin xác thực Google Cloud (ADC / Service Account).';
      setErrorMessage(
        `Chưa thể tạo ảnh: cấu hình Vertex AI hoặc thông tin xác thực chưa sẵn sàng. ${missingReason}`
      );
      setShowConfigDrawer(true);
      return;
    }

    const cleanPath = normalizeBasePath(outputBasePath);

    setPlan((prev) => {
      const next = [...prev];
      next[slotIndex] = { ...next[slotIndex], status: 'generating', error_message: undefined };
      return next;
    });

    try {
      if (isRebuild) {
        const response = await fetch('/api/rebuild-source-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            slot: currentSlot,
            brandConfig: brandProfile,
          }),
        });

        const resData = await response.json();
        if (response.ok && resData.success && resData.imageDataUrl) {
          setPlan((prev) => {
            const next = [...prev];
            const fname = next[slotIndex].final_filename || next[slotIndex].suggested_filename;
            next[slotIndex] = {
              ...next[slotIndex],
              status: 'completed',
              image_data_url: resData.imageDataUrl,
              prompt_summary: 'Bản tái tạo tối ưu từ tài liệu gốc, bảo toàn số liệu & đóng dấu nhận diện',
              final_filename: fname,
              final_src: `${cleanPath}${fname}`,
              width: resData.width || 800,
              height: resData.height || 600,
              mime_type: 'image/webp',
              brand_applied: Boolean(resData.brand_applied),
              brand_profile: brandProfile.brand_name,
              generation_method: 'deterministic_rebuild',
              error_message: undefined,
            };
            return next;
          });
        } else {
          throw new Error(resData.error || resData.details || 'Tái tạo lại ảnh gốc thất bại.');
        }
        return;
      }

      // Otherwise generate via AI
      let imageDataUrl: string | null = null;
      let promptSummary = currentSlot.suggested_concept;
      let brandApplied = true;

      if (useMockMode) {
        imageDataUrl = generateClientMockSvg(currentSlot, analysis?.title);
        promptSummary = `Ảnh minh họa mẫu (Demo): ${currentSlot.suggested_concept}`;
      } else {
        const response = await fetch('/api/generate-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            slot: currentSlot,
            articleTitle: analysis?.title || 'Bài viết kinh tế thuế',
            brandConfig: brandProfile,
          }),
        });

        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          const resData = await response.json();
          if (response.ok && resData.success && resData.imageDataUrl) {
            imageDataUrl = resData.imageDataUrl;
            promptSummary = resData.promptSummary || currentSlot.suggested_concept;
            brandApplied = resData.brand_applied ?? true;
          } else {
            const errMsg = resData.error || resData.details || 'Tạo lại ảnh với Vertex AI thất bại.';
            throw new Error(errMsg);
          }
        } else {
          const rawText = await response.text();
          throw new Error(`Máy chủ phản hồi không đúng định dạng (${response.status}): ${rawText.slice(0, 100)}`);
        }
      }

      if (imageDataUrl) {
        setPlan((prev) => {
          const next = [...prev];
          const fname = next[slotIndex].final_filename || next[slotIndex].suggested_filename;
          next[slotIndex] = {
            ...next[slotIndex],
            status: 'completed',
            image_data_url: imageDataUrl,
            prompt_summary: promptSummary,
            final_filename: fname,
            final_src: `${cleanPath}${fname}`,
            width: next[slotIndex].aspect_ratio === '16:9' ? 1280 : 800,
            height: next[slotIndex].aspect_ratio === '16:9' ? 720 : 600,
            mime_type: 'image/webp',
            brand_applied: brandApplied,
            brand_profile: brandProfile.brand_name,
            generation_method: 'vertex_ai',
            alt: next[slotIndex].alt || next[slotIndex].suggested_alt,
            concept: next[slotIndex].concept || next[slotIndex].suggested_concept,
            error_message: undefined,
          };
          return next;
        });
      }
    } catch (err: any) {
      setPlan((prev) => {
        const next = [...prev];
        next[slotIndex] = {
          ...next[slotIndex],
          status: 'failed',
          error_message: err.message || 'Không thể tạo lại ảnh.',
        };
        return next;
      });
    }
  };

  // Construct updated HTML from current plan
  const updatedHtml = analysis
    ? updateArticleHtml(htmlSource, plan, {
        updateFeaturedImage: true,
        imagePathPrefix: outputBasePath,
        brandProfile: brandProfile,
        showCreditInArticle: brandProfile.show_credit_in_article,
      })
    : '';

  const cleanPath = normalizeBasePath(outputBasePath);

  const createManifestItem = (slot: ImageSlotPlan): ManifestSlotItem => {
    const proposedFilename =
      slot.final_filename || slot.suggested_filename || `${slot.slot_id}.webp`;
    const proposedSrc = `${cleanPath}${proposedFilename}`;
    const proposedAlt = slot.alt || slot.suggested_alt || '';
    const oldSrc = slot.old_src || '';
    const oldAlt = slot.old_alt || '';
    const isSuccess = slot.status === 'completed' && Boolean(slot.image_data_url);

    return {
      slot_id: slot.slot_id,
      type: slot.type,
      processing_strategy:
        slot.processing_strategy === 'REBUILD_FROM_SOURCE'
          ? 'REBUILD_FROM_SOURCE'
          : 'GENERATE_AI',
      generation_status: slot.status,
      original_src: oldSrc,
      final_src: isSuccess ? proposedSrc : oldSrc || proposedSrc,
      filename: proposedFilename,
      alt_text: proposedAlt,
      title: slot.title || proposedAlt,
      caption: slot.caption || '',
      credit: slot.credit || brandProfile.default_credit || brandProfile.brand_name || 'Kế Toán Diệu Tâm',
      width: slot.width || (slot.type === 'featured' ? 1280 : 800),
      height: slot.height || (slot.type === 'featured' ? 720 : 600),
      aspect_ratio: slot.aspect_ratio || (slot.type === 'featured' ? '16:9' : '4:3'),
      mime_type: 'image/webp',
      brand_applied: Boolean(slot.brand_applied),
      brand_profile: brandProfile.brand_name,
      generation_method:
        slot.generation_method ||
        (slot.processing_strategy === 'REBUILD_FROM_SOURCE'
          ? 'deterministic_rebuild'
          : 'vertex_ai'),
      source_slot: slot.slot_id,
      classification: slot.classification,
      old_src: oldSrc,
      old_alt: oldAlt,
      proposed_src: proposedSrc,
      proposed_filename: proposedFilename,
      proposed_alt: proposedAlt,
      final_alt: proposedAlt,
      final_filename: proposedFilename,
      concept: slot.concept || slot.suggested_concept || '',
      prompt_summary: slot.prompt_summary || slot.concept || slot.suggested_concept || '',
      error_message: slot.error_message,

      status: slot.status,
      alt: proposedAlt,
      image_data_url: slot.image_data_url,
      source_image: slot.source_image,
      source_resolved_url: slot.source_resolved_url || slot.source_image?.resolved_url,
      source_image_method: slot.source_image_method || slot.source_image?.method,
      source_status_label: slot.source_status_label || slot.source_image?.source_status_label,
      reference_image: slot.reference_image,
      reference_image_choice: slot.reference_image?.choice,
      reference_image_used: Boolean(
        slot.reference_image?.enabled && slot.reference_image?.choice !== 'none'
      ),
    };
  };

  const featuredPlan = plan.find((s) => s.type === 'featured') || plan[0];

  const manifest: ImageManifest | null = analysis
    ? {
        article_title: analysis.title,
        article_slug: analysis.slug,
        article_url: analysis.article_url || articleUrl || undefined,
        base_url: analysis.base_url || baseUrl || undefined,
        source_discovery_summary: analysis.source_discovery_summary,
        generated_at: new Date().toISOString(),
        output_base_path: cleanPath,
        brand_config: brandProfile,
        brand_profile: {
          brand_name: brandProfile.brand_name || 'Kế Toán Diệu Tâm',
          logo_mode: (brandProfile.logo_url || brandProfile.logo_uploaded) ? 'custom_upload' : 'ktdt_default',
          watermark_mode: brandProfile.watermark_mode || 'logo_and_text',
          position: brandProfile.position || 'bottom-right',
          apply_to: brandProfile.apply_to || 'all',
          credit_applied: brandProfile.default_credit || brandProfile.brand_name || 'Kế Toán Diệu Tâm',
          show_credit_in_article: brandProfile.show_credit_in_article ?? false,
        },
        provider: {
          type: 'vertex_ai',
          project_id_configured: Boolean(vertexStatus?.project_id_configured),
          location: vertexStatus?.location || 'global',
          model: vertexStatus?.model || 'gemini-3.1-flash-image',
        },
        featured_image: createManifestItem(featuredPlan),
        inline_images: plan
          .filter((s) => s.type === 'inline')
          .map((s) => createManifestItem(s)),
        artifacts_summary: {
          total_slots: plan.length,
          selected_slots: plan.filter((s) => s.selected).length,
          completed_slots: plan.filter(
            (s) => s.selected && s.status === 'completed' && Boolean(s.image_data_url)
          ).length,
          failed_slots: plan.filter((s) => s.selected && s.status === 'failed').length,
          needs_decision_slots: plan.filter(
            (s) => s.selected && s.processing_strategy === 'NEEDS_DECISION'
          ).length,
          generated_files: plan
            .filter((s) => s.selected && s.status === 'completed' && Boolean(s.image_data_url))
            .map((s) => s.final_filename || s.suggested_filename),
          status:
            plan.length > 0 &&
            plan.every((s) => s.status === 'completed' && Boolean(s.image_data_url))
              ? 'ready'
              : plan.some((s) => s.status === 'failed')
              ? 'has_errors'
              : 'pending',
        },
        updated_html: updatedHtml,
      }
    : null;

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col text-[#0F172A]">
      {/* 1. Header (Clean & Minimalist) */}
      <Header
        isVertexReady={vertexStatus?.is_ready ?? false}
        onOpenConfigDrawer={() => setShowConfigDrawer(true)}
      />

      {/* Main Workspace (Max width ~1180px) */}
      <main className="flex-1 w-full max-w-[1180px] mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {/* 2. Step Progress Indicator */}
        <StepIndicator
          currentStep={currentStep}
          onSelectStep={(step) => setCurrentStep(step)}
          canGoToStep2={Boolean(analysis && plan.length > 0)}
          canGoToStep3={Boolean(analysis && plan.length > 0)}
        />

        {/* Global Error Alert if any */}
        {errorMessage && (
          <div className="mb-6 p-4 rounded-xl bg-rose-50 border border-rose-200 text-[#DC2626] text-xs sm:text-sm flex items-start gap-3 shadow-xs">
            <AlertCircle className="w-5 h-5 text-[#DC2626] shrink-0 mt-0.5" />
            <div className="flex-1">
              <strong className="font-semibold block text-rose-950">Thông báo từ hệ thống:</strong>
              <span className="leading-relaxed">{errorMessage}</span>
            </div>
            <button
              onClick={() => setErrorMessage(null)}
              className="text-rose-500 hover:text-rose-800 font-bold text-xs p-1 cursor-pointer"
            >
              Đóng
            </button>
          </div>
        )}

        {/* STEP 1: NHẬP BÀI VIẾT */}
        {currentStep === 1 && (
          <HtmlInputSection
            htmlSource={htmlSource}
            setHtmlSource={setHtmlSource}
            articleUrl={articleUrl}
            setArticleUrl={setArticleUrl}
            baseUrl={baseUrl}
            setBaseUrl={setBaseUrl}
            onAnalyze={handleAnalyze}
            isAnalyzing={isAnalyzing}
            onClear={() => {
              setHtmlSource('');
              setArticleUrl('');
              setBaseUrl('');
              setAnalysis(null);
              setPlan([]);
            }}
            analysis={analysis}
            plan={plan}
            onSelectSample={handleSelectSample}
            onContinueToStep2={() => setCurrentStep(2)}
            onResetAnalysis={() => {
              setAnalysis(null);
              setPlan([]);
            }}
            onOpenDiscoveryModal={() => setShowDiscoveryModal(true)}
          />
        )}

        {/* STEP 2: KIỂM TRA HÌNH ẢNH */}
        {currentStep === 2 && analysis && (
          <ImagePlanTable
            analysis={analysis}
            plan={plan}
            onUpdateSlot={handleUpdateSlot}
            onToggleAll={handleToggleAll}
            onGenerateAll={handleGenerateAll}
            isGenerating={isGenerating}
            useMockMode={useMockMode}
            setUseMockMode={setUseMockMode}
            outputBasePath={outputBasePath}
            onOutputBasePathChange={handleOutputBasePathChange}
            onBackToStep1={() => setCurrentStep(1)}
            brandProfile={brandProfile}
            onUpdateBrandProfile={setBrandProfile}
          />
        )}

        {/* STEP 3: TẠO & BÀN GIAO */}
        {currentStep === 3 && analysis && (
          <div className="space-y-6">
            {/* Gallery of Results */}
            <ResultGallery
              plan={plan}
              onRegenerateSlot={handleRegenerateSlot}
              isGenerating={isGenerating}
              onPreviewImage={(url, title) => setPreviewModal({ imageUrl: url, title })}
              outputBasePath={outputBasePath}
            />

            {/* Completion and Handover Package */}
            {manifest && (
              <OutputArtifacts
                updatedHtml={updatedHtml}
                manifest={manifest}
                articleSlug={analysis.slug}
                plan={plan}
                outputBasePath={outputBasePath}
              />
            )}

            {/* Back to Step 2 action button */}
            <div className="pt-2 flex justify-start">
              <button
                type="button"
                onClick={() => setCurrentStep(2)}
                className="h-10 px-4 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Quay lại kiểm tra ảnh</span>
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Vertex AI Slide-over Configuration Drawer */}
      <SystemConfigDrawer
        isOpen={showConfigDrawer}
        onClose={() => setShowConfigDrawer(false)}
        status={vertexStatus}
        onRefresh={fetchVertexStatus}
        onUpdateConfig={handleUpdateVertexConfig}
      />

      {/* Fullscreen Image Preview Modal */}
      <ImageModal
        imageUrl={previewModal?.imageUrl || null}
        title={previewModal?.title || ''}
        onClose={() => setPreviewModal(null)}
      />

      {/* Diagnostic Source Discovery Modal */}
      <SourceDiscoveryModal
        isOpen={showDiscoveryModal}
        onClose={() => setShowDiscoveryModal(false)}
        summary={analysis?.source_discovery_summary}
        plan={plan}
      />

      {/* Editorial Clean Footer */}
      <footer className="border-t border-[#E2E8F0] bg-white py-4 text-center text-xs text-[#64748B]">
        KTDT AI Image Rebuilder &bull; Công cụ hỗ trợ ban biên tập báo chí kinh tế, tài chính &amp; thuế
      </footer>
    </div>
  );
}
