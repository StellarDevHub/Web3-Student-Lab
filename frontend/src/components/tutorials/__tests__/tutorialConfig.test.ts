import { describe, it, expect } from 'vitest';
import {
  SIMULATOR_TUTORIAL,
  PLAYGROUND_TUTORIAL,
  ROADMAP_TUTORIAL,
  TUTORIALS,
  getTutorial,
  getTutorialStyles,
} from '../tutorialConfig';

describe('tutorialConfig', () => {
  describe('SIMULATOR_TUTORIAL', () => {
    it('has correct id', () => {
      expect(SIMULATOR_TUTORIAL.id).toBe('simulator');
    });

    it('has a title and description', () => {
      expect(SIMULATOR_TUTORIAL.title).toBeTruthy();
      expect(SIMULATOR_TUTORIAL.description).toBeTruthy();
    });

    it('has exactly 5 steps', () => {
      expect(SIMULATOR_TUTORIAL.steps).toHaveLength(5);
    });

    it('each step has target, content, and placement', () => {
      for (const step of SIMULATOR_TUTORIAL.steps) {
        expect(step.target).toBeTruthy();
        expect(step.content).toBeTruthy();
        expect(step.placement).toBeTruthy();
        expect(step.disableBeacon).toBe(true);
      }
    });

    it('first step targets body', () => {
      expect(SIMULATOR_TUTORIAL.steps[0].target).toBe('body');
    });

    it('subsequent steps target data-tour-step attributes', () => {
      const targets = SIMULATOR_TUTORIAL.steps.slice(1).map((s) => s.target);
      expect(targets).toEqual([
        '[data-tour-step="simulator-ledgers"]',
        '[data-tour-step="simulator-graph"]',
        '[data-tour-step="simulator-tx-stream"]',
        '[data-tour-step="simulator-controls"]',
      ]);
    });
  });

  describe('PLAYGROUND_TUTORIAL', () => {
    it('has correct id', () => {
      expect(PLAYGROUND_TUTORIAL.id).toBe('playground');
    });

    it('has a title and description', () => {
      expect(PLAYGROUND_TUTORIAL.title).toBeTruthy();
      expect(PLAYGROUND_TUTORIAL.description).toBeTruthy();
    });

    it('has exactly 6 steps', () => {
      expect(PLAYGROUND_TUTORIAL.steps).toHaveLength(6);
    });

    it('each step has target, content, and placement', () => {
      for (const step of PLAYGROUND_TUTORIAL.steps) {
        expect(step.target).toBeTruthy();
        expect(step.content).toBeTruthy();
        expect(step.placement).toBeTruthy();
      }
    });

    it('first step targets body', () => {
      expect(PLAYGROUND_TUTORIAL.steps[0].target).toBe('body');
    });

    it('subsequent steps target data-tour-step attributes', () => {
      const targets = PLAYGROUND_TUTORIAL.steps.slice(1).map((s) => s.target);
      expect(targets).toEqual([
        '[data-tour-step="playground-header"]',
        '[data-tour-step="playground-file-tree"]',
        '[data-tour-step="playground-editor"]',
        '[data-tour-step="playground-compile-btn"]',
        '[data-tour-step="playground-output"]',
      ]);
    });
  });

  describe('ROADMAP_TUTORIAL', () => {
    it('has correct id', () => {
      expect(ROADMAP_TUTORIAL.id).toBe('roadmap');
    });

    it('has a title and description', () => {
      expect(ROADMAP_TUTORIAL.title).toBeTruthy();
      expect(ROADMAP_TUTORIAL.description).toBeTruthy();
    });

    it('has exactly 5 steps', () => {
      expect(ROADMAP_TUTORIAL.steps).toHaveLength(5);
    });

    it('each step has target, content, and placement', () => {
      for (const step of ROADMAP_TUTORIAL.steps) {
        expect(step.target).toBeTruthy();
        expect(step.content).toBeTruthy();
        expect(step.placement).toBeTruthy();
      }
    });

    it('first step targets body', () => {
      expect(ROADMAP_TUTORIAL.steps[0].target).toBe('body');
    });

    it('subsequent steps target data-tour-step attributes', () => {
      const targets = ROADMAP_TUTORIAL.steps.slice(1).map((s) => s.target);
      expect(targets).toEqual([
        '[data-tour-step="roadmap-header"]',
        '[data-tour-step="roadmap-nodes"]',
        '[data-tour-step="roadmap-detail"]',
        '[data-tour-step="roadmap-action-btn"]',
      ]);
    });
  });

  describe('TUTORIALS registry', () => {
    it('contains all three tutorials', () => {
      expect(Object.keys(TUTORIALS)).toEqual(['simulator', 'playground', 'roadmap']);
    });

    it('each tutorial has unique ids matching their key', () => {
      for (const [key, tutorial] of Object.entries(TUTORIALS)) {
        expect(tutorial.id).toBe(key);
      }
    });
  });

  describe('getTutorial', () => {
    it('returns the correct tutorial for each id', () => {
      expect(getTutorial('simulator')).toBe(SIMULATOR_TUTORIAL);
      expect(getTutorial('playground')).toBe(PLAYGROUND_TUTORIAL);
      expect(getTutorial('roadmap')).toBe(ROADMAP_TUTORIAL);
    });

    it('throws for invalid tutorial id', () => {
      expect(() => getTutorial('invalid' as any)).toThrow('Tutorial "invalid" not found');
    });
  });

  describe('getTutorialStyles', () => {
    it('returns styles with required Joyride options', () => {
      const styles = getTutorialStyles();
      expect(styles.options).toBeDefined();
      expect(styles.options.primaryColor).toBe('#dc2626');
      expect(styles.options.backgroundColor).toBe('#09090b');
      expect(styles.options.textColor).toBe('#ffffff');
      expect(styles.options.overlayColor).toBe('rgba(0, 0, 0, 0.75)');
      expect(styles.options.zIndex).toBe(1000);
      expect(styles.tooltip).toBeDefined();
      expect(styles.tooltipContainer).toBeDefined();
      expect(styles.buttonPrimary).toBeDefined();
      expect(styles.buttonBack).toBeDefined();
      expect(styles.buttonSkip).toBeDefined();
      expect(styles.buttonClose).toBeDefined();
    });
  });
});
