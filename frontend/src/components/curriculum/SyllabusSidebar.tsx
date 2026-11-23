'use client';

import React, { useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { CheckCircle2, Circle, Lock, ChevronLeft, ChevronRight, BookOpen } from 'lucide-react';
import { ModuleItem, LessonItem } from './types';

interface SyllabusSidebarProps {
  modules: ModuleItem[];
}

export default function SyllabusSidebar({ modules }: SyllabusSidebarProps) {
  const [isOpen, setIsOpen] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  const handleLessonClick = (lesson: LessonItem) => {
    if (lesson.status === 'locked') return;
    // Route to target lesson dynamically based on slug parameters
    router.push(`/curriculum/${lesson.slug}`);
  };

  const renderStatusIcon = (status: LessonItem['status']) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 size={16} className="text-emerald-500 shrink-0" />;
      case 'in_progress':
        return <Circle size={16} className="text-blue-400 fill-blue-400/20 shrink-0" />;
      case 'locked':
        return <Lock size={14} className="text-slate-600 shrink-0" />;
    }
  };

  return (
    <div className="relative h-full flex bg-slate-900 border-r border-slate-800 transition-all duration-300">
      {/* 1. Core Expandable Menu Frame Panel */}
      <aside
        className={`h-full overflow-y-auto transition-all duration-300 ${
          isOpen ? 'w-80 opacity-100' : 'w-0 opacity-0 pointer-events-none'
        }`}
      >
        <div className="p-6 border-b border-slate-800 flex items-center gap-2">
          <BookOpen size={18} className="text-blue-500" />
          <h2 className="font-bold text-white tracking-wide">Course Syllabus</h2>
        </div>

        <nav className="p-4 space-y-6">
          {modules.map((mod, modIdx) => (
            <div key={mod.id} className="space-y-2">
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider px-2">
                Mod {modIdx + 1}: {mod.title}
              </h3>

              <ul className="space-y-1">
                {mod.lessons.map((lesson) => {
                  const isActive = pathname?.includes(lesson.slug);
                  const isLocked = lesson.status === 'locked';

                  return (
                    <li key={lesson.id}>
                      <button
                        type="button"
                        disabled={isLocked}
                        onClick={() => handleLessonClick(lesson)}
                        className={`w-full flex items-center justify-between p-2.5 rounded-lg text-left text-sm font-medium transition-all ${
                          isActive
                            ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
                            : isLocked
                              ? 'text-slate-600 cursor-not-allowed hover:bg-transparent'
                              : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                        }`}
                      >
                        <span className="truncate pr-2">{lesson.title}</span>
                        {renderStatusIcon(lesson.status)}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
      </aside>

      {/* 2. Floating Minimize/Collapse Edge Anchor Control Toggle */}
      <div className="absolute top-1/2 -translate-y-1/2 -right-3 z-40">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="w-6 h-12 bg-slate-800 border border-slate-700 text-slate-400 hover:text-white rounded-md flex items-center justify-center shadow-md hover:bg-slate-700 transition-colors"
          aria-label={isOpen ? 'Collapse sidebar' : 'Expand sidebar'}
        >
          {isOpen ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
        </button>
      </div>
    </div>
  );
}
