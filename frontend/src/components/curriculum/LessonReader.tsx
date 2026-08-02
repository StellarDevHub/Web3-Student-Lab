'use client';

import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSlug from 'rehype-slug';
import { customMarkdownComponents } from './CustomMarkdownComponents';

interface LessonReaderProps {
  content: string;
  title: string;
}

export default function LessonReader({ content, title }: LessonReaderProps) {
  return (
    <div className="w-full h-full bg-slate-950 p-6 md:p-8 overflow-y-auto">
      {/* Slide Navigation Header context */}
      <header className="border-b border-slate-800 pb-4 mb-6">
        <span className="text-xs font-semibold uppercase tracking-wider text-blue-500">Curriculum Module</span>
        <h2 className="text-xl font-bold text-white mt-1">{title}</h2>
      </header>

      {/* Core Markdown Renderer container block */}
      <article className="prose prose-invert max-w-none">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[rehypeSlug]}
          components={customMarkdownComponents as any}
        >
          {content}
        </ReactMarkdown>
      </article>
    </div>
  );
}
