import React from 'react';
import { EmployeeSummary } from '../types';
import { FileSignature, Percent, CheckCircle } from 'lucide-react';

interface Props {
  data: EmployeeSummary[];
}

export const ContractCompliance: React.FC<Props> = ({ data }) => {
  const withContracts = data.filter(d => d.contractsCount > 0);
  const avgDoctorsRate =
    withContracts.length > 0
      ? withContracts.reduce((s, e) => s + (e.contractDoctorsPrescribedRate ?? 0), 0) /
        withContracts.length
      : 0;
  const avgItemsRate =
    withContracts.length > 0
      ? withContracts.reduce((s, e) => s + (e.contractItemsComplianceRate ?? 0), 0) /
        withContracts.length
      : 0;

  const sorted = [...withContracts].sort(
    (a, b) => (b.contractDoctorsPrescribedRate ?? 0) - (a.contractDoctorsPrescribedRate ?? 0)
  );

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-amber-50 rounded-lg text-amber-500">
            <FileSignature size={20} />
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              Ср. % врачей с договором, выписавших рецепты
            </p>
            <p className="text-xl font-bold text-dark-DEFAULT">
              {avgDoctorsRate.toFixed(1)}%
            </p>
          </div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-emerald-50 rounded-lg text-emerald-500">
            <Percent size={20} />
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              Ср. % позиций договора выписано
            </p>
            <p className="text-xl font-bold text-dark-DEFAULT">
              {avgItemsRate.toFixed(1)}%
            </p>
          </div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-blue-50 rounded-lg text-blue-500">
            <CheckCircle size={20} />
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              МП с договорами
            </p>
            <p className="text-xl font-bold text-dark-DEFAULT">{withContracts.length}</p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/50">
          <h3 className="font-semibold text-dark-DEFAULT">Рейтинг по соответствию договору</h3>
          <p className="text-xs text-slate-500 mt-1">
            % врачей с договором, выписавших рецепты по группе
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-100">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">
                  МП
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase">
                  Врачей с договором
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase">
                  % выписавших рецепты
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase">
                  % позиций договора
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {sorted.map((emp) => (
                <tr key={emp.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 text-sm font-medium text-dark-DEFAULT">{emp.name}</td>
                  <td className="px-4 py-3 text-sm text-right">{emp.contractsCount}</td>
                  <td className="px-4 py-3 text-sm text-right">
                    <span
                      className={
                        (emp.contractDoctorsPrescribedRate ?? 0) >= 50
                          ? 'text-emerald-600 font-medium'
                          : (emp.contractDoctorsPrescribedRate ?? 0) >= 25
                            ? 'text-amber-600'
                            : 'text-slate-500'
                      }
                    >
                      {(emp.contractDoctorsPrescribedRate ?? 0).toFixed(1)}%
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-right text-slate-600">
                    {(emp.contractItemsComplianceRate ?? 0).toFixed(1)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {sorted.length === 0 && (
          <div className="py-12 text-center text-slate-500">
            Нет данных по договорам за выбранный период.
          </div>
        )}
      </div>
    </div>
  );
};
