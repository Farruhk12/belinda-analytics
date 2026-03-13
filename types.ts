
export interface GenericRow {
  [key: string]: any;
}

export interface VisitData {
  visits: GenericRow[];
  employees: GenericRow[];
  allEmployees: GenericRow[];
  fixation: GenericRow[];
  managers: GenericRow[];
}

export interface MonthlyInteraction {
  visits: number;
  bonuses: number;
}

export interface DoctorInteraction {
  doctorName: string;
  specialty: string;
  institution: string;
  visitCount: number;
  bonusAmount: number;
  history: Record<string, MonthlyInteraction>; // YYYY-MM -> stats
}

export interface DoctorCoverageCandidate {
  doctorName: string;
  specialty: string;
  institution: string;
}

export interface DoctorCoverageSpecialtyGroup {
  specialty: string;
  coveredDoctors: DoctorCoverageCandidate[];
  potentialDoctors: DoctorCoverageCandidate[];
  coveredCount: number;
  potentialCount: number;
}

export interface DoctorCoverageInstitutionGroup {
  institution: string;
  specialties: DoctorCoverageSpecialtyGroup[];
  coveredCount: number;
  potentialCount: number;
}

export interface DoctorCoverageAnalysis {
  coveredDoctorsCount: number;
  potentialDoctorsCount: number;
  institutionsCount: number;
  institutions: DoctorCoverageInstitutionGroup[];
}

export interface EmployeeCoverageAssignment {
  institution: string;
  specialties: string[];
}

/** РћРґРЅР° СЃС‚СЂРѕРєР° СЃСЂР°РІРЅРµРЅРёСЏ В«РґРѕРіРѕРІРѕСЂРёР»РёСЃСЊ vs РІС‹РїРёСЃР°Р»В» */
export interface ContractRecipeMatchRow {
  contractNomenclature: string;
  contractQty: number;
  hasPrescribed: boolean;
  recipeQty?: number;
  recipeSum?: number;
}

/** Р Р°Р·Р±РёРІРєР° РїРѕ РјРµСЃСЏС†Р°Рј (РїСЂРё РІС‹Р±РѕСЂРµ РєРІР°СЂС‚Р°Р»Р°): YYYY-MM -> { РІС‹РїРёСЃР°Р», РєРѕР»-РІРѕ, СЃСѓРјРјР° } */
export interface ContractRecipeMatchRowWithMonths extends ContractRecipeMatchRow {
  byMonth?: Record<string, { hasPrescribed: boolean; recipeQty: number; recipeSum: number }>;
}

/** РњРµС‚Р°РґР°РЅРЅС‹Рµ СЃРѕС‚СЂСѓРґРЅРёРєР° (СЂРµРґР°РєС‚РёСЂСѓРµРјС‹Рµ: РіСЂСѓРїРїР°, РѕР±Р»Р°СЃС‚СЊ, СЂРѕР»СЊ, Р°РєС‚РёРІРЅРѕСЃС‚СЊ) */
export interface StaffRecord {
  id: string;
  name: string;
  group: string;
  region: string;
  role: 'РњРџ' | 'РњРµРЅРµРґР¶РµСЂ';
  /** false = РЅРµР°РєС‚РёРІРЅС‹Р№ СЃРѕС‚СЂСѓРґРЅРёРє (РёСЃРєР»СЋС‡Р°РµС‚СЃСЏ РёР· СЃРїРёСЃРєРѕРІ Рё Р°РЅР°Р»РёС‚РёРєРё) */
  isActive: boolean;
}

export interface EmployeeSummary {
  id: string;
  name: string;
  region: string;
  group: string;
  role?: 'РњРџ' | 'РњРµРЅРµРґР¶РµСЂ';
  
  // Volume Metrics
  totalVisits: number;
  totalBonuses: number;
  activeDoctorsCount: number; // Count of doctors with bonusAmount > 0
  visitedDoctorsCount: number; // Count of unique doctors with at least 1 visit
  contractsCount: number; // Count of unique doctors with a contract for this employee
  fullCycleCount?: number; // Doctors with contract + visits + recipes (group)
  contractWithoutRecipesCount?: number; // Doctors with contract but no recipes (group)
  nonContractDoctorsCount?: number; // Doctors with visits or bonus but without contract
  visitsWithoutBonusesCount?: number; // Doctors with visits but without bonus
  bonusesWithoutVisitsCount?: number; // Doctors with bonus but without visits
  doctorsWithRecipeGroupCount?: number; // Doctors with recipes in employee group
  potentialDoctorsCount?: number; // Doctors from base who can be added
  /** % РІСЂР°С‡РµР№ СЃ РґРѕРіРѕРІРѕСЂРѕРј, РІС‹РїРёСЃР°РІС€РёС… СЂРµС†РµРїС‚С‹ РїРѕ РіСЂСѓРїРїРµ */
  contractDoctorsPrescribedRate?: number;
  /** РЎСЂРµРґРЅРёР№ % РїРѕР·РёС†РёР№ РґРѕРіРѕРІРѕСЂР°, РІС‹РїРёСЃР°РЅРЅС‹С… (РїРѕ РЅРѕРјРµРЅРєР»Р°С‚СѓСЂРµ) */
  contractItemsComplianceRate?: number;
  
  // Efficiency Metrics
  costPerVisit: number; // Bonus / Visit
  conversionRate: number; // % of visited doctors who generated a bonus
  
  // Anomalies
  zeroResultVisits: number; // Count of visits to doctors who gave 0 bonus
  wastedEffortDoctors: number; // Doctors visited > 3 times with 0 bonus
  
  // Detailed Data
  doctors: Map<string, DoctorInteraction>;
}

export interface KPIPlan {
  label: string;
  dailyVisits: number;
  monthlyVisits: number;
  activeDoctors: number;
  bonusPlan: number;
}

export enum LoadingState {
  IDLE,
  LOADING,
  SUCCESS,
  ERROR
}

export interface PlannedConnection {
  id: string;
  mpId: string;
  mpName: string;
  doctorName: string;
  institution: string;
  institutionAbbr?: string; // ЛПУ Аб
  specialty: string;
  category?: string;
  region?: string;
  deadline: string; // YYYY-MM-DD
  products?: string[]; // Продукты для договора
  outcome: 'connected' | 'not_connected' | null;
  comment: string;
  createdAt: string; // ISO string
}
