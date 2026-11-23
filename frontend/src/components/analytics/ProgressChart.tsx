'use client';

import { useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { ProgressDataPoint } from '@/hooks/useAnalytics';
import { ChartDataTable, type ColumnDef } from './ChartDataTable';

interface ProgressChartProps {
  data: ProgressDataPoint[];
}

const CHART_SUMMARY = 'Line chart of learning progress over time showing completed, in-progress, and not-started course counts.';

const TABLE_COLUMNS: ColumnDef[] = [
  { key: 'date', label: 'Date' },
  { key: 'completed', label: 'Completed' },
  { key: 'inProgress', label: 'In Progress' },
  { key: 'notStarted', label: 'Not Started' },
];

export default function ProgressChart({ data }: ProgressChartProps) {
  const [showTable, setShowTable] = useState(false);
  const tableId = 'progress-chart-table';

  return (
    <div className="bg-bg-secondary border-border-theme rounded-2xl border p-6">
      <h3 className="text-foreground mb-6 flex items-center gap-3 text-lg font-black tracking-widest uppercase">
        <span className="h-3 w-3 rounded-sm bg-red-600" aria-hidden="true"></span>
        Learning Progress
      </h3>
      <div role="img" aria-label={CHART_SUMMARY}>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
            <XAxis dataKey="date" stroke="#a1a1aa" style={{ fontSize: '12px' }} />
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
            <Line
              type="monotone"
              dataKey="completed"
              stroke="#10b981"
              strokeWidth={2}
              dot={{ r: 3 }}
            />
            <Line
              type="monotone"
              dataKey="inProgress"
              stroke="#f59e0b"
              strokeWidth={2}
              dot={{ r: 3 }}
            />
            <Line
              type="monotone"
              dataKey="notStarted"
              stroke="#6b7280"
              strokeWidth={2}
              dot={{ r: 3 }}
            />
          </LineChart>
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
            caption="Learning progress over time showing counts of completed, in-progress, and not-started courses by date."
            id={tableId}
          />
        </div>
      )}
    </div>
  );
}
