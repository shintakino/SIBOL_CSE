"use client";
import { useTheme } from "next-themes";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { client } from "@/utils/orpc";
import { errorMessage } from "./learning-ui";

type Appearance = Awaited<ReturnType<typeof client.account.settings>>;
type Patch = Partial<Pick<Appearance, "theme" | "motion" | "inAppReminders" | "futureEmailOptIn">>;
type AppearanceContext = {
  settings: Appearance | null;
  pending: boolean;
  error: string;
  update: (patch: Patch) => Promise<void>;
  reload: () => Promise<void>;
};
const Context = createContext<AppearanceContext | null>(null);
export const useAppearance = () => useContext(Context);
export function AppearanceProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<Appearance | null>(null),
    [pending, setPending] = useState(false),
    [error, setError] = useState("");
  const { setTheme } = useTheme();
  const apply = useCallback(
    (row: Appearance) => {
      setTheme(row.theme);
      document.documentElement.dataset.motion = row.motion;
      localStorage.setItem("sibol-motion", row.motion);
    },
    [setTheme],
  );
  const reload = useCallback(async () => {
    setError("");
    try {
      const row = await client.account.settings();
      setSettings(row);
      apply(row);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [apply]);
  useEffect(() => {
    void reload();
  }, [reload]);
  async function update(patch: Patch) {
    if (!settings) throw new Error("Wait for your appearance settings to load.");
    setPending(true);
    setError("");
    try {
      const row = await client.account.updateSettings({
        theme: settings.theme,
        motion: settings.motion,
        inAppReminders: settings.inAppReminders,
        futureEmailOptIn: settings.futureEmailOptIn,
        revision: settings.revision,
        ...patch,
      });
      const next = { ...settings, ...row };
      setSettings(next);
      apply(next);
    } catch (e) {
      setError(errorMessage(e));
      throw e;
    } finally {
      setPending(false);
    }
  }
  return (
    <Context.Provider value={{ settings, pending, error, update, reload }}>
      {children}
    </Context.Provider>
  );
}
