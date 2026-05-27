import React from 'react';
import {
  Box,
  Cpu,
  Wallet,
  Download,
  Share2,
  Layers,
  MousePointer2,
  Pencil,
  Eraser,
  Redo2,
  Undo2,
  Landmark,
  Lock,
  Zap,
} from 'lucide-react';
import { cn } from '../../lib/utils';

interface ToolbarProps {
  onAddShape: (type: string) => void;
  onExport: () => void;
}

export const Toolbar: React.FC<ToolbarProps> = ({ onAddShape, onExport }) => {
  return (
    <>
      {/* Top Center Main Tools */}
      <div className="absolute top-6 left-1/2 z-10 flex -translate-x-1/2 items-center rounded-2xl border border-white/10 bg-gray-950/60 p-1.5 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.5)] backdrop-blur-3xl transition-all hover:border-white/20">
        <div className="flex items-center gap-1">
          <ToolButton icon={MousePointer2} active />
          <ToolButton icon={Pencil} />
          <ToolButton icon={Eraser} />
          <div className="mx-1 h-5 w-px bg-white/10" />
          <ToolButton icon={Undo2} />
          <ToolButton icon={Redo2} />
        </div>
      </div>

      {/* Left Vertical Template Panel */}
      <div className="absolute top-1/2 left-6 z-10 flex -translate-y-1/2 flex-col gap-4 rounded-[2.5rem] border border-white/10 bg-gray-950/60 p-4 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.5)] backdrop-blur-3xl">
        <div className="mb-2 flex flex-col items-center gap-1">
          <Layers className="h-4 w-4 text-gray-500" />
          <div className="h-0.5 w-4 rounded-full bg-red-500 shadow-[0_0_8px_#ef4444]" />
        </div>

        <TemplateButton
          icon={Box}
          color="text-sky-400"
          label="Contract"
          onClick={() => onAddShape('contract')}
        />
        <TemplateButton
          icon={Wallet}
          color="text-amber-400"
          label="Account"
          onClick={() => onAddShape('account')}
        />
        <TemplateButton
          icon={Cpu}
          color="text-emerald-400"
          label="Asset"
          onClick={() => onAddShape('asset')}
        />

        <div className="my-1 h-px w-full bg-white/10" />

        <TemplateButton
          icon={Landmark}
          color="text-slate-400"
          label="Anchor"
          onClick={() => onAddShape('anchor')}
        />
        <TemplateButton
          icon={Lock}
          color="text-rose-400"
          label="Multisig"
          onClick={() => onAddShape('multisig')}
        />
        <TemplateButton
          icon={Zap}
          color="text-violet-400"
          label="Oracle"
          onClick={() => onAddShape('oracle')}
        />
      </div>

      {/* Top Right Actions */}
      <div className="absolute top-6 right-6 z-10 flex gap-3">
        <button
          onClick={onExport}
          className="group flex items-center gap-2.5 rounded-2xl border border-white/10 bg-white/5 px-5 py-2.5 text-[11px] font-black tracking-widest text-white uppercase shadow-xl backdrop-blur-xl transition-all hover:border-white/30 hover:bg-white/10 active:scale-95"
        >
          <Download className="h-4 w-4 text-gray-400 transition-colors group-hover:text-white" />
          Export
        </button>
        <button className="flex items-center gap-2.5 rounded-2xl bg-gradient-to-br from-red-500 to-red-600 px-5 py-2.5 text-[11px] font-black tracking-widest text-white uppercase shadow-[0_15px_35px_rgba(239,68,68,0.3)] transition-all hover:from-red-400 hover:to-red-500 hover:shadow-[0_20px_45px_rgba(239,68,68,0.4)] active:scale-95">
          <Share2 className="h-4 w-4 fill-white" />
          Live Session
        </button>
      </div>
    </>
  );
};

const ToolButton = ({ icon: Icon, active = false }: { icon: any; active?: boolean }) => (
  <button
    className={cn(
      'rounded-xl p-2.5 transition-all active:scale-90',
      active
        ? 'bg-red-500 text-white shadow-[0_0_15px_#ef444455]'
        : 'text-gray-400 hover:bg-white/5 hover:text-white'
    )}
  >
    <Icon className="h-4.5 w-4.5" />
  </button>
);

const TemplateButton = ({
  icon: Icon,
  color,
  label,
  onClick,
}: {
  icon: any;
  color: string;
  label: string;
  onClick: () => void;
}) => (
  <div className="group relative flex items-center justify-center">
    <button
      onClick={onClick}
      className="rounded-[1.25rem] border border-white/5 bg-white/[0.02] p-4 transition-all group-hover:border-white/20 group-hover:shadow-2xl hover:bg-white/[0.08] active:scale-90"
    >
      <Icon className={cn('h-6 w-6', color)} />
    </button>
    <div className="pointer-events-none absolute left-full z-50 ml-5 translate-x-[-10px] rounded-xl border border-white/10 bg-gray-900 px-4 py-2 text-[10px] font-black tracking-[0.1em] whitespace-nowrap text-white uppercase opacity-0 shadow-2xl transition-all group-hover:translate-x-0 group-hover:opacity-100">
      {label}
      <div className="absolute top-1/2 -left-1 -translate-y-1/2 border-[5px] border-transparent border-r-gray-900" />
    </div>
  </div>
);
