import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  UserPlus, Pencil, Trash2, ShieldCheck, User, X, Check,
  Eye, EyeOff, RefreshCw, AlertCircle, MapPin, Layers,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { UserProfile } from '../types/auth';
import { useAuth } from '../context/AuthContext';

/* ─── helpers ──────────────────────────────────────────────────────── */
const normTag = (s: string) => s.trim().toLowerCase();

/* ─── TagSelector ───────────────────────────────────────────────────── */
interface TagSelectorProps {
  options: string[];
  selected: string[];
  onChange: (vals: string[]) => void;
  color: 'blue' | 'violet';
  placeholder?: string;
}

const TagSelector: React.FC<TagSelectorProps> = ({ options, selected, onChange, color, placeholder }) => {
  const [search, setSearch] = useState('');

  const toggle = (val: string) => {
    const norm = normTag(val);
    if (selected.some(s => normTag(s) === norm)) {
      onChange(selected.filter(s => normTag(s) !== norm));
    } else {
      onChange([...selected, val]);
    }
  };

  const filtered = options.filter(o =>
    !search || o.toLowerCase().includes(search.toLowerCase())
  );

  const activeBase = color === 'blue'
    ? 'bg-primary-500 text-white border-primary-500'
    : 'bg-violet-500 text-white border-violet-500';
  const inactiveBase = color === 'blue'
    ? 'bg-white border-slate-200 text-slate-600 hover:border-primary-300 hover:text-primary-700'
    : 'bg-white border-slate-200 text-slate-600 hover:border-violet-300 hover:text-violet-700';

  return (
    <div className="space-y-2">
      {/* Selected tags */}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map(s => (
            <span
              key={s}
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${activeBase}`}
            >
              {s}
              <button type="button" onClick={() => toggle(s)} className="opacity-70 hover:opacity-100">
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Search */}
      {options.length > 6 && (
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={`Поиск...`}
          className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary-400"
        />
      )}

      {/* Options */}
      {options.length === 0 ? (
        <p className="text-xs text-slate-400 italic">{placeholder ?? 'Нет данных (загрузите Excel сначала)'}</p>
      ) : (
        <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
          {filtered.map(o => {
            const active = selected.some(s => normTag(s) === normTag(o));
            return (
              <button
                key={o}
                type="button"
                onClick={() => toggle(o)}
                className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${active ? activeBase : inactiveBase}`}
              >
                {active && <Check className="w-3 h-3 mr-1" />}
                {o}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

/* ─── types ─────────────────────────────────────────────────────────── */
interface FormState {
  username: string;
  full_name: string;
  password: string;
  role: 'admin' | 'user';
  allowed_regions: string[];
  allowed_groups: string[];
  is_active: boolean;
}

const emptyForm = (): FormState => ({
  username: '',
  full_name: '',
  password: '',
  role: 'user',
  allowed_regions: [],
  allowed_groups: [],
  is_active: true,
});

/* ─── UserModal ─────────────────────────────────────────────────────── */
interface ModalProps {
  initial: FormState | null;
  editingId: string | null;
  availableRegions: string[];
  availableGroups: string[];
  onClose: () => void;
  onSaved: () => void;
}

const UserModal: React.FC<ModalProps> = ({
  initial, editingId, availableRegions, availableGroups, onClose, onSaved,
}) => {
  const [form, setForm] = useState<FormState>(initial ?? emptyForm());
  const [showPwd, setShowPwd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const backdropRef = useRef<HTMLDivElement>(null);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    setError(null);
    setSaving(true);
    try {
      if (editingId) {
        const update: Partial<UserProfile> & { password?: string } = {
          full_name: form.full_name.trim(),
          role: form.role,
          allowed_regions: form.allowed_regions,
          allowed_groups: form.allowed_groups,
          is_active: form.is_active,
        };
        if (form.password.trim()) update.password = form.password.trim();
        const { error: dbErr } = await supabase.from('user_profiles').update(update).eq('id', editingId);
        if (dbErr) throw dbErr;
      } else {
        if (!form.password.trim()) throw new Error('Введите пароль');
        const { error: dbErr } = await supabase.from('user_profiles').insert({
          username: form.username.trim(),
          full_name: form.full_name.trim(),
          password: form.password.trim(),
          role: form.role,
          allowed_regions: form.allowed_regions,
          allowed_groups: form.allowed_groups,
        });
        if (dbErr) {
          if (dbErr.code === '23505') throw new Error('Пользователь с таким логином уже существует');
          throw dbErr;
        }
      }
      onSaved();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={e => { if (e.target === backdropRef.current) onClose(); }}
    >
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-lg shadow-xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 sticky top-0 bg-white z-10">
          <h2 className="text-base font-semibold text-dark-DEFAULT flex items-center gap-2">
            {editingId
              ? <><Pencil className="w-4 h-4 text-primary-500" /> Редактировать пользователя</>
              : <><UserPlus className="w-4 h-4 text-emerald-500" /> Новый пользователь</>}
          </h2>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">

          {/* Username (only new) */}
          {!editingId && (
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">Логин *</label>
              <input
                type="text"
                required
                value={form.username}
                onChange={e => set('username', e.target.value)}
                placeholder="Введите логин"
                className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-dark-DEFAULT placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-transparent transition"
              />
            </div>
          )}

          {/* Full name */}
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">Отображаемое имя *</label>
            <input
              type="text"
              required
              value={form.full_name}
              onChange={e => set('full_name', e.target.value)}
              placeholder="Иванов Иван"
              className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-dark-DEFAULT placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-transparent transition"
            />
          </div>

          {/* Password */}
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">
              {editingId ? 'Новый пароль (оставьте пустым — без изменений)' : 'Пароль *'}
            </label>
            <div className="relative">
              <input
                type={showPwd ? 'text' : 'password'}
                required={!editingId}
                value={form.password}
                onChange={e => set('password', e.target.value)}
                placeholder={editingId ? 'Не изменять' : 'Пароль'}
                className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 pr-10 text-sm text-dark-DEFAULT placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-transparent transition"
              />
              <button
                type="button"
                onClick={() => setShowPwd(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition"
              >
                {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Role */}
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">Роль</label>
            <div className="flex gap-2">
              {(['user', 'admin'] as const).map(r => (
                <button
                  key={r}
                  type="button"
                  onClick={() => set('role', r)}
                  className={`flex-1 py-2 rounded-xl text-sm font-medium border transition-all ${
                    form.role === r
                      ? r === 'admin'
                        ? 'bg-amber-50 border-amber-300 text-amber-700'
                        : 'bg-primary-50 border-primary-300 text-primary-700'
                      : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
                  }`}
                >
                  {r === 'admin' ? '⭐ Администратор' : '👤 Пользователь'}
                </button>
              ))}
            </div>
          </div>

          {/* Regions */}
          <div className="bg-slate-50 rounded-xl p-3.5">
            <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600 mb-2">
              <MapPin className="w-3.5 h-3.5 text-primary-500" />
              Территории
              <span className="font-normal text-slate-400 ml-1">— пусто = все</span>
            </label>
            <TagSelector
              options={availableRegions}
              selected={form.allowed_regions}
              onChange={v => set('allowed_regions', v)}
              color="blue"
            />
          </div>

          {/* Groups */}
          <div className="bg-slate-50 rounded-xl p-3.5">
            <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600 mb-2">
              <Layers className="w-3.5 h-3.5 text-violet-500" />
              Группы
              <span className="font-normal text-slate-400 ml-1">— пусто = все</span>
            </label>
            <TagSelector
              options={availableGroups}
              selected={form.allowed_groups}
              onChange={v => set('allowed_groups', v)}
              color="violet"
            />
          </div>

          {/* Active toggle (edit only) */}
          {editingId && (
            <div className="flex items-center justify-between bg-slate-50 rounded-xl px-3.5 py-3">
              <span className="text-sm text-slate-600 font-medium">Активен</span>
              <button
                type="button"
                onClick={() => set('is_active', !form.is_active)}
                className={`relative rounded-full transition-all duration-200 ${form.is_active ? 'bg-primary-500' : 'bg-slate-300'}`}
                style={{ width: 40, height: 22 }}
              >
                <span
                  className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200"
                  style={{ transform: form.is_active ? 'translateX(20px)' : 'translateX(2px)' }}
                />
              </button>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl px-3.5 py-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-xl py-2.5 text-sm font-medium transition"
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 bg-primary-500 hover:bg-primary-600 disabled:opacity-60 text-white rounded-xl py-2.5 text-sm font-semibold transition flex items-center justify-center gap-2 shadow-sm"
            >
              {saving
                ? <><div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Сохранение...</>
                : <><Check className="w-4 h-4" /> Сохранить</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

/* ─── AdminPage ─────────────────────────────────────────────────────── */
interface AdminPageProps {
  availableRegions: string[];
  availableGroups: string[];
}

export const AdminPage: React.FC<AdminPageProps> = ({ availableRegions, availableGroups }) => {
  const { profile: currentProfile } = useAuth();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadUsers = useCallback(async () => {
    if (!supabase) return;
    setLoadingUsers(true);
    setFetchError(null);
    const { data, error } = await supabase
      .from('user_profiles')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) setFetchError(error.message);
    else setUsers((data ?? []) as UserProfile[]);
    setLoadingUsers(false);
  }, []);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  const openCreate = () => { setEditingUser(null); setModalOpen(true); };
  const openEdit = (u: UserProfile) => { setEditingUser(u); setModalOpen(true); };

  const handleDelete = async (u: UserProfile) => {
    if (!supabase) return;
    if (!window.confirm(`Удалить пользователя «${u.username}»?`)) return;
    setDeletingId(u.id);
    await supabase.from('user_profiles').delete().eq('id', u.id);
    setDeletingId(null);
    loadUsers();
  };

  const formFromProfile = (u: UserProfile): FormState => ({
    username: u.username,
    full_name: u.full_name,
    password: '',
    role: u.role,
    allowed_regions: u.allowed_regions,
    allowed_groups: u.allowed_groups,
    is_active: u.is_active,
  });

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-white rounded-2xl border border-slate-200 px-5 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-base font-bold text-dark-DEFAULT flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-primary-500" />
            Управление пользователями
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Настройте доступ по территориям и группам
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={loadUsers}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-50 border border-slate-200 rounded-xl transition"
            title="Обновить"
          >
            <RefreshCw className={`w-4 h-4 ${loadingUsers ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={openCreate}
            className="flex items-center gap-1.5 bg-primary-500 hover:bg-primary-600 text-white text-sm font-medium px-3.5 py-2 rounded-xl transition shadow-sm"
          >
            <UserPlus className="w-4 h-4" />
            Добавить
          </button>
        </div>
      </div>

      {/* Error */}
      {fetchError && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl px-4 py-3">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          {fetchError}
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        {loadingUsers ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-6 h-6 border-2 border-primary-200 border-t-primary-500 rounded-full animate-spin" />
          </div>
        ) : users.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <User className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Пользователи не найдены</p>
            <button onClick={openCreate} className="mt-3 text-sm text-primary-500 hover:text-primary-700 transition">
              Создать первого пользователя →
            </button>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/60">
                <th className="text-left text-xs text-slate-500 font-medium px-4 py-3">Пользователь</th>
                <th className="text-left text-xs text-slate-500 font-medium px-4 py-3">Роль</th>
                <th className="text-left text-xs text-slate-500 font-medium px-4 py-3">Территории</th>
                <th className="text-left text-xs text-slate-500 font-medium px-4 py-3">Группы</th>
                <th className="text-left text-xs text-slate-500 font-medium px-4 py-3">Статус</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map(u => (
                <tr key={u.id} className={`hover:bg-slate-50/60 transition ${!u.is_active ? 'opacity-50' : ''}`}>
                  <td className="px-4 py-3">
                    <div className="font-medium text-dark-DEFAULT text-sm">{u.full_name || u.username}</div>
                    <div className="text-xs text-slate-400">@{u.username}</div>
                    {u.id === currentProfile?.id && (
                      <span className="text-xs text-primary-500 font-medium">вы</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {u.role === 'admin' ? (
                      <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-full px-2 py-0.5 text-xs font-medium">
                        <ShieldCheck className="w-3 h-3" /> Админ
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-500 rounded-full px-2 py-0.5 text-xs">
                        <User className="w-3 h-3" /> Пользователь
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {u.allowed_regions.length === 0 ? (
                      <span className="text-xs text-slate-400 italic">Все</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {u.allowed_regions.slice(0, 2).map(r => (
                          <span key={r} className="bg-primary-50 text-primary-700 border border-primary-200 rounded-full px-2 py-0.5 text-xs">
                            {r}
                          </span>
                        ))}
                        {u.allowed_regions.length > 2 && (
                          <span className="bg-slate-100 text-slate-500 rounded-full px-2 py-0.5 text-xs">
                            +{u.allowed_regions.length - 2}
                          </span>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {u.allowed_groups.length === 0 ? (
                      <span className="text-xs text-slate-400 italic">Все</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {u.allowed_groups.slice(0, 2).map(g => (
                          <span key={g} className="bg-violet-50 text-violet-700 border border-violet-200 rounded-full px-2 py-0.5 text-xs">
                            {g}
                          </span>
                        ))}
                        {u.allowed_groups.length > 2 && (
                          <span className="bg-slate-100 text-slate-500 rounded-full px-2 py-0.5 text-xs">
                            +{u.allowed_groups.length - 2}
                          </span>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium ${u.is_active ? 'text-emerald-600' : 'text-slate-400'}`}>
                      {u.is_active ? '● Активен' : '○ Отключён'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      <button
                        onClick={() => openEdit(u)}
                        className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition"
                        title="Редактировать"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      {u.id !== currentProfile?.id && (
                        <button
                          onClick={() => handleDelete(u)}
                          disabled={deletingId === u.id}
                          className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition disabled:opacity-50"
                          title="Удалить"
                        >
                          {deletingId === u.id
                            ? <div className="w-3.5 h-3.5 border border-red-300 border-t-red-500 rounded-full animate-spin" />
                            : <Trash2 className="w-3.5 h-3.5" />}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <p className="text-xs text-slate-400 px-1">
        Если поля «Территории» и «Группы» пустые — пользователь видит все данные.
      </p>

      {modalOpen && (
        <UserModal
          initial={editingUser ? formFromProfile(editingUser) : null}
          editingId={editingUser?.id ?? null}
          availableRegions={availableRegions}
          availableGroups={availableGroups}
          onClose={() => setModalOpen(false)}
          onSaved={loadUsers}
        />
      )}
    </div>
  );
};
