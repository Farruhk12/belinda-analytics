import React, { useMemo } from 'react';
import { GenericRow } from '../types';

interface Props {
  title: string;
  data: GenericRow[];
  emptyMessage?: string;
}

/** Таблица по данным листа Excel (заголовки — ключи первой строки). */
export const SheetDataTable: React.FC<Props> = ({ title, data, emptyMessage = 'Нет данных' }) => {
  const headers = useMemo(() => {
    if (data.length === 0) return [];
    const keys = new Set<string>();
    data.forEach((row) => Object.keys(row).forEach((k) => keys.add(k)));
    return Array.from(keys);
  }, [data]);

  if (data.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 font-semibold text-dark-DEFAULT">
          {title}
        </div>
        <div className="p-8 text-center text-slate-500">{emptyMessage}</div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
        <span className="font-semibold text-dark-DEFAULT">{title}</span>
        <span className="text-sm text-slate-500">{data.length} записей</span>
      </div>
      <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-100 sticky top-0 z-10">
            <tr>
              {headers.map((h) => (
                <th
                  key={h}
                  className="px-3 py-2.5 text-left text-xs font-semibold text-slate-600 uppercase whitespace-nowrap"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {data.map((row, idx) => (
              <tr key={idx} className="hover:bg-slate-50">
                {headers.map((h) => (
                  <td key={h} className="px-3 py-2 text-slate-700 whitespace-nowrap max-w-[200px] truncate">
                    {row[h] != null ? String(row[h]) : ''}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
