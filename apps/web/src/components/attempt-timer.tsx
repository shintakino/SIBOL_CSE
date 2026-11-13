"use client";
import { useEffect, useRef, useState } from "react";
import { client } from "@/utils/orpc";
export function AttemptTimer({
  id,
  expiresAt,
  serverNow,
  onFinalized,
  onElapsed,
}: {
  id: string;
  expiresAt: Date;
  serverNow: Date;
  onFinalized: () => void;
  onElapsed: (elapsed: boolean) => void;
}) {
  const [seconds, setSeconds] = useState<number | null>(null),
    [notice, setNotice] = useState("");
  const anchor = useRef({
    remaining: Math.max(0, expiresAt.getTime() - serverNow.getTime()),
    sample: 0,
  });
  const announced = useRef(new Set<string>());
  const [milestone, setMilestone] = useState("");
  useEffect(() => {
    let active = true,
      inFlight = false;
    anchor.current = {
      remaining: Math.max(0, expiresAt.getTime() - serverNow.getTime()),
      sample: performance.now(),
    };
    async function sync() {
      if (inFlight) return;
      inFlight = true;
      const sent = performance.now();
      try {
        const result = await client.attempts.clock({ attemptId: id });
        if (!active) return;
        if (result.status !== "in_progress") {
          onFinalized();
          return;
        }
        anchor.current = {
          remaining: Math.max(
            0,
            (result.expiresAt?.getTime() ?? 0) -
              result.serverNow.getTime() -
              (performance.now() - sent),
          ),
          sample: performance.now(),
        };
        setNotice("");
      } catch {
        if (active)
          setNotice(
            "Timer synchronization unavailable. Your original server deadline continues. Reconnect to restore the acknowledged result.",
          );
      } finally {
        inFlight = false;
      }
    }
    const interval = setInterval(() => {
      const remaining = Math.max(
        0,
        anchor.current.remaining - (performance.now() - anchor.current.sample),
      );
      const left = Math.ceil(remaining / 1000);
      setSeconds(left);
      onElapsed(left === 0);
      const key = left === 0 ? "ended" : left <= 60 ? "minute" : left <= 300 ? "five" : null;
      if (key && !announced.current.has(key)) {
        announced.current.add(key);
        setMilestone(
          key === "ended"
            ? "Time has elapsed. Confirming your saved result with the server."
            : key === "minute"
              ? "One minute or less remains."
              : "Five minutes or less remain.",
        );
      }
      if (left === 0) void sync();
    }, 1000);
    const poll = setInterval(() => void sync(), 15000);
    const visible = () => {
      if (document.visibilityState === "visible") void sync();
    };
    window.addEventListener("online", sync);
    window.addEventListener("focus", sync);
    document.addEventListener("visibilitychange", visible);
    void sync();
    return () => {
      active = false;
      clearInterval(interval);
      clearInterval(poll);
      window.removeEventListener("online", sync);
      window.removeEventListener("focus", sync);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [id, expiresAt, serverNow, onFinalized, onElapsed]);
  return (
    <aside className="mb-5 rounded-xl border bg-card p-5" aria-label="Original server deadline">
      <p className="text-sm text-muted-foreground">Time remaining · no pause</p>
      <p role="timer" aria-live="off" className="mt-1 text-2xl font-semibold tabular-nums">
        {seconds === null
          ? "Synchronizing…"
          : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`}
      </p>
      <p role="status" className="text-sm">
        {milestone}
      </p>
      {notice && (
        <p role="status" className="mt-3 text-sm text-warning">
          {notice}
        </p>
      )}
    </aside>
  );
}
