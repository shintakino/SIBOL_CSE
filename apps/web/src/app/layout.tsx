import { GeistSans } from "geist/font/sans";
import type { Metadata } from "next";
import "../index.css";
import Providers from "@/components/providers";

export const metadata: Metadata = {
  title: { default: "CSE Exam Prep · Sibol", template: "%s · CSE Exam Prep" },
  description:
    "Private Civil Service Exam practice with topic drills, mock simulations, flashcards and saved results.",
  robots: { index: false, follow: false },
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={GeistSans.variable} suppressHydrationWarning>
      <body className={`${GeistSans.className} antialiased`}>
        <Providers>
          <a className="skip-link" href="#main-content">
            Skip to content
          </a>
          {children}
        </Providers>
      </body>
    </html>
  );
}
