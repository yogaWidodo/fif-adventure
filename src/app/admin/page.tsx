'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import AuthGuard from '@/components/AuthGuard';
import QRCodeDisplay from '@/components/admin/QRCodeDisplay';
import CSVImporter from '@/components/admin/CSVImporter';
import EventSelector from '@/components/admin/EventSelector';
import UsersTab from '@/components/admin/UsersTab';
import TeamsTabComponent from '@/components/admin/TeamsTab';
import { generateBarcodeData } from '@/lib/auth';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, Trophy, Users, Map as MapIcon,
  Settings, LogOut, Search, QrCode,
  BarChart3, Database, X, Hammer,
  Compass, Flame, Sword, Gem, ScrollText,
  ChevronDown, ChevronUp, Loader2, AlertTriangle,
  CheckCircle, Edit2, Save, UserCheck, FileText,
  Clock, Filter, Play, Pause, RotateCcw, Square, UserCog
} from 'lucide-react';
import {
  validateDuration,
  buildStartPayload,
  buildPausePayload,
  buildResumePayload,
  buildResetPayload,
  isTransitionAllowed,
  computeRemaining,
} from '@/lib/timerUtils';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TeamWithDetails {
  id: string;
  name: string;
  slogan?: string;
  total_points: number;
  captain_id?: string;
  event_id: string;
  created_at: string;
  member_count?: number;
  captain_name?: string;
}

interface Member {
  id: string;
  nama: string;
  npk: string;
  role: string;
  no_unik: string | null;
  team_id?: string;
}

interface Location {
  id: string;
  name: string;
  description?: string;
  type: 'wahana' | 'challenge' | 'treasure';
  challenge_type?: 'regular' | 'popup' | 'additional';
  points: number;
  barcode_data: string;
  hint?: string;
  quota?: number;
  is_active: boolean;
  event_id: string;
  created_at: string;
}

interface ScoreLogEntry {
  id: string;
  team_id: string;
  location_id: string;
  score: number;
  lo_user_id: string;
  created_at: string;
  team_name?: string;
  location_name?: string;
  lo_name?: string;
}

interface Event {
  id: string;
  name: string;
  is_active: boolean;
  start_time?: string;
  end_time?: string;
  // Timer control columns
  duration_seconds: number | null;
  timer_state: 'idle' | 'running' | 'paused' | 'ended';
  timer_started_at: string | null;
  timer_remaining_seconds: number | null;
}

interface EventListItem {
  id: string;
  name: string;
  is_active: boolean;
  start_time: string | null;
  end_time: string | null;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AdminDashboard() {
  const { logout } = useAuth();
  const [activeTab, setActiveTab] = useState('events');
  const [activeEvent, setActiveEvent] = useState<Event | null>(null);

  // Fetch active event on mount
  useEffect(() => {
    const fetchActiveEvent = async () => {
      const { data } = await supabase
        .from('events')
        .select('*')
        .eq('is_active', true)
        .limit(1)
        .single();
      if (data) setActiveEvent(data);
    };
    fetchActiveEvent();
  }, []);

  return (
    <AuthGuard allowedRoles={['admin']}>
      <div className="relative flex h-screen bg-black overflow-hidden font-content selection:bg-primary selection:text-primary-foreground">
        {/* Immersive Background */}
        <div
          className="absolute inset-0 z-0 bg-cover bg-center opacity-40 blur-[2px]"
          style={{ backgroundImage: 'url("/images/jungle_hq_bg.png")' }}
        />
        <div className="absolute inset-0 z-0 bg-gradient-to-r from-black via-transparent to-black opacity-80" />
        <div className="absolute inset-0 z-10 jungle-overlay opacity-10 pointer-events-none" />

        {/* Sidebar */}
        <aside className="relative z-20 w-72 bg-card/40 backdrop-blur-xl border-r border-primary/20 p-8 flex flex-col shadow-2xl overflow-y-auto">
          <div className="flex items-center gap-4 mb-10 px-2 group cursor-pointer">
            <div className="bg-primary/20 p-2 rounded-lg border border-primary/30">
              <Trophy className="text-primary w-8 h-8 transition-transform group-hover:rotate-12 torch-glow" />
            </div>
            <div>
              <h1 className="font-adventure text-xl tracking-tighter gold-engraving">Expedition</h1>
              <p className="text-[10px] uppercase tracking-[0.3em] text-primary/60 font-adventure">Control Center</p>
            </div>
          </div>

          <nav className="flex-1 space-y-1">
            <div className="pb-2">
              <p className="text-[10px] uppercase tracking-widest text-foreground/30 font-adventure px-4 mb-2">Management</p>
            </div>
            <SidebarLink icon={<Database className="w-5 h-5" />} label="Events" active={activeTab === 'events'} onClick={() => setActiveTab('events')} />
            <SidebarLink icon={<Users className="w-5 h-5" />} label="Teams" active={activeTab === 'teams'} onClick={() => setActiveTab('teams')} />
            <SidebarLink icon={<UserCog className="w-5 h-5" />} label="Users" active={activeTab === 'users'} onClick={() => setActiveTab('users')} />
            <SidebarLink icon={<MapIcon className="w-5 h-5" />} label="Wahana" active={activeTab === 'wahana'} onClick={() => setActiveTab('wahana')} />
            <SidebarLink icon={<Sword className="w-5 h-5" />} label="Challenges" active={activeTab === 'challenges'} onClick={() => setActiveTab('challenges')} />
            <SidebarLink icon={<Gem className="w-5 h-5" />} label="Treasure Hunt" active={activeTab === 'treasure'} onClick={() => setActiveTab('treasure')} />

            <div className="pt-4 pb-2">
              <p className="text-[10px] uppercase tracking-widest text-foreground/30 font-adventure px-4 mb-2">Analytics</p>
            </div>
            <SidebarLink icon={<BarChart3 className="w-5 h-5" />} label="Metrics" active={activeTab === 'analytics'} onClick={() => setActiveTab('analytics')} />
            <SidebarLink icon={<ScrollText className="w-5 h-5" />} label="Audit Log" active={activeTab === 'audit'} onClick={() => setActiveTab('audit')} />
          </nav>

          <div className="mt-auto pt-8 border-t border-primary/10">
            <SidebarLink icon={<Settings className="w-5 h-5" />} label="Settings" active={false} onClick={() => {}} />
            <SidebarLink icon={<LogOut className="w-5 h-5 text-accent" />} label="Abort Mission" active={false} onClick={logout} />
          </div>
        </aside>

        {/* Main Content */}
        <main className="relative z-20 flex-1 overflow-y-auto">
          <AnimatePresence mode="wait">
            {activeTab === 'events' && <EventsTab key="events" onEventChange={setActiveEvent} />}
            {activeTab === 'teams' && <TeamsTabComponent key="teams" activeEvent={activeEvent} />}
            {activeTab === 'users' && <UsersTab key="users" activeEvent={activeEvent} />}
            {activeTab === 'wahana' && <WahanaTab key="wahana" activeEvent={activeEvent} />}
            {activeTab === 'challenges' && <ChallengesTab key="challenges" activeEvent={activeEvent} />}
            {activeTab === 'treasure' && <TreasureTab key="treasure" activeEvent={activeEvent} />}
            {activeTab === 'analytics' && <AnalyticsTab key="analytics" />}
            {activeTab === 'audit' && <AuditTab key="audit" activeEvent={activeEvent} />}
          </AnimatePresence>
        </main>
      </div>
    </AuthGuard>
  );
}

// ─── Events Tab ───────────────────────────────────────────────────────────────

function EventsTab({ onEventChange }: { onEventChange: (e: Event | null) => void }) {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Edit legacy start/end timer state
  const [editingTimer, setEditingTimer] = useState<Event | null>(null);
  const [editStart, setEditStart] = useState('');
  const [editEnd, setEditEnd] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');

  // Duration input state per event (keyed by event id)
  const [durationHours, setDurationHours] = useState<Record<string, string>>({});
  const [durationMinutes, setDurationMinutes] = useState<Record<string, string>>({});
  const [durationErrors, setDurationErrors] = useState<Record<string, string>>({});

  // Live countdown state per event (keyed by event id)
  const [liveRemaining, setLiveRemaining] = useState<Record<string, number>>({});

  // Timer action error per event
  const [timerActionError, setTimerActionError] = useState<Record<string, string>>({});

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('events').select('*').order('created_at', { ascending: false });
    const evts: Event[] = (data || []).map((e: any) => ({
      ...e,
      duration_seconds: e.duration_seconds ?? null,
      timer_state: e.timer_state ?? 'idle',
      timer_started_at: e.timer_started_at ?? null,
      timer_remaining_seconds: e.timer_remaining_seconds ?? null,
    }));
    setEvents(evts);
    // Pre-populate duration inputs from existing duration_seconds (only if not already set by user)
    setDurationHours(prev => {
      const next = { ...prev };
      evts.forEach(ev => {
        if (ev.duration_seconds != null && !(ev.id in prev)) {
          next[ev.id] = String(Math.floor(ev.duration_seconds / 3600));
        }
      });
      return next;
    });
    setDurationMinutes(prev => {
      const next = { ...prev };
      evts.forEach(ev => {
        if (ev.duration_seconds != null && !(ev.id in prev)) {
          next[ev.id] = String(Math.floor((ev.duration_seconds % 3600) / 60));
        }
      });
      return next;
    });
    setLoading(false);
  }, []);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);

  // Live countdown ticker for running events
  useEffect(() => {
    const runningEvents = events.filter(
      e => e.timer_state === 'running' && e.timer_remaining_seconds != null && e.timer_started_at != null
    );
    if (runningEvents.length === 0) return;

    const interval = setInterval(() => {
      const now = new Date();
      const updates: Record<string, number> = {};
      runningEvents.forEach(ev => {
        const remaining = computeRemaining(ev.timer_remaining_seconds!, ev.timer_started_at!, now);
        updates[ev.id] = remaining;
        if (remaining === 0) {
          supabase.from('events').update({ timer_state: 'ended' }).eq('id', ev.id).then(() => fetchEvents());
        }
      });
      setLiveRemaining(prev => ({ ...prev, ...updates }));
    }, 1000);

    return () => clearInterval(interval);
  }, [events, fetchEvents]);

  const handleCreate = async () => {
    if (!newName) return;
    if (startTime && endTime && new Date(endTime) <= new Date(startTime)) {
      setError('End time must be after start time');
      return;
    }
    setSaving(true);
    setError('');
    const payload: Record<string, unknown> = { name: newName };
    if (startTime) payload.start_time = new Date(startTime).toISOString();
    if (endTime) payload.end_time = new Date(endTime).toISOString();

    const { error: err } = await supabase.from('events').insert(payload);
    if (err) { setError(err.message); } else {
      setShowModal(false);
      setNewName(''); setStartTime(''); setEndTime('');
      fetchEvents();
    }
    setSaving(false);
  };

  const openEditTimer = (event: Event) => {
    setEditingTimer(event);
    const toLocalDatetimeInput = (iso: string) => {
      const d = new Date(iso);
      const offset = d.getTimezoneOffset();
      const local = new Date(d.getTime() - offset * 60 * 1000);
      return local.toISOString().slice(0, 16);
    };
    setEditStart(event.start_time ? toLocalDatetimeInput(event.start_time) : '');
    setEditEnd(event.end_time ? toLocalDatetimeInput(event.end_time) : '');
    setEditError('');
  };

  const toUTCISOString = (localDatetimeStr: string): string => {
    return new Date(localDatetimeStr).toISOString();
  };

  const handleSaveTimer = async () => {
    if (!editingTimer) return;
    if (editStart && editEnd && new Date(editEnd) <= new Date(editStart)) {
      setEditError('End time must be after start time');
      return;
    }
    setEditSaving(true);
    setEditError('');
    const { error: err } = await supabase
      .from('events')
      .update({
        start_time: editStart ? toUTCISOString(editStart) : null,
        end_time: editEnd ? toUTCISOString(editEnd) : null,
      })
      .eq('id', editingTimer.id);
    if (err) {
      setEditError(err.message);
    } else {
      setEditingTimer(null);
      fetchEvents();
    }
    setEditSaving(false);
  };

  const toggleActive = async (event: Event) => {
    await supabase.from('events').update({ is_active: false }).neq('id', event.id);
    if (!event.is_active) {
      await supabase.from('events').update({ is_active: true }).eq('id', event.id);
      onEventChange({ ...event, is_active: true });
    } else {
      await supabase.from('events').update({ is_active: false }).eq('id', event.id);
      onEventChange(null);
    }
    fetchEvents();
  };

  const handleSetDuration = async (event: Event) => {
    const h = parseInt(durationHours[event.id] || '0', 10);
    const m = parseInt(durationMinutes[event.id] || '0', 10);
    const result = validateDuration(h, m);
    if (!result.valid) {
      setDurationErrors(prev => ({ ...prev, [event.id]: result.error! }));
      return;
    }
    setDurationErrors(prev => ({ ...prev, [event.id]: '' }));
    const { error: err } = await supabase
      .from('events')
      .update({ duration_seconds: result.duration_seconds })
      .eq('id', event.id);
    if (err) {
      setDurationErrors(prev => ({ ...prev, [event.id]: err.message }));
    } else {
      fetchEvents();
    }
  };

  const handleTimerAction = async (event: Event, action: 'start' | 'pause' | 'resume' | 'reset') => {
    if (!isTransitionAllowed(event.timer_state, action)) return;
    setTimerActionError(prev => ({ ...prev, [event.id]: '' }));

    const now = new Date();
    let payload;
    if (action === 'start') {
      if (event.duration_seconds == null) return;
      payload = buildStartPayload(event.duration_seconds, now);
    } else if (action === 'pause') {
      payload = buildPausePayload(event.timer_remaining_seconds!, event.timer_started_at!, now);
    } else if (action === 'resume') {
      payload = buildResumePayload(now);
    } else {
      payload = buildResetPayload();
    }

    const { error: err } = await supabase.from('events').update(payload).eq('id', event.id);
    if (err) {
      setTimerActionError(prev => ({ ...prev, [event.id]: err.message }));
    } else {
      fetchEvents();
    }
  };

  const formatSeconds = (secs: number): string => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    return [h, m, s].map(v => String(v).padStart(2, '0')).join(':');
  };

  const activeEvents = events.filter(e => e.is_active);
  const inactiveEvents = events.filter(e => !e.is_active);

  return (
    <TabLayout
      title="Events"
      subtitle="Manage expedition sessions"
      onAdd={() => setShowModal(true)}
    >
      {loading ? <LoadingState /> : events.length === 0 ? <EmptyState tab="events" /> : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Left column — Archived (inactive) events */}
          <div>
            <p className="text-[10px] uppercase tracking-[0.4em] text-foreground/40 font-adventure mb-4 flex items-center gap-2">
              <span className="h-px w-6 bg-foreground/20" />
              Archived
            </p>
            {inactiveEvents.length === 0 ? (
              <p className="text-[11px] text-muted-foreground/30 italic">No archived events.</p>
            ) : (
              <div className="space-y-4">
                {inactiveEvents.map((event, idx) => (
                  <motion.div
                    key={event.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.05 }}
                    className="adventure-card p-5 group"
                  >
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg border bg-foreground/5 border-foreground/10">
                          <Flame className="w-4 h-4 text-muted-foreground opacity-30" />
                        </div>
                        <div>
                          <h3 className="font-adventure text-base text-foreground/70 group-hover:text-foreground transition-colors">{event.name}</h3>
                          <span className="text-[9px] font-mono opacity-20">{event.id.slice(0, 8)}</span>
                        </div>
                      </div>
                      <button
                        onClick={() => toggleActive(event)}
                        className="text-[10px] font-adventure uppercase tracking-widest hover:text-primary underline underline-offset-4 transition-all"
                      >
                        Activate
                      </button>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </div>

          {/* Right column — Active events with full timer controls */}
          <div>
            <p className="text-[10px] uppercase tracking-[0.4em] text-primary/60 font-adventure mb-4 flex items-center gap-2">
              <span className="h-px w-6 bg-primary/40" />
              Active
            </p>
            {activeEvents.length === 0 ? (
              <p className="text-[11px] text-muted-foreground/30 italic">No active events. Activate one from the left.</p>
            ) : (
              <div className="space-y-6">
                {activeEvents.map((event, idx) => {
                  const state = event.timer_state;
                  const remaining = state === 'running'
                    ? (liveRemaining[event.id] ?? computeRemaining(
                        event.timer_remaining_seconds ?? 0,
                        event.timer_started_at ?? new Date().toISOString(),
                        new Date()
                      ))
                    : (event.timer_remaining_seconds ?? 0);

                  return (
                    <motion.div
                      key={event.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.05 }}
                      className="adventure-card p-6 group"
                    >
                      {/* Header */}
                      <div className="flex justify-between items-start mb-4">
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-lg border bg-primary/20 border-primary/40">
                            <Flame className="w-5 h-5 text-primary torch-glow" />
                          </div>
                          <div>
                            <h3 className="font-adventure text-lg text-foreground group-hover:text-primary transition-colors">{event.name}</h3>
                            <span className="text-[9px] font-mono opacity-30">{event.id.slice(0, 8)}</span>
                          </div>
                        </div>
                        {/* Timer state badge */}
                        {state === 'idle' && (
                          <span className="text-[10px] font-adventure uppercase tracking-widest text-muted-foreground/50 bg-foreground/5 border border-foreground/10 px-2 py-1">● Idle</span>
                        )}
                        {state === 'running' && (
                          <span className="text-[10px] font-adventure uppercase tracking-widest text-green-400 bg-green-900/20 border border-green-500/30 px-2 py-1">● Running</span>
                        )}
                        {state === 'paused' && (
                          <span className="text-[10px] font-adventure uppercase tracking-widest text-amber-400 bg-amber-900/20 border border-amber-500/30 px-2 py-1">⏸ Paused</span>
                        )}
                        {state === 'ended' && (
                          <span className="text-[10px] font-adventure uppercase tracking-widest text-red-400 bg-red-900/20 border border-red-500/30 px-2 py-1">■ Ended</span>
                        )}
                      </div>

                      {/* Countdown display */}
                      {(state === 'running' || state === 'paused') && (
                        <div className="mb-4 text-center">
                          <p className={`font-adventure text-3xl tracking-widest ${state === 'running' ? 'text-green-400' : 'text-amber-400'}`}>
                            {formatSeconds(remaining)}
                          </p>
                        </div>
                      )}
                      {state === 'ended' && (
                        <div className="mb-4 text-center">
                          <p className="font-adventure text-3xl tracking-widest text-red-400">00:00:00</p>
                        </div>
                      )}

                      {/* Duration input */}
                      <div className="border border-primary/10 rounded p-4 bg-primary/5 mb-4 space-y-3">
                        <p className="text-[10px] uppercase tracking-widest font-adventure text-primary/60">Set Duration</p>
                        <div className="flex items-center gap-3">
                          <div className="flex-1">
                            <label className="block text-[9px] uppercase tracking-widest font-adventure text-foreground/40 mb-1">Hours</label>
                            <input
                              type="number"
                              min={0}
                              value={durationHours[event.id] ?? ''}
                              onChange={e => setDurationHours(prev => ({ ...prev, [event.id]: e.target.value }))}
                              className="w-full bg-transparent border-b border-primary/30 py-1.5 text-sm text-foreground focus:outline-none focus:border-primary transition-colors text-center"
                              placeholder="0"
                            />
                          </div>
                          <span className="text-primary/40 font-adventure text-lg mt-4">:</span>
                          <div className="flex-1">
                            <label className="block text-[9px] uppercase tracking-widest font-adventure text-foreground/40 mb-1">Minutes</label>
                            <input
                              type="number"
                              min={0}
                              max={59}
                              value={durationMinutes[event.id] ?? ''}
                              onChange={e => setDurationMinutes(prev => ({ ...prev, [event.id]: e.target.value }))}
                              className="w-full bg-transparent border-b border-primary/30 py-1.5 text-sm text-foreground focus:outline-none focus:border-primary transition-colors text-center"
                              placeholder="0"
                            />
                          </div>
                          <button
                            onClick={() => handleSetDuration(event)}
                            className="mt-4 flex items-center gap-1 bg-primary/20 hover:bg-primary/30 border border-primary/40 text-primary text-[10px] font-adventure uppercase tracking-widest px-3 py-2 transition-all"
                          >
                            <Save className="w-3 h-3" />
                            Set
                          </button>
                        </div>
                        {durationErrors[event.id] && (
                          <p className="text-red-400 text-[10px]">{durationErrors[event.id]}</p>
                        )}
                        {event.duration_seconds != null && (
                          <p className="text-[10px] text-primary/50 font-adventure">
                            Current: {formatSeconds(event.duration_seconds)}
                          </p>
                        )}
                      </div>

                      {/* Timer control buttons */}
                      <div className="flex flex-wrap gap-2 mb-3">
                        {state === 'idle' && (
                          <button
                            onClick={() => handleTimerAction(event, 'start')}
                            disabled={event.duration_seconds == null}
                            className="flex items-center gap-2 bg-green-900/30 hover:bg-green-900/50 border border-green-500/40 text-green-400 text-[10px] font-adventure uppercase tracking-widest px-4 py-2 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            <Play className="w-3 h-3" />
                            Start Timer
                          </button>
                        )}
                        {state === 'running' && (
                          <button
                            onClick={() => handleTimerAction(event, 'pause')}
                            className="flex items-center gap-2 bg-red-900/30 hover:bg-red-900/50 border border-red-500/40 text-red-400 text-[10px] font-adventure uppercase tracking-widest px-4 py-2 transition-all"
                          >
                            <Pause className="w-3 h-3" />
                            Pause
                          </button>
                        )}
                        {state === 'paused' && (
                          <button
                            onClick={() => handleTimerAction(event, 'resume')}
                            className="flex items-center gap-2 bg-amber-900/30 hover:bg-amber-900/50 border border-amber-500/40 text-amber-400 text-[10px] font-adventure uppercase tracking-widest px-4 py-2 transition-all"
                          >
                            <Play className="w-3 h-3" />
                            Resume
                          </button>
                        )}
                        {state === 'ended' && (
                          <span className="flex items-center gap-2 bg-red-900/20 border border-red-500/20 text-red-400/60 text-[10px] font-adventure uppercase tracking-widest px-4 py-2">
                            <Square className="w-3 h-3" />
                            Expedition Ended
                          </span>
                        )}
                        {/* Reset button — shown for running, paused, ended */}
                        {(state === 'running' || state === 'paused' || state === 'ended') && (
                          <button
                            onClick={() => handleTimerAction(event, 'reset')}
                            className="flex items-center gap-2 bg-foreground/5 hover:bg-foreground/10 border border-foreground/20 text-foreground/50 hover:text-foreground text-[10px] font-adventure uppercase tracking-widest px-4 py-2 transition-all"
                          >
                            <RotateCcw className="w-3 h-3" />
                            Reset
                          </button>
                        )}
                      </div>

                      {timerActionError[event.id] && (
                        <p className="text-red-400 text-[10px] mb-3">{timerActionError[event.id]}</p>
                      )}

                      {/* Legacy start/end time info */}
                      <div className="space-y-1 mb-3">
                        <p className="text-[10px] text-muted-foreground/60 flex items-center gap-1">
                          <Clock className="w-3 h-3 shrink-0" />
                          <span className="font-adventure uppercase tracking-wider opacity-60 mr-1">Start:</span>
                          {event.start_time ? new Date(event.start_time).toLocaleString('id-ID') : <span className="opacity-30 italic">not set</span>}
                        </p>
                        <p className="text-[10px] text-muted-foreground/60 flex items-center gap-1">
                          <Clock className="w-3 h-3 shrink-0" />
                          <span className="font-adventure uppercase tracking-wider opacity-60 mr-1">End:</span>
                          {event.end_time ? new Date(event.end_time).toLocaleString('id-ID') : <span className="opacity-30 italic">not set</span>}
                        </p>
                      </div>

                      {/* Inline edit legacy timer form */}
                      <AnimatePresence>
                        {editingTimer?.id === event.id && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="overflow-hidden mb-3"
                          >
                            <div className="border border-primary/20 rounded p-4 space-y-3 bg-primary/5">
                              <div>
                                <label className="block text-[10px] uppercase tracking-widest font-adventure text-primary/60 mb-1">Start Time</label>
                                <input
                                  type="datetime-local"
                                  value={editStart}
                                  onChange={e => setEditStart(e.target.value)}
                                  className="w-full bg-transparent border-b border-primary/30 py-1.5 text-sm text-foreground focus:outline-none focus:border-primary transition-colors"
                                />
                              </div>
                              <div>
                                <label className="block text-[10px] uppercase tracking-widest font-adventure text-primary/60 mb-1">End Time</label>
                                <input
                                  type="datetime-local"
                                  value={editEnd}
                                  onChange={e => setEditEnd(e.target.value)}
                                  className="w-full bg-transparent border-b border-primary/30 py-1.5 text-sm text-foreground focus:outline-none focus:border-primary transition-colors"
                                />
                              </div>
                              {editError && <p className="text-red-400 text-[10px]">{editError}</p>}
                              <div className="flex gap-2 pt-1">
                                <button
                                  onClick={handleSaveTimer}
                                  disabled={editSaving}
                                  className="flex-1 flex items-center justify-center gap-1 bg-primary/20 hover:bg-primary/30 border border-primary/40 text-primary text-[10px] font-adventure uppercase tracking-widest py-2 transition-all disabled:opacity-40"
                                >
                                  {editSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                                  Save
                                </button>
                                <button
                                  onClick={() => setEditingTimer(null)}
                                  className="px-3 border border-foreground/10 text-foreground/40 hover:text-foreground text-[10px] font-adventure uppercase tracking-widest py-2 transition-all"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>

                      <div className="flex justify-between items-center pt-4 border-t border-primary/5">
                        <span className="text-[10px] uppercase font-adventure text-primary">● Active</span>
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => editingTimer?.id === event.id ? setEditingTimer(null) : openEditTimer(event)}
                            className="text-[10px] font-adventure uppercase tracking-widest text-primary/50 hover:text-primary transition-colors flex items-center gap-1"
                          >
                            <Clock className="w-3 h-3" />
                            Legacy Timer
                          </button>
                          <button
                            onClick={() => toggleActive(event)}
                            className="text-[10px] font-adventure uppercase tracking-widest hover:text-primary underline underline-offset-4 transition-all"
                          >
                            Deactivate
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      <AdventureModal show={showModal} onClose={() => setShowModal(false)} title="New Event">
        <div className="space-y-5">
          <ModalField label="Event Name" value={newName} onChange={setNewName} placeholder="e.g. FIF Adventure 2025" />
          <div>
            <label className="block text-[10px] uppercase tracking-widest font-adventure text-[#2b1d0e]/60 mb-2">Start Time</label>
            <input type="datetime-local" value={startTime} onChange={e => setStartTime(e.target.value)}
              className="w-full bg-transparent border-b-2 border-[#2b1d0e]/20 p-3 font-adventure text-[#2b1d0e] focus:outline-none focus:border-[#8b4513] transition-colors" />
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-widest font-adventure text-[#2b1d0e]/60 mb-2">End Time</label>
            <input type="datetime-local" value={endTime} onChange={e => setEndTime(e.target.value)}
              className="w-full bg-transparent border-b-2 border-[#2b1d0e]/20 p-3 font-adventure text-[#2b1d0e] focus:outline-none focus:border-[#8b4513] transition-colors" />
          </div>
          {error && <p className="text-red-500 text-xs">{error}</p>}
          <ModalSubmit label="Create Event" onClick={handleCreate} disabled={!newName || saving} loading={saving} />
        </div>
      </AdventureModal>
    </TabLayout>
  );
}

// ─── Wahana Tab ───────────────────────────────────────────────────────────────

function WahanaTab({ activeEvent }: { activeEvent: Event | null }) {
  const [wahanas, setWahanas] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newPoints, setNewPoints] = useState('');
  const [saving, setSaving] = useState(false);
  const [expandedQR, setExpandedQR] = useState<string | null>(null);

  const fetchWahanas = useCallback(async () => {
    setLoading(true);
    const query = supabase
      .from('locations')
      .select('*')
      .eq('type', 'wahana')
      .order('created_at', { ascending: false });
    if (activeEvent) query.eq('event_id', activeEvent.id);
    const { data } = await query;
    setWahanas(data || []);
    setLoading(false);
  }, [activeEvent]);

  useEffect(() => { fetchWahanas(); }, [fetchWahanas]);

  const handleCreate = async () => {
    if (!newName || !newPoints) return;
    setSaving(true);

    // Generate a UUID for the barcode
    const id = crypto.randomUUID();
    const barcodeData = generateBarcodeData('wahana', id);

    const payload: Record<string, unknown> = {
      name: newName,
      description: newDesc || null,
      points: parseInt(newPoints, 10),
      type: 'wahana',
      barcode_data: barcodeData,
      is_active: true,
    };
    if (activeEvent) payload.event_id = activeEvent.id;

    const { error } = await supabase.from('locations').insert(payload);
    if (!error) {
      setShowModal(false);
      setNewName(''); setNewDesc(''); setNewPoints('');
      fetchWahanas();
    }
    setSaving(false);
  };

  const toggleActive = async (loc: Location) => {
    await supabase.from('locations').update({ is_active: !loc.is_active }).eq('id', loc.id);
    fetchWahanas();
  };

  return (
    <TabLayout
      title="Wahana"
      subtitle="Manage game stations and QR codes"
      onAdd={() => setShowModal(true)}
    >
      {loading ? <LoadingState /> : wahanas.length === 0 ? <EmptyState tab="wahana" /> : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {wahanas.map((loc, idx) => (
            <motion.div
              key={loc.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05 }}
              className="adventure-card p-6 group"
            >
              <div className="flex justify-between items-start mb-4">
                <div className={`p-2 rounded-lg border ${loc.is_active ? 'bg-primary/20 border-primary/40' : 'bg-foreground/5 border-foreground/10'}`}>
                  <MapIcon className={`w-5 h-5 ${loc.is_active ? 'text-primary' : 'text-muted-foreground opacity-30'}`} />
                </div>
                <span className="text-[10px] font-adventure text-primary bg-primary/10 px-2 py-0.5">{loc.points} pts</span>
              </div>

              <h3 className="font-adventure text-lg text-foreground mb-1 group-hover:text-primary transition-colors">{loc.name}</h3>
              {loc.description && (
                <p className="text-xs text-muted-foreground/60 mb-3 line-clamp-2">{loc.description}</p>
              )}

              {/* QR Code toggle */}
              <button
                onClick={() => setExpandedQR(expandedQR === loc.id ? null : loc.id)}
                className="flex items-center gap-2 text-[10px] font-adventure uppercase tracking-widest text-primary/60 hover:text-primary transition-colors mb-3"
              >
                <QrCode className="w-3 h-3" />
                {expandedQR === loc.id ? 'Hide QR' : 'Show QR'}
              </button>

              <AnimatePresence>
                {expandedQR === loc.id && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden mb-4 flex justify-center"
                  >
                    <QRCodeDisplay barcodeData={loc.barcode_data} label={loc.name} size={120} />
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="flex justify-between items-center pt-4 border-t border-primary/5">
                <span className={`text-[10px] uppercase font-adventure ${loc.is_active ? 'text-primary' : 'text-muted-foreground/40'}`}>
                  {loc.is_active ? '● Active' : '○ Inactive'}
                </span>
                <button
                  onClick={() => toggleActive(loc)}
                  className="text-[10px] font-adventure uppercase tracking-widest hover:text-primary underline underline-offset-4 transition-all"
                >
                  {loc.is_active ? 'Deactivate' : 'Activate'}
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      <AdventureModal show={showModal} onClose={() => setShowModal(false)} title="New Wahana">
        <div className="space-y-5">
          <ModalField label="Wahana Name" value={newName} onChange={setNewName} placeholder="e.g. Temple of Doom" />
          <ModalField label="Description (optional)" value={newDesc} onChange={setNewDesc} placeholder="Describe this station..." />
          <ModalField label="Points" value={newPoints} onChange={setNewPoints} placeholder="e.g. 100" type="number" />
          <ModalSubmit label="Establish Wahana" onClick={handleCreate} disabled={!newName || !newPoints || saving} loading={saving} />
        </div>
      </AdventureModal>
    </TabLayout>
  );
}

// ─── Challenges Tab ───────────────────────────────────────────────────────────

const CHALLENGE_LIMITS = { regular: 6, popup: 2, additional: 3 };

function ChallengesTab({ activeEvent }: { activeEvent: Event | null }) {
  const [challenges, setChallenges] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newPoints, setNewPoints] = useState('');
  const [newType, setNewType] = useState<'regular' | 'popup' | 'additional'>('regular');
  const [saving, setSaving] = useState(false);
  const [expandedQR, setExpandedQR] = useState<string | null>(null);
  const [limitError, setLimitError] = useState('');

  const fetchChallenges = useCallback(async () => {
    setLoading(true);
    const query = supabase
      .from('locations')
      .select('*')
      .eq('type', 'challenge')
      .order('created_at', { ascending: false });
    if (activeEvent) query.eq('event_id', activeEvent.id);
    const { data } = await query;
    setChallenges(data || []);
    setLoading(false);
  }, [activeEvent]);

  useEffect(() => { fetchChallenges(); }, [fetchChallenges]);

  const handleCreate = async () => {
    if (!newName || !newPoints) return;
    setLimitError('');

    // Validate limits
    const typeCount = challenges.filter(c => c.challenge_type === newType && c.is_active).length;
    const limit = CHALLENGE_LIMITS[newType];
    if (typeCount >= limit) {
      setLimitError(`Maximum ${limit} ${newType} challenges allowed per event.`);
      return;
    }

    setSaving(true);
    const id = crypto.randomUUID();
    const barcodeData = generateBarcodeData('challenge', id);

    const payload: Record<string, unknown> = {
      name: newName,
      description: newDesc || null,
      points: parseInt(newPoints, 10),
      type: 'challenge',
      challenge_type: newType,
      barcode_data: barcodeData,
      is_active: true,
    };
    if (activeEvent) payload.event_id = activeEvent.id;

    const { error } = await supabase.from('locations').insert(payload);
    if (!error) {
      setShowModal(false);
      setNewName(''); setNewDesc(''); setNewPoints(''); setNewType('regular');
      fetchChallenges();
    }
    setSaving(false);
  };

  const toggleActive = async (loc: Location) => {
    await supabase.from('locations').update({ is_active: !loc.is_active }).eq('id', loc.id);
    fetchChallenges();
  };

  const typeColor = (type?: string) => {
    if (type === 'regular') return 'bg-blue-500/20 text-blue-300';
    if (type === 'popup') return 'bg-orange-500/20 text-orange-300';
    if (type === 'additional') return 'bg-purple-500/20 text-purple-300';
    return 'bg-foreground/10 text-foreground/60';
  };

  const counts = {
    regular: challenges.filter(c => c.challenge_type === 'regular' && c.is_active).length,
    popup: challenges.filter(c => c.challenge_type === 'popup' && c.is_active).length,
    additional: challenges.filter(c => c.challenge_type === 'additional' && c.is_active).length,
  };

  return (
    <TabLayout
      title="Challenges"
      subtitle="Manage challenges and their QR codes"
      onAdd={() => setShowModal(true)}
      extraActions={
        <div className="flex gap-3 text-[10px] font-adventure uppercase tracking-widest text-muted-foreground/50">
          <span>Regular: {counts.regular}/{CHALLENGE_LIMITS.regular}</span>
          <span>Pop-up: {counts.popup}/{CHALLENGE_LIMITS.popup}</span>
          <span>Additional: {counts.additional}/{CHALLENGE_LIMITS.additional}</span>
        </div>
      }
    >
      {loading ? <LoadingState /> : challenges.length === 0 ? <EmptyState tab="challenges" /> : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {challenges.map((loc, idx) => (
            <motion.div
              key={loc.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05 }}
              className="adventure-card p-6 group"
            >
              <div className="flex justify-between items-start mb-4">
                <div className={`p-2 rounded-lg border ${loc.is_active ? 'bg-primary/20 border-primary/40' : 'bg-foreground/5 border-foreground/10'}`}>
                  <Sword className={`w-5 h-5 ${loc.is_active ? 'text-primary' : 'text-muted-foreground opacity-30'}`} />
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-[9px] font-adventure uppercase px-2 py-0.5 ${typeColor(loc.challenge_type)}`}>
                    {loc.challenge_type}
                  </span>
                  <span className="text-[10px] font-adventure text-primary bg-primary/10 px-2 py-0.5">{loc.points} pts</span>
                </div>
              </div>

              <h3 className="font-adventure text-lg text-foreground mb-1 group-hover:text-primary transition-colors">{loc.name}</h3>
              {loc.description && (
                <p className="text-xs text-muted-foreground/60 mb-3 line-clamp-2">{loc.description}</p>
              )}

              <button
                onClick={() => setExpandedQR(expandedQR === loc.id ? null : loc.id)}
                className="flex items-center gap-2 text-[10px] font-adventure uppercase tracking-widest text-primary/60 hover:text-primary transition-colors mb-3"
              >
                <QrCode className="w-3 h-3" />
                {expandedQR === loc.id ? 'Hide QR' : 'Show QR'}
              </button>

              <AnimatePresence>
                {expandedQR === loc.id && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden mb-4 flex justify-center"
                  >
                    <QRCodeDisplay barcodeData={loc.barcode_data} label={loc.name} size={120} />
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="flex justify-between items-center pt-4 border-t border-primary/5">
                <span className={`text-[10px] uppercase font-adventure ${loc.is_active ? 'text-primary' : 'text-muted-foreground/40'}`}>
                  {loc.is_active ? '● Active' : '○ Inactive'}
                </span>
                <button
                  onClick={() => toggleActive(loc)}
                  className="text-[10px] font-adventure uppercase tracking-widest hover:text-primary underline underline-offset-4 transition-all"
                >
                  {loc.is_active ? 'Deactivate' : 'Activate'}
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      <AdventureModal show={showModal} onClose={() => setShowModal(false)} title="New Challenge">
        <div className="space-y-5">
          <ModalField label="Challenge Name" value={newName} onChange={setNewName} placeholder="e.g. Bridge of Doom" />
          <ModalField label="Description (optional)" value={newDesc} onChange={setNewDesc} placeholder="Describe this challenge..." />
          <ModalField label="Points" value={newPoints} onChange={setNewPoints} placeholder="e.g. 150" type="number" />
          <div>
            <label className="block text-[10px] uppercase tracking-widest font-adventure text-[#2b1d0e]/60 mb-2">Challenge Type</label>
            <div className="flex gap-3">
              {(['regular', 'popup', 'additional'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setNewType(t)}
                  className={`flex-1 py-2 text-[10px] font-adventure uppercase tracking-widest border transition-all ${
                    newType === t
                      ? 'bg-[#8b4513] text-[#f4e4bc] border-[#8b4513]'
                      : 'bg-transparent text-[#2b1d0e]/60 border-[#2b1d0e]/20 hover:border-[#8b4513]/40'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          {limitError && <p className="text-red-600 text-xs">{limitError}</p>}
          <ModalSubmit label="Create Challenge" onClick={handleCreate} disabled={!newName || !newPoints || saving} loading={saving} />
        </div>
      </AdventureModal>
    </TabLayout>
  );
}

// ─── Treasure Tab ─────────────────────────────────────────────────────────────

const MAX_TREASURE = 20;

function TreasureTab({ activeEvent }: { activeEvent: Event | null }) {
  const [treasures, setTreasures] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newPoints, setNewPoints] = useState('');
  const [newHint, setNewHint] = useState('');
  const [newQuota, setNewQuota] = useState('');
  const [saving, setSaving] = useState(false);
  const [expandedQR, setExpandedQR] = useState<string | null>(null);
  const [expandedClaims, setExpandedClaims] = useState<string | null>(null);
  const [claimTeams, setClaimTeams] = useState<{ team_name: string }[]>([]);
  const [editQuota, setEditQuota] = useState<{ id: string; value: string } | null>(null);
  const [limitError, setLimitError] = useState('');

  const fetchTreasures = useCallback(async () => {
    setLoading(true);
    const query = supabase
      .from('locations')
      .select('*')
      .eq('type', 'treasure')
      .order('created_at', { ascending: false });
    if (activeEvent) query.eq('event_id', activeEvent.id);
    const { data } = await query;
    setTreasures(data || []);
    setLoading(false);
  }, [activeEvent]);

  useEffect(() => { fetchTreasures(); }, [fetchTreasures]);

  const fetchClaims = async (locationId: string) => {
    const { data } = await supabase
      .from('scans')
      .select('team_id, teams(name)')
      .eq('location_id', locationId);

    const teams = (data || []).map((s: any) => ({ team_name: s.teams?.name || 'Unknown' }));
    setClaimTeams(teams);
    setExpandedClaims(locationId);
  };

  const handleCreate = async () => {
    if (!newName || !newPoints || !newQuota) return;
    setLimitError('');

    const activeTreasureCount = treasures.filter(t => t.is_active).length;
    if (activeTreasureCount >= MAX_TREASURE) {
      setLimitError(`Maximum ${MAX_TREASURE} active treasures allowed per event.`);
      return;
    }

    setSaving(true);
    const id = crypto.randomUUID();
    const barcodeData = generateBarcodeData('treasure', id);

    const payload: Record<string, unknown> = {
      name: newName,
      description: newDesc || null,
      points: parseInt(newPoints, 10),
      hint: newHint || null,
      quota: parseInt(newQuota, 10),
      type: 'treasure',
      barcode_data: barcodeData,
      is_active: true,
    };
    if (activeEvent) payload.event_id = activeEvent.id;

    const { error } = await supabase.from('locations').insert(payload);
    if (!error) {
      setShowModal(false);
      setNewName(''); setNewDesc(''); setNewPoints(''); setNewHint(''); setNewQuota('');
      fetchTreasures();
    }
    setSaving(false);
  };

  const handleUpdateQuota = async (loc: Location, newQuotaVal: number) => {
    // Validate: new quota must be >= existing claim count
    const { count } = await supabase
      .from('scans')
      .select('*', { count: 'exact', head: true })
      .eq('location_id', loc.id);

    const claimCount = count || 0;
    if (newQuotaVal < claimCount) {
      alert(`Cannot set quota below existing claim count (${claimCount}).`);
      return;
    }

    await supabase.from('locations').update({ quota: newQuotaVal }).eq('id', loc.id);
    setEditQuota(null);
    fetchTreasures();
  };

  const toggleActive = async (loc: Location) => {
    await supabase.from('locations').update({ is_active: !loc.is_active }).eq('id', loc.id);
    fetchTreasures();
  };

  const activeTreasureCount = treasures.filter(t => t.is_active).length;

  return (
    <TabLayout
      title="Treasure Hunt"
      subtitle="Manage hidden treasures and claim quotas"
      onAdd={() => setShowModal(true)}
      extraActions={
        <span className="text-[10px] font-adventure uppercase tracking-widest text-muted-foreground/50">
          Active: {activeTreasureCount}/{MAX_TREASURE}
        </span>
      }
    >
      {loading ? <LoadingState /> : treasures.length === 0 ? <EmptyState tab="treasure" /> : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {treasures.map((loc, idx) => (
            <motion.div
              key={loc.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05 }}
              className="adventure-card p-6 group"
            >
              <div className="flex justify-between items-start mb-4">
                <div className={`p-2 rounded-lg border ${loc.is_active ? 'bg-primary/20 border-primary/40' : 'bg-foreground/5 border-foreground/10'}`}>
                  <Gem className={`w-5 h-5 ${loc.is_active ? 'text-primary' : 'text-muted-foreground opacity-30'}`} />
                </div>
                <span className="text-[10px] font-adventure text-primary bg-primary/10 px-2 py-0.5">{loc.points} pts</span>
              </div>

              <h3 className="font-adventure text-lg text-foreground mb-1 group-hover:text-primary transition-colors">{loc.name}</h3>
              {loc.description && (
                <p className="text-xs text-muted-foreground/60 mb-2 line-clamp-2">{loc.description}</p>
              )}
              {loc.hint && (
                <p className="text-[10px] italic text-primary/50 mb-3">Hint: {loc.hint}</p>
              )}

              {/* Quota display + edit */}
              <div className="flex items-center gap-2 mb-3">
                <span className="text-[10px] text-muted-foreground/60 font-adventure uppercase tracking-wider">Quota:</span>
                {editQuota?.id === loc.id ? (
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      value={editQuota.value}
                      onChange={e => setEditQuota({ id: loc.id, value: e.target.value })}
                      className="w-16 bg-transparent border-b border-primary/40 text-sm text-foreground focus:outline-none px-1"
                    />
                    <button
                      onClick={() => handleUpdateQuota(loc, parseInt(editQuota.value, 10))}
                      className="text-primary hover:text-primary/80"
                    >
                      <Save className="w-3 h-3" />
                    </button>
                    <button onClick={() => setEditQuota(null)} className="text-muted-foreground/40 hover:text-foreground">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1">
                    <span className="text-sm text-foreground/80">{loc.quota}</span>
                    <button
                      onClick={() => setEditQuota({ id: loc.id, value: String(loc.quota) })}
                      className="text-muted-foreground/30 hover:text-primary transition-colors"
                    >
                      <Edit2 className="w-3 h-3" />
                    </button>
                  </div>
                )}
              </div>

              {/* QR Code */}
              <button
                onClick={() => setExpandedQR(expandedQR === loc.id ? null : loc.id)}
                className="flex items-center gap-2 text-[10px] font-adventure uppercase tracking-widest text-primary/60 hover:text-primary transition-colors mb-2"
              >
                <QrCode className="w-3 h-3" />
                {expandedQR === loc.id ? 'Hide QR' : 'Show QR'}
              </button>

              <AnimatePresence>
                {expandedQR === loc.id && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden mb-3 flex justify-center"
                  >
                    <QRCodeDisplay barcodeData={loc.barcode_data} label={loc.name} size={120} />
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Claims */}
              <button
                onClick={() => {
                  if (expandedClaims === loc.id) { setExpandedClaims(null); }
                  else { fetchClaims(loc.id); }
                }}
                className="flex items-center gap-2 text-[10px] font-adventure uppercase tracking-widest text-primary/60 hover:text-primary transition-colors mb-3"
              >
                <Users className="w-3 h-3" />
                {expandedClaims === loc.id ? 'Hide Claims' : 'View Claims'}
              </button>

              <AnimatePresence>
                {expandedClaims === loc.id && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden mb-3"
                  >
                    {claimTeams.length === 0 ? (
                      <p className="text-[10px] text-muted-foreground/40 italic">No claims yet.</p>
                    ) : (
                      <div className="space-y-1">
                        {claimTeams.map((ct, i) => (
                          <p key={i} className="text-[11px] text-foreground/60">• {ct.team_name}</p>
                        ))}
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="flex justify-between items-center pt-4 border-t border-primary/5">
                <span className={`text-[10px] uppercase font-adventure ${loc.is_active ? 'text-primary' : 'text-muted-foreground/40'}`}>
                  {loc.is_active ? '● Active' : '○ Inactive'}
                </span>
                <button
                  onClick={() => toggleActive(loc)}
                  className="text-[10px] font-adventure uppercase tracking-widest hover:text-primary underline underline-offset-4 transition-all"
                >
                  {loc.is_active ? 'Deactivate' : 'Activate'}
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      <AdventureModal show={showModal} onClose={() => setShowModal(false)} title="New Treasure">
        <div className="space-y-5">
          <ModalField label="Treasure Name" value={newName} onChange={setNewName} placeholder="e.g. Golden Idol" />
          <ModalField label="Description (optional)" value={newDesc} onChange={setNewDesc} placeholder="Describe this treasure..." />
          <ModalField label="Points" value={newPoints} onChange={setNewPoints} placeholder="e.g. 200" type="number" />
          <ModalField label="Hint (optional)" value={newHint} onChange={setNewHint} placeholder="e.g. Look near the ancient tree..." />
          <ModalField label="Claim Quota" value={newQuota} onChange={setNewQuota} placeholder="e.g. 5" type="number" />
          {limitError && <p className="text-red-600 text-xs">{limitError}</p>}
          <ModalSubmit label="Bury the Treasure" onClick={handleCreate} disabled={!newName || !newPoints || !newQuota || saving} loading={saving} />
        </div>
      </AdventureModal>
    </TabLayout>
  );
}

// ─── Analytics Tab ────────────────────────────────────────────────────────────

function AnalyticsTab() {
  const [stats, setStats] = useState({ teams: 0, events: 0, wahana: 0, scans: 0, scoreLogs: 0 });
  const [topTeams, setTopTeams] = useState<{ name: string; total_points: number }[]>([]);
  const [wahanaActivity, setWahanaActivity] = useState<{ name: string; checkins: number; scored: number }[]>([]);
  const [scanTimeline, setScanTimeline] = useState<{ hour: string; scans: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    const fetchAll = async () => {
      setLoading(true);
      const [
        { count: teamCount },
        { count: eventCount },
        { count: scanCount },
        { count: locCount },
        { count: scoreCount },
        { data: teamsData },
        { data: locationsData },
        { data: scansData },
        { data: scoreLogsData },
      ] = await Promise.all([
        supabase.from('teams').select('*', { count: 'exact', head: true }),
        supabase.from('events').select('*', { count: 'exact', head: true }),
        supabase.from('scans').select('*', { count: 'exact', head: true }),
        supabase.from('locations').select('*', { count: 'exact', head: true }),
        supabase.from('score_logs').select('*', { count: 'exact', head: true }),
        supabase.from('teams').select('name, total_points').order('total_points', { ascending: false }).limit(10),
        supabase.from('locations').select('id, name').eq('is_active', true),
        supabase.from('scans').select('location_id, scanned_at'),
        supabase.from('score_logs').select('location_id'),
      ]);

      setStats({
        teams: teamCount || 0,
        events: eventCount || 0,
        wahana: locCount || 0,
        scans: scanCount || 0,
        scoreLogs: scoreCount || 0,
      });

      // Top teams chart
      setTopTeams((teamsData || []).map(t => ({ name: t.name, total_points: t.total_points || 0 })));

      // Wahana activity chart
      if (locationsData && scansData && scoreLogsData) {
        const checkinMap: Record<string, number> = {};
        const scoreMap: Record<string, number> = {};
        scansData.forEach(s => { checkinMap[s.location_id] = (checkinMap[s.location_id] || 0) + 1; });
        scoreLogsData.forEach(s => { scoreMap[s.location_id] = (scoreMap[s.location_id] || 0) + 1; });
        setWahanaActivity(
          locationsData.map(loc => ({
            name: loc.name.length > 12 ? loc.name.slice(0, 12) + '…' : loc.name,
            checkins: checkinMap[loc.id] || 0,
            scored: scoreMap[loc.id] || 0,
          }))
        );
      }

      // Scan timeline — group by hour
      if (scansData && scansData.length > 0) {
        const hourMap: Record<string, number> = {};
        scansData.forEach(s => {
          if (s.scanned_at) {
            const hour = new Date(s.scanned_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false }).slice(0, 5);
            hourMap[hour] = (hourMap[hour] || 0) + 1;
          }
        });
        const sorted = Object.entries(hourMap).sort(([a], [b]) => a.localeCompare(b));
        setScanTimeline(sorted.map(([hour, scans]) => ({ hour, scans })));
      }

      setLoading(false);
    };
    fetchAll();
  }, []);

  const handleExport = async (type: 'teams' | 'score_logs') => {
    setExporting(true);
    try {
      const res = await fetch(`/api/export?type=${type}`);
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = type === 'teams' ? 'teams-export.csv' : 'score-logs-export.csv';
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // silently fail — user can retry
    } finally {
      setExporting(false);
    }
  };

  // Dynamically import recharts to avoid SSR issues
  const [RechartsComponents, setRechartsComponents] = useState<{
    BarChart: typeof import('recharts').BarChart;
    Bar: typeof import('recharts').Bar;
    XAxis: typeof import('recharts').XAxis;
    YAxis: typeof import('recharts').YAxis;
    CartesianGrid: typeof import('recharts').CartesianGrid;
    Tooltip: typeof import('recharts').Tooltip;
    ResponsiveContainer: typeof import('recharts').ResponsiveContainer;
    LineChart: typeof import('recharts').LineChart;
    Line: typeof import('recharts').Line;
  } | null>(null);

  useEffect(() => {
    import('recharts').then(rc => {
      setRechartsComponents({
        BarChart: rc.BarChart,
        Bar: rc.Bar,
        XAxis: rc.XAxis,
        YAxis: rc.YAxis,
        CartesianGrid: rc.CartesianGrid,
        Tooltip: rc.Tooltip,
        ResponsiveContainer: rc.ResponsiveContainer,
        LineChart: rc.LineChart,
        Line: rc.Line,
      });
    });
  }, []);

  const chartTooltipStyle = {
    backgroundColor: '#0a1a0f',
    border: '1px solid rgba(212,175,55,0.3)',
    borderRadius: '2px',
    color: '#f4e4bc',
    fontSize: '11px',
    fontFamily: 'var(--font-content, sans-serif)',
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="p-10 space-y-10"
    >
      <header className="flex items-start justify-between">
        <div>
          <h2 className="text-5xl font-adventure gold-engraving mb-2">Expedition Metrics</h2>
          <p className="text-muted-foreground italic text-sm">"Knowing the numbers is half the survival."</p>
        </div>
        {/* Export buttons */}
        <div className="flex gap-3 mt-2">
          <button
            onClick={() => handleExport('teams')}
            disabled={exporting}
            className="flex items-center gap-2 bg-primary/20 hover:bg-primary/30 border border-primary/40 text-primary text-[10px] font-adventure uppercase tracking-widest px-4 py-2.5 transition-all disabled:opacity-50"
          >
            <FileText className="w-3.5 h-3.5" />
            Export Teams
          </button>
          <button
            onClick={() => handleExport('score_logs')}
            disabled={exporting}
            className="flex items-center gap-2 bg-primary/10 hover:bg-primary/20 border border-primary/30 text-primary/70 text-[10px] font-adventure uppercase tracking-widest px-4 py-2.5 transition-all disabled:opacity-50"
          >
            <ScrollText className="w-3.5 h-3.5" />
            Export Score Logs
          </button>
        </div>
      </header>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard count={stats.events} label="Events" sub="Total events" />
        <StatCard count={stats.teams} label="Teams" sub="Expedition groups" />
        <StatCard count={stats.wahana} label="Locations" sub="Active relics" />
        <StatCard count={stats.scans} label="Check-ins" sub="Total scans" />
        <StatCard count={stats.scoreLogs} label="Scores Given" sub="By LO" />
      </div>

      {loading || !RechartsComponents ? (
        <div className="flex items-center justify-center py-24 opacity-40">
          <Loader2 className="w-8 h-8 text-primary animate-spin mr-3" />
          <span className="font-adventure text-sm uppercase tracking-widest">Loading charts...</span>
        </div>
      ) : (
        <div className="space-y-8">
          {/* Chart 1: Top 10 Teams by Points */}
          <div className="adventure-card p-6">
            <h3 className="font-adventure text-lg gold-engraving mb-1">Top 10 Teams by Points</h3>
            <p className="text-[10px] text-muted-foreground/50 uppercase tracking-widest font-adventure mb-6">Leaderboard overview</p>
            {topTeams.length === 0 ? (
              <p className="text-center text-sm italic opacity-30 py-8">No team data yet.</p>
            ) : (
              <RechartsComponents.ResponsiveContainer width="100%" height={280}>
                <RechartsComponents.BarChart data={topTeams} margin={{ top: 4, right: 16, left: 0, bottom: 40 }}>
                  <RechartsComponents.CartesianGrid strokeDasharray="3 3" stroke="rgba(212,175,55,0.1)" />
                  <RechartsComponents.XAxis
                    dataKey="name"
                    tick={{ fill: 'rgba(244,228,188,0.5)', fontSize: 10 }}
                    angle={-35}
                    textAnchor="end"
                    interval={0}
                  />
                  <RechartsComponents.YAxis tick={{ fill: 'rgba(244,228,188,0.4)', fontSize: 10 }} />
                  <RechartsComponents.Tooltip contentStyle={chartTooltipStyle} cursor={{ fill: 'rgba(212,175,55,0.05)' }} />
                  <RechartsComponents.Bar dataKey="total_points" name="Points" fill="rgba(212,175,55,0.7)" radius={[2, 2, 0, 0]} />
                </RechartsComponents.BarChart>
              </RechartsComponents.ResponsiveContainer>
            )}
          </div>

          {/* Chart 2: Check-ins & Scores per Wahana */}
          <div className="adventure-card p-6">
            <h3 className="font-adventure text-lg gold-engraving mb-1">Activity per Location</h3>
            <p className="text-[10px] text-muted-foreground/50 uppercase tracking-widest font-adventure mb-6">Check-ins vs scores given per wahana</p>
            {wahanaActivity.length === 0 ? (
              <p className="text-center text-sm italic opacity-30 py-8">No location data yet.</p>
            ) : (
              <RechartsComponents.ResponsiveContainer width="100%" height={280}>
                <RechartsComponents.BarChart data={wahanaActivity} margin={{ top: 4, right: 16, left: 0, bottom: 40 }}>
                  <RechartsComponents.CartesianGrid strokeDasharray="3 3" stroke="rgba(212,175,55,0.1)" />
                  <RechartsComponents.XAxis
                    dataKey="name"
                    tick={{ fill: 'rgba(244,228,188,0.5)', fontSize: 10 }}
                    angle={-35}
                    textAnchor="end"
                    interval={0}
                  />
                  <RechartsComponents.YAxis tick={{ fill: 'rgba(244,228,188,0.4)', fontSize: 10 }} />
                  <RechartsComponents.Tooltip contentStyle={chartTooltipStyle} cursor={{ fill: 'rgba(212,175,55,0.05)' }} />
                  <RechartsComponents.Bar dataKey="checkins" name="Check-ins" fill="rgba(212,175,55,0.6)" radius={[2, 2, 0, 0]} />
                  <RechartsComponents.Bar dataKey="scored" name="Scored" fill="rgba(74,222,128,0.5)" radius={[2, 2, 0, 0]} />
                </RechartsComponents.BarChart>
              </RechartsComponents.ResponsiveContainer>
            )}
          </div>

          {/* Chart 3: Scan Timeline */}
          <div className="adventure-card p-6">
            <h3 className="font-adventure text-lg gold-engraving mb-1">Scan Activity Timeline</h3>
            <p className="text-[10px] text-muted-foreground/50 uppercase tracking-widest font-adventure mb-6">Number of scans per hour during the event</p>
            {scanTimeline.length === 0 ? (
              <p className="text-center text-sm italic opacity-30 py-8">No scan data yet.</p>
            ) : (
              <RechartsComponents.ResponsiveContainer width="100%" height={220}>
                <RechartsComponents.LineChart data={scanTimeline} margin={{ top: 4, right: 16, left: 0, bottom: 20 }}>
                  <RechartsComponents.CartesianGrid strokeDasharray="3 3" stroke="rgba(212,175,55,0.1)" />
                  <RechartsComponents.XAxis dataKey="hour" tick={{ fill: 'rgba(244,228,188,0.5)', fontSize: 10 }} />
                  <RechartsComponents.YAxis tick={{ fill: 'rgba(244,228,188,0.4)', fontSize: 10 }} />
                  <RechartsComponents.Tooltip contentStyle={chartTooltipStyle} />
                  <RechartsComponents.Line
                    type="monotone"
                    dataKey="scans"
                    name="Scans"
                    stroke="rgba(212,175,55,0.8)"
                    strokeWidth={2}
                    dot={{ fill: 'rgba(212,175,55,0.8)', r: 3 }}
                    activeDot={{ r: 5 }}
                  />
                </RechartsComponents.LineChart>
              </RechartsComponents.ResponsiveContainer>
            )}
          </div>
        </div>
      )}
    </motion.div>
  );
}

// ─── Audit Log Tab ────────────────────────────────────────────────────────────

function AuditTab({ activeEvent }: { activeEvent: Event | null }) {
  const [logs, setLogs] = useState<ScoreLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterTeam, setFilterTeam] = useState('');
  const [filterLocation, setFilterLocation] = useState('');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');

  const fetchLogs = useCallback(async () => {
    setLoading(true);

    let query = supabase
      .from('score_logs')
      .select(`
        id, team_id, location_id, score, lo_user_id, created_at,
        teams(name),
        locations(name),
        users(nama)
      `)
      .order('created_at', { ascending: false })
      .limit(200);

    if (filterFrom) query = query.gte('created_at', filterFrom);
    if (filterTo) query = query.lte('created_at', filterTo);

    const { data } = await query;

    const enriched: ScoreLogEntry[] = (data || []).map((row: any) => ({
      id: row.id,
      team_id: row.team_id,
      location_id: row.location_id,
      score: row.score,
      lo_user_id: row.lo_user_id,
      created_at: row.created_at,
      team_name: row.teams?.name,
      location_name: row.locations?.name,
      lo_name: row.users?.nama,
    }));

    // Client-side filter by team/location name
    const filtered = enriched.filter(log => {
      if (filterTeam && !log.team_name?.toLowerCase().includes(filterTeam.toLowerCase())) return false;
      if (filterLocation && !log.location_name?.toLowerCase().includes(filterLocation.toLowerCase())) return false;
      return true;
    });

    setLogs(filtered);
    setLoading(false);
  }, [filterTeam, filterLocation, filterFrom, filterTo]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="p-10 space-y-8"
    >
      <header>
        <h2 className="text-4xl font-adventure gold-engraving mb-2">Audit Log</h2>
        <p className="text-muted-foreground italic text-sm">"Every mark on the map tells a story."</p>
      </header>

      {/* Filters */}
      <div className="adventure-card p-6">
        <div className="flex items-center gap-2 mb-4">
          <Filter className="w-4 h-4 text-primary/60" />
          <p className="font-adventure text-xs uppercase tracking-widest text-primary/60">Filters</p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-[10px] uppercase tracking-widest font-adventure text-foreground/40 mb-1">Team</label>
            <input
              type="text"
              value={filterTeam}
              onChange={e => setFilterTeam(e.target.value)}
              placeholder="Filter by team..."
              className="w-full bg-transparent border-b border-primary/20 py-2 text-sm text-foreground focus:outline-none focus:border-primary/60 transition-colors placeholder:text-foreground/20"
            />
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-widest font-adventure text-foreground/40 mb-1">Location</label>
            <input
              type="text"
              value={filterLocation}
              onChange={e => setFilterLocation(e.target.value)}
              placeholder="Filter by location..."
              className="w-full bg-transparent border-b border-primary/20 py-2 text-sm text-foreground focus:outline-none focus:border-primary/60 transition-colors placeholder:text-foreground/20"
            />
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-widest font-adventure text-foreground/40 mb-1">From</label>
            <input
              type="datetime-local"
              value={filterFrom}
              onChange={e => setFilterFrom(e.target.value)}
              className="w-full bg-transparent border-b border-primary/20 py-2 text-sm text-foreground focus:outline-none focus:border-primary/60 transition-colors"
            />
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-widest font-adventure text-foreground/40 mb-1">To</label>
            <input
              type="datetime-local"
              value={filterTo}
              onChange={e => setFilterTo(e.target.value)}
              className="w-full bg-transparent border-b border-primary/20 py-2 text-sm text-foreground focus:outline-none focus:border-primary/60 transition-colors"
            />
          </div>
        </div>
      </div>

      {/* Table */}
      {loading ? <LoadingState /> : logs.length === 0 ? (
        <EmptyState tab="audit log" />
      ) : (
        <div className="adventure-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-primary/5 border-b border-primary/10">
                <tr>
                  <th className="text-left px-6 py-4 text-[10px] font-adventure uppercase tracking-widest text-primary/60">Timestamp</th>
                  <th className="text-left px-6 py-4 text-[10px] font-adventure uppercase tracking-widest text-primary/60">Team</th>
                  <th className="text-left px-6 py-4 text-[10px] font-adventure uppercase tracking-widest text-primary/60">Location</th>
                  <th className="text-right px-6 py-4 text-[10px] font-adventure uppercase tracking-widest text-primary/60">Score</th>
                  <th className="text-left px-6 py-4 text-[10px] font-adventure uppercase tracking-widest text-primary/60">LO</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log, i) => (
                  <tr key={log.id} className={`border-b border-primary/5 hover:bg-primary/5 transition-colors ${i % 2 === 0 ? '' : 'bg-primary/[0.02]'}`}>
                    <td className="px-6 py-3 text-[11px] text-muted-foreground/60 font-mono">
                      {new Date(log.created_at).toLocaleString('id-ID')}
                    </td>
                    <td className="px-6 py-3 text-sm text-foreground/80">{log.team_name || log.team_id.slice(0, 8)}</td>
                    <td className="px-6 py-3 text-sm text-foreground/60">{log.location_name || log.location_id.slice(0, 8)}</td>
                    <td className="px-6 py-3 text-right">
                      <span className="font-adventure text-primary">{log.score}</span>
                    </td>
                    <td className="px-6 py-3 text-[11px] text-muted-foreground/50">{log.lo_name || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-6 py-3 border-t border-primary/5">
            <p className="text-[10px] text-muted-foreground/30 font-adventure uppercase tracking-widest">
              Showing {logs.length} records
            </p>
          </div>
        </div>
      )}
    </motion.div>
  );
}

// ─── Shared UI Components ─────────────────────────────────────────────────────

function TabLayout({
  title,
  subtitle,
  onAdd,
  extraActions,
  children,
}: {
  title: string;
  subtitle: string;
  onAdd: () => void;
  extraActions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="p-10 space-y-8"
    >
      <header className="flex justify-between items-end">
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}>
          <div className="flex items-center gap-2 mb-2">
            <span className="h-px w-8 bg-primary/40" />
            <p className="text-[10px] uppercase tracking-[0.4em] text-primary font-adventure">Current Log</p>
          </div>
          <h2 className="text-4xl font-adventure gold-engraving mb-1">{title}</h2>
          <p className="text-muted-foreground text-sm italic opacity-70">{subtitle}</p>
        </motion.div>

        <div className="flex items-center gap-3">
          {extraActions}
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={onAdd}
            className="flex items-center gap-3 bg-secondary hover:bg-secondary/80 text-white px-8 py-4 rounded-none font-adventure shadow-[0_10px_30px_rgba(139,69,19,0.4)] border border-primary/20 relative group overflow-hidden"
          >
            <div className="absolute inset-0 bg-primary/10 opacity-0 group-hover:opacity-100 transition-opacity" />
            <Plus className="w-5 h-5 text-primary" />
            New Entry
          </motion.button>
        </div>
      </header>

      {children}
    </motion.div>
  );
}

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
  return (
    <AnimatePresence>
      {show && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/80 backdrop-blur-md"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="relative w-full max-w-lg parchment p-10 rounded-none border-[12px] border-double border-[#d4b483] max-h-[90vh] overflow-y-auto"
          >
            <button
              onClick={onClose}
              className="absolute top-4 right-4 text-[#2b1d0e]/40 hover:text-[#2b1d0e] transition-colors"
            >
              <X className="w-6 h-6" />
            </button>

            <div className="flex items-center gap-3 mb-8">
              <Hammer className="w-8 h-8 text-[#8b4513]" />
              <h3 className="text-2xl font-adventure text-[#2b1d0e]">{title}</h3>
            </div>

            {children}

            <div className="mt-8 pt-6 border-t border-[#2b1d0e]/10 text-center">
              <p className="text-[10px] italic text-[#2b1d0e]/40">"Everything you can imagine is real."</p>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

function ModalField({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div>
      <label className="block text-[10px] uppercase tracking-widest font-adventure text-[#2b1d0e]/60 mb-2">{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-transparent border-b-2 border-[#2b1d0e]/20 p-3 font-adventure text-[#2b1d0e] placeholder:text-[#2b1d0e]/20 focus:outline-none focus:border-[#8b4513] transition-colors"
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
      className="w-full flex items-center justify-center gap-2 bg-[#8b4513] hover:bg-[#5d2e0d] disabled:opacity-30 text-[#f4e4bc] py-4 font-adventure uppercase tracking-[0.2em] transition-all shadow-xl"
    >
      {loading && <Loader2 className="w-4 h-4 animate-spin" />}
      {label}
    </button>
  );
}

function SidebarLink({ icon, label, active, onClick }: { icon: React.ReactNode; label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`w-full group flex items-center gap-4 px-5 py-3 rounded-none transition-all duration-300 relative ${
        active ? 'text-primary' : 'text-foreground/40 hover:text-foreground'
      }`}
    >
      {active && (
        <motion.div
          layoutId="sidebar-active"
          className="absolute inset-0 bg-primary/5 border-r-4 border-primary z-0"
        />
      )}
      <div className={`relative z-10 transition-transform group-hover:scale-110 ${active ? 'scale-110' : ''}`}>
        {icon}
      </div>
      <span className="relative z-10 font-adventure text-xs tracking-[0.2em] uppercase">{label}</span>
      {active && <Flame className="absolute right-4 w-3 h-3 text-primary torch-glow" />}
    </button>
  );
}

function EmptyState({ tab }: { tab: string }) {
  return (
    <div className="adventure-card border-dashed border-primary/10 p-24 flex flex-col items-center justify-center text-center opacity-50">
      <div className="bg-primary/5 p-6 rounded-full mb-6 border border-primary/10">
        <Compass className="w-12 h-12 text-primary" />
      </div>
      <h3 className="font-adventure text-2xl mb-2 gold-engraving">Unknown Territory</h3>
      <p className="text-muted-foreground max-w-sm italic">
        The {tab} archives are currently empty. Use the tools above to establish your presence in this region.
      </p>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="flex flex-col items-center justify-center p-32 opacity-30 italic">
      <Compass className="w-16 h-16 animate-spin-slow mb-4 text-primary" />
      Consulting the ancient archives...
    </div>
  );
}

function StatCard({ count, label, sub }: { count: number; label: string; sub: string }) {
  return (
    <motion.div whileHover={{ scale: 1.02 }} className="adventure-card p-6 border-primary/10">
      <p className="text-4xl font-adventure gold-engraving mb-1">{count}</p>
      <p className="text-[10px] uppercase font-adventure tracking-wider text-primary mb-2">{label}</p>
      <p className="text-[10px] text-muted-foreground italic opacity-50">{sub}</p>
    </motion.div>
  );
}
