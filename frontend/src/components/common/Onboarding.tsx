'use client';

import { useAuth } from '@/contexts/AuthContext';
import React, { useEffect, useState } from 'react';
import type { Step } from 'react-joyride';
import { Joyride, STATUS } from 'react-joyride';

const Onboarding: React.FC = () => {
  const { user } = useAuth();
  const [run, setRun] = useState(false);

  useEffect(() => {
    const hasCompletedTour = localStorage.getItem('onboarding_completed');
    if (!hasCompletedTour) {
      setRun(true);
    }
  }, []);

  const steps: Step[] = [
    {
      target: '#onboarding-logo',
      content: (
        <div className="text-left">
          <h3 className="mb-2 text-lg font-black tracking-tighter text-red-600 uppercase">
            Welcome to Web3 Lab
          </h3>
          <p className="text-sm font-light text-gray-300">
            Your gateway to mastering Stellar and Soroban development. Let's get you oriented.
          </p>
        </div>
      ),
      placement: 'bottom',
      skipBeacon: true,
    },
    {
      target: '#nav-modules',
      content: (
        <div className="text-left">
          <h3 className="mb-2 text-lg font-black tracking-tighter text-red-600 uppercase">
            Learning Modules
          </h3>
          <p className="text-sm font-light text-gray-300">
            Deep dive into structured courses covering blockchain fundamentals and smart contract
            engineering.
          </p>
        </div>
      ),
      placement: 'bottom',
    },
    {
      target: '#nav-playground',
      content: (
        <div className="text-left">
          <h3 className="mb-2 text-lg font-black tracking-tighter text-red-600 uppercase">
            Code Playground
          </h3>
          <p className="text-sm font-light text-gray-300">
            Compile, deploy, and test Soroban smart contracts directly in your browser without any
            setup.
          </p>
        </div>
      ),
      placement: 'bottom',
    },
    {
      target: '#nav-simulator',
      content: (
        <div className="text-left">
          <h3 className="mb-2 text-lg font-black tracking-tighter text-red-600 uppercase">
            Network Simulator
          </h3>
          <p className="text-sm font-light text-gray-300">
            Visualize live Stellar ledger activity and understand how transactions flow through the
            network.
          </p>
        </div>
      ),
      placement: 'bottom',
    },
    {
      target: user ? '#nav-dashboard' : '#nav-roadmap',
      content: (
        <div className="text-left">
          <h3 className="mb-2 text-lg font-black tracking-tighter text-red-600 uppercase">
            Track Your Progress
          </h3>
          <p className="text-sm font-light text-gray-300">
            Monitor your achievements, view your skill tree, and manage your on-chain credentials.
          </p>
        </div>
      ),
      placement: 'bottom',
    },
  ];

  const handleEvent = (data: any) => {
    const { status } = data;
    if ([STATUS.FINISHED, STATUS.SKIPPED].includes(status as any)) {
      setRun(false);
      localStorage.setItem('onboarding_completed', 'true');
    }
  };

  return (
    <Joyride
      steps={steps}
      run={run}
      continuous
      onEvent={handleEvent}
      locale={{
        last: 'FINISH',
        back: 'BACK',
        next: 'NEXT',
        skip: 'SKIP',
      }}
      options={{
        showProgress: true,
        buttons: ['back', 'primary', 'skip'],
        primaryColor: '#dc2626', // red-600
        backgroundColor: '#09090b', // zinc-950
        textColor: '#ffffff',
        overlayColor: 'rgba(0, 0, 0, 0.75)',
        zIndex: 1000,
      }}
      styles={{
        tooltip: {
          backgroundColor: '#09090b',
          borderRadius: '8px',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          color: '#ffffff',
          padding: '20px',
        },
        buttonPrimary: {
          backgroundColor: '#dc2626',
          borderRadius: '4px',
          color: '#fff',
          fontSize: '12px',
          fontWeight: 'bold',
          padding: '10px 20px',
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
        },
        buttonBack: {
          color: '#9ca3af', // gray-400
          fontSize: '12px',
          fontWeight: 'bold',
          marginRight: '10px',
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
        },
        buttonSkip: {
          color: '#9ca3af',
          fontSize: '12px',
          fontWeight: 'bold',
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
        },
      }}
    />
  );
};

export default Onboarding;
