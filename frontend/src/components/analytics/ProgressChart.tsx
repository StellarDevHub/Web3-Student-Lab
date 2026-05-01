"use client";

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { ProgressDataPoint } from "@/hooks/useAnalytics";

interface ProgressChartProps {
  data: ProgressDataPoint[];
}

export default function ProgressChart({ data }: ProgressChartProps) {
  return (
    <div className="bg-bg-secondary border border-border-theme rounded-2xl p-6">
      <h3 className="text-lg font-black text-foreground uppercase tracking-widest mb-6 flex items-center gap-3">
        <span className="w-3 h-3 bg-red-600 rounded-sm"></span>
        Learning Progress
      </h3>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
          <XAxis dataKey="date" stroke="#a1a1aa" style={{ fontSize: "12px" }} />
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
          <Line type="monotone" dataKey="completed" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
          <Line type="monotone" dataKey="inProgress" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} />
          <Line type="monotone" dataKey="notStarted" stroke="#6b7280" strokeWidth={2} dot={{ r: 3 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
