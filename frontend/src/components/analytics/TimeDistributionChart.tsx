"use client";

import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { TimeDataPoint } from "@/hooks/useAnalytics";

interface TimeDistributionChartProps {
  data: TimeDataPoint[];
}

export default function TimeDistributionChart({ data }: TimeDistributionChartProps) {
  return (
    <div className="bg-bg-secondary border border-border-theme rounded-2xl p-6">
      <h3 className="text-lg font-black text-foreground uppercase tracking-widest mb-6 flex items-center gap-3">
        <span className="w-3 h-3 bg-red-600 rounded-sm"></span>
        Study Time Distribution
      </h3>
      <ResponsiveContainer width="100%" height={300}>
        <AreaChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
          <XAxis dataKey="hour" stroke="#a1a1aa" style={{ fontSize: "12px" }} />
          <YAxis stroke="#a1a1aa" style={{ fontSize: "12px" }} />
          <Tooltip
            contentStyle={{
              backgroundColor: "#09090b",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: "8px",
              color: "#fff",
            }}
          />
          <Area type="monotone" dataKey="sessions" stroke="#dc2626" fill="#dc2626" fillOpacity={0.6} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
