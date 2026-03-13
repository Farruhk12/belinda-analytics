import React, { useState, useMemo } from 'react';
import { EmployeeSummary, GenericRow } from '../types';
import {
  ArrowLeft, User, Building2, Calendar, Stethoscope, Package,
} from 'lucide-react';
import { getValueByMatchers, normalizeLinkKey, rowMatchesPeriod } from '../services/dataService';
import { COLUMN_MATCHERS } from '../constants';

export type DataTableType = 'visits' | 'contracts' | 'bonused' | 'recipes';

interface Props {
  employee: EmployeeSummary;
  type: DataTableType;
  visitsData: GenericRow[];
  bonusesData: GenericRow[];
  contractsData: GenericRow[];
  recipesData: GenericRow[];
  selectedPeriod: string;
  onBack: () => void;
}

const TITLES: Record<DataTableType, string> = {
  visits: 'Визиты',
  contracts: 'Договоры',
  bonused: 'Врачи с бонусом',
  recipes: 'Рецепты моей группы',
};

const getColPriority = (col: string): number => {
  const c = col.toLowerCase();
  if (COLUMN_MATCHERS.DOCTOR.some(m => c.includes(m))) return 0;
  if (COLUMN_MATCHERS.NOMENCLATURE.some(m => c.includes(m))) return 1;
  if (COLUMN_MATCHERS.INSTITUTION.some(m => c.includes(m))) return 2;
  if (c.includes('количеств') || c.includes('кол-во')) return 3;
  if (c.includes('цена')) return 4;
  if (c.includes('сумма') && !c.includes('бонус')) return 5;
  if (c.includes('бонус')) return 6;
  if (COLUMN_MATCHERS.DATE.some(m => c.includes(m))) return 7;
  if (COLUMN_MATCHERS.EMPLOYEE.some(m => c.includes(m))) return 8;
  if (COLUMN_MATCHERS.GROUP.some(m => c.includes(m))) return 9;
  if (COLUMN_MATCHERS.REGION.some(m => c.includes(m))) return 10;
  return 99;
};

const parseDateToMonth = (d: string): string | null => {
  if (!d) return null;
  const iso = d.match(/\d{4}-\d{2}-\d{2}/)?.[0];
  if (iso) return iso.substring(0, 7);
  const parsed = new Date(d);
  if (!isNaN(parsed.getTime())) {
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  }
  return null;
};

export const EmployeeDataTablePage: React.FC<Props> = ({
  employee,
  type,
  visitsData,
  bonusesData,
  contractsData,
  recipesData,
  selectedPeriod,
  onBack,
}) => {
  const [filterSpecialty, setFilterSpecialty] = useState('All');
  const [filterInstitution, setFilterInstitution] = useState('All');
  const [filterDate, setFilterDate] = useState('All');
  const [filterDoctor, setFilterDoctor] = useState('All');
  const [filterNomenclature, setFilterNomenclature] = useState('All');

  const mpKey = normalizeLinkKey(employee.name);
  const regionKey = normalizeLinkKey(employee.region || '');
  const groupKey = normalizeLinkKey(employee.group || '');

  const periodFilteredVisits = useMemo(() =>
    visitsData.filter(row =>
      normalizeLinkKey(getValueByMatchers(row, COLUMN_MATCHERS.EMPLOYEE)) === mpKey &&
      rowMatchesPeriod(row, selectedPeriod)
    ),
    [visitsData, mpKey, selectedPeriod]
  );

  const allContractsForEmployee = useMemo(() =>
    contractsData.filter(row =>
      normalizeLinkKey(getValueByMatchers(row, COLUMN_MATCHERS.EMPLOYEE)) === mpKey
    ),
    [contractsData, mpKey]
  );

  const periodFilteredBonusedRows = useMemo(() =>
    bonusesData.filter(row =>
      normalizeLinkKey(getValueByMatchers(row, COLUMN_MATCHERS.EMPLOYEE)) === mpKey &&
      rowMatchesPeriod(row, selectedPeriod)
    ),
    [bonusesData, mpKey, selectedPeriod]
  );

  const periodFilteredRecipes = useMemo(() =>
    recipesData.filter(row =>
      normalizeLinkKey(getValueByMatchers(row, COLUMN_MATCHERS.REGION)) === regionKey &&
      normalizeLinkKey(getValueByMatchers(row, COLUMN_MATCHERS.GROUP)) === groupKey &&
      rowMatchesPeriod(row, selectedPeriod)
    ),
    [recipesData, regionKey, groupKey, selectedPeriod]
  );

  const sourceData = useMemo(() => {
    switch (type) {
      case 'visits': return periodFilteredVisits;
      case 'contracts': return allContractsForEmployee;
      case 'bonused': return periodFilteredBonusedRows;
      case 'recipes': return periodFilteredRecipes;
      default: return [];
    }
  }, [type, periodFilteredVisits, allContractsForEmployee, periodFilteredBonusedRows, periodFilteredRecipes]);

  const filteredRows = useMemo(() => {
    let rows = [...sourceData];
    if (filterSpecialty !== 'All') {
      rows = rows.filter(r => getValueByMatchers(r, COLUMN_MATCHERS.SPECIALTY) === filterSpecialty);
    }
    if (filterInstitution !== 'All') {
      rows = rows.filter(r => getValueByMatchers(r, COLUMN_MATCHERS.INSTITUTION) === filterInstitution);
    }
    if (filterDate !== 'All') {
      rows = rows.filter(r => parseDateToMonth(getValueByMatchers(r, COLUMN_MATCHERS.DATE)) === filterDate);
    }
    if (filterDoctor !== 'All') {
      rows = rows.filter(r => normalizeLinkKey(getValueByMatchers(r, COLUMN_MATCHERS.DOCTOR)) === normalizeLinkKey(filterDoctor));
    }
    if (filterNomenclature !== 'All') {
      rows = rows.filter(r => getValueByMatchers(r, COLUMN_MATCHERS.NOMENCLATURE) === filterNomenclature);
    }
    return rows;
  }, [sourceData, filterSpecialty, filterInstitution, filterDate, filterDoctor, filterNomenclature]);

  const uniqueSpecialties = useMemo(() => {
    const s = new Set<string>();
    sourceData.forEach(r => {
      const v = getValueByMatchers(r, COLUMN_MATCHERS.SPECIALTY);
      if (v) s.add(v);
    });
    return ['All', ...Array.from(s).sort()];
  }, [sourceData]);

  const uniqueInstitutions = useMemo(() => {
    const s = new Set<string>();
    sourceData.forEach(r => {
      const v = getValueByMatchers(r, COLUMN_MATCHERS.INSTITUTION);
      if (v) s.add(v);
    });
    return ['All', ...Array.from(s).sort()];
  }, [sourceData]);

  const uniqueDates = useMemo(() => {
    const s = new Set<string>();
    sourceData.forEach(r => {
      const d = getValueByMatchers(r, COLUMN_MATCHERS.DATE);
      const m = parseDateToMonth(d);
      if (m) s.add(m);
    });
    return ['All', ...Array.from(s).sort().reverse()];
  }, [sourceData]);

  const uniqueDoctors = useMemo(() => {
    const s = new Set<string>();
    sourceData.forEach(r => {
      const v = getValueByMatchers(r, COLUMN_MATCHERS.DOCTOR);
      if (v) s.add(v);
    });
    return ['All', ...Array.from(s).sort()];
  }, [sourceData]);

  const uniqueNomenclatures = useMemo(() => {
    const s = new Set<string>();
    sourceData.forEach(r => {
      const v = getValueByMatchers(r, COLUMN_MATCHERS.NOMENCLATURE);
      if (v) s.add(v);
    });
    return ['All', ...Array.from(s).sort()];
  }, [sourceData]);

  const columns = useMemo(() => {
    if (filteredRows.length === 0) return [];
    return Object.keys(filteredRows[0]).sort((a, b) => getColPriority(a) - getColPriority(b));
  }, [filteredRows]);

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
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
            <h2 className="text-lg font-bold text-dark-DEFAULT">{TITLES[type]}</h2>
            <p className="text-sm text-slate-500 mt-0.5">{employee.name}</p>
          </div>
        </div>
      </div>

      {/* Фильтры */}
      <div className="bg-white rounded-xl border border-slate-200 px-4 py-3 flex flex-wrap gap-3 items-center">
        <div className="flex items-center gap-2">
          <User size={14} className="text-slate-400" />
          <select
            value={filterSpecialty}
            onChange={e => setFilterSpecialty(e.target.value)}
            className="py-1.5 px-2 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-primary-500"
          >
            {uniqueSpecialties.map(s => (
              <option key={s} value={s}>{s === 'All' ? 'Все специальности' : s}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <Building2 size={14} className="text-slate-400" />
          <select
            value={filterInstitution}
            onChange={e => setFilterInstitution(e.target.value)}
            className="py-1.5 px-2 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-primary-500"
          >
            {uniqueInstitutions.map(i => (
              <option key={i} value={i}>{i === 'All' ? 'Все ЛПУ' : i}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <Calendar size={14} className="text-slate-400" />
          <select
            value={filterDate}
            onChange={e => setFilterDate(e.target.value)}
            className="py-1.5 px-2 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-primary-500"
          >
            {uniqueDates.map(d => (
              <option key={d} value={d}>{d === 'All' ? 'Все даты' : d}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <Stethoscope size={14} className="text-slate-400" />
          <select
            value={filterDoctor}
            onChange={e => setFilterDoctor(e.target.value)}
            className="py-1.5 px-2 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-primary-500 min-w-[180px]"
          >
            {uniqueDoctors.map(d => (
              <option key={d} value={d}>{d === 'All' ? 'Все врачи' : d}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <Package size={14} className="text-slate-400" />
          <select
            value={filterNomenclature}
            onChange={e => setFilterNomenclature(e.target.value)}
            className="py-1.5 px-2 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-primary-500 min-w-[160px]"
          >
            {uniqueNomenclatures.map(n => (
              <option key={n} value={n}>{n === 'All' ? 'Вся номенклатура' : n}</option>
            ))}
          </select>
        </div>
        <span className="text-sm text-slate-500 ml-auto font-medium">
          {filteredRows.length} записей
        </span>
      </div>

      {/* Таблица */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto max-h-[calc(100vh-280px)]">
          {filteredRows.length === 0 ? (
            <div className="py-16 text-center text-slate-500">Нет данных</div>
          ) : (
            <table className="min-w-full text-sm border-collapse">
              <thead className="bg-slate-50 sticky top-0 z-10">
                <tr>
                  {columns.map((col, i) => (
                    <th
                      key={col}
                      className={`px-4 py-3 text-left font-semibold text-slate-600 whitespace-nowrap border-b-2 border-slate-200 ${i > 0 ? 'border-l border-slate-200' : ''}`}
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRows.map((row, i) => (
                  <tr key={i} className="hover:bg-slate-50 transition-colors">
                    {columns.map((col, ci) => (
                      <td
                        key={col}
                        className={`px-4 py-2.5 text-dark-DEFAULT ${ci === 0 ? 'font-medium' : ''} ${ci > 0 ? 'border-l border-slate-100' : ''}`}
                      >
                        {row[col] != null ? String(row[col]) : '—'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};
