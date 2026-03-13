import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Plus, Trash2, Save, Loader2, X } from 'lucide-react';
import { EmployeeCoverageAssignment, EmployeeSummary, GenericRow } from '../types';
import {
  loadEmployeeCoverageAssignments,
  saveEmployeeCoverageAssignments,
} from '../services/supabaseDataService';
import { buildCoverageAssignmentsFromHistory, abbreviateLpuName, normalizeLinkKey, getValueByMatchers } from '../services/dataService';
import { COLUMN_MATCHERS } from '../constants';

interface Props {
  employee: EmployeeSummary;
  visitsData: GenericRow[];
  bonusesData: GenericRow[];
  doctorsData: GenericRow[];
  onBack: () => void;
}

export const EmployeeObjectsEditor: React.FC<Props> = ({
  employee, visitsData, bonusesData, doctorsData, onBack,
}) => {
  const [assignments, setAssignments] = useState<EmployeeCoverageAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  // institution key → region from doctorsData
  const institutionRegionMap = useMemo(() => {
    const map = new Map<string, string>();
    doctorsData.forEach(row => {
      const inst   = getValueByMatchers(row, COLUMN_MATCHERS.INSTITUTION) ?? '';
      const region = getValueByMatchers(row, COLUMN_MATCHERS.REGION) ?? '';
      if (inst && region) map.set(normalizeLinkKey(inst), region);
    });
    return map;
  }, [doctorsData]);

  // New institution / specialty inputs
  const [newInstitution, setNewInstitution] = useState('');
  const [newSpecialty, setNewSpecialty]     = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const map = await loadEmployeeCoverageAssignments();
        if (cancelled) return;
        const stored = map[employee.id];
        setAssignments(
          stored?.length
            ? stored
            : buildCoverageAssignmentsFromHistory(employee, visitsData, bonusesData)
        );
      } catch {
        if (!cancelled)
          setAssignments(buildCoverageAssignmentsFromHistory(employee, visitsData, bonusesData));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [employee, visitsData, bonusesData]);

  const save = async () => {
    setSaving(true);
    try {
      const map = await loadEmployeeCoverageAssignments();
      map[employee.id] = assignments;
      await saveEmployeeCoverageAssignments(map);
      setDirty(false);
    } catch (e) {
      alert('Ошибка сохранения: ' + String(e));
    } finally {
      setSaving(false);
    }
  };

  const removeInstitution = (idx: number) => {
    setAssignments(a => a.filter((_, i) => i !== idx));
    setDirty(true);
  };

  const removeSpecialty = (instIdx: number, specIdx: number) => {
    setAssignments(a => a.map((item, i) =>
      i !== instIdx ? item : { ...item, specialties: item.specialties.filter((_, j) => j !== specIdx) }
    ));
    setDirty(true);
  };

  const addSpecialty = (instIdx: number, spec: string) => {
    const s = spec.trim();
    if (!s) return;
    setAssignments(a => a.map((item, i) =>
      i !== instIdx || item.specialties.includes(s)
        ? item
        : { ...item, specialties: [...item.specialties, s] }
    ));
    setDirty(true);
  };

  const addInstitution = () => {
    const inst = newInstitution.trim();
    const spec = newSpecialty.trim();
    if (!inst) return;
    setAssignments(a => {
      const existing = a.find(x => x.institution.toLowerCase() === inst.toLowerCase());
      if (existing) {
        return a.map(x =>
          x.institution.toLowerCase() !== inst.toLowerCase() ? x
          : spec && !x.specialties.includes(spec)
            ? { ...x, specialties: [...x.specialties, spec] }
            : x
        );
      }
      return [...a, { institution: inst, specialties: spec ? [spec] : [] }];
    });
    setNewInstitution('');
    setNewSpecialty('');
    setDirty(true);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-white rounded-xl border border-slate-200 px-4 py-3 flex items-center gap-3">
        <button
          onClick={onBack}
          className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-dark-DEFAULT transition-colors shrink-0"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-bold text-dark-DEFAULT">Объекты и специальности</h2>
          <p className="text-xs text-slate-500 truncate">
            {employee.name}
            {employee.group  ? ` · ${employee.group}`  : ''}
            {employee.region ? ` · ${employee.region}` : ''}
          </p>
        </div>
        {dirty && (
          <button
            onClick={save}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-60 shrink-0"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Сохранить
          </button>
        )}
      </div>

      {loading ? (
        <div className="bg-white rounded-xl border border-slate-200 p-10 flex items-center justify-center gap-2 text-slate-400 text-sm">
          <Loader2 size={16} className="animate-spin" /> Загрузка...
        </div>
      ) : (
        <>
          {/* Institution list */}
          {assignments.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-sm text-slate-400">
              Нет назначенных учреждений
            </div>
          ) : (
            <div className="space-y-2">
              {assignments.map((item, instIdx) => (
                <div key={instIdx} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                  {/* Institution header */}
                  <div className="flex items-center gap-3 px-4 py-2.5 bg-slate-50 border-b border-slate-100">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm text-dark-DEFAULT">{abbreviateLpuName(item.institution)}</span>
                        {institutionRegionMap.get(normalizeLinkKey(item.institution)) && (
                          <span className="text-[11px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                            {institutionRegionMap.get(normalizeLinkKey(item.institution))}
                          </span>
                        )}
                      </div>
                      {abbreviateLpuName(item.institution) !== item.institution && (
                        <div className="text-[11px] text-slate-400 truncate mt-0.5">{item.institution}</div>
                      )}
                    </div>
                    <button
                      onClick={() => removeInstitution(instIdx)}
                      className="p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors shrink-0"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>

                  {/* Specialties */}
                  <div className="px-4 py-2.5 flex flex-wrap gap-1.5 items-center">
                    {item.specialties.length === 0 && (
                      <span className="text-xs text-slate-400 italic">Нет специальностей</span>
                    )}
                    {item.specialties.map((spec, specIdx) => (
                      <span
                        key={specIdx}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs bg-indigo-50 text-indigo-700 border border-indigo-200"
                      >
                        {spec}
                        <button
                          onClick={() => removeSpecialty(instIdx, specIdx)}
                          className="hover:text-red-500 transition-colors"
                        >
                          <X size={10} />
                        </button>
                      </span>
                    ))}
                    {/* Inline add specialty */}
                    <AddSpecialtyInline onAdd={spec => addSpecialty(instIdx, spec)} />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Add institution */}
          <div className="bg-white rounded-xl border border-slate-200 px-4 py-3">
            <p className="text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wide">Добавить учреждение</p>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Название учреждения..."
                value={newInstitution}
                onChange={e => setNewInstitution(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addInstitution(); }}
                className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 placeholder:text-slate-300"
              />
              <input
                type="text"
                placeholder="Специальность (необязательно)..."
                value={newSpecialty}
                onChange={e => setNewSpecialty(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addInstitution(); }}
                className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 placeholder:text-slate-300"
              />
              <button
                onClick={addInstitution}
                disabled={!newInstitution.trim()}
                className="flex items-center gap-1.5 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-40 shrink-0"
              >
                <Plus size={14} />
                Добавить
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

// ── Inline add specialty ──────────────────────────────────────────────────────

const AddSpecialtyInline: React.FC<{ onAdd: (spec: string) => void }> = ({ onAdd }) => {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState('');

  const commit = () => {
    const s = val.trim();
    if (s) onAdd(s);
    setVal('');
    setEditing(false);
  };

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs border border-dashed border-slate-300 text-slate-400 hover:border-indigo-400 hover:text-indigo-600 transition-colors"
      >
        <Plus size={10} /> Специальность
      </button>
    );
  }

  return (
    <input
      autoFocus
      type="text"
      value={val}
      onChange={e => setVal(e.target.value)}
      onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setVal(''); setEditing(false); } }}
      placeholder="Специальность..."
      className="px-2.5 py-1 border border-indigo-300 rounded-full text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400 min-w-[140px]"
    />
  );
};
