import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import { RoleSwitcher } from "@/components/RoleSwitcher";
import { getRole } from "@/lib/role";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "E2 Visa Case Workflow",
  description: "Agentic E2 visa case workflow with AI document checks and RFGP packet generation",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const role = await getRole();
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        <header className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
            <Link href="/" className="flex items-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/kwanso-logo.png" alt="Kwanso" width={155} height={28} />
            </Link>
            <RoleSwitcher role={role} />
          </div>
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-8">{children}</main>
        <footer className="py-6 text-center text-xs text-slate-400">
          Built by Kwanso. Demo data only. AI output is a draft for paralegal and attorney review, not legal advice.
        </footer>
      </body>
    </html>
  );
}
