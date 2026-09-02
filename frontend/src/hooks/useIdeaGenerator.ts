import { useCallback, useState } from 'react';
import { generatorAPI, type ProjectIdea } from '@/lib/api';
import {
  DEFAULT_FILTERS,
  buildGeneratorParams,
  generateLocalIdea,
  validateFilters,
  type IdeaFilters,
} from '@/lib/idea-generator/ideaGenerator';

/**
 * useIdeaGenerator — orchestrates idea generation.
 *
 * Integrates with the existing API infrastructure via {@link generatorAPI}
 * (server-side OpenAI). Layered fallbacks satisfy the "proper error handling and
 * fallbacks" requirement:
 *   1. Validate filters locally — never spend an AI call on bad input.
 *   2. Call the AI endpoint with the mapped parameters.
 *   3. On any failure, deterministically synthesise an idea from domain
 *      templates so the user always gets a relevant result (`isFallback`).
 */
export interface UseIdeaGeneratorResult {
  idea: ProjectIdea | null;
  isGenerating: boolean;
  error: string | null;
  /** True when the displayed idea came from a fallback (backend safe-mock or local template). */
  isFallback: boolean;
  /** Actionable explanation of why a fallback idea is being shown, if any. */
  fallbackMessage: string | null;
  /** Validation errors for the supplied filters (empty when valid). */
  generate: (filters: IdeaFilters) => Promise<void>;
}

export function useIdeaGenerator(): UseIdeaGeneratorResult {
  const [idea, setIdea] = useState<ProjectIdea | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isFallback, setIsFallback] = useState(false);
  const [fallbackMessage, setFallbackMessage] = useState<string | null>(null);

  const generate = useCallback(async (filters: IdeaFilters = DEFAULT_FILTERS) => {
    const validation = validateFilters(filters);
    if (!validation.valid) {
      setError(validation.errors.join(' '));
      return;
    }

    setIsGenerating(true);
    setError(null);
    try {
      const result = await generatorAPI.generateIdeaWithStatus(buildGeneratorParams(filters));
      setIdea(result.idea);
      setIsFallback(result.fromMock);
      setFallbackMessage(result.fromMock ? result.message ?? null : null);
    } catch {
      // Network/HTTP failure reaching the backend at all: graceful
      // degradation via local template synthesis so the user always
      // gets a relevant result.
      setIdea(generateLocalIdea(filters));
      setIsFallback(true);
      setFallbackMessage(
        'The idea generator is temporarily unreachable, so we generated an example idea locally instead.'
      );
    } finally {
      setIsGenerating(false);
    }
  }, []);

  return { idea, isGenerating, error, isFallback, fallbackMessage, generate };
}
