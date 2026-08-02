'use client';

import React from 'react';
import RoadmapNode, { Milestone } from './RoadmapNode';

interface RoadmapTimelineProps {
  milestones: Milestone[];
  onNodeSelect?: (id: string) => void;
}

export default function RoadmapTimeline({ milestones, onNodeSelect }: RoadmapTimelineProps) {
  return (
    <div className="w-full min-h-screen bg-slate-950 py-12 px-4 md:px-8 overflow-x-hidden">
      <div className="max-w-4xl mx-auto text-center mb-16">
        <span className="text-xs font-bold tracking-widest text-blue-500 uppercase">Learning Path</span>
        <h1 className="text-3xl md:text-4xl font-extrabold text-white mt-2">Web3 Architecture Developer Map</h1>
        <p className="text-slate-400 mt-3 max-w-md mx-auto text-sm">
          Complete individual module nodes sequentially to unlock deep-dive interactive lab sandboxes.
        </p>
      </div>

      {/* Baseline Timeline Tracking Container Wrapper */}
      <div className="relative max-w-5xl mx-auto flex flex-col justify-start">

        {/* Central Vertical Connecting Track Background Line */}
        <div className="absolute top-2 bottom-2 left-4 md:left-1/2 -translate-x-1/2 w-1 bg-slate-800 z-10 rounded-full">
          {/* Active progressive gradient accent lines can be dynamic mapped contextually here */}
        </div>

        {milestones.map((milestone, idx) => (
          <RoadmapNode
            key={milestone.id}
            milestone={milestone}
            index={idx}
            onNodeSelect={onNodeSelect}
          />
        ))}
      </div>
    </div>
  );
}
