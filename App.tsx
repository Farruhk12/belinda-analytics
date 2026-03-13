
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { fetchAllData, getAvailableMonths, getValueByMatchers, normalizeLinkKey, getDoctorFromRow, buildBaseAnalysis, aggregateFromBase, BaseAnalysis } from './services/dataService';
import { loadEmployeeCoverageAssignments, loadStaffFromSupabase } from './services/supabaseDataService';
import { COLUMN_MATCHERS } from './constants';
import { LoadingState, EmployeeSummary, VisitData, GenericRow, EmployeeCoverageAssignment } from './types';
import { RefreshCw, AlertCircle, ChevronLeft, ShieldCheck, LogOut, ChevronDown, BarChart2, Users, Database, Stethoscope, Building2, CalendarClock } from 'lucide-react';
import { MPList } from './components/MPList';
import { EmployeeDetail } from './components/EmployeeDetail';
import { EmployeeDataTablePage } from './components/EmployeeDataTablePage';
import { DoctorPage } from './components/DoctorPage';
import { EmployeeCoveragePage } from './components/EmployeeCoveragePage';
import { EmployeesPage } from './components/EmployeesPage';
import { DoctorManagement } from './components/DoctorManagement';
import { DatabasePage } from './components/DatabasePage';
import { AdminPage } from './components/AdminPage';
import { LoginPage } from './components/LoginPage';
import { LPUPage } from './components/LPUPage';
import { PlannedConnectionsPage } from './components/PlannedConnectionsPage';
import { useAuth } from './context/AuthContext';
import { DoctorInteraction } from './types';

type AppTab = 'analytics' | 'employees' | 'doctors' | 'database' | 'lpu' | 'planned';

const App: React.FC = () => {
  const { profile, loading: authLoading, signOut, isAdmin, canAccessRegion, canAccessGroup } = useAuth();
  const [showAdminPage, setShowAdminPage] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  // Close user menu when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const [activeTab, setActiveTab] = useState<AppTab>('analytics');
  const [selectedPeriods, setSelectedPeriods] = useState<string[]>([]);

  const [status, setStatus] = useState<LoadingState>(LoadingState.IDLE);
  const [rawData, setRawData] = useState<{
    visitsData: VisitData;
    bonusesData: GenericRow[];
    contractsData: GenericRow[];
    recipesData: GenericRow[];
    doctorsData: GenericRow[];
  } | null>(null);

  const [availableMonths, setAvailableMonths] = useState<string[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState<EmployeeSummary | null>(null);
  const [fetching, setFetching] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState<number | null>(null);
  const [dataTablePage, setDataTablePage] = useState<{
    employee: EmployeeSummary;
    type: 'visits' | 'contracts' | 'bonused' | 'recipes';
    selectedPeriod: string;
  } | null>(null);
  const [coveragePage, setCoveragePage] = useState<EmployeeSummary | null>(null);
  const [savedAssignmentsMap, setSavedAssignmentsMap] = useState<Record<string, EmployeeCoverageAssignment[]>>({});
  const [inactiveEmployeeKeys, setInactiveEmployeeKeys] = useState<Set<string>>(new Set());

  const [doctorPage, setDoctorPage] = useState<{
    doctor: DoctorInteraction;
    employee: EmployeeSummary;
    contractItems: GenericRow[];
    recipeItems: GenericRow[];
    selectedPeriod: string;
  } | null>(null);

  const [stats, setStats] = useState<{
    employeeStats: EmployeeSummary[];
    totalVisits: number;
    totalBonuses: number;
    globalConversion: number;
  } | null>(null);
  const [baseAnalysis, setBaseAnalysis] = useState<BaseAnalysis | null>(null);

  // Reset analytics drill-down when switching tabs
  useEffect(() => {
    if (activeTab !== 'analytics') {
      setSelectedEmployee(null);
      setDataTablePage(null);
      setDoctorPage(null);
      setCoveragePage(null);
    }
  }, [activeTab]);

  const loadData = async () => {
    setFetching(true);
    setLoadingProgress(10);
    if (!stats) setStatus(LoadingState.LOADING);
    setSelectedEmployee(null);
    setDataTablePage(null);
    setDoctorPage(null);
    setCoveragePage(null);
    try {
      const data = await fetchAllData((coreData) => {
        // Этап 1 готов — показываем визиты + бонусы мгновенно (только если данные есть)
        if (coreData.visitsData.visits.length > 0 || coreData.bonusesData.length > 0) {
          setLoadingProgress(55);
          const months = getAvailableMonths(coreData.visitsData.visits, coreData.bonusesData);
          setAvailableMonths(months);
          setRawData(coreData);
        }
      });
      // Если основные данные пришли пустыми — скорее всего таймаут или ошибка сети
      if (data.visitsData.visits.length === 0 && data.bonusesData.length === 0) {
        setLoadingProgress(null);
        setStats(null);
        setStatus(LoadingState.ERROR);
        setFetching(false);
        return;
      }
      setLoadingProgress(85);
      const months = getAvailableMonths(
        data.visitsData.visits,
        data.bonusesData,
        data.recipesData,
        data.contractsData
      );
      setAvailableMonths(months);
      setRawData(data);
    } catch (error) {
      console.error(error);
      setLoadingProgress(null);
      setStats(null);
      setStatus(LoadingState.ERROR);
    } finally {
      setFetching(false);
    }
  };

  // Загружаем данные только после завершения проверки авторизации и при наличии профиля
  useEffect(() => {
    if (!authLoading && profile) loadData();
  }, [authLoading, profile?.id]);

  // Плавная анимация прогресса
  useEffect(() => {
    if (loadingProgress === null || loadingProgress >= 100) return;
    const ceiling = loadingProgress < 50 ? 50 : loadingProgress < 80 ? 80 : 95;
    if (loadingProgress >= ceiling) return;
    const id = setTimeout(() => {
      setLoadingProgress(p => p !== null ? Math.min(p + 1, ceiling) : null);
    }, 400);
    return () => clearTimeout(id);
  }, [loadingProgress]);

  // Phase 1: build base ONCE when raw data changes (expensive: scans all rows)
  useEffect(() => {
    if (!rawData) return;
    let cancelled = false;
    const id = setTimeout(async () => {
      let loaded: Record<string, EmployeeCoverageAssignment[]> = {};
      let inactiveKeys = new Set<string>();
      try {
        const [assignments, staff] = await Promise.all([
          loadEmployeeCoverageAssignments(),
          loadStaffFromSupabase(),
        ]);
        loaded = assignments;
        inactiveKeys = new Set(
          staff.filter(s => !s.isActive).map(s => normalizeLinkKey(s.name))
        );
      } catch { /* ignore */ }
      if (cancelled) return;
      setSavedAssignmentsMap(loaded);
      setInactiveEmployeeKeys(inactiveKeys);
      const savedAssignmentsMap = loaded;
      const base = buildBaseAnalysis(
        rawData.visitsData.visits,
        rawData.bonusesData,
        rawData.visitsData.employees,
        rawData.contractsData,
        rawData.recipesData,
        rawData.doctorsData,
        savedAssignmentsMap
      );
      setBaseAnalysis(base);
    }, 0);
    return () => { cancelled = true; clearTimeout(id); };
  }, [rawData]);

  // Phase 2: fast re-aggregate when period changes (uses pre-built indexes, no raw row scan)
  useEffect(() => {
    if (!baseAnalysis) return;
    const id = setTimeout(() => {
      const periodFilter = selectedPeriods.length === 0 || selectedPeriods.includes('All') ? 'All' : selectedPeriods;
      const processed = aggregateFromBase(baseAnalysis, periodFilter);
      setStats(processed);
      if (selectedEmployee) {
        const updated = processed.employeeStats.find(e => e.id === selectedEmployee.id);
        setSelectedEmployee(updated ?? null);
      }
      if (coveragePage) {
        const updatedCoverageEmployee = processed.employeeStats.find(e => e.id === coveragePage.id);
        setCoveragePage(updatedCoverageEmployee ?? null);
      }
      setStatus(LoadingState.SUCCESS);
      setLoadingProgress(100);
      setTimeout(() => setLoadingProgress(null), 800);
    }, 0);
    return () => clearTimeout(id);
  }, [baseAnalysis, selectedPeriods]);

  const allDoctorNames = useMemo(() => {
    if (!rawData) return [];
    const names = new Set<string>();
    const addFromRows = (rows: GenericRow[]) => {
      rows.forEach(row => {
        const doc = getDoctorFromRow(row);
        if (doc) names.add(doc);
      });
    };
    addFromRows(rawData.visitsData.visits);
    addFromRows(rawData.bonusesData);
    addFromRows(rawData.contractsData);
    addFromRows(rawData.recipesData);
    addFromRows(rawData.doctorsData);
    return Array.from(names).sort();
  }, [rawData]);

  /* ───── Auth loading ───── */
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <div className="w-8 h-8 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
      </div>
    );
  }

  /* ───── Not authenticated ───── */
  if (!profile) {
    return <LoginPage />;
  }

  /* ───── Inactive account ───── */
  if (!profile.is_active) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm max-w-sm w-full p-8 text-center">
          <div className="w-14 h-14 bg-red-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-7 h-7 text-red-500" />
          </div>
          <h2 className="text-dark-DEFAULT font-bold text-lg mb-2">Аккаунт деактивирован</h2>
          <p className="text-slate-400 text-sm mb-6">Обратитесь к администратору для восстановления доступа.</p>
          <button onClick={signOut} className="flex items-center gap-2 mx-auto text-sm text-slate-500 hover:text-dark-DEFAULT transition">
            <LogOut className="w-4 h-4" /> Выйти
          </button>
        </div>
      </div>
    );
  }

  const DATA_TABLE_TITLES: Record<string, string> = {
    visits: 'Визиты',
    contracts: 'Договоры',
    bonused: 'Врачи с бонусом',
    recipes: 'Рецепты',
  };

  const TABS = [
    { id: 'analytics' as AppTab, label: 'Аналитика', Icon: BarChart2 },
    { id: 'employees' as AppTab, label: 'Сотрудники', Icon: Users },
    { id: 'planned' as AppTab, label: 'Подключения', Icon: CalendarClock },
    ...(isAdmin ? [
      { id: 'doctors' as AppTab, label: 'Врачи', Icon: Stethoscope },
      { id: 'database' as AppTab, label: 'База данных', Icon: Database },
      { id: 'lpu' as AppTab, label: 'ЛПУ', Icon: Building2 },
    ] : []),
  ];

  /* ───── Main layout ───── */
  // Detail pages only apply within analytics tab
  const isAnalyticsDetail = activeTab === 'analytics' && (!!selectedEmployee || !!dataTablePage || !!doctorPage || !!coveragePage);
  const isDetailPage = isAnalyticsDetail || showAdminPage;

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-dark-DEFAULT">

      {/* ── Header ── */}
      <header className="bg-white border-b border-slate-100 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="h-16 flex items-center justify-between gap-4">

            {/* Brand + breadcrumb */}
            <div className="flex items-center gap-3 min-w-0">
              {isDetailPage ? (
                <button
                  onClick={() => {
                    if (doctorPage) setDoctorPage(null);
                    else if (coveragePage) setCoveragePage(null);
                    else if (dataTablePage) setDataTablePage(null);
                    else if (showAdminPage) setShowAdminPage(false);
                    else setSelectedEmployee(null);
                  }}
                  className="flex items-center gap-1.5 text-slate-500 hover:text-dark-DEFAULT transition-colors shrink-0"
                >
                  <ChevronLeft size={18} />
                  <span className="text-sm font-medium hidden sm:inline">Назад</span>
                </button>
              ) : null}
              <div className="hidden sm:flex items-center gap-2 min-w-0">
                {!isDetailPage && (
                  <div className="w-px h-5 bg-slate-200" />
                )}
                <div className="min-w-0">
                  {isDetailPage ? (
                    <div className="flex items-center gap-1.5 text-xs text-slate-400">
                      <span>Belinda Analytics</span>
                      <span>/</span>
                      <span className="text-dark-DEFAULT font-medium truncate max-w-[200px]">
                        {doctorPage ? doctorPage.doctor.doctorName : showAdminPage ? 'Пользователи' : dataTablePage ? DATA_TABLE_TITLES[dataTablePage.type] : selectedEmployee?.name}
                      </span>
                    </div>
                  ) : (
                    <div>
                      <p className="text-base font-bold text-dark-DEFAULT leading-tight">Belinda Analytics</p>
                      <p className="text-[11px] text-slate-400 leading-tight">Аналитика медпредставителей</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 flex-1 justify-end">
              <div className="w-px h-5 bg-slate-200 hidden sm:block" />

              {!isDetailPage && (
                loadingProgress !== null ? (
                  <div className="relative w-8 h-8 shrink-0 flex items-center justify-center" title={`Загрузка ${loadingProgress}%`}>
                    <svg className="w-8 h-8 -rotate-90" viewBox="0 0 32 32">
                      <circle cx="16" cy="16" r="12" fill="none" stroke="#e2e8f0" strokeWidth="3" />
                      <circle
                        cx="16" cy="16" r="12" fill="none"
                        stroke="#6366f1"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeDasharray={`${2 * Math.PI * 12}`}
                        strokeDashoffset={`${2 * Math.PI * 12 * (1 - loadingProgress / 100)}`}
                        style={{ transition: 'stroke-dashoffset 0.4s ease' }}
                      />
                    </svg>
                    <span className="absolute text-[9px] font-bold text-primary-600 leading-none">
                      {loadingProgress}%
                    </span>
                  </div>
                ) : (
                  <button
                    onClick={loadData}
                    disabled={fetching}
                    className="p-2 text-slate-400 hover:text-dark-DEFAULT hover:bg-slate-50 rounded-lg transition-colors shrink-0 disabled:opacity-50"
                    title="Обновить данные"
                  >
                    <RefreshCw size={16} />
                  </button>
                )
              )}

              {/* User menu */}
              <div className="relative" ref={userMenuRef}>
                <button
                  onClick={() => setUserMenuOpen(v => !v)}
                  className="flex items-center gap-1.5 pl-2 pr-1 py-1.5 rounded-lg hover:bg-slate-50 border border-transparent hover:border-slate-200 transition-all"
                >
                  <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
                    {(profile.full_name || profile.username).charAt(0).toUpperCase()}
                  </div>
                  <span className="text-sm font-medium text-slate-700 hidden md:inline max-w-[120px] truncate">
                    {profile.full_name || profile.username}
                  </span>
                  <ChevronDown size={14} className={`text-slate-400 transition-transform ${userMenuOpen ? 'rotate-180' : ''}`} />
                </button>

                {userMenuOpen && (
                  <div className="absolute right-0 top-full mt-1.5 w-52 bg-white border border-slate-200 rounded-xl shadow-lg z-50 py-1 overflow-hidden">
                    <div className="px-3 py-2 border-b border-slate-100">
                      <p className="text-sm font-medium text-slate-800 truncate">{profile.full_name || profile.username}</p>
                      <p className="text-xs text-slate-400 truncate">@{profile.username}</p>
                      <p className="text-xs text-blue-500 mt-0.5">{profile.role === 'admin' ? 'Администратор' : 'Пользователь'}</p>
                    </div>
                    {isAdmin && (
                      <button
                        onClick={() => { setShowAdminPage(true); setUserMenuOpen(false); setSelectedEmployee(null); setDataTablePage(null); setDoctorPage(null); setCoveragePage(null); }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors"
                      >
                        <ShieldCheck size={15} className="text-amber-500" />
                        Пользователи
                      </button>
                    )}
                    <button
                      onClick={() => { setUserMenuOpen(false); signOut(); }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-500 hover:bg-red-50 transition-colors"
                    >
                      <LogOut size={15} />
                      Выйти
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Tab navigation - show only when not in detail page AND stats loaded */}
        {!isDetailPage && stats && (
          <div className="bg-white border-t border-slate-100">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <nav className="flex gap-1 py-1">
                {TABS.map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                      activeTab === tab.id
                        ? 'bg-primary-50 text-primary-700'
                        : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <tab.Icon size={16} />
                    {tab.label}
                  </button>
                ))}
              </nav>
            </div>
          </div>
        )}
      </header>

      {/* ── Main ── */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-20">
        {showAdminPage ? (
          <AdminPage
            availableRegions={Array.from(new Set(
              (stats?.employeeStats ?? [])
                // @ts-ignore Legacy garbled role value in source data, keep behavior unchanged.
                .filter(e => e.region && (e as EmployeeSummary & { role?: string }).role !== 'Менеджер')
                .map(e => e.region)
            )).sort((a, b) => String(a).localeCompare(String(b)))}
            availableGroups={Array.from(new Set(
              (stats?.employeeStats ?? [])
                // @ts-ignore Legacy garbled role value in source data, keep behavior unchanged.
                .filter(e => e.group && (e as EmployeeSummary & { role?: string }).role !== 'Менеджер')
                .map(e => e.group)
            )).sort((a, b) => String(a).localeCompare(String(b)))}
          />
        ) : activeTab === 'employees' ? (
          <EmployeesPage
            employeeStats={(stats?.employeeStats ?? []).filter(e => !inactiveEmployeeKeys.has(normalizeLinkKey(e.name)))}
            employeesFromData={(rawData?.visitsData?.employees ?? []).map(emp => {
              const name = getValueByMatchers(emp, COLUMN_MATCHERS.EMPLOYEE);
              return {
                id: normalizeLinkKey(name) || 'unknown',
                name: name || '',
                region: getValueByMatchers(emp, COLUMN_MATCHERS.REGION),
                group: getValueByMatchers(emp, COLUMN_MATCHERS.GROUP),
              };
            }).filter(e => e.name)}
            visitsData={rawData?.visitsData?.visits ?? []}
            bonusesData={rawData?.bonusesData ?? []}
            doctorsData={rawData?.doctorsData ?? []}
            onSave={loadData}
            isAdmin={isAdmin}
            canAccessRegion={canAccessRegion}
            canAccessGroup={canAccessGroup}
          />
        ) : activeTab === 'planned' ? (
          <PlannedConnectionsPage
            employeeStats={stats?.employeeStats ?? []}
            doctorsData={rawData?.doctorsData ?? []}
            isAdmin={isAdmin}
            canAccessRegion={canAccessRegion}
            canAccessGroup={canAccessGroup}
          />
        ) : activeTab === 'doctors' ? (
          <DoctorManagement
            allDoctorNames={allDoctorNames}
            doctorsData={rawData?.doctorsData ?? []}
            onSave={loadData}
          />
        ) : activeTab === 'database' ? (
          <DatabasePage onUploadSuccess={loadData} />
        ) : activeTab === 'lpu' ? (
          <LPUPage doctorsData={rawData?.doctorsData ?? []} />
        ) : !stats ? (
          status === LoadingState.ERROR ? (
            <div className="flex items-center justify-center py-24">
              <div className="bg-white rounded-2xl shadow-lg max-w-sm w-full p-8 text-center">
                <div className="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center mx-auto mb-5">
                  <AlertCircle className="text-red-500" size={32} />
                </div>
                <h2 className="text-xl font-bold text-dark-DEFAULT mb-2">Не удалось загрузить данные</h2>
                <p className="text-sm text-slate-500 mb-1">Сервер не ответил вовремя или соединение прервалось.</p>
                <p className="text-xs text-slate-400 mb-6">Нажмите «Повторить» — обычно со второй попытки загружается быстрее.</p>
                <button
                  onClick={loadData}
                  className="w-full flex items-center justify-center gap-2 px-5 py-2.5 bg-primary-500 text-white rounded-xl hover:bg-primary-600 transition-colors font-medium"
                >
                  <RefreshCw size={16} />
                  Повторить загрузку
                </button>
              </div>
            </div>
          ) : (
            /* ── Skeleton loader ── */
            <div className="space-y-4 animate-pulse">
              {/* Filter bar skeleton */}
              <div className="bg-white rounded-xl border border-slate-200 px-4 py-3 flex flex-wrap gap-2">
                {[80, 64, 96, 72, 88, 60, 76].map((w, i) => (
                  <div key={i} className="h-6 bg-slate-100 rounded-full" style={{ width: w }} />
                ))}
              </div>

              {/* Progress bar */}
              <div className="flex items-center gap-3 px-1">
                <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-primary-400 rounded-full animate-[loading_1.5s_ease-in-out_infinite]"
                    style={{ width: '60%', animation: 'pulse 1.5s ease-in-out infinite' }} />
                </div>
                <span className="text-xs text-slate-400 shrink-0">Загрузка данных...</span>
              </div>

              {/* Region group: 1 */}
              {[1, 2, 3].map(group => (
                <div key={group} className="space-y-2">
                  {/* Region header */}
                  <div className="flex items-center gap-2 px-1">
                    <div className="h-4 bg-slate-200 rounded w-24" />
                    <div className="flex-1 h-px bg-slate-100" />
                    <div className="h-4 bg-slate-100 rounded w-12" />
                  </div>

                  {/* Employee cards */}
                  <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
                    {[1, 2, 3].map(row => (
                      <div key={row} className="flex items-center gap-3 px-4 py-3">
                        {/* Avatar */}
                        <div className="w-8 h-8 rounded-full bg-slate-100 shrink-0" />
                        {/* Name + group */}
                        <div className="flex-1 space-y-1.5 min-w-0">
                          <div className="h-3.5 bg-slate-200 rounded" style={{ width: `${55 + (row * 13) % 30}%` }} />
                          <div className="h-3 bg-slate-100 rounded w-24" />
                        </div>
                        {/* Stats */}
                        <div className="flex gap-4 shrink-0">
                          {[1, 2, 3].map(s => (
                            <div key={s} className="text-right space-y-1">
                              <div className="h-4 bg-slate-200 rounded w-8 ml-auto" />
                              <div className="h-2.5 bg-slate-100 rounded w-12" />
                            </div>
                          ))}
                        </div>
                        {/* Arrow */}
                        <div className="w-4 h-4 bg-slate-100 rounded shrink-0" />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )
        ) : doctorPage ? (
          <DoctorPage
            doctor={doctorPage.doctor}
            employeeName={doctorPage.employee.name}
            onBack={() => setDoctorPage(null)}
            contractItems={doctorPage.contractItems}
            recipeItems={doctorPage.recipeItems}
            selectedPeriod={doctorPage.selectedPeriod}
            availableMonths={availableMonths}
          />
        ) : dataTablePage ? (
          <EmployeeDataTablePage
            employee={dataTablePage.employee}
            type={dataTablePage.type}
            visitsData={rawData?.visitsData?.visits ?? []}
            bonusesData={rawData?.bonusesData ?? []}
            contractsData={rawData?.contractsData ?? []}
            recipesData={rawData?.recipesData ?? []}
            selectedPeriod={dataTablePage.selectedPeriod}
            onBack={() => setDataTablePage(null)}
          />
        ) : coveragePage ? (
          <EmployeeCoveragePage
            employee={coveragePage}
            visitsData={rawData?.visitsData?.visits ?? []}
            bonusesData={rawData?.bonusesData ?? []}
            doctorsData={rawData?.doctorsData ?? []}
            contractsData={rawData?.contractsData ?? []}
            onBack={() => setCoveragePage(null)}
          />
        ) : selectedEmployee ? (
          <EmployeeDetail
            employee={selectedEmployee}
            onBack={() => setSelectedEmployee(null)}
            onOpenDataTable={(type, selectedPeriod) =>
              setDataTablePage({ employee: selectedEmployee, type, selectedPeriod })
            }
            onOpenCoveragePage={() => setCoveragePage(selectedEmployee)}
            onOpenDoctorPage={(doctor, contractItems, recipeItems, selectedPeriod) =>
              setDoctorPage({ doctor, employee: selectedEmployee, contractItems, recipeItems, selectedPeriod })
            }
            visitsData={rawData?.visitsData?.visits ?? []}
            bonusesData={rawData?.bonusesData ?? []}
            contractsData={rawData?.contractsData ?? []}
            recipesData={rawData?.recipesData ?? []}
            availableMonths={availableMonths}
          />
        ) : (
          <MPList
            data={stats.employeeStats.filter(e =>
              canAccessRegion(e.region ?? '') && canAccessGroup(e.group ?? '') &&
              String((e as any).role ?? '').toLowerCase().trim() !== 'менеджер' &&
              !inactiveEmployeeKeys.has(normalizeLinkKey(e.name))
            )}
            onSelect={setSelectedEmployee}
            availableMonths={availableMonths}
            selectedPeriods={selectedPeriods}
            onPeriodChange={setSelectedPeriods}
            visitsData={rawData?.visitsData?.visits ?? []}
            bonusesData={rawData?.bonusesData ?? []}
            contractsData={rawData?.contractsData ?? []}
            recipesData={rawData?.recipesData ?? []}
            doctorsData={rawData?.doctorsData ?? []}
            savedAssignmentsMap={savedAssignmentsMap}
          />
        )}
      </main>
    </div>
  );
};

export default App;
