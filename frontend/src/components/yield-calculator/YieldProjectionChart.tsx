'use client';

/**
 * Compound-yield projection line chart for /yield-calculator.
 *
 * chart.js registration lives here (not in the page) so the library is only
 * downloaded when this component is rendered through next/dynamic (FE-076).
 */

import {
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  type ChartData,
  type ChartOptions,
} from 'chart.js';
import { Line } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

export interface YieldProjectionChartProps {
  data: ChartData<'line'>;
  options: ChartOptions<'line'>;
}

export function YieldProjectionChart({ data, options }: YieldProjectionChartProps) {
  return <Line data={data} options={options} />;
}

export default YieldProjectionChart;
