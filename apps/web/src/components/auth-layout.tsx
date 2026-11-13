import { Brand } from "./brand";
import { ThemeToggle } from "./theme-toggle";

export function AuthLayout({
  children,
  wide = false,
}: {
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="auth-layout">
      <header className="auth-header">
        <Brand />
        <ThemeToggle />
      </header>
      <main id="main-content" className={`auth-content ${wide ? "wide" : ""}`}>
        {children}
      </main>
      <footer className="text-center text-sm text-muted-foreground">
        A private space to grow, one study session at a time.
      </footer>
    </div>
  );
}
