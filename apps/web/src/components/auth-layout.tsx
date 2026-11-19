import Link from "next/link";
import { ThemeToggle } from "./theme-toggle";
import "./reviewer/cmms.css";
export function AuthLayout({
  children,
  wide = false,
}: {
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="cmms-app auth-screen">
      <header className="top-nav">
        <div className="nav-container">
          <Link className="brand-wrapper" href="/dashboard">
            <span className="brand-badge">CSE</span>
            <div>
              <div className="brand-title">CSE Exam Prep ✨</div>
              <div className="brand-subtitle">Civil Service Examination · Review Edition</div>
            </div>
          </Link>
          <ThemeToggle />
        </div>
      </header>
      <main id="main-content" className={`auth-card ${wide ? "auth-card-wide" : ""}`}>
        <div className="auth-mark" aria-hidden="true">
          🎓
        </div>
        {children}
      </main>
      <footer className="muted text-center pb-6">
        Private, invitation-only CSE practice. Independent of the CSC.
      </footer>
    </div>
  );
}
