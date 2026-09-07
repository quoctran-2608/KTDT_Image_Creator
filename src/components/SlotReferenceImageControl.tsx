import React, { useState, useRef } from 'react';
import {
  Sparkles,
  ChevronDown,
  ChevronUp,
  Image as ImageIcon,
  Upload,
  Clipboard,
  Link,
  Info,
  CheckCircle2,
} from 'lucide-react';
import { ImageSlotPlan, ReferenceImageChoice, ReferenceImageConfig } from '../types';

interface SlotReferenceImageControlProps {
  slot: ImageSlotPlan;
  onUpdateSlot: (updated: Partial<ImageSlotPlan>) => void;
}

export const SlotReferenceImageControl: React.FC<SlotReferenceImageControlProps> = ({
  slot,
  onUpdateSlot,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const refConfig: ReferenceImageConfig = slot.reference_image || {
    enabled: false,
    choice: 'none',
    method: 'none',
  };

  const sourceThumbnail =
    slot.source_image?.thumbnail_data_url ||
    slot.source_image?.resolved_url ||
    slot.source_resolved_url ||
    slot.old_src;

  const handleChoiceChange = (choice: ReferenceImageChoice) => {
    if (choice === 'none') {
      onUpdateSlot({
        reference_image: {
          enabled: false,
          choice: 'none',
          method: 'none',
          data_url: undefined,
          url: undefined,
        },
      });
    } else if (choice === 'current_source') {
      onUpdateSlot({
        reference_image: {
          enabled: true,
          choice: 'current_source',
          method: 'current_source',
          data_url: sourceThumbnail,
          url: slot.source_image?.resolved_url || slot.old_src,
        },
      });
    } else if (choice === 'custom_upload') {
      // Keep existing data_url if present, or prompt upload
      if (!refConfig.data_url) {
        fileInputRef.current?.click();
      }
      onUpdateSlot({
        reference_image: {
          ...refConfig,
          enabled: true,
          choice: 'custom_upload',
        },
      });
    }
  };

  const handleCustomUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      onUpdateSlot({
        reference_image: {
          enabled: true,
          choice: 'custom_upload',
          method: 'custom_upload',
          data_url: dataUrl,
          url: file.name,
        },
      });
    };
    reader.readAsDataURL(file);
    if (e.target) e.target.value = '';
  };

  const handlePasteReference = async () => {
    try {
      if (!navigator.clipboard?.read) {
        const url = window.prompt('Dán link ảnh hoặc Data URL tham chiếu:');
        if (url && url.trim()) {
          onUpdateSlot({
            reference_image: {
              enabled: true,
              choice: 'custom_upload',
              method: 'custom_upload',
              data_url: url.trim(),
            },
          });
        }
        return;
      }

      const items = await navigator.clipboard.read();
      for (const item of items) {
        const imageType = item.types.find((t) => t.startsWith('image/'));
        if (imageType) {
          const blob = await item.getType(imageType);
          const reader = new FileReader();
          reader.onload = () => {
            const dataUrl = reader.result as string;
            onUpdateSlot({
              reference_image: {
                enabled: true,
                choice: 'custom_upload',
                method: 'custom_upload',
                data_url: dataUrl,
                url: 'clipboard-ref.png',
              },
            });
          };
          reader.readAsDataURL(blob);
          return;
        }
      }

      const text = await navigator.clipboard.readText();
      if (text && (text.startsWith('http://') || text.startsWith('https://') || text.startsWith('data:image/'))) {
        onUpdateSlot({
          reference_image: {
            enabled: true,
            choice: 'custom_upload',
            method: 'custom_upload',
            data_url: text.trim(),
            url: text.trim(),
          },
        });
      } else {
        alert('Không tìm thấy ảnh trong bộ nhớ tạm để làm tham chiếu.');
      }
    } catch {
      const url = window.prompt('Dán URL ảnh hoặc Data URL tham chiếu:');
      if (url && url.trim()) {
        onUpdateSlot({
          reference_image: {
            enabled: true,
            choice: 'custom_upload',
            method: 'custom_upload',
            data_url: url.trim(),
          },
        });
      }
    }
  };

  // Determine active reference preview image
  const activeRefSrc =
    refConfig.choice === 'current_source'
      ? sourceThumbnail
      : refConfig.choice === 'custom_upload'
      ? refConfig.data_url
      : null;

  return (
    <div className="rounded-xl border border-teal-200/80 bg-teal-50/30 overflow-hidden text-xs">
      {/* Accordion Header */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-3.5 py-2.5 flex items-center justify-between gap-2 hover:bg-teal-50/60 transition-colors text-left cursor-pointer"
      >
        <div className="flex items-center gap-2">
          <Sparkles className="w-3.5 h-3.5 text-[#0F766E]" />
          <span className="font-bold text-slate-800">
            Ảnh tham chiếu cho AI (Tùy chọn)
          </span>

          {refConfig.enabled && refConfig.choice !== 'none' && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#0F766E] text-white">
              <CheckCircle2 className="w-2.5 h-2.5" />
              <span>
                {refConfig.choice === 'current_source' ? 'Dùng ảnh bài viết' : 'Ảnh tùy chọn'}
              </span>
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 text-[11px] text-slate-500 font-medium">
          <span>{isOpen ? 'Thu gọn' : 'Tùy chỉnh'}</span>
          {isOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </div>
      </button>

      {/* Accordion Body */}
      {isOpen && (
        <div className="p-3.5 border-t border-teal-100 bg-white space-y-3 animate-in fade-in duration-100">
          <div className="flex items-start gap-1.5 text-[11px] text-slate-500 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
            <Info className="w-3.5 h-3.5 text-teal-600 shrink-0 mt-0.5" />
            <p className="leading-relaxed">
              Ảnh tham chiếu chỉ dùng để AI tham khảo góc chụp, bố cục và loại chủ thể. AI sẽ tạo ra một bức ảnh hoàn toàn mới, không sao chép nguyên xi.
            </p>
          </div>

          {/* 3 Radio Options */}
          <div className="space-y-2">
            {/* Option 1: None */}
            <label className="flex items-center gap-2.5 p-2 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer transition-colors">
              <input
                type="radio"
                name={`ref-choice-${slot.slot_id}`}
                value="none"
                checked={!refConfig.enabled || refConfig.choice === 'none'}
                onChange={() => handleChoiceChange('none')}
                className="w-3.5 h-3.5 text-[#0F766E] focus:ring-[#0F766E]"
              />
              <div className="flex-1">
                <span className="font-semibold text-slate-800 block text-xs">
                  Không dùng ảnh tham chiếu
                </span>
                <span className="text-[11px] text-slate-400">
                  AI tự do sáng tạo bối cảnh mới dựa trên ý tưởng và prompt đã biên tập.
                </span>
              </div>
            </label>

            {/* Option 2: Use current source image */}
            <label
              className={`flex items-start gap-2.5 p-2 rounded-lg border transition-colors ${
                sourceThumbnail
                  ? 'border-slate-200 hover:bg-slate-50 cursor-pointer'
                  : 'border-slate-100 bg-slate-50 opacity-60 cursor-not-allowed'
              }`}
            >
              <input
                type="radio"
                name={`ref-choice-${slot.slot_id}`}
                value="current_source"
                disabled={!sourceThumbnail}
                checked={refConfig.enabled && refConfig.choice === 'current_source'}
                onChange={() => handleChoiceChange('current_source')}
                className="w-3.5 h-3.5 text-[#0F766E] focus:ring-[#0F766E] mt-0.5"
              />
              <div className="flex-1">
                <span className="font-semibold text-slate-800 block text-xs">
                  Dùng chính ảnh hiện tại làm tham chiếu bố cục / góc máy
                </span>
                <span className="text-[11px] text-slate-400">
                  {sourceThumbnail
                    ? 'Giữ lại góc máy và tương quan chủ thể tương tự, tái tạo thành phong cách nhiếp ảnh hiện đại.'
                    : 'Chưa có ảnh bài viết để tham chiếu.'}
                </span>
              </div>
            </label>

            {/* Option 3: Custom upload / paste */}
            <div
              className={`p-2 rounded-lg border transition-colors ${
                refConfig.enabled && refConfig.choice === 'custom_upload'
                  ? 'border-teal-400 bg-teal-50/30'
                  : 'border-slate-200 hover:bg-slate-50'
              }`}
            >
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="radio"
                  name={`ref-choice-${slot.slot_id}`}
                  value="custom_upload"
                  checked={refConfig.enabled && refConfig.choice === 'custom_upload'}
                  onChange={() => handleChoiceChange('custom_upload')}
                  className="w-3.5 h-3.5 text-[#0F766E] focus:ring-[#0F766E]"
                />
                <div className="flex-1">
                  <span className="font-semibold text-slate-800 block text-xs">
                    Dán / Tải ảnh tham chiếu mới
                  </span>
                  <span className="text-[11px] text-slate-400">
                    Cung cấp ảnh mẫu cụ thể mà bạn muốn AI học theo góc nhìn hoặc màu sắc.
                  </span>
                </div>
              </label>

              {refConfig.enabled && refConfig.choice === 'custom_upload' && (
                <div className="mt-2.5 pl-6 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handlePasteReference}
                    className="px-2.5 py-1 rounded bg-white border border-slate-200 hover:bg-slate-50 text-[11px] font-medium text-slate-700 flex items-center gap-1 cursor-pointer"
                  >
                    <Clipboard className="w-3 h-3 text-slate-500" />
                    <span>Dán từ clipboard</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="px-2.5 py-1 rounded bg-white border border-slate-200 hover:bg-slate-50 text-[11px] font-medium text-slate-700 flex items-center gap-1 cursor-pointer"
                  >
                    <Upload className="w-3 h-3 text-slate-500" />
                    <span>Tải file ảnh</span>
                  </button>
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleCustomUpload}
                    accept="image/*"
                    className="hidden"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Reference Image Preview if enabled */}
          {refConfig.enabled && activeRefSrc && (
            <div className="flex items-center gap-2.5 p-2 bg-slate-50 rounded-lg border border-slate-200">
              <div className="w-14 h-10 rounded bg-slate-200 overflow-hidden shrink-0 border border-slate-300">
                <img
                  src={activeRefSrc}
                  alt="Ảnh tham chiếu"
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="text-[11px] min-w-0">
                <span className="font-semibold text-slate-700 block truncate">
                  Đang dùng làm tham chiếu:
                </span>
                <span className="text-slate-500 truncate block">
                  {refConfig.choice === 'current_source'
                    ? 'Ảnh hiện tại trong bài'
                    : refConfig.url || 'Ảnh tải lên riêng'}
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
