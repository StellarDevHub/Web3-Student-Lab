'use client';

import React, { useEffect, useRef } from 'react';
import { ShortcutDef } from './KeyboardShortcutsProvider';

export interface ShortcutHelpModalProps {
  isOpen: boolean;
  onClose: () => void;
  shortcuts?: ShortcutDef[];
}

export const ShortcutHelpModal: React.FC<ShortcutHelpModalProps> = ({ isOpen, onClose, shortcuts = [] }) => {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen && !dialog.open) {
      dialog.showModal();
    } else if (!isOpen && dialog.open) {
      dialog.close();
    }
  }, [isOpen]);

  // Close modal when clicking on the backdrop
  const handleBackdropClick = (e: React.MouseEvent<HTMLDialogElement>) => {
    if (e.target === dialogRef.current) {
      onClose();
    }
  };

  if (!isOpen) return null;

  const displayShortcuts = shortcuts.length > 0 ? shortcuts : [
    { keys: ['Ctrl/Cmd', 'K'], desc: 'Open shortcut help panel' },
    { keys: ['G', 'C'], desc: 'Navigate to the course catalog' },
    { keys: ['G', 'R'], desc: 'Navigate to the roadmap' },
    { keys: ['G', 'V'], desc: 'Navigate to the verification center' },
    { keys: ['G', 'D'], desc: 'Navigate to the dashboard' },
    { keys: ['Ctrl/Cmd', 'Shift', 'T'], desc: 'Toggle between light and dark theme' },
    { keys: ['Ctrl/Cmd', 'Shift', 'C'], desc: 'Compile code in the playground' },
  ];

  return (
    <dialog
      ref={dialogRef}
      onClick={handleBackdropClick}
      onClose={onClose}
      className="fixed inset-0 z-50 p-6 rounded-xl shadow-2xl backdrop:bg-black/60 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 w-full max-w-lg m-auto"
      aria-labelledby="shortcuts-modal-title"
    >
      <div className="flex justify-between items-center mb-6">
        <h2 id="shortcuts-modal-title" className="text-2xl font-bold">
          Keyboard Shortcuts
        </h2>
        <button
          onClick={onClose}
          className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
          aria-label="Close shortcuts help"
        >
          ✕
        </button>
      </div>

      <div className="space-y-3">
        {displayShortcuts.map((shortcut, idx) => (
          <div key={idx} className="flex justify-between items-center py-2 border-b border-gray-100 dark:border-gray-700 last:border-0">
            <span className="text-sm font-medium">{shortcut.desc}</span>
            <div className="flex gap-1.5">
              {shortcut.keys.map((key, kIdx) => (
                <kbd
                  key={kIdx}
                  className="px-2 py-1 text-xs font-semibold text-gray-800 bg-gray-100 border border-gray-200 rounded-md dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 shadow-sm"
                >
                  {key}
                </kbd>
              ))}
            </div>
          </div>
        ))}
      </div>
    </dialog>
  );
};
