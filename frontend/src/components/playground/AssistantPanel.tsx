"use client";

import { useAssistant } from "@/hooks/useAssistant";

interface AssistantPanelProps {
  getCode: () => string;
  errorLog: string;
}

/**
 * Renders the "Ask Assistant" button and the AI response panel.
 * Prose text is shown as plain paragraphs; fenced code blocks are
 * highlighted in a styled <pre> so suggested fixes are easy to spot.
 */
export function AssistantPanel({ getCode, errorLog }: AssistantPanelProps) {
  const { ask, result, loading, error } = useAssistant();

  function handleAsk() {
    ask(getCode(), errorLog);
  }

  // Split the suggestion into segments: text vs. code-block
  const segments = result
    ? parseSegments(result.suggestion)
    : [];

  return (
    <div className="bg-zinc-950 border border-white/10 rounded-3xl p-8 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h4 className="text-[10px] font-black text-white uppercase tracking-widest">
          AI Assistant
        </h4>
        <button
          onClick={handleAsk}
          disabled={loading}
          className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
            loading
              ? "bg-zinc-800 text-gray-500 cursor-not-allowed"
              : "bg-red-600 text-white hover:bg-red-500 active:scale-95"
          }`}
        >
          {loading ? "Thinking..." : "Ask Assistant"}
        </button>
      </div>

      {error && (
        <p className="text-[11px] text-red-400 font-mono">{error}</p>
      )}

      {!result && !loading && !error && (
        <p className="text-[11px] text-gray-600 font-light leading-relaxed">
          Click <span className="text-white font-bold">Ask Assistant</span> to
          get an explanation of compiler errors and suggested fixes.
        </p>
      )}

      {result && (
        <div className="flex flex-col gap-3 overflow-y-auto max-h-96 pr-1">
          {segments.map((seg, i) =>
            seg.type === "code" ? (
              // Highlighted suggested code block
              <pre
                key={i}
                className="bg-black border border-red-600/30 rounded-xl p-4 text-[11px] text-green-400 font-mono leading-relaxed overflow-x-auto whitespace-pre-wrap"
              >
                {seg.content}
              </pre>
            ) : (
              <p
                key={i}
                className="text-[11px] text-gray-400 leading-relaxed font-light"
              >
                {seg.content}
              </p>
            )
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface Segment {
  type: "text" | "code";
  content: string;
}

/** Split an LLM response into alternating text / fenced-code segments. */
function parseSegments(text: string): Segment[] {
  const parts = text.split(/(```(?:\w+)?\n[\s\S]*?```)/g);
  return parts
    .filter((p) => p.trim())
    .map((p) => {
      const codeMatch = p.match(/^```(?:\w+)?\n([\s\S]*?)```$/);
      if (codeMatch) return { type: "code", content: codeMatch[1].trim() };
      return { type: "text", content: p.trim() };
    });
}
