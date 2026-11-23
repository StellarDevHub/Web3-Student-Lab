'use client';

export interface ColumnDef {
  key: string;
  label: string;
  format?: (value: unknown) => string;
}

interface ChartDataTableProps {
  columns: ColumnDef[];
  data: Record<string, unknown>[];
  caption: string;
  id?: string;
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') {
    if (Number.isInteger(value)) return value.toString();
    return value.toFixed(1);
  }
  return String(value);
}

export function ChartDataTable({ columns, data, caption, id }: ChartDataTableProps) {
  if (data.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-white/10 p-4 text-center text-sm text-gray-500">
        No data available
      </div>
    );
  }

  return (
    <div className="overflow-x-auto" id={id}>
      <table className="w-full border-collapse text-left text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-white/10">
            {columns.map((col) => (
              <th key={col.key} scope="col" className="px-3 py-2 font-bold text-gray-400 uppercase tracking-wider text-xs">
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, rowIndex) => (
            <tr key={rowIndex} className="border-b border-white/5 transition-colors hover:bg-white/5">
              {columns.map((col) => (
                <td key={col.key} className="px-3 py-2 text-gray-300 whitespace-nowrap">
                  {col.format
                    ? (row[col.key] != null ? col.format(row[col.key]) : '')
                    : formatValue(row[col.key])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
