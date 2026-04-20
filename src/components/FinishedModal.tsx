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

  const [topTeams, setTopTeams] = React.useState<{ name: string; total_points: number }[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    if (status === 'finished' || isExpired) {
      fetch('/api/leaderboard')
        .then(res => res.json())
        .then(data => {
          const list = Array.isArray(data) ? data : data.leaderboard || [];
          setTopTeams(list.slice(0, 3));
          setLoading(false);
        })
        .catch(() => setLoading(false));
    }
  }, [status, isExpired]);

  // Don't render for admins or when not finished
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
        <motion.div
          initial={{ scale: 0.8, opacity: 0, y: 40 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 260, damping: 20 }}
          className="relative adventure-card px-8 py-10 flex flex-col items-center gap-6 max-w-md w-full border-gray-500/20 text-center"
        >
          <div className="relative">
            <motion.div
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.3, duration: 0.5 }}
              className="bg-gray-800/60 p-4 rounded-full border border-gray-600/30 relative z-10"
            >
              <Skull className="w-12 h-12 text-gray-400" />
            </motion.div>
            <motion.div 
              animate={{ scale: [1, 1.4, 1], opacity: [0.2, 0.4, 0.2] }}
              transition={{ repeat: Infinity, duration: 3 }}
              className="absolute inset-0 bg-primary/20 rounded-full blur-2xl"
            />
          </div>

          <div className="space-y-2">
            <h2 className="font-adventure text-4xl text-gray-200 gold-engraving tracking-tighter">
              Expedition Over
            </h2>
            <p className="text-muted-foreground italic text-[10px] font-content max-w-[280px] mx-auto opacity-70">
              "The sands of time have run out. The winners have been determined."
            </p>
          </div>

          {/* Final Rankings Section */}
          <div className="w-full space-y-4 py-4 border-y border-primary/10">
            <h3 className="font-adventure text-xs uppercase tracking-widest text-primary/60">Final Standings</h3>
            {loading ? (
              <div className="py-4 animate-pulse text-[10px] uppercase font-adventure opacity-30">Retrieving Records...</div>
            ) : (
              <div className="space-y-3">
                {topTeams.map((team, i) => (
                  <motion.div
                    key={team.name}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.5 + (i * 0.1) }}
                    className={`flex items-center justify-between p-3 border ${
                      i === 0 ? 'bg-primary/10 border-primary/30' : 'bg-white/5 border-white/10'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className={`font-adventure text-lg ${
                        i === 0 ? 'text-yellow-500' : i === 1 ? 'text-gray-400' : 'text-amber-700'
                      }`}>
                        #{i + 1}
                      </span>
                      <div className="text-left">
                        <p className="font-adventure text-sm uppercase tracking-tight">{team.name}</p>
                        {i === 0 && <p className="text-[8px] text-primary/50 uppercase tracking-widest">Grand Champion</p>}
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-adventure text-lg text-primary">{team.total_points}</p>
                      <p className="text-[8px] opacity-30 uppercase tracking-widest">Points</p>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </div>

          <div className="w-full space-y-4">
            <Link href="/leaderboard" className="block w-full">
              <button className="w-full bg-primary/20 hover:bg-primary/30 border border-primary/40 text-primary font-adventure uppercase tracking-[0.2em] py-3 text-xs transition-all hover:scale-[1.02] active:scale-[0.98]">
                View Full Leaderboard
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
