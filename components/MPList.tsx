import React, { useMemo, useState, useRef, useEffect } from 'react';
import { EmployeeSummary, GenericRow, DoctorInteraction, DoctorCoverageCandidate, EmployeeCoverageAssignment } from '../types';
import { MapPin, Search, Calendar, X, Filter, Stethoscope, FileSignature, Banknote, CheckCircle, Sparkles, ChevronDown, XCircle } from 'lucide-react';
import { COLUMN_MATCHERS } from '../constants';
import { normalizeLinkKey, getValueByMatchers, buildDoctorCoverageAnalysis, getContractVsRecipeMatchWithMonths, getMonthsInQuarter, abbreviateLpuName } from '../services/dataService';

const VISIT_MODAL_KEYS = ['totalVisits', 'nonContractDoctorsCount', 'visitsWithoutBonusesCount'];
const CONTRACT_MODAL_KEYS = ['contractsCount'];
const BONUS_MODAL_KEYS = ['activeDoctorsCount', 'bonusesWithoutVisitsCount'];
const FULL_CYCLE_MODAL_KEYS = ['fullCycleCount'];
const POTENTIAL_MODAL_KEYS = ['potentialDoctorsCount'];

interface Props {
  data: EmployeeSummary[];
  onSelect: (emp: EmployeeSummary) => void;
  availableMonths?: string[];
  selectedPeriods?: string[];
  onPeriodChange?: (periods: string[]) => void;
  visitsData?: GenericRow[];
  bonusesData?: GenericRow[];
  contractsData?: GenericRow[];
  recipesData?: GenericRow[];
  doctorsData?: GenericRow[];
  savedAssignmentsMap?: Record<string, EmployeeCoverageAssignment[]>;
}

interface ModalState {
  emp: EmployeeSummary;
  colKey: string;
  colLabel: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────

const isMonthKey = (m: string) => /^\d{4}-\d{2}$/.test(m);

const MONTH_SHORT_RU = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];

const formatPeriod = (m: string): string => {
  if (m === 'All') return 'За всё время';
  if (isMonthKey(m)) {
    const [y, mo] = m.split('-');
    return `${MONTH_SHORT_RU[parseInt(mo, 10) - 1] ?? mo} ${y}`;
  }
  return m;
};

/** Выпадающий список с многовыбором (чекбоксы) */
const MultiSelectDropdown: React.FC<{
  label: string;
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (selected: string[]) => void;
  placeholder?: string;
  icon?: React.ReactNode;
  className?: string;
  maxHeight?: string;
  buttonLabel?: string;
}> = ({ label, options, selected, onChange, placeholder = 'Все', icon, className = '', maxHeight = 'max-h-48', buttonLabel }) => {
  const [open, setOpen] = useState(false);
  const [dropPos, setDropPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const handleOpen = () => {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setDropPos({ top: r.bottom + 4, left: r.left, width: Math.max(r.width, 220) });
    }
    setOpen(v => !v);
  };

  const toggle = (v: string) => {
    onChange(selected.includes(v) ? selected.filter(x => x !== v) : [...selected, v]);
  };
  const btnLabel = buttonLabel ?? (selected.length === 0 ? placeholder : `${selected.length} выбрано`);
  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        ref={btnRef}
        type="button"
        onClick={handleOpen}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-slate-200 rounded-lg bg-white hover:border-slate-300 hover:bg-slate-50 transition-colors min-w-[120px] justify-between"
      >
        {icon}
        <span className="truncate">{btnLabel}</span>
        <ChevronDown size={12} className={`shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && dropPos && (
        <div
          style={{ position: 'fixed', top: dropPos.top, left: dropPos.left, minWidth: dropPos.width, zIndex: 9999 }}
          className={`bg-white border border-slate-200 rounded-lg shadow-lg py-1 ${maxHeight} overflow-y-auto`}
        >
          <div className="px-2 py-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wide">{label}</div>
          {options.map(opt => (
            <label key={opt.value} className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50 cursor-pointer text-xs">
              <input type="checkbox" checked={selected.includes(opt.value)} onChange={() => toggle(opt.value)} className="rounded border-slate-300" />
              <span className="truncate">{opt.label}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
};

/** Convert Excel serial or date-string to "дд.мм.гггг" */
const formatRawDate = (v: unknown): string => {
  if (v === null || v === undefined || v === '') return '';
  if (typeof v === 'number' && v >= 1 && v < 2958466) {
    const d = new Date((v - 25569) * 86400000);
    return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
  }
  const s = String(v).trim();
  // Already dd.mm.yyyy or similar
  if (s.match(/^\d{1,2}[./]\d{1,2}[./]\d{4}/)) return s;
  // yyyy-mm-dd
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}.${iso[2]}.${iso[1]}`;
  const d = new Date(s);
  if (!isNaN(d.getTime()))
    return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
  return s;
};

/** Get sortable date key (YYYY-MM-DD) from row for grouping */
const getDateSortKey = (row: GenericRow): string => {
  const raw = (() => {
    const k = Object.keys(row).find(k => COLUMN_MATCHERS.DATE.some(m => k.toLowerCase().includes(m)));
    return k ? row[k] : null;
  })();
  if (raw === null || raw === undefined || raw === '') return '9999-99-99';
  if (typeof raw === 'number' && raw >= 1 && raw < 2958466) {
    const d = new Date((raw - 25569) * 86400000);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  const s = String(raw).trim();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return iso[0];
  const ddMm = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})/);
  if (ddMm) return `${ddMm[3]}-${ddMm[2].padStart(2, '0')}-${ddMm[1].padStart(2, '0')}`;
  const d = new Date(s);
  if (!isNaN(d.getTime()))
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return '9999-99-99';
};

const getVal = (row: GenericRow, matchers: string[]): string =>
  getValueByMatchers(row, matchers) ?? '';

/** Получить сумму УВК из строки бонусов */
const getBonusAmount = (row: GenericRow): number => {
  const key = Object.keys(row).find(k =>
    COLUMN_MATCHERS.BONUS_AMOUNT.some(m => k.toLowerCase().includes(m))
  );
  if (!key) return 0;
  const v = row[key];
  if (typeof v === 'number') return v;
  return parseFloat(String(v || '').replace(/\s/g, '').replace(',', '.')) || 0;
};

/** Получить количество по договору из строки */
const getQuantity = (row: GenericRow): number | null => {
  const key = Object.keys(row).find(k =>
    COLUMN_MATCHERS.QUANTITY.some(m => k.toLowerCase().includes(m))
  );
  if (!key) return null;
  const v = row[key];
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return v;
  const n = parseFloat(String(v).replace(/\s/g, '').replace(',', '.'));
  return isNaN(n) ? null : n;
};

/** Получить аббревиатуру ЛПУ из колонки "Аб" */
const getLpuAbbr = (row: GenericRow): string => {
  const key = Object.keys(row).find(k => k.toLowerCase().trim() === 'аб');
  return key ? String(row[key] ?? '').trim() : '';
};

/** Сгенерировать сокращение из полного названия ЛПУ */

/** ЛПУ для отображения: приоритет Аб, иначе сгенерированное сокращение */
const getLpuDisplay = (row: GenericRow): { display: string; full: string } => {
  const abbr = getLpuAbbr(row);
  const full = getVal(row, ['лпу', 'учреждение', 'аптека', 'организация', 'место', 'клиника', 'больница', 'название клиента']);
  const display = abbr || (full ? abbreviateLpuName(full) : '—');
  return { display, full: full || abbr || '—' };
};

const filterByEmployee = (rows: GenericRow[], empName: string): GenericRow[] => {
  const key = normalizeLinkKey(empName);
  return rows.filter(row => normalizeLinkKey(getVal(row, COLUMN_MATCHERS.EMPLOYEE)) === key);
};

// ── Column config ───────────────────────────────────────────────────────────

const REGION_ORDER = ['Душанбе', 'РРП', 'Курган', 'Куляб', 'Согд', 'РРП2', 'Гарм'];
const regionSort = (a: string, b: string) => {
  const norm = (s: string) => s.toLowerCase().trim();
  const iA = REGION_ORDER.findIndex(r => norm(r) === norm(a));
  const iB = REGION_ORDER.findIndex(r => norm(r) === norm(b));
  const pA = iA >= 0 ? iA : 999;
  const pB = iB >= 0 ? iB : 999;
  return pA !== pB ? pA - pB : a.localeCompare(b);
};

const fmt = (v: number | undefined) => String(v ?? 0);

type DataSource = 'visits' | 'bonuses' | 'contracts' | 'recipes';

interface ColDef {
  key: keyof EmployeeSummary;
  label: string;
  short: string;
  source: DataSource | null;
  modalCols: Array<{ label: string; matchers: string[] }>;
}

const COLUMNS: ColDef[] = [
  {
    key: 'totalVisits', label: 'Визиты', short: 'Визиты', source: 'visits',
    modalCols: [
      { label: 'Врач', matchers: COLUMN_MATCHERS.DOCTOR },
      { label: 'ЛПУ',  matchers: COLUMN_MATCHERS.INSTITUTION },
      { label: 'Дата', matchers: COLUMN_MATCHERS.DATE },
    ],
  },
  {
    key: 'contractsCount', label: 'Договора', short: 'Договора', source: 'contracts',
    modalCols: [
      { label: 'Врач',     matchers: COLUMN_MATCHERS.DOCTOR },
      { label: 'ЛПУ',      matchers: COLUMN_MATCHERS.INSTITUTION },
      { label: 'Препарат', matchers: COLUMN_MATCHERS.NOMENCLATURE },
    ],
  },
  {
    key: 'activeDoctorsCount', label: 'БДК', short: 'БДК', source: 'bonuses',
    modalCols: [
      { label: 'Врач',  matchers: COLUMN_MATCHERS.DOCTOR },
      { label: 'Сумма', matchers: COLUMN_MATCHERS.BONUS_AMOUNT },
      { label: 'Дата',  matchers: COLUMN_MATCHERS.DATE },
    ],
  },
  {
    key: 'fullCycleCount', label: 'Вч с дог.', short: 'Вч с дог.', source: null,
    modalCols: [],
  },
  {
    key: 'nonContractDoctorsCount', label: 'Вч без дог.', short: 'Вч без дог.', source: 'visits',
    modalCols: [
      { label: 'Врач', matchers: COLUMN_MATCHERS.DOCTOR },
      { label: 'ЛПУ',  matchers: COLUMN_MATCHERS.INSTITUTION },
      { label: 'Дата', matchers: COLUMN_MATCHERS.DATE },
    ],
  },
  {
    key: 'visitsWithoutBonusesCount', label: 'Взт без УВК', short: 'Взт без УВК', source: 'visits',
    modalCols: [
      { label: 'Врач', matchers: COLUMN_MATCHERS.DOCTOR },
      { label: 'ЛПУ',  matchers: COLUMN_MATCHERS.INSTITUTION },
      { label: 'Дата', matchers: COLUMN_MATCHERS.DATE },
    ],
  },
  {
    key: 'bonusesWithoutVisitsCount', label: 'УВК без Взт', short: 'УВК без Взт', source: 'bonuses',
    modalCols: [
      { label: 'Врач',  matchers: COLUMN_MATCHERS.DOCTOR },
      { label: 'Сумма', matchers: COLUMN_MATCHERS.BONUS_AMOUNT },
      { label: 'Дата',  matchers: COLUMN_MATCHERS.DATE },
    ],
  },
  {
    key: 'potentialDoctorsCount', label: 'Потенциал', short: 'Потенциал', source: null,
    modalCols: [],
  },
];

// ── Modal ───────────────────────────────────────────────────────────────────

interface StatModalProps {
  state: ModalState;
  visitsData: GenericRow[];
  bonusesData: GenericRow[];
  contractsData: GenericRow[];
  recipesData: GenericRow[];
  onClose: () => void;
}

const StatModal: React.FC<StatModalProps> = ({
  state, visitsData, bonusesData, contractsData, recipesData, onClose,
}) => {
  const { emp, colKey, colLabel } = state;
  const col = COLUMNS.find(c => c.key === colKey)!;
  const value = emp[colKey as keyof EmployeeSummary] as number | undefined;

  const sourceMap: Record<DataSource, GenericRow[]> = {
    visits: visitsData,
    bonuses: bonusesData,
    contracts: contractsData,
    recipes: recipesData,
  };

  const rows = useMemo(() => {
    if (!col.source) return [];
    return filterByEmployee(sourceMap[col.source], emp.name);
  }, [emp, col]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-100 shrink-0">
          <div>
            <p className="text-xs text-slate-400 font-medium uppercase tracking-wide mb-0.5">{colLabel}</p>
            <h3 className="text-base font-bold text-dark-DEFAULT leading-tight">{emp.name}</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              {[emp.region, emp.group].filter(Boolean).join(' · ')}
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <span className="text-3xl font-bold text-dark-DEFAULT">{fmt(value)}</span>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Rows */}
        <div className="overflow-y-auto flex-1">
          {rows.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-400">
              {col.source ? 'Нет данных' : 'Детализация недоступна'}
            </div>
          ) : (
            <table className="w-full text-xs">
              <thead className="bg-slate-50 sticky top-0">
                <tr>
                  {col.modalCols.map(mc => (
                    <th key={mc.label} className="text-left px-4 py-2 font-semibold text-slate-500 whitespace-nowrap">
                      {mc.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={i} className={`border-t border-slate-50 ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'}`}>
                    {col.modalCols.map(mc => {
                      const raw = getVal(row, mc.matchers);
                      const display = mc.label === 'Дата' ? formatRawDate(
                        (() => {
                          const k = Object.keys(row).find(k => COLUMN_MATCHERS.DATE.some(m => k.toLowerCase().includes(m)));
                          return k ? row[k] : raw;
                        })()
                      ) : raw;
                      return (
                        <td key={mc.label} className="px-4 py-2 text-dark-DEFAULT max-w-[200px] truncate">
                          {display || <span className="text-slate-300">—</span>}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="px-4 py-2 border-t border-slate-100 text-xs text-slate-400 text-right shrink-0">
          {rows.length} строк
        </div>
      </div>
    </div>
  );
};

// ── Visits Modal (grouped by date, filters, region/specialty) ────────────────

interface VisitsModalProps {
  state: ModalState;
  visitsData: GenericRow[];
  bonusesData?: GenericRow[];
  recipesData?: GenericRow[];
  onClose: () => void;
}

/** Номенклатура, которую выписывает врач (из бонусов и рецептов по МП) */
const getDoctorNomenclature = (
  doctorName: string,
  empName: string,
  bonusesData: GenericRow[],
  recipesData: GenericRow[]
): string[] => {
  const key = normalizeLinkKey(doctorName);
  const empKey = normalizeLinkKey(empName);
  const noms = new Set<string>();
  const addFrom = (rows: GenericRow[]) => {
    rows.forEach(r => {
      if (normalizeLinkKey(getVal(r, COLUMN_MATCHERS.EMPLOYEE)) !== empKey) return;
      if (normalizeLinkKey(getVal(r, COLUMN_MATCHERS.DOCTOR)) !== key) return;
      const n = getVal(r, COLUMN_MATCHERS.NOMENCLATURE).trim();
      if (n) noms.add(n);
    });
  };
  addFrom(bonusesData || []);
  addFrom(recipesData || []);
  return Array.from(noms).sort();
};

const VisitsModal: React.FC<VisitsModalProps> = ({ state, visitsData, bonusesData = [], recipesData = [], onClose }) => {
  const { emp, colKey, colLabel } = state;
  const value = emp[colKey as keyof EmployeeSummary] as number | undefined;

  const [filterDates, setFilterDates] = useState<string[]>([]);
  const [filterRegions, setFilterRegions] = useState<string[]>([]);
  const [filterSpecialties, setFilterSpecialties] = useState<string[]>([]);
  const [filterDoctors, setFilterDoctors] = useState<string[]>([]);
  const [filterInstitutions, setFilterInstitutions] = useState<string[]>([]);
  const [searchDoctor, setSearchDoctor] = useState('');
  const [searchInstitution, setSearchInstitution] = useState('');

  const rows = useMemo(() =>
    filterByEmployee(visitsData, emp.name),
    [visitsData, emp.name]
  );

  const filterOptions = useMemo(() => {
    const dates = new Set<string>();
    const regions = new Set<string>();
    const specialties = new Set<string>();
    const doctors = new Set<string>();
    const institutions = new Set<string>();
    rows.forEach(row => {
      const dateKey = getDateSortKey(row);
      if (dateKey !== '9999-99-99') dates.add(dateKey);
      const r = getVal(row, COLUMN_MATCHERS.REGION);
      if (r) regions.add(r);
      const s = getVal(row, COLUMN_MATCHERS.SPECIALTY);
      if (s) specialties.add(s);
      const d = getVal(row, COLUMN_MATCHERS.DOCTOR);
      if (d) doctors.add(d);
      const { display: iDisplay } = getLpuDisplay(row);
      if (iDisplay && iDisplay !== '—') institutions.add(iDisplay);
    });
    return {
      dates: Array.from(dates).sort().reverse(),
      regions: Array.from(regions).sort(regionSort),
      specialties: Array.from(specialties).sort(),
      doctors: Array.from(doctors).sort(),
      institutions: Array.from(institutions).sort(),
    };
  }, [rows]);

  const filteredRows = useMemo(() => {
    let list = [...rows];
    if (filterDates.length > 0) {
      const set = new Set(filterDates);
      list = list.filter(r => set.has(getDateSortKey(r)));
    }
    if (filterRegions.length > 0) {
      const set = new Set(filterRegions);
      list = list.filter(r => set.has(getVal(r, COLUMN_MATCHERS.REGION)));
    }
    if (filterSpecialties.length > 0) {
      const set = new Set(filterSpecialties);
      list = list.filter(r => set.has(getVal(r, COLUMN_MATCHERS.SPECIALTY)));
    }
    if (filterDoctors.length > 0) {
      const set = new Set(filterDoctors);
      list = list.filter(r => set.has(getVal(r, COLUMN_MATCHERS.DOCTOR)));
    }
    if (filterInstitutions.length > 0) {
      const set = new Set(filterInstitutions);
      list = list.filter(r => set.has(getLpuDisplay(r).display));
    }
    if (searchDoctor.trim()) {
      const q = searchDoctor.toLowerCase().trim();
      list = list.filter(r => getVal(r, COLUMN_MATCHERS.DOCTOR).toLowerCase().includes(q));
    }
    if (searchInstitution.trim()) {
      const q = searchInstitution.toLowerCase().trim();
      list = list.filter(r => {
        const { display, full } = getLpuDisplay(r);
        return display.toLowerCase().includes(q) || full.toLowerCase().includes(q);
      });
    }
    return list.sort((a, b) => getDateSortKey(b).localeCompare(getDateSortKey(a)));
  }, [rows, filterDates, filterRegions, filterSpecialties, filterDoctors, filterInstitutions, searchDoctor, searchInstitution]);

  const groupedByDate = useMemo(() => {
    const map = new Map<string, GenericRow[]>();
    filteredRows.forEach(row => {
      const key = getDateSortKey(row);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(row);
    });
    return Array.from(map.entries()).sort(([a], [b]) => b.localeCompare(a));
  }, [filteredRows]);

  const hasFilters = !!(filterDates.length || filterRegions.length || filterSpecialties.length || filterDoctors.length || filterInstitutions.length || searchDoctor.trim() || searchInstitution.trim());

  const resetFilters = () => {
    setFilterDates([]);
    setFilterRegions([]);
    setFilterSpecialties([]);
    setFilterDoctors([]);
    setFilterInstitutions([]);
    setSearchDoctor('');
    setSearchInstitution('');
  };

  const formatDateKey = (key: string) => {
    if (key === '9999-99-99') return 'Без даты';
    const [y, m, d] = key.split('-');
    return `${d}.${m}.${y}`;
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden border border-slate-200"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-br from-indigo-600 to-indigo-700 px-6 py-4 shrink-0">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Stethoscope size={18} className="text-indigo-200" />
                <span className="text-xs font-medium text-indigo-200 uppercase tracking-wider">{colLabel}</span>
              </div>
              <h3 className="text-lg font-bold text-white leading-tight">{emp.name}</h3>
              <p className="text-sm text-indigo-200 mt-0.5">
                {[emp.region, emp.group].filter(Boolean).join(' · ')}
              </p>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <div className="bg-white/20 rounded-xl px-4 py-2 text-center">
                <span className="text-2xl font-bold text-white tabular-nums">{fmt(value)}</span>
                <p className="text-[10px] text-indigo-200 uppercase tracking-wide">визитов</p>
              </div>
              <button
                onClick={onClose}
                className="p-2 rounded-lg hover:bg-white/20 text-white transition-colors"
              >
                <X size={20} />
              </button>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="px-3 py-2 border-b border-slate-200 bg-slate-50 shrink-0">
          <div className="flex items-center gap-2 mb-1.5">
            <Filter size={12} className="text-slate-500" />
            <span className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide">Фильтры</span>
            {hasFilters && (
              <button
                onClick={resetFilters}
                className="ml-auto text-xs text-indigo-600 hover:text-indigo-700 font-medium"
              >
                Сбросить
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <MultiSelectDropdown label="Дата" options={filterOptions.dates.map(d => ({ value: d, label: formatDateKey(d) }))} selected={filterDates} onChange={setFilterDates} placeholder="Все даты" />
            {filterOptions.regions.length > 0 && <MultiSelectDropdown label="Область" options={filterOptions.regions.map(r => ({ value: r, label: r }))} selected={filterRegions} onChange={setFilterRegions} placeholder="Все области" />}
            {filterOptions.specialties.length > 0 && <MultiSelectDropdown label="Специальность" options={filterOptions.specialties.map(s => ({ value: s, label: s }))} selected={filterSpecialties} onChange={setFilterSpecialties} placeholder="Все спец." />}
            {filterOptions.doctors.length > 0 && <MultiSelectDropdown label="Врач" options={filterOptions.doctors.map(d => ({ value: d, label: d }))} selected={filterDoctors} onChange={setFilterDoctors} placeholder="Все врачи" maxHeight="max-h-64" />}
            {filterOptions.institutions.length > 0 && <MultiSelectDropdown label="ЛПУ" options={filterOptions.institutions.map(i => ({ value: i, label: i }))} selected={filterInstitutions} onChange={setFilterInstitutions} placeholder="Все ЛПУ" maxHeight="max-h-64" />}
          </div>
          {(filterOptions.doctors.length > 50 || filterOptions.institutions.length > 50) && (
            <div className="flex gap-1.5 mt-1.5">
              {filterOptions.doctors.length > 50 && (
                <div className="relative flex-1 min-w-[100px]">
                  <Search size={10} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Поиск по врачу..."
                    value={searchDoctor}
                    onChange={e => setSearchDoctor(e.target.value)}
                    className="w-full pl-6 pr-2 py-1 text-xs border border-slate-200 rounded bg-white focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              )}
              {filterOptions.institutions.length > 50 && (
                <div className="relative flex-1 min-w-[100px]">
                  <Search size={10} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Поиск по ЛПУ Аб..."
                    value={searchInstitution}
                    onChange={e => setSearchInstitution(e.target.value)}
                    className="w-full pl-6 pr-2 py-1 text-xs border border-slate-200 rounded bg-white focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Table grouped by date */}
        <div className="overflow-y-auto flex-1">
          {filteredRows.length === 0 ? (
            <div className="py-16 text-center">
              <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
                <Stethoscope size={24} className="text-slate-300" />
              </div>
              <p className="text-slate-500 font-medium">{hasFilters ? 'Нет визитов по выбранным фильтрам' : 'Нет данных'}</p>
              {hasFilters && (
                <button onClick={resetFilters} className="mt-2 text-sm text-indigo-600 hover:text-indigo-700 font-medium">
                  Сбросить фильтры
                </button>
              )}
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {groupedByDate.map(([dateKey, dateRows]) => (
                <div key={dateKey} className="bg-white">
                  <div className="sticky top-0 z-10 bg-slate-100/95 backdrop-blur px-3 py-1.5 flex items-center justify-between border-b border-slate-200">
                    <span className="font-semibold text-slate-700 text-xs">{formatDateKey(dateKey)}</span>
                    <span className="text-[10px] text-slate-500 bg-slate-200/80 px-1.5 py-0.5 rounded">
                      {dateRows.length} в.
                    </span>
                  </div>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-slate-50/80">
                        <th className="text-left px-2 py-1.5 font-semibold text-slate-600 min-w-[140px]">Врач</th>
                        <th className="text-left px-2 py-1.5 font-semibold text-slate-600 min-w-[70px]">ЛПУ Аб</th>
                        <th className="text-left px-2 py-1.5 font-semibold text-slate-600 min-w-[70px]">Обл.</th>
                        <th className="text-left px-2 py-1.5 font-semibold text-slate-600 min-w-[90px]">Спец.</th>
                        {(colKey === 'nonContractDoctorsCount' || colKey === 'visitsWithoutBonusesCount') && (
                          <th className="text-left px-2 py-1.5 font-semibold text-slate-600 min-w-[140px]">Выписывают</th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {dateRows.map((row, i) => {
                        const lpu = getLpuDisplay(row);
                        const docName = getVal(row, COLUMN_MATCHERS.DOCTOR);
                        const nomenclatures = (colKey === 'nonContractDoctorsCount' || colKey === 'visitsWithoutBonusesCount')
                          ? getDoctorNomenclature(docName, emp.name, bonusesData, recipesData)
                          : [];
                        const nomDisplay = nomenclatures.length > 0 ? nomenclatures.join(', ') : '';
                        const nomFromRow = getVal(row, COLUMN_MATCHERS.NOMENCLATURE).trim();
                        const showNom = nomDisplay || nomFromRow || null;
                        return (
                        <tr
                          key={i}
                          className={`border-t border-slate-50 hover:bg-indigo-50/30 transition-colors ${
                            i % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'
                          }`}
                        >
                          <td className="px-2 py-1.5 font-medium text-slate-800 truncate max-w-[160px]" title={docName}>
                            {docName || <span className="text-slate-300">—</span>}
                          </td>
                          <td className="px-2 py-1.5 text-slate-600 whitespace-nowrap" title={lpu.full !== lpu.display ? lpu.full : undefined}>
                            {lpu.display}
                          </td>
                          <td className="px-2 py-1.5 text-slate-600 truncate max-w-[80px]" title={getVal(row, COLUMN_MATCHERS.REGION)}>
                            {getVal(row, COLUMN_MATCHERS.REGION) || <span className="text-slate-300">—</span>}
                          </td>
                          <td className="px-2 py-1.5 text-slate-600 truncate max-w-[100px]" title={getVal(row, COLUMN_MATCHERS.SPECIALTY)}>
                            {getVal(row, COLUMN_MATCHERS.SPECIALTY) || <span className="text-slate-300">—</span>}
                          </td>
                          {(colKey === 'nonContractDoctorsCount' || colKey === 'visitsWithoutBonusesCount') && (
                            <td className="px-2 py-1.5 text-slate-600 truncate max-w-[200px]" title={showNom || undefined}>
                              {showNom || <span className="text-slate-300">—</span>}
                            </td>
                          )}
                        </tr>
                      );})}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="px-3 py-1.5 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-xs text-slate-500 shrink-0">
          <span>
            {filteredRows.length} из {rows.length} в.
            {hasFilters && ' (фильтр)'}
          </span>
        </div>
      </div>
    </div>
  );
};

// ── Contracts Modal (grouped by doctor, filters, ЛПУ Аб, Спец.) ───────────────

interface ContractsModalProps {
  state: ModalState;
  contractsData: GenericRow[];
  onClose: () => void;
}

const ContractsModal: React.FC<ContractsModalProps> = ({ state, contractsData, onClose }) => {
  const { emp, colKey, colLabel } = state;
  const value = emp[colKey as keyof EmployeeSummary] as number | undefined;

  const [filterDoctors, setFilterDoctors] = useState<string[]>([]);
  const [filterInstitutions, setFilterInstitutions] = useState<string[]>([]);
  const [filterSpecialties, setFilterSpecialties] = useState<string[]>([]);
  const [searchDoctor, setSearchDoctor] = useState('');
  const [searchNomenclature, setSearchNomenclature] = useState('');

  const rows = useMemo(() =>
    filterByEmployee(contractsData, emp.name),
    [contractsData, emp.name]
  );

  const filterOptions = useMemo(() => {
    const doctors = new Set<string>();
    const institutions = new Set<string>();
    const specialties = new Set<string>();
    rows.forEach(row => {
      const d = getVal(row, COLUMN_MATCHERS.DOCTOR);
      if (d) doctors.add(d);
      const { display: iDisplay } = getLpuDisplay(row);
      if (iDisplay && iDisplay !== '—') institutions.add(iDisplay);
      const s = getVal(row, COLUMN_MATCHERS.SPECIALTY);
      if (s) specialties.add(s);
    });
    return {
      doctors: Array.from(doctors).sort(),
      institutions: Array.from(institutions).sort(),
      specialties: Array.from(specialties).sort(),
    };
  }, [rows]);

  const filteredRows = useMemo(() => {
    let list = [...rows];
    if (filterDoctors.length > 0) {
      const set = new Set(filterDoctors);
      list = list.filter(r => set.has(getVal(r, COLUMN_MATCHERS.DOCTOR)));
    }
    if (filterInstitutions.length > 0) {
      const set = new Set(filterInstitutions);
      list = list.filter(r => set.has(getLpuDisplay(r).display));
    }
    if (filterSpecialties.length > 0) {
      const set = new Set(filterSpecialties);
      list = list.filter(r => set.has(getVal(r, COLUMN_MATCHERS.SPECIALTY)));
    }
    if (searchDoctor.trim()) {
      const q = searchDoctor.toLowerCase().trim();
      list = list.filter(r => getVal(r, COLUMN_MATCHERS.DOCTOR).toLowerCase().includes(q));
    }
    if (searchNomenclature.trim()) {
      const q = searchNomenclature.toLowerCase().trim();
      list = list.filter(r => getVal(r, COLUMN_MATCHERS.NOMENCLATURE).toLowerCase().includes(q));
    }
    return list;
  }, [rows, filterDoctors, filterInstitutions, filterSpecialties, searchDoctor, searchNomenclature]);

  const groupedByDoctor = useMemo(() => {
    const map = new Map<string, GenericRow[]>();
    filteredRows.forEach(row => {
      const key = getVal(row, COLUMN_MATCHERS.DOCTOR) || '—';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(row);
    });
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b, 'ru'));
  }, [filteredRows]);

  const hasFilters = !!(filterDoctors.length || filterInstitutions.length || filterSpecialties.length || searchDoctor.trim() || searchNomenclature.trim());

  const resetFilters = () => {
    setFilterDoctors([]);
    setFilterInstitutions([]);
    setFilterSpecialties([]);
    setSearchDoctor('');
    setSearchNomenclature('');
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden border border-slate-200"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-br from-violet-600 to-violet-700 px-6 py-4 shrink-0">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <FileSignature size={18} className="text-violet-200" />
                <span className="text-xs font-medium text-violet-200 uppercase tracking-wider">{colLabel}</span>
              </div>
              <h3 className="text-lg font-bold text-white leading-tight">{emp.name}</h3>
              <p className="text-sm text-violet-200 mt-0.5">
                {[emp.region, emp.group].filter(Boolean).join(' · ')}
              </p>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <div className="bg-white/20 rounded-xl px-4 py-2 text-center">
                <span className="text-2xl font-bold text-white tabular-nums">{fmt(value)}</span>
                <p className="text-[10px] text-violet-200 uppercase tracking-wide">договоров</p>
              </div>
              <button
                onClick={onClose}
                className="p-2 rounded-lg hover:bg-white/20 text-white transition-colors"
              >
                <X size={20} />
              </button>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="px-3 py-2 border-b border-slate-200 bg-slate-50 shrink-0">
          <div className="flex items-center gap-2 mb-1.5">
            <Filter size={12} className="text-slate-500" />
            <span className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide">Фильтры</span>
            {hasFilters && (
              <button onClick={resetFilters} className="ml-auto text-xs text-violet-600 hover:text-violet-700 font-medium">
                Сбросить
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {filterOptions.specialties.length > 0 && <MultiSelectDropdown label="Специальность" options={filterOptions.specialties.map(s => ({ value: s, label: s }))} selected={filterSpecialties} onChange={setFilterSpecialties} placeholder="Все спец." />}
            {filterOptions.doctors.length > 0 && <MultiSelectDropdown label="Врач" options={filterOptions.doctors.map(d => ({ value: d, label: d }))} selected={filterDoctors} onChange={setFilterDoctors} placeholder="Все врачи" maxHeight="max-h-64" />}
            {filterOptions.institutions.length > 0 && <MultiSelectDropdown label="ЛПУ" options={filterOptions.institutions.map(i => ({ value: i, label: i }))} selected={filterInstitutions} onChange={setFilterInstitutions} placeholder="Все ЛПУ" maxHeight="max-h-64" />}
          </div>
          <div className="flex gap-1.5 mt-1.5">
            <div className="relative flex-1 min-w-[100px]">
              <Search size={10} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Поиск по врачу..."
                value={searchDoctor}
                onChange={e => setSearchDoctor(e.target.value)}
                className="w-full pl-6 pr-2 py-1 text-xs border border-slate-200 rounded bg-white focus:ring-2 focus:ring-violet-500"
              />
            </div>
            <div className="relative flex-1 min-w-[100px]">
              <Search size={10} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Поиск по препарату..."
                value={searchNomenclature}
                onChange={e => setSearchNomenclature(e.target.value)}
                className="w-full pl-6 pr-2 py-1 text-xs border border-slate-200 rounded bg-white focus:ring-2 focus:ring-violet-500"
              />
            </div>
          </div>
        </div>

        {/* Table grouped by doctor */}
        <div className="overflow-y-auto flex-1">
          {filteredRows.length === 0 ? (
            <div className="py-16 text-center">
              <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
                <FileSignature size={24} className="text-slate-300" />
              </div>
              <p className="text-slate-500 font-medium">{hasFilters ? 'Нет договоров по выбранным фильтрам' : 'Нет данных'}</p>
              {hasFilters && (
                <button onClick={resetFilters} className="mt-2 text-sm text-violet-600 hover:text-violet-700 font-medium">
                  Сбросить фильтры
                </button>
              )}
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {groupedByDoctor.map(([doctorName, doctorRows]) => (
                <div key={doctorName} className="bg-white">
                  <div className="sticky top-0 z-10 bg-slate-100/95 backdrop-blur px-3 py-1.5 flex items-center justify-between border-b border-slate-200">
                    <span className="font-semibold text-slate-700 text-xs truncate max-w-[280px]" title={doctorName}>{doctorName}</span>
                    <span className="text-[10px] text-slate-500 bg-slate-200/80 px-1.5 py-0.5 rounded shrink-0">
                      {doctorRows.length} дог.
                    </span>
                  </div>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-slate-50/80">
                        <th className="text-left px-2 py-1.5 font-semibold text-slate-600 min-w-[70px]">ЛПУ Аб</th>
                        <th className="text-left px-2 py-1.5 font-semibold text-slate-600 min-w-[70px]">Спец.</th>
                        <th className="text-left px-2 py-1.5 font-semibold text-slate-600 min-w-[180px]">Препарат</th>
                        <th className="text-right px-2 py-1.5 font-semibold text-slate-600 min-w-[50px]">Кол-во</th>
                      </tr>
                    </thead>
                    <tbody>
                      {doctorRows.map((row, i) => {
                        const lpu = getLpuDisplay(row);
                        const qty = getQuantity(row);
                        return (
                          <tr
                            key={i}
                            className={`border-t border-slate-50 hover:bg-violet-50/30 transition-colors ${
                              i % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'
                            }`}
                          >
                            <td className="px-2 py-1.5 text-slate-600 whitespace-nowrap" title={lpu.full !== lpu.display ? lpu.full : undefined}>
                              {lpu.display}
                            </td>
                            <td className="px-2 py-1.5 text-slate-600 truncate max-w-[90px]" title={getVal(row, COLUMN_MATCHERS.SPECIALTY)}>
                              {getVal(row, COLUMN_MATCHERS.SPECIALTY) || <span className="text-slate-300">—</span>}
                            </td>
                            <td className="px-2 py-1.5 text-slate-600 truncate max-w-[220px]" title={getVal(row, COLUMN_MATCHERS.NOMENCLATURE)}>
                              {getVal(row, COLUMN_MATCHERS.NOMENCLATURE) || <span className="text-slate-300">—</span>}
                            </td>
                            <td className="px-2 py-1.5 text-right tabular-nums font-medium text-slate-700">
                              {qty !== null ? new Intl.NumberFormat('ru-RU').format(qty) : <span className="text-slate-300">—</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="px-3 py-1.5 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-xs text-slate-500 shrink-0">
          <span>
            {filteredRows.length} из {rows.length} дог.
            {hasFilters && ' (фильтр)'}
          </span>
        </div>
      </div>
    </div>
  );
};

// ── Bonuses Modal (БДК, УВК без Взт — grouped by date, ЛПУ Аб, Спец.) ──────

interface BonusesModalProps {
  state: ModalState;
  bonusesData: GenericRow[];
  visitsData?: GenericRow[];
  onClose: () => void;
}

const BonusesModal: React.FC<BonusesModalProps> = ({ state, bonusesData, visitsData = [], onClose }) => {
  const { emp, colKey, colLabel } = state;
  const value = emp[colKey as keyof EmployeeSummary] as number | undefined;

  const [filterDates, setFilterDates] = useState<string[]>([]);
  const [filterRegions, setFilterRegions] = useState<string[]>([]);
  const [filterSpecialties, setFilterSpecialties] = useState<string[]>([]);
  const [filterDoctors, setFilterDoctors] = useState<string[]>([]);
  const [filterInstitutions, setFilterInstitutions] = useState<string[]>([]);
  const [searchDoctor, setSearchDoctor] = useState('');
  const [searchInstitution, setSearchInstitution] = useState('');

  const rows = useMemo(() => {
    const allBonusRows = filterByEmployee(bonusesData, emp.name);
    if (colKey !== 'bonusesWithoutVisitsCount') return allBonusRows;
    // Filter to only doctors who had NO visits in the same period
    const visitedDoctorKeys = new Set(
      filterByEmployee(visitsData, emp.name).map(r => normalizeLinkKey(getVal(r, COLUMN_MATCHERS.DOCTOR)))
    );
    return allBonusRows.filter(r => !visitedDoctorKeys.has(normalizeLinkKey(getVal(r, COLUMN_MATCHERS.DOCTOR))));
  }, [bonusesData, visitsData, emp.name, colKey]);

  const filterOptions = useMemo(() => {
    const dates = new Set<string>();
    const regions = new Set<string>();
    const specialties = new Set<string>();
    const doctors = new Set<string>();
    const institutions = new Set<string>();
    rows.forEach(row => {
      const dateKey = getDateSortKey(row);
      if (dateKey !== '9999-99-99') dates.add(dateKey);
      const r = getVal(row, COLUMN_MATCHERS.REGION);
      if (r) regions.add(r);
      const s = getVal(row, COLUMN_MATCHERS.SPECIALTY);
      if (s) specialties.add(s);
      const d = getVal(row, COLUMN_MATCHERS.DOCTOR);
      if (d) doctors.add(d);
      const { display: iDisplay } = getLpuDisplay(row);
      if (iDisplay && iDisplay !== '—') institutions.add(iDisplay);
    });
    return {
      dates: Array.from(dates).sort().reverse(),
      regions: Array.from(regions).sort(regionSort),
      specialties: Array.from(specialties).sort(),
      doctors: Array.from(doctors).sort(),
      institutions: Array.from(institutions).sort(),
    };
  }, [rows]);

  const filteredRows = useMemo(() => {
    let list = [...rows];
    if (filterDates.length > 0) {
      const set = new Set(filterDates);
      list = list.filter(r => set.has(getDateSortKey(r)));
    }
    if (filterRegions.length > 0) {
      const set = new Set(filterRegions);
      list = list.filter(r => set.has(getVal(r, COLUMN_MATCHERS.REGION)));
    }
    if (filterSpecialties.length > 0) {
      const set = new Set(filterSpecialties);
      list = list.filter(r => set.has(getVal(r, COLUMN_MATCHERS.SPECIALTY)));
    }
    if (filterDoctors.length > 0) {
      const set = new Set(filterDoctors);
      list = list.filter(r => set.has(getVal(r, COLUMN_MATCHERS.DOCTOR)));
    }
    if (filterInstitutions.length > 0) {
      const set = new Set(filterInstitutions);
      list = list.filter(r => set.has(getLpuDisplay(r).display));
    }
    if (searchDoctor.trim()) {
      const q = searchDoctor.toLowerCase().trim();
      list = list.filter(r => getVal(r, COLUMN_MATCHERS.DOCTOR).toLowerCase().includes(q));
    }
    if (searchInstitution.trim()) {
      const q = searchInstitution.toLowerCase().trim();
      list = list.filter(r => {
        const { display, full } = getLpuDisplay(r);
        return display.toLowerCase().includes(q) || full.toLowerCase().includes(q);
      });
    }
    return list.sort((a, b) => getDateSortKey(b).localeCompare(getDateSortKey(a)));
  }, [rows, filterDates, filterRegions, filterSpecialties, filterDoctors, filterInstitutions, searchDoctor, searchInstitution]);

  const groupedByDate = useMemo(() => {
    const map = new Map<string, GenericRow[]>();
    filteredRows.forEach(row => {
      const key = getDateSortKey(row);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(row);
    });
    return Array.from(map.entries()).sort(([a], [b]) => b.localeCompare(a));
  }, [filteredRows]);

  const hasFilters = !!(filterDates.length || filterRegions.length || filterSpecialties.length || filterDoctors.length || filterInstitutions.length || searchDoctor.trim() || searchInstitution.trim());

  const resetFilters = () => {
    setFilterDates([]);
    setFilterRegions([]);
    setFilterSpecialties([]);
    setFilterDoctors([]);
    setFilterInstitutions([]);
    setSearchDoctor('');
    setSearchInstitution('');
  };

  const formatDateKey = (key: string) => {
    if (key === '9999-99-99') return 'Без даты';
    const [y, m, d] = key.split('-');
    return `${d}.${m}.${y}`;
  };

  const totalSum = useMemo(() =>
    filteredRows.reduce((s, r) => s + getBonusAmount(r), 0),
    [filteredRows]
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden border border-slate-200"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-br from-emerald-600 to-emerald-700 px-6 py-4 shrink-0">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Banknote size={18} className="text-emerald-200" />
                <span className="text-xs font-medium text-emerald-200 uppercase tracking-wider">{colLabel}</span>
              </div>
              <h3 className="text-lg font-bold text-white leading-tight">{emp.name}</h3>
              <p className="text-sm text-emerald-200 mt-0.5">
                {[emp.region, emp.group].filter(Boolean).join(' · ')}
              </p>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <div className="bg-white/20 rounded-xl px-4 py-2 text-center">
                <span className="text-2xl font-bold text-white tabular-nums">{fmt(value)}</span>
                <p className="text-[10px] text-emerald-200 uppercase tracking-wide">врачей</p>
              </div>
              <button
                onClick={onClose}
                className="p-2 rounded-lg hover:bg-white/20 text-white transition-colors"
              >
                <X size={20} />
              </button>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="px-3 py-2 border-b border-slate-200 bg-slate-50 shrink-0">
          <div className="flex items-center gap-2 mb-1.5">
            <Filter size={12} className="text-slate-500" />
            <span className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide">Фильтры</span>
            {hasFilters && (
              <button onClick={resetFilters} className="ml-auto text-xs text-emerald-600 hover:text-emerald-700 font-medium">
                Сбросить
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <MultiSelectDropdown label="Дата" options={filterOptions.dates.map(d => ({ value: d, label: formatDateKey(d) }))} selected={filterDates} onChange={setFilterDates} placeholder="Все даты" />
            {filterOptions.regions.length > 0 && <MultiSelectDropdown label="Область" options={filterOptions.regions.map(r => ({ value: r, label: r }))} selected={filterRegions} onChange={setFilterRegions} placeholder="Все области" />}
            {filterOptions.specialties.length > 0 && <MultiSelectDropdown label="Специальность" options={filterOptions.specialties.map(s => ({ value: s, label: s }))} selected={filterSpecialties} onChange={setFilterSpecialties} placeholder="Все спец." />}
            {filterOptions.doctors.length > 0 && <MultiSelectDropdown label="Врач" options={filterOptions.doctors.map(d => ({ value: d, label: d }))} selected={filterDoctors} onChange={setFilterDoctors} placeholder="Все врачи" maxHeight="max-h-64" />}
            {filterOptions.institutions.length > 0 && <MultiSelectDropdown label="ЛПУ" options={filterOptions.institutions.map(i => ({ value: i, label: i }))} selected={filterInstitutions} onChange={setFilterInstitutions} placeholder="Все ЛПУ" maxHeight="max-h-64" />}
          </div>
          {(filterOptions.doctors.length > 50 || filterOptions.institutions.length > 50) && (
            <div className="flex gap-1.5 mt-1.5">
              {filterOptions.doctors.length > 50 && (
                <div className="relative flex-1 min-w-[100px]">
                  <Search size={10} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input type="text" placeholder="Поиск по врачу..." value={searchDoctor} onChange={e => setSearchDoctor(e.target.value)} className="w-full pl-6 pr-2 py-1 text-xs border border-slate-200 rounded bg-white focus:ring-2 focus:ring-emerald-500" />
                </div>
              )}
              {filterOptions.institutions.length > 50 && (
                <div className="relative flex-1 min-w-[100px]">
                  <Search size={10} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input type="text" placeholder="Поиск по ЛПУ Аб..." value={searchInstitution} onChange={e => setSearchInstitution(e.target.value)} className="w-full pl-6 pr-2 py-1 text-xs border border-slate-200 rounded bg-white focus:ring-2 focus:ring-emerald-500" />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Table grouped by date */}
        <div className="overflow-y-auto flex-1">
          {filteredRows.length === 0 ? (
            <div className="py-16 text-center">
              <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
                <Banknote size={24} className="text-slate-300" />
              </div>
              <p className="text-slate-500 font-medium">{hasFilters ? 'Нет записей по выбранным фильтрам' : 'Нет данных'}</p>
              {hasFilters && (
                <button onClick={resetFilters} className="mt-2 text-sm text-emerald-600 hover:text-emerald-700 font-medium">Сбросить фильтры</button>
              )}
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {groupedByDate.map(([dateKey, dateRows]) => {
                const dateSum = dateRows.reduce((s, r) => s + getBonusAmount(r), 0);
                return (
                  <div key={dateKey} className="bg-white">
                    <div className="sticky top-0 z-10 bg-slate-100/95 backdrop-blur px-3 py-1.5 flex items-center justify-between border-b border-slate-200">
                      <span className="font-semibold text-slate-700 text-xs">{formatDateKey(dateKey)}</span>
                      <span className="text-[10px] text-slate-500 bg-slate-200/80 px-1.5 py-0.5 rounded shrink-0">
                        {dateRows.length} зап. · {new Intl.NumberFormat('ru-RU').format(dateSum)} сум.
                      </span>
                    </div>
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-slate-50/80">
                          <th className="text-left px-2 py-1.5 font-semibold text-slate-600 min-w-[140px]">Врач</th>
                          <th className="text-left px-2 py-1.5 font-semibold text-slate-600 min-w-[70px]">ЛПУ Аб</th>
                          <th className="text-left px-2 py-1.5 font-semibold text-slate-600 min-w-[70px]">Спец.</th>
                          <th className="text-right px-2 py-1.5 font-semibold text-slate-600 min-w-[60px]">Сумма</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dateRows.map((row, i) => {
                          const lpu = getLpuDisplay(row);
                          const amount = getBonusAmount(row);
                          return (
                            <tr key={i} className={`border-t border-slate-50 hover:bg-emerald-50/30 transition-colors ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'}`}>
                              <td className="px-2 py-1.5 font-medium text-slate-800 truncate max-w-[160px]" title={getVal(row, COLUMN_MATCHERS.DOCTOR)}>
                                {getVal(row, COLUMN_MATCHERS.DOCTOR) || <span className="text-slate-300">—</span>}
                              </td>
                              <td className="px-2 py-1.5 text-slate-600 whitespace-nowrap" title={lpu.full !== lpu.display ? lpu.full : undefined}>
                                {lpu.display}
                              </td>
                              <td className="px-2 py-1.5 text-slate-600 truncate max-w-[90px]" title={getVal(row, COLUMN_MATCHERS.SPECIALTY)}>
                                {getVal(row, COLUMN_MATCHERS.SPECIALTY) || <span className="text-slate-300">—</span>}
                              </td>
                              <td className="px-2 py-1.5 text-right tabular-nums font-medium text-emerald-700">
                                {amount > 0 ? new Intl.NumberFormat('ru-RU').format(amount) : <span className="text-slate-300">—</span>}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="px-3 py-1.5 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-xs text-slate-500 shrink-0">
          <span>
            {filteredRows.length} из {rows.length} зап. · {new Intl.NumberFormat('ru-RU').format(totalSum)} сум.
            {hasFilters && ' (фильтр)'}
          </span>
        </div>
      </div>
    </div>
  );
};

// ── Full Cycle Modal (Вч с дог. — врачи с договором + визиты + рецепты) ──────

interface FullCycleModalProps {
  state: ModalState;
  contractsData: GenericRow[];
  recipesData: GenericRow[];
  selectedPeriods?: string[];
  availableMonths?: string[];
  onClose: () => void;
}

const monthShort: Record<string, string> = {
  '01': 'Янв', '02': 'Фев', '03': 'Мар', '04': 'Апр', '05': 'Май', '06': 'Июн',
  '07': 'Июл', '08': 'Авг', '09': 'Сен', '10': 'Окт', '11': 'Ноя', '12': 'Дек',
};

const FullCycleModal: React.FC<FullCycleModalProps> = ({ state, contractsData, recipesData, selectedPeriods = [], availableMonths = [], onClose }) => {
  const { emp, colKey, colLabel } = state;
  const fmt = (n: number) => new Intl.NumberFormat('ru-RU').format(n);
  const value = emp[colKey as keyof EmployeeSummary] as number | undefined;
  const mpKey = normalizeLinkKey(emp.name);
  const groupKey = normalizeLinkKey(emp.group || '');
  const isManager = String((emp as EmployeeSummary & { role?: string }).role ?? '').toLowerCase() === 'менеджер';

  const period = selectedPeriods?.[0];
  const { fullCycleDoctors, doctorContractVsRecipeWithMonths } = useMemo(() => {
    const contractsByDoc = new Map<string, GenericRow[]>();
    contractsData.forEach(row => {
      const rowEmp = normalizeLinkKey(getVal(row, COLUMN_MATCHERS.EMPLOYEE));
      const rowGroup = normalizeLinkKey(getVal(row, COLUMN_MATCHERS.GROUP));
      const byEmp = rowEmp && rowEmp === mpKey;
      const byGroup = groupKey && rowGroup === groupKey && !rowEmp;
      if (!byEmp && !byGroup) return;
      const docKey = normalizeLinkKey(getVal(row, COLUMN_MATCHERS.DOCTOR));
      if (!docKey) return;
      if (!contractsByDoc.has(docKey)) contractsByDoc.set(docKey, []);
      contractsByDoc.get(docKey)!.push(row);
    });
    const recipesByDoc = new Map<string, GenericRow[]>();
    recipesData.forEach(row => {
      const rowGroup = normalizeLinkKey(getVal(row, COLUMN_MATCHERS.GROUP));
      const rowEmp = normalizeLinkKey(getVal(row, COLUMN_MATCHERS.EMPLOYEE));
      const byGroup = groupKey && rowGroup === groupKey;
      const byEmp = rowEmp === mpKey;
      if (!byGroup && !byEmp) return;
      const docKey = normalizeLinkKey(getVal(row, COLUMN_MATCHERS.DOCTOR));
      if (!docKey) return;
      if (!recipesByDoc.has(docKey)) recipesByDoc.set(docKey, []);
      recipesByDoc.get(docKey)!.push(row);
    });
    const list: DoctorInteraction[] = [];
    const doctors = emp.doctors;
    if (!doctors || !doctors.forEach) return { fullCycleDoctors: [], doctorContractVsRecipeWithMonths: new Map<string, import('../types').ContractRecipeMatchRowWithMonths[]>() };
    doctors.forEach(doc => {
      const docKey = normalizeLinkKey(doc.doctorName);
      const hasContract = (contractsByDoc.get(docKey) ?? []).length > 0;
      const hasRecipe = (recipesByDoc.get(docKey) ?? []).length > 0;
      const hasVisits = doc.visitCount > 0 || isManager;
      if (hasContract && hasVisits && hasRecipe) list.push(doc);
    });
    const sorted = list.sort((a, b) => (b.bonusAmount + b.visitCount) - (a.bonusAmount + a.visitCount));
    const matchMap = new Map<string, import('../types').ContractRecipeMatchRowWithMonths[]>();
    sorted.forEach(doc => {
      const docKey = normalizeLinkKey(doc.doctorName);
      const contractItems = contractsByDoc.get(docKey) ?? [];
      const recipeItems = recipesByDoc.get(docKey) ?? [];
      const match = getContractVsRecipeMatchWithMonths(contractItems, recipeItems, period);
      matchMap.set(docKey, match);
    });
    return { fullCycleDoctors: sorted, doctorContractVsRecipeWithMonths: matchMap };
  }, [emp, contractsData, recipesData, mpKey, groupKey, isManager, period]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden border border-slate-200" onClick={e => e.stopPropagation()}>
        <div className="bg-gradient-to-br from-emerald-600 to-teal-700 px-6 py-4 shrink-0">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <CheckCircle size={18} className="text-emerald-200" />
                <span className="text-xs font-medium text-emerald-200 uppercase tracking-wider">{colLabel}</span>
              </div>
              <h3 className="text-lg font-bold text-white leading-tight">{emp.name}</h3>
              <p className="text-sm text-emerald-200 mt-0.5">{[emp.region, emp.group].filter(Boolean).join(' · ')}</p>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <div className="bg-white/20 rounded-xl px-4 py-2 text-center">
                <span className="text-2xl font-bold text-white tabular-nums">{value != null ? fmt(value) : '—'}</span>
                <p className="text-[10px] text-emerald-200 uppercase tracking-wide">врачей</p>
              </div>
              <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/20 text-white transition-colors">
                <X size={20} />
              </button>
            </div>
          </div>
        </div>
        <div className="overflow-y-auto flex-1">
          {fullCycleDoctors.length === 0 ? (
            <div className="py-16 text-center">
              <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
                <CheckCircle size={24} className="text-slate-300" />
              </div>
              <p className="text-slate-500 font-medium">Нет врачей с полным циклом</p>
              <p className="text-xs text-slate-400 mt-1">Договор + визиты + рецепты по группе</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-200">
              {fullCycleDoctors.map((doc, i) => {
                const docKey = normalizeLinkKey(doc.doctorName);
                const matchRows = doctorContractVsRecipeWithMonths.get(docKey) ?? [];
                const history = doc.history ?? {};
                const monthsFromNomenclature = new Set<string>();
                matchRows.forEach(r => Object.keys(r.byMonth ?? {}).forEach(m => monthsFromNomenclature.add(m)));
                const allMonths = period?.includes('-Q')
                  ? getMonthsInQuarter(period)
                  : period && period !== 'All'
                    ? [period]
                    : [...new Set([...Object.keys(history), ...monthsFromNomenclature])].sort();
                const monthLabels = allMonths.map(m => {
                  const [, mo] = m.split('-');
                  return { key: m, label: `${monthShort[mo] ?? mo} ${m.slice(2, 4)}` };
                });
                const fmtUvc = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1).replace('.0', '')}k` : String(n));
                return (
                  <div key={doc.doctorName} className={i > 0 ? 'pt-3' : ''}>
                    <div className="px-2 py-1.5 bg-slate-100 font-semibold text-slate-800 text-[11px] flex items-center gap-2">
                      <span className="truncate max-w-[180px]" title={doc.doctorName}>{doc.doctorName}</span>
                      <span className="text-slate-500 font-normal">{doc.institution ? abbreviateLpuName(doc.institution) : '—'}</span>
                      <span className="text-slate-500 font-normal">{doc.specialty || '—'}</span>
                    </div>
                    {/* Таблица Виз / УВК по месяцам */}
                    {allMonths.length > 0 && (
                      <table className="w-full text-[11px] border-collapse">
                        <thead>
                          <tr className="bg-slate-50">
                            <th className="text-left px-2 py-1 font-semibold text-slate-500 w-12 border-b border-slate-200"></th>
                            {monthLabels.map(({ key, label }) => (
                              <th key={key} className="px-1.5 py-1 font-semibold text-slate-500 text-center border-b border-slate-200 whitespace-nowrap">{label}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          <tr className="border-b border-slate-100">
                            <td className="px-2 py-1 font-medium text-slate-600 border-r border-slate-100">Виз</td>
                            {allMonths.map(m => {
                              const v = history[m]?.visits ?? 0;
                              return (
                                <td key={m} className={`px-1.5 py-1 text-center tabular-nums ${v > 0 ? 'text-blue-700 font-medium' : 'text-slate-400'}`}>
                                  {v}
                                </td>
                              );
                            })}
                          </tr>
                          <tr className="border-b border-slate-200">
                            <td className="px-2 py-1 font-medium text-slate-600 border-r border-slate-100">УВК</td>
                            {allMonths.map(m => {
                              const u = history[m]?.bonuses ?? 0;
                              return (
                                <td key={m} className={`px-1.5 py-1 text-center tabular-nums text-[10px] ${u > 0 ? 'text-emerald-700 font-medium' : 'text-slate-400'}`}>
                                  {fmtUvc(u)}
                                </td>
                              );
                            })}
                          </tr>
                        </tbody>
                      </table>
                    )}
                    {/* Таблица номенклатуры по месяцам */}
                    <table className="w-full text-[11px] border-collapse mt-0.5">
                      <thead>
                        <tr className="bg-slate-50">
                          <th className="text-left px-2 py-1 font-semibold text-slate-500 border-b border-slate-200">Номенклатура</th>
                          <th className="text-right px-2 py-1 font-semibold text-slate-500 w-14 border-b border-slate-200">Кол-во</th>
                          {monthLabels.map(({ key, label }) => (
                            <th key={key} className="px-1.5 py-1 font-semibold text-slate-500 text-center border-b border-slate-200 whitespace-nowrap">{label}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {matchRows.map((row, idx) => (
                          <tr key={idx} className={`border-b border-slate-100 ${row.hasPrescribed ? 'hover:bg-slate-50/50' : 'bg-red-50/30'}`}>
                            <td className="px-2 py-1 text-slate-700 truncate max-w-[220px] border-r border-slate-100" title={row.contractNomenclature}>{row.contractNomenclature || '—'}</td>
                            <td className="px-2 py-1 text-right tabular-nums border-r border-slate-100">{row.contractQty ?? '—'}</td>
                            {allMonths.map(m => {
                              const d = row.byMonth?.[m] as { hasPrescribed: boolean; recipeQty: number } | undefined;
                              const qty = d?.recipeQty ?? 0;
                              const has = d?.hasPrescribed ?? false;
                              return (
                                <td key={m} className={`px-1.5 py-1 text-center tabular-nums ${has && qty > 0 ? 'bg-emerald-50 text-emerald-700 font-medium' : 'text-slate-400'}`}>
                                  {qty}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div className="px-3 py-1.5 border-t border-slate-200 bg-slate-50 text-xs text-slate-500 shrink-0">
          {fullCycleDoctors.length} врачей с полным циклом
        </div>
      </div>
    </div>
  );
};

// ── Potential Modal (Потенциал — врачи из базы, которых можно добавить) ─────

interface PotentialModalProps {
  state: ModalState;
  visitsData: GenericRow[];
  bonusesData: GenericRow[];
  doctorsData: GenericRow[];
  assignments?: EmployeeCoverageAssignment[];
  onClose: () => void;
}

const PotentialModal: React.FC<PotentialModalProps> = ({ state, visitsData, bonusesData, doctorsData, assignments, onClose }) => {
  const { emp, colKey, colLabel } = state;
  const value = emp[colKey as keyof EmployeeSummary] as number | undefined;

  const [filterInstitutions, setFilterInstitutions] = useState<string[]>([]);
  const [filterSpecialties, setFilterSpecialties] = useState<string[]>([]);
  const [searchDoctor, setSearchDoctor] = useState('');

  const potentialDoctors = useMemo(() => {
    if (!doctorsData || doctorsData.length === 0) return [];
    const analysis = buildDoctorCoverageAnalysis(emp, visitsData, bonusesData, doctorsData, assignments);
    const list: DoctorCoverageCandidate[] = [];
    analysis.institutions.forEach(inst => {
      inst.specialties.forEach(spec => {
        spec.potentialDoctors.forEach(d => list.push(d));
      });
    });
    return list.sort((a, b) => {
      const ic = (a.institution || '').localeCompare(b.institution || '', 'ru');
      if (ic !== 0) return ic;
      const sc = (a.specialty || '').localeCompare(b.specialty || '', 'ru');
      if (sc !== 0) return sc;
      return (a.doctorName || '').localeCompare(b.doctorName || '', 'ru');
    });
  }, [emp, visitsData, bonusesData, doctorsData, assignments]);

  const filterOptions = useMemo(() => {
    const institutions = new Set<string>();
    const specialties = new Set<string>();
    potentialDoctors.forEach(d => {
      if (d.institution) institutions.add(d.institution);
      if (d.specialty) specialties.add(d.specialty);
    });
    return {
      institutions: Array.from(institutions).sort(),
      specialties: Array.from(specialties).sort(),
    };
  }, [potentialDoctors]);

  const filteredDoctors = useMemo(() => {
    let list = [...potentialDoctors];
    if (filterInstitutions.length > 0) {
      const set = new Set(filterInstitutions);
      list = list.filter(d => set.has(d.institution || ''));
    }
    if (filterSpecialties.length > 0) {
      const set = new Set(filterSpecialties);
      list = list.filter(d => set.has(d.specialty || ''));
    }
    if (searchDoctor.trim()) {
      const q = searchDoctor.toLowerCase().trim();
      list = list.filter(d => (d.doctorName || '').toLowerCase().includes(q));
    }
    return list;
  }, [potentialDoctors, filterInstitutions, filterSpecialties, searchDoctor]);

  const hasFilters = !!(filterInstitutions.length || filterSpecialties.length || searchDoctor.trim());

  const resetFilters = () => {
    setFilterInstitutions([]);
    setFilterSpecialties([]);
    setSearchDoctor('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[92vh] flex flex-col overflow-hidden border border-slate-200" onClick={e => e.stopPropagation()}>
        <div className="bg-gradient-to-br from-amber-500 to-orange-600 px-6 py-4 shrink-0">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Sparkles size={18} className="text-amber-100" />
                <span className="text-xs font-medium text-amber-100 uppercase tracking-wider">{colLabel}</span>
              </div>
              <h3 className="text-lg font-bold text-white leading-tight">{emp.name}</h3>
              <p className="text-sm text-amber-100 mt-0.5">{[emp.region, emp.group].filter(Boolean).join(' · ')}</p>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <div className="bg-white/20 rounded-xl px-4 py-2 text-center">
                <span className="text-2xl font-bold text-white tabular-nums">{fmt(value)}</span>
                <p className="text-[10px] text-amber-100 uppercase tracking-wide">врачей</p>
              </div>
              <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/20 text-white transition-colors">
                <X size={20} />
              </button>
            </div>
          </div>
        </div>
        {/* Filters */}
        {potentialDoctors.length > 0 && (
          <div className="px-3 py-2 border-b border-slate-200 bg-slate-50 shrink-0">
            <div className="flex items-center gap-2 mb-1.5">
              <Filter size={12} className="text-slate-500" />
              <span className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide">Фильтры</span>
              {hasFilters && (
                <button onClick={resetFilters} className="ml-auto text-xs text-amber-600 hover:text-amber-700 font-medium">
                  Сбросить
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-2 items-center">
              {filterOptions.institutions.length > 0 && <MultiSelectDropdown label="ЛПУ" options={filterOptions.institutions.map(i => ({ value: i, label: i }))} selected={filterInstitutions} onChange={setFilterInstitutions} placeholder="Все ЛПУ" />}
              {filterOptions.specialties.length > 0 && <MultiSelectDropdown label="Специальность" options={filterOptions.specialties.map(s => ({ value: s, label: s }))} selected={filterSpecialties} onChange={setFilterSpecialties} placeholder="Все спец." />}
              <div className="relative flex-1 min-w-[120px]">
                <Search size={10} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Поиск по врачу..."
                  value={searchDoctor}
                  onChange={e => setSearchDoctor(e.target.value)}
                  className="w-full pl-6 pr-2 py-1 text-xs border border-slate-200 rounded bg-white focus:ring-2 focus:ring-amber-500"
                />
              </div>
            </div>
          </div>
        )}
        <div className="overflow-y-auto flex-1">
          {potentialDoctors.length === 0 ? (
            <div className="py-16 text-center">
              <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
                <Sparkles size={24} className="text-slate-300" />
              </div>
              <p className="text-slate-500 font-medium">Нет данных о потенциале</p>
              <p className="text-xs text-slate-400 mt-1">Требуется база врачей для расчёта</p>
            </div>
          ) : filteredDoctors.length === 0 ? (
            <div className="py-16 text-center">
              <p className="text-slate-500 font-medium">Нет врачей по выбранным фильтрам</p>
              <button onClick={resetFilters} className="mt-2 text-sm text-amber-600 hover:text-amber-700 font-medium">
                Сбросить фильтры
              </button>
            </div>
          ) : (
            <table className="w-full text-xs">
              <thead className="bg-slate-50 sticky top-0">
                <tr>
                  <th className="text-left px-2 py-1.5 font-semibold text-slate-600 min-w-[160px]">Врач</th>
                  <th className="text-left px-2 py-1.5 font-semibold text-slate-600 min-w-[200px]">Учреждение</th>
                  <th className="text-left px-2 py-1.5 font-semibold text-slate-600 min-w-[100px]">Спец.</th>
                </tr>
              </thead>
              <tbody>
                {filteredDoctors.map((d, i) => (
                  <tr key={`${d.doctorName}-${d.institution}-${i}`} className={`border-t border-slate-50 hover:bg-amber-50/30 transition-colors ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'}`}>
                    <td className="px-2 py-1.5 font-medium text-slate-800 truncate max-w-[180px]" title={d.doctorName}>{d.doctorName}</td>
                    <td className="px-2 py-1.5 max-w-[240px]" title={d.institution}>
                      {d.institution ? (
                        <div>
                          <span className="font-medium text-slate-700">{abbreviateLpuName(d.institution)}</span>
                          {abbreviateLpuName(d.institution) !== d.institution && (
                            <div className="text-[10px] text-slate-400 truncate leading-tight">{d.institution}</div>
                          )}
                        </div>
                      ) : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-2 py-1.5 text-slate-600 truncate max-w-[120px]" title={d.specialty}>{d.specialty || <span className="text-slate-300">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="px-3 py-1.5 border-t border-slate-200 bg-slate-50 text-xs text-slate-500 shrink-0">
          {potentialDoctors.length > 0
            ? `${filteredDoctors.length} из ${potentialDoctors.length} в потенциале${hasFilters ? ' (фильтр)' : ''}`
            : 'Нет данных'}
        </div>
      </div>
    </div>
  );
};

// ── Main component ──────────────────────────────────────────────────────────

export const MPList: React.FC<Props> = ({
  data, onSelect,
  availableMonths = [], selectedPeriods = [], onPeriodChange,
  visitsData = [], bonusesData = [], contractsData = [], recipesData = [], doctorsData = [],
  savedAssignmentsMap = {},
}) => {
  const [search, setSearch] = useState('');
  const [filterRegions, setFilterRegions] = useState<string[]>([]);
  const [filterGroups, setFilterGroups] = useState<string[]>([]);
  const [modal, setModal] = useState<ModalState | null>(null);

  const employees = useMemo(
    () => data.filter(e => String((e as any).role ?? '').toLowerCase().trim() !== 'менеджер'),
    [data]
  );

  const allRegions = useMemo(() => {
    const set = new Set<string>();
    employees.forEach(e => { if (e.region) set.add(e.region); });
    return Array.from(set).sort(regionSort);
  }, [employees]);

  const allGroups = useMemo(() => {
    const set = new Set<string>();
    employees.forEach(e => { if (e.group) set.add(e.group); });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [employees]);

  const visibleGroups = useMemo(() => {
    if (filterRegions.length === 0) return allGroups;
    const set = new Set<string>();
    const regionSet = new Set(filterRegions);
    employees.forEach(e => { if (e.group && regionSet.has(e.region || '')) set.add(e.group); });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [allGroups, employees, filterRegions]);

  const filtered = useMemo(() => {
    let list = [...employees];
    if (filterRegions.length > 0) {
      const regionSet = new Set(filterRegions);
      list = list.filter(e => regionSet.has(e.region || ''));
    }
    if (filterGroups.length > 0) {
      const groupSet = new Set(filterGroups);
      list = list.filter(e => groupSet.has(e.group || ''));
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(e => e.name.toLowerCase().includes(q));
    }
    return list.sort((a, b) => {
      const rc = regionSort(a.region || '', b.region || '');
      if (rc !== 0) return rc;
      const gc = (a.group || '').localeCompare(b.group || '');
      if (gc !== 0) return gc;
      return a.name.localeCompare(b.name, 'ru');
    });
  }, [employees, filterRegions, filterGroups, search]);

  const hasFilters = !!(filterRegions.length || filterGroups.length || search);

  // Only months (no quarters), sorted descending
  const validPeriods = useMemo(
    () => availableMonths.filter(m => isMonthKey(m)).sort((a, b) => a.localeCompare(b)),
    [availableMonths]
  );

  const periodOptions = useMemo(
    () => [
      { value: 'All', label: 'За всё время' },
      ...validPeriods.map(m => ({ value: m, label: formatPeriod(m) })),
    ],
    [validPeriods]
  );

  const handlePeriodChange = (next: string[]) => {
    const hasAll = next.includes('All');
    const months = next.filter(x => x !== 'All');
    if (hasAll && months.length > 0) {
      onPeriodChange?.(['All']);
    } else if (hasAll) {
      onPeriodChange?.(next);
    } else {
      onPeriodChange?.(months);
    }
  };

  return (
    <>
      {modal && (
        VISIT_MODAL_KEYS.includes(modal.colKey) ? (
          <VisitsModal
            state={modal}
            visitsData={visitsData}
            bonusesData={bonusesData}
            recipesData={recipesData}
            onClose={() => setModal(null)}
          />
        ) : CONTRACT_MODAL_KEYS.includes(modal.colKey) ? (
          <ContractsModal
            state={modal}
            contractsData={contractsData}
            onClose={() => setModal(null)}
          />
        ) : BONUS_MODAL_KEYS.includes(modal.colKey) ? (
          <BonusesModal
            state={modal}
            bonusesData={bonusesData}
            visitsData={visitsData}
            onClose={() => setModal(null)}
          />
        ) : FULL_CYCLE_MODAL_KEYS.includes(modal.colKey) ? (
          <FullCycleModal
            state={modal}
            contractsData={contractsData}
            recipesData={recipesData}
            selectedPeriods={selectedPeriods}
            availableMonths={availableMonths}
            onClose={() => setModal(null)}
          />
        ) : POTENTIAL_MODAL_KEYS.includes(modal.colKey) ? (
          <PotentialModal
            state={modal}
            visitsData={visitsData}
            bonusesData={bonusesData}
            doctorsData={doctorsData}
            assignments={savedAssignmentsMap[normalizeLinkKey(modal.emp.name)]}
            onClose={() => setModal(null)}
          />
        ) : (
          <StatModal
            state={modal}
            visitsData={visitsData}
            bonusesData={bonusesData}
            contractsData={contractsData}
            recipesData={recipesData}
            onClose={() => setModal(null)}
          />
        )
      )}

      <div className="space-y-3">
        {/* Filters */}
        <div className="relative z-10 bg-white rounded-xl border border-slate-200 overflow-visible">
          <div className="px-4 py-2 flex flex-wrap gap-2 border-b border-slate-100">
            {(validPeriods.length > 0 || periodOptions.length > 1) && onPeriodChange && (
              <MultiSelectDropdown
                label="Период"
                options={periodOptions}
                selected={selectedPeriods.length === 0 ? ['All'] : selectedPeriods}
                onChange={handlePeriodChange}
                placeholder="За всё время"
                buttonLabel={selectedPeriods.length === 0 || (selectedPeriods.length === 1 && selectedPeriods[0] === 'All') ? 'За всё время' : `${selectedPeriods.length} выбрано`}
                icon={<Calendar size={12} className="text-slate-400" />}
                maxHeight="max-h-64"
              />
            )}
            {allRegions.length > 0 && (
              <MultiSelectDropdown
                label="Регион"
                options={allRegions.map(r => ({ value: r, label: r }))}
                selected={filterRegions}
                onChange={setFilterRegions}
                placeholder="Все регионы"
                icon={<MapPin size={12} className="text-slate-400" />}
              />
            )}
            {visibleGroups.length > 0 && (
              <MultiSelectDropdown
                label="Группа"
                options={visibleGroups.map(g => ({ value: g, label: g }))}
                selected={filterGroups}
                onChange={setFilterGroups}
                placeholder="Все группы"
              />
            )}
          </div>

          <div className="flex items-center gap-2 px-4 py-2.5 border-t border-slate-100">
            <div className="relative flex-1 min-w-[180px]">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                type="text"
                placeholder="Поиск по имени..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-7 pr-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white placeholder:text-slate-300 hover:border-slate-300 transition-colors"
              />
            </div>
            {hasFilters && (
              <button
                onClick={() => { setFilterRegions([]); setFilterGroups([]); setSearch(''); }}
                className="px-3 py-1.5 text-xs text-slate-500 hover:text-dark-DEFAULT border border-slate-200 rounded-lg hover:border-slate-300 transition-colors bg-white shrink-0"
              >
                Сбросить
              </button>
            )}
            <span className="ml-auto text-xs text-slate-400 shrink-0 hidden xl:inline">
              {filtered.length} МП
            </span>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          {filtered.length === 0 ? (
            <div className="py-12 text-center">
              <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center mx-auto mb-3">
                <Search size={18} className="text-slate-300" />
              </div>
              <p className="text-sm text-slate-400">Сотрудники не найдены</p>
            </div>
          ) : (
            <div className="overflow-x-hidden">
              <table className="w-full text-xs table-fixed">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="text-left px-3 py-2 font-semibold text-slate-600 w-[22%]">
                      Сотрудник
                    </th>
                    <th className="text-left px-2 py-2 font-semibold text-slate-600 w-[9%] whitespace-nowrap">Территория</th>
                    <th className="text-left px-2 py-2 font-semibold text-slate-600 w-[8%]">Группа</th>
                    {COLUMNS.map(col => (
                      <th key={col.key} className="text-right px-2 py-2 font-semibold text-slate-600 whitespace-nowrap" style={{ width: `${61 / COLUMNS.length}%` }}>
                        {col.short}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((emp, idx) => (
                    <tr
                      key={emp.id}
                      onClick={() => onSelect(emp)}
                      className={`cursor-pointer border-b border-slate-100 hover:bg-slate-50/80 transition-colors ${
                        idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'
                      }`}
                    >
                      <td className="px-3 py-1.5">
                        <div className="font-medium text-dark-DEFAULT truncate">{emp.name}</div>
                      </td>
                      <td className="px-2 py-1.5 text-slate-500 truncate">{emp.region || '—'}</td>
                      <td className="px-2 py-1.5 text-slate-500 truncate">{emp.group || '—'}</td>
                      {COLUMNS.map(col => {
                        const v = emp[col.key] as number | undefined;
                        const isZero = !v;
                        return (
                          <td
                            key={col.key}
                            className="px-2 py-1.5 text-right"
                            onClick={e => {
                              e.stopPropagation();
                              setModal({ emp, colKey: col.key as string, colLabel: col.label });
                            }}
                          >
                            <span className={`inline-block tabular-nums font-semibold rounded px-1 cursor-pointer transition-colors hover:bg-indigo-50 hover:text-indigo-700 ${
                              isZero ? 'text-slate-300' : 'text-dark-DEFAULT'
                            }`}>
                              {fmt(v)}
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
};
