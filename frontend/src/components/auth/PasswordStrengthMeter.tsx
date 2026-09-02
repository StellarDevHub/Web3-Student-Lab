'use client';

import React, { useEffect, useState } from 'react';
import { calculatePasswordStrength, PasswordStrengthResult } from '@/utils/passwordStrength';
import { checkPasswordBreached, PwnedCheckResult } from '@/utils/pwnedPasswordCheck';

interface PasswordStrengthMeterProps {
  password: string;
  onStrengthChange?: (isValid: boolean, isBreached: boolean, result: PasswordStrengthResult) => void;
}

export const PasswordStrengthMeter: React.FC<PasswordStrengthMeterProps> = ({
  password,
  onStrengthChange,
}) => {
  const [strength, setStrength] = useState<PasswordStrengthResult>(() =>
    calculatePasswordStrength(password)
  );
  const [breachResult, setBreachResult] = useState<PwnedCheckResult>({
    isBreached: false,
    count: 0,
    error: null,
  });
  const [isCheckingBreach, setIsCheckingBreach] = useState(false);

  useEffect(() => {
    const result = calculatePasswordStrength(password);
    setStrength(result);

    if (!password) {
      setBreachResult({ isBreached: false, count: 0, error: null });
      if (onStrengthChange) onStrengthChange(false, false, result);
      return;
    }

    const timer = setTimeout(async () => {
      setIsCheckingBreach(true);
      const hibp = await checkPasswordBreached(password);
      setBreachResult(hibp);
      setIsCheckingBreach(false);

      if (onStrengthChange) {
        onStrengthChange(result.isValid, hibp.isBreached, result);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [password]);

  if (!password) {
    return null;
  }

  const getScoreColor = (score: number) => {
    switch (score) {
      case 0:
        return 'bg-red-600';
      case 1:
        return 'bg-amber-600';
      case 2:
        return 'bg-yellow-500';
      case 3:
        return 'bg-emerald-500';
      case 4:
        return 'bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.5)]';
      default:
        return 'bg-gray-600';
    }
  };

  const getScoreText = (score: number) => {
    switch (score) {
      case 0:
        return 'Very Weak';
      case 1:
        return 'Weak';
      case 2:
        return 'Fair';
      case 3:
        return 'Good (Minimum Required)';
      case 4:
        return 'Strong Passphrase';
      default:
        return '';
    }
  };

  return (
    <div className="mt-3 rounded-xl border border-white/10 bg-zinc-900/80 p-4 shadow-inner">
      <div className="flex items-center justify-between text-xs font-semibold">
        <span className="text-gray-400 uppercase tracking-wider">Passphrase Strength</span>
        <span
          className={`px-2 py-0.5 rounded text-xs font-bold ${
            strength.score >= 3 ? 'text-emerald-400 bg-emerald-950/60 border border-emerald-800/40' : 'text-amber-400 bg-amber-950/60 border border-amber-800/40'
          }`}
        >
          {getScoreText(strength.score)} ({strength.score}/4)
        </span>
      </div>

      {/* Progress Bars */}
      <div className="mt-2.5 grid grid-cols-4 gap-1.5">
        {[0, 1, 2, 3].map((index) => (
          <div
            key={index}
            className={`h-2 rounded-full transition-all duration-300 ${
              index <= strength.score - 1 ? getScoreColor(strength.score) : 'bg-zinc-800'
            }`}
          />
        ))}
      </div>

      {/* Breach status badge */}
      <div className="mt-3 flex items-center justify-between text-xs">
        <span className="text-gray-400">Credential Breach Status:</span>
        {isCheckingBreach ? (
          <span className="text-gray-400 animate-pulse flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-amber-400 animate-ping"></span>
            Checking HaveIBeenPwned...
          </span>
        ) : breachResult.isBreached ? (
          <span className="font-bold text-red-400 bg-red-950/80 border border-red-800/60 px-2 py-0.5 rounded flex items-center gap-1">
            ⚠️ Found in {breachResult.count.toLocaleString()} data breaches!
          </span>
        ) : (
          <span className="text-emerald-400 font-medium flex items-center gap-1">
            ✓ No known breaches (k-Anonymity verified)
          </span>
        )}
      </div>

      {/* Warnings & Suggestions */}
      {strength.warning && (
        <p className="mt-2 text-xs font-medium text-amber-400 bg-amber-950/40 p-2 rounded border border-amber-800/30">
          ⚠️ {strength.warning}
        </p>
      )}

      {breachResult.isBreached && (
        <p className="mt-2 text-xs font-medium text-red-400 bg-red-950/40 p-2 rounded border border-red-800/30">
          🚨 This passphrase has been compromised in public data breaches. Choose a unique passphrase to secure your account.
        </p>
      )}

      {strength.suggestions.length > 0 && strength.score < 3 && (
        <div className="mt-2.5">
          <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Suggestions for stronger security:</p>
          <ul className="mt-1 list-disc pl-4 text-xs text-gray-300 space-y-1">
            {strength.suggestions.map((s, idx) => (
              <li key={idx}>{s}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};
