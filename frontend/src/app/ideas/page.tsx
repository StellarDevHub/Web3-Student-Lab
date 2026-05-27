'use client';

import { useState } from 'react';
import { generatorAPI, ProjectIdea } from '@/lib/api';

const IDEAS: ProjectIdea[] = [
  {
    title: 'DeFi_Primitive_01',
    recommendedTech: ['Stellar', 'Soroban', 'React'],
    description: 'Automated liquidity provider for specialized Stellar assets.',
    difficulty: 'Intermediate',
    keyFeatures: ['Liquidity Pools', 'Flash Loans', 'Yield Farming'],
  },
];

export default function IdeasPage() {
  const [isGenerating, setIsGenerating] = useState(false);
  const [activeIdea, setActiveIdea] = useState<ProjectIdea>(IDEAS[0]);

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      const idea = await generatorAPI.generateIdea({
        theme: 'Stellar Ecosystem',
        techStack: ['Soroban', 'React', 'TypeScript'],
        difficulty: 'Intermediate',
      });
      setActiveIdea(idea);
    } catch (error) {
      console.error('Failed to generate idea:', error);
      // Fallback is handled by the API (circuit breaker) or we just keep the current one
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="relative min-h-[calc(100vh-80px)] overflow-hidden bg-black p-6 font-mono text-white md:p-12">
      <div className="mx-auto flex h-full max-w-7xl flex-col items-center">
        <div className="relative mb-16 w-full border-b border-white/10 pb-12 text-center">
          <div className="absolute top-0 left-1/2 h-1 w-32 -translate-x-1/2 bg-red-600"></div>
          <h1 className="mb-2 text-4xl font-black tracking-tighter uppercase">
            Idea <span className="text-red-500">Incubator</span>
          </h1>
          <p className="text-[10px] tracking-[0.4em] text-gray-500 uppercase">
            Algorithmic Generation of Stellar Ecosystem Proposals
          </p>
        </div>

        <div className="relative w-full max-w-2xl overflow-hidden rounded-[2rem] border border-white/10 bg-zinc-950 p-12 shadow-2xl">
          <div className="absolute top-4 right-8">
            <span className="text-[10px] font-black tracking-widest text-red-600/40 uppercase">
              ID_GEN_0x992
            </span>
          </div>

          <div
            className={`transition-all duration-700 ${isGenerating ? 'opacity-30 blur-md grayscale' : ''}`}
          >
            <span className="mb-6 inline-block rounded-sm bg-red-600 px-3 py-1 text-[9px] font-black tracking-widest text-white uppercase">
              {activeIdea.difficulty}
            </span>
            <h2 className="mb-4 text-3xl font-black tracking-tighter text-white uppercase">
              {activeIdea.title}
            </h2>
            <p className="mb-12 text-sm leading-relaxed font-light text-gray-400">
              {activeIdea.description}
            </p>

            <div className="mb-12 grid grid-cols-3 gap-4 border-t border-white/5 pt-8">
              <div>
                <p className="mb-1 text-[9px] font-bold tracking-widest text-gray-600 uppercase">
                  Complexity
                </p>
                <div className="flex gap-1">
                  <div
                    className={`h-2 w-2 ${activeIdea.difficulty === 'Beginner' ? 'bg-red-600' : 'bg-red-600'}`}
                  ></div>
                  <div
                    className={`h-2 w-2 ${activeIdea.difficulty !== 'Beginner' ? 'bg-red-600' : 'bg-zinc-800'}`}
                  ></div>
                  <div
                    className={`h-2 w-2 ${activeIdea.difficulty === 'Advanced' ? 'bg-red-600' : 'bg-zinc-800'}`}
                  ></div>
                </div>
              </div>
              <div>
                <p className="mb-1 text-[9px] font-bold tracking-widest text-gray-600 uppercase">
                  Tech Stack
                </p>
                <p className="truncate text-[10px] font-bold text-white">
                  {activeIdea.recommendedTech.join(', ')}
                </p>
              </div>
              <div>
                <p className="mb-1 text-[9px] font-bold tracking-widest text-gray-600 uppercase">
                  Features
                </p>
                <p className="truncate text-[10px] font-bold text-white">
                  {activeIdea.keyFeatures.length} Core
                </p>
              </div>
            </div>
          </div>

          <button
            onClick={handleGenerate}
            disabled={isGenerating}
            className={`w-full transform rounded-xl py-5 text-xs font-black tracking-[0.3em] uppercase transition-all hover:-translate-y-1 active:scale-95 ${
              isGenerating
                ? 'cursor-not-allowed bg-zinc-900 text-gray-600'
                : 'bg-white text-black shadow-[0_0_30px_rgba(255,255,255,0.1)] hover:bg-red-600 hover:text-white hover:shadow-[0_0_40px_rgba(220,38,38,0.4)]'
            }`}
          >
            {isGenerating ? 'Synthesizing Logic...' : 'Iterate Concept'}
          </button>
        </div>

        <div className="mt-16 max-w-xl text-center">
          <p className="text-[10px] leading-relaxed font-light tracking-widest text-gray-600 uppercase">
            The incubator utilizes <span className="text-white">probabilistic heuristics</span> to
            identify unoccupied niches in the Stellar ecosystem. Generated ideas are conceptualized
            for <span className="text-red-500">Soroban architecture</span> and Stellar network
            topology.
          </p>
        </div>
      </div>
    </div>
  );
}
