import React, { useState, useMemo } from 'react';

type ScheduleType = 'linear' | 'stepped' | 'exponential';

interface PoolConfig {
  name: string;
  allocation: number; // percentage 0-100
  schedule: ScheduleType;
  cliffMonths: number;
  durationMonths: number;
}

export const TokenomicsSimulator: React.FC = () => {
  const [pools, setPools] = useState<PoolConfig[]>([
    { name: 'Team', allocation: 20, schedule: 'linear', cliffMonths: 12, durationMonths: 48 },
    { name: 'Community', allocation: 50, schedule: 'stepped', cliffMonths: 0, durationMonths: 120 },
    { name: 'Investor', allocation: 30, schedule: 'exponential', cliffMonths: 6, durationMonths: 36 },
  ]);

  const totalAllocation = pools.reduce((acc, p) => acc + p.allocation, 0);

  const updatePool = (index: number, updates: Partial<PoolConfig>) => {
    const newPools = [...pools];
    newPools[index] = { ...newPools[index], ...updates };
    setPools(newPools);
  };

  // Generate chart data (120 months)
  const chartData = useMemo(() => {
    const months = 120;
    const data = [];
    
    for (let m = 0; m <= months; m++) {
      let circulating = 0;
      let locked = 0;

      pools.forEach(pool => {
        const amount = pool.allocation; // Use percentage as total token base (100 total)
        if (m < pool.cliffMonths) {
          locked += amount;
        } else {
          let vestedRatio = 0;
          const vestingMonths = m - pool.cliffMonths;
          const totalVestingDuration = pool.durationMonths - pool.cliffMonths;

          if (totalVestingDuration <= 0 || m >= pool.durationMonths) {
            vestedRatio = 1;
          } else {
            if (pool.schedule === 'linear') {
              vestedRatio = vestingMonths / totalVestingDuration;
            } else if (pool.schedule === 'stepped') {
              // 4 steps
              const steps = 4;
              const stepDuration = totalVestingDuration / steps;
              const currentStep = Math.floor(vestingMonths / stepDuration);
              vestedRatio = currentStep / steps;
            } else if (pool.schedule === 'exponential') {
              // Simple exponential curve approximation
              vestedRatio = 1 - Math.pow(0.5, vestingMonths / (totalVestingDuration / 3));
            }
          }
          
          vestedRatio = Math.min(Math.max(vestedRatio, 0), 1);
          circulating += amount * vestedRatio;
          locked += amount * (1 - vestedRatio);
        }
      });
      data.push({ month: m, circulating, locked });
    }
    return data;
  }, [pools]);

  const exportConfig = () => {
    const json = JSON.stringify(pools, null, 2);
    
    // Soroban arguments mock
    const sorobanArgs = pools.map(p => {
      return `--arg '{"name": "${p.name}", "alloc": ${p.allocation}, "schedule": "${p.schedule}", "cliff": ${p.cliffMonths}, "duration": ${p.durationMonths}}'`;
    }).join(' ');

    const output = `JSON Configuration:\n${json}\n\nSoroban Vesting Arguments:\nvesting_init ${sorobanArgs}`;
    alert(output);
    console.log(output);
  };

  return (
    <div className="p-6 max-w-4xl mx-auto font-sans bg-gray-50 rounded-xl shadow-lg border border-gray-100">
      <h2 className="text-2xl font-bold mb-6 text-gray-800">Tokenomics Emissions & Vesting Simulator</h2>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div>
          <h3 className="text-xl font-semibold mb-4 text-gray-700">Allocation Pools (Total: {totalAllocation}%)</h3>
          {totalAllocation !== 100 && (
            <div className="mb-4 p-3 bg-red-100 text-red-700 rounded-md">
              Warning: Total allocation must equal 100%. Current: {totalAllocation}%
            </div>
          )}
          
          <div className="space-y-6">
            {pools.map((pool, i) => (
              <div key={i} className="p-4 bg-white rounded-lg shadow-sm border border-gray-200">
                <div className="flex justify-between items-center mb-4">
                  <h4 className="font-semibold text-lg">{pool.name}</h4>
                </div>
                
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Allocation (%)</label>
                    <input 
                      type="number" 
                      value={pool.allocation} 
                      onChange={e => updatePool(i, { allocation: Number(e.target.value) })}
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Schedule Type</label>
                    <select 
                      value={pool.schedule} 
                      onChange={e => updatePool(i, { schedule: e.target.value as ScheduleType })}
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border"
                    >
                      <option value="linear">Linear</option>
                      <option value="stepped">Stepped</option>
                      <option value="exponential">Exponential</option>
                    </select>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Cliff (Months)</label>
                      <input 
                        type="number" 
                        value={pool.cliffMonths} 
                        onChange={e => updatePool(i, { cliffMonths: Number(e.target.value) })}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Duration (Months)</label>
                      <input 
                        type="number" 
                        value={pool.durationMonths} 
                        onChange={e => updatePool(i, { durationMonths: Number(e.target.value) })}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border"
                      />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
          
          <button 
            onClick={exportConfig}
            className="mt-6 w-full bg-indigo-600 text-white font-semibold py-2 px-4 rounded-md hover:bg-indigo-700 transition"
          >
            Export JSON & Soroban Args
          </button>
        </div>
        
        <div>
          <h3 className="text-xl font-semibold mb-4 text-gray-700">Supply Projection (120 Months)</h3>
          <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
            <svg viewBox="0 0 400 300" className="w-full h-auto">
              <defs>
                <linearGradient id="circulatingGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#4F46E5" stopOpacity="0.8" />
                  <stop offset="100%" stopColor="#4F46E5" stopOpacity="0.2" />
                </linearGradient>
                <linearGradient id="lockedGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#9CA3AF" stopOpacity="0.8" />
                  <stop offset="100%" stopColor="#9CA3AF" stopOpacity="0.2" />
                </linearGradient>
              </defs>
              
              {/* Axes */}
              <line x1="40" y1="280" x2="380" y2="280" stroke="#E5E7EB" strokeWidth="2" />
              <line x1="40" y1="20" x2="40" y2="280" stroke="#E5E7EB" strokeWidth="2" />
              
              {/* Data visualization */}
              {(() => {
                const maxVal = 100;
                
                const pointsLocked = chartData.map(d => {
                  const x = 40 + (d.month / 120) * 340;
                  const y = 280 - ((d.locked + d.circulating) / maxVal) * 260;
                  return \`\${x},\${y}\`;
                });
                
                const pointsCirculating = chartData.map(d => {
                  const x = 40 + (d.month / 120) * 340;
                  const y = 280 - (d.circulating / maxVal) * 260;
                  return \`\${x},\${y}\`;
                });
                
                // Paths for areas
                const lockedArea = \`M 40,280 L \${pointsLocked.join(' L ')} L 380,280 Z\`;
                const circulatingArea = \`M 40,280 L \${pointsCirculating.join(' L ')} L 380,280 Z\`;

                return (
                  <g>
                    {/* Locked Supply - Behind */}
                    <path d={lockedArea} fill="url(#lockedGrad)" />
                    {/* Circulating Supply - Front */}
                    <path d={circulatingArea} fill="url(#circulatingGrad)" />
                    
                    {/* Lines */}
                    <path d={\`M \${pointsLocked.join(' L ')}\`} fill="none" stroke="#6B7280" strokeWidth="2" />
                    <path d={\`M \${pointsCirculating.join(' L ')}\`} fill="none" stroke="#4338CA" strokeWidth="2" />
                  </g>
                );
              })()}
              
              {/* Legend */}
              <g transform="translate(60, 40)">
                <rect x="0" y="0" width="12" height="12" fill="#4F46E5" />
                <text x="20" y="10" fontSize="10" fill="#374151">Circulating Supply</text>
                
                <rect x="0" y="20" width="12" height="12" fill="#9CA3AF" />
                <text x="20" y="30" fontSize="10" fill="#374151">Locked Supply</text>
              </g>
              
              {/* X Axis Labels */}
              <text x="40" y="295" fontSize="10" fill="#6B7280" textAnchor="middle">0</text>
              <text x="125" y="295" fontSize="10" fill="#6B7280" textAnchor="middle">30m</text>
              <text x="210" y="295" fontSize="10" fill="#6B7280" textAnchor="middle">60m</text>
              <text x="295" y="295" fontSize="10" fill="#6B7280" textAnchor="middle">90m</text>
              <text x="380" y="295" fontSize="10" fill="#6B7280" textAnchor="middle">120m</text>
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TokenomicsSimulator;
