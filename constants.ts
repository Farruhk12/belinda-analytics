
const VISITS_SCRIPT =
  "https://script.google.com/macros/s/AKfycbyeY-49YMy69Gz-KSMAi2jXp4yy0KD4c6Aeva6otCtK62YI9sHhvLcVsF8LBsrcqmkVYA/exec";

export const API_URLS = {
  VISITS: VISITS_SCRIPT,
  BONUSES:
    "https://script.google.com/macros/s/AKfycbwuScbt9hdZSTa1_XYBUxD8IBVLJLU7rsMUIgawRHfNcSMGdSI1vZsQM870QW_l1NAxxA/exec",
  /** Договор — с какими врачами (клиентами) договор, какие продукты выписывать */
  CONTRACTS: `${VISITS_SCRIPT}?action=getContracts`,
  /** Рецепт — что врачи по факту выписали */
  RECIPES: `${VISITS_SCRIPT}?action=getRecipes`,
};

export const KPI_PLANS = {
  LEAD: {
    label: 'Ведущий МП',
    dailyVisits: 12,
    monthlyVisits: 288,
    activeDoctors: 50,
    bonusPlan: 40000
  },
  SENIOR: {
    label: 'Старший МП',
    dailyVisits: 12,
    monthlyVisits: 288,
    activeDoctors: 35,
    bonusPlan: 25000
  },
  JUNIOR: {
    label: 'Младший МП',
    dailyVisits: 12,
    monthlyVisits: 288,
    activeDoctors: 25,
    bonusPlan: 10000
  }
};

/** Матчеры для связки документов: врач (Клиент/Имя доктора), МП, группа, дата — во всех листах. */
export const COLUMN_MATCHERS = {
  EMPLOYEE: ['мп', 'мед представитель', 'сотрудник', 'фио', 'менеджер', 'представитель', 'ответственный', 'торговый'],
  DOCTOR: ['клиент', 'покупатель', 'контрагент', 'врач', 'фио врача', 'имя доктора', 'доктор'],
  INSTITUTION: ['лпу', 'учреждение', 'аптека', 'организация', 'место', 'клиника', 'больница', 'название клиента', 'аб'],
  /** ЛПУ полное название (без аббревиатуры) */
  INSTITUTION_FULL: ['лпу', 'учреждение', 'аптека', 'организация', 'место', 'клиника', 'больница', 'название клиента'],
  SPECIALTY: ['специальность', 'должность', 'категория', 'профиль'],
  DATE: ['дата', 'дата визита', 'дата отгрузки', 'дата выписки', 'число', 'время'],
  BONUS_AMOUNT: ['фт сум', 'фт.сум', 'фтсум', 'фактическаясуммавыдачи', 'фактическая сумма выдачи', 'утв сумма', 'сумма выдачи', 'бонус', 'выплата', 'продажи', 'факт', 'фактическая сумма', 'сумма'],
  VISIT_STATUS: ['статус'],
  REGION: ['территория', 'область', 'регион', 'город'],
  GROUP: ['группа', 'группа товара', 'команда', 'юнит'],
  ROLE: ['роль', 'role', 'должность', 'тип'],
  NOMENCLATURE: ['номенклатура', 'продукт', 'препарат', 'товар', 'наименование'],
  QUANTITY: ['количество', 'кол-во', 'колво', 'qty', 'объем', 'объём'],
};
