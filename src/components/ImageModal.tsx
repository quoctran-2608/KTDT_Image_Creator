import React from 'react';
import { X, Download } from 'lucide-react';
import { downloadSingleFile } from '../utils/zipExporter';

interface ImageModalProps {
  imageUrl: string | null;
  title: string;
  onClose: () => void;
}

export const ImageModal: React.FC<ImageModalProps> = ({ imageUrl, title, onClose }) => {
  if (!imageUrl) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 sm:p-6 animate-fade-in">
      <div className="relative max-w-4xl w-full bg-slate-900 rounded-2xl overflow-hidden shadow-2xl border border-slate-700 flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between text-white">
          <span className="text-sm font-semibold truncate pr-4 text-slate-200">
            {title || 'Xem ảnh'}
          </span>

          <div className="flex items-center gap-2">
            <button
              onClick={() => downloadSingleFile('ktdt-image.webp', imageUrl)}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors cursor-pointer"
              title="Tải ảnh"
            >
              <Download className="w-4 h-4" />
            </button>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-900/60 hover:text-rose-200 text-slate-400 transition-colors cursor-pointer"
              title="Đóng"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Image Content */}
        <div className="flex-1 overflow-auto p-4 flex items-center justify-center bg-black/40">
          <img
            src={imageUrl}
            alt={title}
            referrerPolicy="no-referrer"
            className="max-w-full max-h-[75vh] object-contain rounded-lg shadow-lg"
          />
        </div>
      </div>
    </div>
  );
};
