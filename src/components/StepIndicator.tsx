import React from 'react';
import { Check, FileText, Image as ImageIcon, Sparkles } from 'lucide-react';

export type WorkflowStep = 1 | 2 | 3;

interface StepIndicatorProps {
  currentStep: WorkflowStep;
  onSelectStep: (step: WorkflowStep) => void;
  canGoToStep2: boolean;
  canGoToStep3: boolean;
}

export const StepIndicator: React.FC<StepIndicatorProps> = ({
  currentStep,
  onSelectStep,
  canGoToStep2,
  canGoToStep3,
}) => {
  const steps = [
    {
      step: 1 as WorkflowStep,
      title: 'Nhập bài viết',
      desc: 'Dán mã HTML bài viết',
      icon: FileText,
      enabled: true,
    },
    {
      step: 2 as WorkflowStep,
      title: 'Kiểm tra hình ảnh',
      desc: 'Ảnh bìa & ảnh minh họa',
      icon: ImageIcon,
      enabled: canGoToStep2,
    },
    {
      step: 3 as WorkflowStep,
      title: 'Tạo & bàn giao',
      desc: 'Xuất ảnh & tải gói ZIP',
      icon: Sparkles,
      enabled: canGoToStep3,
    },
  ];

  return (
    <nav aria-label="Tiến trình làm việc" className="mb-6 sm:mb-8">
      <div className="bg-white rounded-2xl border border-slate-200 p-2 sm:p-3 shadow-xs">
        <ol className="grid grid-cols-3 gap-2 sm:gap-4">
          {steps.map((item) => {
            const isCurrent = currentStep === item.step;
            const isPast = currentStep > item.step;
            const isClickable = item.enabled && !isCurrent;

            return (
              <li key={item.step} className="relative">
                <button
                  type="button"
                  onClick={() => isClickable && onSelectStep(item.step)}
                  disabled={!isClickable}
                  className={`w-full text-left p-2.5 sm:p-3 rounded-xl transition-all flex items-center gap-2.5 sm:gap-3.5 ${
                    isCurrent
                      ? 'bg-teal-50/80 border border-teal-200 shadow-xs'
                      : isPast
                      ? 'bg-slate-50/60 hover:bg-slate-100/80 cursor-pointer border border-transparent'
                      : item.enabled
                      ? 'hover:bg-slate-50 cursor-pointer border border-transparent'
                      : 'opacity-50 cursor-not-allowed border border-transparent'
                  }`}
                >
                  {/* Step Icon / Number Circle */}
                  <div
                    className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-colors ${
                      isCurrent
                        ? 'bg-[#0F766E] text-white shadow-xs'
                        : isPast
                        ? 'bg-emerald-600 text-white'
                        : 'bg-slate-100 text-slate-500 border border-slate-200'
                    }`}
                  >
                    {isPast ? <Check className="w-4 h-4 stroke-[2.5]" /> : item.step}
                  </div>

                  {/* Step Text */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-medium uppercase tracking-wider text-slate-400 hidden sm:inline">
                        Bước {item.step}
                      </span>
                    </div>
                    <div
                      className={`text-xs sm:text-sm font-semibold truncate ${
                        isCurrent
                          ? 'text-[#0F766E]'
                          : isPast
                          ? 'text-slate-900'
                          : 'text-slate-500'
                      }`}
                    >
                      {item.title}
                    </div>
                    <p className="text-[11px] text-slate-400 truncate hidden md:block">
                      {item.desc}
                    </p>
                  </div>
                </button>
              </li>
            );
          })}
        </ol>
      </div>
    </nav>
  );
};
