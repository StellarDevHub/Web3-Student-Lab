"use client";

import { useEffect, useState } from "react";

interface CircuitBreakerStatus {
  state: "CLOSED" | "OPEN" | "HALF_OPEN";
  failures: number;
  successes: number;
  lastFailureTime?: number;
}

export default function ResiliencyBanner() {
  const [breakers, setBreakers] = useState<Record<string, CircuitBreakerStatus>>({});
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const checkHealth = async () => {
      try {
        const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'}/api/v1/health/circuit-breakers`);
        const result = await response.json();
        
        if (result.status === "success") {
          setBreakers(result.data);
          const hasOpenBreaker = Object.values(result.data as Record<string, CircuitBreakerStatus>).some(
            (b) => b.state === "OPEN" || b.state === "HALF_OPEN"
          );
          setIsVisible(hasOpenBreaker);
        }
      } catch (error) {
        console.error("Failed to fetch health status:", error);
      }
    };

    checkHealth();
    const interval = setInterval(checkHealth, 10000); // Check every 10 seconds
    return () => clearInterval(interval);
  }, []);

  if (!isVisible) return null;

  const openBreakers = Object.entries(breakers).filter(
    ([_, status]) => status.state === "OPEN" || status.state === "HALF_OPEN"
  );

  return (
    <div className="bg-amber-600 text-white px-4 py-2 text-xs font-bold uppercase tracking-widest flex items-center justify-between sticky top-[64px] z-40 shadow-lg border-b border-white/10">
      <div className="flex items-center gap-3">
        <div className="animate-pulse bg-white text-amber-600 px-2 py-0.5 rounded">
          DEGRADED PERFORMANCE
        </div>
        <span>
          External systems currently unavailable: {openBreakers.map(([name]) => name).join(", ")}. Fallbacks active.
        </span>
      </div>
      <button 
        onClick={() => setIsVisible(false)}
        className="hover:bg-white/20 p-1 rounded transition-colors"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
