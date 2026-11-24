import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { RobotIcon } from '../icons';
import type { ActionSelection } from './ActionSelection';

interface Props {
  selection: ActionSelection;
  onAsk: () => void;
  onPolish: () => void;
}

export default function SelectionActionBubble({ selection, onAsk, onPolish }: Props) {
  const { t } = useTranslation();
  const bubble = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  useLayoutEffect(() => {
    function update() {
      const bounds = selection.getBounds();
      if (!bounds || !bubble.current) {
        setPosition(null);
        return;
      }
      const { start, end, editor } = bounds;
      const { width, height } = bubble.current.getBoundingClientRect();
      const anchorTop = Math.min(start.top, end.top);
      const anchorBottom = Math.max(start.bottom, end.bottom);
      const center =
        Math.abs(start.top - end.top) < 4
          ? (start.left + end.right) / 2
          : (editor.left + editor.right) / 2;
      const above = anchorTop - height - 8;
      const top = above >= Math.max(editor.top, 0) ? above : anchorBottom + 8;
      setPosition({
        top: Math.max(0, Math.min(top, window.innerHeight - height)),
        left: Math.max(0, Math.min(center - width / 2, window.innerWidth - width)),
      });
    }
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [selection, t]);

  return createPortal(
    <div
      ref={bubble}
      className="fixed z-[9999] flex items-center gap-1.5 max-w-[100vw]"
      style={position ?? { visibility: 'hidden' }}
    >
      <button
        type="button"
        onMouseDown={(e) => {
          // Prevent the editor from losing selection before our click handler fires.
          e.preventDefault();
        }}
        onClick={onPolish}
        className="flex items-center gap-1 px-2.5 py-1 rounded-full shadow-lg text-xs font-medium transition-transform hover:scale-105"
        style={{ backgroundColor: '#f97316', color: 'white' }}
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"
          />
        </svg>
        {t('AI polish')}
      </button>
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={onAsk}
        className="flex items-center gap-1 px-2.5 py-1 rounded-full shadow-lg text-xs font-medium transition-transform hover:scale-105"
        style={{ backgroundColor: 'var(--text-primary)', color: 'var(--bg-primary)' }}
      >
        <RobotIcon size={14} /> {t('Ask Fish about selection')}
      </button>
    </div>,
    document.body,
  );
}
