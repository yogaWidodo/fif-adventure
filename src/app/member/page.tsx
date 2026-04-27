'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users, Trophy, MapPin, CheckCircle2, Circle, Camera,
  Compass, Flame, LogOut, Crown, Shield, Gem, ScrollText, Lock, ChevronDown, X, QrCode, Sword
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import AuthGuard from '@/components/AuthGuard';
import MapPanel from '@/components/MapPanel';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';
import { QRCodeSVG } from 'qrcode.react';
import { generateUserBarcode } from '@/lib/auth';
import { calculateBadges } from '@/lib/badges';
import ExpeditionTimer from '@/components/ExpeditionTimer';

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

interface ScoreLog {
  id: string;
  activity_id: string;
  points_awarded: number;
  created_at: string;
  participant_ids: string[] | null;
  activities: { name: string } | null;
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
  const [scoreLogs, setScoreLogs] = useState<ScoreLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [showQR, setShowQR] = useState(false);
  const [activeTab, setActiveTab] = useState<'log' | 'map' | 'crew' | 'tasks' | 'ranking'>('log');
  const [discoveredActivity, setDiscoveredActivity] = useState<any>(null);
  const [discoveredHint, setDiscoveredHint] = useState<any>(null);

  useEffect(() => {
    if (!user?.team_id) {
      setLoading(false);
      return;
    }

    fetchAll(user.team_id);

    // Real-time subscription for discovery and progress updates
    const teamId = user.team_id;
    const channel = supabase
      .channel(`team-updates-${teamId}`)
      // Watch for check-ins (updates progress bar)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'activity_registrations',
          filter: `team_id=eq.${teamId}`,
        },
        async (payload) => {
          // Refresh the whole data set to ensure everything is in sync
          fetchAll(teamId);

          if (payload.eventType === 'INSERT') {
            const newReg = payload.new as any;
            const { data: activity } = await supabase
              .from('activities')
              .select('id, name, description, how_to_play, type, max_points, difficulty_level')
              .eq('id', newReg.activity_id)
              .single();

            if (activity) {
              setDiscoveredActivity(activity);
            }
          }
        }
      )
      // Watch for scoring (updates points and moves activity to history)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'score_logs',
          filter: `team_id=eq.${teamId}`,
        },
        () => {
          fetchAll(teamId);
        }
      )
      // Watch for new hints
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'treasure_hunt_hints',
          filter: `team_id=eq.${teamId}`,
        },
        async (payload) => {
          const newHint = payload.new as any;
          const { data: treasure } = await supabase
            .from('treasure_hunts')
            .select('id, name, hint_text, points')
            .eq('id', newHint.treasure_hunt_id)
            .single();

          if (treasure) {
            setDiscoveredHint(treasure);
          }
          fetchAll(teamId);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.team_id]);

  const fetchAll = async (teamId: string) => {
    setLoading(true);

    const [teamRes, membersRes, actRes, regRes, hintsRes, claimRes, lbRes, logsRes] = await Promise.all([
      supabase.from('teams').select('id, name, slogan, total_points').eq('id', teamId).maybeSingle(),
      supabase.from('users').select('id, name, role').eq('team_id', teamId).order('role'),
      supabase.from('activities').select('id, name, type, max_points').eq('is_visible', true).order('name'),
      supabase.from('activity_registrations').select('activity_id, checked_in_at').eq('team_id', teamId),
      supabase
        .from('treasure_hunt_hints')
        .select('id, treasure_hunt_id, received_at, treasure_hunts(id, name, hint_text, points)')
        .eq('team_id', teamId)
        .order('received_at', { ascending: false }),
      supabase.from('treasure_hunt_claims').select('treasure_hunt_id').eq('team_id', teamId),
      fetch('/api/leaderboard').then(r => r.ok ? r.json() : []),
      supabase
        .from('score_logs')
        .select('id, activity_id, points_awarded, created_at, participant_ids, activities(name)')
        .eq('team_id', teamId)
        .order('created_at', { ascending: false })
    ]);

    setTeam(teamRes.data ?? null);
    setMembers((membersRes.data ?? []) as TeamMember[]);
    setActivities(actRes.data ?? []);
    setRegistrations(regRes.data ?? []);
    setHints((hintsRes.data ?? []) as unknown as HintWithTreasure[]);
    setClaims((claimRes.data ?? []) as TreasureHuntClaim[]);
    setLeaderboard(Array.isArray(lbRes) ? lbRes : []);
    setScoreLogs((logsRes.data ?? []) as any as ScoreLog[]);
    setLoading(false);
  };

  const isActivityDone = (id: string) => 
    registrations.some(r => r.activity_id === id) || 
    scoreLogs.some(log => log.activity_id === id);

  const completedCount = activities.filter(a => isActivityDone(a.id)).length;
  const progress = activities.length > 0 ? (completedCount / activities.length) * 100 : 0;
  const myRank = leaderboard.find(t => t.id === user?.team_id)?.rank ?? null;

  const myScoreLogs = scoreLogs.filter(log => log.participant_ids && user?.id && log.participant_ids.includes(user.id));
  const myTotalContribution = myScoreLogs.reduce((sum, log) => {
    const pointsPerPerson = log.participant_ids && log.participant_ids.length > 0
      ? log.points_awarded / log.participant_ids.length
      : 0;
    return sum + pointsPerPerson;
  }, 0);

  const contributionPercentage = team?.total_points && team.total_points > 0
    ? Math.round((myTotalContribution / team.total_points) * 100)
    : 0;

  const badges = calculateBadges(user?.id ?? '', scoreLogs, team?.total_points ?? 0);

  const roleLabel = (role: string) => {
    switch (role) {
      case 'captain': return { label: 'Captain', icon: <Crown className="w-3 h-3 text-primary" /> };
      case 'vice_captain': return { label: 'Co-Captain', icon: <Shield className="w-3 h-3 text-primary/70" /> };
      default: return { label: 'Member', icon: null };
    }
  };

  return (
    <AuthGuard allowedRoles={['member']}>
      <div className="fixed inset-0 flex flex-col bg-black font-content overflow-hidden">
        {/* Background - Immersive */}
        <div
          className="fixed inset-0 z-0 bg-cover bg-center"
          style={{ backgroundImage: 'url("/images/jungle_hq_bg.png")', filter: 'brightness(0.15)' }}
        />
        <div className="fixed inset-0 z-10 jungle-overlay opacity-5 pointer-events-none" />

        {/* Top Status Bar - Sticky & Compact */}
        <div className="relative z-[40] bg-black/60 backdrop-blur-md border-b border-primary/20 px-4 py-2 flex justify-between items-center pr-12">
          <div className="flex items-center gap-3">
            <button
              onClick={logout}
              className="p-2 rounded-full hover:bg-red-500/10 text-red-500/60 transition-colors"
              title="Exit Portal"
            >
              <LogOut className="w-5 h-5" />
            </button>
            <div className="h-4 w-px bg-primary/10 mx-1" />
            <ExpeditionTimer variant="inline" />
          </div>
          <div className="flex items-center gap-4">
            <button onClick={() => setShowQR(true)} className="bg-primary/20 border border-primary/30 px-2.5 py-1 rounded flex items-center gap-2 active:scale-95 transition-transform">
              <QrCode className="w-3 h-3 text-primary" />
              <span className="font-adventure text-[9px] text-primary pt-0.5 uppercase tracking-wider">My ID</span>
            </button>
            <div className="w-4 h-8" />
          </div>
        </div>

        {/* Main Content Area - Scrollable */}
        <div className="relative z-20 flex-1 overflow-y-auto pb-32 pt-4 px-4 space-y-5 custom-scrollbar" style={{ WebkitOverflowScrolling: 'touch' }}>

          {/* Welcome Section - Visual Identity */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center py-2"
          >
            <p className="text-[10px] uppercase tracking-[0.3em] font-adventure text-primary/60 mb-1">Welcome back, Explorer</p>
            <h2 className="text-2xl font-adventure gold-engraving">{user?.name}</h2>
          </motion.div>

          {loading ? (
            <div className="adventure-card p-12 text-center opacity-40 italic mt-10">
              <Compass className="w-8 h-8 text-primary animate-spin mx-auto mb-4" />
              Decoding coordinates...
            </div>
          ) : !team ? (
            <div className="adventure-card p-10 text-center opacity-60 mt-10">
              <Users className="w-10 h-10 text-primary/40 mx-auto mb-4" />
              <p className="font-adventure text-lg text-primary mb-2">No Expedition Team</p>
              <p className="text-xs text-muted-foreground italic">Report to headquarters for team assignment.</p>
            </div>
          ) : (
            <>
              {/* Tab Content Logic for Mobile Optimization */}
              {activeTab === 'log' && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="space-y-5"
                >
                  {/* Team Summary Card */}
                  <div className="adventure-card p-4 border-primary/30 bg-gradient-to-br from-primary/10 to-transparent">
                    <div className="flex justify-between items-center mb-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center font-adventure text-primary">
                          {team.name.charAt(0)}
                        </div>
                        <div>
                          <p className="text-[9px] uppercase font-adventure text-primary/70 tracking-widest leading-none">Expedition Team</p>
                          <h3 className="font-adventure text-lg leading-tight mt-1">{team.name}</h3>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="inline-flex items-center gap-1.5 bg-black/40 px-2 py-1 rounded border border-primary/10">
                          <Trophy className="w-3 h-3 text-primary" />
                          <span className="font-adventure text-xs text-primary">{team.total_points}</span>
                        </div>
                      </div>
                    </div>

                    {/* Progress Visual */}
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-[9px] font-adventure uppercase tracking-widest opacity-60">
                        <span>Progress</span>
                        <span>{completedCount}/{activities.length} Missions</span>
                      </div>
                      <div className="h-2 bg-black/60 rounded-full overflow-hidden border border-primary/10">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${progress}%` }}
                          className="h-full bg-gradient-to-r from-primary/40 via-primary to-accent shadow-[0_0_10px_rgba(var(--primary-rgb),0.5)]"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Personal Stats & Badges - Compact Grid */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="adventure-card p-3 bg-black/40">
                      <div className="flex items-center gap-2 mb-2">
                        <Flame className="w-3 h-3 text-accent" />
                        <span className="text-[8px] uppercase font-adventure text-primary/70 tracking-widest pt-0.5">Contribution</span>
                      </div>
                      <p className="font-adventure text-lg leading-none">{Math.round(myTotalContribution)} <span className="text-[10px] opacity-40">Pts</span></p>
                    </div>
                    <div className="adventure-card p-3 bg-black/40">
                      <div className="flex items-center gap-2 mb-2">
                        <Gem className="w-3 h-3 text-primary" />
                        <span className="text-[8px] uppercase font-adventure text-primary/70 tracking-widest pt-0.5">Share</span>
                      </div>
                      <p className="font-adventure text-lg leading-none">{contributionPercentage}% <span className="text-[10px] opacity-40">Total</span></p>
                    </div>
                  </div>

                  {/* My Journey Timeline - Streamlined for Mobile */}
                  <div className="adventure-card overflow-hidden">
                    <div className="px-4 py-3 border-b border-primary/10 flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <MapPin className="w-3.5 h-3.5 text-primary" />
                        <span className="font-adventure text-[10px] tracking-widest text-primary uppercase pt-0.5">My Recent Discoveries</span>
                      </div>
                      <span className="text-[9px] font-adventure opacity-30 uppercase">{myScoreLogs.length} Records</span>
                    </div>
                    <div className="p-4 space-y-4 max-h-[240px] overflow-y-auto">
                      {myScoreLogs.length === 0 ? (
                        <p className="text-[11px] text-foreground/40 italic text-center py-4">Belum ada aktivitas tercatat.</p>
                      ) : (
                        <div className="relative pl-3 border-l border-primary/20 space-y-4">
                          {myScoreLogs.slice(0, 5).map((log) => (
                            <div key={log.id} className="relative">
                              <div className="absolute -left-[18.5px] top-1.5 w-2.5 h-2.5 bg-black border border-primary rounded-full" />
                              <div className="flex justify-between items-center">
                                <p className="font-adventure text-xs text-foreground/90 truncate mr-2">{log.activities?.name}</p>
                                <span className="text-[10px] font-adventure text-primary/80 flex-shrink-0">
                                  +{Math.round(log.points_awarded / (log.participant_ids?.length || 1))}
                                </span>
                              </div>
                              <p className="text-[8px] uppercase font-adventure text-white/20 mt-0.5">
                                {new Date(log.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Achievements - Horizontal Scroll */}
                  {badges.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-[9px] uppercase font-adventure text-primary/50 tracking-[0.2em] px-1">Badges Earned</p>
                      <div className="flex gap-3 overflow-x-auto pb-4 -mx-4 px-4 custom-scrollbar no-scrollbar">
                        {badges.map(badge => (
                          <div key={badge.id} className="adventure-card min-w-[100px] max-w-[100px] p-2 flex flex-col items-center text-center space-y-1 bg-primary/5">
                            <div className="w-7 h-7 rounded-full bg-black/40 border border-primary/20 flex items-center justify-center text-primary shrink-0">
                              {badge.icon}
                            </div>
                            <div className="flex-1 flex flex-col justify-center overflow-hidden">
                              <p className="font-adventure text-[8px] text-primary leading-tight truncate w-full">{badge.name}</p>
                              <p className="text-[7px] text-white/40 leading-tight mt-0.5 line-clamp-2 w-full">{badge.description}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </motion.div>
              )}

              {activeTab === 'tasks' && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
                  <div className="adventure-card p-4 bg-primary/5">
                    <h3 className="font-adventure text-sm text-primary mb-3 flex items-center gap-2">
                      <MapPin className="w-4 h-4" /> Checklist Wahana
                    </h3>
                    <div className="space-y-2">
                      {activities.map((act) => {
                        const done = isActivityDone(act.id);
                        return (
                          <div key={act.id} className={`flex items-center gap-3 p-3 rounded border ${done ? 'border-primary/40 bg-primary/10 opacity-100' : 'border-white/5 bg-black/20 opacity-50'}`}>
                            {done ? <CheckCircle2 className="w-4 h-4 text-primary" /> : <Circle className="w-4 h-4 text-white/20" />}
                            <div className="flex-1 min-w-0">
                              <p className="font-adventure text-xs truncate">{act.name}</p>
                              <p className="text-[9px] uppercase opacity-40 font-adventure">{act.max_points} Pts • {act.type}</p>
                            </div>
                            {done && <span className="text-[8px] font-adventure text-primary uppercase">Done</span>}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Treasure Hints in Tasks Tab */}
                  <div className="adventure-card p-4">
                    <h3 className="font-adventure text-sm text-primary mb-3 flex items-center gap-2">
                      <Gem className="w-4 h-4" /> Hidden Treasures
                    </h3>
                    {hints.length === 0 ? (
                      <div className="py-6 text-center">
                        <Lock className="w-5 h-5 text-white/10 mx-auto mb-2" />
                        <p className="text-[10px] italic opacity-30">Scan wahana rahasia untuk membuka hint!</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {hints.map((hint) => {
                          const th = hint.treasure_hunts;
                          const claimed = th ? claims.some(c => c.treasure_hunt_id === th.id) : false;
                          return (
                            <div key={hint.id} className={`p-3 rounded border border-dashed ${claimed ? 'border-green-500/30 bg-green-500/5' : 'border-primary/30 bg-black/20'}`}>
                              <div className="flex justify-between items-start mb-2">
                                <p className="font-adventure text-xs text-primary">{th?.name}</p>
                                {claimed && <CheckCircle2 className="w-3 h-3 text-green-500" />}
                              </div>
                              <p className="text-[11px] text-white/60 italic leading-relaxed mb-2">"{th?.hint_text}"</p>
                              <div className="flex justify-between items-center text-[8px] font-adventure opacity-40 uppercase">
                                <span>{th?.points} Pts</span>
                                <span>{new Date(hint.received_at).toLocaleDateString()}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </motion.div>
              )}

              {activeTab === 'crew' && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
                  <div className="adventure-card">
                    <div className="p-4 border-b border-primary/10 flex items-center gap-2">
                      <Users className="w-4 h-4 text-primary" />
                      <h3 className="font-adventure text-sm text-primary pt-0.5">Expedition Crew</h3>
                    </div>
                    <div className="divide-y divide-white/5">
                      {members.map((m) => {
                        const { label, icon } = roleLabel(m.role);
                        return (
                          <div key={m.id} className="flex items-center gap-3 p-4">
                            <div className="w-8 h-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center font-adventure text-xs text-primary">
                              {m.name.charAt(0)}
                            </div>
                            <div className="flex-1">
                              <p className="text-xs font-content text-white/90">{m.name}</p>
                              <div className="flex items-center gap-1 opacity-40">
                                {icon}
                                <span className="text-[9px] font-adventure uppercase tracking-widest pt-0.5">{label}</span>
                              </div>
                            </div>
                            {m.id === user?.id && <span className="bg-primary/20 text-primary text-[8px] font-adventure px-1.5 py-0.5 rounded uppercase">You</span>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </motion.div>
              )}

              {activeTab === 'ranking' && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-4 pb-20"
                >
                  <div className="adventure-card overflow-hidden">
                    <div className="p-4 bg-primary/10 border-b border-primary/20 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Trophy className="w-5 h-5 text-primary torch-glow" />
                        <h3 className="font-adventure text-lg text-primary pt-1">Leaderboard</h3>
                      </div>
                      <span className="text-[10px] font-adventure text-primary/40 uppercase">Top Expeditions</span>
                    </div>
                    <div className="divide-y divide-primary/5">
                      {leaderboard.slice(0, 10).map((t) => (
                        <div key={t.id} className={`flex items-center gap-4 p-4 transition-colors ${t.id === user?.team_id ? 'bg-primary/10 border-l-2 border-primary' : 'hover:bg-white/5'}`}>
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center font-adventure text-sm ${t.rank === 1 ? 'bg-yellow-500/20 text-yellow-500 border border-yellow-500/40' :
                              t.rank === 2 ? 'bg-gray-400/20 text-gray-400 border border-gray-400/40' :
                                t.rank === 3 ? 'bg-amber-700/20 text-amber-700 border border-amber-700/40' :
                                  'text-foreground/40'
                            }`}>
                            #{t.rank}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-adventure text-sm truncate uppercase tracking-tight">{t.name}</p>
                            {t.id === user?.team_id && <p className="text-[8px] uppercase font-adventure text-primary/60 tracking-widest mt-0.5">Your Expedition</p>}
                          </div>
                          <div className="text-right">
                            <p className="font-adventure text-sm text-primary">{t.total_points}</p>
                            <p className="text-[7px] uppercase font-adventure opacity-30">Prestige</p>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="p-4 bg-black/40 text-center">
                      <Link href="/leaderboard">
                        <button className="text-[9px] font-adventure text-primary/60 uppercase tracking-[0.2em] hover:text-primary transition-colors">View All Teams →</button>
                      </Link>
                    </div>
                  </div>
                </motion.div>
              )}

              {activeTab === 'map' && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="h-[calc(100vh-220px)] rounded-lg overflow-hidden border border-primary/30 shadow-2xl">
                  <MapPanel title="Expedition Map" subtitle="TSC Adventure Grounds" />
                </motion.div>
              )}
            </>
          )}
        </div>

        {/* Bottom Navigation - Fixed & Ergonomic */}
        <div className="relative z-[50] mt-auto">
          {/* Main Bottom Nav */}
          <nav className="bg-black/90 backdrop-blur-2xl border-t border-primary/20 px-4 py-2 pb-8 flex justify-between items-center safe-area-bottom">
            <div className="flex items-center gap-4 flex-1 justify-around max-w-[40%]">
              <button
                onClick={() => setActiveTab('log')}
                className={`flex flex-col items-center gap-1 transition-all ${activeTab === 'log' ? 'text-primary' : 'text-white/40'}`}
              >
                <Compass className={`w-5 h-5 ${activeTab === 'log' ? 'torch-glow' : ''}`} />
                <span className="text-[8px] uppercase font-adventure tracking-widest pt-1">Log</span>
              </button>
              <button
                onClick={() => setActiveTab('tasks')}
                className={`flex flex-col items-center gap-1 transition-all ${activeTab === 'tasks' ? 'text-primary' : 'text-white/40'}`}
              >
                <MapPin className="w-5 h-5" />
                <span className="text-[8px] uppercase font-adventure tracking-widest pt-1">Tasks</span>
              </button>
            </div>

            {/* Central Scan Trigger */}
            <div className="relative -mt-10 mx-4">
              <Link href="/captain/scan">
                <button
                  className="w-14 h-14 rounded-full bg-gradient-to-br from-primary to-accent p-0.5 shadow-[0_0_20px_rgba(var(--primary-rgb),0.5)] active:scale-95 transition-transform"
                >
                  <div className="w-full h-full rounded-full bg-black flex items-center justify-center">
                    <Camera className="w-6 h-6 text-primary" />
                  </div>
                </button>
              </Link>
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-16 rounded-full border border-primary/20 animate-ping opacity-20 pointer-events-none" />
            </div>

            <div className="flex items-center gap-4 flex-1 justify-around max-w-[40%]">
              <button
                onClick={() => setActiveTab('crew')}
                className={`flex flex-col items-center gap-1 transition-all ${activeTab === 'crew' ? 'text-primary' : 'text-white/40'}`}
              >
                <Users className="w-5 h-5" />
                <span className="text-[8px] uppercase font-adventure tracking-widest pt-1">Crew</span>
              </button>
              <button
                onClick={() => setActiveTab('ranking')}
                className={`flex flex-col items-center gap-1 transition-all ${activeTab === 'ranking' ? 'text-primary' : 'text-white/40'}`}
              >
                <Trophy className="w-5 h-5" />
                <span className="text-[8px] uppercase font-adventure tracking-widest pt-1">Rank</span>
              </button>
            </div>

            {/* Top Team Info - Filling space next to Crew/Rank */}
            {leaderboard.length > 0 && leaderboard[0].id !== user?.team_id && (
              <div className="absolute right-4 -top-10 px-3 py-1.5 bg-black/60 backdrop-blur-md border border-primary/10 rounded-lg flex flex-col items-end pointer-events-none">
                <p className="text-[6px] uppercase font-adventure text-primary/40 tracking-[0.2em] leading-none mb-1">Top Expedition</p>
                <div className="flex items-center gap-2">
                  <span className="text-[9px] font-adventure text-[#f4e4bc] gold-engraving truncate max-w-[80px]">{leaderboard[0].name}</span>
                  <div className="h-2 w-px bg-primary/20" />
                  <span className="text-[9px] font-adventure text-primary">{leaderboard[0].total_points}</span>
                </div>
              </div>
            )}
          </nav>
        </div>

        {/* QR Code Modal - Optimized for Mobile Sheet Feel */}
        <AnimatePresence> 
          {showQR && user?.team_id && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-sm flex flex-col items-center justify-end md:justify-center p-4"
              onClick={() => setShowQR(false)}
            >
              <motion.div
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                exit={{ y: "100%" }}
                transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                className="adventure-card p-6 md:p-8 max-w-sm w-full text-center border-primary/30 relative mb-4"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="w-12 h-1 bg-primary/20 rounded-full mx-auto mb-6 md:hidden" />
                <button
                  onClick={() => setShowQR(false)}
                  className="absolute top-4 right-4 text-white/20 p-1"
                >
                  <X className="w-5 h-5" />
                </button>

                <div className="relative z-10">
                  <p className="text-[9px] uppercase font-adventure tracking-[0.3em] text-primary/60 mb-2">Identification Pass</p>
                  <h2 className="font-adventure text-2xl gold-engraving mb-1">{user.name}</h2>
                  <p className="text-[10px] uppercase tracking-widest text-primary/70 mb-6 font-adventure">
                    {team?.name}
                  </p>

                  <div className="bg-white p-4 rounded-xl inline-block mb-6 shadow-2xl">
                    <QRCodeSVG
                      value={user.id ? generateUserBarcode(user.id) : ''}
                      size={200}
                      level="M"
                    />
                  </div>

                  <div className="bg-primary/5 border border-primary/10 p-3 rounded-lg text-left">
                    <p className="text-[8px] uppercase font-adventure text-primary/50 tracking-widest mb-1">Pass Instructions</p>
                    <p className="text-[10px] text-white/60 italic leading-relaxed">
                      Tunjukkan barcode ini kepada Station Officer (LO) di lokasi wahana untuk mencatat kehadiran tim Anda.
                    </p>
                  </div>
                </div>
              </motion.div>
              <button
                onClick={() => setShowQR(false)}
                className="mb-8 text-[10px] font-adventure text-primary uppercase tracking-widest opacity-40 pt-2"
              >
                Close Pass
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Discovery Modals */}
        <AnimatePresence>
          {discoveredHint && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[110] bg-black/95 flex items-center justify-center p-6"
            >
              <motion.div
                initial={{ scale: 0.8, opacity: 0, rotateY: 30 }}
                animate={{ scale: 1, opacity: 1, rotateY: 0 }}
                exit={{ scale: 0.8, opacity: 0 }}
                className="adventure-card w-full max-w-md overflow-hidden border-primary/40 shadow-[0_0_60px_rgba(var(--primary-rgb),0.3)]"
              >
                <div className="relative h-40 bg-primary/20 flex flex-col items-center justify-center">
                  <div className="absolute inset-0 bg-[url('/images/expedition_map_bg.png')] bg-cover bg-center opacity-30 animate-pulse" />
                  <div className="relative z-10 bg-primary/20 p-4 rounded-full border border-primary/40 mb-3">
                    <Gem className="w-8 h-8 text-primary torch-glow" />
                  </div>
                  <h2 className="relative z-10 font-adventure text-2xl gold-engraving tracking-widest text-center px-6">
                    Secret Hint Unlocked!
                  </h2>
                </div>
                <div className="p-8 text-center space-y-6">
                  <div className="space-y-2">
                    <p className="text-[10px] uppercase font-adventure text-primary tracking-[0.4em] opacity-60">{discoveredHint.name}</p>
                    <div className="bg-[#2b1d0e]/20 border border-[#8b4513]/20 p-5 rounded-sm">
                      <p className="text-sm font-content text-foreground/90 italic leading-relaxed">
                        "💡 {discoveredHint.hint_text}"
                      </p>
                    </div>
                  </div>
                </div>
                <div className="p-6 bg-primary/5 border-t border-primary/10">
                  <button onClick={() => setDiscoveredHint(null)} className="w-full py-4 font-adventure text-sm uppercase tracking-[0.4em] bg-primary text-primary-foreground hover:bg-primary/90 transition-all shadow-[0_10px_20px_rgba(0,0,0,0.4)] active:scale-95">Secure Discovery</button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {discoveredActivity && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center p-6"
            >
              <motion.div
                initial={{ scale: 0.8, opacity: 0, rotateX: 30 }}
                animate={{ scale: 1, opacity: 1, rotateX: 0 }}
                exit={{ scale: 0.8, opacity: 0 }}
                className="adventure-card w-full max-w-lg overflow-hidden border-primary/40 shadow-[0_0_60px_rgba(var(--primary-rgb),0.3)]"
              >
                <div className="relative h-48 bg-primary/20 flex flex-col items-center justify-center">
                  <div className="absolute inset-0 bg-[url('/images/expedition_map_bg.png')] bg-cover bg-center opacity-30 animate-pulse" />
                  <div className="relative z-10 bg-primary/20 p-5 rounded-full border border-primary/40 mb-4">
                    {discoveredActivity.type === 'wahana' ? (
                      <MapPin className="w-10 h-10 text-primary torch-glow" />
                    ) : (
                      <Sword className="w-10 h-10 text-primary torch-glow" />
                    )}
                  </div>
                  <h2 className="relative z-10 font-adventure text-3xl md:text-4xl gold-engraving tracking-widest text-center px-6">
                    {discoveredActivity.name}
                  </h2>
                </div>
                <div className="p-8 text-center space-y-6">
                  <div className="space-y-2">
                    <p className="text-[10px] uppercase font-adventure text-primary tracking-[0.4em] opacity-60">Discovery Unlocked</p>
                    <p className="text-sm font-content text-foreground/80 italic leading-relaxed">
                      "{discoveredActivity.description || 'A new path has been revealed.'}"
                    </p>
                  </div>
                </div>
                <div className="p-6 bg-primary/5 border-t border-primary/10">
                  <button onClick={() => setDiscoveredActivity(null)} className="w-full py-4 font-adventure text-sm uppercase tracking-[0.4em] bg-primary text-primary-foreground hover:bg-primary/90 transition-all shadow-[0_10px_20px_rgba(0,0,0,0.4)] active:scale-95">Accept Mission</button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </AuthGuard>
  );
}
