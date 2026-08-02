import HardwareWalletConnector from '@/components/hardware-wallet/HardwareWalletConnector';

export default function HardwareWalletPage() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 px-4 py-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="space-y-3">
          <h1 className="text-4xl font-semibold">Hardware Wallet Lab</h1>
          <p className="max-w-2xl text-slate-300">
            Learn hardware wallet integration with direct Ledger support via WebHID and explicit signing workflows.
          </p>
        </header>
        <HardwareWalletConnector />
      </div>
    </main>
  );
}
