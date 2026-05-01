import { format, subDays, startOfWeek } from "date-fns";

export class DataProcessor {
  static generateMockProgressData(days: number = 30) {
    const data = [];
    for (let i = days; i >= 0; i--) {
      const date = subDays(new Date(), i);
      data.push({
        date: format(date, "MMM dd"),
        completed: Math.floor(Math.random() * 5) + i * 0.3,
        inProgress: Math.floor(Math.random() * 3) + 2,
        notStarted: Math.max(0, 10 - i * 0.2),
      });
    }
    return data;
  }

  static generateMockSkillData() {
    return [
      { skill: "Smart Contracts", level: 85, maxLevel: 100 },
      { skill: "Blockchain", level: 72, maxLevel: 100 },
      { skill: "Rust", level: 68, maxLevel: 100 },
      { skill: "Web3", level: 90, maxLevel: 100 },
      { skill: "Cryptography", level: 55, maxLevel: 100 },
      { skill: "DeFi", level: 48, maxLevel: 100 },
    ];
  }

  static generateMockCompletionData() {
    return [
      { name: "Completed", value: 45, color: "#10b981" },
      { name: "In Progress", value: 30, color: "#f59e0b" },
      { name: "Not Started", value: 25, color: "#6b7280" },
    ];
  }

  static generateMockActivityData(days: number = 90) {
    const data = [];
    for (let i = days; i >= 0; i--) {
      const date = subDays(new Date(), i);
      const count = Math.floor(Math.random() * 10);
      data.push({
        date: format(date, "yyyy-MM-dd"),
        count,
        intensity: Math.min(count / 10, 1),
      });
    }
    return data;
  }

  static generateMockTrendData() {
    const data = [];
    for (let i = 12; i >= 0; i--) {
      const weekStart = startOfWeek(subDays(new Date(), i * 7));
      data.push({
        week: format(weekStart, "MMM dd"),
        score: 60 + Math.random() * 30 + i * 2,
        velocity: Math.random() * 5 + 2,
      });
    }
    return data;
  }

  static generateMockTimeData() {
    const hours = [];
    for (let i = 0; i < 24; i++) {
      const hour = i.toString().padStart(2, "0") + ":00";
      const sessions =
        i >= 8 && i <= 22
          ? Math.floor(Math.random() * 15) + 5
          : Math.floor(Math.random() * 3);
      hours.push({ hour, sessions });
    }
    return hours;
  }

  static exportToCSV(data: Record<string, unknown>[], filename: string) {
    if (!data || data.length === 0) return;

    const headers = Object.keys(data[0]);
    const csv = [
      headers.join(","),
      ...data.map((row) =>
        headers.map((header) => JSON.stringify(row[header])).join(",")
      ),
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${filename}-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  }

  static exportChartAsPNG(chartId: string, filename: string) {
    const chartElement = document.getElementById(chartId);
    if (!chartElement) return;

    import("html2canvas").then(({ default: html2canvas }) => {
      html2canvas(chartElement).then((canvas) => {
        const url = canvas.toDataURL("image/png");
        const a = document.createElement("a");
        a.href = url;
        a.download = `${filename}-${format(new Date(), "yyyy-MM-dd")}.png`;
        a.click();
      });
    });
  }
}
