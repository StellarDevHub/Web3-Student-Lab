"use client";

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { CompletionDataPoint } from "@/hooks/useAnalytics";

interface CompletionPieProps {
  data: CompletionDataPoint[];
}

export default function CompletionPie({ data }: CompletionPieProps) {
  return (
    <div className="bg-bg-secondary border border-border-theme rounded-2xl p-6">
      <h3 className="text-lg font-black text-foreground uppercase tracking-widest mb-6 flex items-center gap-3">
        <span className="w-3 h-3 bg-red-600 rounded-sm"></span>
        Course Completion
      </h3>
      <ResponsiveContainer width="100%" height={300}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            labelLine={false}
            label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
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
              backgroundColor: "#09090b",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: "8px",
              color: "#fff",
            }}
          />
          <Legend wrapperStyle={{ fontSize: "12px", color: "#a1a1aa" }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
