'use client';

import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Skull, Trophy } from 'lucide-react';
import Link from 'next/link';
import { useTimerContext } from '@/context/TimerContext';
import { useAuth } from '@/context/AuthContext';

export default function FinishedModal(): React.JSX.Element | null {
  const { status, isExpired } = useTimerContext();
  const { user } = useAuth();

  // Don't render for admins or when not finished
  // isExpired is usually true when status === 'finished'
  if ((status !== 'finished' && !isExpired) || user?.role === 'admin') {
    return null;
  }

  return (
    <AnimatePresence>
      <motion.div
        key="finished-modal"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.5 }}
        className="fixed inset-0 z-[250] flex items-center justify-center p-6"
        style={{
          background: 'rgba(5, 8, 12, 0.98)',
        }}
      >
        {/* Subtle background particles or smoke could go here */}
        
        <motion.div
          initial={{ scale: 0.8, opacity: 0, y: 40 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 260, damping: 20 }}
          className="relative adventure-card px-8 py-12 flex flex-col items-center gap-8 max-w-md w-full border-gray-500/20 text-center"
        >
          {/* Main Icon */}
          <div className="relative">
            <motion.div
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.3, duration: 0.5 }}
              className="bg-gray-800/60 p-6 rounded-full border border-gray-600/30 relative z-10"
            >
              <Skull className="w-16 h-16 text-gray-400" />
            </motion.div>
            {/* Pulse effect behind the skull */}
            <motion.div 
              animate={{ scale: [1, 1.4, 1], opacity: [0.2, 0.4, 0.2] }}
              transition={{ repeat: Infinity, duration: 3 }}
              className="absolute inset-0 bg-primary/20 rounded-full blur-2xl"
            />
          </div>

          <div className="space-y-4">
            <h2 className="font-adventure text-4xl text-gray-200 gold-engraving tracking-tighter">
              Expedition Over
            </h2>
            <p className="text-muted-foreground italic text-sm font-content max-w-[280px] mx-auto opacity-70">
              "The sands of time have run out. Your journey through the ancient grounds has ended."
            </p>
          </div>

          {/* Decorative Divider */}
          <div className="flex items-center gap-4 w-full">
            <span className="h-px flex-1 bg-gradient-to-r from-transparent to-primary/20" />
            <Trophy className="w-5 h-5 text-primary/40" />
            <span className="h-px flex-1 bg-gradient-to-l from-transparent to-primary/20" />
          </div>

          <div className="w-full space-y-4">
            <Link href="/leaderboard" className="block w-full">
              <button className="w-full bg-primary/20 hover:bg-primary/30 border border-primary/40 text-primary font-adventure uppercase tracking-[0.2em] py-4 transition-all hover:scale-[1.02] active:scale-[0.98]">
                View Final Rankings
              </button>
            </Link>
            
            <p className="text-[10px] uppercase font-adventure tracking-widest text-[#f4e4bc]/30">
              Rankings are now being archived
            </p>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
