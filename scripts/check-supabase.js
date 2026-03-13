/**
 * Диагностика Supabase: проверка подключения и размера данных.
 * Запуск: node scripts/check-supabase.js
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// Загрузить .env.local
const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, '../.env.local');
if (existsSync(envPath)) {
  const env = readFileSync(envPath, 'utf8');
  for (const line of env.split('\n')) {
    const m = line.match(/^\s*([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim();
  }
}

const url = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').trim();
const key = (process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '').trim();

console.log('=== Проверка Supabase ===\n');
console.log('URL:', url ? `${url.slice(0, 40)}...` : '(не задан)');
console.log('Key:', key ? `${key.slice(0, 20)}... (длина ${key.length})` : '(не задан)');

if (!url || !key) {
  console.error('\nОшибка: задайте VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY');
  process.exit(1);
}

// Проверка формата ключа
if (key.startsWith('sb_publishable_')) {
  console.log('Ключ: новый формат sb_publishable_');
} else if (key.startsWith('eyJ')) {
  console.log('Ключ: JWT формат');
} else {
  console.warn('Ключ: нестандартный формат');
}

async function withTimeout(promise, ms, msg) {
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`Таймаут ${ms}с: ${msg}`)), ms)
  );
  return Promise.race([promise, timeout]);
}

async function check() {
  try {
    // 1. Проверка доступности Supabase (30 сек — проект может просыпаться)
    console.log('\nПроверка доступности (до 30 сек)...');
    let healthRes;
    try {
      const ctrl = new AbortController();
      setTimeout(() => ctrl.abort(), 30000);
      healthRes = await fetch(`${url}/rest/v1/`, {
        method: 'HEAD',
        headers: { 'apikey': key },
        signal: ctrl.signal,
      });
    } catch (e) {
      console.error('Supabase недоступен:', e.message);
      if (/aborted|timeout/i.test(e.message)) {
        console.log('\nВозможные причины: проект на паузе (free tier), сеть, firewall.');
      }
      process.exit(1);
    }
    if (!healthRes.ok) {
      console.error('Ошибка HTTP:', healthRes.status, healthRes.statusText);
      process.exit(1);
    }
    console.log('Supabase доступен.');

    // 2. REST-запрос — только sheet_name
    const restUrl = `${url}/rest/v1/app_data?select=sheet_name`;
    console.log('Запрос app_data...');
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    const res = await fetch(restUrl, {
      headers: {
        'apikey': key,
        'Authorization': `Bearer ${key}`,
        'Accept': 'application/json',
      },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      const text = await res.text();
      console.error('\nОшибка HTTP:', res.status, res.statusText);
      console.error(text.slice(0, 500));
      process.exit(1);
    }

    const list = await res.json();
    console.log('Подключение: OK');
    console.log('Листы:', list?.map(r => r.sheet_name).join(', ') || '(пусто)');

    if (!list || list.length === 0) {
      console.log('\nТаблица app_data пуста.');
      return;
    }

    // 2. Загрузить данные с таймаутом
    console.log('\nЗагрузка полных данных (макс. 20 сек)...');
    const supabase = createClient(url, key);
    const { data: rows, error } = await withTimeout(
      supabase.from('app_data').select('sheet_name, data'),
      20000,
      'ответ слишком большой'
    );

    if (error) {
      console.error('\nОшибка загрузки данных:', error.message);
      process.exit(1);
    }

    console.log('\nРазмер данных:');
    let totalSize = 0;
    for (const row of rows || []) {
      const size = row.data ? JSON.stringify(row.data).length : 0;
      const rowsCount = Array.isArray(row.data) ? row.data.length : 0;
      const sizeMB = (size / 1024 / 1024).toFixed(2);
      console.log(`  ${row.sheet_name}: ${rowsCount} строк, ~${sizeMB} MB`);
      totalSize += size;
    }
    console.log(`\nОбщий размер: ~${(totalSize / 1024 / 1024).toFixed(2)} MB`);

    if (totalSize > 5 * 1024 * 1024) {
      console.log('\nВнимание: данные >5 MB. Загрузка в приложении может тормозить или падать.');
    }
  } catch (e) {
    console.error('\nИсключение:', e.message);
    process.exit(1);
  }
}

check();
