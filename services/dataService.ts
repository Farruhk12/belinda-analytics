
import { API_URLS, COLUMN_MATCHERS } from '../constants';
import {
  VisitData,
  GenericRow,
  EmployeeSummary,
  DoctorInteraction,
  ContractRecipeMatchRow,
  ContractRecipeMatchRowWithMonths,
  DoctorCoverageAnalysis,
  DoctorCoverageCandidate,
  EmployeeCoverageAssignment,
} from '../types';
import { isSupabaseConfigured } from '../lib/supabase';
import { fetchAllDataFromSupabase } from './supabaseDataService';

const findValue = (row: GenericRow, matchers: string[]): string => {
  const keys = Object.keys(row);
  // 1. Exact match in matcher-priority order
  for (const m of matchers) {
    const exact = keys.find(k => k.toLowerCase() === m);
    if (exact) return String(row[exact] ?? '').trim();
  }
  // 2. Partial (includes) match
  const key = keys.find(k => matchers.some(m => k.toLowerCase().includes(m)));
  return key ? String(row[key] || '').trim() : '';
};

const findNumber = (row: GenericRow, matchers: string[]): number => {
  const keys = Object.keys(row);
  // 1. Exact match in matcher-priority order
  let key: string | undefined;
  for (const m of matchers) {
    const exact = keys.find(k => k.toLowerCase().replace(/\s/g, '') === m.replace(/\s/g, ''));
    if (exact) { key = exact; break; }
  }
  // 2. Partial (includes) match
  if (!key) key = keys.find(k => matchers.some(m => k.toLowerCase().includes(m)));
  if (!key) return 0;

  const val = row[key];
  if (typeof val === 'number') return val;
  if (typeof val === 'string') {
    const clean = val.replace(/\s/g, '').replace(',', '.').replace(/[^\d.-]/g, '');
    return parseFloat(clean) || 0;
  }
  return 0;
};

/** Р В Р’В Р РЋРЎСџР В Р’В Р РЋРІР‚СћР В Р’В Р вЂ™Р’В»Р В Р Р‹Р РЋРІР‚СљР В Р Р‹Р Р†Р вЂљР Р‹Р В Р’В Р РЋРІР‚ВР В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р В Р вЂ° Р В Р Р‹Р В РЎвЂњР В Р Р‹Р Р†Р вЂљРІвЂћвЂ“Р В Р Р‹Р В РІР‚С™Р В Р’В Р РЋРІР‚СћР В Р’В Р вЂ™Р’Вµ Р В Р’В Р вЂ™Р’В·Р В Р’В Р В РІР‚В¦Р В Р’В Р вЂ™Р’В°Р В Р Р‹Р Р†Р вЂљР Р‹Р В Р’В Р вЂ™Р’ВµР В Р’В Р В РІР‚В¦Р В Р’В Р РЋРІР‚ВР В Р’В Р вЂ™Р’Вµ Р В Р’В Р СћРІР‚ВР В Р’В Р вЂ™Р’В°Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р Р†Р вЂљРІвЂћвЂ“ Р В Р’В Р РЋРІР‚ВР В Р’В Р вЂ™Р’В· Р В Р Р‹Р В РЎвЂњР В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р В РІР‚С™Р В Р’В Р РЋРІР‚СћР В Р’В Р РЋРІР‚СњР В Р’В Р РЋРІР‚В (Р В Р’В Р СћРІР‚ВР В Р’В Р вЂ™Р’В»Р В Р Р‹Р В Р РЏ Р В Р’В Р РЋРІР‚вЂќР В Р’В Р вЂ™Р’В°Р В Р Р‹Р В РІР‚С™Р В Р Р‹Р В РЎвЂњР В Р’В Р РЋРІР‚ВР В Р’В Р В РІР‚В¦Р В Р’В Р РЋРІР‚вЂњР В Р’В Р вЂ™Р’В°) */
const getDateRaw = (row: GenericRow): string | number | null => {
  const key = Object.keys(row).find(k =>
    COLUMN_MATCHERS.DATE.some(m => k.toLowerCase().includes(m))
  );
  if (!key) return null;
  const v = row[key];
  if (v === undefined || v === null || v === '') return null;
  if (typeof v === 'number') return v;
  const s = String(v).trim();
  return s || null;
};

export const getMonthKey = (row: GenericRow): string | null => {
  const raw = getDateRaw(row);
  if (raw === null) return null;

  if (typeof raw === 'number') {
    if (raw >= 1 && raw < 2958466) {
      const d = new Date((raw - 25569) * 86400000);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    }
    return null;
  }

  const dateStr = raw;
  if (dateStr.match(/^\d{4}-\d{2}-\d{2}/)) {
    return dateStr.substring(0, 7);
  }
  const ddMmYyyy = dateStr.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})/);
  if (ddMmYyyy) {
    const [, d, m, y] = ddMmYyyy;
    return `${y}-${m.padStart(2, '0')}`;
  }
  const date = new Date(dateStr);
  if (!isNaN(date.getTime())) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  }
  return null;
};

const isMonthInQuarter = (monthKey: string, quarterKey: string): boolean => {
  const [qYear, qPart] = quarterKey.split('-Q');
  const [mYear, mMonth] = monthKey.split('-');
  if (qYear !== mYear) return false;
  const monthNum = parseInt(mMonth, 10);
  const qNum = parseInt(qPart, 10);
  const startMonth = (qNum - 1) * 3 + 1;
  const endMonth = qNum * 3;
  return monthNum >= startMonth && monthNum <= endMonth;
};

/** Р В Р’В Р РЋРЎв„ўР В Р’В Р вЂ™Р’ВµР В Р Р‹Р В РЎвЂњР В Р Р‹Р В Р РЏР В Р Р‹Р Р†Р вЂљР’В Р В Р Р‹Р Р†Р вЂљРІвЂћвЂ“ Р В Р’В Р В РІР‚В  Р В Р’В Р РЋРІР‚СњР В Р’В Р В РІР‚В Р В Р’В Р вЂ™Р’В°Р В Р Р‹Р В РІР‚С™Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р’В Р вЂ™Р’В°Р В Р’В Р вЂ™Р’В»Р В Р’В Р вЂ™Р’Вµ: "2026-Q1" -> ["2026-01", "2026-02", "2026-03"] */
export const getMonthsInQuarter = (quarterKey: string): string[] => {
  const [qYear, qPart] = quarterKey.split('-Q');
  const qNum = parseInt(qPart, 10);
  if (!qYear || isNaN(qNum)) return [];
  const startMonth = (qNum - 1) * 3 + 1;
  return [0, 1, 2].map(i => {
    const m = startMonth + i;
    return `${qYear}-${String(m).padStart(2, '0')}`;
  });
};

/** Р В Р’В Р В Р вЂ№Р В Р’В Р РЋРІР‚СћР В Р’В Р вЂ™Р’В±Р В Р Р‹Р В РІР‚С™Р В Р’В Р вЂ™Р’В°Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р В Р вЂ° Р В Р Р‹Р РЋРІР‚СљР В Р’В Р В РІР‚В¦Р В Р’В Р РЋРІР‚ВР В Р’В Р РЋРІР‚СњР В Р’В Р вЂ™Р’В°Р В Р’В Р вЂ™Р’В»Р В Р Р‹Р В Р вЂ°Р В Р’В Р В РІР‚В¦Р В Р Р‹Р Р†Р вЂљРІвЂћвЂ“Р В Р Р‹Р Р†Р вЂљР’В¦ Р В Р’В Р РЋРЎв„ўР В Р’В Р РЋРЎСџ Р В Р’В Р РЋРІР‚ВР В Р’В Р вЂ™Р’В· Р В Р’В Р В РІР‚В Р В Р Р‹Р В РЎвЂњР В Р’В Р вЂ™Р’ВµР В Р Р‹Р Р†Р вЂљР’В¦ Р В Р’В Р вЂ™Р’В»Р В Р’В Р РЋРІР‚ВР В Р Р‹Р В РЎвЂњР В Р Р‹Р Р†Р вЂљРЎв„ўР В Р’В Р РЋРІР‚СћР В Р’В Р В РІР‚В .
 *  Р В Р’В Р Р†Р вЂљРЎСљР В Р’В Р вЂ™Р’В»Р В Р Р‹Р В Р РЏ Р В Р’В Р РЋРІР‚СњР В Р’В Р вЂ™Р’В°Р В Р’В Р вЂ™Р’В¶Р В Р’В Р СћРІР‚ВР В Р’В Р РЋРІР‚СћР В Р’В Р РЋРІР‚вЂњР В Р’В Р РЋРІР‚Сћ Р В Р’В Р РЋРЎв„ўР В Р’В Р РЋРЎСџ Р В Р’В Р РЋРІР‚СћР В Р’В Р вЂ™Р’В±Р В Р Р‹Р В РІР‚В°Р В Р’В Р вЂ™Р’ВµР В Р’В Р СћРІР‚ВР В Р’В Р РЋРІР‚ВР В Р’В Р В РІР‚В¦Р В Р Р‹Р В Р РЏР В Р’В Р вЂ™Р’ВµР В Р’В Р РЋР’В Р В Р’В Р РЋРІР‚вЂќР В Р’В Р РЋРІР‚СћР В Р’В Р вЂ™Р’В»Р В Р Р‹Р В Р РЏ Р В Р’В Р РЋРІР‚ВР В Р’В Р вЂ™Р’В· Р В Р’В Р В РІР‚В Р В Р Р‹Р В РЎвЂњР В Р’В Р вЂ™Р’ВµР В Р Р‹Р Р†Р вЂљР’В¦ Р В Р’В Р РЋРІР‚ВР В Р Р‹Р В РЎвЂњР В Р Р‹Р Р†Р вЂљРЎв„ўР В Р’В Р РЋРІР‚СћР В Р Р‹Р Р†Р вЂљР Р‹Р В Р’В Р В РІР‚В¦Р В Р’В Р РЋРІР‚ВР В Р’В Р РЋРІР‚СњР В Р’В Р РЋРІР‚СћР В Р’В Р В РІР‚В  Р В Р вЂ Р В РІР‚С™Р Р†Р вЂљРЎСљ Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р’В Р вЂ™Р’В°Р В Р’В Р РЋРІР‚Сњ Р В Р’В Р РЋРІР‚вЂњР В Р Р‹Р В РІР‚С™Р В Р Р‹Р РЋРІР‚СљР В Р’В Р РЋРІР‚вЂќР В Р’В Р РЋРІР‚вЂќР В Р’В Р вЂ™Р’В° Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р’В Р РЋРІР‚СћР В Р’В Р В РІР‚В Р В Р’В Р вЂ™Р’В°Р В Р Р‹Р В РІР‚С™Р В Р’В Р вЂ™Р’В°
 *  Р В Р’В Р РЋРІР‚ВР В Р’В Р вЂ™Р’В· Р В Р’В Р вЂ™Р’В»Р В Р’В Р РЋРІР‚ВР В Р Р‹Р В РЎвЂњР В Р Р‹Р Р†Р вЂљРЎв„ўР В Р’В Р вЂ™Р’В° Р В Р’В Р Р†Р вЂљРЎСљР В Р’В Р РЋРІР‚СћР В Р’В Р РЋРІР‚вЂњР В Р’В Р РЋРІР‚СћР В Р’В Р В РІР‚В Р В Р’В Р РЋРІР‚СћР В Р Р‹Р В РІР‚С™ Р В Р’В Р РЋРІР‚вЂќР В Р’В Р РЋРІР‚СћР В Р’В Р РЋРІР‚вЂќР В Р’В Р вЂ™Р’В°Р В Р’В Р СћРІР‚ВР В Р’В Р вЂ™Р’В°Р В Р’В Р вЂ™Р’ВµР В Р Р‹Р Р†Р вЂљРЎв„ў Р В Р’В Р В РІР‚В  Р В Р’В Р вЂ™Р’В·Р В Р’В Р вЂ™Р’В°Р В Р’В Р РЋРІР‚вЂќР В Р’В Р РЋРІР‚ВР В Р Р‹Р В РЎвЂњР В Р Р‹Р В Р вЂ° Р В Р Р‹Р В РЎвЂњР В Р’В Р РЋРІР‚СћР В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р В РІР‚С™Р В Р Р‹Р РЋРІР‚СљР В Р’В Р СћРІР‚ВР В Р’В Р В РІР‚В¦Р В Р’В Р РЋРІР‚ВР В Р’В Р РЋРІР‚СњР В Р’В Р вЂ™Р’В°, Р В Р’В Р СћРІР‚ВР В Р’В Р вЂ™Р’В°Р В Р’В Р вЂ™Р’В¶Р В Р’В Р вЂ™Р’Вµ Р В Р’В Р вЂ™Р’ВµР В Р Р‹Р В РЎвЂњР В Р’В Р вЂ™Р’В»Р В Р’В Р РЋРІР‚В Р В Р’В Р Р†Р вЂљРІвЂћСћР В Р’В Р РЋРІР‚ВР В Р’В Р вЂ™Р’В·Р В Р’В Р РЋРІР‚ВР В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р Р†Р вЂљРІвЂћвЂ“ Р В Р’В Р вЂ™Р’ВµР В Р Р‹Р Р†Р вЂљР’В Р В Р’В Р В РІР‚В¦Р В Р’В Р вЂ™Р’Вµ Р В Р Р‹Р В РЎвЂњР В Р’В Р РЋРІР‚СћР В Р’В Р СћРІР‚ВР В Р’В Р вЂ™Р’ВµР В Р Р‹Р В РІР‚С™Р В Р’В Р вЂ™Р’В¶Р В Р’В Р вЂ™Р’В°Р В Р Р‹Р Р†Р вЂљРЎв„ў. */
const mergeEmployeesFromAllSheets = (
  visits: GenericRow[],
  bonuses: GenericRow[],
  contracts: GenericRow[],
  recipes: GenericRow[]
): GenericRow[] => {
  const byEmployee = new Map<string, GenericRow>();
  for (const row of [...visits, ...bonuses, ...contracts, ...recipes]) {
    const name = findValue(row, COLUMN_MATCHERS.EMPLOYEE);
    if (!name) continue;
    const key = normalizeLinkKey(name);
    if (!byEmployee.has(key)) {
      byEmployee.set(key, { ...row });
    } else {
      // Р В Р’В Р Р†Р вЂљРЎСљР В Р’В Р РЋРІР‚СћР В Р’В Р РЋРІР‚вЂќР В Р’В Р РЋРІР‚СћР В Р’В Р вЂ™Р’В»Р В Р’В Р В РІР‚В¦Р В Р Р‹Р В Р РЏР В Р’В Р вЂ™Р’ВµР В Р’В Р РЋР’В Р В Р Р‹Р В РЎвЂњР В Р Р‹Р РЋРІР‚СљР В Р Р‹Р Р†Р вЂљР’В°Р В Р’В Р вЂ™Р’ВµР В Р Р‹Р В РЎвЂњР В Р Р‹Р Р†Р вЂљРЎв„ўР В Р’В Р В РІР‚В Р В Р Р‹Р РЋРІР‚СљР В Р Р‹Р В РІР‚в„–Р В Р Р‹Р Р†Р вЂљР’В°Р В Р Р‹Р РЋРІР‚СљР В Р Р‹Р В РІР‚в„– Р В Р’В Р вЂ™Р’В·Р В Р’В Р вЂ™Р’В°Р В Р’В Р РЋРІР‚вЂќР В Р’В Р РЋРІР‚ВР В Р Р‹Р В РЎвЂњР В Р Р‹Р В Р вЂ° Р В Р’В Р РЋРІР‚вЂќР В Р’В Р РЋРІР‚СћР В Р’В Р вЂ™Р’В»Р В Р Р‹Р В Р РЏР В Р’В Р РЋР’ВР В Р’В Р РЋРІР‚В Р В Р’В Р РЋРІР‚ВР В Р’В Р вЂ™Р’В· Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р’В Р вЂ™Р’ВµР В Р’В Р РЋРІР‚СњР В Р Р‹Р РЋРІР‚СљР В Р Р‹Р Р†Р вЂљР’В°Р В Р’В Р вЂ™Р’ВµР В Р’В Р Р†РІР‚С›РІР‚вЂњ Р В Р Р‹Р В РЎвЂњР В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р В РІР‚С™Р В Р’В Р РЋРІР‚СћР В Р’В Р РЋРІР‚СњР В Р’В Р РЋРІР‚В,
      // Р В Р’В Р вЂ™Р’ВµР В Р Р‹Р В РЎвЂњР В Р’В Р вЂ™Р’В»Р В Р’В Р РЋРІР‚В Р В Р’В Р РЋРІР‚вЂќР В Р’В Р РЋРІР‚СћР В Р’В Р вЂ™Р’В»Р В Р’В Р вЂ™Р’Вµ Р В Р’В Р вЂ™Р’ВµР В Р Р‹Р Р†Р вЂљР’В°Р В Р Р‹Р Р†Р вЂљР’В Р В Р’В Р РЋРІР‚вЂќР В Р Р‹Р РЋРІР‚СљР В Р Р‹Р В РЎвЂњР В Р Р‹Р Р†Р вЂљРЎв„ўР В Р’В Р РЋРІР‚СћР В Р’В Р вЂ™Р’Вµ (Р В Р’В Р В РІР‚В¦Р В Р’В Р вЂ™Р’В°Р В Р’В Р РЋРІР‚вЂќР В Р Р‹Р В РІР‚С™Р В Р’В Р РЋРІР‚ВР В Р’В Р РЋР’ВР В Р’В Р вЂ™Р’ВµР В Р Р‹Р В РІР‚С™, Р В Р’В Р РЋРІР‚вЂњР В Р Р‹Р В РІР‚С™Р В Р Р‹Р РЋРІР‚СљР В Р’В Р РЋРІР‚вЂќР В Р’В Р РЋРІР‚вЂќР В Р’В Р вЂ™Р’В° Р В Р’В Р РЋРІР‚ВР В Р’В Р вЂ™Р’В· Р В Р’В Р вЂ™Р’В»Р В Р’В Р РЋРІР‚ВР В Р Р‹Р В РЎвЂњР В Р Р‹Р Р†Р вЂљРЎв„ўР В Р’В Р вЂ™Р’В° Р В Р’В Р Р†Р вЂљРЎСљР В Р’В Р РЋРІР‚СћР В Р’В Р РЋРІР‚вЂњР В Р’В Р РЋРІР‚СћР В Р’В Р В РІР‚В Р В Р’В Р РЋРІР‚СћР В Р Р‹Р В РІР‚С™)
      const existing = byEmployee.get(key)!;
      for (const [col, val] of Object.entries(row)) {
        if (existing[col] === undefined || existing[col] === '' || existing[col] === null) {
          existing[col] = val;
        }
      }
    }
  }
  return Array.from(byEmployee.values());
};

/** Р В Р’В Р вЂ™Р’ВР В Р Р‹Р В РЎвЂњР В Р Р‹Р Р†Р вЂљРЎв„ўР В Р’В Р РЋРІР‚СћР В Р Р‹Р Р†Р вЂљР Р‹Р В Р’В Р В РІР‚В¦Р В Р’В Р РЋРІР‚ВР В Р’В Р РЋРІР‚Сњ Р В Р’В Р СћРІР‚ВР В Р’В Р вЂ™Р’В°Р В Р’В Р В РІР‚В¦Р В Р’В Р В РІР‚В¦Р В Р Р‹Р Р†Р вЂљРІвЂћвЂ“Р В Р Р‹Р Р†Р вЂљР’В¦: Supabase (Excel Р В Р вЂ Р Р†Р вЂљР’В Р Р†Р вЂљРІвЂћСћ Р В Р’В Р Р†Р вЂљР’ВР В Р’В Р Р†Р вЂљРЎСљ) Р В Р’В Р РЋРІР‚ВР В Р’В Р вЂ™Р’В»Р В Р’В Р РЋРІР‚В Google Р В Р’В Р РЋРЎвЂєР В Р’В Р вЂ™Р’В°Р В Р’В Р вЂ™Р’В±Р В Р’В Р вЂ™Р’В»Р В Р’В Р РЋРІР‚ВР В Р Р‹Р Р†Р вЂљР’В Р В Р Р‹Р Р†Р вЂљРІвЂћвЂ“ (fallback). */
export const fetchAllData = async (
  onCoreReady?: (data: {
    visitsData: VisitData;
    bonusesData: GenericRow[];
    contractsData: GenericRow[];
    recipesData: GenericRow[];
    doctorsData: GenericRow[];
  }) => void
) => {
  if (isSupabaseConfigured()) {
    try {
      return await fetchAllDataFromSupabase(onCoreReady);
    } catch (error) {
      console.error('Р В Р’В Р РЋРІР‚С”Р В Р Р‹Р Р†РІР‚С™Р’В¬Р В Р’В Р РЋРІР‚ВР В Р’В Р вЂ™Р’В±Р В Р’В Р РЋРІР‚СњР В Р’В Р вЂ™Р’В° Р В Р’В Р вЂ™Р’В·Р В Р’В Р вЂ™Р’В°Р В Р’В Р РЋРІР‚вЂњР В Р Р‹Р В РІР‚С™Р В Р Р‹Р РЋРІР‚СљР В Р’В Р вЂ™Р’В·Р В Р’В Р РЋРІР‚СњР В Р’В Р РЋРІР‚В Р В Р’В Р РЋРІР‚ВР В Р’В Р вЂ™Р’В· Supabase', error);
      throw error;
    }
  }
  try {
    const [visitsRes, bonusesRes, contractsRaw, recipesRaw] = await Promise.all([
      fetch(API_URLS.VISITS),
      fetch(API_URLS.BONUSES),
      fetch(API_URLS.CONTRACTS).then(r => r.json()).catch((e) => { console.warn('Р В Р’В Р РЋРЎС™Р В Р’В Р вЂ™Р’Вµ Р В Р Р‹Р РЋРІР‚СљР В Р’В Р СћРІР‚ВР В Р’В Р вЂ™Р’В°Р В Р’В Р вЂ™Р’В»Р В Р’В Р РЋРІР‚СћР В Р Р‹Р В РЎвЂњР В Р Р‹Р В Р вЂ° Р В Р’В Р вЂ™Р’В·Р В Р’В Р вЂ™Р’В°Р В Р’В Р РЋРІР‚вЂњР В Р Р‹Р В РІР‚С™Р В Р Р‹Р РЋРІР‚СљР В Р’В Р вЂ™Р’В·Р В Р’В Р РЋРІР‚ВР В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р В Р вЂ° Р В Р’В Р Р†Р вЂљРЎСљР В Р’В Р РЋРІР‚СћР В Р’В Р РЋРІР‚вЂњР В Р’В Р РЋРІР‚СћР В Р’В Р В РІР‚В Р В Р’В Р РЋРІР‚СћР В Р Р‹Р В РІР‚С™Р В Р Р‹Р Р†Р вЂљРІвЂћвЂ“:', e); return []; }),
      fetch(API_URLS.RECIPES).then(r => r.json()).catch((e) => { console.warn('Р В Р’В Р РЋРЎС™Р В Р’В Р вЂ™Р’Вµ Р В Р Р‹Р РЋРІР‚СљР В Р’В Р СћРІР‚ВР В Р’В Р вЂ™Р’В°Р В Р’В Р вЂ™Р’В»Р В Р’В Р РЋРІР‚СћР В Р Р‹Р В РЎвЂњР В Р Р‹Р В Р вЂ° Р В Р’В Р вЂ™Р’В·Р В Р’В Р вЂ™Р’В°Р В Р’В Р РЋРІР‚вЂњР В Р Р‹Р В РІР‚С™Р В Р Р‹Р РЋРІР‚СљР В Р’В Р вЂ™Р’В·Р В Р’В Р РЋРІР‚ВР В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р В Р вЂ° Р В Р’В Р вЂ™Р’В Р В Р’В Р вЂ™Р’ВµР В Р Р‹Р Р†Р вЂљР’В Р В Р’В Р вЂ™Р’ВµР В Р’В Р РЋРІР‚вЂќР В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р Р†Р вЂљРІвЂћвЂ“:', e); return []; })
    ]);
    const visitsData: VisitData = await visitsRes.json();
    const bonusesData: GenericRow[] = await bonusesRes.json();
    const contractsData: GenericRow[] = Array.isArray(contractsRaw) ? contractsRaw : [];
    const recipesData: GenericRow[] = Array.isArray(recipesRaw) ? recipesRaw : [];
    // Р В Р’В Р РЋРЎв„ўР В Р’В Р РЋРЎСџ Р В Р’В Р РЋРІР‚ВР В Р’В Р вЂ™Р’В· Р В Р’В Р В РІР‚В Р В Р Р‹Р В РЎвЂњР В Р’В Р вЂ™Р’ВµР В Р Р‹Р Р†Р вЂљР’В¦ Р В Р’В Р РЋРІР‚ВР В Р Р‹Р В РЎвЂњР В Р Р‹Р Р†Р вЂљРЎв„ўР В Р’В Р РЋРІР‚СћР В Р Р‹Р Р†Р вЂљР Р‹Р В Р’В Р В РІР‚В¦Р В Р’В Р РЋРІР‚ВР В Р’В Р РЋРІР‚СњР В Р’В Р РЋРІР‚СћР В Р’В Р В РІР‚В  (Р В Р’В Р РЋРІР‚СњР В Р’В Р вЂ™Р’В°Р В Р’В Р РЋРІР‚Сњ Р В Р’В Р РЋРІР‚вЂќР В Р Р‹Р В РІР‚С™Р В Р’В Р РЋРІР‚В Supabase)
    const allEmployees = mergeEmployeesFromAllSheets(
      visitsData.visits,
      bonusesData,
      contractsData,
      recipesData
    );
    return {
      visitsData: { ...visitsData, employees: allEmployees, allEmployees },
      bonusesData,
      contractsData,
      recipesData,
      doctorsData: [],
    };
  } catch (error) {
    console.error("Failed to fetch data", error);
    throw error;
  }
};

/** Р В Р’В Р РЋРЎС™Р В Р’В Р РЋРІР‚СћР В Р Р‹Р В РІР‚С™Р В Р’В Р РЋР’ВР В Р’В Р вЂ™Р’В°Р В Р’В Р вЂ™Р’В»Р В Р’В Р РЋРІР‚ВР В Р’В Р вЂ™Р’В·Р В Р’В Р вЂ™Р’В°Р В Р Р‹Р Р†Р вЂљР’В Р В Р’В Р РЋРІР‚ВР В Р Р‹Р В Р РЏ Р В Р’В Р вЂ™Р’В¤Р В Р’В Р вЂ™Р’ВР В Р’В Р РЋРІР‚С” Р В Р’В Р СћРІР‚ВР В Р’В Р вЂ™Р’В»Р В Р Р‹Р В Р РЏ Р В Р Р‹Р В РЎвЂњР В Р’В Р РЋРІР‚СћР В Р’В Р РЋРІР‚вЂќР В Р’В Р РЋРІР‚СћР В Р Р‹Р В РЎвЂњР В Р Р‹Р Р†Р вЂљРЎв„ўР В Р’В Р вЂ™Р’В°Р В Р’В Р В РІР‚В Р В Р’В Р вЂ™Р’В»Р В Р’В Р вЂ™Р’ВµР В Р’В Р В РІР‚В¦Р В Р’В Р РЋРІР‚ВР В Р Р‹Р В Р РЏ Р В Р’В Р РЋР’ВР В Р’В Р вЂ™Р’ВµР В Р’В Р вЂ™Р’В¶Р В Р’В Р СћРІР‚ВР В Р Р‹Р РЋРІР‚Сљ Р В Р’В Р вЂ™Р’В»Р В Р’В Р РЋРІР‚ВР В Р Р‹Р В РЎвЂњР В Р Р‹Р Р†Р вЂљРЎв„ўР В Р’В Р вЂ™Р’В°Р В Р’В Р РЋР’ВР В Р’В Р РЋРІР‚В (Р В Р’В Р В РІР‚В Р В Р Р‹Р В РІР‚С™Р В Р’В Р вЂ™Р’В°Р В Р Р‹Р Р†Р вЂљР Р‹, Р В Р’В Р РЋРЎв„ўР В Р’В Р РЋРЎСџ Р В Р’В Р РЋРІР‚В Р В Р Р‹Р Р†Р вЂљРЎв„ў.Р В Р’В Р СћРІР‚В.) */
export const normalizeLinkKey = (name: string): string =>
  String(name || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();

/** Сокращённое название ЛПУ для отображения в таблицах */
export const abbreviateLpuName = (full: string): string => {
  if (!full || full.trim().length < 3) return full || '—';
  const s = full.trim();
  const corpMatch = s.match(/корпус\s*[№#]?\s*(\d+)/i) || s.match(/\(корпус\s*[№#]?\s*(\d+)\)/i);
  const corpSuffix = corpMatch ? ` №${corpMatch[1]}` : '';
  const withoutCorp = s.replace(/\s*\(?корпус\s*[№#]?\s*\d+\)?/gi, '').trim();
  const patterns: [RegExp, string][] = [
    [/национальн(ый|ая)\s+медицинск(ий|ий)\s+центр/i, 'НМЦ'],
    [/национальн(ый|ая)\s+медцентр/i, 'НМЦ'],
    [/городск(ая|ой|ий)\s+клиническ(ая|ий)\s+больниц/i, 'ГКБ'],
    [/городск(ая|ой|ий)\s+кардиологическ(ий|ая)\s+центр/i, 'ГКЦ'],
    [/городск(ая|ой|ий)\s+поликлиник/i, 'ГП'],
    [/городск(ая|ой|ий)\s+больниц/i, 'ГБ'],
    [/республиканск(ий|ая)\s+клиническ(ая|ий)/i, 'РКБ'],
    [/республиканск(ий|ая)\s+больниц/i, 'РБ'],
    [/областн(ая|ой)\s+больниц/i, 'ОБ'],
    [/районн(ая|ой)\s+больниц/i, 'РБ'],
    [/центральн(ая|ый)\s+больниц/i, 'ЦБ'],
    [/поликлиник/i, 'Поликл.'],
    [/клиник/i, 'Кл.'],
    [/больниц/i, 'Б-ца'],
    [/аптек/i, 'Апт.'],
  ];
  for (const [re, abbr] of patterns) {
    if (re.test(withoutCorp)) return abbr + corpSuffix;
  }
  const words = withoutCorp.split(/\s+/).filter(w => w.length > 1);
  if (words.length <= 2) return withoutCorp.slice(0, 15) + corpSuffix;
  const initials = words.slice(0, 4).map(w => w[0]).join('').toUpperCase();
  return (initials.length >= 2 ? initials : withoutCorp.slice(0, 12)) + corpSuffix;
};

/** Р В Р’В Р РЋРЎСџР В Р’В Р РЋРІР‚СћР В Р’В Р вЂ™Р’В»Р В Р Р‹Р РЋРІР‚СљР В Р Р‹Р Р†Р вЂљР Р‹Р В Р’В Р РЋРІР‚ВР В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р В Р вЂ° Р В Р’В Р вЂ™Р’В·Р В Р’В Р В РІР‚В¦Р В Р’В Р вЂ™Р’В°Р В Р Р‹Р Р†Р вЂљР Р‹Р В Р’В Р вЂ™Р’ВµР В Р’В Р В РІР‚В¦Р В Р’В Р РЋРІР‚ВР В Р’В Р вЂ™Р’Вµ Р В Р’В Р РЋРІР‚ВР В Р’В Р вЂ™Р’В· Р В Р Р‹Р В РЎвЂњР В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р В РІР‚С™Р В Р’В Р РЋРІР‚СћР В Р’В Р РЋРІР‚СњР В Р’В Р РЋРІР‚В Р В Р’В Р РЋРІР‚вЂќР В Р’В Р РЋРІР‚Сћ Р В Р’В Р РЋР’ВР В Р’В Р вЂ™Р’В°Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р Р†Р вЂљР Р‹Р В Р’В Р вЂ™Р’ВµР В Р Р‹Р В РІР‚С™Р В Р’В Р вЂ™Р’В°Р В Р’В Р РЋР’В Р В Р’В Р РЋРІР‚СњР В Р’В Р РЋРІР‚СћР В Р’В Р вЂ™Р’В»Р В Р’В Р РЋРІР‚СћР В Р’В Р В РІР‚В¦Р В Р’В Р РЋРІР‚СћР В Р’В Р РЋРІР‚Сњ */
export const getValueByMatchers = (row: GenericRow, matchers: string[]): string =>
  findValue(row, matchers);

/** Р В Р’В Р Р†Р вЂљРІвЂћСћР В Р Р‹Р В РІР‚С™Р В Р’В Р вЂ™Р’В°Р В Р Р‹Р Р†Р вЂљР Р‹/Р В Р’В Р РЋРІР‚СњР В Р’В Р вЂ™Р’В»Р В Р’В Р РЋРІР‚ВР В Р’В Р вЂ™Р’ВµР В Р’В Р В РІР‚В¦Р В Р Р‹Р Р†Р вЂљРЎв„ў Р В Р’В Р РЋРІР‚ВР В Р’В Р вЂ™Р’В· Р В Р’В Р вЂ™Р’В»Р В Р Р‹Р В РІР‚в„–Р В Р’В Р вЂ™Р’В±Р В Р’В Р РЋРІР‚СћР В Р’В Р Р†РІР‚С›РІР‚вЂњ Р В Р Р‹Р В РЎвЂњР В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р В РІР‚С™Р В Р’В Р РЋРІР‚СћР В Р’В Р РЋРІР‚СњР В Р’В Р РЋРІР‚В (Р В Р’В Р Р†Р вЂљРІвЂћСћР В Р’В Р РЋРІР‚ВР В Р’В Р вЂ™Р’В·Р В Р’В Р РЋРІР‚ВР В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р Р†Р вЂљРІвЂћвЂ“: Р В Р’В Р вЂ™Р’ВР В Р’В Р РЋР’ВР В Р Р‹Р В Р РЏ Р В Р’В Р СћРІР‚ВР В Р’В Р РЋРІР‚СћР В Р’В Р РЋРІР‚СњР В Р Р‹Р Р†Р вЂљРЎв„ўР В Р’В Р РЋРІР‚СћР В Р Р‹Р В РІР‚С™Р В Р’В Р вЂ™Р’В°, Р В Р’В Р Р†Р вЂљРЎСљР В Р’В Р РЋРІР‚СћР В Р’В Р РЋРІР‚вЂњР В Р’В Р РЋРІР‚СћР В Р’В Р В РІР‚В Р В Р’В Р РЋРІР‚СћР В Р Р‹Р В РІР‚С™/Р В Р’В Р В РІвЂљВ¬Р В Р’В Р Р†Р вЂљРІвЂћСћР В Р’В Р РЋРІвЂћСћ/Р В Р’В Р вЂ™Р’В Р В Р’В Р вЂ™Р’ВµР В Р Р‹Р Р†Р вЂљР’В Р В Р’В Р вЂ™Р’ВµР В Р’В Р РЋРІР‚вЂќР В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р Р†Р вЂљРІвЂћвЂ“: Р В Р’В Р РЋРІвЂћСћР В Р’В Р вЂ™Р’В»Р В Р’В Р РЋРІР‚ВР В Р’В Р вЂ™Р’ВµР В Р’В Р В РІР‚В¦Р В Р Р‹Р Р†Р вЂљРЎв„ў Р В Р’В Р РЋРІР‚В Р В Р Р‹Р Р†Р вЂљРЎв„ў.Р В Р’В Р СћРІР‚В.) */
export const getDoctorFromRow = (row: GenericRow): string =>
  findValue(row, COLUMN_MATCHERS.DOCTOR);

/** Р В Р’В Р РЋРЎв„ўР В Р’В Р РЋРЎСџ Р В Р’В Р РЋРІР‚ВР В Р’В Р вЂ™Р’В· Р В Р’В Р вЂ™Р’В»Р В Р Р‹Р В РІР‚в„–Р В Р’В Р вЂ™Р’В±Р В Р’В Р РЋРІР‚СћР В Р’В Р Р†РІР‚С›РІР‚вЂњ Р В Р Р‹Р В РЎвЂњР В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р В РІР‚С™Р В Р’В Р РЋРІР‚СћР В Р’В Р РЋРІР‚СњР В Р’В Р РЋРІР‚В (Р В Р’В Р РЋРЎв„ўР В Р’В Р вЂ™Р’ВµР В Р’В Р СћРІР‚В Р В Р’В Р РЋРІР‚вЂќР В Р Р‹Р В РІР‚С™Р В Р’В Р вЂ™Р’ВµР В Р’В Р СћРІР‚ВР В Р Р‹Р В РЎвЂњР В Р Р‹Р Р†Р вЂљРЎв„ўР В Р’В Р вЂ™Р’В°Р В Р’В Р В РІР‚В Р В Р’В Р РЋРІР‚ВР В Р Р‹Р Р†Р вЂљРЎв„ўР В Р’В Р вЂ™Р’ВµР В Р’В Р вЂ™Р’В»Р В Р Р‹Р В Р вЂ°, Р В Р’В Р РЋРЎв„ўР В Р’В Р РЋРЎСџ Р В Р’В Р РЋРІР‚В Р В Р Р‹Р Р†Р вЂљРЎв„ў.Р В Р’В Р СћРІР‚В.) */
export const getMPFromRow = (row: GenericRow): string =>
  findValue(row, COLUMN_MATCHERS.EMPLOYEE);

/** Р В Р’В Р Р†Р вЂљРЎС™Р В Р Р‹Р В РІР‚С™Р В Р Р‹Р РЋРІР‚СљР В Р’В Р РЋРІР‚вЂќР В Р’В Р РЋРІР‚вЂќР В Р’В Р вЂ™Р’В° Р В Р’В Р РЋРІР‚ВР В Р’В Р вЂ™Р’В· Р В Р’В Р вЂ™Р’В»Р В Р Р‹Р В РІР‚в„–Р В Р’В Р вЂ™Р’В±Р В Р’В Р РЋРІР‚СћР В Р’В Р Р†РІР‚С›РІР‚вЂњ Р В Р Р‹Р В РЎвЂњР В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р В РІР‚С™Р В Р’В Р РЋРІР‚СћР В Р’В Р РЋРІР‚СњР В Р’В Р РЋРІР‚В (Р В Р’В Р Р†Р вЂљРЎС™Р В Р Р‹Р В РІР‚С™Р В Р Р‹Р РЋРІР‚СљР В Р’В Р РЋРІР‚вЂќР В Р’В Р РЋРІР‚вЂќР В Р’В Р вЂ™Р’В°, Р В Р’В Р Р†Р вЂљРЎС™Р В Р Р‹Р В РІР‚С™Р В Р Р‹Р РЋРІР‚СљР В Р’В Р РЋРІР‚вЂќР В Р’В Р РЋРІР‚вЂќР В Р’В Р вЂ™Р’В° Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р’В Р РЋРІР‚СћР В Р’В Р В РІР‚В Р В Р’В Р вЂ™Р’В°Р В Р Р‹Р В РІР‚С™Р В Р’В Р вЂ™Р’В° Р В Р’В Р РЋРІР‚В Р В Р Р‹Р Р†Р вЂљРЎв„ў.Р В Р’В Р СћРІР‚В.) */
export const getGroupFromRow = (row: GenericRow): string =>
  findValue(row, COLUMN_MATCHERS.GROUP);

/** Р В Р’В Р В Р вЂ№Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р В РІР‚С™Р В Р’В Р РЋРІР‚СћР В Р’В Р РЋРІР‚СњР В Р’В Р РЋРІР‚В Р В Р’В Р СћРІР‚ВР В Р’В Р РЋРІР‚СћР В Р’В Р РЋРІР‚вЂњР В Р’В Р РЋРІР‚СћР В Р’В Р В РІР‚В Р В Р’В Р РЋРІР‚СћР В Р Р‹Р В РІР‚С™Р В Р’В Р вЂ™Р’В° Р В Р’В Р РЋРІР‚вЂќР В Р’В Р РЋРІР‚Сћ Р В Р’В Р В РІР‚В Р В Р Р‹Р В РІР‚С™Р В Р’В Р вЂ™Р’В°Р В Р Р‹Р Р†Р вЂљР Р‹Р В Р Р‹Р РЋРІР‚Сљ Р В Р’В Р РЋРІР‚В Р В Р’В Р РЋРІР‚вЂќР В Р’В Р РЋРІР‚Сћ Р В Р’В Р СћРІР‚ВР В Р’В Р вЂ™Р’В°Р В Р’В Р В РІР‚В¦Р В Р’В Р В РІР‚В¦Р В Р’В Р РЋРІР‚СћР В Р’В Р РЋР’ВР В Р Р‹Р РЋРІР‚Сљ Р В Р’В Р РЋРЎв„ўР В Р’В Р РЋРЎСџ (Р В Р’В Р СћРІР‚ВР В Р’В Р РЋРІР‚СћР В Р’В Р РЋРІР‚вЂњР В Р’В Р РЋРІР‚СћР В Р’В Р В РІР‚В Р В Р’В Р РЋРІР‚СћР В Р Р‹Р В РІР‚С™ Р В Р Р‹Р В РЎвЂњ Р В Р Р‹Р В Р Р‰Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р’В Р РЋРІР‚ВР В Р’В Р РЋР’В Р В Р’В Р РЋРЎв„ўР В Р’В Р РЋРЎСџ) */
export const getContractItemsForDoctorAndMP = (
  contracts: GenericRow[],
  doctorName: string,
  mpName: string
): GenericRow[] => {
  const docKey = normalizeLinkKey(doctorName);
  const mpKey = normalizeLinkKey(mpName);
  if (!docKey) return [];
  return contracts.filter(row =>
    normalizeLinkKey(getDoctorFromRow(row)) === docKey &&
    normalizeLinkKey(getMPFromRow(row)) === mpKey
  );
};

/** Р В Р’В Р В Р вЂ№Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р В РІР‚С™Р В Р’В Р РЋРІР‚СћР В Р’В Р РЋРІР‚СњР В Р’В Р РЋРІР‚В Р В Р Р‹Р В РІР‚С™Р В Р’В Р вЂ™Р’ВµР В Р Р‹Р Р†Р вЂљР’В Р В Р’В Р вЂ™Р’ВµР В Р’В Р РЋРІР‚вЂќР В Р Р‹Р Р†Р вЂљРЎв„ўР В Р’В Р РЋРІР‚СћР В Р’В Р В РІР‚В  Р В Р’В Р РЋРІР‚вЂќР В Р’В Р РЋРІР‚Сћ Р В Р’В Р В РІР‚В Р В Р Р‹Р В РІР‚С™Р В Р’В Р вЂ™Р’В°Р В Р Р‹Р Р†Р вЂљР Р‹Р В Р Р‹Р РЋРІР‚Сљ Р В Р’В Р РЋРІР‚В Р В Р’В Р РЋРІР‚вЂќР В Р’В Р РЋРІР‚Сћ Р В Р’В Р РЋРІР‚вЂњР В Р Р‹Р В РІР‚С™Р В Р Р‹Р РЋРІР‚СљР В Р’В Р РЋРІР‚вЂќР В Р’В Р РЋРІР‚вЂќР В Р’В Р вЂ™Р’Вµ (Р В Р’В Р РЋРІР‚вЂќР В Р Р‹Р В РІР‚С™Р В Р’В Р РЋРІР‚СћР В Р’В Р СћРІР‚ВР В Р Р‹Р РЋРІР‚СљР В Р’В Р РЋРІР‚СњР В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р Р†Р вЂљРІвЂћвЂ“ Р В Р’В Р РЋРІР‚вЂњР В Р Р‹Р В РІР‚С™Р В Р Р‹Р РЋРІР‚СљР В Р’В Р РЋРІР‚вЂќР В Р’В Р РЋРІР‚вЂќР В Р Р‹Р Р†Р вЂљРІвЂћвЂ“ Р В Р’В Р РЋРЎв„ўР В Р’В Р РЋРЎСџ) */
export const getRecipeItemsForDoctorByGroup = (
  recipes: GenericRow[],
  doctorName: string,
  groupName: string
): GenericRow[] => {
  const docKey = normalizeLinkKey(doctorName);
  const groupKey = normalizeLinkKey(groupName);
  if (!docKey) return [];
  return recipes.filter(row =>
    normalizeLinkKey(getDoctorFromRow(row)) === docKey &&
    normalizeLinkKey(getGroupFromRow(row)) === groupKey
  );
};

const getNomenclatureFromRow = (row: GenericRow): string =>
  findValue(row, COLUMN_MATCHERS.NOMENCLATURE);

const normalizeNomenclature = (s: string): string =>
  String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');

/** Р В Р’В Р В Р вЂ№Р В Р’В Р РЋРІР‚СћР В Р’В Р РЋРІР‚вЂќР В Р’В Р РЋРІР‚СћР В Р Р‹Р В РЎвЂњР В Р Р‹Р Р†Р вЂљРЎв„ўР В Р’В Р вЂ™Р’В°Р В Р’В Р В РІР‚В Р В Р’В Р вЂ™Р’В»Р В Р’В Р вЂ™Р’ВµР В Р’В Р В РІР‚В¦Р В Р’В Р РЋРІР‚ВР В Р’В Р вЂ™Р’Вµ Р В Р’В Р СћРІР‚ВР В Р’В Р РЋРІР‚СћР В Р’В Р РЋРІР‚вЂњР В Р’В Р РЋРІР‚СћР В Р’В Р В РІР‚В Р В Р’В Р РЋРІР‚СћР В Р Р‹Р В РІР‚С™Р В Р’В Р вЂ™Р’В° Р В Р Р‹Р В РЎвЂњ Р В Р Р‹Р В РІР‚С™Р В Р’В Р вЂ™Р’ВµР В Р Р‹Р Р†Р вЂљР’В Р В Р’В Р вЂ™Р’ВµР В Р’В Р РЋРІР‚вЂќР В Р Р‹Р Р†Р вЂљРЎв„ўР В Р’В Р вЂ™Р’В°Р В Р’В Р РЋР’ВР В Р’В Р РЋРІР‚В: Р В Р’В Р РЋРІР‚вЂќР В Р’В Р РЋРІР‚Сћ Р В Р’В Р РЋРІР‚СњР В Р’В Р вЂ™Р’В°Р В Р’В Р вЂ™Р’В¶Р В Р’В Р СћРІР‚ВР В Р’В Р РЋРІР‚СћР В Р’В Р Р†РІР‚С›РІР‚вЂњ Р В Р’В Р РЋРІР‚вЂќР В Р’В Р РЋРІР‚СћР В Р’В Р вЂ™Р’В·Р В Р’В Р РЋРІР‚ВР В Р Р‹Р Р†Р вЂљР’В Р В Р’В Р РЋРІР‚ВР В Р’В Р РЋРІР‚В Р В Р’В Р СћРІР‚ВР В Р’В Р РЋРІР‚СћР В Р’В Р РЋРІР‚вЂњР В Р’В Р РЋРІР‚СћР В Р’В Р В РІР‚В Р В Р’В Р РЋРІР‚СћР В Р Р‹Р В РІР‚С™Р В Р’В Р вЂ™Р’В° Р В Р вЂ Р В РІР‚С™Р Р†Р вЂљРЎСљ Р В Р’В Р В РІР‚В Р В Р Р‹Р Р†Р вЂљРІвЂћвЂ“Р В Р’В Р РЋРІР‚вЂќР В Р’В Р РЋРІР‚ВР В Р Р‹Р В РЎвЂњР В Р’В Р вЂ™Р’В°Р В Р’В Р вЂ™Р’В» Р В Р’В Р вЂ™Р’В»Р В Р’В Р РЋРІР‚В Р В Р’В Р В РІР‚В Р В Р Р‹Р В РІР‚С™Р В Р’В Р вЂ™Р’В°Р В Р Р‹Р Р†Р вЂљР Р‹, Р В Р’В Р РЋРІР‚СњР В Р’В Р РЋРІР‚СћР В Р’В Р вЂ™Р’В»-Р В Р’В Р В РІР‚В Р В Р’В Р РЋРІР‚Сћ Р В Р’В Р РЋРІР‚В Р В Р Р‹Р В РЎвЂњР В Р Р‹Р РЋРІР‚СљР В Р’В Р РЋР’ВР В Р’В Р РЋР’ВР В Р’В Р вЂ™Р’В° Р В Р’В Р В РІР‚В  Р В Р Р‹Р В РІР‚С™Р В Р’В Р вЂ™Р’ВµР В Р Р‹Р Р†Р вЂљР’В Р В Р’В Р вЂ™Р’ВµР В Р’В Р РЋРІР‚вЂќР В Р Р‹Р Р†Р вЂљРЎв„ўР В Р’В Р вЂ™Р’В°Р В Р Р‹Р Р†Р вЂљР’В¦. */
export function getContractVsRecipeMatch(
  contractItems: GenericRow[],
  recipeItems: GenericRow[]
): ContractRecipeMatchRow[] {
  const recipeByNorm = new Map<string, { qty: number; sum: number }>();
  for (const row of recipeItems) {
    const nom = getNomenclatureFromRow(row);
    const norm = normalizeNomenclature(nom);
    if (!norm) continue;
    const qty = findNumber(row, COLUMN_MATCHERS.QUANTITY);
    const sum = findNumber(row, COLUMN_MATCHERS.BONUS_AMOUNT);
    const cur = recipeByNorm.get(norm);
    if (cur) {
      cur.qty += qty;
      cur.sum += sum;
    } else {
      recipeByNorm.set(norm, { qty, sum });
    }
  }

  const result: ContractRecipeMatchRow[] = [];
  for (const row of contractItems) {
    const contractNom = getNomenclatureFromRow(row);
    const contractQty = findNumber(row, COLUMN_MATCHERS.QUANTITY);
    const norm = normalizeNomenclature(contractNom);

    let hasPrescribed = false;
    let recipeQty: number | undefined;
    let recipeSum: number | undefined;

    const exact = recipeByNorm.get(norm);
    if (exact) {
      hasPrescribed = true;
      recipeQty = exact.qty;
      recipeSum = exact.sum;
    } else {
      for (const [recipeNorm, val] of recipeByNorm) {
        if (recipeNorm.includes(norm) || norm.includes(recipeNorm)) {
          hasPrescribed = true;
          recipeQty = (recipeQty ?? 0) + val.qty;
          recipeSum = (recipeSum ?? 0) + val.sum;
        }
      }
    }

    result.push({
      contractNomenclature: contractNom || '—',
      contractQty,
      hasPrescribed,
      recipeQty,
      recipeSum,
    });
  }
  return result;
}

/** Р В Р’В Р В Р вЂ№Р В Р’В Р РЋРІР‚СћР В Р’В Р РЋРІР‚вЂќР В Р’В Р РЋРІР‚СћР В Р Р‹Р В РЎвЂњР В Р Р‹Р Р†Р вЂљРЎв„ўР В Р’В Р вЂ™Р’В°Р В Р’В Р В РІР‚В Р В Р’В Р вЂ™Р’В»Р В Р’В Р вЂ™Р’ВµР В Р’В Р В РІР‚В¦Р В Р’В Р РЋРІР‚ВР В Р’В Р вЂ™Р’Вµ Р В Р’В Р СћРІР‚ВР В Р’В Р РЋРІР‚СћР В Р’В Р РЋРІР‚вЂњР В Р’В Р РЋРІР‚СћР В Р’В Р В РІР‚В Р В Р’В Р РЋРІР‚СћР В Р Р‹Р В РІР‚С™Р В Р’В Р вЂ™Р’В° Р В Р Р‹Р В РЎвЂњ Р В Р Р‹Р В РІР‚С™Р В Р’В Р вЂ™Р’ВµР В Р Р‹Р Р†Р вЂљР’В Р В Р’В Р вЂ™Р’ВµР В Р’В Р РЋРІР‚вЂќР В Р Р‹Р Р†Р вЂљРЎв„ўР В Р’В Р вЂ™Р’В°Р В Р’В Р РЋР’ВР В Р’В Р РЋРІР‚В + Р В Р Р‹Р В РІР‚С™Р В Р’В Р вЂ™Р’В°Р В Р’В Р вЂ™Р’В·Р В Р’В Р вЂ™Р’В±Р В Р’В Р РЋРІР‚ВР В Р’В Р В РІР‚В Р В Р’В Р РЋРІР‚СњР В Р’В Р вЂ™Р’В° Р В Р’В Р РЋРІР‚вЂќР В Р’В Р РЋРІР‚Сћ Р В Р’В Р РЋР’ВР В Р’В Р вЂ™Р’ВµР В Р Р‹Р В РЎвЂњР В Р Р‹Р В Р РЏР В Р Р‹Р Р†Р вЂљР’В Р В Р’В Р вЂ™Р’В°Р В Р’В Р РЋР’В (Р В Р’В Р РЋРІР‚СњР В Р’В Р В РІР‚В Р В Р’В Р вЂ™Р’В°Р В Р Р‹Р В РІР‚С™Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р’В Р вЂ™Р’В°Р В Р’В Р вЂ™Р’В» Р В Р’В Р РЋРІР‚ВР В Р’В Р вЂ™Р’В»Р В Р’В Р РЋРІР‚В Р В Р’В Р В РІР‚В Р В Р Р‹Р В РЎвЂњР В Р’В Р вЂ™Р’Вµ Р В Р’В Р РЋР’ВР В Р’В Р вЂ™Р’ВµР В Р Р‹Р В РЎвЂњР В Р Р‹Р В Р РЏР В Р Р‹Р Р†Р вЂљР’В Р В Р Р‹Р Р†Р вЂљРІвЂћвЂ“ Р В Р’В Р РЋРІР‚ВР В Р’В Р вЂ™Р’В· Р В Р’В Р СћРІР‚ВР В Р’В Р вЂ™Р’В°Р В Р’В Р В РІР‚В¦Р В Р’В Р В РІР‚В¦Р В Р Р‹Р Р†Р вЂљРІвЂћвЂ“Р В Р Р‹Р Р†Р вЂљР’В¦) */
export function getContractVsRecipeMatchWithMonths(
  contractItems: GenericRow[],
  recipeItems: GenericRow[],
  period?: string
): ContractRecipeMatchRowWithMonths[] {
  const base = getContractVsRecipeMatch(contractItems, recipeItems);

  let monthsToShow: string[];
  if (period?.includes('-Q')) {
    monthsToShow = getMonthsInQuarter(period);
  } else if (period && period !== 'All') {
    monthsToShow = [period];
  } else {
    const fromRecipes = new Set<string>();
    recipeItems.forEach(r => {
      const m = getMonthKey(r);
      if (m) fromRecipes.add(m);
    });
    monthsToShow = Array.from(fromRecipes).sort();
  }

  if (monthsToShow.length === 0) return base;

  return base.map((row, idx) => {
    const contractNom = contractItems[idx] ? getNomenclatureFromRow(contractItems[idx]) : row.contractNomenclature;
    const norm = normalizeNomenclature(contractNom);

    const byMonth: Record<string, { hasPrescribed: boolean; recipeQty: number; recipeSum: number }> = {};
    for (const monthKey of monthsToShow) {
      const recipesInMonth = recipeItems.filter(r => getMonthKey(r) === monthKey);
      const recipeByNorm = new Map<string, { qty: number; sum: number }>();
      for (const r of recipesInMonth) {
        const nom = getNomenclatureFromRow(r);
        const n = normalizeNomenclature(nom);
        if (!n) continue;
        const qty = findNumber(r, COLUMN_MATCHERS.QUANTITY);
        const sum = findNumber(r, COLUMN_MATCHERS.BONUS_AMOUNT);
        const cur = recipeByNorm.get(n);
        if (cur) {
          cur.qty += qty;
          cur.sum += sum;
        } else {
          recipeByNorm.set(n, { qty, sum });
        }
      }

      let hasPrescribed = false;
      let recipeQty = 0;
      let recipeSum = 0;
      const exact = recipeByNorm.get(norm);
      if (exact) {
        hasPrescribed = true;
        recipeQty = exact.qty;
        recipeSum = exact.sum;
      } else {
        for (const [recipeNorm, val] of recipeByNorm) {
          if (recipeNorm.includes(norm) || norm.includes(recipeNorm)) {
            hasPrescribed = true;
            recipeQty += val.qty;
            recipeSum += val.sum;
          }
        }
      }
      byMonth[monthKey] = { hasPrescribed, recipeQty, recipeSum };
    }
    return { ...row, byMonth };
  });
}

/** Р В Р’В Р РЋРЎСџР В Р Р‹Р В РІР‚С™Р В Р’В Р РЋРІР‚СћР В Р’В Р В РІР‚В Р В Р’В Р вЂ™Р’ВµР В Р Р‹Р В РІР‚С™Р В Р’В Р РЋРІР‚ВР В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р В Р вЂ°, Р В Р’В Р РЋРІР‚вЂќР В Р’В Р РЋРІР‚СћР В Р’В Р РЋРІР‚вЂќР В Р’В Р вЂ™Р’В°Р В Р’В Р СћРІР‚ВР В Р’В Р вЂ™Р’В°Р В Р’В Р вЂ™Р’ВµР В Р Р‹Р Р†Р вЂљРЎв„ў Р В Р’В Р вЂ™Р’В»Р В Р’В Р РЋРІР‚В Р В Р Р‹Р В РЎвЂњР В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р В РІР‚С™Р В Р’В Р РЋРІР‚СћР В Р’В Р РЋРІР‚СњР В Р’В Р вЂ™Р’В° Р В Р’В Р В РІР‚В  Р В Р’В Р В РІР‚В Р В Р Р‹Р Р†Р вЂљРІвЂћвЂ“Р В Р’В Р вЂ™Р’В±Р В Р Р‹Р В РІР‚С™Р В Р’В Р вЂ™Р’В°Р В Р’В Р В РІР‚В¦Р В Р’В Р В РІР‚В¦Р В Р Р‹Р Р†Р вЂљРІвЂћвЂ“Р В Р’В Р Р†РІР‚С›РІР‚вЂњ Р В Р’В Р РЋРІР‚вЂќР В Р’В Р вЂ™Р’ВµР В Р Р‹Р В РІР‚С™Р В Р’В Р РЋРІР‚ВР В Р’В Р РЋРІР‚СћР В Р’В Р СћРІР‚В (Р В Р’В Р РЋР’ВР В Р’В Р вЂ™Р’ВµР В Р Р‹Р В РЎвЂњР В Р Р‹Р В Р РЏР В Р Р‹Р Р†Р вЂљР’В  Р В Р’В Р РЋРІР‚ВР В Р’В Р вЂ™Р’В»Р В Р’В Р РЋРІР‚В Р В Р’В Р РЋРІР‚СњР В Р’В Р В РІР‚В Р В Р’В Р вЂ™Р’В°Р В Р Р‹Р В РІР‚С™Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р’В Р вЂ™Р’В°Р В Р’В Р вЂ™Р’В») */
export const rowMatchesPeriod = (row: GenericRow, period: string): boolean => {
  if (period === 'All') return true;
  const monthKey = getMonthKey(row);
  if (!monthKey) return false;
  if (period.includes('-Q')) {
    return isMonthInQuarter(monthKey, period);
  }
  return monthKey === period;
};

/** Проверяет, попадает ли строка в любой из выбранных периодов. filter: 'All' | string[] — пустой массив или 'All' = все периоды */
export const rowMatchesPeriodFilter = (row: GenericRow, filter: string | string[]): boolean => {
  const periods = Array.isArray(filter) ? filter : [filter];
  if (periods.length === 0 || periods.includes('All')) return true;
  return periods.some(p => rowMatchesPeriod(row, p));
};

/** Р В Р’В Р В Р вЂ№Р В Р’В Р РЋРІР‚СћР В Р’В Р вЂ™Р’В±Р В Р Р‹Р В РІР‚С™Р В Р’В Р вЂ™Р’В°Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р В Р вЂ° Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р’В Р РЋРІР‚СћР В Р’В Р вЂ™Р’В»Р В Р Р‹Р В Р вЂ°Р В Р’В Р РЋРІР‚СњР В Р’В Р РЋРІР‚Сћ Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р’В Р вЂ™Р’Вµ Р В Р’В Р РЋР’ВР В Р’В Р вЂ™Р’ВµР В Р Р‹Р В РЎвЂњР В Р Р‹Р В Р РЏР В Р Р‹Р Р†Р вЂљР’В Р В Р Р‹Р Р†Р вЂљРІвЂћвЂ“/Р В Р’В Р РЋРІР‚СњР В Р’В Р В РІР‚В Р В Р’В Р вЂ™Р’В°Р В Р Р‹Р В РІР‚С™Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р’В Р вЂ™Р’В°Р В Р’В Р вЂ™Р’В»Р В Р Р‹Р Р†Р вЂљРІвЂћвЂ“, Р В Р’В Р РЋРІР‚СњР В Р’В Р РЋРІР‚СћР В Р Р‹Р Р†Р вЂљРЎв„ўР В Р’В Р РЋРІР‚СћР В Р Р‹Р В РІР‚С™Р В Р Р‹Р Р†Р вЂљРІвЂћвЂ“Р В Р’В Р вЂ™Р’Вµ Р В Р Р‹Р В РІР‚С™Р В Р’В Р вЂ™Р’ВµР В Р’В Р вЂ™Р’В°Р В Р’В Р вЂ™Р’В»Р В Р Р‹Р В Р вЂ°Р В Р’В Р В РІР‚В¦Р В Р’В Р РЋРІР‚Сћ Р В Р’В Р вЂ™Р’ВµР В Р Р‹Р В РЎвЂњР В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р В Р вЂ° Р В Р’В Р В РІР‚В  Р В Р’В Р СћРІР‚ВР В Р’В Р вЂ™Р’В°Р В Р’В Р В РІР‚В¦Р В Р’В Р В РІР‚В¦Р В Р Р‹Р Р†Р вЂљРІвЂћвЂ“Р В Р Р‹Р Р†Р вЂљР’В¦ (Р В Р’В Р В РІР‚В¦Р В Р’В Р вЂ™Р’Вµ Р В Р Р‹Р В РЎвЂњР В Р Р‹Р Р†Р вЂљРЎв„ўР В Р’В Р вЂ™Р’В°Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р’В Р РЋРІР‚ВР В Р Р‹Р Р†Р вЂљР Р‹Р В Р’В Р вЂ™Р’ВµР В Р Р‹Р В РЎвЂњР В Р’В Р РЋРІР‚СњР В Р’В Р РЋРІР‚ВР В Р’В Р Р†РІР‚С›РІР‚вЂњ Р В Р Р‹Р В РЎвЂњР В Р’В Р РЋРІР‚вЂќР В Р’В Р РЋРІР‚ВР В Р Р‹Р В РЎвЂњР В Р’В Р РЋРІР‚СћР В Р’В Р РЋРІР‚Сњ). */
export const getAvailableMonths = (
  visits: GenericRow[],
  bonuses: GenericRow[],
  recipes?: GenericRow[],
  contracts?: GenericRow[]
): string[] => {
  const months = new Set<string>();
  const quarters = new Set<string>();

  const processRow = (row: GenericRow) => {
    const m = getMonthKey(row);
    if (m) {
      months.add(m);
      const [year, month] = m.split('-');
      const q = Math.ceil(parseInt(month, 10) / 3);
      quarters.add(`${year}-Q${q}`);
    }
  };

  visits.forEach(processRow);
  bonuses.forEach(processRow);
  (recipes ?? []).forEach(processRow);
  (contracts ?? []).forEach(processRow);

  const sortedMonths = Array.from(months).sort().reverse();
  const sortedQuarters = Array.from(quarters).sort().reverse();

  return [...sortedQuarters, ...sortedMonths];
};

const MONTH_NAMES_RU = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];

export interface PeriodGroup {
  quarterKey: string;   // e.g. "2026-Q1"
  quarterLabel: string; // e.g. "Квартал 1 2026"
  months: { key: string; label: string }[];
}

export const buildGroupedPeriods = (availableMonths: string[]): PeriodGroup[] => {
  // Extract only pure month keys (YYYY-MM), ignore pre-built quarter keys
  const pureMonths = availableMonths.filter(m => !m.includes('-Q'));

  const map = new Map<string, PeriodGroup>();

  pureMonths.forEach(m => {
    const [year, mo] = m.split('-');
    const monthIdx = parseInt(mo, 10) - 1;
    const q = Math.ceil((monthIdx + 1) / 3);
    const qKey = `${year}-Q${q}`;

    if (!map.has(qKey)) {
      map.set(qKey, {
        quarterKey: qKey,
        quarterLabel: `Квартал ${q} ${year}`,
        months: [],
      });
    }
    map.get(qKey)!.months.push({
      key: m,
      label: `${MONTH_NAMES_RU[monthIdx] ?? mo} ${year}`,
    });
  });

  // Sort quarters descending (most recent first), months already sorted descending
  return Array.from(map.values()).sort((a, b) => b.quarterKey.localeCompare(a.quarterKey));
};

const hasCoverageCandidateFields = (candidate: DoctorCoverageCandidate): boolean =>
  !!candidate.doctorName && !!candidate.specialty && !!candidate.institution;

const DOCTOR_BASE_NAME_MATCHERS = [
  '\u0444.\u0438.\u043e',
  '\u0444\u0438\u043e',
  '\u0444\u0438\u043e \u0432\u0440\u0430\u0447\u0430',
];

const DOCTOR_BASE_INSTITUTION_MATCHERS = [
  '\u043d\u0430\u0437\u0432\u0430\u043d\u0438\u0435 \u043b\u043f\u0443',
  '\u043b\u043f\u0443',
  '\u0443\u0447\u0440\u0435\u0436\u0434\u0435\u043d\u0438\u0435',
];

const DOCTOR_BASE_SPECIALTY_MATCHERS = [
  '\u0441\u043f\u0435\u0446\u0438\u0430\u043b\u044c\u043d\u043e\u0441\u0442\u044c',
  '\u0441\u043f\u0435\u0446',
  '\u043f\u0440\u043e\u0444\u0438\u043b\u044c',
  '\u0434\u043e\u043b\u0436\u043d\u043e\u0441\u0442\u044c',
];

export const getDoctorCoverageCandidateFromDoctorsRow = (row: GenericRow): DoctorCoverageCandidate => ({
  doctorName:
    findValue(row, COLUMN_MATCHERS.DOCTOR) ||
    findValue(row, DOCTOR_BASE_NAME_MATCHERS),
  specialty:
    findValue(row, COLUMN_MATCHERS.SPECIALTY) ||
    findValue(row, DOCTOR_BASE_SPECIALTY_MATCHERS),
  institution:
    findValue(row, COLUMN_MATCHERS.INSTITUTION) ||
    findValue(row, DOCTOR_BASE_INSTITUTION_MATCHERS),
});

const sortCoverageAssignments = (assignments: EmployeeCoverageAssignment[]): EmployeeCoverageAssignment[] =>
  assignments
    .map((assignment) => ({
      institution: assignment.institution,
      specialties: [...assignment.specialties].sort((a, b) => a.localeCompare(b, 'ru')),
    }))
    .sort((a, b) => a.institution.localeCompare(b.institution, 'ru'));

export const buildCoverageAssignmentsFromHistory = (
  employee: EmployeeSummary,
  visitsData: GenericRow[],
  bonusesData: GenericRow[]
): EmployeeCoverageAssignment[] => {
  const employeeKey = normalizeLinkKey(employee.name);
  const assignmentMap = new Map<string, { institution: string; specialties: Map<string, string> }>();

  const addRow = (row: GenericRow) => {
    if (normalizeLinkKey(findValue(row, COLUMN_MATCHERS.EMPLOYEE)) !== employeeKey) return;

    const institution = findValue(row, COLUMN_MATCHERS.INSTITUTION);
    const specialty = findValue(row, COLUMN_MATCHERS.SPECIALTY);
    const institutionKey = normalizeLinkKey(institution);
    const specialtyKey = normalizeLinkKey(specialty);
    if (!institutionKey || !specialtyKey) return;

    if (!assignmentMap.has(institutionKey)) {
      assignmentMap.set(institutionKey, {
        institution,
        specialties: new Map<string, string>(),
      });
    }

    assignmentMap.get(institutionKey)!.specialties.set(specialtyKey, specialty);
  };

  visitsData.forEach(addRow);
  bonusesData.forEach(addRow);

  employee.doctors.forEach((doctor) => {
    const institutionKey = normalizeLinkKey(doctor.institution);
    const specialtyKey = normalizeLinkKey(doctor.specialty);
    if (!institutionKey || !specialtyKey) return;

    if (!assignmentMap.has(institutionKey)) {
      assignmentMap.set(institutionKey, {
        institution: doctor.institution,
        specialties: new Map<string, string>(),
      });
    }

    assignmentMap.get(institutionKey)!.specialties.set(specialtyKey, doctor.specialty);
  });

  return sortCoverageAssignments(
    Array.from(assignmentMap.values()).map((item) => ({
      institution: item.institution,
      specialties: Array.from(item.specialties.values()),
    }))
  );
};

/** Acronym from a normalized institution name: first letter of each token ≥2 chars.
 *  "городская клиническая больница ж/д" → "гкб" (ж/д treated as one token, skipped as <2 alpha)
 *  Used to match short forms ("гкб жд") against full forms. */
const institutionAcronym = (normalized: string): string =>
  normalized
    .split(/[\s\/\-\(\)\.,]+/)
    .filter(w => /[а-яёa-z]{2,}/.test(w))
    .map(w => w[0])
    .join('');

export const buildDoctorCoverageAnalysis = (
  employee: EmployeeSummary,
  visitsData: GenericRow[],
  bonusesData: GenericRow[],
  doctorsData: GenericRow[],
  assignments?: EmployeeCoverageAssignment[]
): DoctorCoverageAnalysis => {
  const employeeKey = normalizeLinkKey(employee.name);
  const coveredDoctors = new Map<string, DoctorCoverageCandidate>();

  const upsertCoveredDoctor = (row: GenericRow) => {
    if (normalizeLinkKey(findValue(row, COLUMN_MATCHERS.EMPLOYEE)) !== employeeKey) return;

    const doctorName = findValue(row, COLUMN_MATCHERS.DOCTOR);
    const doctorKey = normalizeLinkKey(doctorName);
    if (!doctorKey) return;

    const next: DoctorCoverageCandidate = {
      doctorName,
      specialty: findValue(row, COLUMN_MATCHERS.SPECIALTY),
      institution: findValue(row, COLUMN_MATCHERS.INSTITUTION),
    };

    const current = coveredDoctors.get(doctorKey);
    if (!current) {
      coveredDoctors.set(doctorKey, next);
      return;
    }

    if (!current.specialty && next.specialty) current.specialty = next.specialty;
    if (!current.institution && next.institution) current.institution = next.institution;
    if (!current.doctorName && next.doctorName) current.doctorName = next.doctorName;
  };

  visitsData.forEach(upsertCoveredDoctor);
  bonusesData.forEach(upsertCoveredDoctor);

  employee.doctors.forEach((doc) => {
    const doctorKey = normalizeLinkKey(doc.doctorName);
    if (!doctorKey || !coveredDoctors.has(doctorKey)) return;
    const current = coveredDoctors.get(doctorKey)!;
    if (!current.specialty && doc.specialty) current.specialty = doc.specialty;
    if (!current.institution && doc.institution) current.institution = doc.institution;
  });

  const normalizedAssignments = (assignments && assignments.length > 0)
    ? assignments
    : buildCoverageAssignmentsFromHistory(employee, visitsData, bonusesData);

  const institutionSpecialties = new Map<string, { institution: string; specialties: Map<string, string> }>();
  normalizedAssignments.forEach((assignment) => {
    const institutionKey = normalizeLinkKey(assignment.institution);
    if (!institutionKey) return;

    if (!institutionSpecialties.has(institutionKey)) {
      institutionSpecialties.set(institutionKey, {
        institution: assignment.institution,
        specialties: new Map<string, string>(),
      });
    }

    assignment.specialties.forEach((specialty) => {
      const specialtyKey = normalizeLinkKey(specialty);
      if (!specialtyKey) return;
      institutionSpecialties.get(institutionKey)!.specialties.set(specialtyKey, specialty);
    });
  });

  const coverageMap = new Map<string, Map<string, { covered: DoctorCoverageCandidate[]; potential: DoctorCoverageCandidate[] }>>();

  coveredDoctors.forEach((doctor) => {
    if (!hasCoverageCandidateFields(doctor)) return;
    const institutionKey = normalizeLinkKey(doctor.institution);
    const specialtyKey = normalizeLinkKey(doctor.specialty);
    const institutionData = institutionSpecialties.get(institutionKey);
    if (!institutionData || !institutionData.specialties.has(specialtyKey)) return;

    if (!coverageMap.has(institutionKey)) coverageMap.set(institutionKey, new Map());
    const specialties = coverageMap.get(institutionKey)!;
    if (!specialties.has(specialtyKey)) specialties.set(specialtyKey, { covered: [], potential: [] });
    specialties.get(specialtyKey)!.covered.push(doctor);
  });

  doctorsData.forEach((row) => {
    const candidate = getDoctorCoverageCandidateFromDoctorsRow(row);
    if (!hasCoverageCandidateFields(candidate)) return;

    const institutionKey = normalizeLinkKey(candidate.institution);
    const specialtyKey = normalizeLinkKey(candidate.specialty);
    const doctorKey = normalizeLinkKey(candidate.doctorName);
    const institutionData = institutionSpecialties.get(institutionKey);
    if (!institutionData) return;
    if (!institutionData.specialties.has(specialtyKey)) return;
    if (coveredDoctors.has(doctorKey)) return;

    if (!coverageMap.has(institutionKey)) coverageMap.set(institutionKey, new Map());
    const specialties = coverageMap.get(institutionKey)!;
    if (!specialties.has(specialtyKey)) specialties.set(specialtyKey, { covered: [], potential: [] });

    const group = specialties.get(specialtyKey)!;
    if (!group.potential.some((item) => normalizeLinkKey(item.doctorName) === doctorKey)) {
      group.potential.push(candidate);
    }
  });

  const institutions = Array.from(coverageMap.entries())
    .map(([institutionKey, specialtiesMap]) => {
      const institutionLabel =
        institutionSpecialties.get(institutionKey)?.institution ??
        specialtiesMap.values().next().value?.covered[0]?.institution ??
        specialtiesMap.values().next().value?.potential[0]?.institution ??
        '';

      const specialties = Array.from(specialtiesMap.entries())
        .map(([specialtyKey, group]) => {
          if (group.potential.length === 0) return null;
          const specialtyLabel =
            institutionSpecialties.get(institutionKey)?.specialties.get(specialtyKey) ??
            group.covered[0]?.specialty ??
            group.potential[0]?.specialty ??
            '';

          const covered = [...group.covered].sort((a, b) => a.doctorName.localeCompare(b.doctorName, 'ru'));
          const potential = [...group.potential].sort((a, b) => a.doctorName.localeCompare(b.doctorName, 'ru'));

          return {
            specialty: specialtyLabel,
            coveredDoctors: covered,
            potentialDoctors: potential,
            coveredCount: covered.length,
            potentialCount: potential.length,
          };
        })
        .filter((group): group is NonNullable<typeof group> => !!group)
        .sort((a, b) => a.specialty.localeCompare(b.specialty, 'ru'));

      if (specialties.length === 0) return null;

      return {
        institution: institutionLabel,
        specialties,
        coveredCount: specialties.reduce((sum, group) => sum + group.coveredCount, 0),
        potentialCount: specialties.reduce((sum, group) => sum + group.potentialCount, 0),
      };
    })
    .filter((group): group is NonNullable<typeof group> => !!group)
    .sort((a, b) => a.institution.localeCompare(b.institution, 'ru'));

  const potentialDoctorsCount = institutions.reduce((sum, group) => sum + group.potentialCount, 0);

  return {
    coveredDoctorsCount: coveredDoctors.size,
    potentialDoctorsCount,
    institutionsCount: institutionSpecialties.size,
    institutions,
  };
};

export const processAnalysis = (
  visits: GenericRow[], 
  bonuses: GenericRow[], 
  activeEmployees: GenericRow[],
  filterMonth: string | string[] = 'All',
  contractsData: GenericRow[] = [],
  recipesData: GenericRow[] = [],
  doctorsData: GenericRow[] = []
): { 
  employeeStats: EmployeeSummary[],
  totalVisits: number,
  totalBonuses: number,
  globalConversion: number
} => {
  const empStatsMap = new Map<string, EmployeeSummary>();
  
  activeEmployees.forEach(emp => {
    const name = findValue(emp, COLUMN_MATCHERS.EMPLOYEE);
    if (!name) return;
    const empKey = normalizeLinkKey(name);

    const roleVal = findValue(emp, COLUMN_MATCHERS.ROLE);
    const role = (roleVal.toLowerCase().includes('менеджер') ? 'Менеджер' : 'МП') as EmployeeSummary['role'];
    empStatsMap.set(empKey, {
      id: empKey,
      name: name,
      region: findValue(emp, COLUMN_MATCHERS.REGION),
      group: findValue(emp, COLUMN_MATCHERS.GROUP),
      role,
      totalVisits: 0,
      totalBonuses: 0,
      activeDoctorsCount: 0,
      visitedDoctorsCount: 0,
      contractsCount: 0,
      fullCycleCount: 0,
      contractWithoutRecipesCount: 0,
      nonContractDoctorsCount: 0,
      visitsWithoutBonusesCount: 0,
      bonusesWithoutVisitsCount: 0,
      doctorsWithRecipeGroupCount: 0,
      potentialDoctorsCount: 0,
      costPerVisit: 0,
      conversionRate: 0,
      zeroResultVisits: 0,
      wastedEffortDoctors: 0,
      doctors: new Map<string, DoctorInteraction>()
    });
  });

  // Р В Р’В Р В РІвЂљВ¬Р В Р’В Р В РІР‚В¦Р В Р’В Р РЋРІР‚ВР В Р’В Р РЋРІР‚СњР В Р’В Р вЂ™Р’В°Р В Р’В Р вЂ™Р’В»Р В Р Р‹Р В Р вЂ°Р В Р’В Р В РІР‚В¦Р В Р Р‹Р Р†Р вЂљРІвЂћвЂ“Р В Р’В Р вЂ™Р’Вµ Р В Р’В Р В РІР‚В Р В Р Р‹Р В РІР‚С™Р В Р’В Р вЂ™Р’В°Р В Р Р‹Р Р†Р вЂљР Р‹Р В Р’В Р РЋРІР‚В Р В Р’В Р РЋРІР‚вЂќР В Р’В Р РЋРІР‚Сћ Р В Р’В Р СћРІР‚ВР В Р’В Р РЋРІР‚СћР В Р’В Р РЋРІР‚вЂњР В Р’В Р РЋРІР‚СћР В Р’В Р В РІР‚В Р В Р’В Р РЋРІР‚СћР В Р Р‹Р В РІР‚С™Р В Р’В Р вЂ™Р’В°Р В Р’В Р РЋР’В Р В Р’В Р СћРІР‚ВР В Р’В Р вЂ™Р’В»Р В Р Р‹Р В Р РЏ Р В Р’В Р РЋРІР‚СњР В Р’В Р вЂ™Р’В°Р В Р’В Р вЂ™Р’В¶Р В Р’В Р СћРІР‚ВР В Р’В Р РЋРІР‚СћР В Р’В Р РЋРІР‚вЂњР В Р’В Р РЋРІР‚Сћ Р В Р’В Р РЋРЎв„ўР В Р’В Р РЋРЎСџ
  const contractDoctorsPerEmp = new Map<string, Set<string>>();

  let totalVisits = 0;

  visits.forEach(row => {
    const empNameRaw = findValue(row, COLUMN_MATCHERS.EMPLOYEE);
    if (!empNameRaw) return;
    const empKey = normalizeLinkKey(empNameRaw);
    const employee = empStatsMap.get(empKey);
    
    if (employee) {
      const docName = findValue(row, COLUMN_MATCHERS.DOCTOR);
      const docKey = docName ? normalizeLinkKey(docName) : '';
      if (!docKey) return;
      const rowMonth = getMonthKey(row);

      if (!employee.doctors.has(docKey)) {
        employee.doctors.set(docKey, { 
          doctorName: docName, 
          specialty: '',
          institution: '',
          visitCount: 0, 
          bonusAmount: 0, 
          history: {} 
        });
      }
      const docStats = employee.doctors.get(docKey)!;
      const specialty = findValue(row, COLUMN_MATCHERS.SPECIALTY);
      const institution = findValue(row, COLUMN_MATCHERS.INSTITUTION);
      if (specialty && !docStats.specialty) docStats.specialty = specialty;
      if (institution && !docStats.institution) docStats.institution = institution;

      if (rowMonth) {
        if (!docStats.history[rowMonth]) docStats.history[rowMonth] = { visits: 0, bonuses: 0 };
        docStats.history[rowMonth].visits += 1;
      }

      const matchesFilter = rowMatchesPeriodFilter(row, filterMonth);

      if (matchesFilter) {
        employee.totalVisits += 1;
        totalVisits++;
        docStats.visitCount += 1;
      }
    }
  });

  let totalBonuses = 0;

  bonuses.forEach(row => {
    const empNameRaw = findValue(row, COLUMN_MATCHERS.EMPLOYEE);
    if (!empNameRaw) return;
    const empKey = normalizeLinkKey(empNameRaw);
    const employee = empStatsMap.get(empKey);

    if (employee) {
      const amount = findNumber(row, COLUMN_MATCHERS.BONUS_AMOUNT);
      const docName = findValue(row, COLUMN_MATCHERS.DOCTOR);
      const docKey = docName ? normalizeLinkKey(docName) : '';
      if (!docKey) return;
      const rowMonth = getMonthKey(row);

      if (!employee.doctors.has(docKey)) {
        employee.doctors.set(docKey, { 
          doctorName: docName, 
          specialty: '',
          institution: '',
          visitCount: 0, 
          bonusAmount: 0, 
          history: {} 
        });
      }
      const docStats = employee.doctors.get(docKey)!;
      const specialty = findValue(row, COLUMN_MATCHERS.SPECIALTY);
      const institution = findValue(row, COLUMN_MATCHERS.INSTITUTION);
      if (specialty && !docStats.specialty) docStats.specialty = specialty;
      if (institution && !docStats.institution) docStats.institution = institution;

      if (rowMonth) {
        if (!docStats.history[rowMonth]) docStats.history[rowMonth] = { visits: 0, bonuses: 0 };
        docStats.history[rowMonth].bonuses += amount;
      }

      const matchesFilter = rowMatchesPeriodFilter(row, filterMonth);

      if (matchesFilter) {
        employee.totalBonuses += amount;
        totalBonuses += amount;
        docStats.bonusAmount += amount;
      }
    }
  });

  // Р В Р’В Р Р†Р вЂљРЎСљР В Р’В Р РЋРІР‚СћР В Р’В Р вЂ™Р’В±Р В Р’В Р вЂ™Р’В°Р В Р’В Р В РІР‚В Р В Р’В Р РЋРІР‚ВР В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р В Р вЂ° Р В Р’В Р В РІР‚В Р В Р Р‹Р В РІР‚С™Р В Р’В Р вЂ™Р’В°Р В Р Р‹Р Р†Р вЂљР Р‹Р В Р’В Р вЂ™Р’ВµР В Р’В Р Р†РІР‚С›РІР‚вЂњ Р В Р’В Р РЋРІР‚ВР В Р’В Р вЂ™Р’В· Р В Р’В Р Р†Р вЂљРЎСљР В Р’В Р РЋРІР‚СћР В Р’В Р РЋРІР‚вЂњР В Р’В Р РЋРІР‚СћР В Р’В Р В РІР‚В Р В Р’В Р РЋРІР‚СћР В Р Р‹Р В РІР‚С™Р В Р’В Р вЂ™Р’В° Р В Р’В Р РЋРІР‚В Р В Р’В Р вЂ™Р’В Р В Р’В Р вЂ™Р’ВµР В Р Р‹Р Р†Р вЂљР’В Р В Р’В Р вЂ™Р’ВµР В Р’В Р РЋРІР‚вЂќР В Р Р‹Р Р†Р вЂљРЎв„ўР В Р’В Р РЋРІР‚СћР В Р’В Р В РІР‚В  (Р В Р’В Р вЂ™Р’ВµР В Р Р‹Р В РЎвЂњР В Р’В Р вЂ™Р’В»Р В Р’В Р РЋРІР‚В Р В Р’В Р вЂ™Р’ВµР В Р Р‹Р Р†Р вЂљР’В°Р В Р Р‹Р Р†Р вЂљР’В Р В Р’В Р В РІР‚В¦Р В Р’В Р вЂ™Р’Вµ Р В Р’В Р В РІР‚В  Р В Р Р‹Р В РЎвЂњР В Р’В Р РЋРІР‚вЂќР В Р’В Р РЋРІР‚ВР В Р Р‹Р В РЎвЂњР В Р’В Р РЋРІР‚СњР В Р’В Р вЂ™Р’Вµ)
  contractsData.forEach(row => {
    const empNameRaw = findValue(row, COLUMN_MATCHERS.EMPLOYEE);
    const groupRaw = findValue(row, COLUMN_MATCHERS.GROUP);
    const docName = findValue(row, COLUMN_MATCHERS.DOCTOR);
    const docKey = docName ? normalizeLinkKey(docName) : '';
    if (!docKey) return;

    const empKeysToAdd: string[] = [];
    if (empNameRaw) {
      const empKey = normalizeLinkKey(empNameRaw);
      if (empStatsMap.has(empKey)) empKeysToAdd.push(empKey);
    }
    if (empKeysToAdd.length === 0 && groupRaw) {
      const groupKey = normalizeLinkKey(groupRaw);
      empStatsMap.forEach((emp, key) => {
        if (normalizeLinkKey(emp.group) === groupKey) empKeysToAdd.push(key);
      });
    }

    for (const empKey of empKeysToAdd) {
      const employee = empStatsMap.get(empKey)!;
      if (!contractDoctorsPerEmp.has(empKey)) contractDoctorsPerEmp.set(empKey, new Set());
      contractDoctorsPerEmp.get(empKey)!.add(docKey);
      if (!employee.doctors.has(docKey)) {
        employee.doctors.set(docKey, {
          doctorName: docName,
          specialty: findValue(row, COLUMN_MATCHERS.SPECIALTY),
          institution: findValue(row, COLUMN_MATCHERS.INSTITUTION),
          visitCount: 0,
          bonusAmount: 0,
          history: {},
        });
      }
    }
  });

  recipesData.forEach(row => {
    const empNameRaw = findValue(row, COLUMN_MATCHERS.EMPLOYEE);
    if (!empNameRaw) return;
    const empKey = normalizeLinkKey(empNameRaw);
    const employee = empStatsMap.get(empKey);
    if (!employee) return;
    const docName = findValue(row, COLUMN_MATCHERS.DOCTOR);
    const docKey = docName ? normalizeLinkKey(docName) : '';
    if (!docKey) return;
    if (!employee.doctors.has(docKey)) {
      employee.doctors.set(docKey, {
        doctorName: docName,
        specialty: findValue(row, COLUMN_MATCHERS.SPECIALTY),
        institution: findValue(row, COLUMN_MATCHERS.INSTITUTION),
        visitCount: 0,
        bonusAmount: 0,
        history: {},
      });
    }
  });

  // Pre-built lookup indexes: O(C+R) Р В Р’В Р РЋРІР‚СћР В Р’В Р СћРІР‚ВР В Р’В Р РЋРІР‚ВР В Р’В Р В РІР‚В¦ Р В Р Р‹Р В РІР‚С™Р В Р’В Р вЂ™Р’В°Р В Р’В Р вЂ™Р’В· Р В Р’В Р В РІР‚В Р В Р’В Р РЋР’ВР В Р’В Р вЂ™Р’ВµР В Р Р‹Р В РЎвЂњР В Р Р‹Р Р†Р вЂљРЎв„ўР В Р’В Р РЋРІР‚Сћ O(NР В РІР‚СљР Р†Р вЂљРІР‚СњMР В РІР‚СљР Р†Р вЂљРІР‚Сњ(C+R))
  const contractsByDocAndMp = new Map<string, GenericRow[]>();
  contractsData.forEach(row => {
    const docKey = normalizeLinkKey(getDoctorFromRow(row));
    const mpKey = normalizeLinkKey(getMPFromRow(row));
    if (!docKey) return;
    const k = `${docKey}::${mpKey}`;
    if (!contractsByDocAndMp.has(k)) contractsByDocAndMp.set(k, []);
    contractsByDocAndMp.get(k)!.push(row);
  });

  const recipesByDocAndGroup = new Map<string, GenericRow[]>();
  recipesData.forEach(row => {
    const docKey = normalizeLinkKey(getDoctorFromRow(row));
    const groupKey = normalizeLinkKey(getGroupFromRow(row));
    if (!docKey) return;
    const k = `${docKey}::${groupKey}`;
    if (!recipesByDocAndGroup.has(k)) recipesByDocAndGroup.set(k, []);
    recipesByDocAndGroup.get(k)!.push(row);
  });

  const employeeStats = Array.from(empStatsMap.values()).map(e => {
    let visitedDoctors = 0;
    let doctorsWithBonus = 0;
    let wastedDoctors = 0;
    let doctorsWithRecipeGroup = 0;
    let zeroResultVisits = 0;
    let fullCycle = 0;
    let contractNoRecipe = 0;
    let doctorsWithContractAndRecipe = 0;
    let nonContractDoctors = 0;
    let visitsWithoutBonuses = 0;
    let bonusesWithoutVisits = 0;
    let itemsComplianceSum = 0;
    let itemsComplianceCount = 0;
    const empNormKey = normalizeLinkKey(e.name);
    const groupNormKey = normalizeLinkKey(e.group);

    e.doctors.forEach(doc => {
      if (doc.visitCount > 0) visitedDoctors++;
      if (doc.bonusAmount > 0) doctorsWithBonus++;
      if (doc.visitCount > 0 && doc.bonusAmount === 0) zeroResultVisits += doc.visitCount;
      if (doc.visitCount >= 3 && doc.bonusAmount === 0) wastedDoctors++;
      const docNormKey = normalizeLinkKey(doc.doctorName);
      const contractItems = contractsByDocAndMp.get(`${docNormKey}::${empNormKey}`) ?? [];
      const recipeItems = recipesByDocAndGroup.get(`${docNormKey}::${groupNormKey}`) ?? [];
      const hasContract = contractItems.length > 0;
      const hasRecipeGroup = recipeItems.length > 0;
      const isManager = (e as EmployeeSummary & { role?: unknown }).role === 'Менеджер';
      if (hasContract && (doc.visitCount > 0 || isManager) && hasRecipeGroup) fullCycle++;
      if (hasContract && !hasRecipeGroup) contractNoRecipe++;
      if (hasContract && hasRecipeGroup) doctorsWithContractAndRecipe++;
      if (hasRecipeGroup) doctorsWithRecipeGroup++;
      if (!hasContract && (doc.visitCount > 0 || doc.bonusAmount > 0)) nonContractDoctors++;
      if (doc.visitCount > 0 && doc.bonusAmount === 0) visitsWithoutBonuses++;
      if (doc.bonusAmount > 0 && doc.visitCount === 0) bonusesWithoutVisits++;
      if (hasContract && contractItems.length > 0) {
        const match = getContractVsRecipeMatch(contractItems, recipeItems);
        const prescribed = match.filter(m => m.hasPrescribed).length;
        itemsComplianceSum += (prescribed / match.length) * 100;
        itemsComplianceCount++;
      }
    });

    const contractsCountVal = contractDoctorsPerEmp.get(e.id)?.size ?? 0;
    const contractDoctorsPrescribedRate =
      contractsCountVal > 0 ? (doctorsWithContractAndRecipe / contractsCountVal) * 100 : 0;
    const contractItemsComplianceRate =
      itemsComplianceCount > 0 ? itemsComplianceSum / itemsComplianceCount : 0;
    const potentialDoctorsCount =
      doctorsData.length > 0
        ? buildDoctorCoverageAnalysis(e as EmployeeSummary, visits, bonuses, doctorsData).potentialDoctorsCount
        : 0;

    return {
      ...e,
      activeDoctorsCount: doctorsWithBonus,
      visitedDoctorsCount: visitedDoctors,
      contractsCount: contractsCountVal,
      fullCycleCount: fullCycle,
      contractWithoutRecipesCount: contractNoRecipe,
      nonContractDoctorsCount: nonContractDoctors,
      visitsWithoutBonusesCount: visitsWithoutBonuses,
      bonusesWithoutVisitsCount: bonusesWithoutVisits,
      doctorsWithRecipeGroupCount: doctorsWithRecipeGroup,
      potentialDoctorsCount,
      contractDoctorsPrescribedRate,
      contractItemsComplianceRate,
      costPerVisit: e.totalVisits > 0 ? e.totalBonuses / e.totalVisits : 0,
      conversionRate: visitedDoctors > 0 ? (doctorsWithBonus / visitedDoctors) * 100 : 0,
      zeroResultVisits,
      wastedEffortDoctors: wastedDoctors
    };
  })
  .filter(e => e.doctors.size > 0)
  .sort((a, b) => b.totalBonuses - a.totalBonuses);

  const mpOnly = employeeStats.filter(e => String((e as EmployeeSummary & { role?: unknown }).role ?? '') !== 'Менеджер');
  const globalConversion = mpOnly.length > 0
    ? mpOnly.reduce((acc, curr) => acc + curr.conversionRate, 0) / mpOnly.length
    : employeeStats.reduce((acc, curr) => acc + curr.conversionRate, 0) / (employeeStats.length || 1);

  return { employeeStats, totalVisits, totalBonuses, globalConversion };
};


// ======================================================================
// Two-phase analysis: buildBaseAnalysis (once) + aggregateFromBase (fast)
// ======================================================================

export interface BaseAnalysis {
  empMap: Map<string, EmployeeSummary>;
  contractsByDocAndMp: Map<string, GenericRow[]>;
  recipesByDocAndGroup: Map<string, GenericRow[]>;
  contractDoctorsPerEmp: Map<string, Set<string>>;
  potentialByEmp: Map<string, number>;
}

const monthMatchesPeriod2 = (monthKey: string, filter: string | string[]): boolean => {
  const periods = Array.isArray(filter) ? filter : [filter];
  if (periods.length === 0 || periods.includes('All')) return true;
  return periods.some(p =>
    p === 'All' ? true : p.includes('-Q') ? isMonthInQuarter(monthKey, p) : monthKey === p
  );
};

export const buildBaseAnalysis = (
  visits: GenericRow[],
  bonuses: GenericRow[],
  activeEmployees: GenericRow[],
  contractsData: GenericRow[] = [],
  recipesData: GenericRow[] = [],
  doctorsData: GenericRow[] = [],
  savedAssignmentsMap: Record<string, EmployeeCoverageAssignment[]> = {}
): BaseAnalysis => {
  const empMap = new Map<string, EmployeeSummary>();

  activeEmployees.forEach(emp => {
    const name = findValue(emp, COLUMN_MATCHERS.EMPLOYEE);
    if (!name) return;
    const empKey = normalizeLinkKey(name);
    const roleVal = findValue(emp, COLUMN_MATCHERS.ROLE);
    const role = (roleVal.toLowerCase().includes('менеджер') ? 'Менеджер' : 'МП') as EmployeeSummary['role'];
    empMap.set(empKey, {
      id: empKey, name, role,
      region: findValue(emp, COLUMN_MATCHERS.REGION),
      group: findValue(emp, COLUMN_MATCHERS.GROUP),
      totalVisits: 0, totalBonuses: 0, activeDoctorsCount: 0,
      visitedDoctorsCount: 0, contractsCount: 0, fullCycleCount: 0,
      contractWithoutRecipesCount: 0, nonContractDoctorsCount: 0,
      visitsWithoutBonusesCount: 0, bonusesWithoutVisitsCount: 0,
      doctorsWithRecipeGroupCount: 0, potentialDoctorsCount: 0,
      costPerVisit: 0, conversionRate: 0, zeroResultVisits: 0, wastedEffortDoctors: 0,
      doctors: new Map<string, DoctorInteraction>(),
    });
  });

  const contractDoctorsPerEmp = new Map<string, Set<string>>();

  const upsertDoc = (employee: EmployeeSummary, docName: string, docKey: string, row: GenericRow) => {
    if (!employee.doctors.has(docKey)) {
      employee.doctors.set(docKey, {
        doctorName: docName,
        specialty: findValue(row, COLUMN_MATCHERS.SPECIALTY),
        institution: findValue(row, COLUMN_MATCHERS.INSTITUTION),
        visitCount: 0, bonusAmount: 0, history: {},
      });
    }
    const doc = employee.doctors.get(docKey)!;
    const spec = findValue(row, COLUMN_MATCHERS.SPECIALTY);
    const inst = findValue(row, COLUMN_MATCHERS.INSTITUTION);
    if (spec && !doc.specialty) doc.specialty = spec;
    if (inst && !doc.institution) doc.institution = inst;
    return doc;
  };

  visits.forEach(row => {
    const empKey = normalizeLinkKey(findValue(row, COLUMN_MATCHERS.EMPLOYEE));
    const employee = empMap.get(empKey);
    if (!employee) return;
    const docName = findValue(row, COLUMN_MATCHERS.DOCTOR);
    const docKey = docName ? normalizeLinkKey(docName) : '';
    if (!docKey) return;
    const doc = upsertDoc(employee, docName, docKey, row);
    const month = getMonthKey(row);
    if (month) {
      if (!doc.history[month]) doc.history[month] = { visits: 0, bonuses: 0 };
      doc.history[month].visits += 1;
    }
  });

  bonuses.forEach(row => {
    const empKey = normalizeLinkKey(findValue(row, COLUMN_MATCHERS.EMPLOYEE));
    const employee = empMap.get(empKey);
    if (!employee) return;
    const docName = findValue(row, COLUMN_MATCHERS.DOCTOR);
    const docKey = docName ? normalizeLinkKey(docName) : '';
    if (!docKey) return;
    const doc = upsertDoc(employee, docName, docKey, row);
    const amount = findNumber(row, COLUMN_MATCHERS.BONUS_AMOUNT);
    const month = getMonthKey(row);
    if (month) {
      if (!doc.history[month]) doc.history[month] = { visits: 0, bonuses: 0 };
      doc.history[month].bonuses += amount;
    }
  });

  contractsData.forEach(row => {
    const empNameRaw = findValue(row, COLUMN_MATCHERS.EMPLOYEE);
    const groupRaw = findValue(row, COLUMN_MATCHERS.GROUP);
    const docName = findValue(row, COLUMN_MATCHERS.DOCTOR);
    const docKey = docName ? normalizeLinkKey(docName) : '';
    if (!docKey) return;
    const empKeys: string[] = [];
    if (empNameRaw) { const k = normalizeLinkKey(empNameRaw); if (empMap.has(k)) empKeys.push(k); }
    if (empKeys.length === 0 && groupRaw) {
      const gk = normalizeLinkKey(groupRaw);
      empMap.forEach((emp, k) => { if (normalizeLinkKey(emp.group) === gk) empKeys.push(k); });
    }
    for (const empKey of empKeys) {
      const employee = empMap.get(empKey)!;
      if (!contractDoctorsPerEmp.has(empKey)) contractDoctorsPerEmp.set(empKey, new Set());
      contractDoctorsPerEmp.get(empKey)!.add(docKey);
      upsertDoc(employee, docName, docKey, row);
    }
  });

  recipesData.forEach(row => {
    const empKey = normalizeLinkKey(findValue(row, COLUMN_MATCHERS.EMPLOYEE));
    const employee = empMap.get(empKey);
    if (!employee) return;
    const docName = findValue(row, COLUMN_MATCHERS.DOCTOR);
    const docKey = docName ? normalizeLinkKey(docName) : '';
    if (!docKey) return;
    upsertDoc(employee, docName, docKey, row);
  });

  const contractsByDocAndMp = new Map<string, GenericRow[]>();
  contractsData.forEach(row => {
    const docKey = normalizeLinkKey(getDoctorFromRow(row));
    const mpKey = normalizeLinkKey(getMPFromRow(row));
    if (!docKey) return;
    const k = docKey + '::' + mpKey;
    if (!contractsByDocAndMp.has(k)) contractsByDocAndMp.set(k, []);
    contractsByDocAndMp.get(k)!.push(row);
  });

  const recipesByDocAndGroup = new Map<string, GenericRow[]>();
  recipesData.forEach(row => {
    const docKey = normalizeLinkKey(getDoctorFromRow(row));
    const groupKey = normalizeLinkKey(getGroupFromRow(row));
    if (!docKey) return;
    const k = docKey + '::' + groupKey;
    if (!recipesByDocAndGroup.has(k)) recipesByDocAndGroup.set(k, []);
    recipesByDocAndGroup.get(k)!.push(row);
  });

  // Build institution → region lookup from doctorsData (same as EmployeeCoveragePage)
  const instRegionMap = new Map<string, string>();
  doctorsData.forEach(row => {
    const inst   = normalizeLinkKey(findValue(row, COLUMN_MATCHERS.INSTITUTION));
    const region = findValue(row, COLUMN_MATCHERS.REGION);
    if (inst && region) instRegionMap.set(inst, region);
  });

  // Pre-compute potential per employee ONCE (not per period change)
  // Uses saved assignments if available, otherwise visit history as fallback.
  // Applies the same region filter as EmployeeCoveragePage so numbers match.
  const potentialByEmp = new Map<string, number>();
  if (doctorsData.length > 0) {
    empMap.forEach((emp, empKey) => {
      const saved = savedAssignmentsMap[empKey];
      let assignments: EmployeeCoverageAssignment[];
      if (saved?.length) {
        assignments = saved;
      } else {
        const aMap = new Map<string, { institution: string; specialties: Map<string, string> }>();
        emp.doctors.forEach(doc => {
          const ik = normalizeLinkKey(doc.institution);
          const sk = normalizeLinkKey(doc.specialty);
          if (!ik || !sk) return;
          if (!aMap.has(ik)) aMap.set(ik, { institution: doc.institution, specialties: new Map() });
          aMap.get(ik)!.specialties.set(sk, doc.specialty);
        });
        assignments = Array.from(aMap.values()).map(a => ({
          institution: a.institution, specialties: Array.from(a.specialties.values()),
        }));
      }
      if (assignments.length === 0) { potentialByEmp.set(empKey, 0); return; }
      const analysis = buildDoctorCoverageAnalysis(emp as EmployeeSummary, visits, bonuses, doctorsData, assignments);

      // Apply region filter (same logic as EmployeeCoveragePage allRows)
      const empRegion = (emp.region ?? '').toLowerCase().trim();
      let potentialCount = 0;
      analysis.institutions.forEach(inst => {
        const instRegion = (instRegionMap.get(normalizeLinkKey(inst.institution)) ?? '').toLowerCase().trim();
        // Skip if employee has a region AND institution has a known region AND they don't match
        if (empRegion && instRegion && instRegion !== empRegion) return;
        inst.specialties.forEach(spec => {
          potentialCount += spec.potentialCount;
        });
      });
      potentialByEmp.set(empKey, potentialCount);
    });
  }

  return { empMap, contractsByDocAndMp, recipesByDocAndGroup, contractDoctorsPerEmp, potentialByEmp };
};

export const aggregateFromBase = (
  base: BaseAnalysis,
  filterMonth: string | string[] = 'All'
): { employeeStats: EmployeeSummary[], totalVisits: number, totalBonuses: number, globalConversion: number } => {
  let totalVisits = 0;
  let totalBonuses = 0;

  const employeeStats = Array.from(base.empMap.values()).map(empBase => {
    const empNormKey = normalizeLinkKey(empBase.name);
    const groupNormKey = normalizeLinkKey(empBase.group);
    let empVisits = 0;
    let empBonuses = 0;
    const filteredDoctors = new Map<string, DoctorInteraction>();

    empBase.doctors.forEach((doc, docKey) => {
      let visitCount = 0;
      let bonusAmount = 0;
      for (const [month, data] of Object.entries(doc.history)) {
        if (monthMatchesPeriod2(month, filterMonth)) {
          visitCount += data.visits;
          bonusAmount += data.bonuses;
        }
      }
      empVisits += visitCount;
      empBonuses += bonusAmount;
      filteredDoctors.set(docKey, { ...doc, visitCount, bonusAmount });
    });

    totalVisits += empVisits;
    totalBonuses += empBonuses;

    let visitedDoctors = 0, doctorsWithBonus = 0, wastedDoctors = 0, doctorsWithRecipeGroup = 0;
    let zeroResultVisits = 0, fullCycle = 0, contractNoRecipe = 0, doctorsWithContractAndRecipe = 0;
    let nonContractDoctors = 0, visitsWithoutBonuses = 0, bonusesWithoutVisits = 0;
    let itemsComplianceSum = 0, itemsComplianceCount = 0;

    filteredDoctors.forEach(doc => {
      const dnk = normalizeLinkKey(doc.doctorName);
      const contractItems = base.contractsByDocAndMp.get(dnk + '::' + empNormKey) ?? [];
      const recipeItems = base.recipesByDocAndGroup.get(dnk + '::' + groupNormKey) ?? [];
      const hasContract = contractItems.length > 0;
      const hasRecipeGroup = recipeItems.length > 0;
      if (doc.visitCount > 0) visitedDoctors++;
      if (doc.bonusAmount > 0) doctorsWithBonus++;
      if (doc.visitCount > 0 && doc.bonusAmount === 0) zeroResultVisits += doc.visitCount;
      if (doc.visitCount >= 3 && doc.bonusAmount === 0) wastedDoctors++;
      if (hasContract && doc.visitCount > 0 && hasRecipeGroup) fullCycle++;
      if (hasContract && !hasRecipeGroup) contractNoRecipe++;
      if (hasContract && hasRecipeGroup) doctorsWithContractAndRecipe++;
      if (hasRecipeGroup) doctorsWithRecipeGroup++;
      if (!hasContract && (doc.visitCount > 0 || doc.bonusAmount > 0)) nonContractDoctors++;
      if (doc.visitCount > 0 && doc.bonusAmount === 0) visitsWithoutBonuses++;
      if (doc.bonusAmount > 0 && doc.visitCount === 0) bonusesWithoutVisits++;
      if (hasContract && contractItems.length > 0) {
        const match = getContractVsRecipeMatch(contractItems, recipeItems);
        if (match.length > 0) {
          itemsComplianceSum += (match.filter(m => m.hasPrescribed).length / match.length) * 100;
          itemsComplianceCount++;
        }
      }
    });

    const contractsCountVal = base.contractDoctorsPerEmp.get(empBase.id)?.size ?? 0;
    return {
      ...empBase,
      doctors: filteredDoctors,
      totalVisits: empVisits, totalBonuses: empBonuses,
      activeDoctorsCount: doctorsWithBonus, visitedDoctorsCount: visitedDoctors,
      contractsCount: contractsCountVal, fullCycleCount: fullCycle,
      contractWithoutRecipesCount: contractNoRecipe, nonContractDoctorsCount: nonContractDoctors,
      visitsWithoutBonusesCount: visitsWithoutBonuses, bonusesWithoutVisitsCount: bonusesWithoutVisits,
      doctorsWithRecipeGroupCount: doctorsWithRecipeGroup,
      potentialDoctorsCount: base.potentialByEmp.get(empBase.id) ?? 0,
      contractDoctorsPrescribedRate: contractsCountVal > 0 ? (doctorsWithContractAndRecipe / contractsCountVal) * 100 : 0,
      contractItemsComplianceRate: itemsComplianceCount > 0 ? itemsComplianceSum / itemsComplianceCount : 0,
      costPerVisit: empVisits > 0 ? empBonuses / empVisits : 0,
      conversionRate: visitedDoctors > 0 ? (doctorsWithBonus / visitedDoctors) * 100 : 0,
      zeroResultVisits, wastedEffortDoctors: wastedDoctors,
    };
  })
  .filter(e => e.doctors.size > 0)
  .sort((a, b) => b.totalBonuses - a.totalBonuses);

  const mpOnly = employeeStats.filter(e => (e as any).role !== 'Менеджер');
  const globalConversion = mpOnly.length > 0
    ? mpOnly.reduce((acc, e) => acc + e.conversionRate, 0) / mpOnly.length
    : employeeStats.reduce((acc, e) => acc + e.conversionRate, 0) / (employeeStats.length || 1);
  return { employeeStats, totalVisits, totalBonuses, globalConversion };
};
