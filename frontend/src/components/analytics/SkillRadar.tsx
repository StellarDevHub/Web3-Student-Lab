'use client';

import { useState } from 'react';
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import { SkillDataPoint } from '@/hooks/useAnalytics';
import { ChartDataTable, type ColumnDef } from './ChartDataTable';

interface SkillRadarProps {
  data: SkillDataPoint[];
}

const CHART_SUMMARY = 'Radar chart of skill proficiency levels across six areas: Smart Contracts, Blockchain, Rust, Web3, Cryptography, and DeFi.';

const TABLE_COLUMNS: ColumnDef[] = [
  { key: 'skill', label: 'Skill' },
  { key: 'level', label: 'Level', format: (v) => `${v}/100` },
];

export default function SkillRadar({ data }: SkillRadarProps) {
  const [showTable, setShowTable] = useState(false);
  const tableId = 'skill-radar-table';

  return (
    <div className="bg-bg-secondary border-border-theme rounded-2xl border p-6">
      <h3 className="text-foreground mb-6 flex items-center gap-3 text-lg font-black tracking-widest uppercase">
        <span className="h-3 w-3 rounded-sm bg-red-600" aria-hidden="true"></span>
        Skill Distribution
      </h3>
      <div role="img" aria-label={CHART_SUMMARY}>
        <ResponsiveContainer width="100%" height={300}>
          <RadarChart data={data}>
            <PolarGrid stroke="rgba(255,255,255,0.1)" />
            <PolarAngleAxis dataKey="skill" stroke="#a1a1aa" style={{ fontSize: '12px' }} />
            <PolarRadiusAxis stroke="#a1a1aa" style={{ fontSize: '10px' }} />
            <Tooltip
              contentStyle={{
                backgroundColor: '#09090b',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '8px',
                color: '#fff',
              }}
            />
            <Radar
              name="Skill Level"
              dataKey="level"
              stroke="#dc2626"
              fill="#dc2626"
              fillOpacity={0.6}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-4">
        <button
          onClick={() => setShowTable((v) => !v)}
          aria-expanded={showTable}
          aria-controls={tableId}
          className="text-xs font-bold tracking-widest uppercase text-gray-400 hover:text-white transition-colors"
        >
          {showTable ? 'Hide data table' : 'Show data table'}
        </button>
      </div>
      {showTable && (
        <div className="mt-3">
          <ChartDataTable
            columns={TABLE_COLUMNS}
            data={data}
            caption="Skill proficiency levels across all measured areas, scored out of 100."
            id={tableId}
          />
        </div>
      )}
    </div>
  );
}
