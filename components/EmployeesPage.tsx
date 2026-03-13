// components/EmployeesPage.tsx
import React, { useMemo, useState } from 'react';
import { EmployeeSummary, GenericRow } from '../types';
import { StaffManagement } from './StaffManagement';
import { EmployeeObjectsEditor } from './EmployeeObjectsEditor';
import { MapPin, Search, Building2, Users } from 'lucide-react';

type SubTab = 'staff' | 'coverage';

const REGION_ORDER = ['Душанбе', 'РРП', 'Курган', 'Куляб', 'Согд', 'РРП2', 'Гарм'];
const regionSort = (a: string, b: string) => {
  const norm = (s: string) => s.toLowerCase().trim();
  const iA = REGION_ORDER.findIndex(r => norm(r) === norm(a));
  const iB = REGION_ORDER.findIndex(r => norm(r) === norm(b));
  return (iA >= 0 ? iA : 999) - (iB >= 0 ? iB : 999) || a.localeCompare(b);
};

interface Props {
  employeeStats: EmployeeSummary[];
  employeesFromData: { id: string; name: string; group: string; region: string }[];
  visitsData: GenericRow[];
  bonusesData: GenericRow[];
  doctorsData: GenericRow[];
  onSave: () => void;
  isAdmin?: boolean;
  canAccessRegion?: (region: string) => boolean;
  canAccessGroup?: (group: string) => boolean;
}

export const EmployeesPage: React.FC<Props> = ({
  employeeStats,
  employeesFromData,
  visitsData,
  bonusesData,
  doctorsData,
  onSave,
  isAdmin = false,
  canAccessRegion = () => true,
  canAccessGroup = () => true,
}) => {
  const [subTab, setSubTab] = useState<SubTab>(isAdmin ? 'staff' : 'coverage');
  const [selectedEmployee, setSelectedEmployee] = useState<EmployeeSummary | null>(null);
  const [search, setSearch] = useState('');
  const [filterRegion, setFilterRegion] = useState('');

  // Filter: no managers + access control by region/group
  const employees = useMemo(
    () => employeeStats.filter(e =>
      (e as any).role !== 'Менеджер' &&
      canAccessRegion(e.region ?? '') &&
      canAccessGroup(e.group ?? '')
    ),
    [employeeStats, canAccessRegion, canAccessGroup]
  );

  const allRegions = useMemo(() => {
    const set = new Set<string>();
    employees.forEach(e => { if (e.region) set.add(e.region); });
    return Array.from(set).sort(regionSort);
  }, [employees]);

  const filtered = useMemo(() => {
    let list = [...employees];
    if (filterRegion) list = list.filter(e => e.region === filterRegion);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(e => e.name.toLowerCase().includes(q));
    }
    return list.sort((a, b) => {
      const rc = regionSort(a.region || '', b.region || '');
      if (rc !== 0) return rc;
      return a.name.localeCompare(b.name, 'ru');
    });
  }, [employees, filterRegion, search]);

  // Если выбран сотрудник — показываем редактор объектов
  if (selectedEmployee) {
    return (
      <EmployeeObjectsEditor
        employee={selectedEmployee}
        visitsData={visitsData}
        bonusesData={bonusesData}
        doctorsData={doctorsData}
        onBack={() => setSelectedEmployee(null)}
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* Sub-tab switcher — показываем вкладку Сотрудники только админам */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="flex border-b border-slate-100">
          {isAdmin && (
            <button
              onClick={() => setSubTab('staff')}
              className={`flex items-center gap-2 px-5 py-3 text-sm font-medium transition-colors border-b-2 -mb-px ${
                subTab === 'staff'
                  ? 'border-primary-500 text-primary-700'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              <Users size={15} />
              Сотрудники
            </button>
          )}
          <button
            onClick={() => setSubTab('coverage')}
            className={`flex items-center gap-2 px-5 py-3 text-sm font-medium transition-colors border-b-2 -mb-px ${
              subTab === 'coverage'
                ? 'border-primary-500 text-primary-700'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <Building2 size={15} />
            Объекты
          </button>
        </div>
      </div>

      {subTab === 'staff' && isAdmin ? (
        <StaffManagement
          employeesFromData={employeesFromData}
          onSave={onSave}
        />
      ) : (
        /* Список сотрудников для выбора объектов */
        <div className="space-y-3">
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            {allRegions.length > 1 && (
              <div className="px-4 py-2.5 flex flex-wrap gap-1.5 border-b border-slate-100">
                {allRegions.map(region => (
                  <button
                    key={region}
                    onClick={() => setFilterRegion(filterRegion === region ? '' : region)}
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
                      filterRegion === region
                        ? 'bg-primary-500 text-white shadow-sm'
                        : 'bg-slate-100 text-slate-600 hover:bg-primary-50 hover:text-primary-700'
                    }`}
                  >
                    <MapPin size={9} />
                    {region}
                  </button>
                ))}
              </div>
            )}
            <div className="flex items-center gap-2 px-4 py-3">
              <div className="relative flex-1">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Поиск по имени..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full pl-7 pr-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 placeholder:text-slate-300"
                />
              </div>
              {(search || filterRegion) && (
                <button
                  onClick={() => { setSearch(''); setFilterRegion(''); }}
                  className="px-3 py-1.5 text-xs text-slate-500 hover:text-dark-DEFAULT border border-slate-200 rounded-lg transition-colors"
                >
                  Сбросить
                </button>
              )}
              <span className="ml-auto text-xs text-slate-400 shrink-0">{filtered.length} МП</span>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            {filtered.length === 0 ? (
              <div className="py-12 text-center text-sm text-slate-400">Сотрудники не найдены</div>
            ) : (
              <div className="divide-y divide-slate-100">
                {filtered.map(emp => (
                  <button
                    key={emp.id}
                    onClick={() => setSelectedEmployee(emp)}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors text-left"
                  >
                    <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center text-primary-700 text-xs font-bold shrink-0">
                      {emp.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-dark-DEFAULT truncate">{emp.name}</div>
                      <div className="text-xs text-slate-400 mt-0.5">
                        {[emp.group, emp.region].filter(Boolean).join(' · ')}
                      </div>
                    </div>
                    <Building2 size={15} className="text-slate-300 shrink-0" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
