'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users, Edit2, UserCheck,
  Loader2, Compass,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { generateTeamBarcode } from '@/lib/auth';
import EventSelector from '@/components/admin/EventSelector';
import { calculateBadges, ScoreLog } from '@/lib/badges';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TeamWithDetails {
  id: string;
  name: string;
  slogan?: string;
  total_points: number;
  captain_id?: string;
  created_at: string;
  member_count?: number;
  captain_name?: string;
}

interface Member {
  id: string;
  name: string;
  npk: string;
  role: string;
  birth_date: string | null;
  team_id?: string;
}

// ─── Shared modal primitives (inline, no external dep) ───────────────────────

function AdventureModal({
  show,
  onClose,
  title,
  children,
}: {
  show: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  if (!show) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/90"
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        className="relative w-full max-w-lg bg-[#f5e6c8] text-[#2b1d0e] p-8 max-h-[90vh] overflow-y-auto shadow-2xl"
      >
        <h3 className="font-adventure text-2xl mb-6 text-[#2b1d0e]">{title}</h3>
        {children}
      </motion.div>
    </div>
  );
}

function ModalField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-[10px] uppercase tracking-widest font-adventure text-[#2b1d0e]/60 mb-2">{label}</label>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-transparent border-b-2 border-[#2b1d0e]/20 p-3 font-adventure text-[#2b1d0e] focus:outline-none focus:border-[#8b4513] transition-colors"
      />
    </div>
  );
}

function ModalSubmit({
  label,
  onClick,
  disabled,
  loading,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full flex items-center justify-center gap-2 bg-[#8b4513] hover:bg-[#6b3410] text-[#f5e6c8] font-adventure uppercase tracking-widest py-3 transition-all disabled:opacity-40"
    >
      {loading && <Loader2 className="w-4 h-4 animate-spin" />}
      {label}
    </button>
  );
}

// ─── MemberCard ───────────────────────────────────────────────────────────────

function MemberCard({
  member,
  teamId,
  onAssign,
  teamScoreLogs,
  teamTotalPoints,
}: {
  member: Member;
  teamId: string;
  onAssign: (teamId: string, userId: string, role: 'captain' | 'vice_captain') => void;
  teamScoreLogs: ScoreLog[];
  teamTotalPoints: number;
}) {
  const [open, setOpen] = useState(false);

  const badges = calculateBadges(member.id, teamScoreLogs, teamTotalPoints);

  const roleStyle: Record<string, string> = {
    captain: 'bg-primary/20 text-primary border-primary/30',
    vice_captain: 'bg-amber-900/30 text-amber-400 border-amber-500/30',
    member: 'bg-foreground/5 text-foreground/40 border-foreground/15',
    lo: 'bg-blue-900/30 text-blue-400 border-blue-500/30',
    admin: 'bg-red-900/30 text-red-400 border-red-500/30',
  };

  const roleAbbr: Record<string, string> = {
    captain: 'KPT',
    vice_captain: 'VC',
    member: 'MBR',
    lo: 'LO',
    admin: 'ADM',
  };

  return (
    <div className="border border-primary/10 bg-black/20 hover:bg-black/30 transition-colors">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-3 py-2 text-left"
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className={`shrink-0 text-[8px] font-adventure uppercase tracking-wider px-1.5 py-0.5 border ${roleStyle[member.role] ?? roleStyle.member}`}>
            {roleAbbr[member.role] ?? member.role.slice(0, 3).toUpperCase()}
          </span>
          <span className="text-[11px] text-foreground/80 truncate">{member.name}</span>
        </div>
        <div className="flex items-center gap-1 ml-auto shrink-0">
          {badges.map(badge => (
            <div key={badge.id} title={`${badge.name}: ${badge.description}`} className="opacity-80 scale-75 origin-right">
              {badge.icon}
            </div>
          ))}
          {member.birth_date && (
            <span className="text-[9px] font-mono text-foreground/30 ml-1">#{member.birth_date}</span>
          )}
        </div>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden border-t border-primary/10"
          >
            <div className="px-3 py-2 space-y-1.5 bg-black/20">
              <p className="text-[9px] font-mono text-foreground/30">{member.npk}</p>
              {member.role !== 'captain' && (
                <button
                  onClick={() => { onAssign(teamId, member.id, 'captain'); setOpen(false); }}
                  className="w-full text-left text-[9px] font-adventure uppercase tracking-wider text-primary/60 hover:text-primary transition-colors flex items-center gap-1"
                >
                  <UserCheck className="w-3 h-3" />
                  Set as Captain
                </button>
              )}

            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function TeamsTab() {
  const [teams, setTeams] = useState<TeamWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState<TeamWithDetails | null>(null);
  const [newName, setNewName] = useState('');
  const [newSlogan, setNewSlogan] = useState('');
  const [saving, setSaving] = useState(false);
  const [membersMap, setMembersMap] = useState<Record<string, Member[]>>({});
  const [scoreLogsMap, setScoreLogsMap] = useState<Record<string, ScoreLog[]>>({});

  const [editingTeam, setEditingTeam] = useState<TeamWithDetails | null>(null);
  const [editName, setEditName] = useState('');
  const [editSlogan, setEditSlogan] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  const fetchTeams = useCallback(async () => {
    setLoading(true);
    const { data: teamsData } = await supabase
      .from('teams')
      .select('*')
      .order('total_points', { ascending: false });

    if (!teamsData) { setLoading(false); return; }

    const enriched: TeamWithDetails[] = await Promise.all(
      teamsData.map(async (team) => {
        const { count } = await supabase
          .from('users')
          .select('*', { count: 'exact', head: true })
          .eq('team_id', team.id);

        let captainName: string | undefined;
        if (team.captain_id) {
          const { data: cap } = await supabase
            .from('users')
            .select('name')
            .eq('id', team.captain_id)
            .single();
          captainName = cap?.name;
        }

        return { ...team, member_count: count || 0, captain_name: captainName };
      })
    );

    setTeams(enriched);
    setLoading(false);
  }, []);

  useEffect(() => { fetchTeams(); }, [fetchTeams]);

  // Fetch all members for all teams in one query
  const fetchAllMembers = useCallback(async (teamList: TeamWithDetails[]) => {
    if (teamList.length === 0) return;
    const { data } = await supabase
      .from('users')
      .select('id, name, npk, role, birth_date, team_id')
      .in('team_id', teamList.map(t => t.id));
    if (!data) return;
    const map: Record<string, Member[]> = {};
    for (const m of data) {
      if (!m.team_id) continue;
      if (!map[m.team_id]) map[m.team_id] = [];
      map[m.team_id].push(m as Member);
    }
    setMembersMap(map);
  }, []);

  const fetchAllScoreLogs = useCallback(async (teamList: TeamWithDetails[]) => {
    if (teamList.length === 0) return;
    const { data } = await supabase
      .from('score_logs')
      .select('id, team_id, activity_id, points_awarded, created_at, participant_ids')
      .in('team_id', teamList.map(t => t.id));
    
    if (!data) return;
    const map: Record<string, ScoreLog[]> = {};
    for (const log of data) {
      if (!log.team_id) continue;
      if (!map[log.team_id]) map[log.team_id] = [];
      map[log.team_id].push(log as ScoreLog);
    }
    setScoreLogsMap(map);
  }, []);

  useEffect(() => {
    if (teams.length > 0) {
      fetchAllMembers(teams);
      fetchAllScoreLogs(teams);
    }
  }, [teams, fetchAllMembers, fetchAllScoreLogs]);

  const handleCreate = async () => {
    if (!newName) return;
    setSaving(true);
    const payload: Record<string, unknown> = { name: newName };
    if (newSlogan) payload.slogan = newSlogan;

    // Insert and retrieve the new team's id so we can generate its barcode
    const { data: newTeam, error } = await supabase
      .from('teams')
      .insert(payload)
      .select('id')
      .single();

    if (!error && newTeam) {
      setShowModal(false);
      setNewName('');
      setNewSlogan('');
      fetchTeams();
    }
    setSaving(false);
  };

  const handleAssignCaptain = async (teamId: string, userId: string, role: 'captain' | 'vice_captain') => {
    // Reset existing roles to member first
    await supabase
      .from('users')
      .update({ role: 'member' })
      .eq('team_id', teamId)
      .eq('role', role);

    await supabase.from('users').update({ role }).eq('id', userId);

    if (role === 'captain') {
      await supabase.from('teams').update({ captain_id: userId }).eq('id', teamId);
    }
    fetchTeams();
  };

  const openEditModal = (team: TeamWithDetails) => {
    setEditingTeam(team);
    setEditName(team.name);
    setEditSlogan(team.slogan || '');
  };

  const handleEdit = async () => {
    if (!editingTeam || !editName) return;
    setEditSaving(true);
    const { error } = await supabase
      .from('teams')
      .update({ name: editName, slogan: editSlogan })
      .eq('id', editingTeam.id);
    if (!error) {
      setEditingTeam(null);
      setEditName('');
      setEditSlogan('');
      fetchTeams();
    }
    setEditSaving(false);
  };

  const rolePriority: Record<string, number> = { captain: 0, vice_captain: 1, member: 2, lo: 3, admin: 4 };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="p-10 space-y-8"
    >
      {/* Header */}
      <header className="flex justify-between items-end">
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}>
          <div className="flex items-center gap-2 mb-2">
            <span className="h-px w-8 bg-primary/40" />
            <p className="text-[10px] uppercase tracking-[0.4em] text-primary font-adventure">Management</p>
          </div>
          <h2 className="text-4xl font-adventure gold-engraving mb-1">Teams</h2>
          <p className="text-muted-foreground text-sm italic opacity-70">
            Expedition teams — kanban view
          </p>
        </motion.div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 bg-primary/20 hover:bg-primary/30 border border-primary/40 text-primary text-[10px] font-adventure uppercase tracking-widest px-4 py-2 transition-all"
          >
            <Users className="w-3 h-3" />
            New Team
          </button>
        </div>
      </header>

      {/* Kanban board */}
      {loading ? (
        <div className="flex flex-col items-center justify-center p-32 opacity-30 italic">
          <Loader2 className="w-10 h-10 animate-spin mb-4 text-primary" />
          <span className="text-sm font-content">Memuat data tim...</span>
        </div>
      ) : teams.length === 0 ? (
        <div className="adventure-card border-dashed border-primary/10 p-24 flex flex-col items-center justify-center text-center opacity-50">
          <div className="bg-primary/5 p-6 rounded-full mb-6 border border-primary/10">
            <Compass className="w-12 h-12 text-primary" />
          </div>
          <h3 className="font-adventure text-2xl mb-2 gold-engraving">Belum Ada Tim</h3>
          <p className="text-muted-foreground max-w-sm italic">Buat tim baru untuk memulai.</p>
        </div>
      ) : (
        /* Horizontal scroll kanban */
        <div className="flex gap-5 overflow-x-auto pb-4 items-start">
          {teams.map((team, idx) => {
            const members = membersMap[team.id] ?? [];
            const sorted = [...members].sort(
              (a, b) => (rolePriority[a.role] ?? 9) - (rolePriority[b.role] ?? 9)
            );
            const captain = sorted.find(m => m.role === 'captain');
            const rest = sorted.filter(m => m.role !== 'captain');

            return (
              <motion.div
                key={team.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.04 }}
                className="flex-shrink-0 w-64 bg-card border border-primary/20 flex flex-col"
              >
                {/* Column header */}
                <div className="p-4 border-b border-primary/15 bg-primary/5">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <h3 className="font-adventure text-sm text-foreground leading-tight">{team.name}</h3>
                    <button
                      onClick={() => openEditModal(team)}
                      className="shrink-0 p-1 text-foreground/30 hover:text-primary transition-colors"
                      aria-label={`Edit ${team.name}`}
                    >
                      <Edit2 className="w-3 h-3" />
                    </button>
                  </div>
                  {team.slogan && (
                    <p className="text-[10px] italic text-muted-foreground/50 mb-2 line-clamp-1">"{team.slogan}"</p>
                  )}
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] font-adventure uppercase tracking-widest text-primary/60">
                      <Users className="w-3 h-3 inline mr-1" />{team.member_count} members
                    </span>
                    <span className="text-[10px] font-adventure text-primary bg-primary/15 border border-primary/20 px-2 py-0.5">
                      {team.total_points} pts
                    </span>
                  </div>
                </div>

                {/* Member list */}
                <div className="flex-1 p-3 space-y-1.5 overflow-y-auto max-h-[420px]">
                  {sorted.length === 0 ? (
                    <p className="text-[10px] text-foreground/20 italic text-center py-6">No members yet</p>
                  ) : (
                    <>
                      {/* Captain slot */}
                      {captain ? (
                        <MemberCard 
                          member={captain} 
                          teamId={team.id} 
                          onAssign={handleAssignCaptain} 
                          teamScoreLogs={scoreLogsMap[team.id] ?? []}
                          teamTotalPoints={team.total_points}
                        />
                      ) : (
                        <div className="border border-dashed border-primary/15 p-2 text-center">
                          <p className="text-[9px] text-foreground/20 font-adventure uppercase tracking-wider">No Captain</p>
                        </div>
                      )}



                      {/* Divider */}
                      {rest.length > 0 && (
                        <div className="flex items-center gap-2 py-1">
                          <span className="h-px flex-1 bg-primary/10" />
                          <span className="text-[8px] font-adventure uppercase tracking-widest text-foreground/20">Members</span>
                          <span className="h-px flex-1 bg-primary/10" />
                        </div>
                      )}

                      {rest.map(m => (
                        <MemberCard 
                          key={m.id} 
                          member={m} 
                          teamId={team.id} 
                          onAssign={handleAssignCaptain} 
                          teamScoreLogs={scoreLogsMap[team.id] ?? []}
                          teamTotalPoints={team.total_points}
                        />
                      ))}
                    </>
                  )}
                </div>

                {/* Removed redundant column footer */}
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Create Team Modal */}
      <AdventureModal
        show={showModal}
        onClose={() => { setShowModal(false); }}
        title="New Team"
      >
        <div className="space-y-5">
          <ModalField label="Team Name" value={newName} onChange={setNewName} placeholder="e.g. Raiders of the Lost Ark" />
          <ModalField label="Slogan (optional)" value={newSlogan} onChange={setNewSlogan} placeholder="e.g. Fortune and glory, kid!" />
          <ModalSubmit label="Establish Team" onClick={handleCreate} disabled={!newName || saving} loading={saving} />
        </div>
      </AdventureModal>

      {/* Edit Team Modal */}
      <AdventureModal
        show={editingTeam !== null}
        onClose={() => { setEditingTeam(null); setEditName(''); setEditSlogan(''); }}
        title="Edit Team"
      >
        <div className="space-y-5">
          <ModalField label="Team Name" value={editName} onChange={setEditName} placeholder="e.g. Raiders of the Lost Ark" />
          <ModalField label="Slogan (optional)" value={editSlogan} onChange={setEditSlogan} placeholder="e.g. Fortune and glory, kid!" />
          <ModalSubmit label="Save Changes" onClick={handleEdit} disabled={!editName || editSaving} loading={editSaving} />
        </div>
      </AdventureModal>

    </motion.div>
  );
}
