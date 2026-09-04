"use client";

import { useState } from "react";
import { useDeliveryApi } from "@/context/ApiDeliveryContext";
import { useAuth } from "@/context/AuthContext";
import { useLocale } from "@/context/LocaleContext";

export default function WorkflowControls() {
  const { t } = useLocale();
  const { user } = useAuth();
  const {
    activeTask,
    queuedTasks,
    failedTasks,
    robot,
    advanceRobotWorkflow,
    recoverRobot,
    backendOnline
    ,emergencyStop
  } = useDeliveryApi();

  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const status = activeTask?.status;

  const action = status === "WAITING_FOR_LOADING" ? t("confirmLoaded") : status === "WAITING_FOR_UNLOADING" ? t("confirmReceived") : undefined;
  const helper = status === "WAITING_FOR_LOADING" ? t("confirmLoadedHelp") : status === "WAITING_FOR_UNLOADING" ? t("confirmReceivedHelp") : undefined;

  const navigationMessage =
    status === "GOING_TO_PICKUP"
      ? t("navigatingPickup")
      : status === "DELIVERING"
        ? t("deliveringDestination")
        : undefined;

  async function run(
    actionFn: () => Promise<void>,
    success: string
  ) {
    setBusy(true);
    setMessage("");

    try {
      await actionFn();
      setMessage(success);
    } catch (err) {
      setMessage(
        err instanceof Error
          ? err.message
          : t("actionFailed")
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-blue-600">
          {t("workflowLive")}
        </p>
        <h2 className="mt-1 font-semibold text-slate-900">
          {t("missionControl")}
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-slate-500">
          {t("workflowDescription")}
        </p>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        {action && (
          <button
            type="button"
            onClick={() =>
              void run(
                advanceRobotWorkflow,
                status === "WAITING_FOR_LOADING"
                  ? t("loadingConfirmed")
                  : t("receiptConfirmed")
              )
            }
            disabled={
              busy ||
              !backendOnline ||
              !robot.online
              || emergencyStop?.latched
            }
            className="min-h-11 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? t("processing") : action}
          </button>
        )}

        {navigationMessage && (
          <span className="rounded-xl bg-blue-50 px-4 py-3 text-sm font-medium text-blue-700">
            {navigationMessage}
          </span>
        )}

        {!robot.online && (
          <span className="rounded-xl bg-amber-50 px-4 py-3 text-sm font-medium text-amber-700">
            {t("robotOfflineWaiting")}
          </span>
        )}

        {emergencyStop?.latched && <span className="rounded-xl bg-red-100 px-4 py-3 text-sm font-bold text-red-800">{t("motionDisabled")}</span>}

        {user?.role === "ADMIN" && robot.state === "ERROR" && robot.online && (
          <button
            type="button"
            onClick={() =>
              void run(
                recoverRobot,
                t("recoveredIdle")
              )
            }
            disabled={busy || !backendOnline}
            className="min-h-11 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? t("recovering") : t("recoverRobot")}
          </button>
        )}

        {!activeTask &&
          queuedTasks.length === 0 &&
          robot.state === "IDLE" && (
            <span className="rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
              {t("robotIdleReady")}
            </span>
          )}
      </div>

      <div className="mt-4 flex flex-wrap gap-2 text-xs">
        <span className="rounded-lg bg-slate-100 px-3 py-2 text-slate-600">
          {t("queuedCount")}: {queuedTasks.length}
        </span>
        <span className="rounded-lg bg-red-50 px-3 py-2 text-red-700">
          {t("failedCount")}: {failedTasks.length}
        </span>
        <span className="rounded-lg bg-slate-100 px-3 py-2 text-slate-600">
          {t("robotLabel")}: {robot.state}
        </span>
      </div>

      {helper && (
        <p className="mt-3 text-xs leading-5 text-slate-500">
          {helper}
        </p>
      )}

      {message && (
        <p
          aria-live="polite"
          className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600"
        >
          {message}
        </p>
      )}
    </section>
  );
}
