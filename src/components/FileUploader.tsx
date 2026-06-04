import React, { useRef, useState } from 'react';
import { UploadCloud, FileText, X } from 'lucide-react';

interface Props {
  files: File[];
  onFilesChange: (files: File[]) => void;
  maxFiles?: number;
}

export const FileUploader: React.FC<Props> = ({ files, onFilesChange, maxFiles = 3 }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const addFiles = (newFiles: File[]) => {
    const valid = newFiles.filter(f => f.type === 'application/pdf');
    const combined = [...files, ...valid].slice(0, maxFiles);
    onFilesChange(combined);
  };

  const removeFile = (e: React.MouseEvent, idx: number) => {
    e.stopPropagation();
    onFilesChange(files.filter((_, i) => i !== idx));
  };

  return (
    <div className="mb-6">
      <div
        className={`relative border-2 border-dashed rounded-xl p-8 transition-all text-center cursor-pointer
          ${isDragging ? 'border-blue-500 bg-blue-50' : 'border-slate-300 hover:border-slate-400 bg-slate-50 hover:bg-slate-100'}
          ${files.length >= maxFiles ? 'opacity-50 pointer-events-none' : ''}`}
        onClick={() => files.length < maxFiles && fileInputRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={e => { e.preventDefault(); setIsDragging(false); }}
        onDrop={e => { e.preventDefault(); setIsDragging(false); addFiles(Array.from(e.dataTransfer.files)); }}
      >
        <input
          type="file" ref={fileInputRef}
          onChange={e => { if (e.target.files) addFiles(Array.from(e.target.files)); if (fileInputRef.current) fileInputRef.current.value = ''; }}
          accept="application/pdf" multiple className="hidden"
          disabled={files.length >= maxFiles}
        />
        <UploadCloud className={`w-10 h-10 mx-auto mb-3 ${isDragging ? 'text-blue-500' : 'text-slate-400'}`} />
        <p className="text-sm font-medium text-slate-700 mb-1">
          Trascina qui i file PDF o <span className="text-blue-600">sfoglia</span>
        </p>
        <p className="text-xs text-slate-500">
          Carica esattamente {maxFiles} bilanci aziendali in formato PDF
        </p>
      </div>

      {files.length > 0 && (
        <div className="mt-4 space-y-2">
          <h3 className="text-sm font-medium text-slate-700">File caricati ({files.length}/{maxFiles}):</h3>
          {files.map((file, idx) => (
            <div key={`${file.name}-${idx}`} className="flex items-center justify-between bg-white border border-slate-200 rounded-lg p-3 shadow-sm">
              <div className="flex items-center space-x-3 overflow-hidden">
                <FileText className="w-6 h-6 text-blue-600 flex-shrink-0" />
                <div className="truncate">
                  <p className="text-sm font-medium text-slate-900 truncate">{file.name}</p>
                  <p className="text-xs text-slate-500">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                </div>
              </div>
              <button onClick={e => removeFile(e, idx)} className="p-1.5 hover:bg-red-50 rounded-md text-slate-400 hover:text-red-600 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
