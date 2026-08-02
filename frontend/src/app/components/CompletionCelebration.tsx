export function launchCompletionConfetti() {
  if (typeof document === "undefined") return;

  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) return;

  canvas.style.position = "fixed";
  canvas.style.inset = "0";
  canvas.style.pointerEvents = "none";
  canvas.style.zIndex = "60";
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  document.body.appendChild(canvas);

  const colors = ["#22c55e", "#38bdf8", "#f59e0b", "#f43f5e", "#a855f7"];
  const pieces = Array.from({ length: 120 }, () => ({
    x: Math.random() * canvas.width,
    y: -20 - Math.random() * canvas.height * 0.3,
    radius: 4 + Math.random() * 6,
    color: colors[Math.floor(Math.random() * colors.length)],
    tilt: Math.random() * 10,
    speed: 2 + Math.random() * 5,
    drift: -2 + Math.random() * 4,
  }));

  let frame = 0;
  const timer = window.setInterval(() => {
    context.clearRect(0, 0, canvas.width, canvas.height);
    pieces.forEach((piece) => {
      piece.y += piece.speed;
      piece.x += piece.drift;
      piece.tilt += 0.15;
      context.beginPath();
      context.fillStyle = piece.color;
      context.ellipse(piece.x, piece.y, piece.radius, piece.radius / 2, piece.tilt, 0, Math.PI * 2);
      context.fill();
    });
    frame += 1;

    if (frame > 150) {
      window.clearInterval(timer);
      canvas.remove();
    }
  }, 16);
}

export function CompletionModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/70 px-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-3xl border border-emerald-200 bg-white p-8 text-center shadow-2xl">
        <div className="mx-auto mb-4 grid size-16 place-items-center rounded-full bg-emerald-100 text-4xl">🎉</div>
        <p className="text-sm font-bold uppercase tracking-widest text-emerald-600">Course complete</p>
        <h2 className="mt-3 text-3xl font-black text-slate-950">Congratulations!</h2>
        <p className="mt-3 text-slate-600">You completed every module requirement in Web3 Student Lab.</p>
        <button onClick={onClose} className="mt-6 rounded-full bg-slate-950 px-6 py-3 text-sm font-bold text-white transition hover:bg-slate-800">
          Continue learning
        </button>
      </div>
    </div>
  );
}
