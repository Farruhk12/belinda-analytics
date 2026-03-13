import React, { useRef, useState } from 'react';
import { Loader2, CheckCircle, AlertCircle, FileSpreadsheet, ChevronDown, X } from 'lucide-react';
import { parseExcelFile } from '../services/excelService';
import { uploadExcelToSupabase, UploadMode } from '../services/supabaseDataService';
import { isSupabaseConfigured } from '../lib/supabase';
import { DISPLAY_SHEET_NAMES } from '../services/excelService';

interface Props {
  onUploadSuccess: () => void;
}

const MODE_LABELS: Record<UploadMode, { label: string; desc: string; color: string }> = {
  replace: { label: 'Заменить',  desc: 'Полная замена — старые данные удаляются',          color: 'text-red-600' },
  add:     { label: 'Добавить',  desc: 'Только новые строки, существующие не трогаются',    color: 'text-blue-600' },
  merge:   { label: 'Объединить', desc: 'Новые добавляются, изменённые обновляются',        color: 'text-emerald-600' },
};

const SHEET_LABELS: Record<string, string> = {
  visits: 'Визиты', bonuses: 'УВК', contracts: 'Договор', recipes: 'Рецепты',
};

export const ExcelUpload: React.FC<Props> = ({ onUploadSuccess }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState<string>('');
  const [mode, setMode] = useState<UploadMode>('replace');
  const [showMode, setShowMode] = useState(false);
  const [resultDetails, setResultDetails] = useState<{ sheet: string; added: number; updated: number; total: number }[]>([]);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (!isSupabaseConfigured()) {
      setStatus('error');
      setMessage('Добавьте VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY в .env.local');
      return;
    }

    setStatus('loading');
    setMessage('');
    setResultDetails([]);
    setShowMode(false);

    try {
      const parsed = await parseExcelFile(file);
      const results = await uploadExcelToSupabase(parsed, mode);
      setStatus('success');
      setResultDetails(results.map(r => ({
        sheet: SHEET_LABELS[r.sheetKey] ?? r.sheetKey,
        added: r.added,
        updated: r.updated,
        total: r.total,
      })));
      onUploadSuccess();
    } catch (err) {
      setStatus('error');
      const msg = err instanceof Error ? err.message : 'Ошибка загрузки';
      setMessage(msg);
      console.error('Excel upload error:', err);
    }
  };

  return (
    <div className="relative flex flex-col gap-2">
      {/* Main row */}
      <div className="flex items-center gap-0.5">
        {/* Upload button */}
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
          onChange={handleFile}
          className="hidden"
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={status === 'loading'}
          title={`Листы: ${DISPLAY_SHEET_NAMES.join(', ')}`}
          className="flex items-center gap-2 pl-3 pr-2 py-2 rounded-l-lg border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors font-medium text-sm disabled:opacity-60"
        >
          {status === 'loading' ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <FileSpreadsheet size={16} />
          )}
          <span className="hidden sm:inline">{status === 'loading' ? 'Загрузка…' : 'Загрузить'}</span>
        </button>
        {/* Mode selector dropdown trigger */}
        <button
          type="button"
          onClick={() => setShowMode(v => !v)}
          disabled={status === 'loading'}
          title="Режим загрузки"
          className={`flex items-center gap-1 px-2 py-2 rounded-r-lg border border-l-0 border-emerald-200 bg-emerald-50 hover:bg-emerald-100 transition-colors text-sm font-semibold disabled:opacity-60 ${MODE_LABELS[mode].color}`}
        >
          <span className="hidden xs:inline">{MODE_LABELS[mode].label}</span>
          <ChevronDown size={14} className={`transition-transform ${showMode ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {/* Mode dropdown */}
      {showMode && (
        <div className="absolute top-full right-0 mt-1 z-50 bg-white rounded-xl border border-slate-200 shadow-lg w-72 overflow-hidden">
          <div className="px-4 py-2.5 border-b border-slate-100 flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">Режим загрузки</span>
            <button onClick={() => setShowMode(false)} className="p-1 hover:bg-slate-100 rounded-lg">
              <X size={14} className="text-slate-400" />
            </button>
          </div>
          {(Object.entries(MODE_LABELS) as [UploadMode, typeof MODE_LABELS[UploadMode]][]).map(([key, info]) => (
            <button
              key={key}
              onClick={() => { setMode(key); setShowMode(false); }}
              className={`w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors flex items-start gap-3 ${mode === key ? 'bg-slate-50' : ''}`}
            >
              <div className={`w-3 h-3 rounded-full mt-0.5 shrink-0 ${
                key === 'replace' ? 'bg-red-400' :
                key === 'add' ? 'bg-blue-400' : 'bg-emerald-400'
              }`} />
              <div>
                <div className={`text-sm font-semibold ${info.color}`}>{info.label}</div>
                <div className="text-xs text-slate-400 mt-0.5">{info.desc}</div>
              </div>
              {mode === key && (
                <CheckCircle size={14} className="text-emerald-500 ml-auto shrink-0 mt-0.5" />
              )}
            </button>
          ))}
          <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-100 text-xs text-slate-400">
            Листы: {DISPLAY_SHEET_NAMES.join(', ')}
          </div>
        </div>
      )}

      {/* Success details */}
      {status === 'success' && resultDetails.length > 0 && (
        <div className="flex items-start gap-2 text-sm text-emerald-700">
          <CheckCircle size={15} className="shrink-0 mt-0.5" />
          <div>
            {resultDetails.map(r => (
              <div key={r.sheet}>
                <span className="font-semibold">{r.sheet}</span>:&nbsp;
                {mode === 'replace'
                  ? `${r.total} строк загружено`
                  : `+${r.added} новых${r.updated > 0 ? `, ~${r.updated} обновлено` : ''}`
                }
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Error */}
      {status === 'error' && (
        <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
          <AlertCircle size={16} className="shrink-0 mt-0.5" />
          <span>{message}</span>
        </div>
      )}
    </div>
  );
};
