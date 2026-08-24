"use client";

import PageHeader from "@/components/PageHeader";
import WorkflowControls from "@/components/WorkflowControls";
import { useMockDelivery } from "@/context/MockDeliveryContext";

export default function RobotStatusPage() {
  const { robot, activeTask } = useMockDelivery();

  return (
    <>
      <PageHeader title="Robot Status" description="Shared mock telemetry and workflow state for the SCUTTLE robot." />

      <div className="grid gap-6 xl:grid-cols-[1fr_0.9fr]">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm text-slate-500">Robot ID</p>
              <h2 className="text-xl font-bold text-slate-900">{robot.name}</h2>
            </div>
            <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-emerald-700">● ONLINE</span>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <Info label="State" value={robot.state.replaceAll("_", " ")} />
            <Info label="Battery" value={`${robot.battery}%`} />
            <Info label="Position X" value={`${robot.x.toFixed(2)} m`} />
            <Info label="Position Y" value={`${robot.y.toFixed(2)} m`} />
            <Info label="Yaw" value={`${robot.yaw.toFixed(2)} rad`} />
            <Info label="Active Task" value={activeTask?.id ?? "None"} />
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
          <h2 className="font-semibold text-slate-900">Subsystem Health</h2>
          <div className="mt-5 space-y-3">
            <Health name="ROS2" state="Mock Connected" />
            <Health name="LiDAR" state="Healthy" />
            <Health name="IMU" state="Healthy" />
            <Health name="Wheel Encoders" state="Healthy" />
            <Health name="ESP32" state="Mock Connected" />
            <Health name="Wi-Fi / MQTT" state="Not connected yet" warning />
          </div>
        </section>
      </div>

      <div className="mt-6">
        <WorkflowControls />
      </div>

      <section className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5">
        <h2 className="font-semibold text-amber-900">Physical CONFIRM button simulation</h2>
        <p className="mt-1 text-sm leading-6 text-amber-800">
          When the state is WAITING_FOR_LOADING or WAITING_FOR_UNLOADING, the workflow button above represents a person pressing the physical CONFIRM button connected to ESP32. In Phase 6, that event will come from the real robot instead of this web button.
        </p>
      </section>
    </>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function Health({ name, state, warning = false }: { name: string; state: string; warning?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 p-3">
      <span className="text-sm font-medium text-slate-700">{name}</span>
      <span className={`text-xs font-semibold ${warning ? "text-amber-700" : "text-emerald-700"}`}>● {state}</span>
    </div>
  );
}
