import React, { useState, useMemo, useRef, useEffect } from 'react';
import { EmployeeSummary, GenericRow, DoctorInteraction, MonthlyInteraction } from '../types';
import {
  ArrowLeft, Stethoscope, FileSignature, Banknote, ClipboardList,
  Calendar, CheckCircle, FileX, Sparkles, RefreshCw, ChevronUp, Send,
  AlertTriangle, TrendingDown, AlertCircle, ChevronDown, X,
} from 'lucide-react';
import {
  getValueByMatchers,
  normalizeLinkKey,
  getAvailableMonths,
  rowMatchesPeriodFilter,
  getContractVsRecipeMatch,
} from '../services/dataService';
import { COLUMN_MATCHERS } from '../constants';
import { AIAnalysisOutput } from './AIAnalysisOutput';
import { AIProviderSelector } from './AIProviderSelector';
import { getEmployeeAIAnalysis, askCustomQuestion } from '../services/aiAnalysisService';

interface Props {
  employee: EmployeeSummary;
  onBack: () => void;
  onOpenDataTable?: (type: 'visits' | 'contracts' | 'bonused' | 'recipes', selectedPeriod: string) => void;
  onOpenCoveragePage?: () => void;
  onOpenDoctorPage?: (
    doctor: DoctorInteraction,
    contractItems: GenericRow[],
    recipeItems: GenericRow[],
    selectedPeriod: string
  ) => void;
  visitsData?: GenericRow[];
  bonusesData?: GenericRow[];
  contractsData?: GenericRow[];
  recipesData?: GenericRow[];
  availableMonths?: string[];
}

// ── Month multi-select dropdown ───────────────────────────────────────────────

const MONTH_LABELS: Record<string, string> = {
  '01': 'Янв', '02': 'Фев', '03': 'Мар', '04': 'Апр',
  '05': 'Май', '06': 'Июн', '07': 'Июл', '08': 'Авг',
  '09': 'Сен', '10': 'Окт', '11': 'Ноя', '12': 'Дек',
};

function formatMonthKey(key: string): string {
  const [y, m] = key.split('-');
  return `${MONTH_LABELS[m] ?? m} ${y}`;
}

interface MonthPickerProps {
  months: string[]; // sorted desc YYYY-MM
  selected: string[];
  onChange: (v: string[]) => void;
}

const MonthPicker: React.FC<MonthPickerProps> = ({ months, selected, onChange }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const toggle = (m: string) => {
    onChange(selected.includes(m) ? selected.filter(s => s !== m) : [...selected, m]);
  };

  const label = selected.length === 0
    ? 'За всё время'
    : selected.length === 1
    ? formatMonthKey(selected[0])
    : `${selected.length} месяцев`;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className={`flex items-center gap-1.5 pl-2 pr-2 py-1.5 rounded-lg border text-xs transition-colors ${
          selected.length > 0
            ? 'border-primary-300 bg-primary-50 text-primary-700'
            : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
        }`}
      >
        <Calendar size={13} className="text-slate-400 shrink-0" />
        <span className="font-medium">{label}</span>
        {selected.length > 0 && (
          <span
            role="button"
            onClick={e => { e.stopPropagation(); onChange([]); }}
            className="w-3.5 h-3.5 rounded-full bg-primary-200 hover:bg-primary-300 flex items-center justify-center shrink-0"
          >
            <X size={8} className="text-primary-700" />
          </span>
        )}
        <ChevronDown size={12} className={`text-slate-400 transition-transform shrink-0 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute z-30 top-full mt-1 right-0 w-48 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
          {/* All */}
          <label className="flex items-center gap-2.5 px-3 py-2 hover:bg-slate-50 cursor-pointer border-b border-slate-100">
            <input
              type="checkbox"
              checked={selected.length === 0}
              onChange={() => onChange([])}
              className="accent-primary-600 shrink-0"
            />
            <span className="text-sm text-slate-700 font-medium">За всё время</span>
          </label>
          <div className="max-h-64 overflow-y-auto">
            {months.map(m => (
              <label key={m} className="flex items-center gap-2.5 px-3 py-2 hover:bg-slate-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selected.includes(m)}
                  onChange={() => toggle(m)}
                  className="accent-primary-600 shrink-0"
                />
                <span className="text-sm text-slate-700">{formatMonthKey(m)}</span>
              </label>
            ))}
          </div>
          {selected.length > 0 && (
            <div className="border-t border-slate-100 p-2">
              <button
                onClick={() => { onChange([]); setOpen(false); }}
                className="w-full text-xs text-slate-500 hover:text-slate-700 py-1"
              >
                Снять все ({selected.length})
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ── Main component ────────────────────────────────────────────────────────────

export const EmployeeDetail: React.FC<Props> = ({
  employee,
  onBack,
  onOpenDataTable,
  onOpenCoveragePage,
  onOpenDoctorPage,
  visitsData = [],
  bonusesData = [],
  contractsData = [],
  recipesData = [],
  availableMonths: availableMonthsProp = [],
}) => {
  const PERIOD_STORAGE_KEY = 'belinda-selected-periods-v2';
  const [selectedPeriods, setSelectedPeriods] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(PERIOD_STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  });

  const handlePeriodsChange = (periods: string[]) => {
    setSelectedPeriods(periods);
    try { localStorage.setItem(PERIOD_STORAGE_KEY, JSON.stringify(periods)); } catch { /* noop */ }
  };

  const [aiLoading, setAiLoading] = useState(false);
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [aiResult, setAiResult] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiVisible, setAiVisible] = useState(true);
  const [customQuestion, setCustomQuestion] = useState('');
  const [customQuestionLoading, setCustomQuestionLoading] = useState(false);
  const [customQuestionResult, setCustomQuestionResult] = useState<string | null>(null);
  const [customQuestionError, setCustomQuestionError] = useState<string | null>(null);

  // For backward compat with AI and openDataTable (expects single string)
  const selectedPeriodLegacy = selectedPeriods.length === 0 ? 'All' : selectedPeriods[0];
  // Filter used for rowMatchesPeriodFilter
  const periodsFilter = selectedPeriods.length === 0 ? 'All' : selectedPeriods;

  const runAIAnalysis = async () => {
    setAiLoading(true);
    setAiError(null);
    setAiVisible(true);
    try {
      setAiResult(await getEmployeeAIAnalysis(employee, selectedPeriodLegacy));
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
      setCustomQuestionResult(await askCustomQuestion(employee, customQuestion.trim(), selectedPeriodLegacy));
    } catch (e) {
      setCustomQuestionError(e instanceof Error ? e.message : 'Неизвестная ошибка');
    } finally {
      setCustomQuestionLoading(false);
    }
  };

  const mpKey = normalizeLinkKey(employee.name);
  const regionKey = normalizeLinkKey(employee.region || '');
  const groupKey = normalizeLinkKey(employee.group || '');

  const contractsForEmployee = useMemo(() => {
    const idx = new Map<string, GenericRow[]>();
    contractsData.forEach(row => {
      if (normalizeLinkKey(getValueByMatchers(row, COLUMN_MATCHERS.EMPLOYEE)) !== mpKey) return;
      const docKey = normalizeLinkKey(getValueByMatchers(row, COLUMN_MATCHERS.DOCTOR));
      if (!docKey) return;
      if (!idx.has(docKey)) idx.set(docKey, []);
      idx.get(docKey)!.push(row);
    });
    return idx;
  }, [contractsData, mpKey]);

  const recipesByDocForGroup = useMemo(() => {
    const idx = new Map<string, GenericRow[]>();
    recipesData.forEach(row => {
      const rowGroup = normalizeLinkKey(getValueByMatchers(row, COLUMN_MATCHERS.GROUP));
      const rowEmp = normalizeLinkKey(getValueByMatchers(row, COLUMN_MATCHERS.EMPLOYEE));
      const byGroup = groupKey && rowGroup === groupKey;
      const byEmp = rowEmp === mpKey;
      if (!byGroup && !byEmp) return;
      const docKey = normalizeLinkKey(getValueByMatchers(row, COLUMN_MATCHERS.DOCTOR));
      if (!docKey) return;
      if (!idx.has(docKey)) idx.set(docKey, []);
      idx.get(docKey)!.push(row);
    });
    return idx;
  }, [recipesData, groupKey, mpKey]);

  const bonusAmountFromRow = (row: GenericRow): number => {
    const key = Object.keys(row).find(k =>
      COLUMN_MATCHERS.BONUS_AMOUNT.some(m => k.toLowerCase().includes(m))
    );
    if (!key) return 0;
    const v = row[key];
    if (typeof v === 'number') return v;
    return parseFloat(String(v || '').replace(/\s/g, '').replace(',', '.')) || 0;
  };

  const employeeVisits = useMemo(
    () => visitsData.filter(r => normalizeLinkKey(getValueByMatchers(r, COLUMN_MATCHERS.EMPLOYEE)) === mpKey),
    [visitsData, mpKey]
  );
  const employeeBonuses = useMemo(
    () => bonusesData.filter(r => normalizeLinkKey(getValueByMatchers(r, COLUMN_MATCHERS.EMPLOYEE)) === mpKey),
    [bonusesData, mpKey]
  );
  const employeeContracts = useMemo(
    () => contractsData.filter(r => normalizeLinkKey(getValueByMatchers(r, COLUMN_MATCHERS.EMPLOYEE)) === mpKey),
    [contractsData, mpKey]
  );
  const employeeRecipes = useMemo(
    () => recipesData.filter(r => normalizeLinkKey(getValueByMatchers(r, COLUMN_MATCHERS.GROUP)) === groupKey),
    [recipesData, groupKey]
  );

  const availableMonths = useMemo(() => {
    const from = getAvailableMonths(employeeVisits, employeeBonuses, employeeRecipes, employeeContracts);
    // pure months only, sorted descending (newest first)
    return (from.length > 0 ? from : availableMonthsProp)
      .filter(m => !m.includes('-Q'))
      .sort((a, b) => a.localeCompare(b));
  }, [employeeVisits, employeeBonuses, employeeRecipes, employeeContracts, availableMonthsProp]);

  const periodFilteredVisits = useMemo(() =>
    visitsData.filter(row =>
      normalizeLinkKey(getValueByMatchers(row, COLUMN_MATCHERS.EMPLOYEE)) === mpKey &&
      rowMatchesPeriodFilter(row, periodsFilter)
    ),
    [visitsData, mpKey, periodsFilter]
  );

  const allContractsForEmployee = useMemo(() =>
    contractsData.filter(row =>
      normalizeLinkKey(getValueByMatchers(row, COLUMN_MATCHERS.EMPLOYEE)) === mpKey
    ),
    [contractsData, mpKey]
  );

  const contractsTotalCount = useMemo(() => {
    const docs = new Set<string>();
    allContractsForEmployee.forEach(r => {
      const doc = getValueByMatchers(r, COLUMN_MATCHERS.DOCTOR);
      if (doc) docs.add(normalizeLinkKey(doc));
    });
    return docs.size;
  }, [allContractsForEmployee]);

  const newContractsInPeriod = useMemo(() => {
    if (selectedPeriods.length === 0) return 0;
    const docs = new Set<string>();
    allContractsForEmployee.forEach(r => {
      if (!rowMatchesPeriodFilter(r, periodsFilter)) return;
      const doc = getValueByMatchers(r, COLUMN_MATCHERS.DOCTOR);
      if (doc) docs.add(normalizeLinkKey(doc));
    });
    return docs.size;
  }, [allContractsForEmployee, periodsFilter, selectedPeriods.length]);

  const periodFilteredBonusedRows = useMemo(() =>
    bonusesData.filter(row =>
      normalizeLinkKey(getValueByMatchers(row, COLUMN_MATCHERS.EMPLOYEE)) === mpKey &&
      bonusAmountFromRow(row) > 0 &&
      rowMatchesPeriodFilter(row, periodsFilter)
    ),
    [bonusesData, mpKey, periodsFilter]
  );

  const periodFilteredBonused = useMemo(() => {
    const docs = new Set<string>();
    periodFilteredBonusedRows.forEach(r => {
      const doc = getValueByMatchers(r, COLUMN_MATCHERS.DOCTOR);
      if (doc) docs.add(normalizeLinkKey(doc));
    });
    return docs.size;
  }, [periodFilteredBonusedRows]);

  const periodFilteredRecipes = useMemo(() =>
    recipesData.filter(row => {
      const rowGroup = normalizeLinkKey(getValueByMatchers(row, COLUMN_MATCHERS.GROUP));
      const rowEmp = normalizeLinkKey(getValueByMatchers(row, COLUMN_MATCHERS.EMPLOYEE));
      const byGroup = groupKey && rowGroup === groupKey;
      const byEmp = rowEmp === mpKey;
      if (!byGroup && !byEmp) return false;
      return rowMatchesPeriodFilter(row, periodsFilter);
    }),
    [recipesData, groupKey, mpKey, periodsFilter]
  );

  const doctorsWithRecipeGroup = useMemo(() => {
    const docs = new Set<string>();
    periodFilteredRecipes.forEach(row => {
      const doc = getValueByMatchers(row, COLUMN_MATCHERS.DOCTOR);
      if (doc) docs.add(normalizeLinkKey(doc));
    });
    return docs.size;
  }, [periodFilteredRecipes]);

  const contractsDisplayValue = useMemo(() => {
    if (selectedPeriods.length === 0 || newContractsInPeriod === 0) return String(contractsTotalCount);
    return `${contractsTotalCount} (${newContractsInPeriod} новых)`;
  }, [contractsTotalCount, newContractsInPeriod, selectedPeriods.length]);

  const isManager = employee.role === 'Менеджер';

  // Sum visits/bonuses across selected months (or all if none selected)
  const getVisitsInPeriod = (doc: DoctorInteraction): number => {
    if (selectedPeriods.length === 0) {
      return Object.values(doc.history).reduce((sum, h) => sum + h.visits, 0);
    }
    return Object.entries(doc.history)
      .filter(([month]) => selectedPeriods.includes(month))
      .reduce((sum, [, h]) => sum + h.visits, 0);
  };

  const getBonusesInPeriod = (doc: DoctorInteraction): number => {
    if (selectedPeriods.length === 0) {
      return Object.values(doc.history).reduce((sum, h) => sum + ((h as MonthlyInteraction).bonuses ?? 0), 0);
    }
    return Object.entries(doc.history)
      .filter(([month]) => selectedPeriods.includes(month))
      .reduce((sum, [, h]) => sum + ((h as MonthlyInteraction).bonuses ?? 0), 0);
  };

  const periodRecipesByDoc = useMemo(() => {
    const idx = new Map<string, GenericRow[]>();
    recipesData.forEach(row => {
      const rowGroup = normalizeLinkKey(getValueByMatchers(row, COLUMN_MATCHERS.GROUP));
      const rowEmp = normalizeLinkKey(getValueByMatchers(row, COLUMN_MATCHERS.EMPLOYEE));
      const byGroup = groupKey && rowGroup === groupKey;
      const byEmp = rowEmp === mpKey;
      if (!byGroup && !byEmp) return;
      if (!rowMatchesPeriodFilter(row, periodsFilter)) return;
      const docKey = normalizeLinkKey(getValueByMatchers(row, COLUMN_MATCHERS.DOCTOR));
      if (!docKey) return;
      if (!idx.has(docKey)) idx.set(docKey, []);
      idx.get(docKey)!.push(row);
    });
    return idx;
  }, [recipesData, groupKey, mpKey, periodsFilter]);

  const recipesByDocForPeriod = selectedPeriods.length === 0 ? recipesByDocForGroup : periodRecipesByDoc;

  // 1. Полный цикл
  const doctorsFullCycle = useMemo(() => {
    const list: DoctorInteraction[] = [];
    employee.doctors.forEach(doc => {
      const docKey = normalizeLinkKey(doc.doctorName);
      const hasContract = (contractsForEmployee.get(docKey) ?? []).length > 0;
      const hasRecipe = (recipesByDocForPeriod.get(docKey) ?? []).length > 0;
      const hasVisits = getVisitsInPeriod(doc) > 0 || isManager;
      if (hasContract && hasVisits && hasRecipe) list.push(doc);
    });
    return list.sort((a, b) =>
      (getBonusesInPeriod(b) + getVisitsInPeriod(b)) - (getBonusesInPeriod(a) + getVisitsInPeriod(a))
    );
  }, [employee, contractsForEmployee, recipesByDocForPeriod, selectedPeriods, isManager]);

  // 2. Договор без рецептов
  const doctorsContractNoRecipe = useMemo(() => {
    const list: DoctorInteraction[] = [];
    employee.doctors.forEach(doc => {
      const docKey = normalizeLinkKey(doc.doctorName);
      const hasContract = (contractsForEmployee.get(docKey) ?? []).length > 0;
      const hasRecipeInPeriod = (recipesByDocForPeriod.get(docKey) ?? []).length > 0;
      if (hasContract && !hasRecipeInPeriod) list.push(doc);
    });
    return list.sort((a, b) => getVisitsInPeriod(b) - getVisitsInPeriod(a));
  }, [employee, contractsForEmployee, recipesByDocForPeriod, selectedPeriods]);

  // 3. Рецепты не соответствуют договору
  const doctorsRecipeNotMatchContract = useMemo(() => {
    const list: DoctorInteraction[] = [];
    employee.doctors.forEach(doc => {
      const docKey = normalizeLinkKey(doc.doctorName);
      const contractItems = contractsForEmployee.get(docKey) ?? [];
      const recipeItems = recipesByDocForPeriod.get(docKey) ?? [];
      if (contractItems.length === 0 || recipeItems.length === 0) return;
      const match = getContractVsRecipeMatch(contractItems, recipeItems);
      const allMatch = match.length > 0 && match.every(m => m.hasPrescribed);
      if (!allMatch) list.push(doc);
    });
    return list.sort((a, b) => getBonusesInPeriod(b) - getBonusesInPeriod(a));
  }, [employee, contractsForEmployee, recipesByDocForPeriod, selectedPeriods]);

  // 4. Визиты без УВК
  const doctorsVisitsNoBonus = useMemo(() => {
    const list: DoctorInteraction[] = [];
    employee.doctors.forEach(doc => {
      const docKey = normalizeLinkKey(doc.doctorName);
      const hasContract = (contractsForEmployee.get(docKey) ?? []).length > 0;
      const hasVisits = getVisitsInPeriod(doc) > 0;
      const hasBonus = getBonusesInPeriod(doc) > 0;
      if (hasContract && hasVisits && !hasBonus && !isManager) list.push(doc);
    });
    return list.sort((a, b) => getVisitsInPeriod(b) - getVisitsInPeriod(a));
  }, [employee, contractsForEmployee, selectedPeriods, isManager]);

  // 5. УВК без визитов
  const doctorsBonusNoVisits = useMemo(() => {
    const list: DoctorInteraction[] = [];
    employee.doctors.forEach(doc => {
      const hasVisits = getVisitsInPeriod(doc) > 0;
      const hasBonus = getBonusesInPeriod(doc) > 0;
      if (!hasVisits && hasBonus) list.push(doc);
    });
    return list.sort((a, b) => getBonusesInPeriod(b) - getBonusesInPeriod(a));
  }, [employee, selectedPeriods]);

  const openDoctor = (doc: DoctorInteraction) => {
    const docKey = normalizeLinkKey(doc.doctorName);
    onOpenDoctorPage?.(
      doc,
      contractsForEmployee.get(docKey) ?? [],
      recipesByDocForGroup.get(docKey) ?? [],
      selectedPeriodLegacy,
    );
  };

  const metrics = [
    {
      id: 'visits' as const,
      label: isManager ? 'Визиты (менеджер)' : 'Количество визитов',
      value: isManager ? '—' : periodFilteredVisits.length,
      icon: Stethoscope,
      color: 'primary',
    },
    { id: 'contracts' as const, label: 'Количество договоров', value: contractsDisplayValue, icon: FileSignature, color: 'violet' },
    { id: 'bonused' as const, label: 'Врачи с бонусом', value: periodFilteredBonused, icon: Banknote, color: 'emerald' },
    { id: 'recipes' as const, label: 'Врачи с рецептами группы', value: doctorsWithRecipeGroup, icon: ClipboardList, color: 'amber' },
  ];

  const colorClasses: Record<string, string> = {
    primary: 'text-primary-600 bg-primary-50 border-primary-200',
    violet: 'text-violet-600 bg-violet-50 border-violet-200',
    emerald: 'text-emerald-600 bg-emerald-50 border-emerald-200',
    amber: 'text-amber-600 bg-amber-50 border-amber-200',
  };

  return (
    <div className="space-y-3">

      {/* ── Header ── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <button onClick={onBack} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-dark-DEFAULT transition-colors">
            <ArrowLeft size={18} />
          </button>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-bold text-dark-DEFAULT leading-tight">{employee.name}</h2>
            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
              {employee.region && <span className="text-xs text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded-full">{employee.region}</span>}
              {employee.group  && <span className="text-xs text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded-full">{employee.group}</span>}
              {employee.role   && <span className="text-xs text-primary-600 bg-primary-50 px-1.5 py-0.5 rounded-full">{employee.role}</span>}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <MonthPicker
              months={availableMonths}
              selected={selectedPeriods}
              onChange={handlePeriodsChange}
            />
            <AIProviderSelector className="shrink-0" />
            <button
              onClick={runAIAnalysis}
              disabled={aiLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-violet-500 to-purple-600 text-white rounded-lg text-xs font-medium hover:from-violet-600 hover:to-purple-700 transition-all disabled:opacity-60 shadow-sm"
            >
              {aiLoading ? <RefreshCw size={13} className="animate-spin" /> : <Sparkles size={13} />}
              {aiLoading ? 'Анализ...' : 'AI'}
            </button>
          </div>
        </div>
      </div>

      {/* ── AI результаты ── */}
      {aiLoading && (
        <div className="bg-violet-50 rounded-xl border border-violet-200 px-4 py-3 flex items-center gap-3">
          <div className="animate-spin rounded-full h-4 w-4 border-2 border-violet-300 border-t-violet-600 shrink-0" />
          <p className="text-violet-700 text-sm">Анализирую данные...</p>
        </div>
      )}
      {aiError && !aiLoading && (
        <div className="bg-red-50 rounded-xl border border-red-200 px-4 py-2.5 flex items-center justify-between gap-3">
          <p className="text-red-700 text-sm">{aiError}</p>
          <button onClick={runAIAnalysis} className="flex items-center gap-1 px-2.5 py-1 bg-red-100 text-red-700 rounded-lg text-xs font-medium hover:bg-red-200 shrink-0">
            <RefreshCw size={12} /> Повторить
          </button>
        </div>
      )}
      {aiResult && !aiLoading && aiVisible && (
        <div className="bg-white rounded-xl border border-violet-200 shadow-sm overflow-hidden">
          <div className="px-4 py-2.5 border-b border-violet-100 flex items-center justify-between bg-violet-50">
            <div className="flex items-center gap-2">
              <Sparkles size={15} className="text-violet-600" />
              <span className="font-semibold text-sm text-dark-DEFAULT">AI-анализ</span>
            </div>
            <button onClick={() => setAiVisible(false)} className="flex items-center gap-1 px-2 py-1 text-xs text-violet-600 hover:bg-violet-100 rounded-lg">
              <ChevronUp size={12} /> Скрыть
            </button>
          </div>
          <div className="p-4"><AIAnalysisOutput text={aiResult} copyable /></div>
        </div>
      )}
      {aiResult && !aiLoading && !aiVisible && (
        <button onClick={() => setAiVisible(true)} className="w-full flex items-center justify-center gap-1.5 py-1.5 text-xs text-violet-600 bg-violet-50 rounded-xl border border-violet-200 hover:bg-violet-100">
          <Sparkles size={12} /> Показать AI-анализ
        </button>
      )}

      {/* ── Вопрос AI ── */}
      <div className="bg-white rounded-xl border border-violet-200 shadow-sm overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-2 border-b border-violet-100 bg-violet-50">
          <Send size={14} className="text-violet-600" />
          <span className="font-semibold text-sm text-dark-DEFAULT">Вопрос по данным</span>
        </div>
        <div className="p-3 space-y-2">
          <div className="flex gap-2">
            <input
              type="text"
              value={customQuestion}
              onChange={e => setCustomQuestion(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); runCustomQuestion(); } }}
              placeholder="Например: Какие врачи требуют внимания?"
              className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm placeholder:text-slate-300 focus:ring-2 focus:ring-violet-500 focus:border-violet-500 bg-white"
              disabled={customQuestionLoading}
            />
            <button
              onClick={runCustomQuestion}
              disabled={customQuestionLoading || !customQuestion.trim()}
              className="flex items-center gap-1.5 px-3 py-2 bg-gradient-to-r from-violet-500 to-purple-600 text-white rounded-lg text-sm font-medium hover:from-violet-600 hover:to-purple-700 disabled:opacity-50 shrink-0"
            >
              {customQuestionLoading ? <RefreshCw size={14} className="animate-spin" /> : <Send size={14} />}
              {customQuestionLoading ? '...' : 'Спросить'}
            </button>
          </div>
          {customQuestionError && !customQuestionLoading && (
            <div className="bg-red-50 rounded-lg border border-red-200 px-3 py-2 flex items-center justify-between">
              <p className="text-red-700 text-xs">{customQuestionError}</p>
              <button onClick={runCustomQuestion} className="flex items-center gap-1 px-2 py-1 bg-red-100 text-red-700 rounded text-xs hover:bg-red-200 shrink-0">
                <RefreshCw size={11} /> Повторить
              </button>
            </div>
          )}
          {customQuestionLoading && (
            <div className="flex items-center gap-2 py-1">
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-violet-300 border-t-violet-600" />
              <p className="text-violet-700 text-xs">Ищу ответ...</p>
            </div>
          )}
          {customQuestionResult && !customQuestionLoading && (
            <div className="pt-2 border-t border-violet-100">
              <AIAnalysisOutput text={customQuestionResult} copyable />
            </div>
          )}
        </div>
      </div>

      {/* ── 4 метрики ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        {metrics.map(({ id, label, value, icon: Icon, color }) => (
          <button
            key={id}
            onClick={() => onOpenDataTable?.(id, selectedPeriodLegacy)}
            className="bg-white rounded-xl border border-slate-200 shadow-sm px-3 py-2.5 flex items-center gap-3 hover:border-primary-300 hover:shadow-md transition-all text-left"
          >
            <div className={`p-2 rounded-lg border ${colorClasses[color]} shrink-0`}>
              <Icon size={16} />
            </div>
            <div className="min-w-0">
              <p className="text-lg font-bold text-dark-DEFAULT leading-tight">{value}</p>
              <p className="text-xs text-slate-500 truncate">{label}</p>
            </div>
          </button>
        ))}
      </div>

      {/* ── Потенциал + 5 статов ── */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={onOpenCoveragePage}
          className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-xl text-blue-700 text-sm font-medium hover:bg-blue-100 transition-all"
        >
          <Sparkles size={14} />
          {employee.potentialDoctorsCount > 0 && (
            <span className="font-bold tabular-nums">{employee.potentialDoctorsCount}</span>
          )}
          Потенциал базы врачей
        </button>
        {[
          { key: 'fullCycle',       count: doctorsFullCycle.length,            Icon: CheckCircle,   color: 'text-emerald-600 bg-emerald-50 border-emerald-200', label: 'Полный цикл' },
          { key: 'contractNoRecipe',count: doctorsContractNoRecipe.length,      Icon: FileX,         color: 'text-amber-600 bg-amber-50 border-amber-200',    label: 'Без рецептов' },
          { key: 'recipeNotMatch',  count: doctorsRecipeNotMatchContract.length,Icon: AlertTriangle,  color: 'text-orange-600 bg-orange-50 border-orange-200',  label: 'Не по договору' },
          { key: 'visitsNoBonus',   count: doctorsVisitsNoBonus.length,         Icon: TrendingDown,  color: 'text-slate-600 bg-slate-50 border-slate-200',     label: 'Визиты без УВК' },
          { key: 'bonusNoVisits',   count: doctorsBonusNoVisits.length,         Icon: AlertCircle,   color: 'text-rose-600 bg-rose-50 border-rose-200',        label: 'УВК без визитов' },
        ].map(({ key, count, Icon, color, label }) => (
          <button
            key={key}
            onClick={() => sectionRefs.current[key]?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-sm font-medium hover:shadow-sm transition-all ${color}`}
          >
            <Icon size={14} />
            <span className="font-bold">{count}</span>
            <span className="font-normal text-xs opacity-80">{label}</span>
          </button>
        ))}
      </div>

      {/* ── Списки врачей ── */}
      <div className="flex flex-col gap-3">

        <div ref={el => { sectionRefs.current['fullCycle'] = el; }} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden scroll-mt-4">
          <div className="px-4 py-3 border-b border-slate-100 bg-emerald-50/50 flex items-center gap-2">
            <CheckCircle size={18} className="text-emerald-600" />
            <h3 className="font-semibold text-dark-DEFAULT">Врачи с полным циклом</h3>
            <span className="text-xs text-slate-400 ml-auto">{doctorsFullCycle.length} · Договор + визиты + рецепты = договору + УВК</span>
          </div>
          <div className="divide-y divide-slate-100 max-h-[400px] overflow-y-auto">
            {doctorsFullCycle.length === 0 ? (
              <div className="py-8 text-center text-slate-500 text-sm">Нет врачей с полным циклом</div>
            ) : (
              doctorsFullCycle.map(doc => (
                <button key={doc.doctorName} onClick={() => openDoctor(doc)} className="w-full px-4 py-2.5 flex items-center justify-between hover:bg-slate-50 text-left transition-colors">
                  <span className="font-medium text-dark-DEFAULT truncate">{doc.doctorName}</span>
                  <span className="text-xs text-slate-500 shrink-0 ml-2">
                    {getVisitsInPeriod(doc)} в. · {new Intl.NumberFormat('ru-RU').format(getBonusesInPeriod(doc))} бон.
                  </span>
                </button>
              ))
            )}
          </div>
        </div>

        <div ref={el => { sectionRefs.current['contractNoRecipe'] = el; }} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden scroll-mt-4">
          <div className="px-4 py-3 border-b border-slate-100 bg-amber-50/50 flex items-center gap-2">
            <FileX size={18} className="text-amber-600" />
            <h3 className="font-semibold text-dark-DEFAULT">Договор без рецептов</h3>
            <span className="text-xs text-slate-400 ml-auto">{doctorsContractNoRecipe.length} · Требуют фокуса</span>
          </div>
          <div className="divide-y divide-slate-100 max-h-[400px] overflow-y-auto">
            {doctorsContractNoRecipe.length === 0 ? (
              <div className="py-8 text-center text-slate-500 text-sm">Нет врачей с договором без рецептов</div>
            ) : (
              doctorsContractNoRecipe.map(doc => (
                <button key={doc.doctorName} onClick={() => openDoctor(doc)} className="w-full px-4 py-2.5 flex items-center justify-between hover:bg-slate-50 text-left transition-colors">
                  <span className="font-medium text-dark-DEFAULT truncate">{doc.doctorName}</span>
                  <span className="text-xs text-slate-500 shrink-0 ml-2">{getVisitsInPeriod(doc)} визитов</span>
                </button>
              ))
            )}
          </div>
        </div>

        <div ref={el => { sectionRefs.current['recipeNotMatch'] = el; }} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden scroll-mt-4">
          <div className="px-4 py-3 border-b border-slate-100 bg-orange-50/50 flex items-center gap-2">
            <AlertTriangle size={18} className="text-orange-600" />
            <h3 className="font-semibold text-dark-DEFAULT">Рецепты не соответствуют договору</h3>
            <span className="text-xs text-slate-400 ml-auto">{doctorsRecipeNotMatchContract.length} · Выписывают не то</span>
          </div>
          <div className="divide-y divide-slate-100 max-h-[400px] overflow-y-auto">
            {doctorsRecipeNotMatchContract.length === 0 ? (
              <div className="py-8 text-center text-slate-500 text-sm">Нет таких врачей</div>
            ) : (
              doctorsRecipeNotMatchContract.map(doc => (
                <button key={doc.doctorName} onClick={() => openDoctor(doc)} className="w-full px-4 py-2.5 flex items-center justify-between hover:bg-slate-50 text-left transition-colors">
                  <span className="font-medium text-dark-DEFAULT truncate">{doc.doctorName}</span>
                  <span className="text-xs text-slate-500 shrink-0 ml-2">
                    {getVisitsInPeriod(doc)} в. · {new Intl.NumberFormat('ru-RU').format(getBonusesInPeriod(doc))} бон.
                  </span>
                </button>
              ))
            )}
          </div>
        </div>

        <div ref={el => { sectionRefs.current['visitsNoBonus'] = el; }} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden scroll-mt-4">
          <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
            <TrendingDown size={18} className="text-slate-600" />
            <h3 className="font-semibold text-dark-DEFAULT">Визиты без УВК</h3>
            <span className="text-xs text-slate-400 ml-auto">{doctorsVisitsNoBonus.length} · Визиты есть, бонуса нет</span>
          </div>
          <div className="divide-y divide-slate-100 max-h-[400px] overflow-y-auto">
            {doctorsVisitsNoBonus.length === 0 ? (
              <div className="py-8 text-center text-slate-500 text-sm">Нет таких врачей</div>
            ) : (
              doctorsVisitsNoBonus.map(doc => (
                <button key={doc.doctorName} onClick={() => openDoctor(doc)} className="w-full px-4 py-2.5 flex items-center justify-between hover:bg-slate-50 text-left transition-colors">
                  <span className="font-medium text-dark-DEFAULT truncate">{doc.doctorName}</span>
                  <span className="text-xs text-slate-500 shrink-0 ml-2">{getVisitsInPeriod(doc)} визитов</span>
                </button>
              ))
            )}
          </div>
        </div>

        <div ref={el => { sectionRefs.current['bonusNoVisits'] = el; }} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden scroll-mt-4">
          <div className="px-4 py-3 border-b border-slate-100 bg-rose-50/50 flex items-center gap-2">
            <AlertCircle size={18} className="text-rose-600" />
            <h3 className="font-semibold text-dark-DEFAULT">УВК без визитов</h3>
            <span className="text-xs text-slate-400 ml-auto">{doctorsBonusNoVisits.length} · Аномалия</span>
          </div>
          <div className="divide-y divide-slate-100 max-h-[400px] overflow-y-auto">
            {doctorsBonusNoVisits.length === 0 ? (
              <div className="py-8 text-center text-slate-500 text-sm">Нет таких врачей</div>
            ) : (
              doctorsBonusNoVisits.map(doc => (
                <button key={doc.doctorName} onClick={() => openDoctor(doc)} className="w-full px-4 py-2.5 flex items-center justify-between hover:bg-slate-50 text-left transition-colors">
                  <span className="font-medium text-dark-DEFAULT truncate">{doc.doctorName}</span>
                  <span className="text-xs text-slate-500 shrink-0 ml-2">
                    {new Intl.NumberFormat('ru-RU').format(getBonusesInPeriod(doc))} бон.
                  </span>
                </button>
              ))
            )}
          </div>
        </div>

      </div>

    </div>
  );
};
