import React from 'react';
import { Box, Cpu, Wallet, Download, Share2, Layers, MousePointer2, Pencil, Eraser, Redo2, Undo2, Landmark, Lock, Zap } from 'lucide-react';
import { cn } from '../../lib/utils';

interface ToolbarProps {
  onAddShape: (type: string) => void;
  onExport: () => void;
}

export const Toolbar: React.FC<ToolbarProps> = ({ onAddShape, onExport }) => {
  return (
    <>
      {/* Top Center Main Tools */}
      <div className="absolute top-6 left-1/2 -translate-x-1/2 z-10 flex items-center bg-gray-950/60 backdrop-blur-3xl border border-white/10 p-1.5 rounded-2xl shadow-[0_25px_50px_-12px_rgba(0,0,0,0.5)] transition-all hover:border-white/20">
        <div className="flex items-center gap-1">
          <ToolButton icon={MousePointer2} active />
          <ToolButton icon={Pencil} />
          <ToolButton icon={Eraser} />
          <div className="w-px h-5 bg-white/10 mx-1" />
          <ToolButton icon={Undo2} />
          <ToolButton icon={Redo2} />
        </div>
      </div>

      {/* Left Vertical Template Panel */}
      <div className="absolute top-1/2 -translate-y-1/2 left-6 z-10 flex flex-col gap-4 bg-gray-950/60 backdrop-blur-3xl border border-white/10 p-4 rounded-[2.5rem] shadow-[0_25px_50px_-12px_rgba(0,0,0,0.5)]">
        <div className="flex flex-col items-center gap-1 mb-2">
            <Layers className="w-4 h-4 text-gray-500" />
            <div className="h-0.5 w-4 bg-red-500 rounded-full shadow-[0_0_8px_#ef4444]" />
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
        
        <div className="h-px w-full bg-white/10 my-1" />

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
          className="group flex items-center gap-2.5 bg-white/5 hover:bg-white/10 backdrop-blur-xl border border-white/10 px-5 py-2.5 rounded-2xl text-[11px] font-black uppercase tracking-widest text-white transition-all active:scale-95 shadow-xl hover:border-white/30"
        >
          <Download className="w-4 h-4 text-gray-400 group-hover:text-white transition-colors" />
          Export
        </button>
        <button className="flex items-center gap-2.5 bg-gradient-to-br from-red-500 to-red-600 hover:from-red-400 hover:to-red-500 px-5 py-2.5 rounded-2xl text-[11px] font-black uppercase tracking-widest text-white transition-all shadow-[0_15px_35px_rgba(239,68,68,0.3)] active:scale-95 hover:shadow-[0_20px_45px_rgba(239,68,68,0.4)]">
          <Share2 className="w-4 h-4 fill-white" />
          Live Session
        </button>
      </div>
    </>
  );
};

const ToolButton = ({ icon: Icon, active = false }: { icon: any, active?: boolean }) => (
  <button className={cn(
    "p-2.5 rounded-xl transition-all active:scale-90",
    active ? "bg-red-500 text-white shadow-[0_0_15px_#ef444455]" : "text-gray-400 hover:text-white hover:bg-white/5"
  )}>
    <Icon className="w-4.5 h-4.5" />
  </button>
);

const TemplateButton = ({ icon: Icon, color, label, onClick }: { icon: any, color: string, label: string, onClick: () => void }) => (
  <div className="group relative flex items-center justify-center">
    <button 
      onClick={onClick}
      className="p-4 bg-white/[0.02] hover:bg-white/[0.08] border border-white/5 rounded-[1.25rem] transition-all active:scale-90 group-hover:border-white/20 group-hover:shadow-2xl"
    >
      <Icon className={cn("w-6 h-6", color)} />
    </button>
    <div className="absolute left-full ml-5 px-4 py-2 bg-gray-900 border border-white/10 rounded-xl text-[10px] font-black uppercase tracking-[0.1em] text-white opacity-0 group-hover:opacity-100 transition-all translate-x-[-10px] group-hover:translate-x-0 pointer-events-none shadow-2xl z-50 whitespace-nowrap">
        {label}
        <div className="absolute top-1/2 -left-1 -translate-y-1/2 border-[5px] border-transparent border-r-gray-900" />
    </div>
  </div>
);
