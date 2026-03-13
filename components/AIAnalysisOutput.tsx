import React, { useState } from 'react';
import { BarChart3, TrendingUp, AlertTriangle, Lightbulb, Copy, Check } from 'lucide-react';

/** Выделяет числа и **жирный** текст в строке */
function formatInlineText(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  let key = 0;

  const boldRegex = /\*\*([^*]+)\*\*/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  const pushSegment = (segment: string) => {
    const numberRegex = /\b(\d[\d\s.,]*%?)\b/g;
    let numLast = 0;
    let numMatch: RegExpExecArray | null;
    while ((numMatch = numberRegex.exec(segment)) !== null) {
      if (numMatch.index > numLast) {
        parts.push(<React.Fragment key={key++}>{segment.slice(numLast, numMatch.index)}</React.Fragment>);
      }
      parts.push(
        <span key={key++} className="font-semibold text-primary-600 tabular-nums">
          {numMatch[1]}
        </span>
      );
      numLast = numberRegex.lastIndex;
    }
    if (numLast < segment.length) {
      parts.push(<React.Fragment key={key++}>{segment.slice(numLast)}</React.Fragment>);
    }
  };

  while ((match = boldRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      pushSegment(text.slice(lastIndex, match.index));
    }
    parts.push(
      <strong key={key++} className="text-dark-DEFAULT font-semibold">
        {match[1]}
      </strong>
    );
    lastIndex = boldRegex.lastIndex;
  }
  if (lastIndex < text.length) {
    pushSegment(text.slice(lastIndex));
  }
  if (parts.length === 0) {
    pushSegment(text);
  }
  return parts;
}

interface SectionConfig {
  icon: React.FC<{ size?: number; className?: string }>;
  borderColor: string;
  iconBg: string;
  iconColor: string;
}

const SECTION_CONFIGS: Record<string, SectionConfig> = {
  'общая оценка': {
    icon: BarChart3,
    borderColor: 'border-l-blue-500',
    iconBg: 'bg-blue-50',
    iconColor: 'text-blue-600',
  },
  'эффективность': {
    icon: TrendingUp,
    borderColor: 'border-l-emerald-500',
    iconBg: 'bg-emerald-50',
    iconColor: 'text-emerald-600',
  },
  'риски': {
    icon: AlertTriangle,
    borderColor: 'border-l-red-500',
    iconBg: 'bg-red-50',
    iconColor: 'text-red-600',
  },
  'рекомендации': {
    icon: Lightbulb,
    borderColor: 'border-l-violet-500',
    iconBg: 'bg-violet-50',
    iconColor: 'text-violet-600',
  },
};

function getSectionConfig(title: string): SectionConfig | null {
  const lower = title.toLowerCase().replace(/[:\d).\s]+/g, ' ').trim();
  for (const [key, config] of Object.entries(SECTION_CONFIGS)) {
    if (lower.includes(key)) return config;
  }
  return null;
}

interface ParsedSection {
  title: string;
  lines: string[];
  config: SectionConfig | null;
}

function parseIntoSections(text: string): ParsedSection[] {
  const sections: ParsedSection[] = [];
  const blocks = text.split('\n');
  let current: ParsedSection | null = null;

  for (const rawLine of blocks) {
    const line = rawLine.trim();
    if (!line) continue;

    // Detect section headers: "Общая оценка:", "1) Эффективность:", etc.
    const headerMatch = line.match(/^(?:\d+[.)]\s*)?([^:]+):\s*$/);
    if (headerMatch) {
      const title = headerMatch[1].trim();
      const config = getSectionConfig(title);
      if (config) {
        if (current) sections.push(current);
        current = { title, lines: [], config };
        continue;
      }
    }

    if (current) {
      current.lines.push(line);
    } else {
      // Lines before any section — create an intro section
      if (!sections.length || sections[sections.length - 1].config !== null) {
        sections.push({ title: '', lines: [line], config: null });
      } else {
        sections[sections.length - 1].lines.push(line);
      }
    }
  }
  if (current) sections.push(current);

  return sections;
}

const isBulletLine = (line: string) => /^[-•*]\s/.test(line) || /^\d+[.)]\s/.test(line);
const getBulletContent = (line: string) => {
  const m = line.match(/^[-•*]\s+(.*)$/) || line.match(/^\d+[.)]\s+(.*)$/);
  return m ? m[1] : line;
};

function renderLines(lines: string[]) {
  const bullets = lines.filter(isBulletLine);
  const plain = lines.filter(l => !isBulletLine(l));

  return (
    <div className="space-y-2">
      {plain.length > 0 && (
        <p className="text-slate-700 leading-relaxed">
          {formatInlineText(plain.join(' '))}
        </p>
      )}
      {bullets.length > 0 && (
        <ul className="list-none space-y-2 pl-0">
          {bullets.map((line, i) => (
            <li key={i} className="flex gap-2">
              <span className="text-primary-500 font-bold shrink-0 mt-0.5">•</span>
              <span className="text-slate-700 leading-relaxed">{formatInlineText(getBulletContent(line))}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

interface Props {
  text: string;
  /** Показать кнопку копирования */
  copyable?: boolean;
}

export const AIAnalysisOutput: React.FC<Props> = ({ text, copyable }) => {
  const [copied, setCopied] = useState(false);
  const sections = parseIntoSections(text);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback for older browsers
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="space-y-4">
      {copyable && (
        <div className="flex justify-end -mt-1 mb-2">
          <button
            type="button"
            onClick={handleCopy}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-slate-600 hover:text-violet-600 hover:bg-violet-50 rounded-lg border border-slate-200 hover:border-violet-200 transition-colors"
          >
            {copied ? (
              <>
                <Check size={14} className="text-emerald-600" />
                Скопировано
              </>
            ) : (
              <>
                <Copy size={14} />
                Копировать
              </>
            )}
          </button>
        </div>
      )}
      {sections.map((section, idx) => {
        if (!section.config) {
          // Plain intro text
          return (
            <div key={idx} className="text-slate-700 leading-relaxed">
              {renderLines(section.lines)}
            </div>
          );
        }

        const { icon: Icon, borderColor, iconBg, iconColor } = section.config;

        return (
          <div
            key={idx}
            className={`bg-white rounded-lg border border-slate-200 border-l-4 ${borderColor} p-4 shadow-sm`}
            style={{ animation: `fadeInUp 0.4s ease-out ${idx * 0.1}s both` }}
          >
            <div className="flex items-center gap-3 mb-3">
              <div className={`p-2 rounded-lg ${iconBg}`}>
                <Icon size={18} className={iconColor} />
              </div>
              <h4 className="font-bold text-dark-DEFAULT text-sm uppercase tracking-wide">
                {section.title}
              </h4>
            </div>
            {renderLines(section.lines)}
          </div>
        );
      })}

      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
};
