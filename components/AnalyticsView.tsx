import React from 'react';
import { EmployeeSummary } from '../types';
import StatCard from './StatCard';
import { EfficiencyChart } from './EfficiencyChart';
import { CorrelationChart } from './CorrelationChart';
import { KPIList } from './KPIList';
import { AnomaliesList } from './AnomaliesList';
import { ContractCompliance } from './ContractCompliance';
import { TrendChart } from './TrendChart';
import { RankingsTable } from './RankingsTable';
import { Activity, Banknote, Percent, DollarSign, Users } from 'lucide-react';

interface Props {
  employeeStats: EmployeeSummary[];
  totalVisits: number;
  totalBonuses: number;
  globalConversion: number;
  onSelectEmployee?: (emp: EmployeeSummary) => void;
}

export const AnalyticsView: React.FC<Props> = ({
  employeeStats,
  totalVisits,
  totalBonuses,
  globalConversion,
  onSelectEmployee,
}) => {
  const avgCostPerVisit =
    totalVisits > 0 ? Math.round(totalBonuses / totalVisits) : 0;
  const fullCycleTotal =
    employeeStats.reduce((s, e) => s + (e.fullCycleCount ?? 0), 0);

  return (
    <div className="space-y-8">
      {/* Сводный дашборд */}
      <section>
        <h2 className="text-lg font-bold text-dark-DEFAULT mb-4">Сводный дашборд</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          <StatCard
            title="Всего визитов"
            value={new Intl.NumberFormat('ru-RU').format(totalVisits)}
            icon={Activity}
          />
          <StatCard
            title="Всего бонусов (УВК)"
            value={new Intl.NumberFormat('ru-RU').format(totalBonuses)}
            icon={Banknote}
          />
          <StatCard
            title="Средняя конверсия"
            value={`${globalConversion.toFixed(1)}%`}
            icon={Percent}
          />
          <StatCard
            title="Средняя стоимость визита"
            value={`${new Intl.NumberFormat('ru-RU').format(avgCostPerVisit)}`}
            icon={DollarSign}
          />
          <StatCard
            title="Полный цикл (врачей)"
            value={fullCycleTotal}
            icon={Users}
          />
        </div>
      </section>

      {/* Эффективность МП */}
      <section>
        <h2 className="text-lg font-bold text-dark-DEFAULT mb-4">Эффективность МП</h2>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <EfficiencyChart data={employeeStats} />
          <CorrelationChart data={employeeStats} />
        </div>
      </section>

      {/* Динамика по периодам */}
      <section>
        <h2 className="text-lg font-bold text-dark-DEFAULT mb-4">Динамика по периодам</h2>
        <TrendChart data={employeeStats} />
      </section>

      {/* Соответствие договору */}
      <section>
        <h2 className="text-lg font-bold text-dark-DEFAULT mb-4">Соответствие договору</h2>
        <ContractCompliance data={employeeStats} />
      </section>

      {/* KPI по разрядам */}
      <section>
        <h2 className="text-lg font-bold text-dark-DEFAULT mb-4">KPI по разрядам</h2>
        <KPIList data={employeeStats} />
      </section>

      {/* Аномалии и риски */}
      <section>
        <h2 className="text-lg font-bold text-dark-DEFAULT mb-4">Аномалии и риски</h2>
        <AnomaliesList data={employeeStats} />
      </section>

      {/* Рейтинги и сравнения */}
      <section>
        <h2 className="text-lg font-bold text-dark-DEFAULT mb-4">Рейтинги и сравнения</h2>
        <RankingsTable data={employeeStats} onSelect={onSelectEmployee} />
      </section>
    </div>
  );
};
