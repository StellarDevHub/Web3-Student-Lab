import React, { useState } from 'react';

type TraceEvent = {
  id: number;
  type: 'bytes_new' | 'map_put' | 'auth_verify' | 'vec_new' | 'contract_event';
  cpuCost: number;
  memCost: number;
  line: number;
  details: string;
};

const MOCK_TRACES: TraceEvent[] = [
  { id: 1, type: 'bytes_new', cpuCost: 150, memCost: 64, line: 12, details: 'Created new bytes array for symbol' },
  { id: 2, type: 'auth_verify', cpuCost: 3000, memCost: 128, line: 13, details: 'Verified Ed25519 signature for invoker' },
  { id: 3, type: 'vec_new', cpuCost: 100, memCost: 32, line: 15, details: 'Initialized vector for map keys' },
  { id: 4, type: 'map_put', cpuCost: 850, memCost: 256, line: 18, details: 'Stored user balance in ledger' },
  { id: 5, type: 'contract_event', cpuCost: 400, memCost: 80, line: 20, details: 'Emitted Transfer event' },
];

const MOCK_CODE = \`// lib.rs
#![no_std]
use soroban_sdk::{contract, contractimpl, symbol_short, Env, Address};

#[contract]
pub struct TokenContract;

#[contractimpl]
impl TokenContract {
    pub fn transfer(env: Env, from: Address, to: Address, amount: i128) {
        // Line 12
        let symbol = symbol_short!("TOKEN");
        // Line 13
        from.require_auth();
        
        // Line 15
        let mut data_keys = soroban_sdk::vec![&env];
        
        // Line 18
        env.storage().persistent().set(&from, &(balance - amount));
        
        // Line 20
        env.events().publish((symbol, symbol_short!("transfer")), (from, to, amount));
    }
}\`;

export const SorobanDebugger: React.FC = () => {
  const [currentStep, setCurrentStep] = useState<number>(0);

  const activeTraces = MOCK_TRACES.slice(0, currentStep + 1);
  const currentTrace = activeTraces[activeTraces.length - 1];
  
  const totalCpu = activeTraces.reduce((sum, t) => sum + t.cpuCost, 0);
  const totalMem = activeTraces.reduce((sum, t) => sum + t.memCost, 0);

  const exportJSON = () => {
    const dataStr = JSON.stringify(activeTraces, null, 2);
    alert(\`Exported Trace:\\n\${dataStr}\`);
  };

  return (
    <div className="p-6 max-w-6xl mx-auto font-sans bg-gray-900 text-gray-100 rounded-xl shadow-2xl border border-gray-700 flex flex-col h-[800px]">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-2xl font-bold text-teal-400">Soroban Host Function Execution Tracer</h2>
        <button onClick={exportJSON} className="bg-teal-600 hover:bg-teal-500 text-white px-4 py-2 rounded text-sm font-semibold transition">
          Export Trace JSON
        </button>
      </div>

      <div className="grid grid-cols-3 gap-6 flex-grow overflow-hidden">
        
        {/* Source Code View */}
        <div className="col-span-1 bg-gray-800 rounded-lg border border-gray-600 overflow-hidden flex flex-col">
          <div className="bg-gray-700 px-4 py-2 font-mono text-xs text-gray-300 border-b border-gray-600">lib.rs</div>
          <div className="p-4 overflow-y-auto font-mono text-sm whitespace-pre">
            {MOCK_CODE.split('\\n').map((line, idx) => {
              const lineNum = idx + 1;
              const isHighlighted = currentTrace?.line === lineNum;
              return (
                <div key={lineNum} className={\`px-2 py-0.5 rounded \${isHighlighted ? 'bg-teal-900 border-l-4 border-teal-500 text-teal-100' : 'text-gray-400'}\`}>
                  <span className="inline-block w-8 text-right mr-4 opacity-50 select-none">{lineNum}</span>
                  {line}
                </div>
              );
            })}
          </div>
        </div>

        {/* Trace Log and Budgets */}
        <div className="col-span-2 flex flex-col gap-6 overflow-hidden">
          
          {/* Controls & Budgets */}
          <div className="bg-gray-800 rounded-lg border border-gray-600 p-4 flex gap-8 items-center">
            <div className="flex gap-2">
              <button 
                onClick={() => setCurrentStep(Math.max(0, currentStep - 1))}
                disabled={currentStep === 0}
                className="bg-gray-700 disabled:opacity-50 text-white px-4 py-2 rounded hover:bg-gray-600"
              >
                &larr; Step Back
              </button>
              <button 
                onClick={() => setCurrentStep(Math.min(MOCK_TRACES.length - 1, currentStep + 1))}
                disabled={currentStep === MOCK_TRACES.length - 1}
                className="bg-teal-600 disabled:opacity-50 text-white px-4 py-2 rounded hover:bg-teal-500 font-bold"
              >
                Step Forward &rarr;
              </button>
            </div>
            
            <div className="flex-grow flex gap-4 justify-end">
              <div className="bg-gray-900 px-4 py-2 rounded border border-gray-700 text-center">
                <div className="text-xs text-gray-400 uppercase">CPU Budget (Instr)</div>
                <div className="font-mono text-yellow-400 text-lg">{totalCpu.toLocaleString()}</div>
              </div>
              <div className="bg-gray-900 px-4 py-2 rounded border border-gray-700 text-center">
                <div className="text-xs text-gray-400 uppercase">Mem Budget (Bytes)</div>
                <div className="font-mono text-purple-400 text-lg">{totalMem.toLocaleString()}</div>
              </div>
            </div>
          </div>

          {/* Trace Log */}
          <div className="bg-gray-800 rounded-lg border border-gray-600 overflow-hidden flex flex-col flex-grow">
            <div className="bg-gray-700 px-4 py-2 font-mono text-xs text-gray-300 border-b border-gray-600 grid grid-cols-5">
              <div className="col-span-1">Host Fn</div>
              <div className="col-span-2">Details</div>
              <div className="col-span-1 text-right">CPU Cost</div>
              <div className="col-span-1 text-right">Mem Cost</div>
            </div>
            <div className="overflow-y-auto p-2">
              {activeTraces.map((trace, idx) => (
                <div key={trace.id} className={\`grid grid-cols-5 px-2 py-3 rounded mb-1 border-b border-gray-700/50 \${idx === activeTraces.length - 1 ? 'bg-gray-700/80 border-l-4 border-teal-500' : ''}\`}>
                  <div className="col-span-1 font-mono text-sm text-pink-400">{trace.type}</div>
                  <div className="col-span-2 text-sm text-gray-300">{trace.details}</div>
                  <div className="col-span-1 text-right font-mono text-sm text-yellow-500">+{trace.cpuCost}</div>
                  <div className="col-span-1 text-right font-mono text-sm text-purple-500">+{trace.memCost}</div>
                </div>
              ))}
            </div>
          </div>
          
          {/* Budget Graph Approximation */}
          <div className="bg-gray-800 rounded-lg border border-gray-600 p-4 h-48">
             <div className="text-xs text-gray-400 mb-2 uppercase">Cumulative Budget Consumption Graph</div>
             <div className="w-full h-full relative">
                {/* Simple CSS-based bar graph mapping traces to columns */}
                <div className="absolute inset-0 flex items-end justify-between gap-1">
                  {MOCK_TRACES.map((t, idx) => {
                    const isFuture = idx > currentStep;
                    const thisTotalCpu = MOCK_TRACES.slice(0, idx + 1).reduce((s, x) => s + x.cpuCost, 0);
                    const maxCpu = MOCK_TRACES.reduce((s, x) => s + x.cpuCost, 0);
                    const heightPct = (thisTotalCpu / maxCpu) * 100;
                    
                    return (
                      <div key={t.id} className="flex-1 flex flex-col justify-end items-center h-full group">
                        <div 
                          className={\`w-full transition-all duration-300 rounded-t \${isFuture ? 'bg-gray-700' : 'bg-yellow-500/80'}\`} 
                          style={{height: \`\${heightPct}%\`}}
                        ></div>
                        <div className="text-[10px] text-gray-500 mt-1 font-mono">Step {idx+1}</div>
                      </div>
                    );
                  })}
                </div>
             </div>
          </div>

        </div>
      </div>
    </div>
  );
};

export default SorobanDebugger;
