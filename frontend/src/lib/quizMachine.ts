import { assign, setup } from 'xstate';
import { quizQuestions } from './quizQuestions';

export interface QuizContext {
  currentIndex: number;
  score: number;
  selectedOption: string | null;
  selectedOptions: string[];
  dragOrder: string[];
  snippetSelection: string | null;
  visibleChoices: string[];
  hintUsed: boolean;
  fiftyUsed: boolean;
  feedback: string;
  timedOut: boolean;
  correctAnswer: string | null;
}

export type QuizEvent =
  | { type: 'START' }
  | { type: 'SELECT_OPTION'; choice: string }
  | { type: 'TOGGLE_OPTION'; choice: string }
  | { type: 'UPDATE_ORDER'; order: string[] }
  | { type: 'UPDATE_SNIPPET'; choice: string }
  | { type: 'USE_HINT' }
  | { type: 'USE_FIFTY_FIFTY' }
  | { type: 'SUBMIT' }
  | { type: 'TIMEOUT' }
  | { type: 'NEXT' }
  | { type: 'RESTART' };

const initialContext: QuizContext = {
  currentIndex: 0,
  score: 0,
  selectedOption: null,
  selectedOptions: [],
  dragOrder: [],
  snippetSelection: null,
  visibleChoices: [],
  hintUsed: false,
  fiftyUsed: false,
  feedback: '',
  timedOut: false,
  correctAnswer: null,
};

const randomize = (input: string[]) => [...input].sort(() => Math.random() - 0.5);

const buildQuestionContext = (index: number) => {
  const question = quizQuestions[index];
  const choicePool =
    question.type === 'multiple-choice'
      ? question.options
      : question.type === 'code-fill'
        ? question.choices
        : [];

  return {
    selectedOption: null,
    selectedOptions: [],
    dragOrder: question.type === 'drag-order' ? question.segments : [],
    snippetSelection: null,
    visibleChoices: randomize(choicePool),
    feedback: '',
    timedOut: false,
    correctAnswer:
      question.type === 'multiple-choice'
        ? Array.isArray(question.answer)
          ? question.answer.join(', ')
          : question.answer
        : question.type === 'code-fill'
          ? question.answer
          : null,
  };
};

const getQuestion = (context: QuizContext) => quizQuestions[context.currentIndex];
const isCorrect = (context: QuizContext) => {
  const question = getQuestion(context);

  if (question.type === 'multiple-choice') {
    if (question.allowMultiple && Array.isArray(question.answer)) {
      return (
        question.answer.length === context.selectedOptions.length &&
        question.answer.every((answer) => context.selectedOptions.includes(answer))
      );
    }
    return context.selectedOption === question.answer;
  }

  if (question.type === 'drag-order') {
    return (
      question.correctOrder.length === context.dragOrder.length &&
      question.correctOrder.every((item, index) => item === context.dragOrder[index])
    );
  }

  if (question.type === 'code-fill') {
    return context.snippetSelection === question.answer;
  }

  return false;
};

export const quizMachine = setup({
  types: {
    context: {} as QuizContext,
    events: {} as QuizEvent,
  },
  actions: {
    prepareQuestion: assign(({ context }) => ({
      ...context,
      ...buildQuestionContext(context.currentIndex),
    })),
    setSelectedOption: assign(({ context, event }) => {
      if (event.type !== 'SELECT_OPTION') return context;
      return {
        ...context,
        selectedOption: event.choice,
        selectedOptions: [event.choice],
      };
    }),
    toggleSelectedOption: assign(({ context, event }) => {
      if (event.type !== 'TOGGLE_OPTION') return context;
      const selectedOptions = context.selectedOptions.includes(event.choice)
        ? context.selectedOptions.filter((choice) => choice !== event.choice)
        : [...context.selectedOptions, event.choice];
      return {
        ...context,
        selectedOption: selectedOptions[0] ?? null,
        selectedOptions,
      };
    }),
    setDragOrder: assign(({ context, event }) => {
      if (event.type !== 'UPDATE_ORDER') return context;
      return {
        ...context,
        dragOrder: event.order,
      };
    }),
    setSnippetSelection: assign(({ context, event }) => {
      if (event.type !== 'UPDATE_SNIPPET') return context;
      return {
        ...context,
        snippetSelection: event.choice,
      };
    }),
    applyHint: assign(({ context }) => ({
      ...context,
      hintUsed: true,
    })),
    applyFiftyFifty: assign(({ context }) => {
      const question = getQuestion(context);
      if (question.type === 'multiple-choice' || question.type === 'code-fill') {
        const answer = question.answer;
        const answers = Array.isArray(answer) ? answer : [answer];
        const incorrectOptions =
          'choices' in question && question.choices
            ? question.choices.filter((choice) => !answers.includes(choice))
            : 'options' in question && question.options
              ? question.options.filter((choice) => !answers.includes(choice))
              : [];
        const reduced = [...answers, incorrectOptions[0]].filter(Boolean).sort();
        return {
          ...context,
          visibleChoices: reduced,
          fiftyUsed: true,
        };
      }
      return {
        ...context,
        fiftyUsed: true,
      };
    }),
    markTimedOut: assign(({ context }) => ({
      ...context,
      timedOut: true,
    })),
    scoreQuestion: assign(({ context }) => {
      const correct = isCorrect(context);
      return {
        ...context,
        score: correct ? context.score + 1 : context.score,
        feedback: correct
          ? 'Correct! You nailed that one.'
          : 'Not quite — review the hint and try to remember the next pattern.',
      };
    }),
    setCorrectAnswer: assign(({ context }) => {
      const question = getQuestion(context);
      const answer =
        question.type === 'drag-order'
          ? 'Complete order matches the correct lifecycle.'
          : question.type === 'code-fill'
            ? question.answer
            : Array.isArray(question.answer)
              ? question.answer.join(', ')
              : question.answer;
      return {
        ...context,
        correctAnswer: answer,
      };
    }),
    advanceQuestion: assign(({ context }) => ({
      ...context,
      currentIndex: context.currentIndex + 1,
    })),
    resetQuiz: assign(() => ({
      ...initialContext,
    })),
  },
  guards: {
    canUseFiftyFifty: ({ context }) => !context.fiftyUsed,
    canSubmit: ({ context }) => {
      const question = getQuestion(context);
      if (question.type === 'multiple-choice') {
        return question.allowMultiple
          ? context.selectedOptions.length > 0
          : Boolean(context.selectedOption);
      }
      if (question.type === 'drag-order') {
        return context.dragOrder.length > 0;
      }
      if (question.type === 'code-fill') {
        return Boolean(context.snippetSelection);
      }
      return false;
    },
    hasMoreQuestions: ({ context }) => context.currentIndex + 1 < quizQuestions.length,
  },
}).createMachine({
  id: 'quiz',
  initial: 'idle',
  context: initialContext,
  states: {
    idle: {
      on: {
        START: {
          target: 'question',
          actions: { type: 'prepareQuestion' },
        },
      },
    },
    question: {
      entry: { type: 'prepareQuestion' },
      on: {
        SELECT_OPTION: {
          actions: { type: 'setSelectedOption' },
        },
        TOGGLE_OPTION: {
          actions: { type: 'toggleSelectedOption' },
        },
        UPDATE_ORDER: {
          actions: { type: 'setDragOrder' },
        },
        UPDATE_SNIPPET: {
          actions: { type: 'setSnippetSelection' },
        },
        USE_HINT: {
          actions: { type: 'applyHint' },
        },
        USE_FIFTY_FIFTY: {
          guard: { type: 'canUseFiftyFifty' },
          actions: { type: 'applyFiftyFifty' },
        },
        SUBMIT: [
          {
            guard: { type: 'canSubmit' },
            target: 'answer',
          },
        ],
        TIMEOUT: {
          actions: { type: 'markTimedOut' },
          target: 'answer',
        },
      },
    },
    answer: {
      entry: [{ type: 'scoreQuestion' }, { type: 'setCorrectAnswer' }],
      on: {
        NEXT: [
          {
            guard: { type: 'hasMoreQuestions' },
            target: 'question',
            actions: { type: 'advanceQuestion' },
          },
          {
            target: 'complete',
          },
        ],
      },
    },
    complete: {
      on: {
        RESTART: {
          target: 'question',
          actions: [{ type: 'resetQuiz' }, { type: 'prepareQuestion' }],
        },
      },
    },
  },
});

export default quizMachine;
