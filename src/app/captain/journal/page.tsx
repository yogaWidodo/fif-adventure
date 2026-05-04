'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { motion, AnimatePresence } from 'framer-motion';
import { Book, Compass, Trophy, MapPin, CheckCircle2, Circle, Flame, Gem, ScrollText, Lock, X, Sword, ChevronRight } from 'lucide-react';
import AuthGuard from '@/components/AuthGuard';
import { useAuth } from '@/context/AuthContext';

export default function TeamJournal() {
  const { user } = useAuth();
  const [team, setTeam] = useState<any>(null);
  const [activities, setActivities] = useState<any[]>([]);
  const [hints, setHints] = useState<any[]>([]);
  const [registrations, setRegistrations] = useState<any[]>([]);
  const [scoreLogs, setScoreLogs] = useState<any[]>([]);
  const [claims, setClaims] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedActivity, setSelectedActivity] = useState<any>(null);

  useEffect(() => {
    if (!user?.team_id) return;
    fetchJournalData(user.team_id);

    // Real-time synchronization
    const teamId = user.team_id;
    const channel = supabase
      .channel(`journal-updates-${teamId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'activity_registrations', filter: `team_id=eq.${teamId}` },
        () => fetchJournalData(teamId)
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'score_logs', filter: `team_id=eq.${teamId}` },
        () => fetchJournalData(teamId)
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'treasure_hunt_hints', filter: `team_id=eq.${teamId}` },
        () => fetchJournalData(teamId)
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.team_id]);

  const fetchJournalData = async (teamId: string) => {
    const [teamRes, activitiesRes, hintsRes, regRes, logsRes, claimRes] = await Promise.all([
      supabase.from('teams').select('*').eq('id', teamId).maybeSingle(),
      supabase.from('activities').select('id, name, description, how_to_play, type, max_points, difficulty_level').eq('is_visible', true).order('name'),
      supabase.from('treasure_hunt_hints').select('id, treasure_hunt_id, received_at, treasure_hunts(id, name, hint_text, points, is_public)').eq('team_id', teamId).order('received_at', { ascending: false }),
      supabase.from('activity_registrations').select('*').eq('team_id', teamId),
      supabase.from('score_logs').select('activity_id, participant_ids').eq('team_id', teamId),
      supabase.from('treasure_hunt_claims').select('*').eq('team_id', teamId),
    ]);

    setTeam(teamRes.data);
    setActivities(activitiesRes.data || []);
    setHints(hintsRes.data || []);
    setRegistrations(regRes.data || []);
    setScoreLogs(logsRes.data || []);
    setClaims(claimRes.data || []);
    setLoading(false);
  };

  const getActivityStatus = (id: string) => {
    if (!user?.id) return 'not-started';

    // A member is "Done" if their ID is in any score_log for this activity
    if (scoreLogs.some(log => log.activity_id === id && log.participant_ids?.includes(user.id))) return 'done';
    // A member is "In Progress" if their ID is in any registration for this activity
    if (registrations.some(r => r.activity_id === id && r.participant_ids?.includes(user.id))) return 'in-progress';
    return 'not-started';
  };
  
  const isTreasureClaimed = (id: string) => claims.some(c => c.treasure_hunt_id === id);

  const totalMain = activities.length;
  const completedMain = activities.filter(a => getActivityStatus(a.id) !== 'not-started').length;
  const progress = totalMain > 0 ? (completedMain / totalMain) * 100 : 0;

  const totalHints = hints.length;
  const claimedHints = hints.filter(h => {
    return claims.some((c: any) => c.treasure_hunt_id === h.treasure_hunt_id);
  }).length;

  return (
    <AuthGuard allowedRoles={['admin', 'captain', 'vice_captain']}>
      <div className="relative min-h-screen flex flex-col items-center bg-black overflow-y-auto font-content p-6 pb-24">
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
              <p className="text-[10px] italic opacity-40 text-center">"{completedMain} of {totalMain} missions secured."</p>
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
                {activities.map((act, idx) => {
                  const status = getActivityStatus(act.id);
                  return (
                    <motion.div 
                      key={act.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.05 }}
                      onClick={() => setSelectedActivity(act)}
                      className={`parchment p-5 flex items-center justify-between border-l-[6px] transition-all relative overflow-hidden group cursor-pointer hover:translate-x-1 active:scale-[0.98] ${
                        status === 'done' ? 'opacity-100 shadow-lg' :
                        status === 'in-progress' ? 'opacity-90 border-l-amber-500 shadow-inner animate-pulse-subtle bg-amber-500/5' :
                        'opacity-70 hover:opacity-100'
                      } ${
                        act.difficulty_level === 'Easy' ? 'border-l-green-600' :
                        act.difficulty_level === 'Hard' ? 'border-l-red-600' :
                        status === 'in-progress' ? 'border-l-amber-500' : 'border-l-amber-600'
                      }`}
                    >
                    <div className="flex items-center gap-4">
                      {status === 'done' ? (
                        <CheckCircle2 className="w-6 h-6 text-primary" />
                      ) : status === 'in-progress' ? (
                        <div className="relative">
                          <Circle className="w-6 h-6 text-amber-500/30" />
                          <div className="absolute inset-0 bg-amber-500/20 rounded-full animate-ping" />
                        </div>
                      ) : (
                        <Circle className="w-6 h-6 text-stone-400/30" />
                      )}
                      <div>
                        <h4 className="font-adventure text-lg tracking-tight leading-none text-[#2b1d0e] mb-1.5">{act.name}</h4>
                        <div className="flex items-center gap-3">
                          <p className="text-[10px] uppercase font-adventure text-[#8b4513]/60 italic tracking-tighter">
                            {act.type.replace('challenge_', '')} • {act.max_points} Pts/org
                          </p>
                          <div className={`px-2 py-0.5 rounded-full text-[8px] font-adventure uppercase border ${
                            act.difficulty_level === 'Easy' ? 'bg-green-100 border-green-200 text-green-700' :
                            act.difficulty_level === 'Hard' ? 'bg-red-100 border-red-200 text-red-700' :
                            'bg-amber-100 border-amber-200 text-amber-700'
                          }`}>
                            {act.difficulty_level}
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    {status !== 'not-started' ? (
                      <div className="flex items-center gap-2">
                        <div className="flex flex-col items-end opacity-40">
                          <p className="text-[8px] font-mono text-[#8b4513]">
                            {status === 'done' ? 'DISCOVERED' : 'IN PROGRESS'}
                          </p>
                          <ChevronRight className="w-4 h-4 text-[#8b4513]" />
                        </div>
                      </div>
                    ) : (
                       <Lock className="w-4 h-4 text-stone-400/30" />
                    )}

                    {/* Subtle discovery glow for active/done items */}
                    {status !== 'not-started' && (
                      <div className="absolute inset-0 bg-primary/5 pointer-events-none group-hover:bg-primary/10 transition-colors" />
                    )}
                  </motion.div>
                );
              })}
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
                {hints.filter(h => !(h.treasure_hunts as any)?.is_public).map((hint, idx) => {
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
          {!loading && hints.filter(h => !(h.treasure_hunts as any)?.is_public).length === 0 && (
            <div className="space-y-4">
              <div className="flex items-center gap-4 mb-6">
                <span className="h-px w-8 bg-primary/40" />
                <h3 className="font-adventure text-sm text-primary tracking-widest uppercase">Treasure Hunt Hints</h3>
              </div>
              <div className="parchment p-8 text-center">
                <Lock className="w-8 h-8 text-[#8b4513]/30 mx-auto mb-3" />
                <p className="font-adventure text-sm text-[#2b1d0e]/50 italic">
                  Belum ada hint rahasia. Temukan wahana tersembunyi untuk membukanya!
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Activity Detail Modal */}
        <AnimatePresence>
          {selectedActivity && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/90 backdrop-blur-sm"
              onClick={() => setSelectedActivity(null)}
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.9, opacity: 0, y: 20 }}
                className="adventure-card w-full max-w-lg overflow-hidden border-primary/30"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Modal Header */}
                <div className="relative h-32 bg-primary/20 flex items-center justify-center overflow-hidden">
                  <div className="absolute inset-0 bg-[url('/images/expedition_map_bg.png')] bg-cover bg-center opacity-30 mix-blend-overlay" />
                  <div className="relative z-10 flex flex-col items-center">
                    <div className="bg-primary/20 p-3 rounded-full border border-primary/30 mb-2">
                       {selectedActivity.type === 'wahana' ? (
                         <MapPin className="w-6 h-6 text-primary torch-glow" />
                       ) : (
                         <Sword className="w-6 h-6 text-primary torch-glow" />
                       )}
                    </div>
                    <h2 className="font-adventure text-2xl gold-engraving tracking-widest uppercase mb-1">
                      {selectedActivity.name}
                    </h2>
                    <DifficultyBadge level={selectedActivity.difficulty_level} />
                  </div>
                  <button
                    onClick={() => setSelectedActivity(null)}
                    className="absolute top-4 right-4 z-20 text-foreground/40 hover:text-foreground transition-colors"
                  >
                    <X className="w-6 h-6" />
                  </button>
                </div>

                {/* Modal Body */}
                <div className="p-8 max-h-[60vh] overflow-y-auto custom-scrollbar">
                  <div className="space-y-8">
                    {/* Lore Section */}
                    <section>
                      <div className="flex items-center gap-3 mb-3">
                        <span className="h-px flex-1 bg-primary/20" />
                        <h3 className="font-adventure text-[10px] uppercase tracking-[0.4em] text-primary/60">Discovery Lore</h3>
                        <span className="h-px flex-1 bg-primary/20" />
                      </div>
                      <p className="text-sm font-content text-foreground/80 italic leading-relaxed text-center px-4">
                        "{selectedActivity.description || 'No lore recorded for this discovery.'}"
                      </p>
                    </section>

                    {/* How to Play Section */}
                    <section>
                      <div className="flex items-center gap-3 mb-4">
                        <span className="h-px flex-1 bg-primary/20" />
                        <h3 className="font-adventure text-[10px] uppercase tracking-[0.4em] text-primary/60">Instructions</h3>
                        <span className="h-px flex-1 bg-primary/20" />
                      </div>
                      <div className="bg-black/40 border border-primary/10 p-6 rounded-sm">
                        <div className="text-xs font-content text-foreground/70 leading-relaxed whitespace-pre-line">
                          {selectedActivity.how_to_play || 'Search the area for clues. The field officer will provide further guidance.'}
                        </div>
                      </div>
                    </section>

                    {/* Reward Section */}
                    <div className="flex items-center justify-between pt-6 border-t border-primary/10">
                      <div className="flex items-center gap-2">
                        <Flame className="w-4 h-4 text-primary" />
                        <span className="text-[10px] font-adventure text-primary/60 uppercase tracking-widest">
                          Poin/Peserta
                        </span>
                      </div>
                      <span className="text-lg font-adventure text-primary">
                        {selectedActivity.max_points} pts/org
                      </span>
                    </div>
                  </div>
                </div>

                {/* Modal Footer */}
                <div className="p-6 bg-primary/5 border-t border-primary/10">
                  <button
                    onClick={() => setSelectedActivity(null)}
                    className="w-full py-4 font-adventure text-xs uppercase tracking-[0.3em] bg-primary text-primary-foreground hover:bg-primary/90 transition-all shadow-lg active:scale-95"
                  >
                    Close Journal
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

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

function DifficultyBadge({ level }: { level: string }) {
  const colorClass = level === 'Easy' ? 'bg-green-600 text-white' : level === 'Hard' ? 'bg-red-600 text-white' : 'bg-amber-500 text-white';
  const flames = level === 'Easy' ? 1 : level === 'Hard' ? 3 : 2;
  
  return (
    <div className={`flex items-center gap-1.5 px-3 py-1 rounded-sm shadow-md ${colorClass}`}>
      <div className="flex -space-x-0.5">
        {Array.from({ length: flames }).map((_, i) => (
          <Flame key={i} className="w-2.5 h-2.5 fill-current" />
        ))}
      </div>
      <span className="text-[9px] font-adventure uppercase tracking-widest">{level}</span>
    </div>
  );
}
