import React, { useState, useEffect, useMemo } from 'react';
import { GenericRow } from '../types';
import { COLUMN_MATCHERS } from '../constants';
import {
  loadDoctorAliases,
  saveDoctorAliases,
  loadDoctorDuplicateIgnores,
  saveDoctorDuplicateIgnores,
  type DoctorAliases,
} from '../services/supabaseDataService';
import { isSupabaseConfigured } from '../lib/supabase';
import { Loader2, AlertCircle, Merge, ChevronRight, ChevronDown, UserX } from 'lucide-react';

const PAGE_SIZE = 50;

const normalizeKey = (s: string) =>
  String(s || '').trim().replace(/\s+/g, ' ').toLowerCase();

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

function wordsSimilar(w1: string, w2: string): boolean {
  if (w1 === w2) return true;
  if (w1.startsWith(w2) || w2.startsWith(w1)) return true;
  const len = Math.min(w1.length, w2.length);
  if (len >= 3 && levenshtein(w1, w2) <= 3) return true;
  return false;
}

type NormItem = { original: string; norm: string; words: string[] };

function findPotentialDuplicates(names: string[]): [string, string][] {
  // Pre-compute once
  const items: NormItem[] = names.map(n => {
    const norm = normalizeKey(n);
    return { original: n, norm, words: norm.split(/\s+/) };
  });

  // Group by first word (last name) → reduces O(n²) to O(n × avg_group_size)
  const groups = new Map<string, NormItem[]>();
  for (const item of items) {
    const key = item.words[0] || '';
    let g = groups.get(key);
    if (!g) { g = []; groups.set(key, g); }
    g.push(item);
  }

  const seen = new Set<string>();
  const pairs: [string, string][] = [];

  const tryAdd = (a: NormItem, b: NormItem) => {
    const na = a.norm, nb = b.norm;
    const pairKey = na < nb ? `${na}|${nb}` : `${nb}|${na}`;
    if (seen.has(pairKey)) return;
    seen.add(pairKey);

    if (na === nb || na.includes(nb) || nb.includes(na)) {
      pairs.push(na.length >= nb.length ? [b.original, a.original] : [a.original, b.original]);
      return;
    }
    const wa = a.words, wb = b.words;
    if (wa.length >= 2 && wb.length >= 2) {
      if (wa[0] === wb[0]) {
        if (wa.slice(0, 2).join(' ') === wb.slice(0, 2).join(' ')) {
          pairs.push(na.length >= nb.length ? [b.original, a.original] : [a.original, b.original]);
          return;
        }
        if (wordsSimilar(wa[1], wb[1])) {
          pairs.push(na.length >= nb.length ? [b.original, a.original] : [a.original, b.original]);
          return;
        }
      } else if (wordsSimilar(wa[0], wb[0]) && wa.slice(1).join(' ') === wb.slice(1).join(' ')) {
        pairs.push(na.length >= nb.length ? [b.original, a.original] : [a.original, b.original]);
      }
    }
  };

  // Within-group only (same last name) — covers 99% of real duplicates
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        tryAdd(group[i], group[j]);
      }
    }
  }

  return pairs;
}

interface Props {
  allDoctorNames: string[];
  doctorsData?: GenericRow[];
  onSave: () => void;
}

export const DoctorManagement: React.FC<Props> = ({ allDoctorNames, doctorsData = [], onSave }) => {
  // Build lookup: normalizedDoctorName → { specialty, institution }
  const doctorContextMap = useMemo(() => {
    const map = new Map<string, { specialty: string; institution: string }>();
    const findKey = (keys: string[], matchers: string[]) => {
      for (const m of matchers) {
        const exact = keys.find(k => k.toLowerCase() === m);
        if (exact) return exact;
      }
      return keys.find(k => matchers.some(m => k.toLowerCase().includes(m)));
    };
    for (const row of doctorsData) {
      const keys = Object.keys(row);
      const nameKey = findKey(keys, COLUMN_MATCHERS.DOCTOR);
      const specKey = findKey(keys, COLUMN_MATCHERS.SPECIALTY);
      const instKey = findKey(keys, COLUMN_MATCHERS.INSTITUTION);
      if (!nameKey) continue;
      const name = String(row[nameKey] ?? '').trim();
      if (!name) continue;
      const key = normalizeKey(name);
      if (!map.has(key)) {
        map.set(key, {
          specialty: specKey ? String(row[specKey] ?? '').trim() : '',
          institution: instKey ? String(row[instKey] ?? '').trim() : '',
        });
      }
    }
    return map;
  }, [doctorsData]);

  const [aliases, setAliases] = useState<DoctorAliases>({});
  const [duplicateIgnores, setDuplicateIgnores] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [computing, setComputing] = useState(false);
  const [merging, setMerging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedPairs, setSelectedPairs] = useState<Set<string>>(new Set());
  const [aliasesExpanded, setAliasesExpanded] = useState(false);
  const [rawDuplicates, setRawDuplicates] = useState<[string, string][]>([]);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [patronymicOnly, setPatronymicOnly] = useState(false);

  useEffect(() => {
    if (!isSupabaseConfigured()) { setLoading(false); setError('Supabase не настроен'); return; }
    Promise.all([loadDoctorAliases(), loadDoctorDuplicateIgnores()])
      .then(([a, ig]) => { setAliases(a); setDuplicateIgnores(ig); })
      .catch(e => setError(e instanceof Error ? e.message : 'Ошибка загрузки'))
      .finally(() => setLoading(false));
  }, []);

  const aliasFromKeys = useMemo(() => new Set(Object.keys(aliases)), [aliases]);

  const activeNames = useMemo(
    () => allDoctorNames.filter(n => !aliasFromKeys.has(normalizeKey(n))),
    [allDoctorNames, aliasFromKeys]
  );

  // Defer heavy computation so the page renders first
  useEffect(() => {
    setComputing(true);
    setVisibleCount(PAGE_SIZE);
    const id = setTimeout(() => {
      const pairs = findPotentialDuplicates(activeNames);
      setRawDuplicates(pairs);
      setComputing(false);
    }, 0);
    return () => clearTimeout(id);
  }, [activeNames]);

  const getPairKey = (a: string, b: string) => [normalizeKey(a), normalizeKey(b)].sort().join('|');

  const potentialDuplicates = useMemo(
    () => rawDuplicates.filter(([a, b]) => !duplicateIgnores.has(getPairKey(a, b))),
    [rawDuplicates, duplicateIgnores]
  );

  // Пары где у одного есть отчество, у другого нет (первые 2 слова совпадают)
  const patronymicDuplicates = useMemo(
    () => potentialDuplicates.filter(([a, b]) => {
      const wa = normalizeKey(a).split(/\s+/);
      const wb = normalizeKey(b).split(/\s+/);
      return wa.length !== wb.length &&
        Math.min(wa.length, wb.length) === 2 &&
        wa.slice(0, 2).join(' ') === wb.slice(0, 2).join(' ');
    }),
    [potentialDuplicates]
  );

  const displayedDuplicates = patronymicOnly ? patronymicDuplicates : potentialDuplicates;

  const visibleDuplicates = useMemo(
    () => displayedDuplicates.slice(0, visibleCount),
    [displayedDuplicates, visibleCount]
  );

  const selectedCount = displayedDuplicates.filter(([a, b]) => selectedPairs.has(getPairKey(a, b))).length;

  const handleMerge = async (fromName: string, toName: string) => {
    setMerging(true); setError(null);
    try {
      const newAliases = { ...aliases, [normalizeKey(fromName)]: toName };
      await saveDoctorAliases(newAliases);
      setAliases(newAliases);
      onSave();
    } catch (e) { setError(e instanceof Error ? e.message : 'Ошибка'); }
    finally { setMerging(false); }
  };

  const handleIgnore = async (a: string, b: string) => {
    setMerging(true); setError(null);
    try {
      const newIgnores = new Set<string>(duplicateIgnores);
      newIgnores.add(getPairKey(a, b));
      await saveDoctorDuplicateIgnores(newIgnores);
      setDuplicateIgnores(newIgnores);
    } catch (e) { setError(e instanceof Error ? e.message : 'Ошибка'); }
    finally { setMerging(false); }
  };

  const handleMergeSelected = async () => {
    if (selectedCount === 0) return;
    setMerging(true); setError(null);
    const toMerge = displayedDuplicates.filter(([a, b]) => selectedPairs.has(getPairKey(a, b)));
    try {
      const newAliases = { ...aliases };
      for (const [from, to] of toMerge) newAliases[normalizeKey(from)] = to;
      await saveDoctorAliases(newAliases);
      setAliases(newAliases);
      setSelectedPairs(new Set());
      onSave();
    } catch (e) { setError(e instanceof Error ? e.message : 'Ошибка'); }
    finally { setMerging(false); }
  };

  const handleIgnoreSelected = async () => {
    if (selectedCount === 0) return;
    setMerging(true); setError(null);
    try {
      const newIgnores = new Set<string>(duplicateIgnores);
      displayedDuplicates.filter(([a, b]) => selectedPairs.has(getPairKey(a, b)))
        .forEach(([a, b]) => newIgnores.add(getPairKey(a, b)));
      await saveDoctorDuplicateIgnores(newIgnores);
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
      await saveDoctorAliases(newAliases);
      setAliases(newAliases);
      onSave();
    } catch (e) { setError(e instanceof Error ? e.message : 'Ошибка'); }
    finally { setMerging(false); }
  };

  const existingAliases = useMemo(() => Object.entries(aliases), [aliases]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={32} className="animate-spin text-primary-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-dark-DEFAULT">Врачи</h2>
        <p className="text-sm text-slate-500">Объединение дублирующихся записей врачей из разных таблиц</p>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-4 rounded-lg bg-red-50 border border-red-200 text-red-700">
          <AlertCircle size={18} />
          {error}
        </div>
      )}

      {/* Existing aliases */}
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
                    title="Разъединить"
                  >
                    <UserX size={12} />
                    Разъединить
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Potential duplicates */}
      {computing ? (
        <div className="bg-white rounded-xl border border-slate-200 py-14 text-center">
          <Loader2 size={28} className="mx-auto animate-spin text-primary-400 mb-3" />
          <p className="text-sm text-slate-500">Анализ дубликатов…</p>
          <p className="text-xs text-slate-400 mt-1">{activeNames.length} врачей</p>
        </div>
      ) : potentialDuplicates.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 py-14 text-center">
          <Merge size={32} className="mx-auto text-slate-200 mb-3" />
          <p className="text-sm font-medium text-slate-500">Дубликаты не обнаружены</p>
          <p className="text-xs text-slate-400 mt-1">
            {allDoctorNames.length} врачей в базе{existingAliases.length > 0 ? `, ${existingAliases.length} объединено` : ''}
          </p>
        </div>
      ) : (
        <div className="bg-amber-50 rounded-xl border border-amber-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-amber-100 flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap">
              <Merge size={18} className="text-amber-600" />
              <h3 className="font-semibold text-amber-800">Возможные дубликаты</h3>
              <span className="text-xs text-amber-600 bg-amber-100 px-2 py-0.5 rounded-full">{displayedDuplicates.length}</span>
              <button
                onClick={() => { setPatronymicOnly(v => !v); setVisibleCount(PAGE_SIZE); setSelectedPairs(new Set()); }}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                  patronymicOnly
                    ? 'bg-primary-500 text-white border-primary-500'
                    : 'bg-white text-slate-600 border-slate-300 hover:border-primary-400 hover:text-primary-600'
                }`}
              >
                Только без отчества {patronymicOnly ? `(${patronymicDuplicates.length})` : `— ${patronymicDuplicates.length}`}
              </button>
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
              Система обнаружила врачей с похожими ФИО — возможно, это один человек из разных таблиц. Объедините записи, чтобы статистика учитывалась вместе.
            </p>
            <label className="flex items-center gap-2 cursor-pointer text-sm text-amber-800">
              <input
                type="checkbox"
                checked={selectedCount === potentialDuplicates.length && potentialDuplicates.length > 0}
                onChange={e => {
                  if (e.target.checked) setSelectedPairs(new Set(displayedDuplicates.map(([a, b]) => getPairKey(a, b))));
                  else setSelectedPairs(new Set());
                }}
                className="rounded border-amber-400 text-primary-500 focus:ring-primary-500"
              />
              Выбрать все
            </label>
            <div className="space-y-2">
              {visibleDuplicates.map(([from, to]) => {
                const pairKey = getPairKey(from, to);
                const isSelected = selectedPairs.has(pairKey);
                const fromCtx = doctorContextMap.get(normalizeKey(from));
                const toCtx = doctorContextMap.get(normalizeKey(to));
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
                        onChange={() => {
                          setSelectedPairs(prev => {
                            const next = new Set(prev);
                            if (next.has(pairKey)) next.delete(pairKey); else next.add(pairKey);
                            return next;
                          });
                        }}
                        className="rounded border-slate-300 text-primary-500 focus:ring-primary-500 shrink-0"
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <div className="min-w-0">
                            <span className="text-sm font-medium text-slate-600 truncate block">{from}</span>
                            {fromCtx && (fromCtx.specialty || fromCtx.institution) && (
                              <div className="text-xs text-slate-400 mt-0.5">{[fromCtx.specialty, fromCtx.institution].filter(Boolean).join(' · ')}</div>
                            )}
                          </div>
                          <ChevronRight size={16} className="text-amber-500 shrink-0" />
                          <div className="min-w-0">
                            <span className="text-sm font-medium text-dark-DEFAULT truncate block">{to}</span>
                            {toCtx && (toCtx.specialty || toCtx.institution) && (
                              <div className="text-xs text-slate-400 mt-0.5">{[toCtx.specialty, toCtx.institution].filter(Boolean).join(' · ')}</div>
                            )}
                          </div>
                        </div>
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
            {visibleCount < displayedDuplicates.length && (
              <button
                onClick={() => setVisibleCount(v => v + PAGE_SIZE)}
                className="w-full py-2.5 text-sm text-amber-700 hover:text-amber-900 border border-amber-200 hover:border-amber-300 rounded-lg bg-white hover:bg-amber-50 transition-colors"
              >
                Показать ещё ({displayedDuplicates.length - visibleCount} из {displayedDuplicates.length})
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
