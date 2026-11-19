"use client";
import { Button } from "@sibol-cse/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@sibol-cse/ui/components/dialog";
import { Input } from "@sibol-cse/ui/components/input";
import { Label } from "@sibol-cse/ui/components/label";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { adminNavigation } from "@/lib/navigation";
import { client } from "@/utils/orpc";
import { AppearanceProvider } from "../appearance-provider";
import { errorMessage, useData } from "../learning-ui";
import { ThemeToggle } from "../theme-toggle";
import "./cmms.css";

type Summary = Awaited<ReturnType<typeof client.reviewer.summary>>;
type Start = Omit<Parameters<typeof client.reviewer.start>[0], "requestId" | "area" | "topicId"> & {
  area?: Parameters<typeof client.reviewer.start>[0]["area"];
  topicId?: string;
};
type ContextValue = {
  name: string;
  data: Summary | null;
  error: string;
  busy: boolean;
  reload: () => Promise<void>;
  start: (input: Start) => Promise<void>;
  mock: (count: 25 | 50 | 75) => Promise<void>;
  sound: (correct: boolean) => void;
};
const Context = createContext<ContextValue | null>(null);
export function useReviewer() {
  const value = useContext(Context);
  if (!value) throw new Error("Reviewer shell is required");
  return value;
}
export const tabs = [
  { href: "/dashboard", label: "Dashboard", icon: "🏠" },
  { href: "/mock-exams", label: "Mock Simulation", icon: "⏱️" },
  { href: "/practice", label: "Topic Drills", icon: "📂" },
  { href: "/flashcards", label: "Flashcards", icon: "🗂️" },
  { href: "/cheatsheet", label: "Study Cheatsheet", icon: "📖" },
  { href: "/progress", label: "Analytics & History", icon: "📊" },
] as const;
export function ReviewerShell({
  children,
  name,
  admin,
}: {
  children: React.ReactNode;
  name: string;
  admin: boolean;
}) {
  return (
    <AppearanceProvider>
      <Shell name={name} admin={admin}>
        {children}
      </Shell>
    </AppearanceProvider>
  );
}
function Shell({
  children,
  name,
  admin,
}: {
  children: React.ReactNode;
  name: string;
  admin: boolean;
}) {
  const path = usePathname(),
    router = useRouter();
  const load = useCallback(() => client.reviewer.summary(), []),
    state = useData(load);
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [soundEnabled, setSoundEnabled] = useState(false);
  const busyRef = useRef(false),
    requests = useRef(new Map<string, string>()),
    audio = useRef<AudioContext | null>(null),
    initialPath = useRef(path),
    selectedTab = useRef<string>(tabs.find((tab) => tab.href === path)?.href ?? "/dashboard");
  useEffect(() => {
    if (tabs.some((tab) => tab.href === path)) selectedTab.current = path;
    if (initialPath.current !== path) {
      initialPath.current = path;
      void state.reload();
    }
  }, [path, state.reload]);
  useEffect(() => {
    setSoundEnabled(localStorage.getItem("cse-sound") === "on");
    return () => {
      void audio.current?.close();
    };
  }, []);
  async function launch(key: string, run: (requestId: string) => Promise<{ id: string }>) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    const requestId = requests.current.get(key) ?? crypto.randomUUID();
    requests.current.set(key, requestId);
    try {
      const result = await run(requestId);
      requests.current.delete(key);
      router.push(`/attempts/${result.id}`);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  const start = (input: Start) => {
    const values = { area: "all" as const, topicId: "mixed", ...input };
    return launch(JSON.stringify(values), (requestId) =>
      client.reviewer.start({ ...values, requestId }),
    );
  };
  const mock = (count: 25 | 50 | 75) =>
    launch(`mock:${count}`, (requestId) =>
      client.mocks.start({ requestId, count, kind: "short", mode: "strict_mock", multiplier: 100 }),
    );
  function sound(correct: boolean) {
    if (!soundEnabled || !audio.current) return;
    const ctx = audio.current,
      oscillator = ctx.createOscillator(),
      gain = ctx.createGain();
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.frequency.value = correct ? 660 : 220;
    gain.gain.setValueAtTime(0.045, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
    oscillator.start();
    oscillator.stop(ctx.currentTime + 0.16);
  }
  async function exportData() {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      await client.account.export();
      const response = await fetch("/api/account/export", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      if (!response.ok) throw new Error("Finish any active exam and retry the export.");
      const text = await response.text();
      JSON.parse(text);
      const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = "cse-study-progress.json";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  const inPlayer = /^\/attempts\/[^/]+(?:\/results)?$/.test(path);
  return (
    <Context.Provider
      value={{
        name,
        data: state.data,
        error: error || state.error,
        busy,
        reload: state.reload,
        start,
        mock,
        sound,
      }}
    >
      <div className="cmms-app">
        <header className="top-nav">
          <div className="nav-container">
            <Link href="/dashboard" className="brand-wrapper" aria-label="CSE reviewer home">
              <span className="brand-badge">CSE</span>
              <div>
                <div className="brand-title">
                  CSE Exam Prep <span aria-hidden="true">✨</span>
                </div>
                <div className="brand-subtitle">Civil Service Examination · Review Edition</div>
              </div>
            </Link>
            <div className="nav-actions">
              <div
                className={`db-status-chip ${state.error ? "disconnected" : state.data ? "connected" : ""}`}
                role="status"
              >
                <span className="db-status-dot" />
                <span>
                  {state.error ? "Connection lost" : state.data ? "Database online" : "Connecting…"}
                </span>
              </div>
              <div className="kate-streak-chip">
                <span aria-hidden="true">🔥</span>
                <span>Streak: {state.data?.streak ?? 0}d</span>
              </div>
              <Account name={name} admin={admin} />
              <Button
                className="btn-icon"
                variant="ghost"
                aria-label={soundEnabled ? "Mute quiz sounds" : "Enable quiz sounds"}
                aria-pressed={soundEnabled}
                onClick={() => {
                  const next = !soundEnabled;
                  setSoundEnabled(next);
                  localStorage.setItem("cse-sound", next ? "on" : "off");
                  if (next) {
                    audio.current ??= new AudioContext();
                    void audio.current.resume();
                  }
                }}
              >
                {soundEnabled ? "🔔" : "🔕"}
              </Button>
              <ThemeToggle />
              <Button
                className="btn-icon"
                variant="ghost"
                aria-label="Export study progress"
                disabled={busy}
                onClick={exportData}
              >
                💾
              </Button>
            </div>
          </div>
        </header>
        <section className="kate-banner" aria-label="Your study companion">
          <div className="kate-banner-container">
            <div className="kate-banner-left">
              <div className="kate-avatar" aria-hidden="true">
                👩‍💼
              </div>
              <div>
                <div className="kate-greeting">Let’s Get CSE Ready, {name.split(" ")[0]}! 🎓</div>
                <div className="kate-quote">
                  “Mastering CSE concepts one randomized question at a time.”
                </div>
              </div>
            </div>
            <div className="kate-readiness-badge">
              <div className="kate-readiness-val">
                {state.data?.averageScore == null ? "—" : `${state.data.averageScore}%`}
              </div>
              <div className="kate-readiness-lbl">Practice Average</div>
            </div>
          </div>
        </section>
        <main id="main-content" className="main-wrapper">
          <nav className="tab-navigation" aria-label="Main navigation">
            {tabs.map((tab) => (
              <Link
                className={`tab-btn ${path === tab.href || (inPlayer && selectedTab.current === tab.href) ? "active" : ""}`}
                aria-current={
                  path === tab.href || (inPlayer && selectedTab.current === tab.href)
                    ? "page"
                    : undefined
                }
                href={tab.href}
                key={tab.href}
              >
                <span aria-hidden="true">{tab.icon}</span>
                {tab.label}
              </Link>
            ))}
          </nav>
          {(error || state.error) && (
            <div role="alert" className="status-message error-message">
              {error || state.error}
              {state.error && (
                <Button className="btn btn-outline" onClick={() => void state.reload()}>
                  Reconnect
                </Button>
              )}
            </div>
          )}
          {!inPlayer && state.data?.active && (
            <p className="status-message">
              <Link className="inline-link" href={`/attempts/${state.data.active.id}`}>
                Resume your unfinished{" "}
                {state.data.active.mode === "strict_mock" ? "mock exam" : "quiz"} →
              </Link>
            </p>
          )}
          {children}
        </main>
      </div>
    </Context.Provider>
  );
}
function Account({ name, admin }: { name: string; admin: boolean }) {
  const [open, setOpen] = useState(false),
    [profile, setProfile] = useState<Awaited<ReturnType<typeof client.profile.get>> | null>(null),
    [level, setLevel] = useState("professional"),
    [error, setError] = useState(""),
    [pending, setPending] = useState(false),
    [password, setPassword] = useState(""),
    [confirmation, setConfirmation] = useState("");
  const router = useRouter();
  useEffect(() => {
    if (open) {
      setError("");
      client.profile
        .get()
        .then((p) => {
          setProfile(p);
          setLevel(p.preferences?.level ?? "professional");
        })
        .catch((e) => setError(errorMessage(e)));
    } else {
      setPassword("");
      setConfirmation("");
    }
  }, [open]);
  async function saveTrack() {
    if (!profile) return;
    setPending(true);
    setError("");
    const p = profile.preferences;
    try {
      await client.profile.update({
        level: level as "professional" | "subprofessional",
        days: p?.days ?? [1, 3, 5],
        dailyMinutes: p?.dailyMinutes ?? 25,
        targetDate: p?.targetDate ?? null,
        language: profile.language,
        revision: p?.revision ?? 0,
      });
      setOpen(false);
      window.location.assign("/dashboard");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setPending(false);
    }
  }
  async function remove() {
    setPending(true);
    setError("");
    try {
      const receipt = await client.account.requestDeletion({
        password,
        confirmation: confirmation as "DELETE",
      });
      await authClient.signOut();
      window.location.replace(`/account-deleted?receipt=${encodeURIComponent(receipt.receiptId)}`);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setPending(false);
    }
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={<Button variant="ghost" className="account-chip" aria-label="Account settings" />}
      >
        {name.split(" ")[0]}
      </DialogTrigger>
      <DialogContent className="max-h-[90svh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Your account</DialogTitle>
          <DialogDescription>
            {profile?.email ?? "Manage your CSE track and sign-in."}
          </DialogDescription>
        </DialogHeader>
        <Label htmlFor="cse-track">Exam track</Label>
        <select
          id="cse-track"
          className="min-h-11 rounded-md border bg-background p-3"
          value={level}
          onChange={(e) => setLevel(e.target.value)}
        >
          <option value="professional">Professional</option>
          <option value="subprofessional">Subprofessional</option>
        </select>
        <Button disabled={!profile || pending} onClick={saveTrack}>
          Save track
        </Button>
        {admin && (
          <div className="flex flex-wrap gap-4 border-t pt-4">
            {adminNavigation.map((item) => (
              <Link key={item.href} href={item.href} onClick={() => setOpen(false)}>
                {item.label}
              </Link>
            ))}
          </div>
        )}
        <Button
          variant="outline"
          disabled={pending}
          onClick={async () => {
            setPending(true);
            setError("");
            try {
              const result = await authClient.signOut();
              if (result.error) throw new Error("Sign out failed. Please retry.");
              router.replace("/sign-in");
              router.refresh();
            } catch (e) {
              setError(errorMessage(e));
              setPending(false);
            }
          }}
        >
          Sign out
        </Button>
        <details>
          <summary className="cursor-pointer py-3">Delete account</summary>
          <p className="mb-4 text-sm text-muted-foreground">
            Permanently deletes your live account and study records. Backups expire within 30 days.
            Published content and pseudonymized audit references remain.
          </p>
          <Label htmlFor="cse-delete-password">Current password</Label>
          <Input
            id="cse-delete-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <Label htmlFor="cse-delete-confirmation">Type DELETE to confirm</Label>
          <Input
            id="cse-delete-confirmation"
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
          />
          <Button
            variant="destructive"
            disabled={pending || confirmation !== "DELETE" || !password}
            onClick={remove}
          >
            Permanently delete my account
          </Button>
        </details>
        {error && (
          <p role="alert" className="text-destructive">
            {error}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
