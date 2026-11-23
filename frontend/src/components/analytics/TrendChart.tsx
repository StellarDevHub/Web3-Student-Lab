'use client';

import { useState } from 'react';
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { TrendDataPoint } from '@/hooks/useAnalytics';
import { ChartDataTable, type ColumnDef } from './ChartDataTable';

interface TrendChartProps {
  data: TrendDataPoint[];
}

const CHART_SUMMARY = 'Composed bar and line chart of performance trends over time showing weekly scores and learning velocity.';

const TABLE_COLUMNS: ColumnDef[] = [
  { key: 'week', label: 'Week' },
  { key: 'score', label: 'Score', format: (v) => `${Math.round(v as number)}` },
  { key: 'velocity', label: 'Velocity', format: (v) => `${(v as number).toFixed(1)}` },
];

export default function TrendChart({ data }: TrendChartProps) {
  const [showTable, setShowTable] = useState(false);
  const tableId = 'trend-chart-table';

  return (
    <div className="bg-bg-secondary border-border-theme rounded-2xl border p-6">
      <h3 className="text-foreground mb-6 flex items-center gap-3 text-lg font-black tracking-widest uppercase">
        <span className="h-3 w-3 rounded-sm bg-red-600" aria-hidden="true"></span>
        Performance Trends
      </h3>
      <div role="img" aria-label={CHART_SUMMARY}>
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
            <XAxis dataKey="week" stroke="#a1a1aa" style={{ fontSize: '12px' }} />
            <YAxis stroke="#a1a1aa" style={{ fontSize: '12px' }} />
            <Tooltip
              contentStyle={{
                backgroundColor: '#09090b',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '8px',
                color: '#fff',
              }}
            />
            <Legend wrapperStyle={{ fontSize: '12px', color: '#a1a1aa' }} />
            <Bar dataKey="score" fill="#dc2626" radius={[8, 8, 0, 0]} />
            <Line
              type="monotone"
              dataKey="velocity"
              stroke="#10b981"
              strokeWidth={2}
              dot={{ r: 4 }}
            />
          </ComposedChart>
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
            caption="Performance trends over time showing weekly scores and velocity."
            id={tableId}
          />
        </div>
      )}
    </div>
  );
}
