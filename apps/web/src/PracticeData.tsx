import { useState, useSyncExternalStore } from "react";
import type {
  UsageExport,
  UsageSummary,
} from "../../../packages/shared/src/usage";
import {
  clearUsageRecords,
  retryUsageRecording,
  subscribeUsage,
  usageRecordingError,
} from "./usage-client";

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function PracticeData() {
  const recordingError = useSyncExternalStore(
    subscribeUsage,
    usageRecordingError,
  );
  const [summary, setSummary] = useState<UsageSummary | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  async function clear() {
    if (
      busy ||
      !window.confirm(
        "Clear local usage records? Your saved games stay available. Exported files and backups keep their copies until you delete those files separately.",
      )
    )
      return;
    setBusy("clear");
    setError("");
    setNotice("");
    try {
      await clearUsageRecords();
      setNotice("Usage records cleared. Saved games were preserved.");
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy("");
    }
  }
  async function refresh() {
    setError("");
    try {
      const response = await fetch("/api/v1/usage/summary");
      if (!response.ok) throw new Error("Could not load local practice data.");
      setSummary(await response.json());
    } catch (err) {
      setError((err as Error).message);
    }
  }
  async function exportData(backup: boolean) {
    if (busy) return;
    setBusy(backup ? "backup" : "export");
    setError("");
    try {
      if (backup) {
        const response = await fetch("/api/v1/usage/backup");
        if (!response.ok) throw new Error("Could not create the local backup.");
        download(await response.blob(), "poker-practice-backup.sqlite");
      } else {
        let after = 0,
          through: number | undefined,
          snapshot: UsageExport | undefined;
        const events: UsageExport["events"] = [];
        while (true) {
          const query = new URLSearchParams({
            after: String(after),
            limit: "500",
          });
          if (through !== undefined) query.set("through", String(through));
          const response = await fetch(`/api/v1/usage/export?${query}`);
          if (!response.ok)
            throw new Error("Could not export local practice records.");
          const page: UsageExport = await response.json();
          if (through !== undefined && page.through !== through)
            throw new Error("Export snapshot changed. Please retry.");
          through = page.through;
          snapshot ??= page;
          events.push(...page.events);
          if (!page.hasMore) break;
          if (page.next <= after)
            throw new Error("Export did not advance. Please retry.");
          after = page.next;
        }
        download(
          new Blob(
            [
              JSON.stringify(
                {
                  ...snapshot,
                  next: events.at(-1)?.cursor ?? 0,
                  hasMore: false,
                  events,
                },
                null,
                2,
              ),
            ],
            { type: "application/json" },
          ),
          "poker-practice-usage.json",
        );
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy("");
    }
  }
  return (
    <div className="quiet">
      {recordingError && (
        <p role="status">
          {recordingError}{" "}
          <button
            className="secondary"
            onClick={() => void retryUsageRecording()}
          >
            Retry local recording
          </button>
        </p>
      )}
      <details
        onToggle={(event) => {
          if (event.currentTarget.open) void refresh();
        }}
      >
        <summary>Local practice data</summary>
        <p>
          Saved on this device. Nothing uploaded. Decisions and shown study aids
          are retained for future practice analysis. Synthetic training examples
          are kept separate.
        </p>
        {summary && (
          <p>
            {summary.decisions} recorded decisions · {summary.viewed} decision
            views · {summary.exposures} study-aid exposures · {summary.sessions}{" "}
            sessions.
          </p>
        )}
        {summary && (
          <p>
            {summary.decisionsWithKnownExposure} decisions with a known
            study-aid exposure; {summary.decisionsWithUnknownAssistance} with
            unknown assistance.
          </p>
        )}
        <p>
          Records remain until you delete the associated game or clear local
          usage data. A usage export contains public decision records. A full
          backup includes saved games, private cards and settings; keep it
          private. Delete backup files separately when erasing data.
        </p>
        {error && <p role="alert">{error}</p>}
        {notice && <p role="status">{notice}</p>}
        <button
          className="secondary"
          disabled={!!busy}
          onClick={() => void refresh()}
        >
          Refresh data summary
        </button>{" "}
        <button
          className="secondary"
          disabled={!!busy}
          onClick={() => void exportData(false)}
        >
          {busy === "export" ? "Exporting…" : "Export usage records (JSON)"}
        </button>{" "}
        <button
          className="secondary"
          disabled={!!busy}
          onClick={() => void exportData(true)}
        >
          {busy === "backup" ? "Creating backup…" : "Download full backup"}
        </button>{" "}
        <button
          className="secondary"
          disabled={!!busy}
          onClick={() => void clear()}
        >
          {busy === "clear" ? "Clearing…" : "Clear usage records"}
        </button>
      </details>
    </div>
  );
}
