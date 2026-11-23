'use client';

import { useMemo, useState } from 'react';
import { Cpu, Map, MapPin } from 'lucide-react';
import { RoadmapView } from '@/components/roadmap';
import { courses as curriculumCourses } from '@/app/curriculum-data';
import {
  DEFAULT_CONSENSUS_NODES,
  runConsensusRound,
  type ConsensusAlgorithm,
} from '@/lib/consensus-sandbox';
import type { Course } from '@/lib/api';

export default function RoadmapPage() {
  const [selectedCourseId, setSelectedCourseId] = useState(curriculumCourses[0]!.id);
  const [algorithm, setAlgorithm] = useState<ConsensusAlgorithm>('fba');
  const selectedCourse = useMemo(
    () => curriculumCourses.find((course) => course.id === selectedCourseId) ?? curriculumCourses[0]!,
    [selectedCourseId]
  );
  const roadmapCourse = useMemo<Course>(
    () => ({
      id: selectedCourse.id,
      title: selectedCourse.title,
      description: selectedCourse.description,
      instructor: 'Web3 Student Lab',
      credits: selectedCourse.lessons.length,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }),
    [selectedCourse]
  );
  const consensus = useMemo(
    () => runConsensusRound(algorithm, DEFAULT_CONSENSUS_NODES),
    [algorithm]
  );

  return (
    <div className="relative min-h-[calc(100vh-80px)] overflow-hidden bg-black pb-24 font-mono text-white selection:bg-red-500/30">
      <div className="pointer-events-none absolute top-[10%] left-[10%] h-[30%] w-[30%] rounded-full bg-[radial-gradient(circle,rgba(220,38,38,0.1),transparent_70%)] blur-[100px]" />

      <div className="relative z-10 mx-auto max-w-7xl px-4 pt-16 sm:px-6 lg:px-8">
        <div className="mb-12">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-red-400 shadow-[0_0_20px_rgba(220,38,38,0.2)]">
            <Map className="h-3.5 w-3.5" />
            <span>Learning Trajectory</span>
          </div>
          <h1 className="mb-4 text-5xl font-black uppercase leading-[1.05] tracking-tighter text-white sm:text-7xl">
            Interactive <br />
            <span className="bg-gradient-to-r from-red-500 to-orange-500 bg-clip-text text-transparent">
              Roadmap
            </span>
          </h1>
          <p className="max-w-2xl border-l-2 border-red-500/50 pl-4 text-sm font-light leading-relaxed text-gray-400">
            Visualize your learning path and experiment with consensus models used by decentralized networks.
          </p>
        </div>

        <div className="mb-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
          <div className="rounded-[2rem] border border-white/5 bg-zinc-950/60 p-6 backdrop-blur-md">
            <label
              htmlFor="course-select"
              className="mb-3 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-red-500"
            >
              <MapPin className="h-3.5 w-3.5" />
              Select Learning Path
            </label>
            <select
              id="course-select"
              value={selectedCourseId}
              onChange={(event) => setSelectedCourseId(event.target.value)}
              className="w-full cursor-pointer appearance-none rounded-2xl border border-white/10 bg-black px-6 py-4 text-sm font-bold text-white shadow-inner transition-all focus:border-red-500/50 focus:outline-none focus:ring-4 focus:ring-red-500/10"
            >
              {curriculumCourses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.title}
                </option>
              ))}
            </select>
          </div>

          <section className="rounded-[2rem] border border-white/5 bg-zinc-950/60 p-6 backdrop-blur-md">
            <div className="mb-4 flex items-center gap-3">
              <Cpu className="h-5 w-5 text-red-500" />
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-red-500">
                  Consensus Sandbox
                </p>
                <h2 className="text-lg font-black uppercase">Round Simulator</h2>
              </div>
            </div>
            <div className="mb-5 grid grid-cols-3 gap-2">
              {(['pow', 'pos', 'fba'] as ConsensusAlgorithm[]).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setAlgorithm(option)}
                  className={`rounded-xl border px-3 py-2 text-xs font-black uppercase ${
                    algorithm === option
                      ? 'border-red-500 bg-red-500/20 text-white'
                      : 'border-white/10 bg-black/30 text-gray-400'
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-gray-500">Leader</p>
                  <p className="font-mono text-xl font-black">{consensus.leaderId ?? 'None'}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-gray-500">Agreement</p>
                  <p className="font-mono text-xl font-black">{consensus.agreementPercent}%</p>
                </div>
              </div>
              <p className="mt-4 text-xs leading-relaxed text-gray-400">{consensus.explanation}</p>
              <p className={`mt-3 text-xs font-black uppercase ${consensus.finalized ? 'text-green-400' : 'text-yellow-400'}`}>
                {consensus.finalized ? 'Finalized' : 'Not finalized'}
              </p>
            </div>
          </section>
        </div>

        <div className="overflow-hidden rounded-[2rem] border border-white/5 bg-zinc-950/40 shadow-[0_20px_40px_rgba(0,0,0,0.4)] backdrop-blur-md">
          <RoadmapView course={roadmapCourse} key={selectedCourseId} />
        </div>
      </div>
    </div>
  );
}
