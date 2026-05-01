"use client";

import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { TrendDataPoint } from "@/hooks/useAnalytics";

interface TrendChartProps {
  data: TrendDataPoint[];
}

export default function TrendChart({ data }: TrendChartProps) {
  return (
    <div className="bg-bg-secondary border border-border-theme rounded-2xl p-6">
      <h3 className="text-lg font-black text-foreground uppercase tracking-widest mb-6 flex items-center gap-3">
        <span className="w-3 h-3 bg-red-600 rounded-sm"></span>
        Performance Trends
      </h3>
      <ResponsiveContainer width="100%" height={300}>
        <ComposedChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
          <XAxis dataKey="week" stroke="#a1a1aa" style={{ fontSize: "12px" }} />
          <YAxis stroke="#a1a1aa" style={{ fontSize: "12px" }} />
          <Tooltip
            contentStyle={{
              backgroundColor: "#09090b",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: "8px",
              color: "#fff",
            }}
          />
          <Legend wrapperStyle={{ fontSize: "12px", color: "#a1a1aa" }} />
          <Bar dataKey="score" fill="#dc2626" radius={[8, 8, 0, 0]} />
          <Line type="monotone" dataKey="velocity" stroke="#10b981" strokeWidth={2} dot={{ r: 4 }} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
