import React, { useState } from 'react';
import { ExtractedData } from '../types';
import { Download, CheckCircle } from 'lucide-react';

/**
 * Minimal implementation of the verification step.
 * - Left column: tabs for each uploaded PDF (using the file names passed via `files`).
 * - Right column: placeholder PDF viewer (actual PDF rendering will be added later).
 * - Form fields are not implemented yet – we only show a JSON dump for preview.
 * - When the user clicks "Approva e genera report" we call `onApprove`.
 */
interface Props {
  files: File[];
  extractedData: ExtractedData;
  onApprove: () => void;
}

export const DataVerification: React.FC<Props> = ({ files, extractedData, onApprove }) => {
  const [selectedIdx, setSelectedIdx] = useState(0);

  const selectedFile = files[selectedIdx];

  return (
    <div className="flex h-full">
      {/* Left column – tabs and simple form */}
      <div className="w-1/2 pr-4 border-r border-slate-200 overflow-y-auto">
        <div className="flex space-x-2 mb-4">
          {files.map((f, i) => (
            <button
              key={i}
              onClick={() => setSelectedIdx(i)}
              className={`px-3 py-1 rounded-t ${i === selectedIdx ? 'bg-white border-t border-l border-r border-slate-200' : 'bg-slate-100 text-slate-600'} `}
            >
              {f.name}
            </button>
          ))}
        </div>
        {/* Simple JSON preview of extracted data for the selected document */}
        <pre className="text-xs bg-slate-50 p-2 rounded-md overflow-x-auto max-h-80">
          {JSON.stringify(extractedData, null, 2)}
        </pre>
        <button
          onClick={onApprove}
          className="mt-4 w-full py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center justify-center"
        >
          <CheckCircle className="w-4 h-4 mr-2" /> Approva e genera report
        </button>
      </div>

      {/* Right column – PDF viewer placeholder */}
      <div className="w-1/2 pl-4 overflow-y-auto">
        <div className="border border-slate-200 rounded-lg h-full flex items-center justify-center text-slate-500">
          {/* Placeholder – in a later step we will embed pdfjs viewer with highlight support */}
          PDF Viewer for <span className="font-medium">{selectedFile?.name ?? 'document'}</span>
        </div>
      </div>
    </div>
  );
};
