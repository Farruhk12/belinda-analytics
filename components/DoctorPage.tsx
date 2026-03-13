import React, { useState, useMemo } from 'react';
import { DoctorInteraction, MonthlyInteraction, GenericRow } from '../types';
import {
  ArrowLeft, Calendar, Stethoscope, Banknote,
  Building2, User, FileSignature, ClipboardList, CheckCircle, XCircle,
  Sparkles, RefreshCw, ChevronUp, Send,
} from 'lucide-react';
import { getContractVsRecipeMatchWithMonths, rowMatchesPeriod, getMonthKey } from '../services/dataService';
import { getDoctorAIAnalysis, askDoctorCustomQuestion } from '../services/aiAnalysisService';
import { AIAnalysisOutput } from './AIAnalysisOutput';
import { AIProviderSelector } from './AIProviderSelector';

const getRowVal = (row: GenericRow, ...patterns: string[]): string | number => {
  const k = Object.keys(row).find(key => patterns.some(p => key.toLowerCase().includes(p)));
  return k != null ? row[k] : '';
};

interface Props {
  doctor: DoctorInteraction;
  employeeName: string;
  onBack: () => void;
  contractItems?: GenericRow[];
  recipeItems?: GenericRow[];
  selectedPeriod?: string;
  availableMonths?: string[];
}

const isMonthInQuarter = (monthKey: string, quarterKey: string): boolean => {
  const [qYear, qPart] = quarterKey.split('-Q');
  const [mYear, mMonth] = monthKey.split('-');
  if (qYear !== mYear) return false;
  const monthNum = parseInt(mMonth, 10);
  const qNum = parseInt(qPart, 10);
  return monthNum >= (qNum - 1) * 3 + 1 && monthNum <= qNum * 3;
};

const matchesPeriod = (month: string, period: string): boolean => {
  if (period === 'All') return true;
  if (period.includes('-Q')) return isMonthInQuarter(month, period);
  return month === period;
};

export const DoctorPage: React.FC<Props> = ({
  doctor, employeeName, onBack,
  contractItems = [], recipeItems = [], selectedPeriod: initialPeriod = 'All',
  availableMonths: availableMonthsProp = [],
}) => {
  const PERIOD_STORAGE_KEY = 'belinda-selected-period';
  const [selectedPeriod, setSelectedPeriod] = useState(() => {
    try { return localStorage.getItem(PERIOD_STORAGE_KEY) || initialPeriod; } catch { return initialPeriod; }
  });
  const handlePeriodChange = (period: string) => {
    setSelectedPeriod(period);
    try { localStorage.setItem(PERIOD_STORAGE_KEY, period); } catch { /* noop */ }
  };
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiVisible, setAiVisible] = useState(true);
  const [customQuestion, setCustomQuestion] = useState('');
  const [customQuestionLoading, setCustomQuestionLoading] = useState(false);
  const [customQuestionResult, setCustomQuestionResult] = useState<string | null>(null);
  const [customQuestionError, setCustomQuestionError] = useState<string | null>(null);

  const availableMonths = useMemo(() => {
    if (availableMonthsProp.length > 0) return availableMonthsProp.filter(m => !m.includes('-Q'));
    const fromHistory = Object.keys(doctor.history).sort();
    const fromRecipes = new Set<string>();
    recipeItems.forEach(row => {
      const m = getMonthKey(row);
      if (m) fromRecipes.add(m);
    });
    return [...new Set([...fromHistory, ...fromRecipes])].sort((a, b) => a.localeCompare(b));
  }, [doctor.history, recipeItems, availableMonthsProp]);

  const MONTH_SHORT = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];
  const formatMonthOption = (m: string) => {
    const [y, mo] = m.split('-');
    return `${MONTH_SHORT[parseInt(mo, 10) - 1] ?? mo} ${y}`;
  };

  const historyData = useMemo(() =>
    Object.entries(doctor.history)
      .map(([month, stats]) => {
        const s = stats as MonthlyInteraction;
        return { month, visits: s.visits, bonuses: s.bonuses };
      })
      .filter(h => matchesPeriod(h.month, selectedPeriod))
      .sort((a, b) => b.month.localeCompare(a.month)),
    [doctor, selectedPeriod]
  );

  const totalVisits = historyData.reduce((s, h) => s + h.visits, 0);
  const totalBonuses = historyData.reduce((s, h) => s + h.bonuses, 0);

  const filteredRecipes = useMemo(() => {
    if (selectedPeriod === 'All') return recipeItems;
    return recipeItems.filter(row => rowMatchesPeriod(row, selectedPeriod));
  }, [recipeItems, selectedPeriod]);

  const normalizeNom = (s: string) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
  const contractNorms = useMemo(() => {
    const set = new Set<string>();
    contractItems.forEach(row => {
      const nom = String(getRowVal(row, 'номенклатура') || '').trim();
      if (nom) set.add(normalizeNom(nom));
    });
    return set;
  }, [contractItems]);

  const sortedRecipesWithContractFlag = useMemo(() => {
    const checkInContract = (recipeNom: string): boolean => {
      const norm = normalizeNom(recipeNom);
      if (!norm) return false;
      if (contractNorms.has(norm)) return true;
      for (const cn of contractNorms) {
        if (norm.includes(cn) || cn.includes(norm)) return true;
      }
      return false;
    };
    const withFlag = filteredRecipes.map(row => {
      const nom = String(getRowVal(row, 'номенклатура') || '');
      return { row, inContract: checkInContract(nom) };
    });
    return withFlag.sort((a, b) => (a.inContract === b.inContract ? 0 : a.inContract ? -1 : 1));
  }, [filteredRecipes, contractNorms]);

  const recipeSum = filteredRecipes.reduce((s, r) => s + (Number(getRowVal(r, 'сумма')) || 0), 0);
  const contractVsRecipe = useMemo(
    () => getContractVsRecipeMatchWithMonths(contractItems, filteredRecipes, selectedPeriod),
    [contractItems, filteredRecipes, selectedPeriod]
  );

  const monthsToShow = selectedPeriod && selectedPeriod !== 'All' && !selectedPeriod.includes('-Q')
    ? [selectedPeriod]
    : null;
  const monthLabels: Record<string, string> = {
    '01': 'Январь', '02': 'Февраль', '03': 'Март', '04': 'Апрель', '05': 'Май', '06': 'Июнь',
    '07': 'Июль', '08': 'Август', '09': 'Сентябрь', '10': 'Октябрь', '11': 'Ноябрь', '12': 'Декабрь',
  };
  const monthShort: Record<string, string> = {
    '01': 'Янв', '02': 'Фев', '03': 'Мар', '04': 'Апр', '05': 'Май', '06': 'Июн',
    '07': 'Июл', '08': 'Авг', '09': 'Сен', '10': 'Окт', '11': 'Ноя', '12': 'Дек',
  };

  const fmt = (n: number) => new Intl.NumberFormat('ru-RU').format(n);

  const formatMonthsPrescribed = (byMonth?: Record<string, { hasPrescribed: boolean }>) => {
    if (!byMonth) return null;
    const prescribed = Object.entries(byMonth)
      .filter(([, d]) => d.hasPrescribed)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([m]) => {
        const [, mo] = m.split('-');
        return `${monthShort[mo] ?? mo} ${m.split('-')[0].slice(2)}`;
      });
    return prescribed.length > 0 ? prescribed.join(', ') : null;
  };

  const doctorAIContext = useMemo(() => ({
    doctor,
    employeeName,
    selectedPeriod,
    contractItems,
    recipeItems,
    filteredRecipes,
    contractVsRecipe: contractVsRecipe.map(r => ({
      contractNomenclature: r.contractNomenclature,
      contractQty: r.contractQty,
      hasPrescribed: r.hasPrescribed,
      recipeQty: r.recipeQty,
      recipeSum: r.recipeSum,
    })),
    historyData,
    totalVisits,
    totalBonuses,
    recipeSum,
  }), [doctor, employeeName, selectedPeriod, contractItems, recipeItems, filteredRecipes, contractVsRecipe, historyData, totalVisits, totalBonuses, recipeSum]);

  const runAIAnalysis = async () => {
    setAiLoading(true);
    setAiError(null);
    setAiVisible(true);
    try {
      setAiResult(await getDoctorAIAnalysis(doctorAIContext));
    } catch (e) {
      setAiError(e instanceof Error ? e.message : 'Неизвестная ошибка');
    } finally {
      setAiLoading(false);
    }
  };

  const runCustomQuestion = async () => {
    if (!customQuestion.trim()) return;
    setCustomQuestionLoading(true);
    setCustomQuestionError(null);
    setCustomQuestionResult(null);
    try {
      setCustomQuestionResult(await askDoctorCustomQuestion(doctorAIContext, customQuestion.trim()));
    } catch (e) {
      setCustomQuestionError(e instanceof Error ? e.message : 'Неизвестная ошибка');
    } finally {
      setCustomQuestionLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-3">
        <div className="flex flex-wrap items-center gap-4">
          <button
            onClick={onBack}
            className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-dark-DEFAULT transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold text-dark-DEFAULT">{doctor.doctorName}</h2>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {doctor.specialty && (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 bg-slate-100 px-2.5 py-0.5 rounded-full">
                  <User size={11} />{doctor.specialty}
                </span>
              )}
              {doctor.institution && (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 bg-slate-100 px-2.5 py-0.5 rounded-full">
                  <Building2 size={11} />{doctor.institution}
                </span>
              )}
              <span className="text-xs text-slate-400">МП: {employeeName}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <Calendar size={18} className="text-primary-500" />
            <select
              value={selectedPeriod}
              onChange={e => handlePeriodChange(e.target.value)}
              className="pl-2 pr-8 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-primary-500 focus:outline-none font-medium text-dark-DEFAULT cursor-pointer"
            >
              <option value="All">За всё время</option>
              {availableMonths.map(m => (
                <option key={m} value={m}>{formatMonthOption(m)}</option>
              ))}
            </select>
            <AIProviderSelector className="shrink-0" />
            <button
              onClick={runAIAnalysis}
              disabled={aiLoading}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-violet-500 to-purple-600 text-white rounded-lg text-sm font-medium hover:from-violet-600 hover:to-purple-700 transition-all disabled:opacity-60 disabled:cursor-not-allowed shadow-sm"
            >
              {aiLoading ? <RefreshCw size={16} className="animate-spin" /> : <Sparkles size={16} />}
              {aiLoading ? 'Анализ...' : 'AI-анализ'}
            </button>
          </div>
        </div>
      </div>

      {aiLoading && (
        <div className="bg-gradient-to-r from-violet-50 to-purple-50 rounded-xl border border-violet-200 p-6 flex items-center justify-center gap-3">
          <div className="animate-spin rounded-full h-6 w-6 border-2 border-violet-300 border-t-violet-600" />
          <p className="text-violet-700 font-medium">Анализирую данные врача...</p>
        </div>
      )}
      {aiError && !aiLoading && (
        <div className="bg-red-50 rounded-xl border border-red-200 p-4 flex items-center justify-between">
          <p className="text-red-700 text-sm">{aiError}</p>
          <button
            onClick={runAIAnalysis}
            className="flex items-center gap-1 px-3 py-1.5 bg-red-100 text-red-700 rounded-lg text-sm font-medium hover:bg-red-200 transition-colors"
          >
            <RefreshCw size={12} />
            Повторить
          </button>
        </div>
      )}
      {aiResult && !aiLoading && aiVisible && (
        <div className="bg-gradient-to-br from-white to-violet-50/30 rounded-xl border border-violet-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-violet-100 flex items-center justify-between bg-gradient-to-r from-violet-50 to-purple-50">
            <div className="flex items-center gap-2">
              <Sparkles size={18} className="text-violet-600" />
              <h3 className="font-bold text-dark-DEFAULT">AI-анализ врача</h3>
            </div>
            <button
              onClick={() => setAiVisible(false)}
              className="flex items-center gap-1 px-2.5 py-1 text-sm text-violet-600 hover:bg-violet-100 rounded-lg transition-colors"
            >
              <ChevronUp size={14} />
              Скрыть
            </button>
          </div>
          <div className="p-5">
            <AIAnalysisOutput text={aiResult} copyable />
          </div>
        </div>
      )}
      {aiResult && !aiLoading && !aiVisible && (
        <button
          onClick={() => setAiVisible(true)}
          className="w-full flex items-center justify-center gap-2 py-2 text-sm text-violet-600 bg-violet-50 rounded-xl border border-violet-200 hover:bg-violet-100 transition-colors"
        >
          <Sparkles size={14} />
          Показать AI-анализ
        </button>
      )}
      <div className="bg-gradient-to-br from-white to-violet-50/30 rounded-xl border border-violet-200 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-violet-100 bg-gradient-to-r from-violet-50 to-purple-50">
          <div className="flex items-center gap-2">
            <Send size={18} className="text-violet-600" />
            <h3 className="font-bold text-dark-DEFAULT">Задать вопрос по данным врача</h3>
          </div>
        </div>
        <div className="p-5 space-y-3">
          <div className="space-y-2">
            <textarea
              value={customQuestion}
              onChange={e => setCustomQuestion(e.target.value)}
              placeholder="Например: В какие месяцы врач выписывает больше всего? Или: Какие продукты из договора требуют внимания?"
              rows={3}
              className="w-full px-4 py-3 border border-slate-200 rounded-lg text-sm placeholder:text-slate-300 focus:ring-2 focus:ring-violet-500 focus:border-violet-500 resize-none bg-white"
              disabled={customQuestionLoading}
            />
            <div className="flex justify-end">
              <button
                onClick={runCustomQuestion}
                disabled={customQuestionLoading || !customQuestion.trim()}
                className="flex items-center gap-2 px-5 py-2 bg-gradient-to-r from-violet-500 to-purple-600 text-white rounded-lg text-sm font-medium hover:from-violet-600 hover:to-purple-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {customQuestionLoading ? <RefreshCw size={14} className="animate-spin" /> : <Send size={14} />}
                {customQuestionLoading ? 'Анализ...' : 'Спросить'}
              </button>
            </div>
          </div>
          {customQuestionError && !customQuestionLoading && (
            <div className="bg-red-50 rounded-lg border border-red-200 p-3 flex items-center justify-between">
              <p className="text-red-700 text-sm">{customQuestionError}</p>
              <button
                onClick={runCustomQuestion}
                className="flex items-center gap-1 px-2.5 py-1 bg-red-100 text-red-700 rounded-lg text-sm font-medium hover:bg-red-200 transition-colors"
              >
                <RefreshCw size={12} />
                Повторить
              </button>
            </div>
          )}
          {customQuestionLoading && (
            <div className="flex items-center gap-3 py-2">
              <div className="animate-spin rounded-full h-5 w-5 border-2 border-violet-300 border-t-violet-600" />
              <p className="text-violet-700 text-sm font-medium">Ищу ответ...</p>
            </div>
          )}
          {customQuestionResult && !customQuestionLoading && (
            <div className="pt-2 border-t border-violet-100">
              <AIAnalysisOutput text={customQuestionResult} copyable />
            </div>
          )}
        </div>
      </div>

      {/* Key metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-blue-50 shrink-0"><Stethoscope size={20} className="text-blue-600" /></div>
          <div>
            <p className="text-2xl font-bold text-dark-DEFAULT">{totalVisits}</p>
            <p className="text-xs text-slate-500">Визиты</p>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-amber-50 shrink-0"><FileSignature size={20} className="text-amber-600" /></div>
          <div>
            <p className="text-2xl font-bold text-dark-DEFAULT">{contractItems.length}</p>
            <p className="text-xs text-slate-500">Позиций в договоре</p>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-emerald-50 shrink-0"><ClipboardList size={20} className="text-emerald-600" /></div>
          <div>
            <p className="text-2xl font-bold text-dark-DEFAULT">{filteredRecipes.length}</p>
            <p className="text-xs text-slate-500">Рецептов выписано</p>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-red-50 shrink-0"><Banknote size={20} className="text-primary-500" /></div>
          <div>
            <p className="text-2xl font-bold text-primary-500">{fmt(totalBonuses)}</p>
            <p className="text-xs text-slate-500">Бонусы</p>
          </div>
        </div>
      </div>

      {/* History + Contract */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Monthly history */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
            <Calendar size={16} className="text-slate-500" />
            <h3 className="font-semibold text-sm text-dark-DEFAULT">Детализация по месяцам</h3>
          </div>
          <table className="min-w-full divide-y divide-slate-100">
            <thead className="bg-white">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Месяц</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase">Визиты</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase">Бонусы</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase">Статус</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {historyData.map(row => (
                <tr key={row.month} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 text-sm font-medium text-dark-DEFAULT">{row.month}</td>
                  <td className="px-4 py-3 text-sm text-right">
                    {row.visits > 0
                      ? <span className="font-bold text-dark-DEFAULT">{row.visits}</span>
                      : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-4 py-3 text-sm text-right">
                    {row.bonuses > 0
                      ? <span className="font-medium text-primary-600">{fmt(row.bonuses)}</span>
                      : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {row.visits > 0 && row.bonuses > 0 && <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500" title="Визит с бонусом" />}
                    {row.visits > 0 && row.bonuses === 0 && <span className="inline-block w-2.5 h-2.5 rounded-full bg-slate-300" title="Визит без бонуса" />}
                    {row.visits === 0 && row.bonuses > 0 && <span className="inline-block w-2.5 h-2.5 rounded-full bg-amber-400" title="Бонус без визита" />}
                  </td>
                </tr>
              ))}
              {historyData.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-sm text-slate-400">
                    Нет данных за выбранный период
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Contract */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-amber-100 bg-amber-50 flex items-center gap-2">
            <FileSignature size={16} className="text-amber-600" />
            <h3 className="font-semibold text-sm text-dark-DEFAULT">Договор (продукты к выписке)</h3>
            <span className="text-xs text-amber-700/70 ml-auto">Годовой план</span>
          </div>
          {contractItems.length > 0 ? (
            <table className="min-w-full divide-y divide-slate-100 text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500">Номенклатура</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-slate-500">Кол-во</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500">Статус</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500">Дата</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {contractItems.map((row, idx) => {
                  const dateRaw = String(getRowVal(row, 'дата') ?? '');
                  const dateFormatted = (() => {
                    if (!dateRaw) return '—';
                    const n = Number(dateRaw);
                    if (!isNaN(n) && n > 1000 && n < 2958466) {
                      const d = new Date((n - 25569) * 86400000);
                      return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
                    }
                    const isoMatch = dateRaw.match(/^(\d{4})-(\d{2})-(\d{2})/);
                    if (isoMatch) return `${isoMatch[3]}.${isoMatch[2]}.${isoMatch[1]}`;
                    // Strip time if present (e.g. "01.10.2025 00:00:00")
                    return dateRaw.replace(/\s+\d{1,2}:\d{2}(:\d{2})?$/, '');
                  })();
                  return (
                    <tr key={idx} className="hover:bg-slate-50">
                      <td className="px-3 py-2 text-dark-DEFAULT">{String(getRowVal(row, 'номенклатура'))}</td>
                      <td className="px-3 py-2 text-right">{getRowVal(row, 'количество')}</td>
                      <td className="px-3 py-2 text-slate-500">{String(getRowVal(row, 'статус'))}</td>
                      <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{dateFormatted}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <p className="px-4 py-6 text-center text-sm text-slate-400">Нет записей в листе «Договор» по этому врачу</p>
          )}
        </div>
      </div>

      {/* Contract compliance */}
      {contractVsRecipe.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
            <CheckCircle size={16} className="text-slate-600" />
            <h3 className="font-semibold text-sm text-dark-DEFAULT">Соответствие договору</h3>
            <span className="text-xs text-slate-400 ml-auto">Выписывает ли врач то, о чём договорился с МП</span>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100 text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Номенклатура (договор)</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500">Кол-во по договору</th>
                  {monthsToShow ? (
                    monthsToShow.map(m => (
                      <th key={m} className="px-3 py-3 text-center text-xs font-semibold text-slate-500 whitespace-nowrap">
                        {monthLabels[m.split('-')[1]] ?? m}
                      </th>
                    ))
                  ) : (
                    <>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">По месяцам</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500">Кол-во рецептов</th>
                    </>
                  )}
                  {monthsToShow && (
                    <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500">Итого</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {contractVsRecipe.map((row, idx) => (
                  <tr key={idx} className={row.hasPrescribed ? 'hover:bg-slate-50' : 'bg-red-50/50 hover:bg-red-50'}>
                    <td className="px-4 py-3 text-dark-DEFAULT">{row.contractNomenclature}</td>
                    <td className="px-4 py-3 text-right">{row.contractQty}</td>
                    {monthsToShow && row.byMonth ? (
                      <>
                        {monthsToShow.map(m => {
                          const d = row.byMonth![m];
                          return (
                            <td key={m} className="px-3 py-3 text-center">
                              {d.hasPrescribed ? (
                                <span className="inline-flex flex-col items-center gap-0.5">
                                  <CheckCircle size={13} className="text-emerald-600" />
                                  <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-1.5 rounded leading-tight">{d.recipeQty}</span>
                                </span>
                              ) : (
                                <XCircle size={15} className="text-red-400 inline" title="Не выписал" />
                              )}
                            </td>
                          );
                        })}
                        <td className="px-4 py-3 text-right font-medium">{row.recipeQty ?? '—'}</td>
                      </>
                    ) : (
                      <>
                        <td className="px-4 py-3">
                          {row.byMonth && Object.keys(row.byMonth).length > 0 ? (
                            <div className="flex flex-wrap gap-1.5">
                              {Object.entries(row.byMonth)
                                .sort(([a], [b]) => a.localeCompare(b))
                                .map(([monthKey, d]) => {
                                  const md = d as { hasPrescribed: boolean; recipeQty: number; recipeSum: number };
                                  const [y, mo] = monthKey.split('-');
                                  const label = `${monthShort[mo] ?? mo} ${y.slice(2)}`;
                                  return md.hasPrescribed ? (
                                    <span key={monthKey} className="inline-flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs px-2 py-1 rounded-lg font-medium">
                                      <CheckCircle size={11} className="shrink-0" />
                                      <span>{label}</span>
                                      <span className="font-bold bg-emerald-200 text-emerald-800 px-1 rounded">{md.recipeQty}</span>
                                    </span>
                                  ) : (
                                    <span key={monthKey} className="inline-flex items-center gap-1 bg-slate-50 border border-slate-200 text-slate-400 text-xs px-2 py-1 rounded-lg">
                                      <XCircle size={11} className="shrink-0" />
                                      <span>{label}</span>
                                    </span>
                                  );
                                })}
                            </div>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-red-500">
                              <XCircle size={15} className="shrink-0" />
                              <span className="text-xs text-slate-400">Не выписал</span>
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right font-medium">{row.recipeQty ?? '—'}</td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Recipes */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-emerald-100 bg-emerald-50 flex items-center gap-2">
          <ClipboardList size={16} className="text-emerald-600" />
          <h3 className="font-semibold text-sm text-dark-DEFAULT">Рецепты (факт выписки)</h3>
          {filteredRecipes.length > 0 && (
            <span className="text-xs text-slate-500 ml-auto">Итого: {fmt(recipeSum)}</span>
          )}
        </div>
        {filteredRecipes.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100 text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">По договору</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Номенклатура</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500">Кол-во</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500">Сумма</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Дата</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {sortedRecipesWithContractFlag.map(({ row, inContract }, idx) => (
                  <tr key={idx} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${inContract ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                        {inContract ? 'Да' : 'Нет'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-dark-DEFAULT">{String(getRowVal(row, 'номенклатура'))}</td>
                    <td className="px-4 py-3 text-right">{getRowVal(row, 'количество')}</td>
                    <td className="px-4 py-3 text-right font-medium">{getRowVal(row, 'сумма')}</td>
                    <td className="px-4 py-3 text-slate-500">{String(getRowVal(row, 'дата', 'отгрузк'))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="px-4 py-6 text-center text-sm text-slate-400">Нет рецептов за выбранный период</p>
        )}
      </div>

    </div>
  );
};
