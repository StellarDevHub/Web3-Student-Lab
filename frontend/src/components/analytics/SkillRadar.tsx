"use client";

import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Tooltip } from "recharts";
import { SkillDataPoint } from "@/hooks/useAnalytics";

interface SkillRadarProps {
  data: SkillDataPoint[];
}

export default function SkillRadar({ data }: SkillRadarProps) {
  return (
    <div className="bg-bg-secondary border border-border-theme rounded-2xl p-6">
      <h3 className="text-lg font-black text-foreground uppercase tracking-widest mb-6 flex items-center gap-3">
        <span className="w-3 h-3 bg-red-600 rounded-sm"></span>
        Skill Distribution
      </h3>
      <ResponsiveContainer width="100%" height={300}>
        <RadarChart data={data}>
          <PolarGrid stroke="rgba(255,255,255,0.1)" />
          <PolarAngleAxis dataKey="skill" stroke="#a1a1aa" style={{ fontSize: "12px" }} />
          <PolarRadiusAxis stroke="#a1a1aa" style={{ fontSize: "10px" }} />
          <Tooltip
            contentStyle={{
              backgroundColor: "#09090b",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: "8px",
              color: "#fff",
            }}
          />
          <Radar name="Skill Level" dataKey="level" stroke="#dc2626" fill="#dc2626" fillOpacity={0.6} />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}
