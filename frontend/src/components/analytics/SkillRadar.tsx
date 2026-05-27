'use client';

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

interface SkillRadarProps {
  data: SkillDataPoint[];
}

export default function SkillRadar({ data }: SkillRadarProps) {
  return (
    <div className="bg-bg-secondary border-border-theme rounded-2xl border p-6">
      <h3 className="text-foreground mb-6 flex items-center gap-3 text-lg font-black tracking-widest uppercase">
        <span className="h-3 w-3 rounded-sm bg-red-600"></span>
        Skill Distribution
      </h3>
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
  );
}
