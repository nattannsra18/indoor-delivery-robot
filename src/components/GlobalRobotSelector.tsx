"use client";

import { useDeliveryApi } from "@/context/ApiDeliveryContext";
import { useLocale } from "@/context/LocaleContext";
import { adminUiText } from "@/lib/i18n";

export default function GlobalRobotSelector() {
  const { fleet, selectedRobotId, selectRobot } = useDeliveryApi();
  const { locale } = useLocale();
  const copy = adminUiText[locale];
  const selected = fleet.find((robot) => robot.id === selectedRobotId);

  return (
    <section className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-blue-100 bg-white px-4 py-3 shadow-sm">
      <div className="min-w-0">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-blue-600">
          {copy.fleetSelectedRobot}
        </p>
        <p className="mt-0.5 truncate text-sm text-slate-500">
          {selected
            ? `${selected.activeMapId ?? copy.fleetUnknown} · ${selected.online ? copy.online : copy.offline}`
            : copy.fleetLoading}
        </p>
      </div>
      <select
        aria-label={copy.fleetSelectedRobot}
        value={selectedRobotId}
        disabled={fleet.length === 0}
        onChange={(event) => selectRobot(event.target.value)}
        className="min-h-11 min-w-[18rem] max-w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-bold text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 disabled:bg-slate-100"
      >
        {fleet.length === 0 ? <option value="">{copy.fleetEmpty}</option> : null}
        {fleet.map((robot) => (
          <option key={robot.id} value={robot.id}>
            {robot.name} · {robot.online ? copy.online : copy.offline} · {robot.activeMapId ?? copy.fleetUnknown}
          </option>
        ))}
      </select>
    </section>
  );
}
