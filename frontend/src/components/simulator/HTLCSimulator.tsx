import React, { useState } from 'react';

type Step = 'INIT' | 'ALICE_DEPLOY_STELLAR' | 'BOB_DEPLOY_ETH' | 'ALICE_REDEEM_ETH' | 'BOB_REDEEM_STELLAR' | 'REFUND_TIMEOUT';

export const HTLCSimulator: React.FC = () => {
  const [step, setStep] = useState<Step>('INIT');
  const [secret, setSecret] = useState<string>('');
  const [hash, setHash] = useState<string>('');

  const generateSecret = () => {
    const s = 'secret_' + Math.random().toString(36).substring(2, 8);
    const h = 'hash_' + btoa(s).substring(0, 8); // mock hash
    setSecret(s);
    setHash(h);
    setStep('ALICE_DEPLOY_STELLAR');
  };

  const explainText = {
    INIT: "Welcome to the HTLC Atomic Swap demo. This simulates Alice exchanging Stellar XLM for Bob's Ethereum ETH without a centralized exchange. First, Alice generates a random secret and its cryptographic hash.",
    ALICE_DEPLOY_STELLAR: "Alice deploys an HTLC on Stellar, locking her XLM. The contract requires the pre-image (secret) to unlock the funds. Bob can see the hash, but not the secret.",
    BOB_DEPLOY_ETH: "Bob verifies Alice's Stellar contract contains the agreed XLM and hash. He then deploys a matching HTLC on Ethereum, locking his ETH with the EXACT same hash.",
    ALICE_REDEEM_ETH: "Alice sees Bob's Ethereum contract. She uses her original secret to unlock Bob's ETH. By doing so, the secret is revealed on the Ethereum blockchain.",
    BOB_REDEEM_STELLAR: "Bob observes the secret revealed on Ethereum. He uses that same secret to unlock Alice's XLM on Stellar. The swap is complete! Both parties have their desired assets.",
    REFUND_TIMEOUT: "If either party stops responding before the swap completes, a timelock expires. The funds are safely refunded to their original owners, ensuring no one loses their assets."
  };

  return (
    <div className="p-6 max-w-5xl mx-auto font-sans bg-gray-50 rounded-xl shadow-lg border border-gray-100">
      <h2 className="text-3xl font-bold mb-4 text-gray-800">Cross-Chain Atomic Swap & HTLC Demo</h2>
      
      <div className="bg-blue-50 border-l-4 border-blue-500 p-4 mb-6">
        <p className="text-blue-700">{explainText[step]}</p>
        <p className="mt-2 text-sm text-blue-600 font-semibold">Trustless Guarantee: No centralized escrow intermediaries are used. Math and cryptography secure the swap.</p>
      </div>

      <div className="grid grid-cols-3 gap-6 mb-8 text-center">
        <div className="bg-white p-4 rounded-lg shadow border border-gray-200">
          <h3 className="font-bold text-lg mb-2">Alice (XLM to ETH)</h3>
          <div className="text-sm text-gray-500 mb-2">Secret: {secret ? <span className="font-mono bg-gray-100 px-1">{secret}</span> : '?'}</div>
        </div>
        <div className="flex flex-col justify-center items-center">
          <div className="text-sm text-gray-500 mb-2">Shared Hash</div>
          <div className="font-mono bg-yellow-100 px-2 py-1 rounded border border-yellow-300">
            {hash || 'Pending...'}
          </div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow border border-gray-200">
          <h3 className="font-bold text-lg mb-2">Bob (ETH to XLM)</h3>
          <div className="text-sm text-gray-500 mb-2">Secret: {step === 'BOB_REDEEM_STELLAR' ? <span className="font-mono bg-gray-100 px-1">{secret}</span> : '?'}</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-8 mb-8">
        <div className={\`p-4 rounded-lg border-2 \${['ALICE_DEPLOY_STELLAR', 'BOB_DEPLOY_ETH', 'ALICE_REDEEM_ETH', 'BOB_REDEEM_STELLAR'].includes(step) ? 'border-green-400 bg-green-50' : 'border-gray-200 bg-white'}\`}>
          <h4 className="font-bold text-lg mb-2 text-green-700">Stellar Network (XLM)</h4>
          <p className="text-sm">Contract: {['ALICE_DEPLOY_STELLAR', 'BOB_DEPLOY_ETH', 'ALICE_REDEEM_ETH'].includes(step) ? 'Locked with Hash' : step === 'BOB_REDEEM_STELLAR' ? 'Unlocked by Bob' : step === 'REFUND_TIMEOUT' ? 'Refunded to Alice' : 'Empty'}</p>
        </div>
        <div className={\`p-4 rounded-lg border-2 \${['BOB_DEPLOY_ETH', 'ALICE_REDEEM_ETH', 'BOB_REDEEM_STELLAR'].includes(step) ? 'border-purple-400 bg-purple-50' : 'border-gray-200 bg-white'}\`}>
          <h4 className="font-bold text-lg mb-2 text-purple-700">Ethereum Network (ETH)</h4>
          <p className="text-sm">Contract: {step === 'BOB_DEPLOY_ETH' ? 'Locked with Hash' : ['ALICE_REDEEM_ETH', 'BOB_REDEEM_STELLAR'].includes(step) ? 'Unlocked by Alice' : step === 'REFUND_TIMEOUT' ? 'Refunded to Bob' : 'Empty'}</p>
        </div>
      </div>

      <div className="flex flex-wrap justify-center gap-4">
        {step === 'INIT' && <button onClick={generateSecret} className="bg-blue-600 text-white px-6 py-2 rounded shadow hover:bg-blue-700">1. Generate Secret & Hash</button>}
        {step === 'ALICE_DEPLOY_STELLAR' && <button onClick={() => setStep('BOB_DEPLOY_ETH')} className="bg-indigo-600 text-white px-6 py-2 rounded shadow hover:bg-indigo-700">2. Bob Deploys on ETH</button>}
        {step === 'BOB_DEPLOY_ETH' && <button onClick={() => setStep('ALICE_REDEEM_ETH')} className="bg-indigo-600 text-white px-6 py-2 rounded shadow hover:bg-indigo-700">3. Alice Redeems ETH</button>}
        {step === 'ALICE_REDEEM_ETH' && <button onClick={() => setStep('BOB_REDEEM_STELLAR')} className="bg-green-600 text-white px-6 py-2 rounded shadow hover:bg-green-700">4. Bob Redeems XLM (Complete!)</button>}
        
        {step !== 'INIT' && step !== 'BOB_REDEEM_STELLAR' && step !== 'REFUND_TIMEOUT' && (
          <button onClick={() => setStep('REFUND_TIMEOUT')} className="bg-red-500 text-white px-6 py-2 rounded shadow hover:bg-red-600">Simulate Timeout</button>
        )}
        
        {(step === 'BOB_REDEEM_STELLAR' || step === 'REFUND_TIMEOUT') && (
          <button onClick={() => {setStep('INIT'); setSecret(''); setHash('');}} className="bg-gray-600 text-white px-6 py-2 rounded shadow hover:bg-gray-700">Reset Demo</button>
        )}
      </div>
    </div>
  );
};

export default HTLCSimulator;
