import CallRoom from '@/components/webrtc/CallRoom';

export default function WebRTCPage() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 px-4 py-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="space-y-2">
          <h1 className="text-4xl font-semibold">WebRTC Lab Room</h1>
          <p className="max-w-2xl text-slate-300">
            Connect directly from the lab environment using peer-to-peer audio/video and screen sharing.
          </p>
        </header>
        <CallRoom />
      </div>
    </main>
  );
}
