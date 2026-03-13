import React, { useState, useMemo } from 'react';
import { EmployeeSummary } from '../types';
import { ArrowUpDown, Search, MapPin, ChevronRight, ChevronDown, ChevronUp, Layers } from 'lucide-react';

interface Props {
  data: EmployeeSummary[];
  onSelect: (employee: EmployeeSummary) => void;
}

export const DataTable: React.FC<Props> = ({ data, onSelect }) => {
  const [sortField, setSortField] = useState<keyof EmployeeSummary>('totalBonuses');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [filter, setFilter] = useState('');
  const [selectedGroup, setSelectedGroup] = useState<string>('All');
  const [selectedRegion, setSelectedRegion] = useState<string>('All');
  const [collapsedRegions, setCollapsedRegions] = useState<Set<string>>(new Set());

  const uniqueGroups = useMemo(() => {
    const groups = new Set(data.map(d => d.group).filter(Boolean));
    return ['All', ...Array.from(groups).sort()];
  }, [data]);

  const uniqueRegions = useMemo(() => {
    const regions = new Set(data.map(d => d.region).filter(Boolean));
    return ['All', ...Array.from(regions).sort()];
  }, [data]);

  const handleSort = (field: keyof EmployeeSummary) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const filteredData = useMemo(() => {
    return data.filter(item => {
      const matchesName = item.name.toLowerCase().includes(filter.toLowerCase());
      const matchesGroup = selectedGroup === 'All' || item.group === selectedGroup;
      const matchesRegion = selectedRegion === 'All' || item.region === selectedRegion;
      return matchesName && matchesGroup && matchesRegion;
    });
  }, [data, filter, selectedGroup, selectedRegion]);

  // Group by Region
  const groupedData = useMemo(() => {
    const groups: Record<string, EmployeeSummary[]> = {};
    
    filteredData.forEach(item => {
      const region = item.region || 'Без территории';
      if (!groups[region]) groups[region] = [];
      groups[region].push(item);
    });

    return groups;
  }, [filteredData]);

  // Sort Regions Alphabetically
  const sortedRegions = useMemo(() => {
    return Object.keys(groupedData).sort();
  }, [groupedData]);

  // Итоги по территории (визиты, бонусы)
  const regionTotals = useMemo(() => {
    const totals: Record<string, { visits: number; bonuses: number }> = {};
    sortedRegions.forEach(region => {
      const emps = groupedData[region] || [];
      totals[region] = {
        visits: emps.reduce((s, e) => s + e.totalVisits, 0),
        bonuses: emps.reduce((s, e) => s + e.totalBonuses, 0),
      };
    });
    return totals;
  }, [groupedData, sortedRegions]);

  const toggleRegion = (region: string) => {
    setCollapsedRegions(prev => {
      const next = new Set(prev);
      if (next.has(region)) next.delete(region);
      else next.add(region);
      return next;
    });
  };

  // Helper to sort employees within a region
  // Logic: 1. By Group (Asc), 2. By User Selection (e.g. Bonuses Desc)
  const getSortedEmployees = (employees: EmployeeSummary[]) => {
    return [...employees].sort((a, b) => {
      // 1. Primary Sort: Group (Ascending)
      const groupA = a.group || '';
      const groupB = b.group || '';
      const groupComparison = groupA.localeCompare(groupB);
      
      if (groupComparison !== 0) {
        return groupComparison;
      }

      // 2. Secondary Sort: User Selection
      const aVal = a[sortField];
      const bVal = b[sortField];
      
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortDirection === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      return sortDirection === 'asc' 
        ? (aVal as number) - (bVal as number) 
        : (bVal as number) - (aVal as number);
    });
  };

  const TableHeader = ({ label, field, className = "" }: { label: string, field: keyof EmployeeSummary, className?: string }) => (
    <th 
      className={`px-6 py-3 text-left text-xs font-semibold text-dark-500 uppercase tracking-wider cursor-pointer hover:bg-slate-50 transition-colors ${className}`}
      onClick={() => handleSort(field)}
    >
      <div className="flex items-center space-x-1">
        <span>{label}</span>
        <ArrowUpDown size={14} className={sortField === field ? 'text-primary-500' : 'text-slate-300'} />
      </div>
    </th>
  );

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-[calc(100vh-140px)]">
      <div className="p-4 border-b border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <h3 className="text-lg font-semibold text-dark-DEFAULT whitespace-nowrap">Список сотрудников</h3>
        
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 w-full lg:w-auto">
          <div className="relative w-full sm:w-auto">
             <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Layers size={14} className="text-slate-400" />
             </div>
             <select 
               value={selectedGroup}
               onChange={(e) => setSelectedGroup(e.target.value)}
               className="w-full sm:w-32 pl-9 pr-8 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-500 appearance-none text-dark-DEFAULT"
             >
               {uniqueGroups.map(g => <option key={g} value={g}>{g === 'All' ? 'Все Группы' : g}</option>)}
             </select>
          </div>
          <div className="relative w-full sm:w-auto">
             <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <MapPin size={14} className="text-slate-400" />
             </div>
             <select 
               value={selectedRegion}
               onChange={(e) => setSelectedRegion(e.target.value)}
               className="w-full sm:w-32 pl-9 pr-8 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-500 appearance-none text-dark-DEFAULT"
             >
               {uniqueRegions.map(r => <option key={r} value={r}>{r === 'All' ? 'Все Территории' : r}</option>)}
             </select>
          </div>
          <div className="relative w-full sm:w-auto">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input 
              type="text" 
              placeholder="Поиск..." 
              className="w-full sm:w-48 pl-10 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 text-dark-DEFAULT"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          </div>
        </div>
      </div>
      
      <div className="overflow-auto flex-1">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-white sticky top-0 z-10 shadow-sm border-b border-slate-200">
            <tr>
              <TableHeader label="Сотрудник" field="name" />
              <TableHeader label="Визиты" field="totalVisits" />
              <TableHeader label="Бонусы" field="totalBonuses" />
              <TableHeader label="Врачи" field="activeDoctorsCount" />
              <TableHeader label="Договора" field="contractsCount" />
              <th className="px-6 py-3"></th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-slate-100">
            {sortedRegions.map(region => {
               const regionEmployees = getSortedEmployees(groupedData[region]);
               if (regionEmployees.length === 0) return null;
               const isCollapsed = collapsedRegions.has(region);
               const totals = regionTotals[region] || { visits: 0, bonuses: 0 };

               return (
                 <React.Fragment key={region}>
                   {/* Заголовок территории — кликабельно для сворачивания */}
                   <tr 
                     className="bg-slate-50 border-t border-b border-slate-200 hover:bg-slate-100 cursor-pointer transition-colors"
                     onClick={() => toggleRegion(region)}
                   >
                     <td colSpan={6} className="px-6 py-2.5">
                       <div className="flex items-center gap-2">
                         {isCollapsed ? (
                           <ChevronRight size={16} className="text-primary-500 shrink-0" />
                         ) : (
                           <ChevronDown size={16} className="text-primary-500 shrink-0" />
                         )}
                         <MapPin size={16} className="text-primary-500 shrink-0" />
                         <span className="text-sm font-bold text-dark-DEFAULT uppercase tracking-wider">
                           {region}
                         </span>
                         <span className="ml-2 text-xs font-semibold text-slate-500 bg-white border border-slate-200 px-2 py-0.5 rounded-full">
                           {regionEmployees.length}
                         </span>
                         <span className="ml-2 text-xs text-slate-500">
                           Визиты: {totals.visits} · Бонусы: {new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(totals.bonuses)}
                         </span>
                       </div>
                     </td>
                   </tr>

                   {/* Employee Rows */}
                   {!isCollapsed && regionEmployees.map((row) => (
                    <tr 
                      key={row.id} 
                      onClick={() => onSelect(row)}
                      className="hover:bg-red-50/50 transition-colors cursor-pointer group"
                    >
                      <td className="px-6 py-4">
                        <div className="text-sm font-semibold text-dark-DEFAULT group-hover:text-primary-600 transition-colors">{row.name}</div>
                        <div className="flex items-center gap-2 mt-1">
                           <span className="text-[10px] font-bold uppercase text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                             {row.group}
                           </span>
                        </div>
                      </td>
                      
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm font-bold text-dark-DEFAULT">{row.totalVisits}</span>
                      </td>

                      <td className="px-6 py-4 whitespace-nowrap text-sm text-dark-DEFAULT">
                        {new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(row.totalBonuses)}
                      </td>

                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                        {row.doctors.size}
                      </td>

                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                        {row.contractsCount > 0
                          ? <span className="font-medium text-dark-DEFAULT">{row.contractsCount}</span>
                          : <span className="text-slate-300">—</span>
                        }
                      </td>

                      <td className="px-6 py-4 text-right">
                        <ChevronRight size={18} className="text-slate-300 group-hover:text-primary-500 inline" />
                      </td>
                    </tr>
                   ))}
                 </React.Fragment>
               );
            })}
            
            {sortedRegions.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-10 text-center text-slate-500">
                    Сотрудники не найдены.
                  </td>
                </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};