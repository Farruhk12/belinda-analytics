import React from 'react';
import { getAIProvider, setAIProvider, type AIProvider } from '../services/aiAnalysisService';

interface Props {
  className?: string;
}

export const AIProviderSelector: React.FC<Props> = ({ className = '' }) => {
  const [provider, setProviderState] = React.useState<AIProvider>(() => getAIProvider());

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const v = e.target.value as AIProvider;
    setAIProvider(v);
    setProviderState(v);
  };

  return (
    <select
      value={provider}
      onChange={handleChange}
      className={`px-3 py-1.5 border border-slate-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-violet-500 focus:outline-none text-slate-600 ${className}`}
      title="Выбор модели ИИ"
    >
      <option value="gemini">Gemini</option>
      <option value="gpt">GPT</option>
    </select>
  );
};
