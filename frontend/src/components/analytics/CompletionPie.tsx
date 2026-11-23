'use client';

import { useState } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { CompletionDataPoint } from '@/hooks/useAnalytics';
import { ChartDataTable, type ColumnDef } from './ChartDataTable';

interface CompletionPieProps {
  data: CompletionDataPoint[];
}

const CHART_SUMMARY = 'Pie chart of course completion distribution showing the percentage of completed, in-progress, and not-started courses.';

const TABLE_COLUMNS: ColumnDef[] = [
  { key: 'name', label: 'Category' },
  { key: 'value', label: 'Percentage', format: (v) => `${v}%` },
];

export default function CompletionPie({ data }: CompletionPieProps) {
  const [showTable, setShowTable] = useState(false);
  const tableId = 'completion-pie-table';

  return (
    <div className="bg-bg-secondary border-border-theme rounded-2xl border p-6">
      <h3 className="text-foreground mb-6 flex items-center gap-3 text-lg font-black tracking-widest uppercase">
        <span className="h-3 w-3 rounded-sm bg-red-600" aria-hidden="true"></span>
        Course Completion
      </h3>
      <div role="img" aria-label={CHART_SUMMARY}>
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              labelLine={false}
              label={({ name, percent }) => `${name}: ${percent?.toFixed(0) || '0'}%`}
              outerRadius={80}
              fill="#8884d8"
              dataKey="value"
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                backgroundColor: '#09090b',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '8px',
                color: '#fff',
              }}
            />
            <Legend wrapperStyle={{ fontSize: '12px', color: '#a1a1aa' }} />
          </PieChart>
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
            caption="Course completion distribution by category and percentage."
            id={tableId}
          />
        </div>
      )}
    </div>
  );
}
