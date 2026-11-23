'use client';

import { useState } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { TimeDataPoint } from '@/hooks/useAnalytics';
import { ChartDataTable, type ColumnDef } from './ChartDataTable';

interface TimeDistributionChartProps {
  data: TimeDataPoint[];
}

const CHART_SUMMARY = 'Area chart of study session distribution across 24 hours of the day showing when study activity is highest.';

const TABLE_COLUMNS: ColumnDef[] = [
  { key: 'hour', label: 'Hour' },
  { key: 'sessions', label: 'Sessions' },
];

export default function TimeDistributionChart({ data }: TimeDistributionChartProps) {
  const [showTable, setShowTable] = useState(false);
  const tableId = 'time-distribution-table';

  return (
    <div className="bg-bg-secondary border-border-theme rounded-2xl border p-6">
      <h3 className="text-foreground mb-6 flex items-center gap-3 text-lg font-black tracking-widest uppercase">
        <span className="h-3 w-3 rounded-sm bg-red-600" aria-hidden="true"></span>
        Study Time Distribution
      </h3>
      <div role="img" aria-label={CHART_SUMMARY}>
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
            <XAxis dataKey="hour" stroke="#a1a1aa" style={{ fontSize: '12px' }} />
            <YAxis stroke="#a1a1aa" style={{ fontSize: '12px' }} />
            <Tooltip
              contentStyle={{
                backgroundColor: '#09090b',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '8px',
                color: '#fff',
              }}
            />
            <Area
              type="monotone"
              dataKey="sessions"
              stroke="#dc2626"
              fill="#dc2626"
              fillOpacity={0.6}
            />
          </AreaChart>
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
            caption="Study session distribution by hour of day."
            id={tableId}
          />
        </div>
      )}
    </div>
  );
}
