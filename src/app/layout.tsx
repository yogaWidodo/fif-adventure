import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";
import { TimerProvider } from "@/context/TimerContext";
import ExpeditionTimer from "@/components/ExpeditionTimer";
import PauseModal from "@/components/PauseModal";
import FinishedModal from "@/components/FinishedModal";
import SoundManager from "@/components/SoundManager";
import { Analytics } from "@vercel/analytics/next";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "FIF Adventure | Event Management",
  description: "Wild, adventure-themed game management for the ultimate event experience.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="antialiased bg-black overflow-x-hidden selection:bg-primary selection:text-primary-foreground min-h-screen">
        <AuthProvider>
          <TimerProvider>
            <div className="fixed inset-0 z-0 jungle-overlay opacity-5 pointer-events-none" />
            <ExpeditionTimer />
            <PauseModal />
            <FinishedModal />
            <SoundManager />
            {children}
            <Analytics />
          </TimerProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
