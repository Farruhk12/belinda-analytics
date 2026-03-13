import React, { useEffect, useMemo, useState } from 'react';
import {
  CalendarClock, CheckCircle2, FileDown, Loader2, MessageSquare, RefreshCw, Trash2, XCircle,
} from 'lucide-react';
import { EmployeeSummary, GenericRow, PlannedConnection } from '../types';
import { loadPlannedConnections, savePlannedConnections } from '../services/supabaseDataService';
import { exportToExcel } from '../services/excelService';
import { COLUMN_MATCHERS } from '../constants';
import { abbreviateLpuName, getValueByMatchers, normalizeLinkKey } from '../services/dataService';

type Outcome = 'connected' | 'not_connected' | null;

const OUTCOME_OPTIONS: { value: Outcome; label: string }[] = [
  { value: null,            label: 'Ожидает' },
  { value: 'connected',     label: 'Врач подключен' },
  { value: 'not_connected', label: 'Подключение не совершено' },
];

function formatDate(iso: string): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

function isOverdue(deadline: string, outcome: Outcome): boolean {
  if (outcome !== null) return false;
  return new Date(deadline) < new Date(new Date().toDateString());
}

// ── Outcome badge ─────────────────────────────────────────────────────────────

const OutcomeBadge: React.FC<{ outcome: Outcome; deadline: string }> = ({ outcome, deadline }) => {
  if (outcome === 'connected') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700 border border-emerald-200 whitespace-nowrap">
        <CheckCircle2 size={11} />
        Врач подключен
      </span>
    );
  }
  if (outcome === 'not_connected') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700 border border-red-200 whitespace-nowrap">
        <XCircle size={11} />
        Не совершено
      </span>
    );
  }
  if (isOverdue(deadline, outcome)) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700 border border-orange-200 whitespace-nowrap">
        <CalendarClock size={11} />
        Просрочено
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200 whitespace-nowrap">
      <CalendarClock size={11} />
      Ожидает
    </span>
  );
};

// ── Inline row editor ─────────────────────────────────────────────────────────

interface RowEditorProps {
  connection: PlannedConnection;
  onUpdate: (id: string, outcome: Outcome, comment: string) => Promise<void>;
}

const RowEditor: React.FC<RowEditorProps> = ({ connection, onUpdate }) => {
  const [outcome, setOutcome] = useState<Outcome>(connection.outcome);
  const [comment, setComment] = useState(connection.comment);
  const [saving, setSaving] = useState(false);
  const [editingComment, setEditingComment] = useState(false);

  const isDirty = outcome !== connection.outcome || comment !== connection.comment;

  const handleSave = async () => {
    if (!isDirty) return;
    setSaving(true);
    try {
      await onUpdate(connection.id, outcome, comment);
    } finally {
      setSaving(false);
      setEditingComment(false);
    }
  };

  const selectedLabel = OUTCOME_OPTIONS.find(o => (o.value ?? '') === (outcome ?? ''))?.label ?? '';

  return (
    <>
      <td className="px-3 py-3 align-top">
        <select
          value={outcome ?? ''}
          onChange={e => {
            const v = e.target.value;
            setOutcome(v === '' ? null : v as Outcome);
          }}
          title={selectedLabel}
          className="min-w-[180px] w-full px-2 py-1.5 border border-slate-200 rounded-lg text-xs font-medium text-slate-700 bg-white focus:ring-2 focus:ring-primary-500 focus:outline-none"
        >
          {OUTCOME_OPTIONS.map(o => (
            <option key={String(o.value)} value={o.value ?? ''}>
              {o.label}
            </option>
          ))}
        </select>
      </td>
      <td className="px-3 py-3">
        <div className="flex flex-col gap-1">
          {editingComment ? (
            <textarea
              value={comment}
              onChange={e => setComment(e.target.value)}
              onBlur={() => { if (!isDirty) setEditingComment(false); }}
              autoFocus
              rows={2}
              placeholder="Комментарий..."
              className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-xs resize-none focus:ring-2 focus:ring-primary-500 focus:outline-none"
            />
          ) : (
            <button
              onClick={() => setEditingComment(true)}
              className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600 text-left transition-colors"
            >
              <MessageSquare size={11} />
              {comment ? (
                <span className="text-slate-600 truncate max-w-[280px]">{comment}</span>
              ) : (
                <span>Добавить</span>
              )}
            </button>
          )}
          {isDirty && (
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center justify-center gap-1 px-2 py-1 bg-primary-500 text-white rounded text-xs font-medium hover:bg-primary-600 disabled:opacity-60 transition-colors"
            >
              {saving ? <Loader2 size={10} className="animate-spin" /> : null}
              Сохранить
            </button>
          )}
        </div>
      </td>
    </>
  );
};

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  employeeStats: EmployeeSummary[];
  doctorsData?: GenericRow[];
  isAdmin: boolean;
  canAccessRegion: (region: string) => boolean;
  canAccessGroup: (group: string) => boolean;
}

/** Обогатить подключение данными из базы врачей (ЛПУ Аб, Категория, Область) */
function enrichFromDoctors(conn: PlannedConnection, doctorsData: GenericRow[]): { institutionAbbr: string; category: string; region: string } {
  const docKey = normalizeLinkKey(conn.doctorName);
  const abKeys = ['аб', 'аббр', 'аббревиатура', 'лпу аб', 'сокр'];
  const catKeys = ['категория', 'категор', 'разряд'];
  let institutionAbbr = conn.institutionAbbr ?? '';
  let category = conn.category ?? '';
  let region = conn.region ?? '';
  for (const row of doctorsData) {
    const doctor = getValueByMatchers(row, COLUMN_MATCHERS.DOCTOR) ?? '';
    if (normalizeLinkKey(doctor) !== docKey) continue;
    if (!institutionAbbr) {
      for (const m of abKeys) {
        const key = Object.keys(row).find(k => k.toLowerCase().trim().includes(m));
        if (key) { const v = String(row[key] ?? '').trim(); if (v) { institutionAbbr = v; break; } }
      }
      if (!institutionAbbr) institutionAbbr = abbreviateLpuName(conn.institution);
    }
    if (!category) {
      for (const m of catKeys) {
        const key = Object.keys(row).find(k => k.toLowerCase().trim().includes(m));
        if (key) { const v = String(row[key] ?? '').trim(); if (v) { category = v; break; } }
      }
    }
    if (!region) region = getValueByMatchers(row, COLUMN_MATCHERS.REGION) ?? '';
    break;
  }
  return { institutionAbbr: institutionAbbr || '—', category: category || '—', region: region || '—' };
}

export const PlannedConnectionsPage: React.FC<Props> = ({
  employeeStats,
  doctorsData = [],
  isAdmin,
  canAccessRegion,
  canAccessGroup,
}) => {
  const [connections, setConnections] = useState<PlannedConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterMP, setFilterMP] = useState<string>('');
  const [filterOutcome, setFilterOutcome] = useState<string>('all');

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await loadPlannedConnections();
      setConnections(data.sort((a, b) => a.deadline.localeCompare(b.deadline)));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  // Для не-админов: показываем только подключения МП из доступных областей и групп
  const visibleConnections = useMemo(() => {
    if (isAdmin) return connections;
    const empMap = new Map(employeeStats.map(e => [e.id, e]));
    return connections.filter(c => {
      const emp = empMap.get(c.mpId);
      if (!emp) return false;
      return canAccessRegion(emp.region ?? '') && canAccessGroup(emp.group ?? '');
    });
  }, [connections, employeeStats, isAdmin, canAccessRegion, canAccessGroup]);

  const mpOptions = useMemo(
    () => Array.from(new Set(visibleConnections.map(c => c.mpName))).sort(),
    [visibleConnections]
  );

  const filtered = useMemo(() => {
    let list = visibleConnections;
    if (filterMP) list = list.filter(c => c.mpName === filterMP);
    if (filterOutcome === 'pending')       list = list.filter(c => c.outcome === null && !isOverdue(c.deadline, c.outcome));
    if (filterOutcome === 'overdue')       list = list.filter(c => isOverdue(c.deadline, c.outcome));
    if (filterOutcome === 'connected')     list = list.filter(c => c.outcome === 'connected');
    if (filterOutcome === 'not_connected') list = list.filter(c => c.outcome === 'not_connected');
    return list;
  }, [visibleConnections, filterMP, filterOutcome]);

  const counts = useMemo(() => ({
    pending:       visibleConnections.filter(c => c.outcome === null && !isOverdue(c.deadline, c.outcome)).length,
    overdue:       visibleConnections.filter(c => isOverdue(c.deadline, c.outcome)).length,
    connected:     visibleConnections.filter(c => c.outcome === 'connected').length,
    not_connected: visibleConnections.filter(c => c.outcome === 'not_connected').length,
  }), [visibleConnections]);

  const handleUpdate = async (id: string, outcome: Outcome, comment: string) => {
    const updated = connections.map(c =>
      c.id === id ? { ...c, outcome, comment } : c
    );
    await savePlannedConnections(updated);
    setConnections(updated);
  };

  const handleDelete = async (id: string) => {
    const updated = connections.filter(c => c.id !== id);
    await savePlannedConnections(updated);
    setConnections(updated);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-bold text-dark-DEFAULT">Планированные подключения</h2>
            <p className="text-sm text-slate-400 mt-0.5">Контроль подключения потенциальных врачей к базе МП</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                const rows = filtered.map((c, i) => {
                  const e = enrichFromDoctors(c, doctorsData);
                  return {
                    '#': i + 1,
                    'МП': c.mpName,
                    'Врач': c.doctorName,
                    'Спец': c.specialty,
                    'Учреждение (ЛПУ)': c.institution,
                    'ЛПУ Аб': e.institutionAbbr === '—' ? '' : e.institutionAbbr,
                    'Категория': e.category === '—' ? '' : e.category,
                    'Область': e.region === '—' ? '' : e.region,
                    'Продукты': c.products?.join(', ') ?? '',
                    'Срок': formatDate(c.deadline),
                    'Статус': c.outcome === 'connected' ? 'Подключен' : c.outcome === 'not_connected' ? 'Не совершено' : 'Ожидает',
                    'Исход': c.outcome === 'connected' ? 'Подключен' : c.outcome === 'not_connected' ? 'Не совершено' : 'Ожидает',
                    'Комментарии': c.comment || '',
                  };
                });
                exportToExcel(rows, 'Планированные_подключения', 'Подключения');
              }}
              disabled={filtered.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 hover:border-slate-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <FileDown size={14} />
              Выгрузить в Excel
            </button>
            <button
              onClick={loadData}
              disabled={loading}
              className="p-2 text-slate-400 hover:text-dark-DEFAULT hover:bg-slate-50 rounded-lg transition-colors disabled:opacity-50"
              title="Обновить"
            >
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {/* Summary badges */}
        <div className="flex flex-wrap gap-2 mt-3">
          <button
            onClick={() => setFilterOutcome('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${filterOutcome === 'all' ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'}`}
          >
            Все · {visibleConnections.length}
          </button>
          <button
            onClick={() => setFilterOutcome('pending')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${filterOutcome === 'pending' ? 'bg-slate-100 text-slate-700 border-slate-300' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'}`}
          >
            <CalendarClock size={12} className="text-slate-400" />
            Ожидает · {counts.pending}
          </button>
          {counts.overdue > 0 && (
            <button
              onClick={() => setFilterOutcome('overdue')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${filterOutcome === 'overdue' ? 'bg-orange-100 text-orange-800 border-orange-300' : 'bg-orange-50 text-orange-700 border-orange-200 hover:border-orange-300'}`}
            >
              <CalendarClock size={12} />
              Просрочено · {counts.overdue}
            </button>
          )}
          <button
            onClick={() => setFilterOutcome('connected')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${filterOutcome === 'connected' ? 'bg-emerald-100 text-emerald-800 border-emerald-300' : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:border-emerald-300'}`}
          >
            <CheckCircle2 size={12} />
            Подключен · {counts.connected}
          </button>
          <button
            onClick={() => setFilterOutcome('not_connected')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${filterOutcome === 'not_connected' ? 'bg-red-100 text-red-800 border-red-300' : 'bg-red-50 text-red-700 border-red-200 hover:border-red-300'}`}
          >
            <XCircle size={12} />
            Не совершено · {counts.not_connected}
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-3 flex flex-wrap gap-3 items-center">
        <div>
          <label className="text-xs text-slate-400 mr-1.5">МП:</label>
          <select
            value={filterMP}
            onChange={e => setFilterMP(e.target.value)}
            className="px-2 py-1.5 border border-slate-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-primary-500 focus:outline-none"
          >
            <option value="">Все МП</option>
            {mpOptions.map(mp => (
              <option key={mp} value={mp}>{mp}</option>
            ))}
          </select>
        </div>

        {(filterMP || filterOutcome !== 'all') && (
          <button
            onClick={() => { setFilterMP(''); setFilterOutcome('all'); }}
            className="text-xs text-slate-400 hover:text-dark-DEFAULT underline"
          >
            Сбросить фильтры
          </button>
        )}
      </div>

      {/* Table */}
      {loading ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm py-16 flex items-center justify-center gap-2 text-slate-400">
          <Loader2 size={20} className="animate-spin" />
          Загрузка...
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm py-16 text-center">
          <CalendarClock size={36} className="mx-auto text-slate-300 mb-3" />
          <p className="text-slate-500 font-medium">Нет планированных подключений</p>
          <p className="text-slate-400 text-sm mt-1">
            Перейдите в «Потенциал базы врачей» у МП и нажмите «Подключить» напротив потенциального врача.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
          <div className="overflow-x-auto max-w-none">
            <table className="w-full text-xs" style={{ minWidth: 'max-content' }}>
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-3 py-2.5 font-semibold text-slate-500 w-8">#</th>
                  <th className="text-left px-3 py-2.5 font-semibold text-slate-500 min-w-[160px]">МП</th>
                  <th className="text-left px-3 py-2.5 font-semibold text-slate-500 min-w-[200px]">Врач</th>
                  <th className="text-left px-3 py-2.5 font-semibold text-slate-500 min-w-[100px]">Спец</th>
                  <th className="text-left px-3 py-2.5 font-semibold text-slate-500 min-w-[180px]">Учреждение (ЛПУ)</th>
                  <th className="text-left px-3 py-2.5 font-semibold text-slate-500 min-w-[80px]">ЛПУ Аб</th>
                  <th className="text-left px-3 py-2.5 font-semibold text-slate-500 min-w-[80px]">Категория</th>
                  <th className="text-left px-3 py-2.5 font-semibold text-slate-500 min-w-[100px]">Область</th>
                  <th className="text-left px-3 py-2.5 font-semibold text-slate-500 min-w-[180px]">Продукты</th>
                  <th className="text-left px-3 py-2.5 font-semibold text-slate-500 w-24">Срок</th>
                  <th className="text-left px-3 py-2.5 font-semibold text-slate-500 w-32">Статус</th>
                  <th className="text-left px-3 py-2.5 font-semibold text-slate-500 min-w-[180px]">Исход</th>
                  <th className="text-left px-3 py-2.5 font-semibold text-slate-500 min-w-[200px]">Комментарии</th>
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map((conn, i) => {
                  const overdue = isOverdue(conn.deadline, conn.outcome);
                  const enriched = enrichFromDoctors(conn, doctorsData);
                  return (
                    <tr
                      key={conn.id}
                      className={`hover:bg-slate-50 transition-colors ${overdue ? 'bg-orange-50/40' : ''}`}
                    >
                      <td className="px-3 py-3 text-slate-400 tabular-nums">{i + 1}</td>
                      <td className="px-3 py-3 font-medium text-dark-DEFAULT">{conn.mpName}</td>
                      <td className="px-3 py-3 font-medium text-dark-DEFAULT">{conn.doctorName}</td>
                      <td className="px-3 py-3 text-slate-600">{conn.specialty}</td>
                      <td className="px-3 py-3 text-slate-600">{conn.institution}</td>
                      <td className="px-3 py-3 text-slate-600">{enriched.institutionAbbr}</td>
                      <td className="px-3 py-3 text-slate-600">{enriched.category}</td>
                      <td className="px-3 py-3 text-slate-600">{enriched.region}</td>
                      <td className="px-3 py-3 text-slate-600 max-w-[200px]">
                        {conn.products?.length ? (
                          <span className="text-xs" title={conn.products.join(', ')}>
                            {conn.products.join(', ')}
                          </span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                      <td className={`px-3 py-3 font-medium tabular-nums ${overdue ? 'text-orange-600' : 'text-slate-700'}`}>
                        {formatDate(conn.deadline)}
                      </td>
                      <td className="px-3 py-3">
                        <OutcomeBadge outcome={conn.outcome} deadline={conn.deadline} />
                      </td>
                      <RowEditor connection={conn} onUpdate={handleUpdate} />
                      <td className="px-2 py-3">
                        <button
                          onClick={() => handleDelete(conn.id)}
                          className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                          title="Удалить"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
