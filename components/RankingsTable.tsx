import React, { useState, useMemo } from 'react';
import { EmployeeSummary } from '../types';
import { ArrowUpDown, Search, MapPin, Layers, Trophy, ChevronRight } from 'lucide-react';

type SortField = 'totalBonuses' | 'totalVisits' | 'conversionRate' | 'contractDoctorsPrescribedRate' | 'contractItemsComplianceRate' | 'fullCycleCount' | 'name';

interface Props {
  data: EmployeeSummary[];
  onSelect?: (emp: EmployeeSummary) => void;
}

export const RankingsTable: React.FC<Props> = ({ data, onSelect }) => {
  const [sortField, setSortField] = useState<SortField>('totalBonuses');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [filter, setFilter] = useState('');
  const [selectedGroup, setSelectedGroup] = useState<string>('All');
  const [selectedRegion, setSelectedRegion] = useState<string>('All');

  const uniqueGroups = useMemo(() => {
    const groups = new Set(data.map(d => d.group).filter(Boolean));
    return ['All', ...Array.from(groups).sort()];
  }, [data]);

  const uniqueRegions = useMemo(() => {
    const regions = new Set(data.map(d => d.region).filter(Boolean));
    return ['All', ...Array.from(regions).sort()];
  }, [data]);

  const filteredData = useMemo(() => {
    return data.filter(item => {
      const matchesName = item.name.toLowerCase().includes(filter.toLowerCase());
      const matchesGroup = selectedGroup === 'All' || item.group === selectedGroup;
      const matchesRegion = selectedRegion === 'All' || item.region === selectedRegion;
      return matchesName && matchesGroup && matchesRegion;
    });
  }, [data, filter, selectedGroup, selectedRegion]);

  const sortedData = useMemo(() => {
    return [...filteredData].sort((a, b) => {
      const aVal = a[sortField as keyof EmployeeSummary];
      const bVal = b[sortField as keyof EmployeeSummary];
      const aDef = aVal !== undefined && aVal !== null;
      const bDef = bVal !== undefined && bVal !== null;
      if (!aDef && !bDef) return 0;
      if (!aDef) return sortDirection === 'asc' ? 1 : -1;
      if (!bDef) return sortDirection === 'asc' ? -1 : 1;
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortDirection === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      const numA = Number(aVal);
      const numB = Number(bVal);
      return sortDirection === 'asc' ? numA - numB : numB - numA;
    });
  }, [filteredData, sortField, sortDirection]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const Th = ({ label, field, className = '' }: { label: string; field: SortField; className?: string }) => (
    <th
      className={`px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-50 ${className}`}
      onClick={() => handleSort(field)}
    >
      <div className="flex items-center gap-1">
        <span>{label}</span>
        <ArrowUpDown size={12} className={sortField === field ? 'text-primary-500' : 'text-slate-300'} />
      </div>
    </th>
  );

  const formatVal = (val: unknown, isPct = false): string => {
    if (val === undefined || val === null) return '—';
    if (typeof val === 'number') {
      if (isPct) return `${val.toFixed(1)}%`;
      if (val >= 1000) return new Intl.NumberFormat('ru-RU', { notation: 'compact' }).format(val);
      return new Intl.NumberFormat('ru-RU').format(val);
    }
    return String(val);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="flex items-center gap-2">
          <Trophy size={20} className="text-amber-500" />
          <h3 className="font-semibold text-dark-DEFAULT">Рейтинги и сравнения</h3>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            <input
              type="text"
              placeholder="Поиск МП..."
              value={filter}
              onChange={e => setFilter(e.target.value)}
              className="pl-8 pr-3 py-1.5 border border-slate-300 rounded-lg text-sm w-40 focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <div className="relative">
            <Layers size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <select
              value={selectedGroup}
              onChange={e => setSelectedGroup(e.target.value)}
              className="pl-8 pr-6 py-1.5 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              {uniqueGroups.map(g => (
                <option key={g} value={g}>{g === 'All' ? 'Все группы' : g}</option>
              ))}
            </select>
          </div>
          <div className="relative">
            <MapPin size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <select
              value={selectedRegion}
              onChange={e => setSelectedRegion(e.target.value)}
              className="pl-8 pr-6 py-1.5 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              {uniqueRegions.map(r => (
                <option key={r} value={r}>{r === 'All' ? 'Все территории' : r}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-100">
          <thead className="bg-slate-50">
            <tr>
              <Th label="МП" field="name" />
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Группа</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Территория</th>
              <Th label="Визиты" field="totalVisits" />
              <Th label="Бонусы" field="totalBonuses" />
              <Th label="Конверсия" field="conversionRate" />
              <Th label="% врачей с рецептами" field="contractDoctorsPrescribedRate" />
              <Th label="% позиций договора" field="contractItemsComplianceRate" />
              <Th label="Полный цикл" field="fullCycleCount" />
              {onSelect && <th className="px-4 py-3 w-10" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sortedData.map((emp, idx) => (
              <tr
                key={emp.id}
                onClick={onSelect ? () => onSelect(emp) : undefined}
                className={`hover:bg-slate-50 transition-colors ${onSelect ? 'cursor-pointer' : ''}`}
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-400 w-6">{idx + 1}</span>
                    <span className="font-medium text-dark-DEFAULT">{emp.name}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-sm text-slate-600">{emp.group || '—'}</td>
                <td className="px-4 py-3 text-sm text-slate-600">{emp.region || '—'}</td>
                <td className="px-4 py-3 text-sm font-medium text-dark-DEFAULT">{formatVal(emp.totalVisits)}</td>
                <td className="px-4 py-3 text-sm font-medium text-dark-DEFAULT">{formatVal(emp.totalBonuses)}</td>
                <td className="px-4 py-3 text-sm">{formatVal(emp.conversionRate, true)}</td>
                <td className="px-4 py-3 text-sm">{formatVal(emp.contractDoctorsPrescribedRate, true)}</td>
                <td className="px-4 py-3 text-sm">{formatVal(emp.contractItemsComplianceRate, true)}</td>
                <td className="px-4 py-3 text-sm">{formatVal(emp.fullCycleCount)}</td>
                {onSelect && (
                  <td className="px-4 py-3">
                    <ChevronRight size={16} className="text-slate-300" />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {sortedData.length === 0 && (
          <div className="py-12 text-center text-slate-500">Нет данных по выбранным фильтрам.</div>
        )}
      </div>
    </div>
  );
};
