import Link from 'next/link';
import { ArrowRight, BookOpen, Code, Users } from 'lucide-react';

export default function Home() {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center relative overflow-hidden">
      <div className="pointer-events-none absolute top-0 right-0 h-[800px] w-[800px] rounded-full bg-red-600/5 blur-[150px]"></div>
      <div className="pointer-events-none absolute bottom-0 left-0 h-[600px] w-[600px] rounded-full bg-red-600/5 blur-[120px]"></div>
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 flex flex-col items-center text-center">
        <h1 className="text-5xl md:text-7xl font-black tracking-tighter uppercase mb-6">
          Web3 Student <span className="text-red-500">Lab</span>
        </h1>
        <p className="text-xl md:text-2xl text-text-secondary max-w-3xl mb-12 font-light">
          The ultimate open-source educational platform for blockchain development. Learn smart contracts, collaborate on projects, and build the future of Web3.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 mb-20">
          <Link 
            href="/dashboard"
            className="px-8 py-4 bg-red-600 hover:bg-red-500 text-white rounded-xl font-bold uppercase tracking-widest transition-all shadow-[0_0_20px_rgba(220,38,38,0.3)] hover:shadow-[0_0_30px_rgba(220,38,38,0.5)] flex items-center justify-center gap-2"
          >
            Launch App <ArrowRight className="h-5 w-5" />
          </Link>
          <Link
            href="https://github.com/StellarDevHub/Web3-Student-Lab"
            target="_blank"
            className="px-8 py-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl font-bold uppercase tracking-widest transition-all flex items-center justify-center"
          >
            View Source
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl">
          <div className="bg-bg-secondary/50 border border-border-theme p-8 rounded-2xl backdrop-blur-sm text-left transition-all hover:-translate-y-2 hover:border-red-500/50">
            <BookOpen className="h-10 w-10 text-red-400 mb-4" />
            <h3 className="text-xl font-bold mb-2">Interactive Curriculum</h3>
            <p className="text-text-secondary">Progress from basics to advanced smart contract development with hands-on coding exercises. Earn blockchain-verifiable certificates as you complete modules.</p>
          </div>
          <div className="bg-bg-secondary/50 border border-border-theme p-8 rounded-2xl backdrop-blur-sm text-left transition-all hover:-translate-y-2 hover:border-red-500/50">
            <Code className="h-10 w-10 text-red-400 mb-4" />
            <h3 className="text-xl font-bold mb-2">In-Browser IDE</h3>
            <p className="text-text-secondary">Write, test, and deploy Rust smart contracts directly from your browser without local setup. Integrated with Soroban for seamless testing.</p>
          </div>
          <div className="bg-bg-secondary/50 border border-border-theme p-8 rounded-2xl backdrop-blur-sm text-left transition-all hover:-translate-y-2 hover:border-red-500/50">
            <Users className="h-10 w-10 text-red-400 mb-4" />
            <h3 className="text-xl font-bold mb-2">Collaborative Lab</h3>
            <p className="text-text-secondary">Work together on Hackathon projects, share components, and build your decentralized reputation via on-chain peer reviews.</p>
          </div>
        </div>

        <div className="mt-24 max-w-3xl bg-yellow-500/10 border border-yellow-500/20 p-6 rounded-2xl flex flex-col sm:flex-row items-center gap-6">
          <div className="bg-yellow-500/20 p-4 rounded-full shrink-0">
            <span className="text-3xl">🌱</span>
          </div>
          <div className="text-left">
            <h4 className="text-lg font-bold text-yellow-500 mb-1">Project Status: Grant Required</h4>
            <p className="text-yellow-200/80 text-sm">
              Web3 Student Lab is an ambitious open-source project designed to revolutionize developer onboarding to the Stellar ecosystem. We are currently seeking a grant to fully deploy our infrastructure, finalize our curriculum, and bring this platform to mainnet.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
