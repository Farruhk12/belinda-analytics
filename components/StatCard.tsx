import React from 'react';
import { LucideIcon } from 'lucide-react';

interface StatCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  trend?: string;
  trendUp?: boolean;
}

const StatCard: React.FC<StatCardProps> = ({ title, value, icon: Icon, trend, trendUp }) => {
  // We use the brand primary color (#DF3B20) for accents now
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm flex items-start justify-between transition-all hover:shadow-md">
      <div>
        <p className="text-sm font-medium text-dark-500 mb-1 opacity-80">{title}</p>
        <h3 className="text-2xl font-bold text-dark-DEFAULT">{value}</h3>
        {trend && (
          <p className={`text-xs mt-2 font-medium ${trendUp ? 'text-emerald-600' : 'text-primary-500'} flex items-center`}>
            {trend}
          </p>
        )}
      </div>
      <div className="p-3 rounded-lg bg-red-50 text-primary-500">
        <Icon size={24} />
      </div>
    </div>
  );
};

export default StatCard;