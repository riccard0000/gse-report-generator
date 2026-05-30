import React, { useState, useEffect, useRef } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { ExtractedData } from '../types';
import { CheckCircle, FileText } from 'lucide-react';

// Assicurati che il worker sia configurato
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

interface Props {
  files: File[];
  extractedData: ExtractedData;
  onApprove: (updatedData: ExtractedData) => void;
}

export const DataVerification: React.FC<Props> = ({ files, extractedData, onApprove }) => {
  const [data, setData] = useState<ExtractedData>(extractedData);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Renderizzazione PDF
  useEffect(() => {
    const renderPdf = async () => {
      const file = files[selectedIdx];
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const page = await pdf.getPage(1); // Per ora visualizza pag 1
      const viewport = page.getViewport({ scale: 1.5 });
      
      const canvas = canvasRef.current;
      if (!canvas) return;
      const context = canvas.getContext('2d');
      canvas.height = viewport.height;
      canvas.width = viewport.width;

      await page.render({ canvasContext: context!, viewport }).promise;
    };
    renderPdf();
  }, [selectedIdx, files]);

  const updateField = (path: (string | number)[], value: any) => {
    const newData = JSON.parse(JSON.stringify(data));
    let current = newData;
    for (let i = 0; i < path.length - 1; i++) current = current[path[i]];
    current[path[path.length - 1]] = value;
    setData(newData);
  };

  return (
    <div className="flex h-[calc(100vh-100px)] gap-4 p-4">
      {/* FORM DI REVISIONE */}
      <div className="w-1/3 bg-white p-6 rounded-xl border border-slate-200 overflow-y-auto">
        <h2 className="font-bold text-slate-800 mb-4">Verifica Dati</h2>
        <div className="space-y-4">
          <div>
            <label className="text-[10px] font-bold text-slate-400">AZIENDA</label>
            <input 
              className="w-full p-2 border rounded text-sm"
              value={data.companyName?.value ?? ''}
              onChange={(e) => updateField(['companyName', 'value'], e.target.value)}
            />
          </div>
          {data.yearsData.map((year, idx) => (
            <div key={idx} className="p-3 bg-slate-50 rounded border">
              <p className="text-xs font-bold mb-2">ANNO {year.year}</p>
              <div className="grid grid-cols-2 gap-2">
                <input 
                  type="number"
                  value={year.ricavi.value ?? ''}
                  className="p-1 border rounded text-xs"
                  onChange={(e) => updateField(['yearsData', idx, 'ricavi', 'value'], parseFloat(e.target.value) || 0)}
                />
                <input 
                  type="number"
                  value={year.ebitda.value ?? ''}
                  className="p-1 border rounded text-xs"
                  onChange={(e) => updateField(['yearsData', idx, 'ebitda', 'value'], parseFloat(e.target.value) || 0)}
                />
              </div>
            </div>
          ))}
        </div>
        <button onClick={() => onApprove(data)} className="mt-6 w-full py-2 bg-blue-600 text-white rounded font-bold">
          Approva
        </button>
      </div>

      {/* VISUALIZZATORE PDF INTERATTIVO */}
      <div className="w-2/3 bg-slate-200 rounded-xl overflow-hidden relative">
        <div className="absolute top-2 left-2 z-10 flex gap-2">
          {files.map((f, i) => (
            <button key={i} onClick={() => setSelectedIdx(i)} className="bg-white px-2 py-1 text-[10px] rounded shadow">
              {f.name}
            </button>
          ))}
        </div>
        <div className="h-full overflow-y-auto flex justify-center p-4">
          {/* Layer Overlay per evidenziazioni (da popolare con le coordinate) */}
          <canvas ref={canvasRef} className="shadow-2xl" />
        </div>
      </div>
    </div>
  );
};