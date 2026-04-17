'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Users, Trophy, MapPin, CheckCircle2, Circle,
  Compass, Flame, LogOut, Map, Crown, Shield, Gem,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import AuthGuard from '@/components/AuthGuard';
import MapPanel from '@/components/MapPanel';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';

interface TeamMember {
  id: string;
  nama: string;
  role: string;
}

interface Location {
  id: string;
  name: string;
  type: string;
  points: number;
  is_active: boolean;
  hint?: string | null;
}

interface Scan {
  location_id: string;
  scanned_at: string;
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
  const [locations, setLocations] = useState<Location[]>([]);
  const [scans, setScans] = useState<Scan[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.team_id) {
      setLoading(false);
      return;
    }
    fetchAll(user.team_id);
  }, [user]);

  const fetchAll = async (teamId: string) => {
    setLoading(true);

    const [teamRes, membersRes, locRes, scanRes, lbRes] = await Promise.all([
      // Team info
      supabase.from('teams').select('id, name, slogan, total_points').eq('id', teamId).maybeSingle(),
      // Team members (all users with same team_id)
      supabase.from('users').select('id, nama, role').eq('team_id', teamId).order('role'),
      // All active locations for this event (wahana + challenge + treasure)
      supabase.from('locations').select('id, name, type, points, is_active, hint').eq('is_active', true).order('type'),
      // Scans for this team
      supabase.from('scans').select('location_id, scanned_at').eq('team_id', teamId),
      // Leaderboard
      fetch('/api/leaderboard').then(r => r.ok ? r.json() : []),
    ]);

    setTeam(teamRes.data ?? null);
    setMembers(membersRes.data ?? []);
    setLocations(locRes.data ?? []);
    setScans(scanRes.data ?? []);
    setLeaderboard(Array.isArray(lbRes) ? lbRes : []);
    setLoading(false);
  };

  const isVisited = (locId: string) => scans.some(s => s.location_id === locId);
  const wahanaLocations = locations.filter(l => l.type === 'wahana' || l.type === 'challenge');
  const treasureLocations = locations.filter(l => l.type === 'treasure');
  const visitedCount = wahanaLocations.filter(l => isVisited(l.id)).length;
  const claimedTreasures = treasureLocations.filter(l => isVisited(l.id)).length;
  const progress = wahanaLocations.length > 0 ? (visitedCount / wahanaLocations.length) * 100 : 0;
  const myRank = leaderboard.find(t => t.id === user?.team_id)?.rank ?? null;

  const roleLabel = (role: string) => {
    switch (role) {
      case 'kaptain': return { label: 'Captain', icon: <Crown className="w-3 h-3 text-primary" /> };
      case 'cocaptain': return { label: 'Co-Captain', icon: <Shield className="w-3 h-3 text-primary/70" /> };
      default: return { label: 'Member', icon: null };
    }
  };

  return (
    <AuthGuard allowedRoles={['member']}>
      <div className="relative min-h-screen flex flex-col items-center bg-black overflow-hidden font-content pb-24">
        {/* Background */}
        <div
          className="fixed inset-0 z-0 bg-cover bg-center"
          style={{ backgroundImage: 'url("/images/jungle_hq_bg.png")', filter: 'brightness(0.15) blur(2px)' }}
        />
        <div className="fixed inset-0 z-10 jungle-overlay opacity-5 pointer-events-none" />

        <div className="relative z-20 w-full max-w-2xl px-4 pt-8 space-y-6">

          {/* Header */}
          <motion.header
            initial={{ opacity: 0, y: -16 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center mb-2"
          >
            <div className="inline-flex p-4 rounded-full bg-primary/10 border border-primary/20 backdrop-blur-md mb-4">
              <Compass className="w-10 h-10 text-primary torch-glow" />
            </div>
            <h1 className="font-adventure text-4xl gold-engraving tracking-widest">Expedition Log</h1>
            <p className="text-muted-foreground text-xs uppercase tracking-[0.3em] font-adventure opacity-50 mt-1">
              {user?.nama ?? 'Explorer'}
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
                    <span>Wahana Progress</span>
                    <span>{visitedCount}/{wahanaLocations.length} — {Math.round(progress)}%</span>
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

              {/* ── Team Members ── */}
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="adventure-card overflow-hidden"
              >
                <div className="flex items-center gap-3 px-5 py-4 border-b border-primary/10">
                  <Users className="w-4 h-4 text-primary" />
                  <span className="font-adventure text-sm tracking-widest text-primary uppercase">Expedition Crew</span>
                  <span className="ml-auto text-[10px] font-adventure opacity-40">{members.length} members</span>
                </div>
                <div className="divide-y divide-primary/5">
                  {members.map((m, i) => {
                    const { label, icon } = roleLabel(m.role);
                    return (
                      <motion.div
                        key={m.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.2 + i * 0.04 }}
                        className="flex items-center gap-3 px-5 py-3"
                      >
                        <div className="w-7 h-7 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
                          <span className="font-adventure text-[10px] text-primary">{m.nama.charAt(0)}</span>
                        </div>
                        <span className="font-content text-sm text-foreground/80 flex-1">{m.nama}</span>
                        <div className="flex items-center gap-1">
                          {icon}
                          <span className="text-[10px] font-adventure uppercase tracking-widest opacity-40">{label}</span>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </motion.div>

              {/* ── Wahana Progress ── */}
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="adventure-card overflow-hidden"
              >
                <div className="flex items-center gap-3 px-5 py-4 border-b border-primary/10">
                  <MapPin className="w-4 h-4 text-primary" />
                  <span className="font-adventure text-sm tracking-widest text-primary uppercase">Wahana Status</span>
                </div>
                <div className="p-4 grid gap-3">
                  {wahanaLocations.length === 0 ? (
                    <p className="text-center text-xs italic opacity-30 py-6">No locations found.</p>
                  ) : (
                    wahanaLocations.map((loc, i) => {
                      const visited = isVisited(loc.id);
                      return (
                        <motion.div
                          key={loc.id}
                          initial={{ opacity: 0, x: -8 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.3 + i * 0.04 }}
                          className={`flex items-center gap-4 p-4 border-l-4 transition-all ${
                            visited
                              ? 'border-l-primary bg-primary/5'
                              : 'border-l-white/5 opacity-50'
                          }`}
                        >
                          {visited
                            ? <CheckCircle2 className="w-5 h-5 text-primary flex-shrink-0" />
                            : <Circle className="w-5 h-5 text-foreground/20 flex-shrink-0" />
                          }
                          <div className="flex-1 min-w-0">
                            <p className="font-adventure text-sm tracking-tight truncate">{loc.name}</p>
                            <p className="text-[10px] uppercase font-adventure opacity-40 tracking-widest">
                              {loc.type} · {loc.points} pts
                            </p>
                          </div>
                          {visited && (
                            <span className="text-[9px] font-adventure uppercase tracking-widest text-primary opacity-60 flex-shrink-0">
                              Visited
                            </span>
                          )}
                        </motion.div>
                      );
                    })
                  )}
                </div>
              </motion.div>

              {/* ── Expedition Map ── */}
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
              >
                <MapPanel title="Expedition Map" subtitle="TSC Adventure Grounds" collapsible />
              </motion.div>

              {/* ── Treasure Hunt ── */}
              {treasureLocations.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.45 }}
                  className="adventure-card overflow-hidden"
                >
                  <div className="flex items-center gap-3 px-5 py-4 border-b border-primary/10">
                    <Gem className="w-4 h-4 text-primary" />
                    <span className="font-adventure text-sm tracking-widest text-primary uppercase">Treasure Hunt</span>
                    <span className="ml-auto text-[10px] font-adventure opacity-40">
                      {claimedTreasures}/{treasureLocations.length} claimed
                    </span>
                  </div>
                  <div className="p-4 grid gap-3">
                    {treasureLocations.map((loc, i) => {
                      const claimed = isVisited(loc.id);
                      return (
                        <motion.div
                          key={loc.id}
                          initial={{ opacity: 0, x: -8 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.45 + i * 0.04 }}
                          className={`flex items-start gap-4 p-4 border-l-4 transition-all ${
                            claimed
                              ? 'border-l-primary bg-primary/5'
                              : 'border-l-white/5 opacity-60'
                          }`}
                        >
                          {claimed
                            ? <CheckCircle2 className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                            : <Gem className="w-5 h-5 text-foreground/20 flex-shrink-0 mt-0.5" />
                          }
                          <div className="flex-1 min-w-0">
                            <p className="font-adventure text-sm tracking-tight truncate">{loc.name}</p>
                            {loc.hint && !claimed && (
                              <p className="text-[10px] italic text-primary/50 mt-0.5">Hint: {loc.hint}</p>
                            )}
                            <p className="text-[10px] uppercase font-adventure opacity-40 tracking-widest mt-0.5">
                              {loc.points} pts
                            </p>
                          </div>
                          {claimed && (
                            <span className="text-[9px] font-adventure uppercase tracking-widest text-primary opacity-60 flex-shrink-0">
                              Claimed
                            </span>
                          )}
                        </motion.div>
                      );
                    })}
                  </div>
                </motion.div>
              )}

              {/* ── Leaderboard (top 5) ── */}
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
                className="adventure-card overflow-hidden"
              >
                <div className="flex items-center gap-3 px-5 py-4 border-b border-primary/10">
                  <Trophy className="w-4 h-4 text-primary" />
                  <span className="font-adventure text-sm tracking-widest text-primary uppercase">Top Expeditions</span>
                  <Link href="/leaderboard" className="ml-auto text-[10px] font-adventure uppercase tracking-widest text-primary/50 hover:text-primary transition-colors">
                    View All →
                  </Link>
                </div>
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
                  {/* Show my team if outside top 5 */}
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
                </div>
              </motion.div>
            </>
          )}
        </div>

        {/* Footer nav */}
        <nav className="fixed bottom-6 left-4 right-4 z-30 flex justify-center gap-4">
          <Link href="/leaderboard">
            <button className="adventure-card px-6 py-3 bg-card/60 backdrop-blur-xl border-primary/20 font-adventure text-xs tracking-widest uppercase hover:text-primary transition-colors flex items-center gap-2">
              <Map className="w-4 h-4" /> Leaderboard
            </button>
          </Link>
          <button
            onClick={logout}
            className="adventure-card px-6 py-3 bg-card/60 backdrop-blur-xl border-red-500/20 font-adventure text-xs tracking-widest uppercase text-red-400/60 hover:text-red-400 transition-colors flex items-center gap-2"
          >
            <LogOut className="w-4 h-4" /> Leave
          </button>
        </nav>
      </div>
    </AuthGuard>
  );
}
