import React, { useEffect, useRef, useState } from 'react';
import { FileSpreadsheet, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { parseExcelFile } from '../services/excelService';
import { uploadExcelToSupabase, UploadMode, loadUploadMeta, saveUploadTimestamp, UploadMeta } from '../services/supabaseDataService';
import { isSupabaseConfigured } from '../lib/supabase';
import type { SheetKey } from '../services/supabaseDataService';

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('ru-RU', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const MODE_BUTTONS: { mode: UploadMode; label: string; className: string }[] = [
  { mode: 'replace', label: 'Заменить', className: 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100' },
  { mode: 'add', label: 'Добавить', className: 'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100' },
  { mode: 'merge', label: 'Объединить', className: 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100' },
];

const SHEET_CONFIG: { key: SheetKey; label: string }[] = [
  { key: 'visits', label: 'Визиты' },
  { key: 'bonuses', label: 'УВК' },
  { key: 'contracts', label: 'Договор' },
  { key: 'recipes', label: 'Рецепты' },
  { key: 'doctors', label: 'База врачей' },
];

interface SheetUploadRowProps {
  sheetKey: SheetKey;
  label: string;
  lastUpdated?: string;
  onSuccess: (sheetKey: SheetKey) => void;
}

const SheetUploadRow: React.FC<SheetUploadRowProps> = ({ sheetKey, label, lastUpdated, onSuccess }) => {
  const inputRefs = useRef<Record<UploadMode, HTMLInputElement | null>>({ replace: null, add: null, merge: null });
  const [loadingMode, setLoadingMode] = useState<UploadMode | null>(null);
  const [successMode, setSuccessMode] = useState<UploadMode | null>(null);
  const [error, setError] = useState('');

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>, mode: UploadMode) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (!isSupabaseConfigured()) {
      setError('Добавьте VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY в .env.local');
      setLoadingMode(null);
      return;
    }

    setLoadingMode(mode);
    setError('');
    setSuccessMode(null);

    try {
      const parsed = await parseExcelFile(file);
      const rows = parsed[sheetKey];
      if (!rows || rows.length === 0) {
        setError(`В файле нет листа «${label}» или он пуст`);
        return;
      }
      await uploadExcelToSupabase({ [sheetKey]: rows }, mode);
      await saveUploadTimestamp(sheetKey);
      setSuccessMode(mode);
      onSuccess(sheetKey);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка загрузки');
    } finally {
      setLoadingMode(null);
    }
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="shrink-0 min-w-[100px]">
          <span className="flex items-center gap-1.5 text-sm font-medium text-dark-DEFAULT">
            <FileSpreadsheet size={16} className="text-emerald-600 shrink-0" />
            {label}
          </span>
          {lastUpdated && (
            <p className="text-[11px] text-slate-400 mt-0.5 pl-[22px]">{formatDate(lastUpdated)}</p>
          )}
        </div>
        <div className="flex gap-2 flex-wrap">
          {MODE_BUTTONS.map(({ mode, label: btnLabel, className }) => (
            <React.Fragment key={mode}>
              <input
                ref={el => { inputRefs.current[mode] = el; }}
                type="file"
                accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                onChange={e => handleFile(e, mode)}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => inputRefs.current[mode]?.click()}
                disabled={loadingMode !== null}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition-colors disabled:opacity-60 ${className}`}
              >
                {loadingMode === mode ? (
                  <Loader2 size={14} className="animate-spin shrink-0" />
                ) : successMode === mode ? (
                  <CheckCircle size={14} className="shrink-0" />
                ) : null}
                {btnLabel}
              </button>
            </React.Fragment>
          ))}
        </div>
      </div>
      {error && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
          <AlertCircle size={14} className="shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
};

interface Props {
  onUploadSuccess: () => void;
}

export const DatabasePage: React.FC<Props> = ({ onUploadSuccess }) => {
  const [meta, setMeta] = useState<UploadMeta>({});

  useEffect(() => {
    loadUploadMeta().then(setMeta);
  }, []);

  const handleSuccess = (sheetKey: SheetKey) => {
    setMeta(prev => ({ ...prev, [sheetKey]: new Date().toISOString() }));
    onUploadSuccess();
  };

  return (
    <div className="max-w-xl mx-auto">
      <div className="mb-8">
        <h1 className="text-xl font-bold text-dark-DEFAULT mb-1">База данных</h1>
        <p className="text-sm text-slate-500">Загрузите данные по каждому типу отдельно</p>
      </div>

      <div className="space-y-5">
        <p className="text-sm font-medium text-slate-600">Загрузить данные</p>
        {SHEET_CONFIG.map(({ key, label }) => (
          <SheetUploadRow
            key={key}
            sheetKey={key}
            label={label}
            lastUpdated={meta[key]}
            onSuccess={handleSuccess}
          />
        ))}
      </div>
    </div>
  );
};
