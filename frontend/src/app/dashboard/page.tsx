"use client";

import AuditLogList from "@/components/dashboard/AuditLogList";
import LayoutGrid from "@/components/dashboard/LayoutGrid";
import { useAuth } from "@/contexts/AuthContext";
import { useLayoutPersistence } from "@/hooks/useLayoutPersistence";
import {
    Certificate,
    certificatesAPI,
    Course,
    coursesAPI,
    Enrollment,
    enrollmentsAPI,
} from "@/lib/api";
import Link from "next/link";
import { WithSkeleton } from "@/components/ui/WithSkeleton";
import { StatCardSkeleton, CourseCardSkeleton, CertCardSkeleton } from "@/components/ui/skeletons/CardSkeleton";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";

export default function DashboardPage() {
  const { user, logout } = useAuth();
  const [courses, setCourses] = useState<Course[]>([]);
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [_enrollments, setEnrollments] = useState<Enrollment[]>([]); // eslint-disable-line @typescript-eslint/no-unused-vars
  const [isLoading, setIsLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [stats, setStats] = useState({
    totalCourses: 0,
    enrolledCourses: 0,
    completedCourses: 0,
    certificates: 0,
  });

  const { layout, saveLayout, resetLayout } = useLayoutPersistence(user?.id);

  useEffect(() => {
    async function loadDashboard() {
      try {
        const [coursesData, certificatesData, enrollmentsData] =
          await Promise.all([
            coursesAPI.getAll(),
            user
              ? certificatesAPI.getByStudentId(user.id)
              : Promise.resolve([]),
            user ? enrollmentsAPI.getByStudentId(user.id) : Promise.resolve([]),
          ]);

        setCourses(coursesData);
        setCertificates(certificatesData);
        setEnrollments(enrollmentsData);

        setStats({
          totalCourses: coursesData.length,
          enrolledCourses: enrollmentsData.length,
          completedCourses: certificatesData.length,
          certificates: certificatesData.length,
        });
      } catch (error) {
        console.error("Failed to load dashboard:", error);
      } finally {
        setIsLoading(false);
      }
    }

    loadDashboard();
  }, [user]);


  // --- Panel content definitions ---

  const statsPanel = (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
      {[
        { label: "Available Nodes", value: stats.totalCourses },
        { label: "Active Uplinks", value: stats.enrolledCourses },
        { label: "Executed Modules", value: stats.completedCourses },
        { label: "Cryptographic Tokens", value: stats.certificates },
      ].map(({ label, value }) => (
        <div
          key={label}
          className="bg-zinc-950 border border-white/10 rounded-2xl p-6 hover:border-red-500/50 hover:shadow-[0_0_30px_rgba(220,38,38,0.1)] transition-all group relative overflow-hidden"
        >
          <div className="absolute top-0 right-0 w-16 h-16 bg-white/5 rounded-bl-3xl group-hover:bg-red-500/10 transition-colors"></div>
          <p className="text-3xl font-black text-white font-mono">{value}</p>
          <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mt-2">
            {label}
          </p>
        </div>
      ))}
    </div>
  );

  const coursesPanel = (
    <div>
      <div className="flex justify-between items-center mb-8 border-b border-white/10 pb-4">
        <h3 className="text-xl font-black text-white uppercase tracking-widest flex items-center gap-3">
          <span className="w-4 h-4 bg-red-600 rounded-sm inline-block"></span>
          Directory Nodes
        </h3>
        <Link
          href="/courses"
          className="text-gray-400 hover:text-white uppercase text-xs font-bold tracking-widest transition-colors flex items-center gap-1 group"
        >
          Scan All{" "}
          <span className="transform group-hover:translate-x-1 transition-transform">
            →
          </span>
        </Link>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {courses.slice(0, 4).map((course) => (
          <Link
            key={course.id}
            href={`/courses/${course.id}`}
            className="bg-zinc-950 border border-white/5 p-8 hover:border-red-500/30 hover:bg-zinc-900 transition-all block group relative"
          >
            <div className="absolute left-0 top-0 bottom-0 w-1 bg-transparent group-hover:bg-red-600 transition-colors"></div>
            <h4 className="text-xl font-black text-white mb-3 uppercase tracking-tight group-hover:text-red-50">
              {course.title}
            </h4>
            <p className="text-gray-400 font-light text-sm mb-6 line-clamp-2">
              {course.description || "System metadata missing"}
            </p>
            <div className="flex justify-between items-center pt-6 border-t border-white/5">
              <span className="text-xs font-mono text-gray-500 px-2 py-1 bg-black border border-white/10 rounded">
                {course.credits} UNIT
              </span>
              <span className="text-xs font-bold text-red-500 uppercase tracking-widest group-hover:text-red-400">
                Connect
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );

  const certificatesPanel = (
    <div>
      <div className="flex justify-between items-center mb-8 border-b border-white/10 pb-4">
        <h3 className="text-xl font-black text-white uppercase tracking-widest flex items-center gap-3">
          <span className="w-4 h-4 bg-red-600 rounded-sm inline-block"></span>
          Issued Credentials
        </h3>
        <Link
          href="/certificates"
          className="text-gray-400 hover:text-white uppercase text-xs font-bold tracking-widest transition-colors flex items-center gap-1 group"
        >
          Vault{" "}
          <span className="transform group-hover:translate-x-1 transition-transform">
            →
          </span>
        </Link>
      </div>
      <div className="flex flex-col gap-4">
        {certificates.length === 0 ? (
          <p className="text-gray-600 text-sm font-mono">No credentials issued yet.</p>
        ) : (
          certificates.slice(0, 3).map((cert) => (
            <Link
              key={cert.id}
              href={`/certificates/${cert.id}`}
              className="bg-black border border-red-500/20 rounded-xl p-6 hover:border-red-500/60 transition-all block group"
            >
              <h4 className="text-base font-bold text-white uppercase tracking-wide group-hover:text-red-100">
                {cert.course?.title || "Soroban Protocol"}
              </h4>
              <p className="text-xs font-light text-red-500/80 mt-1">
                {new Date(cert.issuedAt).toLocaleDateString()}
              </p>
            </Link>
          ))
        )}
      </div>
    </div>
  );

  const auditPanel = (
    <div>
      <div className="flex justify-between items-center mb-8 border-b border-white/10 pb-4">
        <h3 className="text-xl font-black text-white uppercase tracking-widest flex items-center gap-3">
          <span className="w-4 h-4 bg-red-600 rounded-sm inline-block"></span>
          Audit Trails{" "}
          <span className="text-gray-600">[Admin Only]</span>
        </h3>
        <span className="px-3 py-1 bg-red-500/10 border border-red-500/20 text-red-500 text-[10px] font-black uppercase tracking-widest rounded-full">
          Live Monitoring
        </span>
      </div>
      <div className="bg-zinc-950/50 backdrop-blur-sm border border-white/5 rounded-2xl p-8">
        <AuditLogList />
      </div>
    </div>
  );

  const panelDefs = [
    { id: "stats", content: statsPanel },
    { id: "courses", content: coursesPanel },
    { id: "certificates", content: certificatesPanel },
    { id: "audit", content: auditPanel },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground selection:bg-red-600 selection:text-white pb-20 relative overflow-hidden transition-colors duration-200">
      {/* Background glows */}
      <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-red-600/5 rounded-full blur-[150px] pointer-events-none"></div>
      <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-red-600/5 rounded-full blur-[120px] pointer-events-none"></div>

      {/* Nav */}
      <nav className="relative z-20 bg-zinc-950/80 backdrop-blur-md border-b border-white/10 sticky top-0">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-20">
            <div className="flex items-center gap-4">
              <span className="text-2xl font-black text-white tracking-tighter uppercase flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
                Control <span className="text-red-600">Center</span>
              </span>
            </div>
            <div className="flex items-center gap-4">
              {/* Analytics Link */}
              <Link
                href="/analytics"
                className="px-4 py-2 text-xs font-bold text-gray-400 bg-zinc-900 border border-white/10 rounded-lg hover:border-red-500/50 hover:text-white transition-all uppercase tracking-widest flex items-center gap-2"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                Analytics
              </Link>

              {/* Layout edit controls */}
              {editMode ? (
                <div className="flex items-center gap-2">
                  <button
                    onClick={resetLayout}
                    className="px-4 py-2 text-xs font-bold text-gray-400 bg-zinc-900 border border-white/10 rounded-lg hover:border-white/30 transition-all uppercase tracking-widest"
                  >
                    Reset
                  </button>
                  <button
                    onClick={() => setEditMode(false)}
                    className="px-4 py-2 text-xs font-bold text-white bg-red-600 border border-red-600 rounded-lg hover:bg-red-700 transition-all uppercase tracking-widest"
                  >
                    Done
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setEditMode(true)}
                  className="px-4 py-2 text-xs font-bold text-gray-400 bg-zinc-900 border border-white/10 rounded-lg hover:border-red-500/50 hover:text-white transition-all uppercase tracking-widest flex items-center gap-2"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                  </svg>
                  Edit Layout
                </button>
              )}

              <div className="hidden md:flex flex-col items-end">
                <span className="text-xs font-bold text-text-secondary uppercase tracking-widest">
                  Active Operator
                </span>
                <span className="text-sm font-mono text-text-secondary">
                  {user?.name || "Unknown Entity"}
                </span>
              </div>
              <ThemeToggle />
              <button
                onClick={logout}
                className="px-5 py-2.5 text-xs font-bold text-red-500 bg-red-500/10 border border-red-500/30 rounded-lg hover:bg-red-500 hover:text-white transition-all uppercase tracking-widest"
              >
                Disconnect
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Edit mode banner */}
      {editMode && (
        <div className="relative z-10 bg-red-600/10 border-b border-red-500/30 px-4 py-2 text-center">
          <p className="text-xs font-bold text-red-400 uppercase tracking-widest">
            Layout Edit Mode — Drag panels to reorder · Click 1/2/3 to resize columns · Changes are saved automatically
          </p>
        </div>
      )}

      {/* Main */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 relative z-10">
        <div className="mb-12 border-l-4 border-red-600 pl-6 py-2">
          <h2 className="text-4xl md:text-5xl font-black text-foreground mb-3 uppercase tracking-tight">
            Terminal <span className="text-text-secondary">Access Granted</span>
          </h2>
          <p className="text-text-secondary font-light text-lg tracking-wide">
            Operator{" "}
            <span className="text-foreground font-mono">
              {user?.name?.split(" ")[0] || "Student"}
            </span>{" "}
            — Metrics and module connections active.
          </p>
        </div>

        {/* Stats Grid */}
        <WithSkeleton
          isLoading={isLoading}
          skeleton={
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-16">
              <StatCardSkeleton />
              <StatCardSkeleton />
              <StatCardSkeleton />
              <StatCardSkeleton />
            </div>
          }
        >
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-16">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="bg-bg-secondary border border-border-theme rounded-2xl p-6 hover:border-red-500/50 hover:shadow-[0_0_30px_rgba(220,38,38,0.1)] transition-all group relative overflow-hidden">
            <div className="absolute top-0 right-0 w-16 h-16 bg-white/5 rounded-bl-3xl group-hover:bg-red-500/10 transition-colors"></div>
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 bg-black border border-white/10 rounded-xl flex items-center justify-center group-hover:border-white/30 transition-colors">
                <svg
                  className="w-6 h-6 text-white group-hover:text-red-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
                  />
                </svg>
              </div>
              <p className="text-3xl font-black text-white font-mono">
                {stats.totalCourses}
              </p>
            </div>
            <p className="text-xs font-bold text-text-secondary uppercase tracking-widest mt-2">
              Available Nodes
            </p>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="bg-bg-secondary border border-border-theme rounded-2xl p-6 hover:border-red-500/50 hover:shadow-[0_0_30px_rgba(220,38,38,0.1)] transition-all group relative overflow-hidden">
            <div className="absolute top-0 right-0 w-16 h-16 bg-white/5 rounded-bl-3xl group-hover:bg-red-500/10 transition-colors"></div>
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 bg-black border border-white/10 rounded-xl flex items-center justify-center group-hover:border-white/30 transition-colors">
                <svg
                  className="w-6 h-6 text-white group-hover:text-red-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>
              <p className="text-3xl font-black text-white font-mono">
                {stats.enrolledCourses}
              </p>
            </div>
            <p className="text-xs font-bold text-text-secondary uppercase tracking-widest mt-2">
              Active Uplinks
            </p>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="bg-bg-secondary border border-border-theme rounded-2xl p-6 hover:border-red-500/50 hover:shadow-[0_0_30px_rgba(220,38,38,0.1)] transition-all group relative overflow-hidden">
            <div className="absolute top-0 right-0 w-16 h-16 bg-white/5 rounded-bl-3xl group-hover:bg-red-500/10 transition-colors"></div>
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 bg-black border border-white/10 rounded-xl flex items-center justify-center group-hover:border-white/30 transition-colors">
                <svg
                  className="w-6 h-6 text-white group-hover:text-red-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z"
                  />
                </svg>
              </div>
              <p className="text-3xl font-black text-white font-mono">
                {stats.completedCourses}
              </p>
            </div>
            <p className="text-xs font-bold text-text-secondary uppercase tracking-widest mt-2">
              Executed Modules
            </p>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="bg-bg-secondary border border-border-theme rounded-2xl p-6 hover:border-red-500/50 hover:shadow-[0_0_30px_rgba(220,38,38,0.1)] transition-all group relative overflow-hidden">
            <div className="absolute top-0 right-0 w-16 h-16 bg-white/5 rounded-bl-3xl group-hover:bg-red-500/10 transition-colors"></div>
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 bg-black border border-white/10 rounded-xl flex items-center justify-center group-hover:border-white/30 transition-colors">
                <svg
                  className="w-6 h-6 text-white group-hover:text-red-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"
                  />
                </svg>
              </div>
              <p className="text-3xl font-black text-white font-mono">
                {stats.certificates}
              </p>
            </div>
            <p className="text-xs font-bold text-text-secondary uppercase tracking-widest mt-2">
              Cryptographic Tokens
            </p>
          </motion.div>
        </div>
        </WithSkeleton>

        {/* Recent Courses */}
        <div className="mb-16 [content-visibility:auto] [contain-intrinsic-size:1px_500px]">
          <div className="flex justify-between items-center mb-8 border-b border-border-theme pb-4">
            <h3 className="text-xl font-black text-foreground uppercase tracking-widest flex items-center gap-3">
              <span className="w-4 h-4 bg-red-600 rounded-sm inline-block"></span>{" "}
              Directory Nodes
            </h3>
            <Link
              href="/courses"
              className="text-text-secondary hover:text-foreground uppercase text-xs font-bold tracking-widest transition-colors flex items-center gap-1 group"
            >
              Scan All{" "}
              <span className="transform group-hover:translate-x-1 transition-transform">
                →
              </span>
            </Link>
          </div>
          <WithSkeleton
            isLoading={isLoading}
            skeleton={
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <CourseCardSkeleton />
                <CourseCardSkeleton />
                <CourseCardSkeleton />
              </div>
            }
          >
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {courses.slice(0, 3).map((course, index) => (
              <Link
                key={course.id}
                href={`/courses/${course.id}`}
              >
                <motion.div
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.4, delay: index * 0.1 }}
                  className="bg-bg-secondary border border-border-theme/50 p-8 hover:border-red-500/30 hover:bg-bg-tertiary transition-all block group relative h-full"
                >
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-transparent group-hover:bg-red-600 transition-colors"></div>
                  <h4 className="text-xl font-black text-foreground mb-3 uppercase tracking-tight group-hover:text-red-500 transition-colors">
                    {course.title}
                  </h4>
                  <p className="text-text-secondary font-light text-sm mb-6 line-clamp-2">
                    {course.description || "System metadata missing"}
                  </p>
                  <div className="flex justify-between items-center pt-6 border-t border-border-theme/50 mt-auto">
                    <span className="text-xs font-mono text-text-secondary px-2 py-1 bg-background border border-border-theme rounded">
                      {course.credits} UNIT
                    </span>
                    <span className="text-xs font-bold text-red-500 uppercase tracking-widest group-hover:text-red-400">
                      Connect
                    </span>
                  </div>
                </motion.div>
              </Link>
            ))}
          </div>
          </WithSkeleton>
        </div>

        {/* My Certificates */}
        {(isLoading || certificates.length > 0) && (
          <div className="mb-16 [content-visibility:auto] [contain-intrinsic-size:1px_500px]">
            <div className="flex justify-between items-center mb-8 border-b border-border-theme pb-4">
              <h3 className="text-xl font-black text-foreground uppercase tracking-widest flex items-center gap-3">
                <span className="w-4 h-4 bg-red-600 rounded-sm inline-block"></span>{" "}
                Issued Credentials
              </h3>
              <Link
                href="/certificates"
                className="text-text-secondary hover:text-foreground uppercase text-xs font-bold tracking-widest transition-colors flex items-center gap-1 group"
              >
                Vault{" "}
                <span className="transform group-hover:translate-x-1 transition-transform">
                  →
                </span>
              </Link>
            </div>
            </div>
            <WithSkeleton
              isLoading={isLoading}
              skeleton={
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  <CertCardSkeleton />
                  <CertCardSkeleton />
                  <CertCardSkeleton />
                </div>
              }
            >
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {certificates.slice(0, 3).map((cert, index) => (
                <Link
                  key={cert.id}
                  href={`/certificates/${cert.id}`}
                >
                  <motion.div
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.4, delay: index * 0.1 }}
                    className="bg-background border border-red-500/20 rounded-xl p-8 hover:border-red-500/60 shadow-[0_0_20px_rgba(220,38,38,0.05)] hover:shadow-[0_0_30px_rgba(220,38,38,0.2)] transition-all block relative group overflow-hidden h-full"
                  >
                    <div className="absolute top-0 right-0 w-32 h-32 bg-red-900/10 rounded-bl-full pointer-events-none group-hover:bg-red-900/20 transition-colors"></div>
                    <div className="flex items-start justify-between mb-6 relative z-10">
                      <div className="w-12 h-12 bg-bg-secondary border border-red-500/30 rounded-xl flex items-center justify-center">
                        <svg
                          className="w-6 h-6 text-red-500"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z"
                          />
                        </svg>
                      </div>
                      <span className="text-xs font-mono bg-bg-secondary border border-border-theme text-text-secondary px-3 py-1 rounded">
                        {new Date(cert.issuedAt).toLocaleDateString()}
                      </span>
                    </div>
                    <h4 className="text-xl font-bold text-foreground mb-2 uppercase tracking-wide group-hover:text-red-500 transition-colors">
                      {cert.course?.title || "Soroban Protocol"}
                    </h4>
                    <p className="text-sm font-light text-red-500/80">
                      On-Chain Certification
                    </p>
                  </motion.div>
                </Link>
              ))}
            </div>
            </WithSkeleton>
          </div>
        )}

        {/* Audit Logs Section */}
        <div className="mt-20 [content-visibility:auto] [contain-intrinsic-size:1px_500px]">
          <div className="flex justify-between items-center mb-8 border-b border-border-theme pb-4">
            <h3 className="text-xl font-black text-foreground uppercase tracking-widest flex items-center gap-3">
              <span className="w-4 h-4 bg-red-600 rounded-sm inline-block"></span>{" "}
              Audit Trails <span className="text-text-secondary">[Admin Only]</span>
            </h3>
            <span className="px-3 py-1 bg-red-500/10 border border-red-500/20 text-red-500 text-[10px] font-black uppercase tracking-widest rounded-full">
              Live Monitoring
            </span>
          </div>
          <div className="bg-bg-secondary/50 backdrop-blur-sm border border-border-theme/50 rounded-2xl p-8">
            <AuditLogList />
          </div>
        </div>
        <LayoutGrid
          layout={layout}
          editMode={editMode}
          panels={panelDefs}
          onLayoutChange={saveLayout}
        />
      </main>
    </div>
  );
}
