export default function RobotMapMock() {
  return (
    <div className="relative min-h-[310px] overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
      <div className="absolute inset-0 opacity-70" style={{ backgroundImage: "linear-gradient(#dbe2ea 1px, transparent 1px), linear-gradient(90deg, #dbe2ea 1px, transparent 1px)", backgroundSize: "28px 28px" }} />
      <div className="absolute left-[10%] top-[17%] h-[61%] w-[14%] rounded border-[10px] border-slate-400 bg-white/80" />
      <div className="absolute left-[24%] top-[17%] h-[15%] w-[38%] rounded border-[10px] border-slate-400 bg-white/80" />
      <div className="absolute left-[50%] top-[32%] h-[46%] w-[12%] rounded border-[10px] border-slate-400 bg-white/80" />
      <div className="absolute left-[62%] top-[17%] h-[61%] w-[25%] rounded border-[10px] border-slate-400 bg-white/80" />
      <div className="absolute left-[30%] top-[40%] h-2 w-[38%] rotate-6 rounded-full bg-blue-400/70" />
      <MapPoint label="A" className="left-[27%] top-[37%]" />
      <MapPoint label="C" className="left-[69%] top-[45%]" />
      <div className="absolute left-[51%] top-[39%] -translate-x-1/2 -translate-y-1/2">
        <div className="grid h-12 w-12 place-items-center rounded-full border-4 border-white bg-blue-600 text-lg font-bold text-white shadow-lg">R</div>
        <div className="mt-2 rounded bg-slate-950 px-2 py-1 text-center text-[10px] font-semibold text-white shadow">SCUTTLE-01</div>
      </div>
      <div className="absolute bottom-3 left-3 rounded-lg bg-white/90 px-3 py-2 text-xs text-slate-500 shadow-sm backdrop-blur">Mock occupancy map</div>
    </div>
  );
}

function MapPoint({ label, className }: { label: string; className: string }) {
  return <div className={`absolute ${className}`}><div className="grid h-8 w-8 place-items-center rounded-full border-4 border-white bg-emerald-500 text-xs font-bold text-white shadow">{label}</div></div>;
}
