import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { EmployeeSummary } from '../types';

interface Props {
  data: EmployeeSummary[];
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white border border-slate-200 p-4 rounded-lg shadow-lg">
        <p className="font-bold text-dark-DEFAULT mb-2">{label}</p>
        <p className="text-sm text-primary-500">
          Визиты: <span className="font-semibold">{payload[0].value}</span>
        </p>
        <p className="text-sm text-dark-500">
          Бонусы: <span className="font-semibold">{new Intl.NumberFormat('ru-RU').format(payload[1].value)}</span>
        </p>
        <p className="text-xs text-slate-400 mt-2">
           Эффективность: {new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(payload[1].value / (payload[0].value || 1))}/визит
        </p>
      </div>
    );
  }
  return null;
};

export const EfficiencyChart: React.FC<Props> = ({ data }) => {
  // Take top 10 for readability
  const chartData = data.slice(0, 10);

  return (
    <div className="w-full h-[400px] bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
      <h3 className="text-lg font-semibold text-dark-DEFAULT mb-6">Топ 10 Сотрудников: Активность vs Бонусы</h3>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={chartData}
          margin={{
            top: 20,
            right: 30,
            left: 20,
            bottom: 5,
          }}
        >
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
          <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#424B52', fontSize: 12}} />
          <YAxis yAxisId="left" orientation="left" stroke="#DF3B20" axisLine={false} tickLine={false} />
          <YAxis yAxisId="right" orientation="right" stroke="#424B52" axisLine={false} tickLine={false} />
          <Tooltip content={<CustomTooltip />} />
          <Legend />
          <Bar yAxisId="left" dataKey="totalVisits" name="Визиты" fill="#DF3B20" radius={[4, 4, 0, 0]} barSize={20} />
          <Bar yAxisId="right" dataKey="totalBonuses" name="Бонусы" fill="#424B52" radius={[4, 4, 0, 0]} barSize={20} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};