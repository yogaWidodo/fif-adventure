'use client';

// Requirements: 8.2, 8.4, 8.6

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Trophy, Compass, Shield, Flame } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface TeamScore {
  id: string;
  name: string;
  total_points: number;
  rank: number;
}

interface RecentUpdate {
  teamName: string;
  points: number;
}

export default function LeaderboardPage() {
  const [teams, setTeams] = useState<TeamScore[]>([]);
  const [loading, setLoading] = useState(true);
  const [recentUpdate, setRecentUpdate] = useState<RecentUpdate | null>(null);
  const prevTeamsRef = useRef<TeamScore[]>([]);
  const notifTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Fetch leaderboard from API ─────────────────────────────────────────────
  const fetchLeaderboard = async () => {
    try {
      const res = await fetch('/api/leaderboard');
      if (!res.ok) return;
      const json = await res.json();
      
      let data: TeamScore[] = [];
      if (Array.isArray(json)) {
        data = json;
      } else if (json && Array.isArray(json.leaderboard)) {
        data = json.leaderboard;
      }
      
      setTeams(data);
      setLoading(false);
    } catch {
      setLoading(false);
    }
  };

  // ── Initial fetch ──────────────────────────────────────────────────────────
  useEffect(() => {
    fetchLeaderboard();
  }, []);

  // ── Supabase Realtime: subscribe to teams table changes ───────────────────
  // Requirement 8.2: reflects score changes in real-time
  // Requirement 8.4: reflects score changes within seconds
  useEffect(() => {
    const channel = supabase
      .channel('leaderboard-realtime')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'teams',
        },
        (payload) => {
          const updated = payload.new as { id: string; name: string; total_points: number };

          setTeams((prev) => {
            // Find if points actually changed
            const existing = prev.find(t => t.id === updated.id);
            if (existing && existing.total_points !== updated.total_points) {
              // Show toast notification
              if (notifTimerRef.current) clearTimeout(notifTimerRef.current);
              setRecentUpdate({ teamName: updated.name, points: updated.total_points - existing.total_points });
              notifTimerRef.current = setTimeout(() => setRecentUpdate(null), 4000);
            }

            // Update the team in the list and re-rank
            const newList = prev.map(t =>
              t.id === updated.id ? { ...t, total_points: updated.total_points } : t
            );
            const sorted = [...newList].sort((a, b) => b.total_points - a.total_points);
            return sorted.map((t, i) => ({ ...t, rank: i + 1 }));
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      if (notifTimerRef.current) clearTimeout(notifTimerRef.current);
    };
  }, []);

  return (
    <div className="relative min-h-screen flex flex-col items-center bg-black overflow-hidden font-content selection:bg-primary selection:text-primary-foreground">
      {/* Immersive Background */}
      <div
        className="fixed inset-0 z-0 bg-cover bg-center opacity-30"
        style={{ backgroundImage: 'url("/images/expedition_map_bg.png")', filter: 'brightness(0.5) contrast(1.1)' }}
      />
      <div className="fixed inset-0 z-0 bg-gradient-to-b from-black/80 via-transparent to-black" />
      <div className="fixed inset-0 z-10 jungle-overlay opacity-10 pointer-events-none" />

      <div className="relative z-20 w-full max-w-4xl p-6 md:p-16">
        <header className="mb-16 text-center">
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="flex items-center justify-center gap-2 mb-4">
              <span className="h-px w-12 bg-primary/40" />
              <div className="bg-primary/20 p-3 rounded-full border border-primary/20">
                <Trophy className="w-8 h-8 text-primary torch-glow" />
              </div>
              <span className="h-px w-12 bg-primary/40" />
            </div>
            <h1 className="font-adventure text-5xl md:text-6xl gold-engraving mb-4">Hall of Records</h1>
            <p className="text-muted-foreground italic font-content max-w-lg mx-auto opacity-70">
              &quot;Witness the prestige of the daring expeditions currently traversing the unknown.&quot;
            </p>
          </motion.div>
        </header>

        {/* Real-time Notification Toast */}
        <AnimatePresence>
          {recentUpdate && (
            <motion.div
              initial={{ y: -50, opacity: 0, x: '-50%' }}
              animate={{ y: 0, opacity: 1, x: '-50%' }}
              exit={{ y: -50, opacity: 0, x: '-50%' }}
              className="fixed top-8 left-1/2 adventure-card p-6 flex items-center gap-6 bg-accent/30 z-50 border-accent/40 shadow-lg"
            >
              <div className="bg-accent p-3 rounded-none torch-glow">
                <Flame className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="text-[10px] uppercase font-adventure tracking-widest text-[#f4e4bc] opacity-60">Score Update!</p>
                <p className="text-[#f4e4bc] font-adventure text-lg tracking-tight">
                  {recentUpdate.teamName}
                  {recentUpdate.points > 0 && (
                    <span className="text-primary ml-2">+{recentUpdate.points} pts</span>
                  )}
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Leaderboard Table */}
        <div className="adventure-card border-primary/20 bg-card/90 shadow-2xl overflow-hidden">
          <div className="grid grid-cols-12 gap-4 px-8 py-5 border-b border-primary/20 bg-primary/5">
            <div className="col-span-2 font-adventure text-[10px] uppercase tracking-[0.3em] text-primary">Rank</div>
            <div className="col-span-7 font-adventure text-[10px] uppercase tracking-[0.3em] text-primary">Expedition Group</div>
            <div className="col-span-3 font-adventure text-[10px] uppercase tracking-[0.3em] text-primary text-right">Prestige</div>
          </div>

          <div className="divide-y divide-primary/10">
            {loading ? (
              <div className="p-32 flex flex-col items-center justify-center opacity-40 italic">
                <Compass className="w-12 h-12 text-primary animate-spin mb-4" />
                Deciphering the scrolls...
              </div>
            ) : teams.length === 0 ? (
              <div className="p-32 text-center text-muted-foreground italic opacity-40">No expeditions found in these parts.</div>
            ) : (
              teams.map((team, index) => (
                <motion.div
                  key={team.id}
                  layout
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.05, layout: { duration: 0.4 } }}
                  className={`grid grid-cols-12 gap-4 px-8 py-6 items-center transition-all group hover:bg-white/5 ${
                    index === 0 ? 'bg-primary/10 border-l-4 border-l-primary' :
                    index === 1 ? 'bg-primary/5 border-l-4 border-l-stone-400' :
                    index === 2 ? 'bg-primary/5 border-l-4 border-l-orange-800' : ''
                  }`}
                >
                  <div className="col-span-2 flex items-center gap-3">
                    <span className={`font-adventure ${
                      index === 0 ? 'text-3xl gold-engraving' :
                      index === 1 ? 'text-2xl text-stone-400' :
                      index === 2 ? 'text-2xl text-orange-800' : 'text-lg text-foreground/40'
                    }`}>
                      #{team.rank}
                    </span>
                    {index === 0 && <Shield className="w-4 h-4 text-primary animate-pulse" />}
                  </div>

                  <div className="col-span-7">
                    <h3 className={`font-adventure tracking-tighter uppercase transition-all group-hover:translate-x-1 ${
                      index < 3 ? 'text-2xl' : 'text-lg opacity-80'
                    }`}>
                      {team.name}
                    </h3>
                    {index < 3 && <p className="text-[10px] text-primary/50 font-adventure tracking-widest">Master Explorer</p>}
                  </div>

                  <div className="col-span-3 text-right">
                    <motion.div
                      key={team.total_points}
                      initial={{ scale: 1.2, color: '#d4af37' }}
                      animate={{ scale: 1 }}
                      transition={{ duration: 0.3 }}
                      className="inline-flex items-center justify-center min-w-[80px] px-6 py-2 bg-black/40 border border-primary/20 rounded-none shadow-inner group-hover:border-primary/60 transition-colors"
                    >
                      <span className="font-adventure text-xl text-primary font-bold">{team.total_points}</span>
                    </motion.div>
                  </div>
                </motion.div>
              ))
            )}
          </div>
        </div>

        <footer className="mt-16 flex flex-col items-center opacity-40">
          <div className="flex items-center gap-4 mb-4">
            <span className="h-px w-24 bg-gradient-to-r from-transparent to-primary/40" />
            <span className="font-adventure text-[10px] tracking-[0.5em] uppercase">Expedition Ledger</span>
            <span className="h-px w-24 bg-gradient-to-l from-transparent to-primary/40" />
          </div>
          <p className="text-[10px] font-content italic">&quot;Fortune favors the bold.&quot;</p>
        </footer>
      </div>
    </div>
  );
}
