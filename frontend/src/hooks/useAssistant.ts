import { useState } from "react";

interface AssistantResult {
  suggestion: string;
  codeBlocks: string[];
}

export function useAssistant() {
  const [result, setResult] = useState<AssistantResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function ask(code: string, errorLog: string) {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, errorLog }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Unknown error");
        return;
      }

      // Extract fenced code blocks for highlight rendering
      const codeBlocks: string[] = [];
      const regex = /```(?:\w+)?\n([\s\S]*?)```/g;
      let match;
      while ((match = regex.exec(data.suggestion)) !== null) {
        codeBlocks.push(match[1].trim());
      }

      setResult({ suggestion: data.suggestion, codeBlocks });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setLoading(false);
    }
  }

  return { ask, result, loading, error };
}
