import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, CalendarClock, ChevronDown, FileDown, Loader2, Pencil, Search, UserPlus, Users, X } from 'lucide-react';
import { EmployeeCoverageAssignment, EmployeeSummary, GenericRow, PlannedConnection } from '../types';
import {
  buildDoctorCoverageAnalysis,
  buildCoverageAssignmentsFromHistory,
  normalizeLinkKey,
  getValueByMatchers,
  abbreviateLpuName,
} from '../services/dataService';
import { COLUMN_MATCHERS } from '../constants';
import { loadEmployeeCoverageAssignments, loadPlannedConnections, savePlannedConnections } from '../services/supabaseDataService';
import { exportToExcel } from '../services/excelService';
import { useAuth } from '../context/AuthContext';

interface Props {
  employee: EmployeeSummary;
  visitsData: GenericRow[];
  bonusesData: GenericRow[];
  doctorsData: GenericRow[];
  contractsData?: GenericRow[];
  onBack: () => void;
}

interface FlatRow {
  region: string;
  institution: string;
  institutionAbbr: string;
  specialty: string;
  category: string;
  doctorName: string;
  status: 'covered' | 'potential';
}

// ── Multi-select dropdown ────────────────────────────────────────────────────

interface MultiSelectProps {
  label: string;
  options: string[];
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
}

const MultiSelect: React.FC<MultiSelectProps> = ({ label, options, value, onChange, placeholder = 'Все' }) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = useMemo(
    () => options.filter(o => o.toLowerCase().includes(search.toLowerCase())),
    [options, search]
  );

  const toggle = (opt: string) => {
    onChange(value.includes(opt) ? value.filter(v => v !== opt) : [...value, opt]);
  };

  const displayText = value.length === 0
    ? placeholder
    : value.length === 1
    ? value[0]
    : `${value[0]} +${value.length - 1}`;

  return (
    <div ref={ref} className="relative w-full">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg border text-sm transition-colors ${
          value.length > 0
            ? 'border-primary-300 bg-primary-50 text-primary-700'
            : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
        }`}
      >
        <span className="truncate text-left flex-1 min-w-0">
          <span className="text-xs text-slate-400 mr-1">{label}:</span>
          <span className="font-medium">{displayText}</span>
        </span>
        <div className="flex items-center gap-1 shrink-0">
          {value.length > 0 && (
            <span
              role="button"
              onClick={e => { e.stopPropagation(); onChange([]); }}
              className="w-4 h-4 rounded-full bg-primary-200 hover:bg-primary-300 flex items-center justify-center"
            >
              <X size={9} className="text-primary-700" />
            </span>
          )}
          <ChevronDown size={14} className={`text-slate-400 transition-transform shrink-0 ${open ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {open && (
        <div className="absolute z-[100] top-full mt-1 left-0 right-0 min-w-[280px] w-full max-w-[320px] bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden">
          {options.length > 8 && (
            <div className="p-2 border-b border-slate-100">
              <div className="relative">
                <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input
                  autoFocus
                  type="text"
                  placeholder="Поиск..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full pl-7 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-400"
                />
              </div>
            </div>
          )}
          <div className="max-h-56 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="px-3 py-2 text-xs text-slate-400">Ничего не найдено</p>
            ) : (
              filtered.map(opt => (
                <label
                  key={opt}
                  className="flex items-center gap-2.5 px-3 py-2 hover:bg-slate-50 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={value.includes(opt)}
                    onChange={() => toggle(opt)}
                    className="accent-primary-600 shrink-0"
                  />
                  <span className="text-sm text-slate-700 leading-tight">{opt}</span>
                </label>
              ))
            )}
          </div>
          {value.length > 0 && (
            <div className="border-t border-slate-100 p-2">
              <button
                onClick={() => { onChange([]); setOpen(false); }}
                className="w-full text-xs text-slate-500 hover:text-slate-700 py-1"
              >
                Снять все ({value.length})
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ── New Connection Modal ─────────────────────────────────────────────────────

interface NewConnectionModalProps {
  row: FlatRow;
  productOptions: string[];
  existingConnection?: PlannedConnection | null;
  onClose: () => void;
  onSave: (deadline: string, products: string[]) => Promise<void>;
  saving: boolean;
}

const NewConnectionModal: React.FC<NewConnectionModalProps> = ({ row, productOptions, existingConnection, onClose, onSave, saving }) => {
  const today = new Date().toISOString().split('T')[0];
  const [deadline, setDeadline] = useState(existingConnection?.deadline ?? '');
  const [products, setProducts] = useState<string[]>(existingConnection?.products ?? []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deadline) return;
    await onSave(deadline, products);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-visible">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <CalendarClock size={18} className="text-primary-500" />
            <h3 className="font-bold text-dark-DEFAULT">{existingConnection ? 'Редактирование подключения' : 'Новое подключение'}</h3>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Doctor info */}
          <div className="bg-slate-50 rounded-xl p-4 space-y-2 text-sm">
            <div className="flex gap-2">
              <span className="text-slate-400 w-28 shrink-0">Врач</span>
              <span className="font-semibold text-dark-DEFAULT">{row.doctorName}</span>
            </div>
            <div className="flex gap-2">
              <span className="text-slate-400 w-28 shrink-0">Учреждение</span>
              <span className="text-slate-600">{row.institution}</span>
            </div>
            <div className="flex gap-2">
              <span className="text-slate-400 w-28 shrink-0">Специальность</span>
              <span className="text-slate-600">{row.specialty}</span>
            </div>
          </div>

          {/* Products + Deadline */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-dark-DEFAULT mb-1.5">
                Продукты для договора
              </label>
              <MultiSelect
                label="Продукты"
                options={productOptions}
                value={products}
                onChange={setProducts}
                placeholder="Выберите продукты..."
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-dark-DEFAULT mb-1.5">
                Срок подключения
              </label>
              <input
                type="date"
                value={deadline}
                min={today}
                onChange={e => setDeadline(e.target.value)}
                required
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none bg-white"
              />
            </div>

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50 transition-colors"
              >
                Отмена
              </button>
              <button
                type="submit"
                disabled={saving || !deadline}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg text-sm font-medium hover:bg-primary-600 disabled:opacity-60 transition-colors"
              >
                {saving ? <Loader2 size={15} className="animate-spin" /> : <CalendarClock size={15} />}
                {existingConnection ? 'Сохранить' : 'Запланировать'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

// ── Main component ───────────────────────────────────────────────────────────

export const EmployeeCoveragePage: React.FC<Props> = ({
  employee, visitsData, bonusesData, doctorsData, contractsData = [], onBack,
}) => {
  const { isAdmin, canAccessRegion, canAccessGroup } = useAuth();
  const canPlan = isAdmin || (
    canAccessRegion(employee.region ?? '') && canAccessGroup(employee.group ?? '')
  );
  const [assignments, setAssignments] = useState<EmployeeCoverageAssignment[]>([]);
  const [loadingAssignments, setLoadingAssignments] = useState(true);
  const [filterRegions, setFilterRegions]           = useState<string[]>([]);
  const [filterInstitutions, setFilterInstitutions] = useState<string[]>([]);
  const [filterSpecialties, setFilterSpecialties]   = useState<string[]>([]);
  const [filterInstitutionAbbr, setFilterInstitutionAbbr] = useState<string[]>([]);
  const [filterCategory, setFilterCategory]        = useState<string[]>([]);
  const [filterStatus, setFilterStatus]            = useState<string[]>([]);
  const [searchDoctor, setSearchDoctor]             = useState('');

  // Planned connections state
  const [plannedConnections, setPlannedConnections] = useState<PlannedConnection[]>([]);
  const [modalRow, setModalRow] = useState<FlatRow | null>(null);
  const [editingConnection, setEditingConnection] = useState<PlannedConnection | null>(null);
  const [savingConnection, setSavingConnection] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoadingAssignments(true);
      try {
        const [map, connections] = await Promise.all([
          loadEmployeeCoverageAssignments(),
          loadPlannedConnections(),
        ]);
        if (cancelled) return;
        const stored = map[employee.id];
        setAssignments(
          stored?.length
            ? stored
            : buildCoverageAssignmentsFromHistory(employee, visitsData, bonusesData)
        );
        setPlannedConnections(connections);
      } catch {
        if (!cancelled) setAssignments([]);
      } finally {
        if (!cancelled) setLoadingAssignments(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [employee, visitsData, bonusesData]);

  const analysis = useMemo(
    () => buildDoctorCoverageAnalysis(employee, visitsData, bonusesData, doctorsData, assignments),
    [employee, visitsData, bonusesData, doctorsData, assignments]
  );

  // Build lookups from doctorsData: institution→region, doctor→{abbr, category} (по врачу, без привязки к учреждению)
  const { institutionRegionMap, doctorExtras } = useMemo(() => {
    const regionMap = new Map<string, string>();
    const extrasMap = new Map<string, { institutionAbbr: string; category: string }>();
    const abKeys = ['аб', 'аббр', 'аббревиатура', 'лпу аб', 'сокр'];
    const catKeys = ['категория', 'категор', 'разряд'];
    const getAbbr = (row: GenericRow, inst: string) => {
      for (const m of abKeys) {
        const key = Object.keys(row).find(k => k.toLowerCase().trim().includes(m));
        if (key) { const v = String(row[key] ?? '').trim(); if (v) return v; }
      }
      return abbreviateLpuName(inst);
    };
    const getCategory = (row: GenericRow) => {
      for (const m of catKeys) {
        const key = Object.keys(row).find(k => k.toLowerCase().trim().includes(m));
        if (key) { const v = String(row[key] ?? '').trim(); if (v) return v; }
      }
      return '';
    };
    doctorsData.forEach(row => {
      const inst = getValueByMatchers(row, COLUMN_MATCHERS.INSTITUTION_FULL) ?? getValueByMatchers(row, COLUMN_MATCHERS.INSTITUTION) ?? '';
      const region = getValueByMatchers(row, COLUMN_MATCHERS.REGION) ?? '';
      const doctor = getValueByMatchers(row, COLUMN_MATCHERS.DOCTOR) ?? '';
      if (inst && region) regionMap.set(normalizeLinkKey(inst), region);
      if (doctor) {
        const docKey = normalizeLinkKey(doctor);
        if (!extrasMap.has(docKey)) {
          extrasMap.set(docKey, {
            institutionAbbr: getAbbr(row, inst),
            category: getCategory(row),
          });
        }
      }
    });
    return { institutionRegionMap: regionMap, doctorExtras: extrasMap };
  }, [doctorsData]);

  // Flatten all doctors into rows — only keep rows matching the employee's region
  const allRows = useMemo<FlatRow[]>(() => {
    const empRegion = (employee.region ?? '').toLowerCase().trim();
    const rows: FlatRow[] = [];
    for (const inst of analysis.institutions) {
      const region = institutionRegionMap.get(normalizeLinkKey(inst.institution)) ?? '';
      if (empRegion && region && region.toLowerCase().trim() !== empRegion) continue;
      for (const spec of inst.specialties) {
        for (const d of spec.coveredDoctors) {
          const ex = doctorExtras.get(normalizeLinkKey(d.doctorName)) ?? { institutionAbbr: abbreviateLpuName(inst.institution), category: '' };
          rows.push({ region, institution: inst.institution, institutionAbbr: ex.institutionAbbr, specialty: spec.specialty, category: ex.category, doctorName: d.doctorName, status: 'covered' });
        }
        for (const d of spec.potentialDoctors) {
          const ex = doctorExtras.get(normalizeLinkKey(d.doctorName)) ?? { institutionAbbr: abbreviateLpuName(inst.institution), category: '' };
          rows.push({ region, institution: inst.institution, institutionAbbr: ex.institutionAbbr, specialty: spec.specialty, category: ex.category, doctorName: d.doctorName, status: 'potential' });
        }
      }
    }
    return rows;
  }, [analysis, institutionRegionMap, doctorExtras, employee.region]);

  // Available filter options (cascade)
  const regionOptions = useMemo(
    () => Array.from(new Set(allRows.map(r => r.region).filter(Boolean))).sort(),
    [allRows]
  );

  const institutionOptions = useMemo(() => {
    const src = filterRegions.length ? allRows.filter(r => filterRegions.includes(r.region)) : allRows;
    return Array.from(new Set(src.map(r => r.institution))).sort();
  }, [allRows, filterRegions]);

  const specialtyOptions = useMemo(() => {
    let src = allRows;
    if (filterRegions.length)      src = src.filter(r => filterRegions.includes(r.region));
    if (filterInstitutions.length) src = src.filter(r => filterInstitutions.includes(r.institution));
    return Array.from(new Set(src.map(r => r.specialty))).sort();
  }, [allRows, filterRegions, filterInstitutions]);

  const institutionAbbrOptions = useMemo(() => {
    let src = allRows;
    if (filterRegions.length)      src = src.filter(r => filterRegions.includes(r.region));
    if (filterInstitutions.length) src = src.filter(r => filterInstitutions.includes(r.institution));
    if (filterSpecialties.length)  src = src.filter(r => filterSpecialties.includes(r.specialty));
    return Array.from(new Set(src.map(r => r.institutionAbbr || '').filter(Boolean))).sort();
  }, [allRows, filterRegions, filterInstitutions, filterSpecialties]);

  const categoryOptions = useMemo(() => {
    let src = allRows;
    if (filterRegions.length)      src = src.filter(r => filterRegions.includes(r.region));
    if (filterInstitutions.length) src = src.filter(r => filterInstitutions.includes(r.institution));
    if (filterSpecialties.length)  src = src.filter(r => filterSpecialties.includes(r.specialty));
    if (filterInstitutionAbbr.length) src = src.filter(r => filterInstitutionAbbr.includes(r.institutionAbbr || ''));
    return Array.from(new Set(src.map(r => r.category || '').filter(Boolean))).sort();
  }, [allRows, filterRegions, filterInstitutions, filterSpecialties, filterInstitutionAbbr]);

  const statusOptions = ['Работает', 'Потенциал'];

  const filtered = useMemo(() => {
    let list = allRows;
    if (filterRegions.length)      list = list.filter(r => filterRegions.includes(r.region));
    if (filterInstitutions.length) list = list.filter(r => filterInstitutions.includes(r.institution));
    if (filterSpecialties.length)  list = list.filter(r => filterSpecialties.includes(r.specialty));
    if (filterInstitutionAbbr.length) list = list.filter(r => filterInstitutionAbbr.includes(r.institutionAbbr || ''));
    if (filterCategory.length)     list = list.filter(r => filterCategory.includes(r.category || ''));
    if (filterStatus.length)       list = list.filter(r =>
      filterStatus.includes(r.status === 'covered' ? 'Работает' : 'Потенциал')
    );
    if (searchDoctor.trim()) {
      const q = searchDoctor.toLowerCase();
      list = list.filter(r => r.doctorName.toLowerCase().includes(q));
    }
    return list;
  }, [allRows, filterRegions, filterInstitutions, filterSpecialties, filterInstitutionAbbr, filterCategory, filterStatus, searchDoctor]);

  const totalCovered   = allRows.filter(r => r.status === 'covered').length;
  const totalPotential = allRows.filter(r => r.status === 'potential').length;
  const coveredCount   = filtered.filter(r => r.status === 'covered').length;
  const potentialCount = filtered.filter(r => r.status === 'potential').length;

  const hasFilters = filterRegions.length > 0 || filterInstitutions.length > 0 ||
                     filterSpecialties.length > 0 || filterInstitutionAbbr.length > 0 ||
                     filterCategory.length > 0 || filterStatus.length > 0 || !!searchDoctor;

  const resetAll = () => {
    setFilterRegions([]);
    setFilterInstitutions([]);
    setFilterSpecialties([]);
    setFilterInstitutionAbbr([]);
    setFilterCategory([]);
    setFilterStatus([]);
    setSearchDoctor('');
  };

  // Уникальные продукты из договоров (сначала МП, затем все остальные)
  const productOptions = useMemo(() => {
    const forMp = new Set<string>();
    const all = new Set<string>();
    for (const row of contractsData) {
      const emp = getValueByMatchers(row, COLUMN_MATCHERS.EMPLOYEE)?.trim();
      const nom = getValueByMatchers(row, COLUMN_MATCHERS.NOMENCLATURE)?.trim();
      if (nom) {
        all.add(nom);
        if (emp && normalizeLinkKey(emp) === normalizeLinkKey(employee.name)) forMp.add(nom);
      }
    }
    const list = Array.from(forMp).length > 0 ? Array.from(forMp) : Array.from(all);
    return list.sort();
  }, [contractsData, employee.name]);

  // Map: normalized doctorName → latest PlannedConnection for this MP
  const plannedMap = useMemo(() => {
    const map = new Map<string, PlannedConnection>();
    // sort oldest→newest so the latest overwrites
    const sorted = [...plannedConnections]
      .filter(c => c.mpId === employee.id)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    sorted.forEach(c => map.set(normalizeLinkKey(c.doctorName), c));
    return map;
  }, [plannedConnections, employee.id]);

  const handleSaveConnection = async (deadline: string, products: string[]) => {
    if (!modalRow) return;
    setSavingConnection(true);
    setSaveError(null);
    try {
      let updated: PlannedConnection[];
      if (editingConnection) {
        updated = plannedConnections.map(c =>
          c.id === editingConnection.id
            ? { ...c, deadline, products: products.length > 0 ? products : undefined, institutionAbbr: modalRow.institutionAbbr || c.institutionAbbr, category: modalRow.category || c.category, region: modalRow.region || c.region }
            : c
        );
      } else {
        const newConnection: PlannedConnection = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          mpId: employee.id,
          mpName: employee.name,
          doctorName: modalRow.doctorName,
          institution: modalRow.institution,
          institutionAbbr: modalRow.institutionAbbr || undefined,
          specialty: modalRow.specialty,
          category: modalRow.category || undefined,
          region: modalRow.region || undefined,
          deadline,
          products: products.length > 0 ? products : undefined,
          outcome: null,
          comment: '',
          createdAt: new Date().toISOString(),
        };
        updated = [...plannedConnections, newConnection];
      }
      await savePlannedConnections(updated);
      setPlannedConnections(updated);
      setModalRow(null);
      setEditingConnection(null);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Ошибка сохранения');
    } finally {
      setSavingConnection(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-3">
        <div className="flex flex-wrap items-center gap-4">
          <button onClick={onBack} className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-dark-DEFAULT transition-colors">
            <ArrowLeft size={20} />
          </button>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold text-dark-DEFAULT">Потенциал базы врачей</h2>
            <p className="text-sm text-slate-500 mt-0.5">
              {employee.name}
              {employee.group  ? ` · ${employee.group}`  : ''}
              {employee.region ? ` · ${employee.region}` : ''}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm font-semibold">
              <Users size={14} />
              {totalCovered}
              <span className="font-normal text-emerald-600 text-xs">покрыто</span>
            </span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 border border-blue-200 text-blue-700 text-sm font-semibold">
              <UserPlus size={14} />
              {totalPotential}
              <span className="font-normal text-blue-600 text-xs">потенциал</span>
            </span>
          </div>
        </div>
      </div>

      {saveError && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
          {saveError}
        </div>
      )}

      {loadingAssignments ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-3 text-sm text-slate-500">
          Загрузка данных...
        </div>
      ) : assignments.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-10 text-center">
          <div className="mx-auto mb-4 w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-500">
            <UserPlus size={26} />
          </div>
          <h3 className="text-lg font-semibold text-dark-DEFAULT">Объекты не назначены</h3>
          <p className="text-sm text-slate-500 mt-2">Перейдите в раздел «Сотрудники → Объекты» и назначьте учреждения и специальности для этого МП.</p>
        </div>
      ) : allRows.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-10 text-center">
          <div className="mx-auto mb-4 w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-500">
            <UserPlus size={26} />
          </div>
          <h3 className="text-lg font-semibold text-dark-DEFAULT">Врачей не найдено</h3>
          <p className="text-sm text-slate-500 mt-2">По назначенным объектам и специальностям врачи не найдены в базе данных.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          {/* Filter bar */}
          <div className="px-4 py-3 border-b border-slate-100 flex flex-wrap gap-2 items-center">
            {regionOptions.length > 0 && (
              <div className="w-[150px] shrink-0">
                <MultiSelect
                  label="Область"
                  options={regionOptions}
                  value={filterRegions}
                  onChange={v => { setFilterRegions(v); setFilterInstitutions([]); setFilterSpecialties([]); setFilterInstitutionAbbr([]); setFilterCategory([]); }}
                />
              </div>
            )}
            <div className="w-[150px] shrink-0">
              <MultiSelect
                label="Учреждение"
                options={institutionOptions}
                value={filterInstitutions}
                onChange={v => { setFilterInstitutions(v); setFilterSpecialties([]); setFilterInstitutionAbbr([]); setFilterCategory([]); }}
              />
            </div>
            <div className="w-[150px] shrink-0">
              <MultiSelect
                label="Специальность"
                options={specialtyOptions}
                value={filterSpecialties}
                onChange={v => { setFilterSpecialties(v); setFilterInstitutionAbbr([]); setFilterCategory([]); }}
              />
            </div>
            {institutionAbbrOptions.length > 0 && (
              <div className="w-[150px] shrink-0">
                <MultiSelect
                  label="ЛПУ Аб"
                  options={institutionAbbrOptions}
                  value={filterInstitutionAbbr}
                  onChange={v => { setFilterInstitutionAbbr(v); setFilterCategory([]); }}
                />
              </div>
            )}
            {categoryOptions.length > 0 && (
              <div className="w-[150px] shrink-0">
                <MultiSelect
                  label="Категория"
                  options={categoryOptions}
                  value={filterCategory}
                  onChange={setFilterCategory}
                />
              </div>
            )}
            <div className="w-[150px] shrink-0">
              <MultiSelect
                label="Статус"
                options={statusOptions}
                value={filterStatus}
                onChange={setFilterStatus}
              />
            </div>

            <div className="relative flex-1 min-w-[160px]">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                type="text"
                placeholder="Поиск врача..."
                value={searchDoctor}
                onChange={e => setSearchDoctor(e.target.value)}
                className="w-full pl-7 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white placeholder:text-slate-300"
              />
            </div>

            {hasFilters && (
              <button
                onClick={resetAll}
                className="px-3 py-2 text-xs text-slate-500 hover:text-dark-DEFAULT border border-slate-200 rounded-lg bg-white shrink-0 whitespace-nowrap"
              >
                Сбросить
              </button>
            )}

            <div className="ml-auto flex items-center gap-2 shrink-0">
              <button
                onClick={() => {
                  const rows = filtered.map((r, i) => ({
                    '#': i + 1,
                    'Врач': r.doctorName,
                    'Область': r.region || '',
                    'ЛПУ Аб': r.institutionAbbr || '',
                    'Учреждение': r.institution,
                    'Категория': r.category || '',
                    'Специальность': r.specialty,
                    'Статус': r.status === 'covered' ? 'Работает' : 'Потенциал',
                  }));
                  exportToExcel(rows, `Потенциал_врачей_${employee.name.replace(/\s+/g, '_')}`, 'Врачи');
                }}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 hover:border-slate-300 transition-colors"
              >
                <FileDown size={14} />
                Выгрузить в Excel
              </button>
              <span className="px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-medium text-xs">
                {coveredCount} работает
              </span>
              <span className="px-2 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200 font-medium text-xs">
                {potentialCount} потенциал
              </span>
            </div>
          </div>

          {/* Table */}
          {filtered.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-400">Ничего не найдено</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="text-left px-3 py-2.5 font-semibold text-slate-500 w-8">#</th>
                    <th className="text-left px-3 py-2.5 font-semibold text-slate-500 min-w-[220px]">Врач</th>
                    {regionOptions.length > 0 && (
                      <th className="text-left px-3 py-2.5 font-semibold text-slate-500 min-w-[100px]">Область</th>
                    )}
                    <th className="text-left px-3 py-2.5 font-semibold text-slate-500 min-w-[80px]">ЛПУ Аб</th>
                    <th className="text-left px-3 py-2.5 font-semibold text-slate-500 min-w-[200px]">Учреждение</th>
                    <th className="text-left px-3 py-2.5 font-semibold text-slate-500 min-w-[80px]">Категория</th>
                    <th className="text-left px-3 py-2.5 font-semibold text-slate-500 min-w-[120px]">Специальность</th>
                    <th className="text-left px-3 py-2.5 font-semibold text-slate-500 w-28">Статус</th>
                    {canPlan && (
                      <th className="text-left px-3 py-2.5 font-semibold text-slate-500 w-36">Подключение</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row, i) => {
                    const plan = row.status === 'potential'
                      ? plannedMap.get(normalizeLinkKey(row.doctorName))
                      : undefined;
                    const fmtDeadline = (iso: string) => {
                      const [, m, d] = iso.split('-');
                      return `${d}.${m}`;
                    };
                    return (
                      <tr
                        key={`${row.institution}-${row.specialty}-${row.doctorName}`}
                        className={`border-b border-slate-50 ${
                          row.status === 'covered'
                            ? 'bg-emerald-50/40 hover:bg-emerald-50'
                            : plan?.outcome === 'connected'
                            ? 'bg-emerald-50/30 hover:bg-emerald-50/50'
                            : plan?.outcome === 'not_connected'
                            ? 'bg-red-50/20 hover:bg-red-50/40'
                            : 'bg-blue-50/30 hover:bg-blue-50/60'
                        }`}
                      >
                        <td className="px-3 py-2 text-slate-400 tabular-nums">{i + 1}</td>
                        <td className="px-3 py-2 font-medium text-dark-DEFAULT">{row.doctorName}</td>
                        {regionOptions.length > 0 && (
                          <td className="px-3 py-2 text-slate-500">{row.region || '—'}</td>
                        )}
                        <td className="px-3 py-2 text-slate-600">{row.institutionAbbr || '—'}</td>
                        <td className="px-3 py-2 text-slate-600">{row.institution}</td>
                        <td className="px-3 py-2 text-slate-600">{row.category || '—'}</td>
                        <td className="px-3 py-2 text-slate-600">{row.specialty}</td>
                        <td className="px-3 py-2">
                          {row.status === 'covered' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700 border border-emerald-200 whitespace-nowrap">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                              Работает
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700 border border-blue-200 whitespace-nowrap">
                              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
                              Потенциал
                            </span>
                          )}
                        </td>
                        {canPlan && (
                          <td className="px-3 py-2">
                            {row.status === 'potential' && (() => {
                              if (!plan) {
                                return (
                                  <button
                                    onClick={() => { setSaveError(null); setEditingConnection(null); setModalRow(row); }}
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-primary-50 text-primary-700 border border-primary-200 hover:bg-primary-100 transition-colors whitespace-nowrap"
                                  >
                                    <CalendarClock size={10} />
                                    Подключить
                                  </button>
                                );
                              }
                              if (plan.outcome === 'connected') {
                                return (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700 border border-emerald-200 whitespace-nowrap">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                                    Подключен
                                  </span>
                                );
                              }
                              if (plan.outcome === 'not_connected') {
                                return (
                                  <div className="flex flex-col gap-1">
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700 border border-red-200 whitespace-nowrap">
                                      <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
                                      Не совершено
                                    </span>
                                    <button
                                      onClick={() => { setSaveError(null); setEditingConnection(null); setModalRow(row); }}
                                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-primary-50 text-primary-700 border border-primary-200 hover:bg-primary-100 transition-colors whitespace-nowrap"
                                    >
                                      <CalendarClock size={10} />
                                      Повторить
                                    </button>
                                  </div>
                                );
                              }
                              // outcome === null → pending
                              return (
                                <div className="flex items-center gap-1 flex-wrap">
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700 border border-amber-200 whitespace-nowrap">
                                    <CalendarClock size={10} />
                                    до {fmtDeadline(plan.deadline)}
                                  </span>
                                  <button
                                    onClick={() => {
                                      setSaveError(null);
                                      setModalRow(row);
                                      setEditingConnection(plan);
                                    }}
                                    className="inline-flex items-center justify-center p-1 rounded text-slate-500 hover:text-primary-600 hover:bg-primary-50 border border-transparent hover:border-primary-200 transition-colors"
                                    title="Редактировать"
                                  >
                                    <Pencil size={12} />
                                  </button>
                                </div>
                              );
                            })()}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* New Connection Modal */}
      {modalRow && (
        <NewConnectionModal
          row={modalRow}
          productOptions={productOptions}
          existingConnection={editingConnection}
          onClose={() => { setModalRow(null); setEditingConnection(null); }}
          onSave={handleSaveConnection}
          saving={savingConnection}
        />
      )}
    </div>
  );
};
