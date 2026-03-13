<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1DRtiJsqQd3LFmJTLBG57zmMyAnUqUO-I

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key (для кнопки «Анализ ИИ»).
3. **Данные: Excel + Supabase** (вместо Google Таблиц):
   - Создайте проект в [Supabase](https://supabase.com), выполните SQL из `supabase/schema.sql` (таблица `app_data`).
   - В `.env.local` добавьте `VITE_SUPABASE_URL` и `VITE_SUPABASE_ANON_KEY` (см. `env.example`).
   - В приложении нажмите **«Загрузить Excel»** и выберите файл с листами: **УВК**, **Бонусы**, **Договор**, **Рецепт**. Данные будут загружены в Supabase и отображаться в платформе.
   - Если Supabase не настроен, данные по‑прежнему подтягиваются из Google Таблиц (старые URL в `constants.ts`).
4. Run the app:
   `npm run dev`
