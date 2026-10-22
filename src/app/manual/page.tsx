"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import PageHeader from "@/components/PageHeader";
import LiveCamera from "@/components/LiveCamera";
import { useDeliveryApi } from "@/context/ApiDeliveryContext";
import { driveRobotManually } from "@/lib/api";

type Direction = "forward" | "backward" | "left" | "right";

function DriveButton({ direction, label, disabled, pressed, onStart, onStop }: { direction: Direction; label: string; disabled: boolean; pressed?: Direction; onStart: (direction: Direction) => void; onStop: () => void }) {
  return <button type="button" disabled={disabled} onPointerDown={() => onStart(direction)} onPointerUp={onStop} onPointerLeave={onStop} className={`grid h-16 w-16 place-items-center rounded-2xl border text-2xl font-bold ${pressed === direction ? "border-blue-600 bg-blue-600 text-white" : "border-blue-200 bg-blue-50 text-blue-700"} disabled:opacity-40`}>{label}</button>;
}

export default function ManualControlPage() {
  const { robot, selectedRobotId, activeTask, backendOnline } = useDeliveryApi();
  const [linear, setLinear] = useState(0.15);
  const [angular, setAngular] = useState(0.6);
  const [pressed, setPressed] = useState<Direction>();
  const [message, setMessage] = useState("");
  const timer = useRef<number | undefined>(undefined);
  const send = useCallback(async (direction?: Direction) => {
    const linearX = direction === "forward" ? linear : direction === "backward" ? -linear : 0;
    const angularZ = direction === "left" ? angular : direction === "right" ? -angular : 0;
    try { await driveRobotManually(linearX, angularZ, selectedRobotId || undefined); setMessage(""); }
    catch (reason) { setMessage(reason instanceof Error ? reason.message : "Unable to send drive command."); }
  }, [angular, linear, selectedRobotId]);
  const stop = useCallback(() => { window.clearInterval(timer.current); setPressed(undefined); void send(); }, [send]);
  const start = useCallback((direction: Direction) => { if (activeTask) return; setPressed(direction); void send(direction); window.clearInterval(timer.current); timer.current = window.setInterval(() => void send(direction), 100); }, [activeTask, send]);
  useEffect(() => { const down = (event: KeyboardEvent) => { if (event.repeat || event.target instanceof HTMLInputElement) return; const direction = ({ w: "forward", ArrowUp: "forward", s: "backward", ArrowDown: "backward", a: "left", ArrowLeft: "left", d: "right", ArrowRight: "right" } as Record<string, Direction>)[event.key]; if (direction) { event.preventDefault(); start(direction); } if (event.code === "Space") { event.preventDefault(); stop(); } }; window.addEventListener("keydown", down); window.addEventListener("keyup", stop); return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", stop); stop(); }; }, [start, stop]);
  const disabled = !backendOnline || !robot.online || Boolean(activeTask);
  return <><PageHeader title="Manual Control" description="Press and hold a direction. Releasing it, losing focus, or silence for 0.35 seconds stops the robot." /><div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]"><section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-bold text-slate-950">{robot.name}</h2>{activeTask ? <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">Manual control is locked while {activeTask.id} is active.</p> : <><label className="mt-5 block text-sm font-bold text-slate-700">Driving speed: {linear.toFixed(2)} m/s<input className="mt-2 w-full" type="range" min="0.08" max="0.30" step="0.01" value={linear} onChange={(event) => setLinear(Number(event.target.value))} /></label><label className="mt-4 block text-sm font-bold text-slate-700">Turning speed: {angular.toFixed(2)} rad/s<input className="mt-2 w-full" type="range" min="0.40" max="1" step="0.05" value={angular} onChange={(event) => setAngular(Number(event.target.value))} /></label><div className="mt-6 grid justify-center gap-2"><div className="flex justify-center"><DriveButton direction="forward" label="↑" disabled={disabled} pressed={pressed} onStart={start} onStop={stop} /></div><div className="flex gap-2"><DriveButton direction="left" label="↶" disabled={disabled} pressed={pressed} onStart={start} onStop={stop} /><button type="button" onClick={stop} className="h-16 w-16 rounded-2xl border border-rose-200 bg-rose-50 text-lg font-bold text-rose-700">■</button><DriveButton direction="right" label="↷" disabled={disabled} pressed={pressed} onStart={start} onStop={stop} /></div><div className="flex justify-center"><DriveButton direction="backward" label="↓" disabled={disabled} pressed={pressed} onStart={start} onStop={stop} /></div></div><p className="mt-5 text-center text-xs text-slate-500">Keyboard: WASD or arrow keys · Space to stop</p></>}{message && <p role="alert" className="mt-4 text-sm text-rose-700">{message}</p>}</section><LiveCamera key={robot.id} enabled={robot.online} robotId={robot.id} /></div></>;
}
