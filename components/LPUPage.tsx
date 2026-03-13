// components/LPUPage.tsx
import React, { useState, useEffect, useMemo } from 'react';
import { GenericRow } from '../types';
import { COLUMN_MATCHERS } from '../constants';
import {
  loadInstitutionAliases,
  saveInstitutionAliases,
  loadInstitutionDuplicateIgnores,
  saveInstitutionDuplicateIgnores,
  type InstitutionAliases,
} from '../services/supabaseDataService';
import { isSupabaseConfigured } from '../lib/supabase';
import { Loader2, AlertCircle, Merge, ChevronRight, ChevronDown, Building2, UserX, Search } from 'lucide-react';

const PAGE_SIZE = 50;

interface Props {
  doctorsData: GenericRow[];
}

interface InstitutionInfo {
  name: string;
  abbr: string;   // Аб — аббревиатура
  region: string;
  count: number;
}

const normalizeKey = (s: string) => String(s || '').trim().replace(/\s+/g, ' ').toLowerCase();

function findColValue(row: GenericRow, matchers: string[]): string {
  const keys = Object.keys(row);
  for (const m of matchers) {
    const exact = keys.find(k => k.toLowerCase() === m);
    if (exact) return String(row[exact] ?? '').trim();
  }
  const key = keys.find(k => matchers.some(m => k.toLowerCase().includes(m)));
  return key ? String(row[key] ?? '').trim() : '';
}

function getAbbrFromRow(row: GenericRow): string {
  // "Аб" — отдельная колонка с аббревиатурой ЛПУ
  const keys = Object.keys(row);
  const key = keys.find(k => k.toLowerCase().trim() === 'аб');
  return key ? String(row[key] ?? '').trim() : '';
}

// Умный алгоритм для ЛПУ — только реальные дубликаты:
// 1. Точное совпадение
// 2. Одно название содержит другое (мин. длина 5 символов)
// 3. Первые 2 слова совпадают (мин. 2 слова у обоих)
function findPotentialDuplicates(names: string[]): [string, string][] {
  const seen = new Set<string>();
  const pairs: [string, string][] = [];

  // Группируем по первому слову для O(n × avg_group_size) вместо O(n²)
  const groups = new Map<string, string[]>();
  for (const name of names) {
    const firstWord = normalizeKey(name).split(/\s+/)[0] || '';
    if (!groups.has(firstWord)) groups.set(firstWord, []);
    groups.get(firstWord)!.push(name);
  }

  for (const group of groups.values()) {
    if (group.length < 2) continue;
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const na = normalizeKey(group[i]);
        const nb = normalizeKey(group[j]);
        const pairKey = na < nb ? `${na}|${nb}` : `${nb}|${na}`;
        if (seen.has(pairKey)) continue;
        seen.add(pairKey);

        // Точное совпадение
        if (na === nb) {
          pairs.push(na.length >= nb.length ? [group[j], group[i]] : [group[i], group[j]]);
          continue;
        }

        // Одно является подстрокой другого (мин. 5 символов для короткого)
        const shorter = na.length < nb.length ? na : nb;
        const longer = na.length < nb.length ? nb : na;
        const shorterOrig = na.length < nb.length ? group[i] : group[j];
        const longerOrig = na.length < nb.length ? group[j] : group[i];
        if (shorter.length >= 5 && longer.includes(shorter)) {
          pairs.push([shorterOrig, longerOrig]);
          continue;
        }

        // Первые 2 слова совпадают
        const wa = na.split(/\s+/);
        const wb = nb.split(/\s+/);
        if (wa.length >= 2 && wb.length >= 2 && wa[0] === wb[0] && wa[1] === wb[1]) {
          pairs.push(na.length >= nb.length ? [group[j], group[i]] : [group[i], group[j]]);
        }
      }
    }
  }
  return pairs;
}

export const LPUPage: React.FC<Props> = ({ doctorsData }) => {
  const [aliases, setAliases] = useState<InstitutionAliases>({});
  const [duplicateIgnores, setDuplicateIgnores] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [merging, setMerging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedPairs, setSelectedPairs] = useState<Set<string>>(new Set());
  const [aliasesExpanded, setAliasesExpanded] = useState(false);
  const [searchFilter, setSearchFilter] = useState('');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  useEffect(() => {
    if (!isSupabaseConfigured()) { setLoading(false); setError('Supabase не настроен'); return; }
    Promise.all([loadInstitutionAliases(), loadInstitutionDuplicateIgnores()])
      .then(([a, ig]) => { setAliases(a); setDuplicateIgnores(ig); })
      .catch(e => setError(e instanceof Error ? e.message : 'Ошибка загрузки'))
      .finally(() => setLoading(false));
  }, []);

  const aliasFromKeys = useMemo(() => new Set(Object.keys(aliases)), [aliases]);

  // Строим карту учреждений с регионом и аббревиатурой
  const institutionMap = useMemo(() => {
    const map = new Map<string, InstitutionInfo>();
    for (const row of doctorsData) {
      const name = findColValue(row, COLUMN_MATCHERS.INSTITUTION);
      if (!name) continue;
      const key = normalizeKey(name);
      if (aliasFromKeys.has(key)) continue;
      if (map.has(key)) {
        map.get(key)!.count++;
      } else {
        map.set(key, {
          name,
          abbr: getAbbrFromRow(row),
          region: findColValue(row, COLUMN_MATCHERS.REGION),
          count: 1,
        });
      }
    }
    return map;
  }, [doctorsData, aliasFromKeys]);

  const allInstitutions = useMemo(
    () => Array.from(institutionMap.values()).sort((a, b) => a.name.localeCompare(b.name, 'ru')),
    [institutionMap]
  );

  const filteredInstitutions = useMemo(() => {
    if (!searchFilter.trim()) return allInstitutions;
    const q = searchFilter.toLowerCase();
    return allInstitutions.filter(i =>
      i.name.toLowerCase().includes(q) ||
      i.abbr.toLowerCase().includes(q) ||
      i.region.toLowerCase().includes(q)
    );
  }, [allInstitutions, searchFilter]);

  const allInstitutionNames = useMemo(() => allInstitutions.map(i => i.name), [allInstitutions]);

  const getPairKey = (a: string, b: string) => [normalizeKey(a), normalizeKey(b)].sort().join('|');

  const potentialDuplicates = useMemo(() => {
    const pairs = findPotentialDuplicates(allInstitutionNames);
    return pairs.filter(([a, b]) => !duplicateIgnores.has(getPairKey(a, b)));
  }, [allInstitutionNames, duplicateIgnores]);

  const visibleDuplicates = useMemo(
    () => potentialDuplicates.slice(0, visibleCount),
    [potentialDuplicates, visibleCount]
  );

  const selectedCount = potentialDuplicates.filter(([a, b]) => selectedPairs.has(getPairKey(a, b))).length;

  const handleMerge = async (fromName: string, toName: string) => {
    setMerging(true); setError(null);
    try {
      const newAliases = { ...aliases, [normalizeKey(fromName)]: toName };
      await saveInstitutionAliases(newAliases);
      setAliases(newAliases);
    } catch (e) { setError(e instanceof Error ? e.message : 'Ошибка'); }
    finally { setMerging(false); }
  };

  const handleIgnore = async (a: string, b: string) => {
    setMerging(true); setError(null);
    try {
      const newIgnores = new Set<string>(duplicateIgnores);
      newIgnores.add(getPairKey(a, b));
      await saveInstitutionDuplicateIgnores(newIgnores);
      setDuplicateIgnores(newIgnores);
    } catch (e) { setError(e instanceof Error ? e.message : 'Ошибка'); }
    finally { setMerging(false); }
  };

  const handleMergeSelected = async () => {
    if (selectedCount === 0) return;
    setMerging(true); setError(null);
    const toMerge = potentialDuplicates.filter(([a, b]) => selectedPairs.has(getPairKey(a, b)));
    try {
      const newAliases = { ...aliases };
      for (const [from, to] of toMerge) newAliases[normalizeKey(from)] = to;
      await saveInstitutionAliases(newAliases);
      setAliases(newAliases);
      setSelectedPairs(new Set());
    } catch (e) { setError(e instanceof Error ? e.message : 'Ошибка'); }
    finally { setMerging(false); }
  };

  const handleIgnoreSelected = async () => {
    if (selectedCount === 0) return;
    setMerging(true); setError(null);
    try {
      const newIgnores = new Set<string>(duplicateIgnores);
      potentialDuplicates.filter(([a, b]) => selectedPairs.has(getPairKey(a, b)))
        .forEach(([a, b]) => newIgnores.add(getPairKey(a, b)));
      await saveInstitutionDuplicateIgnores(newIgnores);
      setDuplicateIgnores(newIgnores);
      setSelectedPairs(new Set());
    } catch (e) { setError(e instanceof Error ? e.message : 'Ошибка'); }
    finally { setMerging(false); }
  };

  const handleUnmerge = async (fromKey: string) => {
    setMerging(true); setError(null);
    try {
      const newAliases = { ...aliases };
      delete newAliases[fromKey];
      await saveInstitutionAliases(newAliases);
      setAliases(newAliases);
    } catch (e) { setError(e instanceof Error ? e.message : 'Ошибка'); }
    finally { setMerging(false); }
  };

  const existingAliases = useMemo(() => Object.entries(aliases), [aliases]);

  // Группируем по региону
  const byRegion = useMemo(() => {
    const map = new Map<string, InstitutionInfo[]>();
    for (const inst of filteredInstitutions) {
      const reg = inst.region || 'Без региона';
      if (!map.has(reg)) map.set(reg, []);
      map.get(reg)!.push(inst);
    }
    return map;
  }, [filteredInstitutions]);

  const regions = useMemo(
    () => Array.from(byRegion.keys()).sort((a, b) => a.localeCompare(b, 'ru')),
    [byRegion]
  );

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 size={32} className="animate-spin text-primary-500" /></div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-dark-DEFAULT">ЛПУ</h2>
        <p className="text-sm text-slate-500">Управление учреждениями: объединение дублирующихся записей</p>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-4 rounded-lg bg-red-50 border border-red-200 text-red-700">
          <AlertCircle size={18} /> {error}
        </div>
      )}

      {/* Объединённые записи */}
      {existingAliases.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <button
            onClick={() => setAliasesExpanded(v => !v)}
            className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-slate-50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-slate-700">Объединённые записи</span>
              <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{existingAliases.length}</span>
            </div>
            {aliasesExpanded ? <ChevronDown size={16} className="text-slate-400" /> : <ChevronRight size={16} className="text-slate-400" />}
          </button>
          {aliasesExpanded && (
            <div className="divide-y divide-slate-100 border-t border-slate-100">
              {existingAliases.map(([fromKey, toName]) => (
                <div key={fromKey} className="flex items-center justify-between gap-4 px-4 py-2.5">
                  <div className="flex items-center gap-2 min-w-0 text-sm">
                    <span className="text-slate-400 line-through truncate">{fromKey}</span>
                    <ChevronRight size={14} className="text-slate-300 shrink-0" />
                    <span className="text-dark-DEFAULT font-medium truncate">{toName}</span>
                  </div>
                  <button
                    onClick={() => handleUnmerge(fromKey)}
                    disabled={merging}
                    className="flex items-center gap-1 px-2.5 py-1 text-xs text-slate-500 hover:text-red-600 border border-slate-200 hover:border-red-200 rounded-lg transition-colors shrink-0 disabled:opacity-50"
                  >
                    <UserX size={12} /> Разъединить
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Возможные дубликаты */}
      {potentialDuplicates.length > 0 && (
        <div className="bg-amber-50 rounded-xl border border-amber-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-amber-100 flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <Merge size={18} className="text-amber-600" />
              <h3 className="font-semibold text-amber-800">Возможные дубликаты</h3>
              <span className="text-xs text-amber-600 bg-amber-100 px-2 py-0.5 rounded-full">{potentialDuplicates.length}</span>
            </div>
            {selectedCount > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-amber-700">Выбрано: {selectedCount}</span>
                <button onClick={handleMergeSelected} disabled={merging}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-primary-500 text-white rounded-lg text-sm font-medium hover:bg-primary-600 disabled:opacity-60 transition-colors">
                  {merging ? <Loader2 size={14} className="animate-spin" /> : <Merge size={14} />} Объединить выбранные
                </button>
                <button onClick={handleIgnoreSelected} disabled={merging}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 text-slate-600 rounded-lg text-sm font-medium hover:bg-slate-200 disabled:opacity-60 transition-colors">
                  Это разные
                </button>
              </div>
            )}
          </div>
          <div className="p-4 space-y-3">
            <p className="text-sm text-amber-700">Система обнаружила учреждения с похожими названиями. Объедините дубликаты для корректной статистики.</p>
            <label className="flex items-center gap-2 cursor-pointer text-sm text-amber-800">
              <input type="checkbox"
                checked={selectedCount === potentialDuplicates.length && potentialDuplicates.length > 0}
                onChange={e => {
                  if (e.target.checked) setSelectedPairs(new Set(potentialDuplicates.map(([a, b]) => getPairKey(a, b))));
                  else setSelectedPairs(new Set());
                }}
                className="rounded border-amber-400 text-primary-500 focus:ring-primary-500"
              /> Выбрать все
            </label>
            <div className="space-y-2">
              {visibleDuplicates.map(([from, to]) => {
                const pairKey = getPairKey(from, to);
                const isSelected = selectedPairs.has(pairKey);
                const fromInfo = institutionMap.get(normalizeKey(from));
                const toInfo = institutionMap.get(normalizeKey(to));
                return (
                  <div key={pairKey}
                    className={`flex items-center justify-between gap-4 p-3 rounded-lg border transition-colors ${isSelected ? 'bg-primary-50/50 border-primary-200' : 'bg-white border-amber-100'}`}>
                    <label className="flex items-center gap-3 min-w-0 cursor-pointer flex-1">
                      <input type="checkbox" checked={isSelected}
                        onChange={() => setSelectedPairs(prev => { const n = new Set(prev); n.has(pairKey) ? n.delete(pairKey) : n.add(pairKey); return n; })}
                        className="rounded border-slate-300 text-primary-500 focus:ring-primary-500 shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start gap-2 flex-wrap">
                          {/* FROM */}
                          <div className="min-w-0">
                            <span className="text-sm font-medium text-slate-600 block">{from}</span>
                            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                              {fromInfo?.abbr && (
                                <span className="text-xs bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-mono">{fromInfo.abbr}</span>
                              )}
                              {fromInfo?.region && (
                                <span className="text-xs text-slate-400">{fromInfo.region}</span>
                              )}
                            </div>
                          </div>
                          <ChevronRight size={16} className="text-amber-500 shrink-0 mt-0.5" />
                          {/* TO */}
                          <div className="min-w-0">
                            <span className="text-sm font-medium text-dark-DEFAULT block">{to}</span>
                            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                              {toInfo?.abbr && (
                                <span className="text-xs bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-mono">{toInfo.abbr}</span>
                              )}
                              {toInfo?.region && (
                                <span className="text-xs text-slate-400">{toInfo.region}</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </label>
                    <div className="shrink-0 flex items-center gap-2">
                      <button onClick={() => handleMerge(from, to)} disabled={merging}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-primary-500 text-white rounded-lg text-sm font-medium hover:bg-primary-600 disabled:opacity-60 transition-colors">
                        {merging ? <Loader2 size={14} className="animate-spin" /> : <Merge size={14} />} Объединить
                      </button>
                      <button onClick={() => handleIgnore(from, to)} disabled={merging}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 text-slate-600 rounded-lg text-sm font-medium hover:bg-slate-200 disabled:opacity-60 transition-colors">
                        Это разные
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            {visibleCount < potentialDuplicates.length && (
              <button
                onClick={() => setVisibleCount(v => v + PAGE_SIZE)}
                className="w-full py-2.5 text-sm text-amber-700 hover:text-amber-900 border border-amber-200 hover:border-amber-300 rounded-lg bg-white hover:bg-amber-50 transition-colors"
              >
                Показать ещё ({potentialDuplicates.length - visibleCount} из {potentialDuplicates.length})
              </button>
            )}
          </div>
        </div>
      )}

      {/* Список всех учреждений */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Building2 size={18} className="text-slate-500" />
            <span className="text-sm font-semibold text-slate-700">Все учреждения</span>
            <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{allInstitutions.length}</span>
          </div>
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Поиск по названию, Аб, региону..."
              value={searchFilter}
              onChange={e => setSearchFilter(e.target.value)}
              className="pl-7 pr-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 w-64"
            />
          </div>
        </div>
        {allInstitutions.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-400">Нет данных об учреждениях. Загрузите базу врачей.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {regions.map(region => (
              <div key={region}>
                <div className="px-4 py-2 bg-slate-50 flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{region}</span>
                  <span className="text-xs text-slate-400">({byRegion.get(region)?.length})</span>
                </div>
                {byRegion.get(region)?.map(inst => (
                  <div key={inst.name} className="px-4 py-2.5 flex items-center gap-3">
                    <Building2 size={14} className="text-slate-300 shrink-0" />
                    <span className="text-sm text-dark-DEFAULT flex-1">{inst.name}</span>
                    {inst.abbr && (
                      <span className="text-xs bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-mono shrink-0">{inst.abbr}</span>
                    )}
                    <span className="text-xs text-slate-400 shrink-0">{inst.count} врачей</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
