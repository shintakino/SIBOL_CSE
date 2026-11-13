import { GeistSans } from "geist/font/sans";
import type { Metadata } from "next";
import "../index.css";
import Providers from "@/components/providers";

export const metadata: Metadata = {
  title: { default: "Sibol · Your review companion", template: "%s · Sibol" },
  description: "A calm, private companion for your civil service review.",
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
