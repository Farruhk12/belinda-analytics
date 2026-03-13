import React, { useState, useEffect, useMemo } from 'react';
import { StaffRecord } from '../types';
import {
  loadStaffFromSupabase,
  saveStaffToSupabase,
  loadEmployeeAliases,
  saveEmployeeAliases,
  loadEmployeeDuplicateIgnores,
  saveEmployeeDuplicateIgnores,
  type EmployeeAliases,
} from '../services/supabaseDataService';
import { isSupabaseConfigured } from '../lib/supabase';
import { Save, Loader2, AlertCircle, ArrowLeft, MapPin, Layers, Merge, ChevronRight } from 'lucide-react';

const normalizeKey = (s: string) =>
  String(s || '').trim().replace(/\s+/g, ' ').toLowerCase();

/** Расстояние Левенштейна для нечёткого сравнения имён */
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }
  return dp[m][n];
}

/** Похожи ли два слова (опечатка, сокращение: Азимджон ↔ Азимчон) */
function wordsSimilar(w1: string, w2: string): boolean {
  if (w1 === w2) return true;
  if (w1.startsWith(w2) || w2.startsWith(w1)) return true;
  const len = Math.min(w1.length, w2.length);
  if (len >= 3 && levenshtein(w1, w2) <= 3) return true;
  return false;
}

/** Найти потенциальные дубликаты: пары [короткое имя, полное имя] */
function findPotentialDuplicates(names: string[]): [string, string][] {
  const seen = new Set<string>();
  const pairs: [string, string][] = [];
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      const a = names[i];
      const b = names[j];
      const na = normalizeKey(a);
      const nb = normalizeKey(b);
      const pairKey = [na, nb].sort().join('|');
      if (seen.has(pairKey)) continue;
      // Идентичные имена — дубликаты записей (один человек дважды в списке)
      if (na === nb) {
        seen.add(pairKey);
        pairs.push(na.length >= nb.length ? [b, a] : [a, b]);
        continue;
      }
      seen.add(pairKey);
      // Одно имя — подстрока другого (например "Назаралиев Руслан" в "Назаралиев Руслан Мехралиевич")
      if (na.includes(nb) || nb.includes(na)) {
        pairs.push(na.length >= nb.length ? [b, a] : [a, b]);
        continue;
      }
      // Первые 2 слова совпадают (Фамилия Имя)
      const wordsA = na.split(/\s+/);
      const wordsB = nb.split(/\s+/);
      if (wordsA.length >= 2 && wordsB.length >= 2 &&
          wordsA.slice(0, 2).join(' ') === wordsB.slice(0, 2).join(' ')) {
        pairs.push(na.length >= nb.length ? [b, a] : [a, b]);
        continue;
      }
      // Фамилия совпадает + имя похоже (опечатка/сокращение: Азимджон ↔ Азимчон)
      if (wordsA.length >= 2 && wordsB.length >= 2 && wordsA[0] === wordsB[0] &&
          wordsSimilar(wordsA[1], wordsB[1])) {
        pairs.push(na.length >= nb.length ? [b, a] : [a, b]);
        continue;
      }
      // Фамилия похожа (опечатка: Чураева ↔ Чурраева) + имя и отчество совпадают
      if (wordsA.length >= 2 && wordsB.length >= 2 &&
          wordsSimilar(wordsA[0], wordsB[0]) &&
          wordsA.slice(1).join(' ') === wordsB.slice(1).join(' ')) {
        pairs.push(na.length >= nb.length ? [b, a] : [a, b]);
      }
    }
  }
  return pairs;
}

interface Props {
  employeesFromData: { id: string; name: string; group: string; region: string }[];
  onBack?: () => void;
  onSave?: () => void;
}

const ROLES: ('МП' | 'Менеджер')[] = ['МП', 'Менеджер'];

const REGION_ORDER = ['Душанбе', 'РРП', 'Курган', 'Куляб', 'Согд', 'РРП2', 'Гарм'];

export const StaffManagement: React.FC<Props> = ({
  employeesFromData,
  onBack,
  onSave,
}) => {
  const [staff, setStaff] = useState<StaffRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aliases, setAliases] = useState<EmployeeAliases>({});
  const [duplicateIgnores, setDuplicateIgnores] = useState<Set<string>>(new Set());
  const [selectedPairs, setSelectedPairs] = useState<Set<string>>(new Set());
  const [merging, setMerging] = useState(false);
  /** Группировка обновляется только при blur — чтобы при вводе строка не «перепрыгивала» в другую секцию */
  const [groupingSnapshot, setGroupingSnapshot] = useState<Record<string, { group: string; region: string }>>({});

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setLoading(false);
      setError('Supabase не настроен');
      return;
    }
    Promise.all([loadStaffFromSupabase(), loadEmployeeAliases(), loadEmployeeDuplicateIgnores()])
      .then(([loaded, aliasMap, ignores]) => {
        setAliases(aliasMap);
        setDuplicateIgnores(ignores);
        const aliasFromKeys = new Set(Object.keys(aliasMap));
        const filtered = loaded.filter(s => !aliasFromKeys.has(s.id));
        const byKey = new Map(filtered.map(s => [s.id, s]));
        const merged: StaffRecord[] = employeesFromData.map(emp => {
          const existing = byKey.get(emp.id);
          return existing ?? {
            id: emp.id,
            name: emp.name,
            group: emp.group || '',
            region: emp.region || '',
            role: 'МП',
            isActive: true,
          };
        });
        setStaff(merged);
        setGroupingSnapshot(prev => {
          const next = { ...prev };
          merged.forEach(s => {
            if (!(s.id in next)) {
              next[s.id] = { group: s.group || 'Без группы', region: s.region || 'Без территории' };
            }
          });
          return next;
        });
      })
      .catch(e => setError(e instanceof Error ? e.message : 'Ошибка загрузки'))
      .finally(() => setLoading(false));
  }, [employeesFromData]);

  const handleBlurGrouping = (id: string) => {
    const row = staff.find(s => s.id === id);
    if (!row) return;
    setGroupingSnapshot(prev => ({
      ...prev,
      [id]: { group: row.group || 'Без группы', region: row.region || 'Без территории' },
    }));
  };

  const handleChange = (id: string, field: keyof StaffRecord, value: string | boolean) => {
    setStaff(prev =>
      prev.map(s =>
        s.id === id ? { ...s, [field]: value } : s
      )
    );
  };

  const grouped = useMemo(() => {
    const byRegion: Record<string, Record<string, StaffRecord[]>> = {};
    staff.forEach(s => {
      const snap = groupingSnapshot[s.id];
      const region = (snap?.region ?? s.region) || 'Без территории';
      const group = (snap?.group ?? s.group) || 'Без группы';
      if (!byRegion[region]) byRegion[region] = {};
      if (!byRegion[region][group]) byRegion[region][group] = [];
      byRegion[region][group].push(s);
    });
    const regions = Object.keys(byRegion).sort((a, b) => {
      const norm = (x: string) => x.toLowerCase().trim();
      const idxA = REGION_ORDER.findIndex(r => norm(r) === norm(a));
      const idxB = REGION_ORDER.findIndex(r => norm(r) === norm(b));
      const posA = idxA >= 0 ? idxA : 999;
      const posB = idxB >= 0 ? idxB : 999;
      if (posA !== posB) return posA - posB;
      return a.localeCompare(b);
    });
    return { byRegion, regions };
  }, [staff, groupingSnapshot]);

  const handleSave = async () => {
    if (!isSupabaseConfigured()) return;
    setSaving(true);
    setError(null);
    try {
      await saveStaffToSupabase(staff);
      onSave?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  };

  const potentialDuplicates = useMemo(() => {
    const names = staff.map(s => s.name).filter(Boolean);
    const pairs = findPotentialDuplicates(names);
    return pairs.filter(([a, b]) => {
      const pairKey = [normalizeKey(a), normalizeKey(b)].sort().join('|');
      return !duplicateIgnores.has(pairKey);
    });
  }, [staff, duplicateIgnores]);

  const handleMerge = async (fromName: string, toName: string) => {
    if (!isSupabaseConfigured()) return;
    setMerging(true);
    setError(null);
    const fromKey = normalizeKey(fromName);
    try {
      const newAliases = { ...aliases, [fromKey]: toName };
      await saveEmployeeAliases(newAliases);
      setAliases(newAliases);
      setStaff(prev => prev.filter(s => s.id !== fromKey));
      onSave?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка объединения');
    } finally {
      setMerging(false);
    }
  };

  const getPairKey = (from: string, to: string) =>
    [normalizeKey(from), normalizeKey(to)].sort().join('|');

  const handleIgnore = async (fromName: string, toName: string) => {
    if (!isSupabaseConfigured()) return;
    setMerging(true);
    setError(null);
    const pairKey = getPairKey(fromName, toName);
    try {
      const newIgnores = new Set<string>(duplicateIgnores);
      newIgnores.add(pairKey);
      await saveEmployeeDuplicateIgnores(newIgnores);
      setDuplicateIgnores(newIgnores);
      setSelectedPairs(prev => { const s = new Set<string>(prev); s.delete(pairKey); return s; });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка сохранения');
    } finally {
      setMerging(false);
    }
  };

  const togglePairSelection = (from: string, to: string) => {
    const pairKey = getPairKey(from, to);
    setSelectedPairs(prev => {
      const next = new Set(prev);
      if (next.has(pairKey)) next.delete(pairKey);
      else next.add(pairKey);
      return next;
    });
  };

  const selectAllPairs = (checked: boolean) => {
    if (checked) {
      setSelectedPairs(new Set(potentialDuplicates.map(([a, b]) => getPairKey(a, b))));
    } else {
      setSelectedPairs(new Set());
    }
  };

  const selectedCount = potentialDuplicates.filter(
    ([a, b]) => selectedPairs.has(getPairKey(a, b))
  ).length;

  const handleMergeSelected = async () => {
    if (!isSupabaseConfigured() || selectedCount === 0) return;
    setMerging(true);
    setError(null);
    const toMerge = potentialDuplicates.filter(([a, b]) => selectedPairs.has(getPairKey(a, b)));
    try {
      const newAliases = { ...aliases };
      const fromKeysToRemove = new Set<string>();
      for (const [from, to] of toMerge) {
        const fromKey = normalizeKey(from);
        newAliases[fromKey] = to;
        fromKeysToRemove.add(fromKey);
      }
      await saveEmployeeAliases(newAliases);
      setAliases(newAliases);
      setStaff(prev => prev.filter(s => !fromKeysToRemove.has(s.id)));
      setSelectedPairs(new Set());
      onSave?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка объединения');
    } finally {
      setMerging(false);
    }
  };

  const handleIgnoreSelected = async () => {
    if (!isSupabaseConfigured() || selectedCount === 0) return;
    setMerging(true);
    setError(null);
    const toIgnore = potentialDuplicates.filter(([a, b]) => selectedPairs.has(getPairKey(a, b)));
    try {
      const newIgnores = new Set<string>(duplicateIgnores);
      for (const [a, b] of toIgnore) {
        newIgnores.add(getPairKey(a, b));
      }
      await saveEmployeeDuplicateIgnores(newIgnores);
      setDuplicateIgnores(newIgnores);
      setSelectedPairs(new Set<string>());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка сохранения');
    } finally {
      setMerging(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={32} className="animate-spin text-primary-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {onBack && (
            <button
              onClick={onBack}
              className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-dark-DEFAULT transition-colors"
            >
              <ArrowLeft size={20} />
            </button>
          )}
          <div>
            <h2 className="text-xl font-bold text-dark-DEFAULT">Сотрудники</h2>
            <p className="text-sm text-slate-500">Группа, область и роль — изменения применяются ко всем данным</p>
          </div>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:opacity-60 transition-colors"
        >
          {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
          Сохранить
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-4 rounded-lg bg-red-50 border border-red-200 text-red-700">
          <AlertCircle size={20} />
          {error}
        </div>
      )}

      {potentialDuplicates.length > 0 && (
        <div className="bg-amber-50 rounded-xl border border-amber-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-amber-100 flex items-center justify-between gap-4 bg-amber-50/80 flex-wrap">
            <div className="flex items-center gap-2">
              <Merge size={18} className="text-amber-600" />
              <h3 className="font-semibold text-amber-800">Возможные дубликаты</h3>
              <span className="text-xs text-amber-600 bg-amber-100 px-2 py-0.5 rounded-full">
                {potentialDuplicates.length}
              </span>
            </div>
            {selectedCount > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-amber-700">Выбрано: {selectedCount}</span>
                <button
                  onClick={handleMergeSelected}
                  disabled={merging}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-primary-500 text-white rounded-lg text-sm font-medium hover:bg-primary-600 disabled:opacity-60 transition-colors"
                >
                  {merging ? <Loader2 size={14} className="animate-spin" /> : <Merge size={14} />}
                  Объединить выбранные
                </button>
                <button
                  onClick={handleIgnoreSelected}
                  disabled={merging}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 text-slate-600 rounded-lg text-sm font-medium hover:bg-slate-200 disabled:opacity-60 transition-colors"
                >
                  Это разные
                </button>
              </div>
            )}
          </div>
          <div className="p-4 space-y-3">
            <p className="text-sm text-amber-700">
              Система обнаружила сотрудников с похожими ФИО — возможно, это один человек из разных таблиц. Выберите пары и объедините записи, чтобы визиты и бонусы учитывались вместе.
            </p>
            <label className="flex items-center gap-2 cursor-pointer text-sm text-amber-800">
              <input
                type="checkbox"
                checked={selectedCount === potentialDuplicates.length && potentialDuplicates.length > 0}
                onChange={e => selectAllPairs(e.target.checked)}
                className="rounded border-amber-400 text-primary-500 focus:ring-primary-500"
              />
              Выбрать все
            </label>
            <div className="space-y-2">
              {potentialDuplicates.map(([from, to]) => {
                const pairKey = getPairKey(from, to);
                const isSelected = selectedPairs.has(pairKey);
                return (
                  <div
                    key={pairKey}
                    className={`flex items-center justify-between gap-4 p-3 rounded-lg border transition-colors ${
                      isSelected ? 'bg-primary-50/50 border-primary-200' : 'bg-white border-amber-100'
                    }`}
                  >
                    <label className="flex items-center gap-3 min-w-0 cursor-pointer flex-1">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => togglePairSelection(from, to)}
                        className="rounded border-slate-300 text-primary-500 focus:ring-primary-500 shrink-0"
                      />
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-sm font-medium text-slate-600 truncate">{from}</span>
                        <ChevronRight size={16} className="text-amber-500 shrink-0" />
                        <span className="text-sm font-medium text-dark-DEFAULT truncate">{to}</span>
                      </div>
                    </label>
                    <div className="shrink-0 flex items-center gap-2">
                      <button
                        onClick={() => handleMerge(from, to)}
                        disabled={merging}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-primary-500 text-white rounded-lg text-sm font-medium hover:bg-primary-600 disabled:opacity-60 transition-colors"
                      >
                        {merging ? <Loader2 size={14} className="animate-spin" /> : <Merge size={14} />}
                        Объединить
                      </button>
                      <button
                        onClick={() => handleIgnore(from, to)}
                        disabled={merging}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 text-slate-600 rounded-lg text-sm font-medium hover:bg-slate-200 disabled:opacity-60 transition-colors"
                      >
                        Это разные
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <div className="space-y-6">
        {staff.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 py-12 text-center text-slate-500">
            Нет сотрудников. Загрузите Excel с данными (Визиты, УВК, Договор, Рецепты).
          </div>
        ) : (
          grouped.regions.map(region => (
            <div key={region}>
              <div className="flex items-center gap-2 mb-3">
                <MapPin size={16} className="text-primary-500" />
                <span className="text-sm font-bold text-dark-DEFAULT uppercase tracking-wider">{region}</span>
                <span className="text-xs font-semibold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                  {Object.values(grouped.byRegion[region]).flat().length}
                </span>
              </div>
              <div className="space-y-4">
                {Object.keys(grouped.byRegion[region]).sort().map(group => (
                  <div key={`${region}-${group}`} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="px-4 py-2 bg-slate-50 border-b border-slate-100 flex items-center gap-2">
                      <Layers size={14} className="text-slate-500" />
                      <span className="text-xs font-semibold text-slate-600 uppercase">{group || 'Без группы'}</span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-slate-100">
                        <thead className="bg-slate-50/50">
                          <tr>
                            <th className="px-4 py-2 text-left text-xs font-semibold text-slate-500 uppercase">Сотрудник</th>
                            <th className="px-4 py-2 text-left text-xs font-semibold text-slate-500 uppercase">Группа</th>
                            <th className="px-4 py-2 text-left text-xs font-semibold text-slate-500 uppercase">Область</th>
                            <th className="px-4 py-2 text-left text-xs font-semibold text-slate-500 uppercase">Роль</th>
                            <th className="px-4 py-2 text-left text-xs font-semibold text-slate-500 uppercase">Неактивный</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {grouped.byRegion[region][group].map(row => (
                            <tr key={row.id} className={`hover:bg-slate-50 ${!row.isActive ? 'bg-slate-100/50 opacity-75' : ''}`}>
                              <td className="px-4 py-2 font-medium text-dark-DEFAULT">{row.name}</td>
                              <td className="px-4 py-2">
                                <input
                                  type="text"
                                  value={row.group}
                                  onChange={e => handleChange(row.id, 'group', e.target.value)}
                                  onBlur={() => handleBlurGrouping(row.id)}
                                  className="w-full max-w-[120px] px-2 py-1 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none"
                                  placeholder="Группа"
                                />
                              </td>
                              <td className="px-4 py-2">
                                <input
                                  type="text"
                                  value={row.region}
                                  onChange={e => handleChange(row.id, 'region', e.target.value)}
                                  onBlur={() => handleBlurGrouping(row.id)}
                                  className="w-full max-w-[120px] px-2 py-1 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none"
                                  placeholder="Область"
                                />
                              </td>
                              <td className="px-4 py-2">
                                <select
                                  value={row.role}
                                  onChange={e => handleChange(row.id, 'role', e.target.value as 'МП' | 'Менеджер')}
                                  className="px-2 py-1 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none bg-white"
                                >
                                  {ROLES.map(r => (
                                    <option key={r} value={r}>{r}</option>
                                  ))}
                                </select>
                              </td>
                              <td className="px-4 py-2">
                                <label className="flex items-center gap-2 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={!row.isActive}
                                    onChange={e => handleChange(row.id, 'isActive', !e.target.checked)}
                                    className="rounded border-slate-300 text-primary-500 focus:ring-primary-500"
                                  />
                                  <span className="text-sm text-slate-600">Неактивный</span>
                                </label>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
