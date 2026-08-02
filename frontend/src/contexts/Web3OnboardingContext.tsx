'use client';

import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { Joyride, CallBackProps, STATUS, Step, ACTIONS, EVENTS } from 'react-joyride';
import { useWallet } from './WalletContext';
import { api } from '@/lib/api';

export interface OnboardingState {
  hasCompletedWalletCreation: boolean;
  hasReceivedTokens: boolean;
  hasDeployedContract: boolean;
  currentStepIndex: number;
  isTourActive: boolean;
}

interface Web3OnboardingContextType {
  state: OnboardingState;
  startOnboarding: () => void;
  stopOnboarding: () => void;
  completeStep: (stepName: keyof OnboardingState) => Promise<void>;
  resetOnboarding: () => Promise<void>;
  nextStep: () => void;
}

const Web3OnboardingContext = createContext<Web3OnboardingContextType | null>(null);

const ONBOARDING_STEPS: Step[] = [
  {
    target: 'body',
    content: 'Welcome to Web3 Student Lab! Let us get you set up with your first smart contract.',
    placement: 'center',
    disableBeacon: true,
  },
  {
    target: '.wallet-connect-btn',
    content: 'First, you need a Web3 wallet. Click here to connect or create one.',
    placement: 'bottom',
    disableBeacon: true,
  },
  {
    target: '.faucet-btn',
    content: 'Now that you have a wallet, let us get some testnet tokens to pay for transactions.',
    placement: 'bottom',
    disableBeacon: true,
  },
  {
    target: '.deploy-contract-btn',
    content: 'Finally, deploy your very first smart contract! This will require a transaction signature.',
    placement: 'top',
    disableBeacon: true,
  }
];

export const Web3OnboardingProvider = ({ children }: { children: ReactNode }) => {
  const { isConnected } = useWallet();
  const [state, setState] = useState<OnboardingState>({
    hasCompletedWalletCreation: false,
    hasReceivedTokens: false,
    hasDeployedContract: false,
    currentStepIndex: 0,
    isTourActive: false,
  });

  const [steps, setSteps] = useState<Step[]>(ONBOARDING_STEPS);
  const [run, setRun] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);

  // Fetch initial state from backend
  useEffect(() => {
    const fetchOnboardingState = async () => {
      try {
        const response = await api.get('/user/onboarding');
        const data = response.data;
        setState((prev) => ({
          ...prev,
          hasCompletedWalletCreation: data.hasCompletedWalletCreation || false,
          hasReceivedTokens: data.hasReceivedTokens || false,
          hasDeployedContract: data.hasDeployedContract || false,
          currentStepIndex: data.currentStepIndex || 0,
        }));
      } catch (error) {
        console.warn('Failed to fetch onboarding state, using defaults', error);
      }
    };
    fetchOnboardingState();
  }, []);

  const saveStateToBackend = async (newState: Partial<OnboardingState>) => {
    try {
      await api.put('/user/onboarding', newState);
    } catch (error) {
      console.error('Failed to save onboarding state', error);
    }
  };

  const startOnboarding = useCallback(() => {
    setRun(true);
    setState((prev) => ({ ...prev, isTourActive: true }));
  }, []);

  const stopOnboarding = useCallback(() => {
    setRun(false);
    setState((prev) => ({ ...prev, isTourActive: false }));
  }, []);

  const nextStep = useCallback(() => {
    setStepIndex((prev) => prev + 1);
  }, []);

  const completeStep = async (stepName: keyof OnboardingState) => {
    const newState = { ...state, [stepName]: true };
    setState(newState);
    await saveStateToBackend({ [stepName]: true });
    
    // Auto-advance logic based on step completion
    if (stepName === 'hasCompletedWalletCreation' && stepIndex === 1) {
      nextStep();
    } else if (stepName === 'hasReceivedTokens' && stepIndex === 2) {
      nextStep();
    } else if (stepName === 'hasDeployedContract' && stepIndex === 3) {
      nextStep();
      // Wait a bit, then stop
      setTimeout(() => stopOnboarding(), 3000);
    }
  };

  const resetOnboarding = async () => {
    const resetState = {
      hasCompletedWalletCreation: false,
      hasReceivedTokens: false,
      hasDeployedContract: false,
      currentStepIndex: 0,
    };
    setState((prev) => ({ ...prev, ...resetState, isTourActive: false }));
    setStepIndex(0);
    setRun(false);
    await saveStateToBackend(resetState);
  };

  const handleJoyrideCallback = async (data: CallBackProps) => {
    const { action, index, status, type } = data;

    if (([STATUS.FINISHED, STATUS.SKIPPED] as string[]).includes(status)) {
      setRun(false);
      setState((prev) => ({ ...prev, isTourActive: false }));
      await saveStateToBackend({ currentStepIndex: index });
    } else if (([EVENTS.STEP_AFTER, EVENTS.TARGET_NOT_FOUND] as string[]).includes(type)) {
      // Logic for web3 async events
      // If we are on the wallet step, and user clicks next, but wallet isn't connected, we shouldn't advance unless they did it.
      // We can intercept the next action
      if (action === ACTIONS.NEXT) {
        if (index === 1 && !state.hasCompletedWalletCreation) {
           // Wait for wallet creation
           return; // Do not advance stepIndex manually, let completeStep handle it
        }
        if (index === 2 && !state.hasReceivedTokens) {
           return; // Wait for tokens
        }
        if (index === 3 && !state.hasDeployedContract) {
           return; // Wait for contract deploy
        }
        
        const nextIndex = index + (action === ACTIONS.PREV ? -1 : 1);
        setStepIndex(nextIndex);
        await saveStateToBackend({ currentStepIndex: nextIndex });
      } else if (action === ACTIONS.PREV) {
        const prevIndex = index - 1;
        setStepIndex(prevIndex);
        await saveStateToBackend({ currentStepIndex: prevIndex });
      }
    }
  };

  return (
    <Web3OnboardingContext.Provider
      value={{
        state,
        startOnboarding,
        stopOnboarding,
        completeStep,
        resetOnboarding,
        nextStep,
      }}
    >
      <Joyride
        steps={steps}
        run={run}
        stepIndex={stepIndex}
        continuous={true}
        showProgress={true}
        showSkipButton={true}
        callback={handleJoyrideCallback}
        styles={{
          options: {
            primaryColor: '#7c3aed',
            backgroundColor: '#1f2937',
            textColor: '#fff',
            arrowColor: '#1f2937',
          },
          tooltipContainer: {
            textAlign: 'left',
          },
        }}
        disableOverlayClose={true}
        hideCloseButton={false}
      />
      {children}
    </Web3OnboardingContext.Provider>
  );
};

export const useWeb3Onboarding = () => {
  const context = useContext(Web3OnboardingContext);
  if (!context) {
    throw new Error('useWeb3Onboarding must be used within a Web3OnboardingProvider');
  }
  return context;
};
