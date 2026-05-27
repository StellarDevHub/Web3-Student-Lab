'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useWallet } from '@/contexts/WalletContext';
import { certificatesAPI, Course, coursesAPI, enrollmentsAPI } from '@/lib/api';
import { getCourseContent } from '@/lib/course-content';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function CourseDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user, isLoading: isAuthLoading } = useAuth();
  const { publicKey } = useWallet();
  const [course, setCourse] = useState<Course | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isEnrolled, setIsEnrolled] = useState(false);
  const [isMinting, setIsMinting] = useState(false);
  const [mintSuccess, setMintSuccess] = useState(false);

  useEffect(() => {
    if (!params?.id) return;

    async function loadCourse() {
      try {
        const id = typeof params?.id === 'string' ? params.id : params?.id?.[0];
        if (!id) return;
        const data = await coursesAPI.getById(id);
        setCourse(data);

        // Check if user is enrolled
        if (user) {
          const enrollments = await enrollmentsAPI.getByStudentId(user.id);
          const enrolled = enrollments.some((enrollment) => enrollment.courseId === data.id);
          setIsEnrolled(enrolled);
        }
      } catch (error) {
        console.error('Failed to load course:', error);
        router.push('/courses');
      } finally {
        setIsLoading(false);
      }
    }

    loadCourse();
  }, [params, user, router]);

  const handleEnroll = () => {
    if (!course) return;

    if (!publicKey) {
      router.push('/auth/login');
      return;
    }

    if (!user) {
      router.push('/auth/register');
      return;
    }

    router.push(
      `/enroll?courseId=${encodeURIComponent(course.id)}&courseTitle=${encodeURIComponent(course.title)}&credits=${course.credits}`
    );
  };

  const handleMintCertificate = async () => {
    if (!user || !course) return;
    setIsMinting(true);
    try {
      // The mock API requires an object mapping. Assuming certificatesAPI.issue accepts payload.
      await certificatesAPI.issue({ studentId: user.id, courseId: course.id });
      setMintSuccess(true);
      setTimeout(() => router.push('/certificates'), 2000);
    } catch (error) {
      console.error('Failed to mint:', error);
      alert('Failed to mint cryptographic token. It may already exist.');
    } finally {
      setIsMinting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-[calc(100vh-80px)] items-center justify-center bg-black">
        <div className="text-center">
          <div className="mx-auto mb-4 h-16 w-16 animate-spin rounded-full border-4 border-red-600/30 border-t-red-600"></div>
          <p className="font-mono text-sm tracking-widest text-red-500 uppercase">
            Loading Header Data...
          </p>
        </div>
      </div>
    );
  }

  if (!course) {
    return (
      <div className="flex min-h-[calc(100vh-80px)] items-center justify-center bg-black">
        <div className="rounded-2xl border border-red-500/50 bg-zinc-950 p-12 text-center shadow-[0_0_30px_rgba(220,38,38,0.2)]">
          <h2 className="mb-4 text-2xl font-black tracking-widest text-white uppercase">
            Node Not Found
          </h2>
          <Link
            href="/courses"
            className="group flex items-center justify-center gap-2 text-sm font-bold tracking-widest text-red-500 uppercase hover:text-red-400"
          >
            <span className="transform transition-transform group-hover:-translate-x-1">←</span>{' '}
            Return to Directory
          </Link>
        </div>
      </div>
    );
  }

  const courseContent = getCourseContent(course);

  return (
    <div className="relative min-h-[calc(100vh-80px)] overflow-hidden bg-black pb-20 text-white">
      {/* Background Glow */}
      <div className="pointer-events-none absolute top-0 right-0 h-[600px] w-[600px] rounded-full bg-red-600/10 blur-[120px]"></div>

      {/* Header */}
      <div className="relative z-10 border-b border-white/10 bg-zinc-950/80 backdrop-blur-sm">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
          <Link
            href="/courses"
            className="group mb-8 inline-flex items-center gap-2 text-xs font-bold tracking-widest text-gray-500 uppercase transition-colors hover:text-red-500"
          >
            <span className="transform transition-transform group-hover:-translate-x-1">←</span>{' '}
            Network Directory
          </Link>
          <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
            <div>
              <div className="mb-4 inline-block rounded-full border border-red-500/20 bg-red-500/10 px-3 py-1 font-mono text-xs tracking-widest text-red-500 uppercase">
                Module Initialization
              </div>
              <h1 className="mb-4 text-4xl font-black tracking-tight text-white uppercase transition-colors group-hover:text-red-50 md:text-5xl">
                {course.title}
              </h1>
              <p className="max-w-3xl text-base leading-8 text-gray-400">{courseContent.summary}</p>
              <div className="flex flex-wrap items-center gap-6 font-mono text-sm tracking-wider text-gray-400 uppercase">
                <span className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-gray-600"></span>
                  Instructor: <span className="text-white">{course.instructor}</span>
                </span>
                <span className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-red-600"></span>
                  Payload: <span className="text-white">{course.credits} UNIT</span>
                </span>
                <span className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
                  Level: <span className="text-white">{courseContent.level}</span>
                </span>
                <span className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-blue-500"></span>
                  Duration: <span className="text-white">{courseContent.duration}</span>
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="relative z-10 mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          {/* Course Details */}
          <div className="space-y-8 lg:col-span-2">
            <div className="rounded-2xl border border-white/10 bg-zinc-950 p-8 transition-colors hover:border-red-500/30">
              <h2 className="mb-6 flex items-center gap-3 text-2xl font-black tracking-widest text-white uppercase">
                <span className="inline-block h-4 w-4 rounded-sm bg-red-600"></span> Protocol
                Specifications
              </h2>
              <p className="mb-8 text-lg leading-relaxed font-light text-gray-400">
                {course.description || 'System metadata missing. Awaiting curriculum upload.'}
              </p>

              <div className="mt-8 border-t border-white/10 pt-8">
                <h3 className="mb-6 text-lg font-bold tracking-widest text-gray-300 uppercase">
                  Execution Objectives
                </h3>
                <ul className="space-y-4">
                  {courseContent.outcomes.map((outcome) => (
                    <li key={outcome} className="flex items-start gap-4 text-gray-400">
                      <div className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded border border-red-500/20 bg-red-500/10">
                        <svg
                          className="h-3 w-3 text-red-500"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={3}
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                      </div>
                      <span>{outcome}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-zinc-950 p-8">
              <h2 className="mb-6 flex items-center gap-3 text-2xl font-black tracking-widest text-white uppercase">
                <span className="inline-block h-4 w-4 rounded-sm bg-emerald-500"></span> Curriculum
                Map
              </h2>
              <div className="grid gap-4 md:grid-cols-3">
                {courseContent.modules.map((module, index) => (
                  <div
                    key={module.title}
                    className="rounded-2xl border border-white/8 bg-white/4 p-5"
                  >
                    <p className="mb-3 text-xs font-bold tracking-[0.18em] text-red-400 uppercase">
                      Module {index + 1}
                    </p>
                    <h3 className="text-lg font-semibold text-white">{module.title}</h3>
                    <p className="mt-3 text-sm leading-7 text-gray-400">{module.description}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-8 md:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-zinc-950 p-8">
                <h2 className="mb-6 text-xl font-black tracking-widest text-white uppercase">
                  Deliverables
                </h2>
                <div className="space-y-4">
                  {courseContent.deliverables.map((deliverable) => (
                    <div
                      key={deliverable}
                      className="rounded-xl border border-white/8 bg-white/4 px-4 py-4 text-sm text-gray-300"
                    >
                      {deliverable}
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-zinc-950 p-8">
                <h2 className="mb-6 text-xl font-black tracking-widest text-white uppercase">
                  Tools You Will Touch
                </h2>
                <div className="flex flex-wrap gap-3">
                  {courseContent.tools.map((tool) => (
                    <span
                      key={tool}
                      className="rounded-full border border-red-500/20 bg-red-500/10 px-4 py-2 text-xs font-bold tracking-[0.14em] text-red-300 uppercase"
                    >
                      {tool}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Action / Enrollment Card */}
          <div className="lg:col-span-1">
            <div className="sticky top-28 rounded-2xl border border-white/10 bg-zinc-950 p-8 shadow-[0_0_30px_rgba(0,0,0,0.5)]">
              <h3 className="mb-6 text-xl font-black tracking-widest text-white uppercase">
                Connection Status
              </h3>

              {isEnrolled ? (
                <div className="space-y-6">
                  <div className="rounded-xl border border-green-500/30 bg-green-500/10 p-6 text-center">
                    <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-green-500/20">
                      <svg
                        className="h-6 w-6 text-green-500"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={3}
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    </div>
                    <p className="mb-1 text-sm font-bold tracking-widest text-green-500 uppercase">
                      Uplink Active
                    </p>
                    <p className="font-mono text-xs text-gray-400">
                      Module execution in progress...
                    </p>
                  </div>

                  <div className="border-t border-white/10 pt-6">
                    <p className="mb-4 text-sm font-light text-gray-400">
                      Completed the curriculum? Execute the smart contract below to mint your
                      verifiable credential on the Stellar blockchain.
                    </p>

                    {mintSuccess ? (
                      <div className="animate-pulse rounded-xl border border-blue-500/30 bg-blue-500/10 p-4 text-center">
                        <p className="text-sm font-bold tracking-widest text-blue-500 uppercase">
                          Token Minted
                        </p>
                        <p className="mt-1 font-mono text-xs text-blue-400/70">
                          Redirecting to Vault...
                        </p>
                      </div>
                    ) : (
                      <button
                        onClick={handleMintCertificate}
                        disabled={isMinting}
                        className={`w-full rounded-xl py-4 font-black tracking-widest uppercase shadow-[0_0_15px_rgba(220,38,38,0.3)] transition-all ${
                          isMinting
                            ? 'cursor-not-allowed border border-red-900 bg-red-900 text-gray-500'
                            : 'transform bg-red-600 text-white hover:-translate-y-0.5 hover:bg-red-700 hover:shadow-[0_0_30px_rgba(220,38,38,0.6)]'
                        }`}
                      >
                        {isMinting ? 'Compiling tx...' : 'Extract Certificate'}
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div>
                  <button
                    onClick={handleEnroll}
                    disabled={isAuthLoading}
                    className={`w-full rounded-xl py-5 font-black tracking-widest uppercase transition-all ${
                      isAuthLoading
                        ? 'cursor-wait border border-white/10 bg-gray-800 text-gray-500'
                        : 'transform bg-white text-black shadow-[0_0_20px_rgba(255,255,255,0.2)] hover:-translate-y-0.5 hover:bg-gray-200'
                    }`}
                  >
                    {isAuthLoading
                      ? 'Checking session...'
                      : !publicKey
                        ? 'Connect Wallet'
                        : !user
                          ? 'Complete Profile'
                          : 'Start Enrollment'}
                  </button>
                  <p className="mt-4 text-center font-mono text-xs text-gray-500">
                    5-step wizard with progress saving
                  </p>
                  {!isAuthLoading && !user && publicKey && (
                    <p className="mt-2 text-center text-xs text-red-400">
                      Finish your profile once, then enrollment will stay available.
                    </p>
                  )}
                  <p className="mt-2 text-center font-mono text-xs text-gray-600">
                    NO GAS FEES • PUBLIC TESTNET
                  </p>
                </div>
              )}

              <div className="mt-8 border-t border-white/5 pt-8">
                <div className="space-y-4">
                  <div className="flex items-center gap-4 font-mono text-xs tracking-widest text-gray-400 uppercase">
                    <svg
                      className="h-4 w-4 text-red-500"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    Asynchronous Execution
                  </div>
                  <div className="flex items-center gap-4 font-mono text-xs tracking-widest text-gray-400 uppercase">
                    <svg
                      className="h-4 w-4 text-red-500"
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
                    On-chain Verification
                  </div>
                  <div className="flex items-center gap-4 font-mono text-xs tracking-widest text-gray-400 uppercase">
                    <svg
                      className="h-4 w-4 text-red-500"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                      />
                    </svg>
                    Encrypted Payload
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
