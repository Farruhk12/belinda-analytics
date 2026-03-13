import React from 'react';
import { EmployeeSummary } from '../types';
import { AlertTriangle, Clock, FileX } from 'lucide-react';

interface Props {
  data: EmployeeSummary[];
}

export const AnomaliesList: React.FC<Props> = ({ data }) => {
  // 1. "Over-spenders": High Visits (>20 total), Low Conversion (< 10%)
  const wasters = data
    .filter(d => d.totalVisits > 20 && d.conversionRate < 10)
    .sort((a, b) => a.conversionRate - b.conversionRate)
    .slice(0, 5);

  // 2. "Sleepers": High Bonuses, Low Visits (Passive income) — менеджеры пропускаем (у них визитов нет)
  const sleepers = data
    .filter(d => d.role !== 'Менеджер' && d.totalBonuses > 100000 && d.totalVisits < 10)
    .sort((a, b) => a.totalVisits - b.totalVisits)
    .slice(0, 5);

  // 3. "Contract without recipes": Doctors with contract but no recipes for group
  const contractNoRecipe = data
    .filter(d => (d.contractWithoutRecipesCount ?? 0) > 0)
    .sort((a, b) => (b.contractWithoutRecipesCount ?? 0) - (a.contractWithoutRecipesCount ?? 0))
    .slice(0, 5);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      
      {/* Wasteful Efforts */}
      <div className="bg-white rounded-xl border border-red-100 shadow-sm p-5">
        <div className="flex items-center gap-2 mb-4">
          <AlertTriangle className="text-primary-500" size={20} />
          <h3 className="font-semibold text-dark-DEFAULT">«Холостые» Визиты</h3>
        </div>
        <p className="text-xs text-slate-500 mb-4">Сотрудники с высокой активностью, но конверсией в бонус менее 10%.</p>
        
        <div className="space-y-3">
          {wasters.map((emp) => (
            <div key={emp.id} className="flex justify-between items-center p-2 bg-slate-50 rounded text-sm">
              <div className="flex-1">
                <div className="font-medium text-dark-DEFAULT">{emp.name}</div>
                <div className="text-xs text-slate-400">{emp.region}</div>
              </div>
              <div className="text-right">
                <div className="font-bold text-primary-500">{emp.totalVisits} визитов</div>
                <div className="text-xs text-slate-500">Конверсия: {emp.conversionRate.toFixed(1)}%</div>
              </div>
            </div>
          ))}
          {wasters.length === 0 && <p className="text-sm text-slate-400 italic">Аномалий не найдено.</p>}
        </div>
      </div>

      {/* Sleepers */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <div className="flex items-center gap-2 mb-4">
          <Clock className="text-blue-500" size={20} />
          <h3 className="font-semibold text-dark-DEFAULT">«Спящий доход»</h3>
        </div>
        <p className="text-xs text-slate-500 mb-4">Высокие бонусы ({'>'}100к) при минимальной активности (менее 10 визитов).</p>

        <div className="space-y-3">
          {sleepers.map((emp) => (
            <div key={emp.id} className="flex justify-between items-center p-2 bg-slate-50 rounded text-sm">
              <div className="flex-1">
                <div className="font-medium text-dark-DEFAULT">{emp.name}</div>
                <div className="text-xs text-slate-400">{emp.region}</div>
              </div>
              <div className="text-right">
                <div className="font-bold text-emerald-600">{new Intl.NumberFormat('ru-RU').format(emp.totalBonuses)}</div>
                <div className="text-xs text-slate-500">Всего {emp.totalVisits} визитов</div>
              </div>
            </div>
          ))}
           {sleepers.length === 0 && <p className="text-sm text-slate-400 italic">Аномалий не найдено.</p>}
        </div>
      </div>

      {/* Contract without recipes */}
      <div className="bg-white rounded-xl border border-amber-100 shadow-sm p-5">
        <div className="flex items-center gap-2 mb-4">
          <FileX className="text-amber-500" size={20} />
          <h3 className="font-semibold text-dark-DEFAULT">Договор без рецептов</h3>
        </div>
        <p className="text-xs text-slate-500 mb-4">Врачи с договором, но без рецептов по группе — требуют фокуса.</p>

        <div className="space-y-3">
          {contractNoRecipe.map((emp) => (
            <div key={emp.id} className="flex justify-between items-center p-2 bg-slate-50 rounded text-sm">
              <div className="flex-1">
                <div className="font-medium text-dark-DEFAULT">{emp.name}</div>
                <div className="text-xs text-slate-400">{emp.region}</div>
              </div>
              <div className="text-right">
                <div className="font-bold text-amber-600">{emp.contractWithoutRecipesCount ?? 0} врачей</div>
                <div className="text-xs text-slate-500">Договор есть, рецептов нет</div>
              </div>
            </div>
          ))}
          {contractNoRecipe.length === 0 && <p className="text-sm text-slate-400 italic">Аномалий не найдено.</p>}
        </div>
      </div>
    </div>
  );
};