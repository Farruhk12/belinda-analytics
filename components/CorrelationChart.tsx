import React, { useMemo } from 'react';
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Label } from 'recharts';
import { EmployeeSummary } from '../types';

interface Props {
  data: EmployeeSummary[];
}

interface TooltipPayloadItem {
  payload: EmployeeSummary & { costPerVisit: number };
}

interface TooltipProps {
  active?: boolean;
  payload?: TooltipPayloadItem[];
}

const CustomTooltip: React.FC<TooltipProps> = ({ active, payload }) => {
  if (active && payload && payload.length) {
    const d = payload[0].payload;
    return (
      <div className="bg-white border border-slate-200 p-3 rounded shadow-lg text-sm z-50">
        <p className="font-bold text-dark-DEFAULT">{d.name}</p>
        <p className="text-dark-500">Визиты: <span className="font-semibold">{d.totalVisits}</span></p>
        <p className="text-primary-500">Бонусы: <span className="font-semibold">{new Intl.NumberFormat('ru-RU').format(d.totalBonuses)}</span></p>
        <p className="text-xs text-slate-400 mt-1">Стоимость захода: {Math.round(d.costPerVisit)}</p>
      </div>
    );
  }
  return null;
};

export const CorrelationChart: React.FC<Props> = ({ data }) => {
  // Filter out zero activity for cleaner chart
  const activeData = data.filter(d => d.totalVisits > 0 || d.totalBonuses > 0);

  // Calculate real averages from data instead of hardcoded values
  const { avgVisits, avgBonuses } = useMemo(() => {
    if (activeData.length === 0) return { avgVisits: 0, avgBonuses: 0 };
    const totalV = activeData.reduce((s, d) => s + d.totalVisits, 0);
    const totalB = activeData.reduce((s, d) => s + d.totalBonuses, 0);
    return {
      avgVisits: Math.round(totalV / activeData.length),
      avgBonuses: Math.round(totalB / activeData.length),
    };
  }, [activeData]);

  return (
    <div className="w-full h-[400px] bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
      <div className="flex justify-between items-center mb-4">
        <div>
           <h3 className="text-lg font-semibold text-dark-DEFAULT">Матрица Эффективности</h3>
           <p className="text-xs text-slate-500">Ось X: Количество визитов | Ось Y: Сумма бонусов</p>
        </div>
      </div>

      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis type="number" dataKey="totalVisits" name="Визиты" stroke="#94a3b8" fontSize={12}>
            <Label value="Активность (Визиты)" offset={0} position="insideBottom" style={{ fill: '#424B52', fontSize: '12px' }} />
          </XAxis>
          <YAxis type="number" dataKey="totalBonuses" name="Бонусы" stroke="#94a3b8" fontSize={12}>
            <Label value="Результат (Бонусы)" angle={-90} position="insideLeft" style={{ fill: '#424B52', fontSize: '12px' }} />
          </YAxis>
          <Tooltip content={<CustomTooltip />} cursor={{ strokeDasharray: '3 3' }} />

          {/* Quadrant reference lines at real data averages */}
          {avgVisits > 0 && <ReferenceLine x={avgVisits} stroke="#cbd5e1" strokeDasharray="3 3" label={{ value: `Ср: ${avgVisits}`, position: 'top', fontSize: 10, fill: '#94a3b8' }} />}
          {avgBonuses > 0 && <ReferenceLine y={avgBonuses} stroke="#cbd5e1" strokeDasharray="3 3" label={{ value: `Ср: ${new Intl.NumberFormat('ru-RU', { notation: 'compact' }).format(avgBonuses)}`, position: 'right', fontSize: 10, fill: '#94a3b8' }} />}

          <Scatter name="Сотрудники" data={activeData} fill="#DF3B20" fillOpacity={0.6} />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
};