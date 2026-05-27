import { EnrollmentWizardState, INITIAL_WIZARD_STATE } from './types';

const STORAGE_KEY = 'enrollment_wizard_state';
const STORAGE_VERSION = '1.0';

interface StoredState {
  version: string;
  state: EnrollmentWizardState;
  timestamp: string;
}

export class WizardPersistence {
  private static instance: WizardPersistence;
  private autoSaveInterval: NodeJS.Timeout | null = null;
  private readonly AUTO_SAVE_DELAY = 30000;

  private constructor() {}

  static getInstance(): WizardPersistence {
    if (!WizardPersistence.instance) {
      WizardPersistence.instance = new WizardPersistence();
    }
    return WizardPersistence.instance;
  }

  save(state: EnrollmentWizardState): void {
    try {
      const storedState: StoredState = {
        version: STORAGE_VERSION,
        state: {
          ...state,
          lastSaved: new Date().toISOString(),
        },
        timestamp: new Date().toISOString(),
      };

      localStorage.setItem(STORAGE_KEY, JSON.stringify(storedState));
    } catch (error) {
      console.error('Failed to save wizard state:', error);
    }
  }

  load(): EnrollmentWizardState | null {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) return null;

      const parsed: StoredState = JSON.parse(stored);

      if (parsed.version !== STORAGE_VERSION) {
        console.warn('Wizard state version mismatch, clearing old state');
        this.clear();
        return null;
      }

      const savedTime = new Date(parsed.timestamp).getTime();
      const now = Date.now();
      const maxAge = 7 * 24 * 60 * 60 * 1000;

      if (now - savedTime > maxAge) {
        console.warn('Wizard state expired, clearing old state');
        this.clear();
        return null;
      }

      return parsed.state;
    } catch (error) {
      console.error('Failed to load wizard state:', error);
      return null;
    }
  }

  clear(): void {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      console.error('Failed to clear wizard state:', error);
    }
  }

  exportState(state: EnrollmentWizardState): string {
    const exportData = {
      version: STORAGE_VERSION,
      exportedAt: new Date().toISOString(),
      state,
    };
    return btoa(JSON.stringify(exportData));
  }

  importState(encodedState: string): EnrollmentWizardState | null {
    try {
      const decoded = JSON.parse(atob(encodedState));

      if (decoded.version !== STORAGE_VERSION) {
        throw new Error('Incompatible state version');
      }

      return decoded.state;
    } catch (error) {
      console.error('Failed to import wizard state:', error);
      return null;
    }
  }

  startAutoSave(
    getState: () => EnrollmentWizardState,
    onSave?: (state: EnrollmentWizardState) => void
  ): void {
    this.stopAutoSave();

    this.autoSaveInterval = setInterval(() => {
      const state = getState();
      this.save(state);
      onSave?.(state);
    }, this.AUTO_SAVE_DELAY);
  }

  stopAutoSave(): void {
    if (this.autoSaveInterval) {
      clearInterval(this.autoSaveInterval);
      this.autoSaveInterval = null;
    }
  }

  canResume(): boolean {
    const state = this.load();
    if (!state) return false;

    return !state.isComplete && state.currentStep > 1 && state.currentStep <= 5;
  }

  getLastSavedInfo(): { canResume: boolean; step: number; lastSaved: string | null } {
    const state = this.load();

    return {
      canResume: this.canResume(),
      step: state?.currentStep || 1,
      lastSaved: state?.lastSaved || null,
    };
  }
}

export const wizardPersistence = WizardPersistence.getInstance();

export function mergeWithInitialState(
  savedState: EnrollmentWizardState | null
): EnrollmentWizardState {
  if (!savedState) return INITIAL_WIZARD_STATE;

  return {
    ...INITIAL_WIZARD_STATE,
    ...savedState,
    steps: {
      step1_courseSelection: {
        ...INITIAL_WIZARD_STATE.steps.step1_courseSelection,
        ...savedState.steps.step1_courseSelection,
      },
      step2_prerequisites: {
        ...INITIAL_WIZARD_STATE.steps.step2_prerequisites,
        ...savedState.steps.step2_prerequisites,
      },
      step3_goals: {
        ...INITIAL_WIZARD_STATE.steps.step3_goals,
        ...savedState.steps.step3_goals,
      },
      step4_schedule: {
        ...INITIAL_WIZARD_STATE.steps.step4_schedule,
        ...savedState.steps.step4_schedule,
      },
      step5_confirmation: {
        ...INITIAL_WIZARD_STATE.steps.step5_confirmation,
        ...savedState.steps.step5_confirmation,
      },
    },
  };
}
