'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Users, Trophy, MapPin, CheckCircle2, Circle,
  Compass, Flame, LogOut, Crown, Shield, Gem, ScrollText, Lock, ChevronDown,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import AuthGuard from '@/components/AuthGuard';
import MapPanel from '@/components/MapPanel';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';

interface TeamMember {
  id: string;
  name: string;
  role: string;
}

interface Activity {
  id: string;
  name: string;
  type: string;
  max_points: number;
}

interface Registration {
  activity_id: string;
  checked_in_at: string;
}

interface HintWithTreasure {
  id: string;
  treasure_hunt_id: string;
  received_at: string;
  treasure_hunts: {
    id: string;
    name: string;
    hint_text: string;
    points: number;
  } | null;
}

interface TreasureHuntClaim {
  treasure_hunt_id: string;
}

interface TeamData {
  id: string;
  name: string;
  slogan: string | null;
  total_points: number;
}

interface LeaderboardEntry {
  id: string;
  name: string;
  total_points: number;
  rank: number;
}

export default function MemberPortal() {
  const { user, logout } = useAuth();

  const [team, setTeam] = useState<TeamData | null>(null);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [hints, setHints] = useState<HintWithTreasure[]>([]);
  const [claims, setClaims] = useState<TreasureHuntClaim[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ crew: false, tasks: true, hints: true, leaderboard: false });

  useEffect(() => {
    if (!user?.team_id) {
      setLoading(false);
      return;
    }
    fetchAll(user.team_id);
  }, [user]);

  const fetchAll = async (teamId: string) => {
    setLoading(true);

    const [teamRes, membersRes, actRes, regRes, hintsRes, claimRes, lbRes] = await Promise.all([
      supabase.from('teams').select('id, name, slogan, total_points').eq('id', teamId).maybeSingle(),
      supabase.from('users').select('id, name, role').eq('team_id', teamId).order('role'),
      supabase.from('activities').select('id, name, type, max_points').order('name'),
      supabase.from('activity_registrations').select('activity_id, checked_in_at').eq('team_id', teamId),
      // Fetch hints this team has discovered through activity scans
      supabase
        .from('treasure_hunt_hints')
        .select('id, treasure_hunt_id, received_at, treasure_hunts(id, name, hint_text, points)')
        .eq('team_id', teamId)
        .order('received_at', { ascending: false }),
      supabase.from('treasure_hunt_claims').select('treasure_hunt_id').eq('team_id', teamId),
      fetch('/api/leaderboard').then(r => r.ok ? r.json() : []),
    ]);

    setTeam(teamRes.data ?? null);
    setMembers((membersRes.data ?? []) as TeamMember[]);
    setActivities(actRes.data ?? []);
    setRegistrations(regRes.data ?? []);
    setHints((hintsRes.data ?? []) as unknown as HintWithTreasure[]);
    setClaims((claimRes.data ?? []) as TreasureHuntClaim[]);
    setLeaderboard(Array.isArray(lbRes) ? lbRes : []);
    setLoading(false);
  };

  const isActivityDone = (id: string) => registrations.some(r => r.activity_id === id);

  const completedCount = activities.filter(a => isActivityDone(a.id)).length;
  const progress = activities.length > 0 ? (completedCount / activities.length) * 100 : 0;
  const claimedHintsCount = hints.filter(h => {
    const th = h.treasure_hunts;
    return th && claims.some(c => c.treasure_hunt_id === th.id);
  }).length;
  const myRank = leaderboard.find(t => t.id === user?.team_id)?.rank ?? null;

  const roleLabel = (role: string) => {
    switch (role) {
      case 'captain': return { label: 'Captain', icon: <Crown className="w-3 h-3 text-primary" /> };
      case 'vice_captain': return { label: 'Co-Captain', icon: <Shield className="w-3 h-3 text-primary/70" /> };
      default: return { label: 'Member', icon: null };
    }
  };

  return (
    <AuthGuard allowedRoles={['member']}>
      <div className="relative min-h-screen flex flex-col items-center bg-black overflow-hidden font-content pb-24">
        {/* Background */}
        <div
          className="fixed inset-0 z-0 bg-cover bg-center"
          style={{ backgroundImage: 'url("/images/jungle_hq_bg.png")', filter: 'brightness(0.15)' }}
        />
        <div className="fixed inset-0 z-10 jungle-overlay opacity-5 pointer-events-none" />

        <div className="relative z-20 w-full max-w-2xl px-4 pt-8 space-y-6">

          {/* Header */}
          <motion.header
            initial={{ opacity: 0, y: -16 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center mb-2"
          >
            <div className="inline-flex p-4 rounded-full bg-primary/10 border border-primary/20 mb-4">
              <Compass className="w-10 h-10 text-primary torch-glow" />
            </div>
            <h1 className="font-adventure text-4xl gold-engraving tracking-widest">Expedition Log</h1>
            <p className="text-muted-foreground text-xs uppercase tracking-[0.3em] font-adventure opacity-50 mt-1">
              {user?.name ?? 'Explorer'}
            </p>
          </motion.header>

          {loading ? (
            <div className="adventure-card p-16 text-center opacity-40 italic">
              <Compass className="w-8 h-8 text-primary animate-spin mx-auto mb-4" />
              Consulting the archives...
            </div>
          ) : !team ? (
            <div className="adventure-card p-12 text-center opacity-60">
              <p className="font-adventure text-lg text-primary mb-2">No Team Assigned</p>
              <p className="text-xs text-muted-foreground italic">You have not been assigned to an expedition team yet.</p>
            </div>
          ) : (
            <>
              {/* ── Team Overview ── */}
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="adventure-card p-6 border-primary/20"
              >
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <p className="text-[10px] uppercase font-adventure text-primary tracking-widest mb-1 opacity-60">Your Team</p>
                    <h2 className="font-adventure text-2xl gold-engraving">{team.name}</h2>
                    {team.slogan && (
                      <p className="text-xs italic text-foreground/40 mt-1">&quot;{team.slogan}&quot;</p>
                    )}
                  </div>
                  <div className="text-right">
                    <Trophy className="w-5 h-5 text-primary ml-auto mb-1" />
                    <p className="font-adventure text-2xl text-primary">{team.total_points}</p>
                    <p className="text-[8px] uppercase font-adventure opacity-40">Points</p>
                  </div>
                </div>

                {/* Rank badge */}
                {myRank && (
                  <div className="flex items-center gap-2 mt-3 pt-3 border-t border-primary/10">
                    <span className="text-[10px] uppercase font-adventure tracking-widest opacity-50">Leaderboard Rank</span>
                    <span className={`font-adventure text-lg ml-auto ${myRank <= 3 ? 'gold-engraving' : 'text-foreground/60'}`}>
                      #{myRank}
                    </span>
                  </div>
                )}

                {/* Progress bar */}
                <div className="mt-4 space-y-2">
                  <div className="flex justify-between text-[10px] font-adventure uppercase tracking-widest opacity-50">
                    <span>Expedition Progress</span>
                    <span>{completedCount}/{activities.length} — {Math.round(progress)}%</span>
                  </div>
                  <div className="h-3 bg-black/40 border border-primary/10 p-0.5">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${progress}%` }}
                      transition={{ duration: 0.8, delay: 0.3 }}
                      className="h-full bg-gradient-to-r from-primary/50 to-primary relative"
                    >
                      {progress > 5 && <Flame className="absolute -right-2 -top-3 w-3 h-3 text-accent torch-glow" />}
                    </motion.div>
                  </div>
                </div>
              </motion.div>

              {/* ── Team Members (collapsible) ── */}
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="adventure-card overflow-hidden"
              >
                <button
                  onClick={() => setExpanded(p => ({ ...p, crew: !p.crew }))}
                  className="flex items-center gap-3 px-5 py-4 border-b border-primary/10 w-full text-left"
                >
                  <Users className="w-4 h-4 text-primary" />
                  <span className="font-adventure text-sm tracking-widest text-primary uppercase">Expedition Crew</span>
                  <span className="ml-auto text-[10px] font-adventure opacity-40">{members.length} members</span>
                  <ChevronDown className={`w-4 h-4 text-primary/50 transition-transform ${expanded.crew ? 'rotate-180' : ''}`} />
                </button>
                {expanded.crew && (
                  <div className="divide-y divide-primary/5">
                    {members.map((m, i) => {
                      const { label, icon } = roleLabel(m.role);
                      return (
                        <motion.div
                          key={m.id}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.02 * i }}
                          className="flex items-center gap-3 px-5 py-3"
                        >
                          <div className="w-7 h-7 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
                            <span className="font-adventure text-[10px] text-primary">{m.name.charAt(0)}</span>
                          </div>
                          <span className="font-content text-sm text-foreground/80 flex-1">{m.name}</span>
                          <div className="flex items-center gap-1">
                            {icon}
                            <span className="text-[10px] font-adventure uppercase tracking-widest opacity-40">{label}</span>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                )}
              </motion.div>

              {/* ── Activity Progress (collapsible) ── */}
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="adventure-card overflow-hidden"
              >
                <button
                  onClick={() => setExpanded(p => ({ ...p, tasks: !p.tasks }))}
                  className="flex items-center gap-3 px-5 py-4 border-b border-primary/10 w-full text-left"
                >
                  <MapPin className="w-4 h-4 text-primary" />
                  <span className="font-adventure text-sm tracking-widest text-primary uppercase">Expedition Tasks</span>
                  <span className="ml-auto text-[10px] font-adventure opacity-40">{completedCount}/{activities.length}</span>
                  <ChevronDown className={`w-4 h-4 text-primary/50 transition-transform ${expanded.tasks ? 'rotate-180' : ''}`} />
                </button>
                {expanded.tasks && (
                  <div className="p-4 grid gap-3">
                    {activities.length === 0 ? (
                      <p className="text-center text-xs italic opacity-30 py-6">No activities found.</p>
                    ) : (
                      activities.map((act, i) => {
                        const done = isActivityDone(act.id);
                        return (
                          <motion.div
                            key={act.id}
                            initial={{ opacity: 0, x: -8 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.02 * i }}
                            className={`flex items-center gap-4 p-4 border-l-4 transition-all ${
                              done
                                ? 'border-l-primary bg-primary/5'
                                : 'border-l-white/5 opacity-50'
                            }`}
                          >
                            {done
                              ? <CheckCircle2 className="w-5 h-5 text-primary flex-shrink-0" />
                              : <Circle className="w-5 h-5 text-foreground/20 flex-shrink-0" />
                            }
                            <div className="flex-1 min-w-0">
                              <p className="font-adventure text-sm tracking-tight truncate">{act.name}</p>
                              <p className="text-[10px] uppercase font-adventure opacity-40 tracking-widest">
                                {act.type} · {act.max_points} pts
                              </p>
                            </div>
                            {done && (
                              <span className="text-[9px] font-adventure uppercase tracking-widest text-primary opacity-60 flex-shrink-0">
                                Completed
                              </span>
                            )}
                          </motion.div>
                        );
                      })
                    )}
                  </div>
                )}
              </motion.div>

              {/* ── Expedition Map ── */}
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
              >
                <MapPanel title="Expedition Map" subtitle="TSC Adventure Grounds" collapsible />
              </motion.div>

              {/* ── Treasure Hunt Hints (collapsible) ── */}
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.45 }}
                className="adventure-card overflow-hidden"
              >
                <button
                  onClick={() => setExpanded(p => ({ ...p, hints: !p.hints }))}
                  className="flex items-center gap-3 px-5 py-4 border-b border-primary/10 w-full text-left"
                >
                  <Gem className="w-4 h-4 text-primary" />
                  <span className="font-adventure text-sm tracking-widest text-primary uppercase">Treasure Hunt Hints</span>
                  <span className="ml-auto text-[10px] font-adventure opacity-40">
                    {claimedHintsCount}/{hints.length} claimed
                  </span>
                  <ChevronDown className={`w-4 h-4 text-primary/50 transition-transform ${expanded.hints ? 'rotate-180' : ''}`} />
                </button>
                {expanded.hints && (
                  <div className="p-4 grid gap-3">
                    {hints.length === 0 ? (
                      <div className="py-8 text-center">
                        <Lock className="w-6 h-6 text-foreground/20 mx-auto mb-2" />
                        <p className="text-xs italic opacity-30">Belum ada hint rahasia. Temukan wahana tersembunyi untuk membukanya!</p>
                      </div>
                    ) : (
                      hints.map((hint, i) => {
                        const th = hint.treasure_hunts;
                        if (!th) return null;
                        const claimed = claims.some(c => c.treasure_hunt_id === th.id);
                        return (
                          <motion.div
                            key={hint.id}
                            initial={{ opacity: 0, x: -8 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.02 * i }}
                            className={`p-4 border-l-4 transition-all ${
                              claimed
                                ? 'border-l-green-500 bg-green-500/5'
                                : 'border-l-primary bg-primary/5'
                            }`}
                          >
                            <div className="flex items-start gap-3">
                              {claimed
                                ? <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                                : <ScrollText className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                              }
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <p className="font-adventure text-sm tracking-tight truncate">{th.name}</p>
                                  <span className={`text-[8px] font-mono px-1.5 py-0.5 uppercase flex-shrink-0 ${
                                    claimed ? 'bg-green-500/20 text-green-400' : 'bg-primary/20 text-primary'
                                  }`}>
                                    {claimed ? 'CLAIMED' : 'ACTIVE'}
                                  </span>
                                </div>
                                <div className="bg-white/5 border border-primary/10 p-2.5 rounded-sm mb-1.5">
                                  <p className="text-xs text-foreground/60 italic leading-relaxed">
                                    💡 {th.hint_text}
                                  </p>
                                </div>
                                <p className="text-[10px] uppercase font-adventure opacity-40 tracking-widest">
                                  {th.points} pts · diterima {new Date(hint.received_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                                </p>
                              </div>
                            </div>
                            {claimed && (
                              <div className="flex items-center gap-2 mt-2 pt-2 border-t border-green-500/10 ml-8">
                                <Gem className="w-3 h-3 text-green-500" />
                                <span className="text-[9px] font-adventure uppercase tracking-widest text-green-400">Treasure Secured · +{th.points} pts</span>
                              </div>
                            )}
                          </motion.div>
                        );
                      })
                    )}
                  </div>
                )}
              </motion.div>

              {/* ── Leaderboard (collapsible, top 5) ── */}
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
                className="adventure-card overflow-hidden"
              >
                <button
                  onClick={() => setExpanded(p => ({ ...p, leaderboard: !p.leaderboard }))}
                  className="flex items-center gap-3 px-5 py-4 border-b border-primary/10 w-full text-left"
                >
                  <Trophy className="w-4 h-4 text-primary" />
                  <span className="font-adventure text-sm tracking-widest text-primary uppercase">Leaderboard</span>
                  {myRank && <span className="ml-auto text-[10px] font-adventure opacity-40">Rank #{myRank}</span>}
                  <ChevronDown className={`w-4 h-4 text-primary/50 transition-transform ${expanded.leaderboard ? 'rotate-180' : ''}`} />
                </button>
                {expanded.leaderboard && (
                  <div className="divide-y divide-primary/5">
                    {leaderboard.slice(0, 5).map((t, i) => {
                      const isMyTeam = t.id === user?.team_id;
                      return (
                        <div
                          key={t.id}
                          className={`flex items-center gap-4 px-5 py-3 ${isMyTeam ? 'bg-primary/10' : ''}`}
                        >
                          <span className={`font-adventure w-6 text-center ${i === 0 ? 'gold-engraving text-lg' : 'opacity-40 text-sm'}`}>
                            #{t.rank}
                          </span>
                          <span className={`font-adventure text-sm flex-1 truncate ${isMyTeam ? 'text-primary' : 'opacity-70'}`}>
                            {t.name} {isMyTeam && '← You'}
                          </span>
                          <span className="font-adventure text-sm text-primary">{t.total_points}</span>
                        </div>
                      );
                    })}
                    {myRank && myRank > 5 && (
                      <>
                        <div className="px-5 py-1 text-center text-[10px] opacity-20 font-adventure">· · ·</div>
                        {leaderboard.filter(t => t.id === user?.team_id).map(t => (
                          <div key={t.id} className="flex items-center gap-4 px-5 py-3 bg-primary/10">
                            <span className="font-adventure w-6 text-center opacity-60 text-sm">#{t.rank}</span>
                            <span className="font-adventure text-sm flex-1 text-primary truncate">{t.name} ← You</span>
                            <span className="font-adventure text-sm text-primary">{t.total_points}</span>
                          </div>
                        ))}
                      </>
                    )}
                    <Link href="/leaderboard" className="block px-5 py-3 text-center text-[10px] font-adventure uppercase tracking-widest text-primary/50 hover:text-primary transition-colors">
                      View Full Leaderboard →
                    </Link>
                  </div>
                )}
              </motion.div>
            </>
          )}
        </div>

        {/* Footer nav */}
        <nav className="fixed bottom-6 left-4 right-4 z-30 flex justify-center">
          <button
            onClick={logout}
            className="adventure-card px-8 py-3 bg-card/90 border-red-500/20 font-adventure text-xs tracking-widest uppercase text-red-400/60 hover:text-red-400 transition-colors flex items-center gap-2"
          >
            <LogOut className="w-4 h-4" /> Leave Expedition
          </button>
        </nav>
      </div>
    </AuthGuard>
  );
}
