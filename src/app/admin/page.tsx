'use client';

import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import AuthGuard from '@/components/AuthGuard';
import QRCodeDisplay from '@/components/admin/QRCodeDisplay';
import CSVImporter from '@/components/admin/CSVImporter';
import EventSelector from '@/components/admin/EventSelector';
import UsersTab from '@/components/admin/UsersTab';

// Dynamically import chart components to avoid SSR issues with recharts
const TopTeamsChart = dynamic(() => import('@/components/admin/AnalyticsCharts').then(m => m.TopTeamsChart), { ssr: false });
const WahanaActivityChart = dynamic(() => import('@/components/admin/AnalyticsCharts').then(m => m.WahanaActivityChart), { ssr: false });
const ScanTimelineChart = dynamic(() => import('@/components/admin/AnalyticsCharts').then(m => m.ScanTimelineChart), { ssr: false });
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
  created_at: string;
  member_count?: number;
  captain_name?: string;
}

interface UserSummary {
  id: string;
  name: string;
  npk: string;
  role: string;
  birth_date: string | null;
  team_id?: string;
}

interface Activity {
  id: string;
  name: string;
  description?: string;
  type: 'wahana' | 'challenge_regular' | 'challenge_popup' | 'challenge_additional';
  max_points: number;
  created_at: string;
}

interface TreasureHunt {
  id: string;
  name: string;
  hint_text: string;
  points: number;
  quota: number;
  remaining_quota: number;
}

interface ScoreLogEntry {
  id: string;
  team_id: string;
  activity_id: string;
  points_awarded: number;
  lo_id: string;
  created_at: string;
  team_name?: string;
  activity_name?: string;
  lo_name?: string;
}

interface TimerStatus {
  status: 'idle' | 'running' | 'paused' | 'finished';
  durationMinutes: number;
  elapsedSeconds: number;
  startedAt: string | null;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AdminDashboard() {
  const { logout } = useAuth();
  const [activeTab, setActiveTab] = useState('timer'); // Default to Timer control
  const [timerStatus, setTimerStatus] = useState<TimerStatus | null>(null);

  // Fetch global event settings on mount
  const fetchSettings = useCallback(async () => {
    try {
      const { data } = await supabase.from('settings').select('*');
      if (data) {
        const s: Record<string, string> = Object.fromEntries(data.map(item => [item.key, item.value]));
        setTimerStatus({
          status: (s.event_status as any) || 'idle',
          durationMinutes: parseInt(s.event_duration_minutes || '0', 10),
          elapsedSeconds: parseInt(s.event_elapsed_seconds || '0', 10),
          startedAt: s.event_started_at || null,
        });
      }
    } catch (e) {
      console.error('[AdminDashboard] settings fetch error:', e);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
    // Poll settings every 10s or use real-time
    const interval = setInterval(fetchSettings, 30000);
    return () => clearInterval(interval);
  }, [fetchSettings]);

  return (
    <AuthGuard allowedRoles={['admin']}>
      <div className="relative flex h-screen bg-black overflow-hidden font-content selection:bg-primary selection:text-primary-foreground">
        {/* Immersive Background */}
        <div
          className="absolute inset-0 z-0 bg-cover bg-center opacity-40"
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
            <SidebarLink icon={<Flame className="w-5 h-5" />} label="Event Control" active={activeTab === 'timer'} onClick={() => setActiveTab('timer')} />
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
            <SidebarLink icon={<LogOut className="w-5 h-5 text-accent" />} label="Abort Mission" active={false} onClick={logout} />
          </div>
        </aside>

        {/* Main Content */}
        <main className="relative z-20 flex-1 overflow-y-auto">
          <AnimatePresence mode="wait">
            {activeTab === 'timer' && <EventControlTab key="timer" status={timerStatus} onUpdate={fetchSettings} />}
            {activeTab === 'teams' && <TeamsTabComponent key="teams" />}
            {activeTab === 'users' && <UsersTab key="users" />}
            {activeTab === 'wahana' && <WahanaTab key="wahana" />}
            {activeTab === 'challenges' && <ChallengesTab key="challenges" />}
            {activeTab === 'treasure' && <TreasureTab key="treasure" />}
            {activeTab === 'analytics' && <AnalyticsTab key="analytics" />}
            {activeTab === 'audit' && <AuditTab key="audit" />}
          </AnimatePresence>
        </main>
      </div>
    </AuthGuard>
  );
}

// ─── Event Control Tab ───────────────────────────────────────────────────────

function EventControlTab({
  status,
  onUpdate,
}: {
  status: TimerStatus | null;
  onUpdate: () => void;
}) {
  const [durationMinutes, setDurationMinutes] = useState(status?.durationMinutes || 480);
  const [gachaProb, setGachaProb] = useState('0.3');
  const [mapUrl, setMapUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState('');

  // Fetch from settings
  useEffect(() => {
    supabase.from('settings').select('*').in('key', ['gacha_probability', 'map_image_url']).then(({ data }) => {
      if (data) {
        const g = data.find(d => d.key === 'gacha_probability')?.value;
        const m = data.find(d => d.key === 'map_image_url')?.value;
        if (g) setGachaProb(g);
        if (m) setMapUrl(m);
      }
    });
  }, []);

  const handleUpdateSettings = async () => {
    setSaving(true);
    setError('');
    try {
      const updates = [
        { key: 'event_duration_minutes', value: String(durationMinutes) },
        { key: 'gacha_probability', value: gachaProb },
        { key: 'map_image_url', value: mapUrl },
      ];
      for (const item of updates) {
        await supabase.from('settings').upsert(item);
      }
      onUpdate();
    } catch {
      setError('Gagal menyimpan settings');
    } finally {
      setSaving(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setSaving(true);
      setError('');
      
      const fileName = `map_${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
      const { error: uploadError } = await supabase.storage
        .from('maps')
        .upload(fileName, file, { cacheControl: '3600', upsert: false });

      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage
        .from('maps')
        .getPublicUrl(fileName);

      setMapUrl(publicUrlData.publicUrl);
    } catch (err: any) {
      setError(err.message || 'Gagal mengupload peta');
    } finally {
      setSaving(false);
    }
  };

  const handleTimerAction = async (action: 'start' | 'pause' | 'resume' | 'reset') => {
    setActionLoading(action);
    setError('');
    try {
      const res = await fetch(`/api/admin/timer/${action}`, { method: 'POST' });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || `Gagal ${action} timer`);
      }
      onUpdate();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setActionLoading(null);
    }
  };

  const [localElapsed, setLocalElapsed] = useState(0);

  // Compute live elapsed time for UI ticking without writing to DB
  useEffect(() => {
    if (!status) return;

    const compute = () => {
      if (status.status === 'running' && status.startedAt) {
        const timeSinceStart = Math.floor((Date.now() - new Date(status.startedAt).getTime()) / 1000);
        return status.elapsedSeconds + timeSinceStart;
      }
      return status.elapsedSeconds;
    };

    setLocalElapsed(compute());

    if (status.status === 'running') {
      const interval = setInterval(() => {
        setLocalElapsed(compute());
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [status]);

  if (!status) return <LoadingState />;

  const formatTime = (totalSeconds: number) => {
    const hrs = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="p-10 space-y-8">
      <header>
        <h2 className="text-4xl font-adventure gold-engraving">Event Control</h2>
        <p className="text-muted-foreground text-sm italic">Pusat komando waktu dan probabilitas</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Timer Panel */}
        <div className="adventure-card p-8 flex flex-col items-center justify-center text-center space-y-6">
          <div className="space-y-2">
            <p className="text-[10px] uppercase tracking-[0.3em] text-primary/60 font-adventure">Timer Status</p>
            <h3 className={`text-5xl font-adventure tracking-tighter ${status.status === 'running' ? 'text-green-400' : 'text-primary'}`}>
              {status.status.toUpperCase()}
            </h3>
          </div>

          <div className="py-4 border-y border-primary/10 w-full">
            <p className="text-[10px] uppercase font-adventure text-foreground/40 mb-1">Elapsed Time</p>
            <p className="text-6xl font-mono tracking-tight text-foreground/90">{formatTime(localElapsed)}</p>
          </div>

          <div className="flex gap-4 w-full justify-center">
            {status.status === 'idle' && (
              <button onClick={() => handleTimerAction('start')} disabled={!!actionLoading} className="bg-primary/20 border border-primary/40 px-8 py-3 font-adventure text-primary hover:bg-primary/30 flex items-center gap-2">
                <Play className="w-4 h-4" /> START EXPEDITION
              </button>
            )}
            {status.status === 'running' && (
              <button onClick={() => handleTimerAction('pause')} disabled={!!actionLoading} className="bg-amber-900/20 border border-amber-500/40 px-8 py-3 font-adventure text-amber-400 hover:bg-amber-900/30 flex items-center gap-2">
                <Pause className="w-4 h-4" /> PAUSE
              </button>
            )}
            {status.status === 'paused' && (
              <button onClick={() => handleTimerAction('resume')} disabled={!!actionLoading} className="bg-green-900/20 border border-green-500/40 px-8 py-3 font-adventure text-green-400 hover:bg-green-900/30 flex items-center gap-2">
                <Play className="w-4 h-4" /> RESUME
              </button>
            )}
            {(status.status === 'paused' || status.status === 'finished' || status.status === 'running') && (
              <button onClick={() => handleTimerAction('reset')} disabled={!!actionLoading} className="border border-red-500/40 px-8 py-3 font-adventure text-red-400 hover:bg-red-500/10 flex items-center gap-2">
                <RotateCcw className="w-4 h-4" /> RESET
              </button>
            )}
          </div>
        </div>

        {/* Settings Panel */}
        <div className="adventure-card p-8 space-y-8">
          <div>
            <h4 className="font-adventure text-primary text-sm uppercase tracking-widest mb-4">Event Parameters</h4>
            <div className="space-y-6">
              <div>
                <label className="block text-[10px] uppercase text-foreground/40 font-adventure mb-2">Duration (Minutes)</label>
                <input type="number" value={durationMinutes} onChange={e => setDurationMinutes(parseInt(e.target.value))} className="w-full bg-transparent border-b border-primary/20 py-2 font-mono text-xl focus:outline-none focus:border-primary" />
              </div>
              <div>
                <label className="block text-[10px] uppercase text-foreground/40 font-adventure mb-2">Treasure Hunt Probability (0.0 - 1.0)</label>
                <input type="text" value={gachaProb} onChange={e => setGachaProb(e.target.value)} className="w-full bg-transparent border-b border-primary/20 py-2 font-mono text-xl focus:outline-none focus:border-primary" />
              </div>
              <div>
                <label className="block text-[10px] uppercase text-foreground/40 font-adventure mb-2">Expedition Map URL</label>
                <div className="flex gap-4">
                  <input type="text" value={mapUrl} onChange={e => setMapUrl(e.target.value)} placeholder="/images/MAP TSC.png" className="flex-1 bg-transparent border-b border-primary/20 py-2 font-mono text-lg focus:outline-none focus:border-primary" />
                  <div className="relative">
                    <input type="file" accept="image/*" onChange={handleFileUpload} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" disabled={saving} />
                    <button type="button" disabled={saving} className="bg-primary/20 px-4 py-2 font-adventure text-primary border border-primary/40 hover:bg-primary/30 uppercase text-[10px] tracking-widest h-full flex items-center justify-center min-w-[80px]">
                      Upload
                    </button>
                  </div>
                </div>
              </div>
            </div>
            {error && <p className="text-red-400 text-xs mt-4">{error}</p>}
            <button onClick={handleUpdateSettings} disabled={saving} className="mt-8 w-full bg-primary/20 py-3 font-adventure text-primary border border-primary/40 hover:bg-primary/30 tracking-widest uppercase text-xs">
              {saving ? 'Saving...' : 'Save Parameters'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Wahana Tab ───────────────────────────────────────────────────────────────

// ─── Wahana Tab ───────────────────────────────────────────────────────────────

function WahanaTab() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newPoints, setNewPoints] = useState('');
  const [saving, setSaving] = useState(false);
  const [expandedQR, setExpandedQR] = useState<string | null>(null);

  const fetchWahana = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('activities')
      .select('*')
      .eq('type', 'wahana')
      .order('created_at', { ascending: false });
    setActivities(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchWahana(); }, [fetchWahana]);

  const handleCreate = async () => {
    if (!newName || !newPoints) return;
    setSaving(true);
    const { error } = await supabase.from('activities').insert({
      name: newName,
      description: newDesc || null,
      max_points: parseInt(newPoints, 10),
      type: 'wahana',
    });
    if (!error) {
      setShowModal(false);
      setNewName(''); setNewDesc(''); setNewPoints('');
      fetchWahana();
    }
    setSaving(false);
  };

  return (
    <TabLayout title="Wahana" subtitle="Atraksi utama ekspedisi" onAdd={() => setShowModal(true)}>
      {loading ? <LoadingState /> : activities.length === 0 ? <EmptyState tab="wahana" /> : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {activities.map((act, idx) => (
            <motion.div
              key={act.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05 }}
              className="adventure-card p-6 group"
            >
              <div className="flex justify-between items-start mb-4">
                <div className="p-2 rounded-lg border bg-primary/20 border-primary/40">
                  <MapIcon className="w-5 h-5 text-primary" />
                </div>
                <span className="text-[10px] font-adventure text-primary bg-primary/10 px-2 py-0.5">{act.max_points} MAX PTS</span>
              </div>
              <h3 className="font-adventure text-lg text-foreground mb-1 group-hover:text-primary transition-colors">{act.name}</h3>
              <p className="text-xs text-muted-foreground/60 mb-4 line-clamp-2">{act.description}</p>

              <button onClick={() => setExpandedQR(expandedQR === act.id ? null : act.id)} className="flex items-center gap-2 text-[10px] font-adventure uppercase tracking-widest text-primary/60 hover:text-primary transition-colors">
                <QrCode className="w-3 h-3" />
                {expandedQR === act.id ? 'Hide QR' : 'Show QR'}
              </button>

              <AnimatePresence>
                {expandedQR === act.id && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden mt-4 flex flex-col items-center">
                    <div className="bg-white p-3 rounded-xl mb-2">
                       <QRCodeDisplay barcodeData={act.id} label={act.name} size={150} />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ))}
        </div>
      )}

      <AdventureModal show={showModal} onClose={() => setShowModal(false)} title="New Wahana">
        <div className="space-y-5">
          <ModalField label="Wahana Name" value={newName} onChange={setNewName} placeholder="e.g. Temple of Doom" />
          <ModalField label="Description" value={newDesc} onChange={setNewDesc} placeholder="What happens here?" />
          <ModalField label="Max Points" value={newPoints} onChange={setNewPoints} placeholder="e.g. 100" type="number" />
          <ModalSubmit label="Establish Wahana" onClick={handleCreate} disabled={!newName || !newPoints || saving} loading={saving} />
        </div>
      </AdventureModal>
    </TabLayout>
  );
}

// ─── Challenges Tab ───────────────────────────────────────────────────────────

const CHALLENGE_LIMITS = { regular: 6, popup: 2, additional: 3 };

// ─── Challenges Tab ──────────────────────────────────────────────────────────

function ChallengesTab() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newPoints, setNewPoints] = useState('');
  const [newType, setNewType] = useState<Activity['type']>('challenge_regular');
  const [saving, setSaving] = useState(false);
  const [expandedQR, setExpandedQR] = useState<string | null>(null);

  const fetchChallenges = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('activities')
      .select('*')
      .in('type', ['challenge_regular', 'challenge_popup', 'challenge_additional'])
      .order('created_at', { ascending: false });
    setActivities(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchChallenges(); }, [fetchChallenges]);

  const handleCreate = async () => {
    if (!newName || !newPoints) return;
    setSaving(true);
    const { error } = await supabase.from('activities').insert({
      name: newName,
      description: newDesc || null,
      max_points: parseInt(newPoints, 10),
      type: newType,
    });
    if (!error) {
      setShowModal(false);
      setNewName(''); setNewDesc(''); setNewPoints('');
      fetchChallenges();
    }
    setSaving(false);
  };

  const typeColor = (type: string) => {
    if (type === 'challenge_regular') return 'bg-blue-500/20 text-blue-300';
    if (type === 'challenge_popup') return 'bg-orange-500/20 text-orange-300';
    if (type === 'challenge_additional') return 'bg-purple-500/20 text-purple-300';
    return 'bg-foreground/10 text-foreground/60';
  };

  return (
    <TabLayout title="Challenges" subtitle="Misi sampingan berhadiah" onAdd={() => setShowModal(true)}>
      {loading ? <LoadingState /> : activities.length === 0 ? <EmptyState tab="challenges" /> : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {activities.map((act, idx) => (
            <motion.div
              key={act.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05 }}
              className="adventure-card p-6 group"
            >
              <div className="flex justify-between items-start mb-4">
                <div className="p-2 rounded-lg border bg-primary/20 border-primary/40">
                  <Sword className="w-5 h-5 text-primary" />
                </div>
                <div className="flex items-center gap-2">
                   <span className={`text-[9px] font-adventure uppercase px-2 py-0.5 ${typeColor(act.type)}`}>
                    {act.type.replace('challenge_', '')}
                  </span>
                  <span className="text-[10px] font-adventure text-primary bg-primary/10 px-2 py-0.5">{act.max_points} MAX PTS</span>
                </div>
              </div>
              <h3 className="font-adventure text-lg text-foreground mb-1 group-hover:text-primary transition-colors">{act.name}</h3>
              <p className="text-xs text-muted-foreground/60 mb-4 line-clamp-2">{act.description}</p>

              <button onClick={() => setExpandedQR(expandedQR === act.id ? null : act.id)} className="flex items-center gap-2 text-[10px] font-adventure uppercase tracking-widest text-primary/60 hover:text-primary transition-colors">
                <QrCode className="w-3 h-3" />
                {expandedQR === act.id ? 'Hide QR' : 'Show QR'}
              </button>

              <AnimatePresence>
                {expandedQR === act.id && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden mt-4 flex flex-col items-center">
                    <div className="bg-white p-3 rounded-xl mb-2">
                       <QRCodeDisplay barcodeData={act.id} label={act.name} size={150} />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ))}
        </div>
      )}

      <AdventureModal show={showModal} onClose={() => setShowModal(false)} title="New Challenge">
        <div className="space-y-5">
          <ModalField label="Challenge Name" value={newName} onChange={setNewName} placeholder="e.g. Bridge of Doom" />
          <ModalField label="Description" value={newDesc} onChange={setNewDesc} placeholder="Misi apa ini?" />
          <ModalField label="Points" value={newPoints} onChange={setNewPoints} placeholder="e.g. 50" type="number" />
          <div>
            <label className="block text-[10px] uppercase tracking-widest font-adventure text-[#2b1d0e]/60 mb-2">Challenge Type</label>
            <div className="flex gap-2">
              {(['challenge_regular', 'challenge_popup', 'challenge_additional'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setNewType(t)}
                  className={`flex-1 py-2 text-[8px] font-adventure uppercase tracking-widest border transition-all ${
                    newType === t ? 'bg-[#8b4513] text-[#f4e4bc] border-[#8b4513]' : 'bg-transparent text-[#2b1d0e]/60 border-[#2b1d0e]/20'
                  }`}
                >
                  {t.replace('challenge_', '')}
                </button>
              ))}
            </div>
          </div>
          <ModalSubmit label="Create Challenge" onClick={handleCreate} disabled={!newName || !newPoints || saving} loading={saving} />
        </div>
      </AdventureModal>
    </TabLayout>
  );
}

// ─── Treasure Tab ─────────────────────────────────────────────────────────────

const MAX_TREASURE = 20;

// ─── Treasure Tab ─────────────────────────────────────────────────────────────

function TreasureTab() {
  const [treasures, setTreasures] = useState<TreasureHunt[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPoints, setNewPoints] = useState('');
  const [newHint, setNewHint] = useState('');
  const [newQuota, setNewQuota] = useState('');
  const [saving, setSaving] = useState(false);
  const [expandedQR, setExpandedQR] = useState<string | null>(null);
  const [expandedClaims, setExpandedClaims] = useState<string | null>(null);
  const [claimTeams, setClaimTeams] = useState<{ team_name: string }[]>([]);

  const fetchTreasures = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('treasure_hunts').select('*').order('created_at', { ascending: false });
    setTreasures(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchTreasures(); }, [fetchTreasures]);

  const fetchClaims = async (treasureId: string) => {
    const { data } = await supabase
      .from('treasure_hunt_claims')
      .select('team_id, teams(name)')
      .eq('treasure_hunt_id', treasureId);

    setClaimTeams((data || []).map((s: any) => ({ team_name: s.teams?.name || 'Unknown' })));
    setExpandedClaims(treasureId);
  };

  const handleCreate = async () => {
    if (!newName || !newPoints || !newQuota) return;
    setSaving(true);
    const { error } = await supabase.from('treasure_hunts').insert({
      name: newName,
      points: parseInt(newPoints, 10),
      hint_text: newHint || null,
      quota: parseInt(newQuota, 10),
      remaining_quota: parseInt(newQuota, 10),
    });
    if (!error) {
      setShowModal(false);
      setNewName(''); setNewPoints(''); setNewHint(''); setNewQuota('');
      fetchTreasures();
    }
    setSaving(false);
  };

  return (
    <TabLayout title="Treasure Hunt" subtitle="Harta karun tersembunyi" onAdd={() => setShowModal(true)}>
      {loading ? <LoadingState /> : treasures.length === 0 ? <EmptyState tab="treasure" /> : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {treasures.map((th, idx) => (
            <motion.div
              key={th.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05 }}
              className="adventure-card p-6 group"
            >
              <div className="flex justify-between items-start mb-4">
                <div className="p-2 rounded-lg border bg-primary/20 border-primary/40">
                  <Gem className="w-5 h-5 text-primary" />
                </div>
                <div className="text-right">
                   <p className="text-[10px] font-adventure text-primary">{th.points} PTS</p>
                   <p className="text-[9px] text-muted-foreground/40">{th.remaining_quota}/{th.quota} REMAINING</p>
                </div>
              </div>

              <h3 className="font-adventure text-lg text-foreground mb-1 group-hover:text-primary transition-colors">{th.name}</h3>
              <p className="text-[10px] italic text-primary/50 mb-4 tracking-wider">Hint: {th.hint_text}</p>

              <div className="flex flex-col gap-2">
                <button
                  onClick={() => setExpandedQR(expandedQR === th.id ? null : th.id)}
                  className="flex items-center gap-2 text-[10px] font-adventure uppercase tracking-widest text-primary/60 hover:text-primary transition-colors"
                >
                  <QrCode className="w-3 h-3" />
                  {expandedQR === th.id ? 'Hide QR' : 'Show QR'}
                </button>
                <button
                  onClick={() => expandedClaims === th.id ? setExpandedClaims(null) : fetchClaims(th.id)}
                  className="flex items-center gap-2 text-[10px] font-adventure uppercase tracking-widest text-primary/60 hover:text-primary transition-colors"
                >
                  <Users className="w-3 h-3" />
                  {expandedClaims === th.id ? 'Hide Claims' : 'View Claims'}
                </button>
              </div>

              <AnimatePresence>
                {expandedQR === th.id && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden mt-4 flex flex-col items-center">
                    <div className="bg-white p-3 rounded-xl mb-2">
                       <QRCodeDisplay barcodeData={th.id} label={th.name} size={150} />
                    </div>
                  </motion.div>
                )}
                {expandedClaims === th.id && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden mt-4 space-y-1">
                    <p className="text-[10px] uppercase font-adventure text-primary/40 border-b border-primary/10 pb-1">Claimed By:</p>
                    {claimTeams.length === 0 ? <p className="text-[10px] italic opacity-30">No claims yet</p> : claimTeams.map((c, i) => (
                      <p key={i} className="text-[11px] text-foreground/70">• {c.team_name}</p>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ))}
        </div>
      )}

      <AdventureModal show={showModal} onClose={() => setShowModal(false)} title="New Treasure">
        <div className="space-y-5">
          <ModalField label="Treasure Name" value={newName} onChange={setNewName} placeholder="e.g. Golden Idol" />
          <ModalField label="Points" value={newPoints} onChange={setNewPoints} placeholder="e.g. 500" type="number" />
          <ModalField label="Hint" value={newHint} onChange={setNewHint} placeholder="Di mana dia berada?" />
          <ModalField label="Quota" value={newQuota} onChange={setNewQuota} placeholder="e.g. 1" type="number" />
          <ModalSubmit label="Bury Treasure" onClick={handleCreate} disabled={!newName || !newPoints || !newQuota || saving} loading={saving} />
        </div>
      </AdventureModal>
    </TabLayout>
  );
}
// ─── Analytics Tab ────────────────────────────────────────────────────────────

function AnalyticsTab() {
  const [stats, setStats] = useState({ teams: 0, activities: 0, scans: 0, scoreLogs: 0 });
  const [topTeams, setTopTeams] = useState<{ name: string; total_points: number }[]>([]);
  const [activityStats, setActivityStats] = useState<{ name: string; checkins: number; scored: number }[]>([]);
  const [scanTimeline, setScanTimeline] = useState<{ hour: string; scans: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    const fetchAll = async () => {
      setLoading(true);
      const [
        { count: teamCount },
        { count: scanCount },
        { count: actCount },
        { count: scoreCount },
        { data: teamsData },
        { data: activitiesData },
        { data: activityRegsData },
        { data: scoreLogsData },
      ] = await Promise.all([
        supabase.from('teams').select('*', { count: 'exact', head: true }),
        supabase.from('activity_registrations').select('*', { count: 'exact', head: true }),
        supabase.from('activities').select('*', { count: 'exact', head: true }),
        supabase.from('score_logs').select('*', { count: 'exact', head: true }),
        supabase.from('teams').select('name, total_points').order('total_points', { ascending: false }).limit(10),
        supabase.from('activities').select('id, name'),
        supabase.from('activity_registrations').select('activity_id, created_at'),
        supabase.from('score_logs').select('activity_id'),
      ]);

      setStats({
        teams: teamCount || 0,
        activities: actCount || 0,
        scans: scanCount || 0,
        scoreLogs: scoreCount || 0,
      });

      // Top teams chart
      setTopTeams((teamsData || []).map(t => ({ name: t.name, total_points: t.total_points || 0 })));

      // Activity stats chart
      if (activitiesData && activityRegsData && scoreLogsData) {
        const checkinMap: Record<string, number> = {};
        const scoreMap: Record<string, number> = {};
        activityRegsData.forEach(s => { checkinMap[s.activity_id] = (checkinMap[s.activity_id] || 0) + 1; });
        scoreLogsData.forEach(s => { scoreMap[s.activity_id] = (scoreMap[s.activity_id] || 0) + 1; });
        setActivityStats(
          activitiesData.map(act => ({
            name: act.name.length > 12 ? act.name.slice(0, 12) + '…' : act.name,
            checkins: checkinMap[act.id] || 0,
            scored: scoreMap[act.id] || 0,
          }))
        );
      }

      // Scan timeline
      if (activityRegsData && activityRegsData.length > 0) {
        const hourMap: Record<string, number> = {};
        activityRegsData.forEach(s => {
          if (s.created_at) {
            const hour = new Date(s.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false }).slice(0, 5);
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
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard count={stats.teams} label="Teams" sub="Expedition groups" />
        <StatCard count={stats.activities} label="Activities" sub="Game stations" />
        <StatCard count={stats.scans} label="Check-ins" sub="Total scans" />
        <StatCard count={stats.scoreLogs} label="Scores Given" sub="By LO" />
      </div>

      {loading ? (
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
              <TopTeamsChart data={topTeams} />
            )}
          </div>

          {/* Chart 2: Check-ins & Scores per Activity */}
          <div className="adventure-card p-6">
            <h3 className="font-adventure text-lg gold-engraving mb-1">Activity Engagement</h3>
            <p className="text-[10px] text-muted-foreground/50 uppercase tracking-widest font-adventure mb-6">Check-ins vs scores given per activity</p>
            {activityStats.length === 0 ? (
              <p className="text-center text-sm italic opacity-30 py-8">No activity data yet.</p>
            ) : (
              <WahanaActivityChart data={activityStats} />
            )}
          </div>

          {/* Chart 3: Scan Timeline */}
          <div className="adventure-card p-6">
            <h3 className="font-adventure text-lg gold-engraving mb-1">Scan Activity Timeline</h3>
            <p className="text-[10px] text-muted-foreground/50 uppercase tracking-widest font-adventure mb-6">Number of scans per hour during the event</p>
            {scanTimeline.length === 0 ? (
              <p className="text-center text-sm italic opacity-30 py-8">No scan data yet.</p>
            ) : (
              <ScanTimelineChart data={scanTimeline} />
            )}
          </div>
        </div>
      )}
    </motion.div>
  );
}

// ─── Audit Log Tab ────────────────────────────────────────────────────────────

function AuditTab() {
  const [logs, setLogs] = useState<ScoreLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterTeam, setFilterTeam] = useState('');
  const [filterActivity, setFilterActivity] = useState('');

  const fetchLogs = useCallback(async () => {
    setLoading(true);

    const { data } = await supabase
      .from('score_logs')
      .select(`
        id, team_id, activity_id, points_awarded, lo_id, created_at,
        teams(name),
        activities(name),
        users(name)
      `)
      .order('created_at', { ascending: false })
      .limit(200);

    const enriched: ScoreLogEntry[] = (data || []).map((row: any) => ({
      id: row.id,
      team_id: row.team_id,
      activity_id: row.activity_id,
      points_awarded: row.points_awarded,
      lo_id: row.lo_id,
      created_at: row.created_at,
      team_name: row.teams?.name,
      activity_name: row.activities?.name,
      lo_name: row.users?.name,
    }));

    const filtered = enriched.filter(log => {
      if (filterTeam && !log.team_name?.toLowerCase().includes(filterTeam.toLowerCase())) return false;
      if (filterActivity && !log.activity_name?.toLowerCase().includes(filterActivity.toLowerCase())) return false;
      return true;
    });

    setLogs(filtered);
    setLoading(false);
  }, [filterTeam, filterActivity]);

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
            <label className="block text-[10px] uppercase tracking-widest font-adventure text-foreground/40 mb-1">Activity</label>
            <input
              type="text"
              value={filterActivity}
              onChange={e => setFilterActivity(e.target.value)}
              placeholder="Filter by activity..."
              className="w-full bg-transparent border-b border-primary/20 py-2 text-sm text-foreground focus:outline-none focus:border-primary/60 transition-colors placeholder:text-foreground/20"
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
                    <td className="px-6 py-3 text-sm text-foreground/60">{log.activity_name || log.activity_id.slice(0, 8)}</td>
                    <td className="px-6 py-3 text-right">
                      <span className="font-adventure text-primary">{log.points_awarded}</span>
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
