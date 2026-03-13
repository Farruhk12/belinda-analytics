import React, { useState } from 'react';
import { GenericRow } from '../types';
import { Stethoscope, FileSignature, Banknote, ClipboardList, ChevronDown, ChevronUp } from 'lucide-react';

interface Props {
  visitsData: GenericRow[];
  contractsData: GenericRow[];
  bonusesData: GenericRow[];
  recipesData: GenericRow[];
}

const SHEETS = [
  { key: 'visits' as const, label: 'Визиты', icon: Stethoscope },
  { key: 'contracts' as const, label: 'Договора', icon: FileSignature },
  { key: 'bonuses' as const, label: 'УВК', icon: Banknote },
  { key: 'recipes' as const, label: 'Рецепты', icon: ClipboardList },
];

const PREVIEW_ROWS = 15;

export const DataSheetsView: React.FC<Props> = ({
  visitsData,
  contractsData,
  bonusesData,
  recipesData,
}) => {
  const [expanded, setExpanded] = useState<string | null>(null);

  const dataByKey = {
    visits: visitsData,
    contracts: contractsData,
    bonuses: bonusesData,
    recipes: recipesData,
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h2 className="text-xl font-bold text-dark-DEFAULT mb-1">Загруженные документы</h2>
        <p className="text-sm text-slate-500">
          Итого по каждому листу. Нажмите на карточку, чтобы увидеть превью данных.
        </p>
      </div>

      <div className="space-y-4">
        {SHEETS.map(({ key, label, icon: Icon }) => {
          const rows = dataByKey[key];
          const count = rows.length;
          const isExpanded = expanded === key;
          const previewRows = rows.slice(0, PREVIEW_ROWS);
          const columns = count > 0 ? Object.keys(rows[0]) : [];

          return (
            <div
              key={key}
              className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden"
            >
              <button
                onClick={() => setExpanded(isExpanded ? null : key)}
                className="w-full p-5 flex items-center justify-between hover:bg-slate-50 transition-colors text-left"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-lg bg-slate-100 text-slate-600">
                    <Icon size={22} />
                  </div>
                  <div>
                    <p className="font-semibold text-dark-DEFAULT">{label}</p>
                    <p className="text-2xl font-bold text-primary-600">{count}</p>
                    <p className="text-xs text-slate-500">
                      {count === 0 ? 'Нет данных' : count === 1 ? 'запись' : count < 5 ? 'записи' : 'записей'}
                    </p>
                  </div>
                </div>
                {count > 0 && (
                  <span className="text-slate-400">
                    {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                  </span>
                )}
              </button>

              {isExpanded && count > 0 && (
                <div className="border-t border-slate-200 overflow-x-auto max-h-96">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 sticky top-0">
                      <tr>
                        {columns.map((col) => (
                          <th key={col} className="px-4 py-2 text-left font-medium text-slate-600 whitespace-nowrap">
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {previewRows.map((row, i) => (
                        <tr key={i} className="border-t border-slate-100 hover:bg-slate-50">
                          {columns.map((col) => (
                            <td key={col} className="px-4 py-2 text-dark-DEFAULT">
                              {row[col] != null ? String(row[col]) : '—'}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {count > PREVIEW_ROWS && (
                    <p className="px-4 py-2 text-xs text-slate-500 bg-slate-50">
                      Показано {PREVIEW_ROWS} из {count} записей
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
