import { EmployeeSummary, DoctorInteraction, GenericRow } from '../types';

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

const AI_PROVIDER_KEY = 'belinda-ai-provider';

export type AIProvider = 'gemini' | 'gpt';

export function getAIProvider(): AIProvider {
  try {
    const v = localStorage.getItem(AI_PROVIDER_KEY);
    if (v === 'gpt' || v === 'gemini') return v;
  } catch (_) {}
  return 'gemini';
}

export function setAIProvider(provider: AIProvider): void {
  try {
    localStorage.setItem(AI_PROVIDER_KEY, provider);
  } catch (_) {}
}

async function callAI(prompt: string): Promise<string> {
  const provider = getAIProvider();

  if (provider === 'gpt') {
    const apiKey = import.meta.env.VITE_OPENAI_API_KEY || import.meta.env.OPENAI_API_KEY;
    if (!apiKey || apiKey === 'PLACEHOLDER_API_KEY') {
      throw new Error('Не задан ключ OpenAI. Добавьте VITE_OPENAI_API_KEY в .env.local');
    }
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60_000);
    let response: Response;
    try {
      response = await fetch(OPENAI_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.4,
          max_tokens: 2048,
        }),
      });
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') {
        throw new Error('Запрос к ИИ превысил 60 секунд. Попробуйте снова.');
      }
      throw e;
    } finally {
      clearTimeout(timeoutId);
    }
    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Ошибка API: ${response.status}. ${err.slice(0, 200)}`);
    }
    const json = await response.json();
    const text = json?.choices?.[0]?.message?.content;
    if (typeof text !== 'string') {
      throw new Error('Пустой или неверный ответ от ИИ');
    }
    return text.trim();
  }

  const apiKey = import.meta.env.VITE_GEMINI_API_KEY || import.meta.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'PLACEHOLDER_API_KEY') {
    throw new Error('Не задан ключ Gemini. Добавьте VITE_GEMINI_API_KEY в .env.local');
  }
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60_000);
  let response: Response;
  try {
    response = await fetch(`${GEMINI_API_URL}?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.4, maxOutputTokens: 2048 },
      }),
    });
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      throw new Error('Запрос к ИИ превысил 60 секунд. Попробуйте снова.');
    }
    throw e;
  } finally {
    clearTimeout(timeoutId);
  }
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Ошибка API: ${response.status}. ${err.slice(0, 200)}`);
  }
  const json = await response.json();
  const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof text !== 'string') {
    throw new Error('Пустой или неверный ответ от ИИ');
  }
  return text.trim();
}

function matchesPeriod(month: string, period: string): boolean {
  if (period === 'All') return true;
  if (period.includes('-Q')) {
    const [qYear, qPart] = period.split('-Q');
    const [mYear, mMonth] = month.split('-');
    if (qYear !== mYear) return false;
    const monthNum = parseInt(mMonth, 10);
    const qNum = parseInt(qPart, 10);
    const startMonth = (qNum - 1) * 3 + 1;
    const endMonth = qNum * 3;
    return monthNum >= startMonth && monthNum <= endMonth;
  }
  return month === period;
}

function formatPeriodForPrompt(period: string): string {
  if (period === 'All') return 'за всё время';
  if (period.includes('-Q')) {
    const [year, q] = period.split('-Q');
    return `Квартал ${q} (${year})`;
  }
  const [year, mo] = period.split('-');
  const names = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
  return `${names[parseInt(mo, 10) - 1] ?? mo} ${year}`;
}

/** Сериализует сотрудника в JSON для отправки в API (с фильтром по периоду) */
function serializeEmployeeForAI(employee: EmployeeSummary, selectedPeriod: string = 'All'): unknown {
  const filterByPeriod = selectedPeriod !== 'All';

  const doctorsList = Array.from(employee.doctors.values()).map((doc: DoctorInteraction) => {
    let visitCount = doc.visitCount;
    let bonusAmount = doc.bonusAmount;
    if (filterByPeriod) {
      visitCount = 0;
      bonusAmount = 0;
      Object.entries(doc.history).forEach(([month, stats]) => {
        if (matchesPeriod(month, selectedPeriod)) {
          visitCount += (stats as { visits: number; bonuses: number }).visits;
          bonusAmount += (stats as { visits: number; bonuses: number }).bonuses;
        }
      });
    }
    return {
      doctorName: doc.doctorName,
      specialty: doc.specialty,
      institution: doc.institution,
      visitCount,
      bonusAmount,
    };
  });

  const monthlyAgg = new Map<string, { visits: number; bonuses: number }>();
  employee.doctors.forEach((doc: DoctorInteraction) => {
    Object.entries(doc.history).forEach(([month, stats]) => {
      if (filterByPeriod && !matchesPeriod(month, selectedPeriod)) return;
      const cur = monthlyAgg.get(month) ?? { visits: 0, bonuses: 0 };
      cur.visits += (stats as { visits: number; bonuses: number }).visits;
      cur.bonuses += (stats as { visits: number; bonuses: number }).bonuses;
      monthlyAgg.set(month, cur);
    });
  });
  const monthlyHistory = Array.from(monthlyAgg.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, stats]) => ({ month, visits: stats.visits, bonuses: stats.bonuses }));

  let totalVisits = employee.totalVisits;
  let totalBonuses = employee.totalBonuses;
  if (filterByPeriod) {
    totalVisits = monthlyHistory.reduce((s, h) => s + h.visits, 0);
    totalBonuses = monthlyHistory.reduce((s, h) => s + h.bonuses, 0);
  }

  return {
    name: employee.name,
    region: employee.region,
    group: employee.group,
    selectedPeriod: formatPeriodForPrompt(selectedPeriod),
    totalVisits,
    totalBonuses,
    activeDoctorsCount: employee.activeDoctorsCount,
    visitedDoctorsCount: employee.visitedDoctorsCount,
    contractsCount: employee.contractsCount,
    fullCycleCount: employee.fullCycleCount ?? 0,
    contractWithoutRecipesCount: employee.contractWithoutRecipesCount ?? 0,
    costPerVisit: Math.round(employee.costPerVisit),
    conversionRate: Number(employee.conversionRate.toFixed(1)),
    zeroResultVisits: employee.zeroResultVisits,
    wastedEffortDoctors: employee.wastedEffortDoctors,
    contractDoctorsPrescribedRate: employee.contractDoctorsPrescribedRate ?? 0,
    contractItemsComplianceRate: employee.contractItemsComplianceRate ?? 0,
    doctorsCount: doctorsList.length,
    monthlyHistory,
    topDoctors: doctorsList
      .sort((a, b) => b.bonusAmount - a.bonusAmount)
      .slice(0, 20),
    bottomDoctors: doctorsList
      .filter(d => d.visitCount > 0 && d.bonusAmount === 0)
      .sort((a, b) => b.visitCount - a.visitCount)
      .slice(0, 10),
  };
}

export async function getEmployeeAIAnalysis(employee: EmployeeSummary, selectedPeriod: string = 'All'): Promise<string> {
  const data = serializeEmployeeForAI(employee, selectedPeriod);
  const periodLabel = formatPeriodForPrompt(selectedPeriod);
  const prompt = `Ты — старший аналитик по эффективности медицинских представителей фармкомпании. Проанализируй данные сотрудника и дай развёрнутый структурированный отчёт на русском языке.

КРИТИЧЕСКИ ВАЖНО: Анализ должен быть СТРОГО в рамках выбранного периода — ${periodLabel}. Все цифры, выводы и рекомендации — только за этот период. Не используй данные за другие месяцы.

ВАЖНО — терминология УВК/бонусы:
- УВК (бонус) — это вознаграждение, которое компания даёт ВРАЧУ за выписанный рецепт. Получатель — врач, НЕ сотрудник.
- В данных «бонусы» / totalBonuses — это сумма УВК врачей на территории сотрудника (результат его работы).
- Никогда не пиши «сотрудник получил бонус» или «бонус сотрудника». Правильно: «сумма УВК по врачам», «врачи получили УВК», «бонусы врачей».

СТРОГО соблюдай формат ответа:
- Раздели отчёт на 4 секции с ТОЧНЫМИ заголовками (каждый на отдельной строке):

Общая оценка:
Эффективность:
Риски:
Рекомендации:

- Внутри каждой секции пиши по пунктам: каждый пункт с новой строки, начинай с "- ".
- Все ключевые цифры оборачивай в **жирный** (например: **415** визитов, конверсия **43.4%**).
- Между секциями оставляй пустую строку.

Содержание каждой секции:

1) Общая оценка:
- Общее впечатление о работе МП (сильные стороны, слабые места)
- Объём работы: визиты, бонусы, охват врачей (с цифрами)
- Полный цикл: сколько врачей прошли весь путь (договор → визит → рецепт)

2) Эффективность:
- Конверсия визитов в бонусы
- Стоимость привлечения одного визита
- Динамика по месяцам: растёт или падает активность (если есть данные за несколько месяцев)
- Соответствие договору: % врачей с договором, выписавших рецепты; % позиций договора покрытых рецептами

3) Риски:
- «Холостые» визиты (визиты без бонуса)
- Врачи с множеством визитов, но нулевым результатом
- Врачи с договором, но без рецептов
- Спад активности (если есть тренд)

4) Рекомендации:
- Краткие общие шаги (1–2 пункта)
- ОБЯЗАТЕЛЬНО — блок «С какими продуктами стоит работать»: по данным topDoctors/bottomDoctors и contractItemsComplianceRate выведи продукты из договора, которые требуют внимания (низкий охват, не выписываются). Каждый продукт — с новой строки, столбиком:
  - **Название продукта**
  - **Название продукта**
  Если в данных нет списка продуктов — укажи общие категории или врачей, с кем работать по продуктам.

Данные сотрудника (JSON):
${JSON.stringify(data, null, 2)}

Ответь только текстом отчёта. Не добавляй общий заголовок перед секциями.`;

  return callAI(prompt);
}

/** Задать произвольный вопрос по данным сотрудника и получить ответ в виде анализа */
export async function askCustomQuestion(employee: EmployeeSummary, question: string, selectedPeriod: string = 'All'): Promise<string> {
  if (!question.trim()) {
    throw new Error('Введите вопрос');
  }

  const data = serializeEmployeeForAI(employee, selectedPeriod);
  const periodLabel = formatPeriodForPrompt(selectedPeriod);
  const prompt = `Ты — старший аналитик по эффективности медицинских представителей фармкомпании. У тебя есть данные сотрудника (МП). Период анализа: ${periodLabel}. Пользователь задал следующий вопрос:

«${question.trim()}»

Ответь развёрнуто, опираясь на данные сотрудника. Используй конкретные цифры из данных. Форматируй ответ структурированно: используй пункты с "- ", выделяй ключевые числа в **жирный**. Пиши на русском языке.

Терминология: УВК (бонус) — вознаграждение ВРАЧУ за рецепт, не сотруднику. Не пиши «сотрудник получил бонус». Правильно: «сумма УВК по врачам», «бонусы врачей».

Данные сотрудника (JSON):
${JSON.stringify(data, null, 2)}

Ответь только текстом ответа, без общих заголовков.`;

  return callAI(prompt);
}

/** Контекст для AI-анализа врача: врач + МП + договор + рецепты */
export interface DoctorAIContext {
  doctor: DoctorInteraction;
  employeeName: string;
  selectedPeriod: string;
  contractItems: GenericRow[];
  recipeItems: GenericRow[];
  filteredRecipes: GenericRow[];
  contractVsRecipe: { contractNomenclature: string; contractQty: number; hasPrescribed: boolean; recipeQty?: number; recipeSum?: number }[];
  historyData: { month: string; visits: number; bonuses: number }[];
  totalVisits: number;
  totalBonuses: number;
  recipeSum: number;
}

function serializeDoctorForAI(ctx: DoctorAIContext): unknown {
  const getVal = (row: GenericRow, ...patterns: string[]) => {
    const k = Object.keys(row).find(key => patterns.some(p => key.toLowerCase().includes(p)));
    return k != null ? row[k] : '';
  };

  const recipesSummary = ctx.filteredRecipes.slice(0, 30).map(r => ({
    nomenclature: String(getVal(r, 'номенклатура')),
    qty: getVal(r, 'количество'),
    sum: getVal(r, 'сумма'),
    date: String(getVal(r, 'дата', 'отгрузк')),
  }));

  const periodLabel = formatPeriodForPrompt(ctx.selectedPeriod);

  return {
    doctor: {
      name: ctx.doctor.doctorName,
      specialty: ctx.doctor.specialty,
      institution: ctx.doctor.institution,
      visitCount: ctx.totalVisits,
      bonusAmount: ctx.totalBonuses,
    },
    mp: ctx.employeeName,
    selectedPeriod: periodLabel,
    totalVisits: ctx.totalVisits,
    totalBonuses: ctx.totalBonuses,
    recipeSum: ctx.recipeSum,
    recipeCount: ctx.filteredRecipes.length,
    contractItemsCount: ctx.contractItems.length,
    monthlyHistory: ctx.historyData,
    contractSummary: ctx.contractVsRecipe.map(c => ({
      product: c.contractNomenclature,
      contractQty: c.contractQty,
      prescribed: c.hasPrescribed,
      recipeQty: c.recipeQty,
      recipeSum: c.recipeSum,
    })),
    contractItems: ctx.contractItems.slice(0, 20).map(r => ({
      nomenclature: String(getVal(r, 'номенклатура')),
      qty: getVal(r, 'количество'),
    })),
    recipesSample: recipesSummary,
  };
}

export async function getDoctorAIAnalysis(ctx: DoctorAIContext): Promise<string> {
  const data = serializeDoctorForAI(ctx);
  const periodLabel = formatPeriodForPrompt(ctx.selectedPeriod);
  const prompt = `Ты — старший аналитик по эффективности медицинских представителей фармкомпании. Проанализируй данные конкретного врача и его взаимодействия с МП (медицинским представителем). Дай развёрнутый структурированный отчёт на русском языке.

КРИТИЧЕСКИ ВАЖНО: Анализ должен быть СТРОГО в рамках выбранного периода — ${periodLabel}. Все цифры, выводы и рекомендации — только за этот период. Данные в JSON уже отфильтрованы по периоду.

ВАЖНО — терминология УВК/бонусы:
- УВК (бонус) — вознаграждение ВРАЧУ за выписанный рецепт. Получатель — врач.
- Не пиши «сотрудник получил бонус». Правильно: «врач получил УВК», «бонусы врача».

СТРОГО соблюдай формат ответа:
- Раздели отчёт на 4 секции с ТОЧНЫМИ заголовками:

Общая оценка:
Эффективность:
Риски:
Рекомендации:

- Внутри каждой секции пиши по пунктам: каждый пункт с новой строки, начинай с "- ".
- Все ключевые цифры оборачивай в **жирный** (например: **6** визитов, **54 000** бонусов).
- Между секциями оставляй пустую строку.

Содержание секций:

1) Общая оценка:
- Общее впечатление о работе врача с МП
- Специализация, ЛПУ, объём визитов и УВК
- Соответствие договору: выписывает ли продукты из договора

2) Эффективность:
- Конверсия визитов в рецепты и УВК
- Динамика по месяцам: растёт или падает активность
- Соответствие договору: какие позиции выписывает, какие нет

3) Риски:
- Позиции договора без рецептов
- Месяцы без активности

4) Рекомендации:
- Краткие общие шаги для МП (1–2 пункта)
- ОБЯЗАТЕЛЬНО — блок «С какими продуктами стоит работать»: выведи список продуктов из договора, которые врач НЕ выписывает или выписывает мало. Каждый продукт — с новой строки, столбиком, формат:
  - **Название продукта**
  - **Название продукта**
  Используй точные названия из contractSummary (поле product, где prescribed: false или recipeQty низкий).

Данные (JSON):
${JSON.stringify(data, null, 2)}

Ответь только текстом отчёта. Не добавляй общий заголовок перед секциями.`;

  return callAI(prompt);
}

/** Задать вопрос по данным врача и МП */
export async function askDoctorCustomQuestion(ctx: DoctorAIContext, question: string): Promise<string> {
  if (!question.trim()) {
    throw new Error('Введите вопрос');
  }

  const data = serializeDoctorForAI(ctx);
  const periodLabel = formatPeriodForPrompt(ctx.selectedPeriod);
  const prompt = `Ты — старший аналитик по эффективности медицинских представителей. У тебя есть данные врача и его взаимодействия с МП (${ctx.employeeName}). Период анализа: ${periodLabel}. Пользователь задал вопрос:

«${question.trim()}»

Ответь развёрнуто, опираясь на данные. Используй конкретные цифры. Форматируй структурированно: пункты с "- ", ключевые числа в **жирный**. Пиши на русском.

Терминология: УВК (бонус) — вознаграждение ВРАЧУ за рецепт. Не пиши «сотрудник получил бонус».

Данные (JSON):
${JSON.stringify(data, null, 2)}

Ответь только текстом ответа.`;

  return callAI(prompt);
}
