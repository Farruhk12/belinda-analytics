import React, { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { EmployeeSummary, MonthlyInteraction } from '../types';

interface Props {
  data: EmployeeSummary[];
}

const formatMonthLabel = (m: string) => {
  if (m.includes('-Q')) {
    const [y, q] = m.split('-Q');
    return `Q${q} ${y}`;
  }
  const [y, mo] = m.split('-');
  const months = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];
  const idx = parseInt(mo, 10) - 1;
  return `${months[idx] || mo} ${y}`;
};

export const TrendChart: React.FC<Props> = ({ data }) => {
  const { chartData, trend } = useMemo(() => {
    const byMonth = new Map<string, { visits: number; bonuses: number }>();

    data.forEach((emp) => {
      emp.doctors.forEach((doc) => {
        (Object.entries(doc.history || {}) as [string, MonthlyInteraction][]).forEach(([month, stats]) => {
          const cur = byMonth.get(month) ?? { visits: 0, bonuses: 0 };
          cur.visits += stats.visits;
          cur.bonuses += stats.bonuses;
          byMonth.set(month, cur);
        });
      });
    });

    const sorted = Array.from(byMonth.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, stats]) => ({
        month,
        monthLabel: formatMonthLabel(month),
        visits: stats.visits,
        bonuses: stats.bonuses,
      }));

    let trendText = '';
    if (sorted.length >= 2) {
      const last = sorted[sorted.length - 1];
      const prev = sorted[sorted.length - 2];
      const visitsDelta = last.visits - prev.visits;
      const bonusesDelta = last.bonuses - prev.bonuses;
      const visitsPct = prev.visits > 0 ? ((visitsDelta / prev.visits) * 100).toFixed(0) : '—';
      const bonusesPct = prev.bonuses > 0 ? ((bonusesDelta / prev.bonuses) * 100).toFixed(0) : '—';
      trendText = `К предыдущему периоду: визиты ${visitsDelta >= 0 ? '+' : ''}${visitsDelta} (${visitsPct}%), бонусы ${bonusesDelta >= 0 ? '+' : ''}${new Intl.NumberFormat('ru-RU').format(bonusesDelta)} (${bonusesPct}%)`;
    }

    return { chartData: sorted, trend: trendText };
  }, [data]);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const d = payload[0].payload;
      return (
        <div className="bg-white border border-slate-200 p-4 rounded-lg shadow-lg">
          <p className="font-bold text-dark-DEFAULT mb-2">{d.monthLabel}</p>
          <p className="text-sm text-primary-500">Визиты: {d.visits}</p>
          <p className="text-sm text-dark-500">
            Бонусы: {new Intl.NumberFormat('ru-RU').format(d.bonuses)}
          </p>
        </div>
      );
    }
    return null;
  };

  if (chartData.length === 0) {
    return (
      <div className="w-full h-[400px] bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-center">
        <p className="text-slate-500">Нет данных по месяцам. Выберите период «За всё время» или загрузите данные с датами.</p>
      </div>
    );
  }

  return (
    <div className="w-full h-[400px] bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
      <h3 className="text-lg font-semibold text-dark-DEFAULT mb-2">Динамика по периодам</h3>
      {trend && (
        <p className="text-xs text-slate-500 mb-4">{trend}</p>
      )}
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={chartData}
          margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="monthLabel" axisLine={false} tickLine={false} tick={{ fill: '#424B52', fontSize: 11 }} />
          <YAxis yAxisId="left" stroke="#DF3B20" axisLine={false} tickLine={false} />
          <YAxis yAxisId="right" orientation="right" stroke="#424B52" axisLine={false} tickLine={false} />
          <Tooltip content={<CustomTooltip />} />
          <Legend />
          <Line
            yAxisId="left"
            type="monotone"
            dataKey="visits"
            name="Визиты"
            stroke="#DF3B20"
            strokeWidth={2}
            dot={{ fill: '#DF3B20' }}
          />
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="bonuses"
            name="Бонусы"
            stroke="#424B52"
            strokeWidth={2}
            dot={{ fill: '#424B52' }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};
