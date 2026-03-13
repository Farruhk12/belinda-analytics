import React, { useMemo, useEffect } from 'react';
import { DoctorInteraction, MonthlyInteraction, GenericRow } from '../types';
import { X, Calendar, Stethoscope, Banknote, Building2, User, FileSignature, ClipboardList, CheckCircle, XCircle } from 'lucide-react';
import { getContractVsRecipeMatch } from '../services/dataService';

const getRowVal = (row: GenericRow, ...patterns: string[]): string | number => {
  const k = Object.keys(row).find(key => patterns.some(p => key.toLowerCase().includes(p)));
  return k != null ? row[k] : '';
};

interface Props {
  doctor: DoctorInteraction;
  employeeName: string;
  onClose: () => void;
  contractItems?: GenericRow[];
  recipeItems?: GenericRow[];
  selectedPeriod?: string;
}

const isMonthInQuarter = (monthKey: string, quarterKey: string): boolean => {
  const [qYear, qPart] = quarterKey.split('-Q');
  const [mYear, mMonth] = monthKey.split('-');
  if (qYear !== mYear) return false;
  const monthNum = parseInt(mMonth, 10);
  const qNum = parseInt(qPart, 10);
  const startMonth = (qNum - 1) * 3 + 1;
  return monthNum >= startMonth && monthNum <= qNum * 3;
};

const matchesPeriod = (month: string, period: string): boolean => {
  if (period === 'All') return true;
  if (period.includes('-Q')) return isMonthInQuarter(month, period);
  return month === period;
};

export const DoctorDetail: React.FC<Props> = ({ doctor, employeeName, onClose, contractItems = [], recipeItems = [], selectedPeriod = 'All' }) => {
  // Extract history into array, filter by period, sort descending
  const historyData = useMemo(() => {
    return Object.entries(doctor.history)
      .map(([month, stats]) => {
        const data = stats as MonthlyInteraction;
        return { month, visits: data.visits, bonuses: data.bonuses };
      })
      .filter(h => matchesPeriod(h.month, selectedPeriod))
      .sort((a, b) => b.month.localeCompare(a.month));
  }, [doctor, selectedPeriod]);

  const totalHistoryVisits = historyData.reduce((sum, h) => sum + h.visits, 0);
  const totalHistoryBonuses = historyData.reduce((sum, h) => sum + h.bonuses, 0);

  // Фильтрация рецептов по выбранному периоду
  const filteredRecipes = useMemo(() => {
    if (selectedPeriod === 'All') return recipeItems;
    return recipeItems.filter(row => {
      const dateVal = String(getRowVal(row, 'дата', 'отгрузк') || '');
      if (!dateVal) return false;
      const isoMatch = dateVal.match(/\d{4}-\d{2}-\d{2}/)?.[0];
      const monthKey = isoMatch ? isoMatch.substring(0, 7) : null;
      if (!monthKey) return false;
      return matchesPeriod(monthKey, selectedPeriod);
    });
  }, [recipeItems, selectedPeriod]);

  const recipeSum = useMemo(
    () => filteredRecipes.reduce((s, r) => s + (Number(getRowVal(r, 'сумма')) || 0), 0),
    [filteredRecipes]
  );

  const contractVsRecipe = useMemo(
    () => getContractVsRecipeMatch(contractItems, filteredRecipes),
    [contractItems, filteredRecipes]
  );

  // Close on Escape key
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-dark-900/40 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Modal Content */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:justify-between sm:items-start bg-slate-50/50 gap-4">
          <div className="flex-1">
            <h2 className="text-xl font-bold text-dark-DEFAULT pr-8">{doctor.doctorName}</h2>
            <p className="text-sm text-slate-500 mt-1 mb-3">МП: {employeeName}</p>
            
            {/* Metadata Badges */}
            <div className="flex flex-wrap gap-2">
              {doctor.specialty && (
                <div className="inline-flex items-center px-2.5 py-1 rounded-md bg-white border border-slate-200 text-xs text-dark-600 shadow-sm">
                   <User size={12} className="mr-1.5 text-primary-500" />
                   {doctor.specialty}
                </div>
              )}
              {doctor.institution && (
                 <div className="inline-flex items-center px-2.5 py-1 rounded-md bg-white border border-slate-200 text-xs text-dark-600 shadow-sm">
                   <Building2 size={12} className="mr-1.5 text-primary-500" />
                   {doctor.institution}
                </div>
              )}
            </div>
          </div>

          <button 
            onClick={onClose}
            className="absolute top-4 right-4 p-2 rounded-full hover:bg-slate-200 text-slate-400 hover:text-dark-DEFAULT transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="overflow-y-auto p-5 space-y-6">
          
          {/* 4 показателя: Визиты, Договор, Рецепты, Бонусы */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 flex items-center justify-between">
              <div className="min-w-0">
                <p className="text-slate-500 text-[10px] uppercase font-semibold mb-0.5">Визиты</p>
                <p className="text-lg font-bold text-dark-DEFAULT truncate">{totalHistoryVisits}</p>
              </div>
              <Stethoscope size={18} className="text-slate-400 shrink-0 ml-1" />
            </div>
            <div className="bg-amber-50/80 p-3 rounded-xl border border-amber-100 flex items-center justify-between">
              <div className="min-w-0">
                <p className="text-slate-500 text-[10px] uppercase font-semibold mb-0.5">Договор</p>
                <p className="text-lg font-bold text-dark-DEFAULT truncate">{contractItems.length} поз.</p>
              </div>
              <FileSignature size={18} className="text-amber-600 shrink-0 ml-1" />
            </div>
            <div className="bg-emerald-50/80 p-3 rounded-xl border border-emerald-100 flex items-center justify-between">
              <div className="min-w-0">
                <p className="text-slate-500 text-[10px] uppercase font-semibold mb-0.5">Рецепты</p>
                <p className="text-lg font-bold text-dark-DEFAULT truncate">{filteredRecipes.length} поз.</p>
              </div>
              <ClipboardList size={18} className="text-emerald-600 shrink-0 ml-1" />
            </div>
            <div className="bg-red-50/50 p-3 rounded-xl border border-red-100 flex items-center justify-between">
              <div className="min-w-0">
                <p className="text-slate-500 text-[10px] uppercase font-semibold mb-0.5">Бонусы</p>
                <p className="text-lg font-bold text-primary-500 truncate">{new Intl.NumberFormat('ru-RU').format(totalHistoryBonuses)}</p>
              </div>
              <Banknote size={18} className="text-primary-500 shrink-0 ml-1" />
            </div>
          </div>

          {/* Table */}
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
              <Calendar size={16} className="text-slate-400" />
              <h3 className="font-semibold text-sm text-dark-DEFAULT">Детализация по месяцам</h3>
            </div>
            
            <table className="min-w-full divide-y divide-slate-100">
              <thead className="bg-white">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Месяц</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase">Визиты</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase">Бонусы</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase">Эффект</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {historyData.map((row) => (
                  <tr key={row.month} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 text-sm font-medium text-dark-DEFAULT whitespace-nowrap">{row.month}</td>
                    
                    <td className="px-4 py-3 text-sm text-right">
                      {row.visits > 0 ? (
                        <span className="font-bold text-dark-600">{row.visits}</span>
                      ) : (
                        <span className="text-slate-300">-</span>
                      )}
                    </td>
                    
                    <td className="px-4 py-3 text-sm text-right">
                      {row.bonuses > 0 ? (
                        <span className="font-medium text-primary-600">{new Intl.NumberFormat('ru-RU').format(row.bonuses)}</span>
                      ) : (
                        <span className="text-slate-300">-</span>
                      )}
                    </td>

                    <td className="px-4 py-3 text-sm text-right">
                      {row.visits > 0 && row.bonuses > 0 && (
                          <div className="w-2 h-2 rounded-full bg-green-500 mx-auto" title="Эффективно"></div>
                      )}
                      {row.visits > 0 && row.bonuses === 0 && (
                          <div className="w-2 h-2 rounded-full bg-slate-300 mx-auto" title="Работа"></div>
                      )}
                      {row.visits === 0 && row.bonuses > 0 && (
                          <div className="w-2 h-2 rounded-full bg-red-500 mx-auto" title="Спящий"></div>
                      )}
                    </td>
                  </tr>
                ))}
                {historyData.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-sm text-slate-500">
                      Нет данных за выбранный период.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Договор с врачом — какие продукты должен выписывать (на год) */}
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3 bg-amber-50 border-b border-amber-100 flex items-center gap-2 flex-wrap">
              <FileSignature size={16} className="text-amber-600" />
              <h3 className="font-semibold text-sm text-dark-DEFAULT">Договор (продукты к выписке)</h3>
              <span className="text-xs text-amber-700/80 ml-auto">На год, показывается для всех месяцев</span>
            </div>
            {contractItems.length > 0 ? (
              <div className="max-h-48 overflow-y-auto">
                <table className="min-w-full divide-y divide-slate-100 text-sm">
                  <thead className="bg-slate-50 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500">Номенклатура</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-slate-500">Кол-во</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500">Статус</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {contractItems.map((row, idx) => (
                      <tr key={idx} className="hover:bg-slate-50">
                        <td className="px-3 py-2 text-dark-DEFAULT">{String(getRowVal(row, 'номенклатура'))}</td>
                        <td className="px-3 py-2 text-right">{getRowVal(row, 'количество')}</td>
                        <td className="px-3 py-2 text-slate-600">{String(getRowVal(row, 'статус'))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="px-4 py-6 text-center text-sm text-slate-500">Нет записей в листе «Договор» по этому врачу</p>
            )}
          </div>

          {/* Соответствие договору: выписал ли врач то, что договорились */}
          {contractVsRecipe.length > 0 && (
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-4 py-3 bg-slate-100 border-b border-slate-200 flex items-center gap-2">
                <CheckCircle size={16} className="text-slate-600" />
                <h3 className="font-semibold text-sm text-dark-DEFAULT">Соответствие договору</h3>
                <span className="text-xs text-slate-500">Врач пишет ли то, что с ним договорился МП</span>
              </div>
              <div className="overflow-x-auto max-h-56 overflow-y-auto">
                <table className="min-w-full divide-y divide-slate-100 text-sm">
                  <thead className="bg-slate-50 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500">Договорились (номенклатура)</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-slate-500">Кол-во по договору</th>
                      <th className="px-3 py-2 text-center text-xs font-semibold text-slate-500">Выписал</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-slate-500">Кол-во в рецептах</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-slate-500">Сумма в рецептах</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {contractVsRecipe.map((row, idx) => (
                      <tr
                        key={idx}
                        className={row.hasPrescribed ? 'hover:bg-slate-50' : 'bg-red-50/50 hover:bg-red-50'}
                      >
                        <td className="px-3 py-2 text-dark-DEFAULT">{row.contractNomenclature}</td>
                        <td className="px-3 py-2 text-right">{row.contractQty}</td>
                        <td className="px-3 py-2 text-center">
                          {row.hasPrescribed ? (
                            <CheckCircle size={18} className="text-emerald-600 inline" title="Выписал" />
                          ) : (
                            <XCircle size={18} className="text-red-500 inline" title="Не выписал" />
                          )}
                        </td>
                        <td className="px-3 py-2 text-right">{row.recipeQty ?? '—'}</td>
                        <td className="px-3 py-2 text-right">
                          {row.recipeSum != null ? new Intl.NumberFormat('ru-RU').format(row.recipeSum) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Рецепты — что врач по факту выписал */}
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3 bg-emerald-50 border-b border-emerald-100 flex items-center gap-2">
              <ClipboardList size={16} className="text-emerald-600" />
              <h3 className="font-semibold text-sm text-dark-DEFAULT">Рецепты (факт выписки)</h3>
              {filteredRecipes.length > 0 && (
                <span className="text-xs text-slate-500 ml-auto">
                  Сумма: {new Intl.NumberFormat('ru-RU').format(recipeSum)}
                </span>
              )}
            </div>
            {filteredRecipes.length > 0 ? (
              <div className="max-h-48 overflow-y-auto">
                <table className="min-w-full divide-y divide-slate-100 text-sm">
                  <thead className="bg-slate-50 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500">Номенклатура</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-slate-500">Кол-во</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-slate-500">Сумма</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500">Дата</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {filteredRecipes.map((row, idx) => (
                      <tr key={idx} className="hover:bg-slate-50">
                        <td className="px-3 py-2 text-dark-DEFAULT">{String(getRowVal(row, 'номенклатура'))}</td>
                        <td className="px-3 py-2 text-right">{getRowVal(row, 'количество')}</td>
                        <td className="px-3 py-2 text-right">{getRowVal(row, 'сумма')}</td>
                        <td className="px-3 py-2 text-slate-600">{String(getRowVal(row, 'дата', 'отгрузк'))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="px-4 py-6 text-center text-sm text-slate-500">Нет записей в листе «Рецепт» по этому врачу</p>
            )}
          </div>

        </div>
      </div>
    </div>
  );
};