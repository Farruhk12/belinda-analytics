
import React, { useState, useMemo } from 'react';
import { EmployeeSummary } from '../types';
import { KPI_PLANS } from '../constants';
import { Award, Target, Users, TrendingUp, Search, MapPin, Layers, BarChart3, Banknote } from 'lucide-react';

interface Props {
  data: EmployeeSummary[];
}

export const KPIList: React.FC<Props> = ({ data }) => {
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

  // Calculate Averages
  const averages = useMemo(() => {
    if (filteredData.length === 0) return { bonus: 0, coverage: 0 };
    const totalBonus = filteredData.reduce((acc, curr) => acc + curr.totalBonuses, 0);
    const totalCoverage = filteredData.reduce((acc, curr) => acc + curr.activeDoctorsCount, 0);
    return {
      bonus: totalBonus / filteredData.length,
      coverage: totalCoverage / filteredData.length
    };
  }, [filteredData]);

  // Determine Category for each employee
  const getEmployeeCategory = (emp: EmployeeSummary) => {
    if (emp.totalBonuses >= KPI_PLANS.LEAD.bonusPlan && emp.activeDoctorsCount >= KPI_PLANS.LEAD.activeDoctors) {
      return KPI_PLANS.LEAD;
    }
    if (emp.totalBonuses >= KPI_PLANS.SENIOR.bonusPlan && emp.activeDoctorsCount >= KPI_PLANS.SENIOR.activeDoctors) {
      return KPI_PLANS.SENIOR;
    }
    return KPI_PLANS.JUNIOR;
  };

  return (
    <div className="space-y-6">
      {/* Summary Statistics Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-blue-50 rounded-lg text-blue-500">
            <BarChart3 size={20} />
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Ср. охват врачей</p>
            <p className="text-xl font-bold text-dark-DEFAULT">{averages.coverage.toFixed(1)} <span className="text-xs font-normal text-slate-400">врачей / МП</span></p>
          </div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-emerald-50 rounded-lg text-emerald-500">
            <Banknote size={20} />
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Ср. сумма УВК</p>
            <p className="text-xl font-bold text-dark-DEFAULT">
              {new Intl.NumberFormat('ru-RU').format(Math.round(averages.bonus))} <span className="text-xs font-normal text-slate-400">ед. / МП</span>
            </p>
          </div>
        </div>
      </div>

      {/* KPI Toolbar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="flex flex-col sm:flex-row gap-3 w-full">
          {/* Search MP */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input 
              type="text" 
              placeholder="Поиск по МП..." 
              className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 text-dark-DEFAULT"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          </div>
          
          {/* Group Filter */}
          <div className="relative">
             <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Layers size={14} className="text-slate-400" />
             </div>
             <select 
               value={selectedGroup}
               onChange={(e) => setSelectedGroup(e.target.value)}
               className="w-full sm:w-40 pl-9 pr-8 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-500 appearance-none text-dark-DEFAULT"
             >
               {uniqueGroups.map(g => <option key={g} value={g}>{g === 'All' ? 'Все Группы' : g}</option>)}
             </select>
          </div>

          {/* Region Filter */}
          <div className="relative">
             <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <MapPin size={14} className="text-slate-400" />
             </div>
             <select 
               value={selectedRegion}
               onChange={(e) => setSelectedRegion(e.target.value)}
               className="w-full sm:w-40 pl-9 pr-8 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-500 appearance-none text-dark-DEFAULT"
             >
               {uniqueRegions.map(r => <option key={r} value={r}>{r === 'All' ? 'Все Области' : r}</option>)}
             </select>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {filteredData.map((emp) => {
          const cat = getEmployeeCategory(emp);
          const isManager = emp.role === 'Менеджер';

          const visitProgress = isManager ? 100 : Math.min((emp.totalVisits / cat.monthlyVisits) * 100, 100);
          const activeDocsProgress = Math.min((emp.activeDoctorsCount / cat.activeDoctors) * 100, 100);
          const bonusProgress = Math.min((emp.totalBonuses / cat.bonusPlan) * 100, 100);

          const totalScore = isManager
            ? (activeDocsProgress + bonusProgress) / 2
            : (visitProgress + activeDocsProgress + bonusProgress) / 3;

          return (
            <div key={emp.id} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden hover:shadow-md transition-shadow">
              <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/30">
                <div>
                  <h3 className="font-bold text-dark-DEFAULT">{emp.name}</h3>
                  <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold mt-0.5">{emp.region} • {emp.group}</p>
                </div>
                <div className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest border shadow-sm flex items-center gap-1.5
                  ${cat.label === 'Ведущий МП' ? 'bg-amber-50 border-amber-200 text-amber-700' : 
                    cat.label === 'Старший МП' ? 'bg-slate-50 border-slate-200 text-slate-700' : 
                    'bg-emerald-50 border-emerald-200 text-emerald-700'}`}>
                  <Award size={12} />
                  {cat.label}
                </div>
              </div>

              <div className="p-5 grid grid-cols-1 sm:grid-cols-3 gap-6">
                <div className="space-y-2">
                  <div className="flex justify-between items-end">
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Визиты</span>
                    <span className="text-xs font-bold text-dark-DEFAULT">
                      {isManager ? '—' : `${emp.totalVisits} / ${cat.monthlyVisits}`}
                    </span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-primary-500 transition-all duration-1000 ease-out" 
                      style={{ width: `${visitProgress}%` }}
                    />
                  </div>
                  {isManager && <p className="text-[9px] text-slate-400 italic">У менеджеров визитов нет</p>}
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between items-end">
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Финансовый охват</span>
                    <span className="text-xs font-bold text-dark-DEFAULT" title="Количество врачей, которым выделили деньги">
                      {emp.activeDoctorsCount} / {cat.activeDoctors}
                    </span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-blue-500 transition-all duration-1000 ease-out" 
                      style={{ width: `${activeDocsProgress}%` }}
                    />
                  </div>
                  <p className="text-[9px] text-slate-400 italic">Врачи с бонусами</p>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between items-end">
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Сумма УВК</span>
                    <span className="text-xs font-bold text-dark-DEFAULT">
                      {new Intl.NumberFormat('ru-RU', { notation: 'compact' }).format(emp.totalBonuses)} / {new Intl.NumberFormat('ru-RU', { notation: 'compact' }).format(cat.bonusPlan)}
                    </span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-emerald-500 transition-all duration-1000 ease-out" 
                      style={{ width: `${bonusProgress}%` }}
                    />
                  </div>
                </div>
              </div>

              <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-4 text-[10px] font-bold text-slate-400 uppercase tracking-tighter">
                   <div className="flex items-center gap-1">
                      <Target size={12} className="text-primary-400" />
                      План: {Math.round(totalScore)}%
                   </div>
                   <div className="flex items-center gap-1">
                      <TrendingUp size={12} className="text-emerald-400" />
                      Рейтинг: {isManager ? '—' : `${(emp.totalBonuses / (emp.totalVisits || 1)).toFixed(0)} ед.`}
                   </div>
                </div>
                <div className={`text-xs font-bold ${totalScore >= 100 ? 'text-emerald-600' : 'text-slate-500'}`}>
                  {totalScore >= 100 ? 'ПЛАН ВЫПОЛНЕН' : 'В ПРОЦЕССЕ'}
                </div>
              </div>
            </div>
          );
        })}
        {filteredData.length === 0 && (
          <div className="col-span-full py-12 text-center text-slate-500 bg-white rounded-xl border border-dashed border-slate-300">
             Ни один сотрудник не соответствует выбранным фильтрам.
          </div>
        )}
      </div>
    </div>
  );
};
