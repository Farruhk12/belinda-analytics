import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { EmployeeCoverageAssignment, GenericRow, PlannedConnection, StaffRecord, VisitData } from '../types';
import { COLUMN_MATCHERS } from '../constants';

const TABLE_NAME = 'app_data';           // малые данные: staff, aliases, meta
const ROWS_TABLE = 'app_sheet_rows';     // большие данные: visits, bonuses, contracts, recipes
const STAFF_SHEET = 'staff';
const ALIASES_SHEET = 'employee_aliases';
const DUPLICATE_IGNORES_SHEET = 'employee_duplicate_ignores';
const UPLOAD_META_SHEET = 'upload_meta';
const DOCTOR_ALIASES_SHEET = 'doctor_aliases';
const DOCTOR_DUPLICATE_IGNORES_SHEET = 'doctor_duplicate_ignores';
const EMPLOYEE_COVERAGE_ASSIGNMENTS_SHEET = 'employee_coverage_assignments';

export type SheetKey = 'visits' | 'bonuses' | 'contracts' | 'recipes' | 'doctors';

/** Алиасы: нормализованный ключ (from) → каноническое отображаемое имя (to) */
export type EmployeeAliases = Record<string, string>;

export type DoctorAliases = Record<string, string>;
export type EmployeeCoverageAssignmentsMap = Record<string, EmployeeCoverageAssignment[]>;

/** Получить значение из строки по матчерам колонок (приоритет матчеров: сначала точное совпадение) */
function findValueInRow(row: GenericRow, matchers: string[]): string {
  const keys = Object.keys(row);
  for (const m of matchers) {
    const exact = keys.find(k => k.toLowerCase() === m);
    if (exact) return String(row[exact] ?? '').trim();
  }
  const key = keys.find(k => matchers.some(m => String(k).toLowerCase().includes(m)));
  return key ? String(row[key] ?? '').trim() : '';
}

/** Нормализация ключа для сопоставления (пробелы, регистр) */
function normalizeKey(s: string): string {
  return String(s || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

/** Найти ключ колонки МП в строке */
function findEmployeeColumnKey(row: GenericRow): string | null {
  const keys = Object.keys(row);
  for (const m of COLUMN_MATCHERS.EMPLOYEE) {
    const exact = keys.find(k => k.toLowerCase() === m);
    if (exact) return exact;
  }
  const key = keys.find(k => COLUMN_MATCHERS.EMPLOYEE.some(m => String(k).toLowerCase().includes(m)));
  return key ?? null;
}

/** Загрузить алиасы сотрудников (объединённые дубликаты) из Supabase. */
export async function loadEmployeeAliases(): Promise<EmployeeAliases> {
  if (!supabase) return {};
  try {
    const { data, error } = await withTimeout(
      supabase.from(TABLE_NAME).select('data').eq('sheet_name', ALIASES_SHEET).maybeSingle(),
      QUERY_TIMEOUT_MS, 'loadEmployeeAliases'
    );
    if (error || !data?.data) return {};
    const arr = Array.isArray(data.data) ? data.data : [];
    const result: EmployeeAliases = {};
    for (const item of arr) {
      const from = String(item?.from ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
      const to = String(item?.to ?? '').trim();
      if (from && to) result[from] = to;
    }
    return result;
  } catch { return {}; }
}

/** Сохранить алиасы сотрудников в Supabase. */
export async function saveEmployeeAliases(aliases: EmployeeAliases): Promise<void> {
  if (!supabase) throw new Error('Supabase не настроен');
  const arr = Object.entries(aliases).map(([from, to]) => ({ from, to }));
  const { error } = await supabase.from(TABLE_NAME).upsert(
    [{ sheet_name: ALIASES_SHEET, data: arr }],
    { onConflict: 'sheet_name' }
  );
  if (error) throw new Error(error.message);
}

/** Загрузить пары «это разные люди» (игнорируемые дубликаты) из Supabase. */
export async function loadEmployeeDuplicateIgnores(): Promise<Set<string>> {
  if (!supabase) return new Set();
  const { data, error } = await supabase
    .from(TABLE_NAME)
    .select('data')
    .eq('sheet_name', DUPLICATE_IGNORES_SHEET)
    .maybeSingle();
  if (error || !data?.data) return new Set();
  const arr = Array.isArray(data.data) ? data.data : [];
  const result = new Set<string>();
  for (const item of arr) {
    const key = String(item?.pair ?? '').trim();
    if (key) result.add(key);
  }
  return result;
}

/** Сохранить игнорируемые пары дубликатов в Supabase. */
export async function saveEmployeeDuplicateIgnores(ignores: Set<string>): Promise<void> {
  if (!supabase) throw new Error('Supabase не настроен');
  const arr = Array.from(ignores).map(pair => ({ pair }));
  const { error } = await supabase.from(TABLE_NAME).upsert(
    [{ sheet_name: DUPLICATE_IGNORES_SHEET, data: arr }],
    { onConflict: 'sheet_name' }
  );
  if (error) throw new Error(error.message);
}

export async function loadEmployeeCoverageAssignments(): Promise<EmployeeCoverageAssignmentsMap> {
  if (!supabase) return {};
  try {
    const { data, error } = await withTimeout(
      supabase.from(TABLE_NAME).select('data').eq('sheet_name', EMPLOYEE_COVERAGE_ASSIGNMENTS_SHEET).maybeSingle(),
      QUERY_TIMEOUT_MS,
      'loadEmployeeCoverageAssignments'
    );
    if (error || !data?.data || typeof data.data !== 'object') return {};

    const rawMap = data.data as Record<string, unknown>;
    const result: EmployeeCoverageAssignmentsMap = {};

    for (const [employeeId, rawAssignments] of Object.entries(rawMap)) {
      if (!Array.isArray(rawAssignments)) continue;

      result[employeeId] = rawAssignments
        .map((item): EmployeeCoverageAssignment | null => {
          if (!item || typeof item !== 'object') return null;
          const institution = String((item as { institution?: unknown }).institution ?? '').trim();
          const specialtiesRaw = (item as { specialties?: unknown }).specialties;
          const specialties = Array.isArray(specialtiesRaw)
            ? specialtiesRaw.map((value) => String(value ?? '').trim()).filter(Boolean)
            : [];

          if (!institution || specialties.length === 0) return null;
          return { institution, specialties };
        })
        .filter((item): item is EmployeeCoverageAssignment => !!item);
    }

    return result;
  } catch {
    return {};
  }
}

export async function saveEmployeeCoverageAssignments(assignmentsMap: EmployeeCoverageAssignmentsMap): Promise<void> {
  if (!supabase) throw new Error('Supabase не настроен');
  const { error } = await supabase.from(TABLE_NAME).upsert(
    [{ sheet_name: EMPLOYEE_COVERAGE_ASSIGNMENTS_SHEET, data: assignmentsMap }],
    { onConflict: 'sheet_name' }
  );
  if (error) throw new Error(error.message);
}

const PLANNED_CONNECTIONS_SHEET = 'planned_connections';

export async function loadPlannedConnections(): Promise<PlannedConnection[]> {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from(TABLE_NAME)
      .select('data')
      .eq('sheet_name', PLANNED_CONNECTIONS_SHEET)
      .maybeSingle();
    if (error || !data?.data) return [];
    const arr = Array.isArray(data.data) ? data.data : [];
    return arr.filter((item): item is PlannedConnection =>
      !!item && typeof item === 'object' && typeof (item as PlannedConnection).id === 'string'
    );
  } catch { return []; }
}

export async function savePlannedConnections(connections: PlannedConnection[]): Promise<void> {
  if (!supabase) throw new Error('Supabase не настроен');
  const { error } = await supabase.from(TABLE_NAME).upsert(
    [{ sheet_name: PLANNED_CONNECTIONS_SHEET, data: connections }],
    { onConflict: 'sheet_name' }
  );
  if (error) throw new Error(error.message);
}

/** Применить алиасы к строкам: заменить имя МП на каноническое, если есть алиас. */
export function applyAliasesToRows(rows: GenericRow[], aliases: EmployeeAliases): void {
  if (Object.keys(aliases).length === 0) return;
  for (const row of rows) {
    const colKey = findEmployeeColumnKey(row);
    if (!colKey) continue;
    const val = String(row[colKey] ?? '').trim();
    if (!val) continue;
    const norm = normalizeKey(val);
    const canonical = aliases[norm];
    if (canonical) row[colKey] = canonical;
  }
}

/** Собрать уникальных МП из всех листов (Визиты, УВК, Договор, Рецепты).
 *  Для каждого МП объединяем поля из всех источников — так группа товара
 *  из листа Договор попадает в запись сотрудника, даже если Визиты её не содержат. */
function getEmployeesFromAllSheets(
  visits: GenericRow[],
  bonuses: GenericRow[],
  contracts: GenericRow[],
  recipes: GenericRow[]
): GenericRow[] {
  const byEmployee = new Map<string, GenericRow>();
  const sources = [visits, bonuses, contracts, recipes];

  for (const rows of sources) {
    for (const row of rows) {
      const name = findValueInRow(row, COLUMN_MATCHERS.EMPLOYEE);
      if (!name) continue;
      const key = normalizeKey(name);
      if (!byEmployee.has(key)) {
        byEmployee.set(key, { ...row });
      } else {
        // Дополняем существующую запись полями из текущей строки,
        // если поле ещё пустое (например, группа из листа Договор)
        const existing = byEmployee.get(key)!;
        for (const [col, val] of Object.entries(row)) {
          if (existing[col] === undefined || existing[col] === '' || existing[col] === null) {
            existing[col] = val;
          }
        }
      }
    }
  }
  return Array.from(byEmployee.values());
}

/** Загрузить метаданные сотрудников (группа, область, роль) из Supabase. */
export async function loadStaffFromSupabase(): Promise<StaffRecord[]> {
  if (!supabase) return [];
  try {
    const { data, error } = await withTimeout(
      supabase.from(TABLE_NAME).select('data').eq('sheet_name', STAFF_SHEET).maybeSingle(),
      QUERY_TIMEOUT_MS, 'loadStaff'
    ) as { data: { data?: unknown } | null; error: unknown };
    if (error || !data?.data) return [];
    const rows = Array.isArray(data.data) ? data.data : [];
    return rows.map((r: Record<string, unknown>) => ({
      ...r,
      isActive: r.isActive !== false,
    })) as StaffRecord[];
  } catch { return []; }
}

/** Сохранить метаданные сотрудников в Supabase. */
export async function saveStaffToSupabase(staff: StaffRecord[]): Promise<void> {
  if (!supabase) throw new Error('Supabase не настроен');
  const { error } = await supabase.from(TABLE_NAME).upsert(
    [{ sheet_name: STAFF_SHEET, data: staff }],
    { onConflict: 'sheet_name' }
  );
  if (error) throw new Error(error.message);
}

/** Применить метаданные staff к employees (перезаписать group, region, role). */
export function applyStaffToEmployees(
  employees: GenericRow[],
  staff: StaffRecord[]
): GenericRow[] {
  const staffByKey = new Map(staff.map(s => [normalizeKey(s.name), s]));
  return employees.map(emp => {
    const name = findValueInRow(emp, COLUMN_MATCHERS.EMPLOYEE);
    if (!name) return emp;
    const override = staffByKey.get(normalizeKey(name));
    if (!override) return emp;
    const out = { ...emp };
    const regionKey = Object.keys(emp).find(k => COLUMN_MATCHERS.REGION.some(m => String(k).toLowerCase().includes(m)));
    const groupKey = Object.keys(emp).find(k => COLUMN_MATCHERS.GROUP.some(m => String(k).toLowerCase().includes(m)));
    if (regionKey) out[regionKey] = override.region;
    else out['Область'] = override.region;
    if (groupKey) out[groupKey] = override.group;
    else out['Группа'] = override.group;
    out['Роль'] = override.role;
    return out;
  });
}

/** Режимы загрузки Excel-данных */
export type UploadMode = 'replace' | 'add' | 'merge';

/**
 * Построить уникальный ключ для строки в зависимости от типа листа.
 * Ключ используется для сопоставления «та же строка» при merge/add.
 *
 * Визиты:   МП + Врач + Дата
 * Бонусы:   МП + Врач + Дата
 * Договор:  МП + Врач + Номенклатура (первые 3 поля, не связанные с матчерами — берём все EMPLOYEE+DOCTOR+любое третье)
 * Рецепты:  Врач + Группа + Дата
 */
function buildRowKey(row: GenericRow, sheetKey: SheetKey): string {
  const emp  = normalizeKey(findValueInRow(row, COLUMN_MATCHERS.EMPLOYEE));
  const doc  = normalizeKey(findValueInRow(row, COLUMN_MATCHERS.DOCTOR));
  const date = normalizeKey(findValueInRow(row, COLUMN_MATCHERS.DATE));
  const grp  = normalizeKey(findValueInRow(row, COLUMN_MATCHERS.GROUP));

  // Для договора берём номенклатуру/продукт (первый ключ, не совпадающий с матчерами).
  let extra = '';
  if (sheetKey === 'contracts') {
    const knownMatchers = [
      ...COLUMN_MATCHERS.EMPLOYEE,
      ...COLUMN_MATCHERS.DOCTOR,
      ...COLUMN_MATCHERS.REGION,
      ...COLUMN_MATCHERS.GROUP,
      ...COLUMN_MATCHERS.DATE,
    ].map(m => m.toLowerCase());
    const nomKey = Object.keys(row).find(k => {
      const kl = k.toLowerCase();
      return !knownMatchers.some(m => kl.includes(m));
    });
    extra = nomKey ? normalizeKey(String(row[nomKey] ?? '')) : '';
  }

  switch (sheetKey) {
    case 'visits':
    case 'bonuses':
      return `${emp}|${doc}|${date}`;
    case 'contracts':
      return `${emp}|${doc}|${extra}`;
    case 'recipes':
      return `${doc}|${grp}|${date}`;
    case 'doctors': {
      // Используем Арт 26 как уникальный ID, если он есть
      const artId = String(row['Арт 26'] || '').trim();
      if (artId) return artId;
      // Иначе ФИО + ЛПУ
      return `${normalizeKey(findValueInRow(row, ['ф.и.о', 'фио']))}|${normalizeKey(findValueInRow(row, ['название лпу', 'лпу']))}`;
    }
    default:
      return JSON.stringify(row);
  }
}

/** Применить режим merge к текущим и новым строкам, вернуть итоговый массив. */
function mergeRows(current: GenericRow[], incoming: GenericRow[], sheetKey: SheetKey, mode: UploadMode): GenericRow[] {
  if (mode === 'replace') return incoming;

  const currentMap = new Map<string, GenericRow>();
  current.forEach(row => {
    const k = buildRowKey(row, sheetKey);
    if (k) currentMap.set(k, row);
  });

  if (mode === 'add') {
    // Только добавляем строки с новыми ключами, существующие не трогаем
    const result = [...current];
    for (const row of incoming) {
      const k = buildRowKey(row, sheetKey);
      if (!currentMap.has(k)) {
        result.push(row);
        currentMap.set(k, row); // защита от дублей внутри файла
      }
    }
    return result;
  }

  // mode === 'merge': добавляем новые, обновляем изменённые
  const incomingMap = new Map<string, GenericRow>();
  for (const row of incoming) {
    const k = buildRowKey(row, sheetKey);
    if (k) incomingMap.set(k, row);
  }

  const result: GenericRow[] = [];
  // Существующие строки: обновляем если есть в incoming, иначе оставляем
  for (const [k, row] of currentMap) {
    result.push(incomingMap.has(k) ? incomingMap.get(k)! : row);
  }
  // Добавляем строки из incoming, которых не было в current
  for (const [k, row] of incomingMap) {
    if (!currentMap.has(k)) result.push(row);
  }
  return result;
}

/** Сохранить данные листа в Supabase: удалить старые строки, залить новые батчами. */
export async function saveSheetToSupabase(sheetKey: SheetKey, rows: GenericRow[]): Promise<void> {
  if (!supabase) throw new Error('Supabase не настроен. Добавьте VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY в .env.local');

  // 1. Удаляем все существующие строки этого листа
  const { error: delError } = await supabase
    .from(ROWS_TABLE)
    .delete()
    .eq('sheet_name', sheetKey);
  if (delError) throw new Error(`Ошибка удаления старых данных: ${delError.message}`);

  if (rows.length === 0) return;

  // 2. Вставляем новые строки батчами по 500
  const BATCH_SIZE = 500;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE).map(row_data => ({
      sheet_name: sheetKey,
      row_data,
    }));
    const { error: insError } = await supabase.from(ROWS_TABLE).insert(batch);
    if (insError) throw new Error(`Ошибка записи батча ${i / BATCH_SIZE + 1}: ${insError.message}`);
  }
}

const QUERY_TIMEOUT_MS = 90000;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function withTimeout<T>(promise: PromiseLike<T> | Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout (${ms}ms): ${label}`)), ms);
    Promise.resolve(promise).then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); }
    );
  });
}

const PAGE_SIZE = 1000;

/** Загрузить один лист из Supabase: сначала узнаём кол-во строк,
 *  затем грузим все страницы параллельно (Promise.all). */
export async function loadSheetFromSupabase(sheetKey: SheetKey): Promise<GenericRow[]> {
  if (!supabase) return [];

  // 1. Загружаем ПЕРВУЮ страницу и общее количество строк одним запросом
  // Это экономит один сетевой запрос (round-trip)
  let firstPage: { row_data: GenericRow }[] | null = null;
  let totalCount: number | null = null;

  try {
    const res = await withTimeout(
      supabase
        .from(ROWS_TABLE)
        .select('row_data', { count: 'exact' })
        .eq('sheet_name', sheetKey)
        .order('id')
        .range(0, PAGE_SIZE - 1),
      QUERY_TIMEOUT_MS,
      `loadFirstPage(${sheetKey})`
    ) as { data: { row_data: GenericRow }[] | null; count: number | null; error: any };

    if (res.error || !res.data) {
      return await loadSheetLegacy(sheetKey);
    }
    firstPage = res.data;
    totalCount = res.count;
  } catch {
    return await loadSheetLegacy(sheetKey);
  }

  if (totalCount === null || totalCount === 0) {
    return await loadSheetLegacy(sheetKey);
  }

  const initialData = firstPage.map(r => r.row_data);
  if (totalCount <= PAGE_SIZE) {
    return initialData;
  }

  // 2. Загружаем остальные страницы параллельно
  const pageCount = Math.ceil(totalCount / PAGE_SIZE);
  const pagePromises = Array.from({ length: pageCount - 1 }, (_, i) => {
    const pageIdx = i + 1;
    const from = pageIdx * PAGE_SIZE;
    return withTimeout(
      supabase
        .from(ROWS_TABLE)
        .select('row_data')
        .eq('sheet_name', sheetKey)
        .order('id')
        .range(from, from + PAGE_SIZE - 1),
      QUERY_TIMEOUT_MS,
      `loadSheet(${sheetKey}) page ${pageIdx + 1}/${pageCount}`
    ).then((res) => {
      const { data, error } = res as { data: { row_data: GenericRow }[] | null; error: unknown };
      if (error || !data) return [] as GenericRow[];
      return data.map(r => r.row_data);
    }).catch(() => [] as GenericRow[]);
  });

  const otherPages = await Promise.all(pagePromises);
  return [...initialData, ...otherPages.flat()];
}

/** Резервная загрузка из старой таблицы app_data (обратная совместимость). */
async function loadSheetLegacy(sheetKey: SheetKey): Promise<GenericRow[]> {
  if (!supabase) return [];
  try {
    const { data } = await withTimeout(
      supabase.from(TABLE_NAME).select('data').eq('sheet_name', sheetKey).maybeSingle(),
      QUERY_TIMEOUT_MS, `loadSheet_legacy(${sheetKey})`
    ) as { data: { data?: unknown } | null };
    if (data?.data && Array.isArray(data.data)) return data.data as GenericRow[];
  } catch { /* игнорируем */ }
  return [];
}

type FetchResult = {
  visitsData: VisitData;
  bonusesData: GenericRow[];
  contractsData: GenericRow[];
  recipesData: GenericRow[];
  doctorsData: GenericRow[];
};

/** Загрузить все данные из Supabase в два этапа.
 *  Этап 1: визиты + бонусы + алиасы + staff → onCoreReady(базовые данные).
 *  Этап 2: договоры + рецепты → полные данные (return). */
export async function fetchAllDataFromSupabase(
  onCoreReady?: (data: FetchResult) => void
): Promise<FetchResult> {
  if (!supabase) {
    const empty: FetchResult = {
      visitsData: { visits: [], employees: [], allEmployees: [], fixation: [], managers: [] },
      bonusesData: [],
      contractsData: [],
      recipesData: [],
      doctorsData: [],
    };
    return empty;
  }

  // Запускаем ВСЕ запросы параллельно сразу, чтобы не создавать "водопад"
  const promises = {
    visits: loadSheetFromSupabase('visits'),
    bonuses: loadSheetFromSupabase('bonuses'),
    contracts: loadSheetFromSupabase('contracts'),
    recipes: loadSheetFromSupabase('recipes'),
    aliases: loadEmployeeAliases(),
    doctors: loadSheetFromSupabase('doctors'),
    staff: loadStaffFromSupabase(),
    docAliases: loadDoctorAliases(),
  };

  // Ждем только "ядро" для первого этапа
  const [visits, bonuses, aliases, rawStaff, doctorAliases] = await Promise.all([
    promises.visits, promises.bonuses, promises.aliases, promises.staff, promises.docAliases
  ]);

  applyAliasesToRows(visits, aliases);
  applyAliasesToRows(bonuses, aliases);
  applyDoctorAliasesToRows(visits, doctorAliases);
  applyDoctorAliasesToRows(bonuses, doctorAliases);

  // Обратная совместимость: если 'visits' пуст, пробуем загрузить 'uvk' (старый ключ)
  let visitsData = visits;
  if (visitsData.length === 0) {
    try {
      // Сначала ищем в новой таблице строк
      const { data: rowsData } = await supabase
        .from(ROWS_TABLE).select('row_data').eq('sheet_name', 'uvk').order('id');
      if (rowsData && rowsData.length > 0) {
        visitsData = rowsData.map((r: { row_data: GenericRow }) => r.row_data);
      } else {
        // Затем в старой
        const { data } = await supabase.from(TABLE_NAME).select('data').eq('sheet_name', 'uvk').maybeSingle();
        visitsData = (data?.data && Array.isArray(data.data) ? data.data : []) as GenericRow[];
      }
    } catch { /* игнорируем */ }
  }

  const aliasFromKeys = new Set(Object.keys(aliases));
  const staff = rawStaff.filter(s => !aliasFromKeys.has(normalizeKey(s.name)));

  const buildEmployees = (cData: GenericRow[], rData: GenericRow[]) => {
    let employees = getEmployeesFromAllSheets(visitsData, bonuses, cData, rData);
    if (staff.length > 0) {
      employees = applyStaffToEmployees(employees, staff);
      const inactiveIds = new Set(staff.filter(s => !s.isActive).map(s => normalizeKey(s.name)));
      employees = employees.filter(emp => {
        const name = findValueInRow(emp, COLUMN_MATCHERS.EMPLOYEE);
        return !inactiveIds.has(normalizeKey(name));
      });
    }
    return employees;
  };

  // Этап 1 готов — отправляем базовые данные (визиты + бонусы)
  if (onCoreReady) {
    const coreEmployees = buildEmployees([], []);
    onCoreReady({
      visitsData: { visits: visitsData, employees: coreEmployees, allEmployees: coreEmployees, fixation: [], managers: [] },
      bonusesData: bonuses,
      contractsData: [],
      recipesData: [],
      doctorsData: [],
    });
  }

  // ── Этап 2: договоры + рецепты ──
  // Эти промисы уже запущены, просто дожидаемся их
  const [contracts, recipes, doctors] = await Promise.all([promises.contracts, promises.recipes, promises.doctors]);

  applyAliasesToRows(contracts, aliases);
  applyAliasesToRows(recipes, aliases);
  applyDoctorAliasesToRows(contracts, doctorAliases);
  applyDoctorAliasesToRows(recipes, doctorAliases);

  const fullEmployees = buildEmployees(contracts, recipes);
  return {
    visitsData: { visits: visitsData, employees: fullEmployees, allEmployees: fullEmployees, fixation: [], managers: [] },
    bonusesData: bonuses,
    contractsData: contracts,
    recipesData: recipes,
    doctorsData: doctors,
  };
}

/**
 * Загрузить листы из Excel в Supabase.
 * @param parsed   Распознанные листы из Excel
 * @param mode     Режим загрузки: 'replace' | 'add' | 'merge'
 */
export async function uploadExcelToSupabase(
  parsed: Record<string, GenericRow[]>,
  mode: UploadMode = 'replace'
): Promise<{ sheetKey: SheetKey; added: number; updated: number; total: number }[]> {
  if (!isSupabaseConfigured()) throw new Error('Supabase не настроен');

  const sheetKeys: SheetKey[] = ['visits', 'bonuses', 'contracts', 'recipes', 'doctors'];
  const toUpload = sheetKeys.filter((key) => key in parsed);
  if (toUpload.length === 0) {
    throw new Error(
      'В файле нет распознанных листов. Имена листов должны быть точно: Визиты, Договор, Рецепты, УВК или База врачей.'
    );
  }

  const results: { sheetKey: SheetKey; added: number; updated: number; total: number }[] = [];

  for (const key of toUpload) {
    const incoming = parsed[key];
    let finalRows: GenericRow[];
    let added = 0;
    let updated = 0;

    if (mode === 'replace') {
      finalRows = incoming;
      added = incoming.length;
    } else {
      // Нужно загрузить текущие данные для merge
      const current = await loadSheetFromSupabase(key);
      const currentMap = new Map<string, GenericRow>();
      current.forEach(row => {
        const k = buildRowKey(row, key);
        if (k) currentMap.set(k, row);
      });

      finalRows = mergeRows(current, incoming, key, mode);

      // Считаем статистику
      for (const row of incoming) {
        const k = buildRowKey(row, key);
        if (!currentMap.has(k)) added++;
        else {
          const curStr = JSON.stringify(currentMap.get(k));
          const newStr = JSON.stringify(row);
          if (curStr !== newStr) updated++;
        }
      }
    }

    await saveSheetToSupabase(key, finalRows);
    results.push({ sheetKey: key, added, updated, total: finalRows.length });
  }

  return results;
}

/** Найти ключ колонки Врача в строке */
function findDoctorColumnKey(row: GenericRow): string | null {
  const keys = Object.keys(row);
  for (const m of COLUMN_MATCHERS.DOCTOR) {
    const exact = keys.find(k => k.toLowerCase() === m);
    if (exact) return exact;
  }
  const key = keys.find(k => COLUMN_MATCHERS.DOCTOR.some(m => String(k).toLowerCase().includes(m)));
  return key ?? null;
}

/** Загрузить алиасы врачей из Supabase. */
export async function loadDoctorAliases(): Promise<DoctorAliases> {
  if (!supabase) return {};
  try {
    const { data, error } = await withTimeout(
      supabase.from(TABLE_NAME).select('data').eq('sheet_name', DOCTOR_ALIASES_SHEET).maybeSingle(),
      QUERY_TIMEOUT_MS, 'loadDoctorAliases'
    );
    if (error || !data?.data) return {};
    const arr = Array.isArray(data.data) ? data.data : [];
    const result: DoctorAliases = {};
    for (const item of arr) {
      const from = String(item?.from ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
      const to = String(item?.to ?? '').trim();
      if (from && to) result[from] = to;
    }
    return result;
  } catch { return {}; }
}

/** Сохранить алиасы врачей в Supabase. */
export async function saveDoctorAliases(aliases: DoctorAliases): Promise<void> {
  if (!supabase) throw new Error('Supabase не настроен');
  const arr = Object.entries(aliases).map(([from, to]) => ({ from, to }));
  const { error } = await supabase.from(TABLE_NAME).upsert(
    [{ sheet_name: DOCTOR_ALIASES_SHEET, data: arr }],
    { onConflict: 'sheet_name' }
  );
  if (error) throw new Error(error.message);
}

/** Загрузить игнорируемые пары дубликатов врачей. */
export async function loadDoctorDuplicateIgnores(): Promise<Set<string>> {
  if (!supabase) return new Set();
  const { data } = await supabase
    .from(TABLE_NAME)
    .select('data')
    .eq('sheet_name', DOCTOR_DUPLICATE_IGNORES_SHEET)
    .maybeSingle();
  if (!data?.data) return new Set();
  const arr = Array.isArray(data.data) ? data.data : [];
  const result = new Set<string>();
  for (const item of arr) {
    const key = String(item?.pair ?? '').trim();
    if (key) result.add(key);
  }
  return result;
}

/** Сохранить игнорируемые пары дубликатов врачей. */
export async function saveDoctorDuplicateIgnores(ignores: Set<string>): Promise<void> {
  if (!supabase) throw new Error('Supabase не настроен');
  const arr = Array.from(ignores).map(pair => ({ pair }));
  const { error } = await supabase.from(TABLE_NAME).upsert(
    [{ sheet_name: DOCTOR_DUPLICATE_IGNORES_SHEET, data: arr }],
    { onConflict: 'sheet_name' }
  );
  if (error) throw new Error(error.message);
}

/** Применить алиасы к строкам: заменить имя врача на каноническое, если есть алиас. */
export function applyDoctorAliasesToRows(rows: GenericRow[], aliases: DoctorAliases): void {
  if (Object.keys(aliases).length === 0) return;
  for (const row of rows) {
    const colKey = findDoctorColumnKey(row);
    if (!colKey) continue;
    const val = String(row[colKey] ?? '').trim();
    if (!val) continue;
    const norm = normalizeKey(val);
    const canonical = aliases[norm];
    if (canonical) row[colKey] = canonical;
  }
}

export type UploadMeta = Partial<Record<SheetKey, string>>;

/** Загрузить метаданные загрузок (дата последнего обновления по каждому листу). */
export async function loadUploadMeta(): Promise<UploadMeta> {
  if (!supabase) return {};
  const { data } = await supabase
    .from(TABLE_NAME)
    .select('data')
    .eq('sheet_name', UPLOAD_META_SHEET)
    .maybeSingle();
  if (!data?.data || typeof data.data !== 'object' || Array.isArray(data.data)) return {};
  return data.data as UploadMeta;
}

/** Сохранить дату последнего обновления для листа. */
export async function saveUploadTimestamp(sheetKey: SheetKey): Promise<void> {
  if (!supabase) return;
  const current = await loadUploadMeta();
  const updated = { ...current, [sheetKey]: new Date().toISOString() };
  await supabase.from(TABLE_NAME).upsert(
    [{ sheet_name: UPLOAD_META_SHEET, data: updated }],
    { onConflict: 'sheet_name' }
  );
}

const INSTITUTION_ALIASES_SHEET = 'institution_aliases';
const INSTITUTION_DUPLICATE_IGNORES_SHEET = 'institution_duplicate_ignores';

export type InstitutionAliases = Record<string, string>;

export async function loadInstitutionAliases(): Promise<InstitutionAliases> {
  if (!supabase) return {};
  try {
    const { data, error } = await withTimeout(
      supabase.from(TABLE_NAME).select('data').eq('sheet_name', INSTITUTION_ALIASES_SHEET).maybeSingle(),
      QUERY_TIMEOUT_MS, 'loadInstitutionAliases'
    );
    if (error || !data?.data) return {};
    const arr = Array.isArray(data.data) ? data.data : [];
    const result: InstitutionAliases = {};
    for (const item of arr) {
      const from = String(item?.from ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
      const to = String(item?.to ?? '').trim();
      if (from && to) result[from] = to;
    }
    return result;
  } catch { return {}; }
}

export async function saveInstitutionAliases(aliases: InstitutionAliases): Promise<void> {
  if (!supabase) throw new Error('Supabase не настроен');
  const arr = Object.entries(aliases).map(([from, to]) => ({ from, to }));
  const { error } = await supabase.from(TABLE_NAME).upsert(
    [{ sheet_name: INSTITUTION_ALIASES_SHEET, data: arr }],
    { onConflict: 'sheet_name' }
  );
  if (error) throw new Error(error.message);
}

export async function loadInstitutionDuplicateIgnores(): Promise<Set<string>> {
  if (!supabase) return new Set();
  try {
    const { data, error } = await withTimeout(
      supabase.from(TABLE_NAME).select('data').eq('sheet_name', INSTITUTION_DUPLICATE_IGNORES_SHEET).maybeSingle(),
      QUERY_TIMEOUT_MS, 'loadInstitutionDuplicateIgnores'
    );
    if (error || !data?.data) return new Set();
    const arr = Array.isArray(data.data) ? data.data : [];
    const result = new Set<string>();
    for (const item of arr) {
      const key = String(item?.pair ?? '').trim();
      if (key) result.add(key);
    }
    return result;
  } catch { return new Set(); }
}

export async function saveInstitutionDuplicateIgnores(ignores: Set<string>): Promise<void> {
  if (!supabase) throw new Error('Supabase не настроен');
  const arr = Array.from(ignores).map(pair => ({ pair }));
  const { error } = await supabase.from(TABLE_NAME).upsert(
    [{ sheet_name: INSTITUTION_DUPLICATE_IGNORES_SHEET, data: arr }],
    { onConflict: 'sheet_name' }
  );
  if (error) throw new Error(error.message);
}
