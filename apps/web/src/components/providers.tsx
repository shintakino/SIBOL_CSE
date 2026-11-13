"use client";
import { ThemeProvider } from "next-themes";
import { type ReactNode, useEffect } from "react";

export default function Providers({ children }: { children: ReactNode }) {
  useEffect(() => {
    document.documentElement.dataset.motion =
      localStorage.getItem("sibol-motion") === "reduce" ? "reduce" : "system";
  }, []);
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="light"
      enableSystem={false}
      disableTransitionOnChange
    >
      {children}
    </ThemeProvider>
  );
}
