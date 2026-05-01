"use client";

import { useState } from "react";
import { generatorAPI, ProjectIdea } from "@/lib/api";

const IDEAS: ProjectIdea[] = [
  {
    title: "DeFi_Primitive_01",
    recommendedTech: ["Stellar", "Soroban", "React"],
    description: "Automated liquidity provider for specialized Stellar assets.",
    difficulty: "Intermediate",
    keyFeatures: ["Liquidity Pools", "Flash Loans", "Yield Farming"],
  },
];

export default function IdeasPage() {
  const [isGenerating, setIsGenerating] = useState(false);
  const [activeIdea, setActiveIdea] = useState<ProjectIdea>(IDEAS[0]);

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      const idea = await generatorAPI.generateIdea({
        theme: "Stellar Ecosystem",
        techStack: ["Soroban", "React", "TypeScript"],
        difficulty: "Intermediate",
      });
      setActiveIdea(idea);
    } catch (error) {
      console.error("Failed to generate idea:", error);
      // Fallback is handled by the API (circuit breaker) or we just keep the current one
    } finally {
      setIsGenerating(false);
    }
  };


  return (
    <div className="min-h-[calc(100vh-80px)] bg-black text-white p-6 md:p-12 relative overflow-hidden font-mono">
      <div className="max-w-7xl mx-auto h-full flex flex-col items-center">
        <div className="mb-16 text-center border-b border-white/10 pb-12 w-full relative">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-1 bg-red-600"></div>
          <h1 className="text-4xl font-black uppercase tracking-tighter mb-2">
            Idea <span className="text-red-500">Incubator</span>
          </h1>
          <p className="text-[10px] text-gray-500 uppercase tracking-[0.4em]">
            Algorithmic Generation of Stellar Ecosystem Proposals
          </p>
        </div>

        <div className="w-full max-w-2xl bg-zinc-950 border border-white/10 rounded-[2rem] p-12 shadow-2xl relative overflow-hidden">
          <div className="absolute top-4 right-8">
            <span className="text-[10px] font-black text-red-600/40 uppercase tracking-widest">
              ID_GEN_0x992
            </span>
          </div>

          <div
            className={`transition-all duration-700 ${isGenerating ? "blur-md grayscale opacity-30" : ""}`}
          >
            <span className="text-[9px] font-black bg-red-600 text-white px-3 py-1 rounded-sm uppercase tracking-widest mb-6 inline-block">
              {activeIdea.difficulty}
            </span>
            <h2 className="text-3xl font-black uppercase tracking-tighter mb-4 text-white">
              {activeIdea.title}
            </h2>
            <p className="text-sm text-gray-400 font-light leading-relaxed mb-12">
              {activeIdea.description}
            </p>

            <div className="grid grid-cols-3 gap-4 border-t border-white/5 pt-8 mb-12">
              <div>
                <p className="text-[9px] text-gray-600 font-bold uppercase tracking-widest mb-1">
                  Complexity
                </p>
                <div className="flex gap-1">
                  <div className={`w-2 h-2 ${activeIdea.difficulty === 'Beginner' ? 'bg-red-600' : 'bg-red-600'}`}></div>
                  <div className={`w-2 h-2 ${activeIdea.difficulty !== 'Beginner' ? 'bg-red-600' : 'bg-zinc-800'}`}></div>
                  <div className={`w-2 h-2 ${activeIdea.difficulty === 'Advanced' ? 'bg-red-600' : 'bg-zinc-800'}`}></div>
                </div>
              </div>
              <div>
                <p className="text-[9px] text-gray-600 font-bold uppercase tracking-widest mb-1">
                  Tech Stack
                </p>
                <p className="text-[10px] text-white font-bold truncate">
                  {activeIdea.recommendedTech.join(', ')}
                </p>
              </div>
              <div>
                <p className="text-[9px] text-gray-600 font-bold uppercase tracking-widest mb-1">
                  Features
                </p>
                <p className="text-[10px] text-white font-bold truncate">
                  {activeIdea.keyFeatures.length} Core
                </p>
              </div>
            </div>
          </div>


          <button
            onClick={handleGenerate}
            disabled={isGenerating}
            className={`w-full py-5 rounded-xl text-xs font-black uppercase tracking-[0.3em] transition-all transform hover:-translate-y-1 active:scale-95 ${
              isGenerating
                ? "bg-zinc-900 text-gray-600 cursor-not-allowed"
                : "bg-white text-black hover:bg-red-600 hover:text-white shadow-[0_0_30px_rgba(255,255,255,0.1)] hover:shadow-[0_0_40px_rgba(220,38,38,0.4)]"
            }`}
          >
            {isGenerating ? "Synthesizing Logic..." : "Iterate Concept"}
          </button>
        </div>

        <div className="mt-16 max-w-xl text-center">
          <p className="text-[10px] text-gray-600 font-light leading-relaxed uppercase tracking-widest">
            The incubator utilizes{" "}
            <span className="text-white">probabilistic heuristics</span> to
            identify unoccupied niches in the Stellar ecosystem. Generated ideas
            are conceptualized for{" "}
            <span className="text-red-500">Soroban architecture</span> and
            Stellar network topology.
          </p>
        </div>
      </div>
    </div>
  );
}
