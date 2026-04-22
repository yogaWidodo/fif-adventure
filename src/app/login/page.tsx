'use client';

import { Suspense } from 'react';
import { motion } from 'framer-motion';
import { Compass } from 'lucide-react';
import LoginForm from './LoginForm';

export default function LoginPage() {
  return (
    <div className="fixed inset-0 overflow-y-auto overflow-x-hidden flex flex-col items-center justify-center p-6 bg-[#0a0a0b] font-content">
      {/* Background */}
      <div
        className="fixed inset-0 z-0 bg-cover bg-center opacity-45"
        style={{ backgroundImage: 'url("/images/expedition_map_bg.png")', filter: 'brightness(0.5) contrast(1.1)' }}
      />

      <main className="relative z-20 w-full max-w-md">
        <header className="mb-12 text-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="inline-flex p-4 rounded-full bg-primary/10 border border-primary/20 mb-6"
          >
            <Compass className="w-12 h-12 text-primary torch-glow" />
          </motion.div>
          <h1 className="font-adventure text-4xl gold-engraving tracking-widest mb-2">Registry Desk</h1>
          <p className="text-muted-foreground text-xs uppercase tracking-[0.3em] font-adventure opacity-60">Declare Your Identity</p>
        </header>

        {/* Suspense boundary required for useSearchParams in Next.js App Router */}
        <Suspense fallback={
          <div className="space-y-6 animate-pulse">
            {[0, 1, 2].map((i) => (
              <div key={i} className="adventure-card p-6 bg-card/40 border-primary/10 h-24" />
            ))}
            <div className="w-full bg-primary/40 py-5 h-16" />
          </div>
        }>
          <LoginForm />
        </Suspense>

        <footer className="mt-12 text-center opacity-30">
          <p className="text-[10px] font-adventure uppercase tracking-widest italic">Unauthorized entry will be met with ancient curses.</p>
        </footer>
      </main>
    </div>
  );
}
