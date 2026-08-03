"use client";

import { useEffect, useState } from 'react';

// --- Mock Soroban Integration ---
// Replace these with your actual wallet & contract bindings
const mockContract = {
  getUserCredits: async () => 100,
  isVerified: async () => true,
  getProposals: async () => [
    { id: 1, title: "Fund Web3 Development Lab V2", votesReceived: 45, executed: false, myVotes: 0 },
    { id: 2, title: "Upgrade Certificate Smart Contract", votesReceived: 12, executed: false, myVotes: 2 },
    { id: 3, title: "Distribute 50,000 XLM to active contributors", votesReceived: 89, executed: true, myVotes: 5 },
  ],
  vote: async (id: number, votes: number) => {
    await new Promise(r => setTimeout(r, 1500));
    return true;
  }
};

interface Proposal {
  id: number;
  title: string;
  votesReceived: number;
  executed: boolean;
  myVotes: number;
}

export default function QuadraticVoting() {
  const [credits, setCredits] = useState<number>(0);
  const [isVerified, setIsVerified] = useState<boolean>(false);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Voting state per proposal ID
  const [voteInputs, setVoteInputs] = useState<Record<number, number>>({});
  const [submittingId, setSubmittingId] = useState<number | null>(null);

  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      try {
        const [userCredits, verifiedStatus, props] = await Promise.all([
          mockContract.getUserCredits(),
          mockContract.isVerified(),
          mockContract.getProposals()
        ]);
        setCredits(userCredits);
        setIsVerified(verifiedStatus);
        setProposals(props);
      } catch (err) {
        console.error("Failed to load governance data", err);
      } finally {
        setIsLoading(false);
      }
    };
    loadData();
  }, []);

  const calculateCost = (currentVotes: number, newVotes: number) => {
    const totalTarget = currentVotes + newVotes;
    return Math.pow(totalTarget, 2) - Math.pow(currentVotes, 2);
  };

  const handleVoteChange = (id: number, value: number) => {
    if (value < 0) return;
    setVoteInputs(prev => ({ ...prev, [id]: value }));
  };

  const handleVoteSubmit = async (proposal: Proposal) => {
    const additionalVotes = voteInputs[proposal.id] || 0;
    if (additionalVotes <= 0) return;

    const cost = calculateCost(proposal.myVotes, additionalVotes);
    if (credits < cost) return;

    setSubmittingId(proposal.id);
    try {
      await mockContract.vote(proposal.id, additionalVotes);

      // Optimistic Update
      setCredits(prev => prev - cost);
      setProposals(prev => prev.map(p =>
        p.id === proposal.id
          ? { ...p, myVotes: p.myVotes + additionalVotes, votesReceived: p.votesReceived + additionalVotes }
          : p
      ));
      setVoteInputs(prev => ({ ...prev, [proposal.id]: 0 }));

    } catch (err) {
      console.error("Voting failed", err);
    } finally {
      setSubmittingId(null);
    }
  };

  if (isLoading) {
    return <div className="p-8 text-center text-gray-400 animate-pulse">Loading Governance Data...</div>;
  }

  return (
    <div className="max-w-4xl mx-auto p-6 bg-gray-900 min-h-screen text-white rounded-xl shadow-2xl border border-gray-800">

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-500">
            Quadratic Governance
          </h1>
          <p className="text-gray-400 mt-2 text-sm">
            Vote power = √Credits. Broad consensus is rewarded over individual wealth.
          </p>
        </div>

        <div className="flex items-center gap-4 bg-gray-800 p-4 rounded-lg border border-gray-700 w-full md:w-auto">
          <div className="flex-1">
            <p className="text-xs text-gray-400 uppercase tracking-wider">Your Credits</p>
            <p className="text-2xl font-mono font-bold text-green-400">{credits}</p>
          </div>
          <div className="h-10 w-px bg-gray-700"></div>
          <div className="flex-1">
            <p className="text-xs text-gray-400 uppercase tracking-wider">Sybil Status</p>
            {isVerified ? (
              <span className="inline-flex items-center gap-1 text-sm text-blue-400 font-medium">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"></path></svg>
                Verified
              </span>
            ) : (
              <span className="text-sm text-red-400 font-medium">Unverified</span>
            )}
          </div>
        </div>
      </div>

      {!isVerified && (
        <div className="bg-red-900/30 border border-red-500/50 p-4 rounded-lg mb-8 text-red-200 text-sm">
          <strong>Attention:</strong> You must verify your human identity (Sybil Resistance) before participating in governance.
        </div>
      )}

      <div className="space-y-6">
        {proposals.map(proposal => {
          const inputVotes = voteInputs[proposal.id] || 0;
          const incrementalCost = calculateCost(proposal.myVotes, inputVotes);
          const isAffordable = credits >= incrementalCost;
          const isSubmitting = submittingId === proposal.id;

          return (
            <div key={proposal.id} className="bg-gray-800 rounded-lg p-5 border border-gray-700 transition hover:border-gray-600">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-mono text-gray-500">#{proposal.id}</span>
                    {proposal.executed && (
                      <span className="px-2 py-0.5 text-[10px] uppercase tracking-wider bg-purple-500/20 text-purple-300 rounded border border-purple-500/30">
                        Executed
                      </span>
                    )}
                  </div>
                  <h3 className="text-lg font-semibold text-gray-100">{proposal.title}</h3>
                </div>
                <div className="text-right">
                  <p className="text-sm text-gray-400">Total Votes</p>
                  <p className="text-xl font-bold font-mono">{proposal.votesReceived}</p>
                </div>
              </div>

              <div className="bg-gray-900/50 rounded p-4 flex flex-col md:flex-row gap-6 items-center border border-gray-800">
                <div className="flex-1 w-full">
                  <p className="text-sm text-gray-400 mb-2">You previously cast: <span className="text-white font-mono">{proposal.myVotes} votes</span></p>
                  <label className="text-xs text-gray-500 uppercase block mb-1">Cast Additional Votes</label>
                  <input
                    type="number"
                    min="0"
                    disabled={proposal.executed || !isVerified || isSubmitting}
                    value={inputVotes}
                    onChange={(e) => handleVoteChange(proposal.id, parseInt(e.target.value) || 0)}
                    className="w-full bg-gray-950 border border-gray-700 rounded p-2 text-white focus:ring-2 focus:ring-blue-500 outline-none disabled:opacity-50"
                  />
                </div>

                <div className="flex-1 w-full flex items-center justify-between bg-gray-950 p-3 rounded border border-gray-800">
                  <div>
                    <p className="text-xs text-gray-500 uppercase">Cost Calculation</p>
                    <p className="text-sm text-gray-300 font-mono mt-1">
                      ({proposal.myVotes} + <span className="text-blue-400">{inputVotes}</span>)² - ({proposal.myVotes})²
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-500 uppercase">Credits Required</p>
                    <p className={`text-lg font-mono font-bold ${isAffordable ? 'text-yellow-400' : 'text-red-400'}`}>
                      {incrementalCost}
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => handleVoteSubmit(proposal)}
                  disabled={proposal.executed || !isVerified || inputVotes <= 0 || !isAffordable || isSubmitting}
                  className="w-full md:w-auto px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded font-medium transition disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed whitespace-nowrap"
                >
                  {isSubmitting ? 'Casting...' : 'Cast Votes'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
