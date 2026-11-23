import { assign, setup } from 'xstate';
import {
  TRIAGE_ISSUES,
  scoreTriageAnswer,
  type IssueLabel,
  type IssuePriority,
  type TriageAnswer,
  type TriageResult,
} from './issueTriage';

export interface TriageContext {
  currentIndex: number;
  answers: TriageAnswer[];
  selectedPriority: IssuePriority | null;
  selectedLabels: IssueLabel[];
  lastResult: TriageResult | null;
  totalPoints: number;
  feedback: string;
}

export type TriageEvent =
  | { type: 'START' }
  | { type: 'SET_PRIORITY'; priority: IssuePriority }
  | { type: 'TOGGLE_LABEL'; label: IssueLabel }
  | { type: 'SUBMIT' }
  | { type: 'NEXT' }
  | { type: 'RESTART' };

const initialContext: TriageContext = {
  currentIndex: 0,
  answers: [],
  selectedPriority: null,
  selectedLabels: [],
  lastResult: null,
  totalPoints: 0,
  feedback: '',
};

const resetSelection = {
  selectedPriority: null as IssuePriority | null,
  selectedLabels: [] as IssueLabel[],
  feedback: '',
  lastResult: null as TriageResult | null,
};

export const issueTriageMachine = setup({
  types: {
    context: {} as TriageContext,
    events: {} as TriageEvent,
  },
  actions: {
    setPriority: assign(({ context, event }) => {
      if (event.type !== 'SET_PRIORITY') return context;
      return { ...context, selectedPriority: event.priority };
    }),
    toggleLabel: assign(({ context, event }) => {
      if (event.type !== 'TOGGLE_LABEL') return context;
      const selectedLabels = context.selectedLabels.includes(event.label)
        ? context.selectedLabels.filter((l) => l !== event.label)
        : [...context.selectedLabels, event.label];
      return { ...context, selectedLabels };
    }),
    scoreCurrent: assign(({ context }) => {
      const issue = TRIAGE_ISSUES[context.currentIndex];
      if (!issue || !context.selectedPriority) {
        return { ...context, feedback: 'Select a priority before submitting.' };
      }

      const answer: TriageAnswer = {
        issueId: issue.id,
        priority: context.selectedPriority,
        labels: context.selectedLabels,
      };
      const result = scoreTriageAnswer(issue, answer);
      const answers = [...context.answers.filter((a) => a.issueId !== issue.id), answer];

      return {
        ...context,
        answers,
        lastResult: result,
        totalPoints: context.totalPoints + result.points,
        feedback: result.feedback,
      };
    }),
    advanceIssue: assign(({ context }) => ({
      ...context,
      currentIndex: context.currentIndex + 1,
      ...resetSelection,
    })),
    resetGame: assign(() => ({
      ...initialContext,
    })),
  },
  guards: {
    canSubmit: ({ context }) =>
      Boolean(context.selectedPriority) && context.selectedLabels.length > 0,
    hasMoreIssues: ({ context }) => context.currentIndex + 1 < TRIAGE_ISSUES.length,
  },
}).createMachine({
  id: 'issueTriage',
  initial: 'idle',
  context: initialContext,
  states: {
    idle: {
      on: { START: 'question' },
    },
    question: {
      on: {
        SET_PRIORITY: { actions: { type: 'setPriority' } },
        TOGGLE_LABEL: { actions: { type: 'toggleLabel' } },
        SUBMIT: {
          guard: { type: 'canSubmit' },
          target: 'feedback',
          actions: { type: 'scoreCurrent' },
        },
      },
    },
    feedback: {
      on: {
        NEXT: [
          {
            guard: { type: 'hasMoreIssues' },
            target: 'question',
            actions: { type: 'advanceIssue' },
          },
          { target: 'complete' },
        ],
      },
    },
    complete: {
      on: {
        RESTART: {
          target: 'question',
          actions: { type: 'resetGame' },
        },
      },
    },
  },
});

export default issueTriageMachine;
