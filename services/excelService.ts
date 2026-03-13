import * as XLSX from 'xlsx';
import { GenericRow } from '../types';

/** Sheet names in Excel -> Supabase keys. */
export const EXCEL_SHEET_KEYS: Record<string, string> = {
  'Визиты': 'visits',
  'Договор': 'contracts',
  'Договора': 'contracts',
  'Договоры': 'contracts',
  'Рецепты': 'recipes',
  'Рецепт': 'recipes',
  'УВК': 'bonuses',
  'База врачей': 'doctors',
  'Врачи': 'doctors',
};

const DATE_COLUMN_MATCHERS = ['дата', 'date', 'число', 'время', 'отгрузки', 'выписки'];

function normalizeSheetName(name: string): string {
  return name.replace(/\uFEFF/g, '').trim().replace(/\s+/g, ' ');
}

function isDateColumn(key: string): boolean {
  const k = String(key).toLowerCase();
  return DATE_COLUMN_MATCHERS.some(m => k.includes(m));
}

/** Excel serial date -> YYYY-MM-DD */
function excelSerialToDateString(serial: number): string {
  if (serial < 1 || serial > 2958465) return String(serial);
  const date = new Date((serial - 25569) * 86400000);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function fixDateColumns(rows: GenericRow[]): void {
  if (rows.length === 0) return;
  const keys = Object.keys(rows[0]);
  for (const row of rows) {
    for (const key of keys) {
      if (!isDateColumn(key)) continue;
      const v = row[key];
      if (typeof v === 'number' && v >= 1 && v < 2958466) {
        row[key] = excelSerialToDateString(v);
      } else if (v instanceof Date) {
        const d = v;
        row[key] = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      }
    }
  }
}

/**
 * Reads an Excel file and returns parsed rows by sheet key.
 * The first row of each sheet is treated as headers.
 */
export function parseExcelFile(file: File): Promise<Record<string, GenericRow[]>> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        if (!data) {
          reject(new Error('Не удалось прочитать файл'));
          return;
        }
        const workbook = XLSX.read(data, { type: 'array', cellDates: true });
        const result: Record<string, GenericRow[]> = {};

        for (const rawName of workbook.SheetNames) {
          const sheetName = normalizeSheetName(rawName);
          const key = EXCEL_SHEET_KEYS[sheetName] ?? sheetName.toLowerCase().replace(/\s+/g, '_');
          const sheet = workbook.Sheets[rawName];
          const rows = XLSX.utils.sheet_to_json<GenericRow>(sheet, {
            raw: true,
            defval: '',
          });
          fixDateColumns(rows);
          result[key] = rows;
        }

        resolve(result);
      } catch (err) {
        reject(err instanceof Error ? err : new Error('Ошибка разбора Excel'));
      }
    };
    reader.onerror = () => reject(new Error('Ошибка чтения файла'));
    reader.readAsArrayBuffer(file);
  });
}

/** Export array of objects to Excel file (browser download). */
export function exportToExcel<T extends Record<string, unknown>>(
  data: T[],
  filename: string,
  sheetName = 'Данные'
): void {
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, `${filename}.xlsx`);
}

/** Compact list for UI without duplicates. */
export const DISPLAY_SHEET_NAMES = [
  'Визиты',
  'Договор',
  'Рецепты',
  'УВК',
  'База врачей',
];
