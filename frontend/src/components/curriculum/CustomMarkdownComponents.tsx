import React from 'react';
import { PrismAsyncLight as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/cjs/styles/prism';

export const customMarkdownComponents = {
  // 1. Target and style custom blocks / alert elements syntax (e.g. > [!NOTE] Block)
  blockquote: ({ children }: { children: React.ReactNode }) => {
    const textContent = React.Children.toArray(children).map(c => (c as any)?.props?.children?.join?.('') || '').join(' ');

    // Check for custom callout syntax flags inside blockquotes
    const isNote = textContent.includes('[!NOTE]');
    const isWarning = textContent.includes('[!WARNING]');

    if (isNote || isWarning) {
      const cleanChildren = React.Children.map(children, (child: any) => {
        if (!child) return null;
        const modifiedText = child.props?.children?.filter?.((t: any) => typeof t !== 'string' || (!t.includes('[!NOTE]') && !t.includes('[!WARNING]')));
        return { ...child, props: { ...child.props, children: modifiedText } };
      });

      return (
        <div className={`my-6 p-4 border-l-4 rounded-r-md ${
          isWarning
            ? 'bg-amber-950/30 border-amber-500 text-amber-200'
            : 'bg-blue-950/30 border-blue-500 text-blue-200'
        }`}>
          <span className="font-bold block text-sm tracking-wide uppercase mb-1">
            {isWarning ? '⚠️ Warning' : '💡 Information'}
          </span>
          {cleanChildren}
        </div>
      );
    }

    return <blockquote className="border-l-4 border-slate-600 pl-4 my-4 italic text-slate-400">{children}</blockquote>;
  },

  // 2. Add Code syntax syntax-highlighter bindings
  code: ({ node, inline, className, children, ...props }: any) => {
    const match = /language-(\w+)/.exec(className || '');
    return !inline && match ? (
      <div className="rounded-lg overflow-hidden my-6 text-sm font-mono border border-slate-800">
        <SyntaxHighlighter
          {...props}
          style={oneDark}
          language={match[1]}
          PreTag="div"
          customStyle={{ margin: 0, background: '#0f172a' }}
        >
          {String(children).replace(/\n$/, '')}
        </SyntaxHighlighter>
      </div>
    ) : (
      <code {...props} className="bg-slate-800 text-pink-400 px-1.5 py-0.5 rounded font-mono text-sm">
        {children}
      </code>
    );
  },

  // 3. Typographic scaling overrides matching the technical specification design language
  h1: ({ children, id }: any) => (
    <h1 id={id} className="text-3xl font-extrabold text-white mt-8 mb-4 tracking-tight scroll-m-20 group flex items-center">
      {children}
      <a href={`#${id}`} className="ml-2 text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity">#</a>
    </h1>
  ),
  h2: ({ children, id }: any) => (
    <h2 id={id} className="text-2xl font-bold text-slate-100 mt-6 mb-3 tracking-tight scroll-m-20 group flex items-center">
      {children}
      <a href={`#${id}`} className="ml-2 text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity">#</a>
    </h2>
  ),
  p: ({ children }: any) => <p className="text-slate-300 leading-7 mb-4">{children}</p>,
  ul: ({ children }: any) => <ul className="list-disc list-inside space-y-2 mb-4 text-slate-300 pl-4">{children}</ul>,
  ol: ({ children }: any) => <ol className="list-decimal list-inside space-y-2 mb-4 text-slate-300 pl-4">{children}</ol>,
};
