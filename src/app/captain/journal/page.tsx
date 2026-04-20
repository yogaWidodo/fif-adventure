'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { motion } from 'framer-motion';
import { Book, Compass, Trophy, MapPin, CheckCircle2, Circle, Flame, Gem, ScrollText, Lock } from 'lucide-react';
import AuthGuard from '@/components/AuthGuard';
import { useAuth } from '@/context/AuthContext';

export default function TeamJournal() {
  const { user } = useAuth();
  const [team, setTeam] = useState<any>(null);
  const [activities, setActivities] = useState<any[]>([]);
  const [hints, setHints] = useState<any[]>([]);
  const [registrations, setRegistrations] = useState<any[]>([]);
  const [claims, setClaims] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user?.team_id) fetchJournalData(user.team_id);
  }, [user]);

  const fetchJournalData = async (teamId: string) => {
    setLoading(true);

    const [teamRes, activitiesRes, hintsRes, regRes, claimRes] = await Promise.all([
      supabase.from('teams').select('*').eq('id', teamId).maybeSingle(),
      supabase.from('activities').select('*').order('name'),
      // Only fetch hints this team has received from gacha — joined with treasure_hunts for details
      supabase
        .from('treasure_hunt_hints')
        .select('id, treasure_hunt_id, received_at, treasure_hunts(id, name, hint_text, points)')
        .eq('team_id', teamId)
        .order('received_at', { ascending: false }),
      supabase.from('activity_registrations').select('*').eq('team_id', teamId),
      supabase.from('treasure_hunt_claims').select('*').eq('team_id', teamId),
    ]);

    setTeam(teamRes.data);
    setActivities(activitiesRes.data || []);
    setHints(hintsRes.data || []);
    setRegistrations(regRes.data || []);
    setClaims(claimRes.data || []);
    setLoading(false);
  };

  const isActivityDone = (id: string) => registrations.some(r => r.activity_id === id);
  const isTreasureClaimed = (id: string) => claims.some(c => c.treasure_hunt_id === id);

  const totalMain = activities.length;
  const completedMain = activities.filter(a => isActivityDone(a.id)).length;
  const progress = totalMain > 0 ? (completedMain / totalMain) * 100 : 0;

  const totalHints = hints.length;
  const claimedHints = hints.filter(h => {
    return claims.some((c: any) => c.treasure_hunt_id === h.treasure_hunt_id);
  }).length;

  return (
    <AuthGuard allowedRoles={['admin', 'captain', 'vice_captain']}>
      <div className="relative min-h-screen flex flex-col items-center bg-black overflow-hidden font-content p-6 pb-24">
        {/* Immersive Background */}
        <div 
          className="fixed inset-0 z-0 bg-cover bg-center opacity-20"
          style={{ backgroundImage: 'url("/images/expedition_map_bg.png")', filter: 'brightness(0.3)' }}
        />
        <div className="fixed inset-0 z-10 jungle-overlay opacity-5 pointer-events-none" />

        <header className="relative z-20 mb-12 text-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-primary/20 p-4 rounded-full w-fit mx-auto mb-6 border border-primary/20"
          >
            <Book className="text-primary w-10 h-10 torch-glow" />
          </motion.div>
          <h1 className="font-adventure text-4xl gold-engraving mb-2 tracking-widest uppercase">The Captain's Journal</h1>
          <p className="text-muted-foreground italic text-xs uppercase tracking-[0.2em] opacity-60">Record of Discoveries</p>
        </header>

        <div className="relative z-20 w-full max-w-2xl space-y-8">
          {/* Progress Card */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="adventure-card p-10 bg-card/90 border-primary/20"
          >
            <div className="flex justify-between items-end mb-8">
              <div>
                <p className="text-[10px] uppercase font-adventure text-primary tracking-widest mb-1 italic">Active Expedition</p>
                <h2 className="text-3xl font-adventure gold-engraving">{team?.name || 'Alpha Group'}</h2>
              </div>
              <div className="text-right">
                <Trophy className="w-6 h-6 text-primary ml-auto mb-1" />
                <p className="text-2xl font-adventure text-primary">{team?.total_points || 0}</p>
                <p className="text-[8px] uppercase font-adventure opacity-40">Prestige Earned</p>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex justify-between text-[10px] font-adventure uppercase tracking-widest opacity-60">
                <span>Discovery Meter</span>
                <span>{Math.round(progress)}% Complete</span>
              </div>
              <div className="h-4 bg-black/40 border border-primary/10 p-0.5 relative">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: `${progress}%` }}
                  className="h-full bg-gradient-to-r from-primary/40 to-primary relative"
                >
                  <div className="absolute inset-0 bg-white/20 animate-pulse" />
                  <Flame className="absolute -right-2 -top-4 w-4 h-4 text-accent torch-glow" />
                </motion.div>
              </div>
              <p className="text-[10px] italic opacity-40 text-center">"{completedMain} of {totalMain} main activities secured."</p>
            </div>
          </motion.div>

          {/* Activity Checklist */}
          <div className="space-y-4">
            <div className="flex items-center gap-4 mb-6">
              <span className="h-px w-8 bg-primary/40" />
              <h3 className="font-adventure text-sm text-primary tracking-widest uppercase">Expedition Tasks</h3>
            </div>

            {loading ? (
              <div className="p-20 text-center italic opacity-30">Consulting the archives...</div>
            ) : (
              <div className="grid gap-4">
                {activities.map((act, idx) => (
                  <motion.div 
                    key={act.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.05 }}
                    className={`parchment p-5 flex items-center justify-between border-l-[6px] transition-all ${
                      isActivityDone(act.id) ? 'border-l-primary opacity-100 shadow-lg' : 'border-l-stone-400/20 opacity-40'
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      {isActivityDone(act.id) ? (
                        <CheckCircle2 className="w-6 h-6 text-primary" />
                      ) : (
                        <Circle className="w-6 h-6 text-stone-400/30" />
                      )}
                      <div>
                        <h4 className="font-adventure text-lg tracking-tight leading-none text-[#2b1d0e] mb-1">{act.name}</h4>
                        <p className="text-[10px] uppercase font-adventure text-[#8b4513]/60 italic tracking-tighter">
                          {act.type} • {act.max_points} Pts Max
                        </p>
                      </div>
                    </div>
                    
                    {isActivityDone(act.id) && (
                      <div className="flex flex-col items-end">
                        <p className="text-[8px] font-mono text-[#8b4513]/40">SECURED</p>
                        <MapPin className="w-4 h-4 text-[#8b4513]/60" />
                      </div>
                    )}
                  </motion.div>
                ))}
              </div>
            )}
          </div>

          {/* Treasure Hunt Hints Section — only hints received from gacha */}
          {!loading && hints.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center gap-4 mb-6">
                <span className="h-px w-8 bg-primary/40" />
                <h3 className="font-adventure text-sm text-primary tracking-widest uppercase">Treasure Hunt Hints</h3>
                <span className="text-[10px] font-adventure text-primary/50">{claimedHints}/{totalHints} claimed</span>
              </div>
              <div className="grid gap-4">
                {hints.map((hint, idx) => {
                  const thRaw = hint.treasure_hunts as any;
                  const th = Array.isArray(thRaw) ? thRaw[0] : thRaw;
                  if (!th) return null;
                  const claimed = claims.some((c: any) => c.treasure_hunt_id === hint.treasure_hunt_id);
                  return (
                    <motion.div
                      key={hint.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.05 }}
                      className={`parchment p-5 border-l-[6px] transition-all ${
                        claimed ? 'border-l-green-600 opacity-100 shadow-lg' : 'border-l-primary opacity-90'
                      }`}
                    >
                      <div className="flex items-start gap-4">
                        {claimed ? (
                          <CheckCircle2 className="w-6 h-6 text-green-600 flex-shrink-0 mt-0.5" />
                        ) : (
                          <ScrollText className="w-6 h-6 text-[#8b4513]/70 flex-shrink-0 mt-0.5" />
                        )}
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <h4 className="font-adventure text-lg tracking-tight leading-none text-[#2b1d0e]">{th.name}</h4>
                            <span className={`text-[8px] font-mono px-2 py-0.5 uppercase ${
                              claimed 
                                ? 'bg-green-800/20 text-green-800' 
                                : 'bg-amber-800/20 text-amber-800'
                            }`}>
                              {claimed ? 'CLAIMED' : 'ACTIVE'}
                            </span>
                          </div>
                          {/* Show the hint text — this is the secret clue! */}
                          <div className="bg-[#2b1d0e]/10 border border-[#8b4513]/20 p-3 rounded-sm mb-2">
                            <p className="text-sm text-[#2b1d0e]/80 font-content italic leading-relaxed">
                              💡 {th.hint_text}
                            </p>
                          </div>
                          <p className="text-[10px] uppercase font-adventure text-[#8b4513]/60 italic tracking-tighter">
                            treasure • {th.points} Pts • diterima {new Date(hint.received_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                      </div>
                      {claimed && (
                        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-[#8b4513]/10">
                          <Gem className="w-4 h-4 text-green-700" />
                          <span className="text-[10px] font-adventure text-green-800 uppercase tracking-widest">Treasure Secured • +{th.points} pts</span>
                        </div>
                      )}
                    </motion.div>
                  );
                })}
              </div>
            </div>
          )}

          {/* No hints yet message */}
          {!loading && hints.length === 0 && (
            <div className="space-y-4">
              <div className="flex items-center gap-4 mb-6">
                <span className="h-px w-8 bg-primary/40" />
                <h3 className="font-adventure text-sm text-primary tracking-widest uppercase">Treasure Hunt Hints</h3>
              </div>
              <div className="parchment p-8 text-center">
                <Lock className="w-8 h-8 text-[#8b4513]/30 mx-auto mb-3" />
                <p className="font-adventure text-sm text-[#2b1d0e]/50 italic">
                  Belum ada hint. Selesaikan wahana untuk memutar gacha!
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Floating Back Button */}
        <nav className="fixed bottom-8 left-6 right-6 z-30 flex justify-center">
          <a href="/captain" className="adventure-card px-10 py-5 bg-card/60 backdrop-blur-xl border-primary/20 font-adventure text-xs tracking-[0.2em] uppercase hover:text-primary transition-colors flex items-center gap-3">
            <Compass className="w-4 h-4" />
            Return to Deck
          </a>
        </nav>
      </div>
    </AuthGuard>
  );
}
