"use client";

import { useAuth } from "@/contexts/AuthContext";
import Dashboard from "@/components/analytics/Dashboard";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { motion } from "framer-motion";

export default function AnalyticsPage() {
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-background text-foreground pb-20 relative overflow-hidden transition-colors duration-200">
      {/* Background glows */}
      <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-red-600/5 rounded-full blur-[150px] pointer-events-none"></div>
      <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-red-600/5 rounded-full blur-[120px] pointer-events-none"></div>

      {/* Navigation */}
      <nav className="relative z-20 bg-bg-secondary/80 backdrop-blur-md border-b border-border-theme sticky top-0">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-20">
            <div className="flex items-center gap-4">
              <Link
                href="/dashboard"
                className="flex items-center gap-2 text-text-secondary hover:text-foreground transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
                <span className="text-sm font-bold uppercase tracking-widest">Back</span>
              </Link>
              <span className="text-2xl font-black text-foreground tracking-tighter uppercase flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
                Analytics <span className="text-red-600">Hub</span>
              </span>
            </div>
            <div className="flex items-center gap-4">
              <div className="hidden md:flex flex-col items-end">
                <span className="text-xs font-bold text-text-secondary uppercase tracking-widest">
                  Active Operator
                </span>
                <span className="text-sm font-mono text-foreground">
                  {user?.name || "Unknown Entity"}
                </span>
              </div>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-12 border-l-4 border-red-600 pl-6 py-2"
        >
          <h1 className="text-4xl md:text-5xl font-black text-foreground mb-3 uppercase tracking-tight">
            Advanced <span className="text-red-600">Analytics</span>
          </h1>
          <p className="text-text-secondary font-light text-lg tracking-wide">
            Deep insights into your learning patterns, progress, and performance metrics.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          <Dashboard />
        </motion.div>
      </main>
    </div>
  );
}
