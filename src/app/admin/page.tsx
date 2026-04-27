'use client';

import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import AuthGuard from '@/components/AuthGuard';
import UsersTab from '@/components/admin/UsersTab';
import AttendanceTab from '@/components/admin/AttendanceTab';
import Pagination from '@/components/admin/Pagination';
import ExpeditionTimer from '@/components/ExpeditionTimer';

// GeofenceMap uses Leaflet which requires browser APIs — must be client-only
const GeofenceMap = dynamic(() => import('@/components/admin/GeofenceMap'), {
  ssr: false,
  loading: () => (
    <div className="h-60 flex items-center justify-center bg-black/20 border border-primary/10">
      <span className="text-[10px] font-adventure uppercase tracking-widest text-foreground/30 animate-pulse">Loading map...</span>
    </div>
  ),
});


// Dynamically import chart components to avoid SSR issues with recharts
const TopTeamsChart = dynamic(() => import('@/components/admin/AnalyticsCharts').then(m => m.TopTeamsChart), { ssr: false });
const WahanaActivityChart = dynamic(() => import('@/components/admin/AnalyticsCharts').then(m => m.WahanaActivityChart), { ssr: false });
const ScanTimelineChart = dynamic(() => import('@/components/admin/AnalyticsCharts').then(m => m.ScanTimelineChart), { ssr: false });
import TeamsTabComponent from '@/components/admin/TeamsTab';
import QRCodeDisplay from '@/components/admin/QRCodeDisplay';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, Trophy, Users, Map as MapIcon,
  Settings, LogOut, Search, QrCode,
  BarChart3, Database, X, Hammer,
  Compass, Flame, Sword, Gem, ScrollText,
  ChevronDown, ChevronUp, Loader2, AlertTriangle,
  CheckCircle, Edit2, Save, UserCheck, FileText, Lock,
  Clock, Filter, Play, Pause, RotateCcw, Square, UserCog, Trash2, ClipboardList
} from 'lucide-react';


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
  how_to_play?: string;
  barcode_data?: string;
  type: 'wahana' | 'challenge_regular' | 'challenge_popup' | 'challenge_additional';
  max_points: number;
  difficulty_level: 'Easy' | 'Medium' | 'Hard';
  treasure_hunt_id?: string;
  is_visible: boolean;
  created_at: string;
}

interface TreasureHunt {
  id: string;
  name: string;
  hint_text: string;
  points: number;
  quota: number;
  remaining_quota: number;
  is_public: boolean;
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
  }, [fetchSettings]);

  return (
    <AuthGuard allowedRoles={['admin']}>
      <div className="fixed inset-0 flex bg-black overflow-hidden font-content selection:bg-primary selection:text-primary-foreground z-10">
        {/* Immersive Background */}
        <div
          className="absolute inset-0 z-0 bg-cover bg-center opacity-40"
          style={{ backgroundImage: 'url("/images/jungle_hq_bg.png")', transform: 'translateZ(0)' }}
        />
        <div className="absolute inset-0 z-0 bg-gradient-to-r from-black via-transparent to-black opacity-80" style={{ transform: 'translateZ(0)' }} />
        <div className="absolute inset-0 z-10 jungle-overlay opacity-10 pointer-events-none" style={{ transform: 'translateZ(0)' }} />

        {/* Sidebar */}
        <aside className="relative z-20 w-72 bg-card border-r border-primary/20 p-8 flex flex-col shadow-2xl overflow-y-auto">
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
            <SidebarLink icon={<ClipboardList className="w-5 h-5" />} label="Attendance" active={activeTab === 'attendance'} onClick={() => setActiveTab('attendance')} />
          </nav>

          <div className="mt-auto pt-8 border-t border-primary/10 space-y-4">
            <div className="px-1">
              <ExpeditionTimer variant="block" className="!bg-black/40 scale-90 origin-left" />
            </div>
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
            {activeTab === 'attendance' && <AttendanceTab key="attendance" />}
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
  const [mapUrl, setMapUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [isSaved, setIsSaved] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const [top3, setTop3] = useState<{ name: string; total_points: number }[]>([]);
  const [loadingTop3, setLoadingTop3] = useState(false);
  // Geofence settings
  const [venueLat, setVenueLat] = useState('');
  const [venueLng, setVenueLng] = useState('');
  const [venueRadius, setVenueRadius] = useState('500');
  const [geofenceEnabled, setGeofenceEnabled] = useState(false);
  // Debounced coords for map preview — only updates 800ms after user stops typing
  const [mapPreviewLat, setMapPreviewLat] = useState('');
  const [mapPreviewLng, setMapPreviewLng] = useState('');
  const [mapPreviewRadius, setMapPreviewRadius] = useState('500');

  useEffect(() => {
    const t = setTimeout(() => {
      setMapPreviewLat(venueLat);
      setMapPreviewLng(venueLng);
      setMapPreviewRadius(venueRadius);
    }, 800);
    return () => clearTimeout(t);
  }, [venueLat, venueLng, venueRadius]);

  // Sync state with props when status is loaded
  useEffect(() => {
    if (status?.durationMinutes) {
      setDurationMinutes(status.durationMinutes);
    }
  }, [status?.durationMinutes]);

  // Reset "Saved" state when any input changes
  useEffect(() => {
    setIsSaved(false);
  }, [durationMinutes, mapUrl]);

  // Fetch from settings
  useEffect(() => {
    supabase.from('settings').select('*').in('key', ['map_image_url', 'venue_lat', 'venue_lng', 'venue_radius_meters', 'geofence_enabled']).then(({ data }) => {
      if (data) {
        const m = data.find(d => d.key === 'map_image_url')?.value;
        if (m) setMapUrl(m);
        const lat = data.find(d => d.key === 'venue_lat')?.value;
        if (lat) setVenueLat(lat);
        const lng = data.find(d => d.key === 'venue_lng')?.value;
        if (lng) setVenueLng(lng);
        const radius = data.find(d => d.key === 'venue_radius_meters')?.value;
        if (radius) setVenueRadius(radius);
        const geo = data.find(d => d.key === 'geofence_enabled')?.value;
        setGeofenceEnabled(geo === 'true');
      }
    });
  }, []);

  useEffect(() => {
    if (status?.status === 'finished') {
      setLoadingTop3(true);
      fetch('/api/leaderboard')
        .then(res => res.json())
        .then(data => {
          const list = Array.isArray(data) ? data : data.leaderboard || [];
          setTop3(list.slice(0, 3));
        })
        .finally(() => setLoadingTop3(false));
    }
  }, [status?.status]);


  const handleUpdateSettings = async () => {
    setSaving(true);
    setError('');
    try {
      const updates = [
        { key: 'event_duration_minutes', value: String(durationMinutes) },
        { key: 'map_image_url', value: mapUrl },
        { key: 'venue_lat', value: venueLat },
        { key: 'venue_lng', value: venueLng },
        { key: 'venue_radius_meters', value: venueRadius },
        { key: 'geofence_enabled', value: String(geofenceEnabled) },
      ];
      for (const item of updates) {
        await supabase.from('settings').upsert(item);
      }
      setIsSaved(true);
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

    const maxSeconds = status.durationMinutes * 60;

    const compute = () => {
      let current = status.elapsedSeconds;
      if (status.status === 'running' && status.startedAt) {
        const timeSinceStart = Math.floor((Date.now() - new Date(status.startedAt).getTime()) / 1000);
        current += timeSinceStart;
      }
      return Math.min(current, maxSeconds);
    };

    const initial = compute();
    setLocalElapsed(initial);

    // Auto-finish safety: if time is up and status is still running, mark as finished
    if (status.status === 'running' && initial >= maxSeconds) {
      // Direct update to finished to avoid race with reset/idle
      supabase.from('settings').update({ value: 'finished' }).eq('key', 'event_status').then(() => onUpdate());
    }

    if (status.status === 'running' && initial < maxSeconds) {
      const interval = setInterval(() => {
        const next = compute();
        setLocalElapsed(next);
        if (next >= maxSeconds) {
          clearInterval(interval);
          supabase.from('settings').update({ value: 'finished' }).eq('key', 'event_status').then(() => onUpdate());
        }
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [status]);

  if (!status) return <div className="p-10 text-white">Loading...</div>;

  const formatTime = (totalSeconds: number) => {
    const hrs = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <TabLayout
      title="Event Control"
      subtitle="Pusat komando waktu dan manajemen ekspedisi"
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
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

          <div className="flex flex-wrap gap-4 w-full justify-center">
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

        {/* Settings Panel or Mission Summary */}
        <div className="adventure-card p-8 space-y-8 flex flex-col">
          {status.status === 'finished' ? (
            <div className="flex-1 flex flex-col">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-3 bg-primary/20 border border-primary/40 rounded-lg">
                  <Trophy className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <h4 className="font-adventure text-primary text-sm uppercase tracking-widest">Mission Accomplished</h4>
                  <p className="text-[10px] text-foreground/40 italic">Final reports from the field</p>
                </div>
              </div>

              <div className="space-y-4 flex-1">
                <p className="text-[10px] uppercase tracking-widest font-adventure text-foreground/40 border-b border-primary/10 pb-2">Top 3 Expeditions</p>
                {loadingTop3 ? (
                  <div className="py-8 animate-pulse text-center font-adventure text-xs opacity-30">Deciphering Results...</div>
                ) : top3.length === 0 ? (
                  <div className="py-8 text-center text-xs italic opacity-30">No teams found.</div>
                ) : (
                  <div className="space-y-3">
                    {top3.map((team, i) => (
                      <div key={team.name} className={`flex items-center justify-between p-3 border ${i === 0 ? 'bg-primary/10 border-primary/30' : 'bg-white/5 border-white/10'}`}>
                        <div className="flex items-center gap-3">
                          <span className={`font-adventure text-xl ${i === 0 ? 'text-yellow-500' : i === 1 ? 'text-gray-400' : 'text-amber-700'}`}>
                            #{i + 1}
                          </span>
                          <span className="font-adventure text-xs uppercase tracking-tight">{team.name}</span>
                        </div>
                        <span className="font-adventure text-lg text-primary">{team.total_points}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <button
                onClick={() => handleTimerAction('reset')}
                className="mt-8 py-3 border border-red-500/40 text-red-400 font-adventure uppercase text-[10px] tracking-widest hover:bg-red-500/10 transition-all"
              >
                Archive & Reset for New Expedition
              </button>
            </div>
          ) : (
            <>
              <div>
                <h4 className="font-adventure text-primary text-sm uppercase tracking-widest mb-4">Event Parameters</h4>
                <div className="space-y-6">
                  <div>
                    <label className="block text-[10px] uppercase text-foreground/40 font-adventure mb-2">Duration (Minutes)</label>
                    <input type="number" value={durationMinutes} onChange={e => setDurationMinutes(parseInt(e.target.value))} className="w-full bg-transparent border-b border-primary/20 py-2 font-mono text-xl focus:outline-none focus:border-primary" />
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
                {/* Geofence / Absensi Lokasi */}
                <div className="border-t border-primary/10 pt-6">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h5 className="font-adventure text-primary text-xs uppercase tracking-widest">Geofence Absensi</h5>
                      <p className="text-[10px] text-foreground/40 italic mt-0.5">Verifikasi lokasi peserta saat login</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setGeofenceEnabled(!geofenceEnabled)}
                      className={`relative w-12 h-6 rounded-full transition-colors duration-300 focus:outline-none ${geofenceEnabled ? 'bg-primary/60' : 'bg-foreground/10'}`}
                    >
                      <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform duration-300 ${geofenceEnabled ? 'translate-x-6' : 'translate-x-0'}`} />
                    </button>
                  </div>
                  {geofenceEnabled && (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-[10px] uppercase text-foreground/40 font-adventure mb-1">Latitude Venue</label>
                          <input
                            type="text"
                            value={venueLat}
                            onChange={e => setVenueLat(e.target.value)}
                            placeholder="-6.3741..."
                            className="w-full bg-transparent border-b border-primary/20 py-1.5 font-mono text-sm focus:outline-none focus:border-primary"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] uppercase text-foreground/40 font-adventure mb-1">Longitude Venue</label>
                          <input
                            type="text"
                            value={venueLng}
                            onChange={e => setVenueLng(e.target.value)}
                            placeholder="106.9076..."
                            className="w-full bg-transparent border-b border-primary/20 py-1.5 font-mono text-sm focus:outline-none focus:border-primary"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-[10px] uppercase text-foreground/40 font-adventure mb-1">Radius (Meter)</label>
                        <input
                          type="number"
                          value={venueRadius}
                          onChange={e => setVenueRadius(e.target.value)}
                          placeholder="500"
                          className="w-full bg-transparent border-b border-primary/20 py-1.5 font-mono text-xl focus:outline-none focus:border-primary"
                        />
                      </div>
                      <p className="text-[10px] text-foreground/30 italic">
                        💡 Tip: Buka Google Maps → klik lokasi venue → copy koordinat.<br />
                        Trans Studio Cibubur: <span className="font-mono text-primary/50">-6.374, 106.908</span>
                      </p>

                    </div>
                  )}
                </div>
                {geofenceEnabled && (() => {
                  const lat = parseFloat(mapPreviewLat);
                  const lng = parseFloat(mapPreviewLng);
                  const radius = parseInt(mapPreviewRadius) || 500;
                  if (isNaN(lat) || isNaN(lng)) return null;
                  return (
                    <div className="mt-8 space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="font-adventure text-primary text-sm uppercase tracking-widest">Venue Geofence Preview</h4>
                          <p className="text-[10px] text-foreground/40 font-mono mt-0.5">
                            {lat.toFixed(6)}, {lng.toFixed(6)} · radius {radius}m
                          </p>
                        </div>
                        <a
                          href={`https://maps.google.com/maps?q=${lat},${lng}&ll=${lat},${lng}&z=17`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[9px] font-adventure uppercase tracking-widest text-primary/50 hover:text-primary transition-colors border border-primary/20 px-4 py-2 hover:bg-primary/10"
                        >
                          Buka Google Maps ↗
                        </a>
                      </div>
                      <div className="border border-primary/20" style={{ height: 320 }}>
                        <GeofenceMap lat={lat} lng={lng} radius={radius} />
                      </div>
                    </div>
                  );
                })()}

                {error && <p className="text-red-400 text-xs mt-4">{error}</p>}
                <button
                  onClick={handleUpdateSettings}
                  onMouseEnter={() => setIsHovering(true)}
                  onMouseLeave={() => setIsHovering(false)}
                  disabled={saving}
                  className={`mt-8 w-full py-3 font-adventure border tracking-widest uppercase text-xs transition-all duration-300 ${isSaved && !isHovering
                    ? 'bg-green-500/20 text-green-400 border-green-500/40'
                    : 'bg-primary/20 text-primary border-primary/40 hover:bg-primary/30'
                    }`}
                >
                  {saving
                    ? 'Saving...'
                    : isHovering
                      ? 'Edit Parameter'
                      : isSaved
                        ? 'Saved'
                        : 'Save Parameters'
                  }
                </button>
              </div>
            </>
          )}
        </div>
      </div>

    </TabLayout>
  );
}

// ─── Wahana Tab ───────────────────────────────────────────────────────────────

// ─── Wahana Tab ───────────────────────────────────────────────────────────────

function WahanaTab() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingActivity, setEditingActivity] = useState<Activity | null>(null);
  const [privateTreasures, setPrivateTreasures] = useState<TreasureHunt[]>([]);
  const [selectedTreasureId, setSelectedTreasureId] = useState<string>('');
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newHowTo, setNewHowTo] = useState('');
  const [newPoints, setNewPoints] = useState('');
  const [newLevel, setNewLevel] = useState<'Easy' | 'Medium' | 'Hard'>('Medium');
  const [newIsVisible, setNewIsVisible] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [error, setError] = useState('');
  const [linkedTreasureIds, setLinkedTreasureIds] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;

  const fetchPrivateTreasures = async () => {
    const { data: treasures } = await supabase.from("treasure_hunts").select("*").eq("is_public", false).order("name");
    const { data: linked } = await supabase.from("activities").select("treasure_hunt_id").not("treasure_hunt_id", "is", null);
    setPrivateTreasures(treasures || []);
    setLinkedTreasureIds(new Set(linked?.map(a => a.treasure_hunt_id as string).filter(Boolean) || []));
  };

  useEffect(() => { fetchPrivateTreasures(); }, []);

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

  const handleOpenModal = (act?: Activity) => {
    if (act) {
      setEditingActivity(act);
      setNewName(act.name);
      setNewDesc(act.description || '');
      setNewHowTo(act.how_to_play || '');
      setNewPoints(act.max_points.toString());
      setNewLevel(act.difficulty_level || 'Medium');
      setNewIsVisible(act.is_visible);
      setSelectedTreasureId(act.treasure_hunt_id || '');
    } else {
      setEditingActivity(null);
      setNewName('');
      setNewDesc('');
      setNewHowTo('');
      setNewPoints('');
      setNewLevel('Medium');
      setNewIsVisible(true);
      setSelectedTreasureId('');
    }
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!newName || !newPoints) return;
    setSaving(true);

    const payload = {
      name: newName,
      description: newDesc || null,
      how_to_play: newHowTo || null,
      max_points: parseInt(newPoints, 10),
      difficulty_level: newLevel,
      treasure_hunt_id: selectedTreasureId || null,
      type: 'wahana' as const,
      is_visible: newIsVisible,
    };

    let error;
    if (editingActivity) {
      const { error: err } = await supabase
        .from('activities')
        .update(payload)
        .eq('id', editingActivity.id);
      error = err;
    } else {
      const { error: err } = await supabase
        .from('activities')
        .insert(payload);
      error = err;
    }

    if (!error) {
      setShowModal(false);
      fetchWahana();
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this wahana? This action cannot be undone.')) return;
    const { error } = await supabase.from('activities').delete().eq('id', id);
    if (!error) fetchWahana();
  };

  return (
    <TabLayout title="Wahana" subtitle="Atraksi utama ekspedisi" onAdd={() => handleOpenModal()}>
      {loading ? <LoadingState /> : activities.length === 0 ? <EmptyState tab="wahana" /> : (() => {
        const totalPages = Math.ceil(activities.length / PAGE_SIZE);
        const paginated = activities.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {paginated.map((act, idx) => (
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
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleOpenModal(act)}
                    className="p-1.5 hover:bg-primary/10 text-primary/60 hover:text-primary transition-colors rounded-md"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(act.id)}
                    className="p-1.5 hover:bg-red-500/10 text-red-400/60 hover:text-red-400 transition-colors rounded-md"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                  {!act.is_visible && (
                    <span className="flex items-center gap-1 text-[8px] font-adventure bg-red-500/10 text-red-400 px-1.5 py-0.5 rounded border border-red-500/20">
                      <Lock className="w-2.5 h-2.5" /> HIDDEN
                    </span>
                  )}
                  {act.is_visible && (
                    <span className="flex items-center gap-1 text-[8px] font-adventure bg-green-500/10 text-green-400 px-1.5 py-0.5 rounded border border-green-500/20">
                      <CheckCircle className="w-2.5 h-2.5" /> VISIBLE
                    </span>
                  )}
                  <DifficultyBadge level={act.difficulty_level} />
                  <span className="text-[10px] font-adventure text-primary bg-primary/10 px-2 py-0.5">{act.max_points} MAX PTS</span>
                </div>
              </div>
              <h3 className="font-adventure text-lg text-foreground mb-1 group-hover:text-primary transition-colors">{act.name}</h3>
              <p className="text-xs text-muted-foreground/60 mb-4 line-clamp-2">{act.description}</p>


              </motion.div>
            ))}
            </div>
            <Pagination
              currentPage={page}
              totalPages={totalPages}
              totalItems={activities.length}
              pageSize={PAGE_SIZE}
              onPageChange={setPage}
              itemLabel="wahana"
            />
          </div>
        );
      })()}

      <AdventureModal show={showModal} onClose={() => setShowModal(false)} title={editingActivity ? 'Edit Wahana' : 'New Wahana'}>
        <div className="space-y-5">
          <ModalField label="Wahana Name" value={newName} onChange={setNewName} placeholder="e.g. Temple of Doom" />
          <ModalField label="Description (Lore)" value={newDesc} onChange={setNewDesc} placeholder="What happens here?" />
          <ModalField label="How to Play (Steps)" value={newHowTo} onChange={setNewHowTo} placeholder="1. Walk in\n2. Solve... " />
          <ModalField label="Max Points" value={newPoints} onChange={setNewPoints} placeholder="e.g. 100" type="number" />
          <DifficultySelector value={newLevel} onChange={setNewLevel} />
          <div>
            <label className="block text-[10px] uppercase tracking-widest font-adventure text-[#2b1d0e]/60 mb-2">Linked Private Treasure Hunt</label>
            <select
              value={selectedTreasureId}
              onChange={e => setSelectedTreasureId(e.target.value)}
              className="w-full bg-transparent border-b-2 border-[#2b1d0e]/20 p-3 font-adventure text-[#2b1d0e] focus:outline-none focus:border-[#8b4513] transition-colors appearance-none"
            >
              <option value="">None / No Hint</option>
              {privateTreasures
                .filter(t => !linkedTreasureIds.has(t.id) || t.id === selectedTreasureId)
                .map(t => (
                  <option key={t.id} value={t.id}>{t.name} ({t.quota} quota)</option>
                ))}
            </select>
          </div>

          <div className="flex items-center justify-between p-4 bg-primary/5 rounded border border-primary/10">
            <div>
              <p className="text-[10px] uppercase font-adventure text-primary tracking-widest mb-1">Visibility Status</p>
              <p className="text-[9px] text-muted-foreground/60 italic">Controls if participants can see this wahana in their log.</p>
            </div>
            <button
              onClick={() => setNewIsVisible(!newIsVisible)}
              className={`px-4 py-2 rounded font-adventure text-[10px] tracking-widest transition-all ${newIsVisible
                ? 'bg-green-500/20 text-green-400 border border-green-500/40'
                : 'bg-red-500/20 text-red-400 border border-red-500/40'
                }`}
            >
              {newIsVisible ? 'VISIBLE' : 'HIDDEN'}
            </button>
          </div>

          <ModalSubmit label={editingActivity ? 'Update Wahana' : 'Establish Wahana'} onClick={handleSave} disabled={!newName || !newPoints || saving} loading={saving} />
        </div >
      </AdventureModal >
    </TabLayout >
  );
}

// ─── Challenges Tab ───────────────────────────────────────────────────────────

const CHALLENGE_LIMITS = { regular: 6, popup: 2, additional: 3 };

// ─── Challenges Tab ──────────────────────────────────────────────────────────

function ChallengesTab() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingChallenge, setEditingChallenge] = useState<Activity | null>(null);
  const [privateTreasures, setPrivateTreasures] = useState<TreasureHunt[]>([]);
  const [selectedTreasureId, setSelectedTreasureId] = useState<string>('');
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newHowTo, setNewHowTo] = useState('');
  const [newPoints, setNewPoints] = useState('');
  const [newLevel, setNewLevel] = useState<'Easy' | 'Medium' | 'Hard'>('Medium');
  const [newType, setNewType] = useState<Activity['type']>('challenge_regular');
  const [newIsVisible, setNewIsVisible] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [linkedTreasureIds, setLinkedTreasureIds] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;

  const fetchPrivateTreasures = async () => {
    const { data: treasures } = await supabase.from("treasure_hunts").select("*").eq("is_public", false).order("name");
    const { data: linked } = await supabase.from("activities").select("treasure_hunt_id").not("treasure_hunt_id", "is", null);
    setPrivateTreasures(treasures || []);
    setLinkedTreasureIds(new Set(linked?.map(a => a.treasure_hunt_id as string).filter(Boolean) || []));
  };

  useEffect(() => { fetchPrivateTreasures(); }, []);

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

  const handleOpenModal = (act?: Activity) => {
    if (act) {
      setEditingChallenge(act);
      setNewName(act.name);
      setNewDesc(act.description || '');
      setNewHowTo(act.how_to_play || '');
      setNewPoints(act.max_points.toString());
      setNewLevel(act.difficulty_level || 'Medium');
      setNewType(act.type);
      setNewIsVisible(act.is_visible);
      setSelectedTreasureId(act.treasure_hunt_id || '');
    } else {
      setEditingChallenge(null);
      setNewName('');
      setNewDesc('');
      setNewHowTo('');
      setNewPoints('');
      setNewLevel('Medium');
      setNewType('challenge_regular');
      setNewIsVisible(true);
      setSelectedTreasureId('');
    }
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!newName || !newPoints) return;
    setSaving(true);

    const payload = {
      name: newName,
      description: newDesc || null,
      how_to_play: newHowTo || null,
      max_points: parseInt(newPoints, 10),
      difficulty_level: newLevel,
      treasure_hunt_id: selectedTreasureId || null,
      type: newType,
      is_visible: newIsVisible,
    };

    let error;
    if (editingChallenge) {
      const { error: err } = await supabase
        .from('activities')
        .update(payload)
        .eq('id', editingChallenge.id);
      error = err;
    } else {
      const { error: err } = await supabase
        .from('activities')
        .insert(payload);
      error = err;
    }

    if (!error) {
      setShowModal(false);
      fetchChallenges();
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this challenge?')) return;
    const { error } = await supabase.from('activities').delete().eq('id', id);
    if (!error) fetchChallenges();
  };

  const typeColor = (type: string) => {
    if (type === 'challenge_regular') return 'bg-blue-500/20 text-blue-300';
    if (type === 'challenge_popup') return 'bg-orange-500/20 text-orange-300';
    if (type === 'challenge_additional') return 'bg-purple-500/20 text-purple-300';
    return 'bg-foreground/10 text-foreground/60';
  };

  return (
    <TabLayout title="Challenges" subtitle="Misi sampingan berhadiah" onAdd={() => handleOpenModal()}>
      {loading ? <LoadingState /> : activities.length === 0 ? <EmptyState tab="challenges" /> : (() => {
        const totalPages = Math.ceil(activities.length / PAGE_SIZE);
        const paginated = activities.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {paginated.map((act, idx) => (
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
                      <button
                        onClick={() => handleOpenModal(act)}
                        className="p-1.5 hover:bg-primary/10 text-primary/60 hover:text-primary transition-colors rounded-md"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(act.id)}
                        className="p-1.5 hover:bg-red-500/10 text-red-400/60 hover:text-red-400 transition-colors rounded-md"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                      <span className={`text-[9px] font-adventure uppercase px-2 py-0.5 ${typeColor(act.type)}`}>
                        {act.type.replace('challenge_', '')}
                      </span>
                      {!act.is_visible && (
                        <span className="flex items-center gap-1 text-[8px] font-adventure bg-red-500/10 text-red-400 px-1.5 py-0.5 rounded border border-red-500/20">
                          <Lock className="w-2.5 h-2.5" /> HIDDEN
                        </span>
                      )}
                      {act.is_visible && (
                        <span className="flex items-center gap-1 text-[8px] font-adventure bg-green-500/10 text-green-400 px-1.5 py-0.5 rounded border border-green-500/20">
                          <CheckCircle className="w-2.5 h-2.5" /> VISIBLE
                        </span>
                      )}
                      <DifficultyBadge level={act.difficulty_level} />
                      <span className="text-[10px] font-adventure text-primary bg-primary/10 px-2 py-0.5">{act.max_points} MAX PTS</span>
                    </div>
                  </div>
                  <h3 className="font-adventure text-lg text-foreground mb-1 group-hover:text-primary transition-colors">{act.name}</h3>
                  <p className="text-xs text-muted-foreground/60 mb-4 line-clamp-2">{act.description}</p>

                </motion.div>
              ))}
            </div>
            <Pagination
              currentPage={page}
              totalPages={totalPages}
              totalItems={activities.length}
              pageSize={PAGE_SIZE}
              onPageChange={setPage}
              itemLabel="challenge"
            />
          </div>
        );
      })()}

      <AdventureModal show={showModal} onClose={() => setShowModal(false)} title={editingChallenge ? 'Edit Challenge' : 'New Challenge'}>
        <div className="space-y-5">
          <ModalField label="Challenge Name" value={newName} onChange={setNewName} placeholder="e.g. Bridge of Doom" />
          <ModalField label="Description (Lore)" value={newDesc} onChange={setNewDesc} placeholder="Misi apa ini?" />
          <ModalField label="How to Play (Steps)" value={newHowTo} onChange={setNewHowTo} placeholder="1. Cross... " />
          <ModalField label="Points" value={newPoints} onChange={setNewPoints} placeholder="e.g. 50" type="number" />
          <DifficultySelector value={newLevel} onChange={setNewLevel} />
          <div>
            <label className="block text-[10px] uppercase tracking-widest font-adventure text-[#2b1d0e]/60 mb-2">Challenge Type</label>
            <div className="flex gap-2">
              {(['challenge_regular', 'challenge_popup', 'challenge_additional'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setNewType(t)}
                  className={`flex-1 py-2 text-[8px] font-adventure uppercase tracking-widest border transition-all ${newType === t ? 'bg-[#8b4513] text-[#f4e4bc] border-[#8b4513]' : 'bg-transparent text-[#2b1d0e]/60 border-[#2b1d0e]/20'
                    }`}
                >
                  {t.replace('challenge_', '')}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between p-4 bg-primary/5 rounded border border-primary/10">
            <div>
              <p className="text-[10px] uppercase font-adventure text-primary tracking-widest mb-1">Visibility Status</p>
              <p className="text-[9px] text-muted-foreground/60 italic">Controls if participants can see this challenge in their log.</p>
            </div>
            <button
              onClick={() => setNewIsVisible(!newIsVisible)}
              className={`px-4 py-2 rounded font-adventure text-[10px] tracking-widest transition-all ${newIsVisible
                ? 'bg-green-500/20 text-green-400 border border-green-500/40'
                : 'bg-red-500/20 text-red-400 border border-red-500/40'
                }`}
            >
              {newIsVisible ? 'VISIBLE' : 'HIDDEN'}
            </button>
          </div>

          <ModalSubmit label={editingChallenge ? 'Update Challenge' : 'Create Challenge'} onClick={handleSave} disabled={!newName || !newPoints || saving} loading={saving} />
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
  const [isPublic, setIsPublic] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingTreasure, setEditingTreasure] = useState<TreasureHunt | null>(null);
  const [expandedQR, setExpandedQR] = useState<string | null>(null);
  const [expandedClaims, setExpandedClaims] = useState<string | null>(null);
  const [claimTeams, setClaimTeams] = useState<{ team_name: string }[]>([]);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;

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

  const handleOpenModal = (th?: TreasureHunt) => {
    if (th) {
      setEditingTreasure(th);
      setNewName(th.name);
      setNewPoints(th.points.toString());
      setNewHint(th.hint_text || '');
      setNewQuota(th.quota.toString());
      setIsPublic(th.is_public);
    } else {
      setEditingTreasure(null);
      setNewName('');
      setNewPoints('');
      setNewHint('');
      setNewQuota('');
      setIsPublic(false);
    }
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!newName || !newPoints || !newQuota) return;
    setSaving(true);

    const quotaVal = parseInt(newQuota, 10);
    const pointsVal = parseInt(newPoints, 10);

    let error;
    if (editingTreasure) {
      // Calculate new remaining_quota
      const quotaDiff = quotaVal - editingTreasure.quota;
      const newRemaining = Math.max(0, editingTreasure.remaining_quota + quotaDiff);

      const { error: err } = await supabase
        .from('treasure_hunts')
        .update({
          name: newName,
          points: pointsVal,
          hint_text: newHint || null,
          quota: quotaVal,
          remaining_quota: newRemaining,
          is_public: isPublic,
        })
        .eq('id', editingTreasure.id);
      error = err;
    } else {
      const { error: err } = await supabase.from('treasure_hunts').insert({
        name: newName,
        points: pointsVal,
        hint_text: newHint || null,
        quota: quotaVal,
        remaining_quota: quotaVal,
        is_public: isPublic,
      });
      error = err;
    }

    if (!error) {
      setShowModal(false);
      fetchTreasures();
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this treasure?')) return;
    const { error } = await supabase.from('treasure_hunts').delete().eq('id', id);
    if (!error) fetchTreasures();
  };

  return (
    <TabLayout title="Treasure Hunt" subtitle="Harta karun tersembunyi" onAdd={() => handleOpenModal()}>
      {loading ? <LoadingState /> : treasures.length === 0 ? <EmptyState tab="treasure" /> : (() => {
        const totalPages = Math.ceil(treasures.length / PAGE_SIZE);
        const paginated = treasures.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {paginated.map((th, idx) => (
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
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleOpenModal(th)}
                        className="p-1.5 hover:bg-primary/10 text-primary/60 hover:text-primary transition-colors rounded-md"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(th.id)}
                        className="p-1.5 hover:bg-red-500/10 text-red-400/60 hover:text-red-400 transition-colors rounded-md"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                      <span className={`text-[8px] font-adventure uppercase px-2 py-0.5 rounded-sm ${th.is_public ? 'bg-green-500/20 text-green-400' : 'bg-blue-500/20 text-blue-400'}`}>
                        {th.is_public ? 'Public' : 'Private'}
                      </span>
                      <div className="text-right ml-2">
                        <p className="text-[10px] font-adventure text-primary">{th.points} PTS</p>
                        <p className="text-[9px] text-muted-foreground/40">{th.remaining_quota}/{th.quota} REMAINING</p>
                      </div>
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
                          <QRCodeDisplay barcodeData={`fif-treasure-${th.id}`} label={th.name} size={150} />
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
            <Pagination
              currentPage={page}
              totalPages={totalPages}
              totalItems={treasures.length}
              pageSize={PAGE_SIZE}
              onPageChange={setPage}
              itemLabel="treasure"
            />
          </div>
        );
      })()}

      <AdventureModal show={showModal} onClose={() => setShowModal(false)} title={editingTreasure ? 'Edit Treasure' : 'New Treasure'}>
        <div className="space-y-5">
          <ModalField label="Treasure Name" value={newName} onChange={setNewName} placeholder="e.g. Golden Idol" />
          <ModalField label="Points" value={newPoints} onChange={setNewPoints} placeholder="e.g. 500" type="number" />
          <ModalField label="Hint" value={newHint} onChange={setNewHint} placeholder="Di mana dia berada?" />
          <ModalField label="Quota" value={newQuota} onChange={setNewQuota} placeholder="e.g. 1" type="number" />

          <div className="pt-2">
            <label className="block text-[10px] uppercase tracking-widest font-adventure text-[#2b1d0e]/60 mb-3">Discovery Type</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setIsPublic(false)}
                className={`flex-1 py-3 flex flex-col items-center gap-1 border transition-all ${!isPublic
                  ? 'bg-[#8b4513] text-[#f4e4bc] border-[#8b4513] shadow-lg'
                  : 'bg-transparent text-[#2b1d0e]/40 border-[#2b1d0e]/20 hover:border-[#2b1d0e]/40'
                  }`}
              >
                <span className="text-[9px] font-adventure uppercase tracking-tighter">Private / Hidden</span>
              </button>
              <button
                type="button"
                onClick={() => setIsPublic(true)}
                className={`flex-1 py-3 flex flex-col items-center gap-1 border transition-all ${isPublic
                  ? 'bg-[#8b4513] text-[#f4e4bc] border-[#8b4513] shadow-lg'
                  : 'bg-transparent text-[#2b1d0e]/40 border-[#2b1d0e]/20 hover:border-[#2b1d0e]/40'
                  }`}
              >
                <span className="text-[9px] font-adventure uppercase tracking-tighter">Public / Global</span>
              </button>
            </div>
            <p className="mt-2 text-[9px] italic text-[#2b1d0e]/40">
              {isPublic ? "Visible to all teams in the Global menu." : "Hidden until earned through a specific Wahana scan."}
            </p>
          </div>

          <ModalSubmit label={editingTreasure ? 'Update Treasure' : 'Bury Treasure'} onClick={handleSave} disabled={!newName || !newPoints || !newQuota || saving} loading={saving} />
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
        supabase.from('activity_registrations').select('activity_id, checked_in_at'),
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
          if (s.checked_in_at) {
            const hour = new Date(s.checked_in_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false }).slice(0, 5);
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
        id, team_id, activity_id, points_awarded, lo_id, created_at, participant_ids,
        teams(name),
        activities(name),
        users!score_logs_lo_id_fkey(name)
      `)
      .order('created_at', { ascending: false })
      .limit(200);

    const enriched: any[] = (data || []).map((row: any) => ({
      id: row.id,
      team_id: row.team_id,
      activity_id: row.activity_id,
      points_awarded: row.points_awarded,
      lo_id: row.lo_id,
      created_at: row.created_at,
      team_name: row.teams?.name,
      activity_name: row.activities?.name,
      lo_name: row.users?.name,
      participant_ids: Array.isArray(row.participant_ids) ? row.participant_ids : [],
    }));

    const filtered = enriched.filter(log => {
      if (filterTeam && !log.team_name?.toLowerCase().includes(filterTeam.toLowerCase())) return false;
      if (filterActivity && !log.activity_name?.toLowerCase().includes(filterActivity.toLowerCase())) return false;
      return true;
    });

    setLogs(filtered);
    setLoading(false);
  }, [filterTeam, filterActivity]);

  const [userMap, setUserMap] = useState<Map<string, string>>(new Map());

  // Fetch users for mapping
  useEffect(() => {
    const fetchUsers = async () => {
      const { data } = await supabase.from('users').select('id, name');
      if (data) setUserMap(new Map(data.map(u => [u.id, u.name])));
    };
    fetchUsers();
  }, []);

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
                  <th className="text-left px-6 py-4 text-[10px] font-adventure uppercase tracking-widest text-primary/60">Participants</th>
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
                    <td className="px-6 py-3">
                      <div className="flex flex-wrap gap-1">
                        {(log as any).participant_ids?.map((pid: string) => (
                          <span key={pid} className="text-[9px] px-1.5 py-0.5 bg-primary/5 border border-primary/10 text-primary/60 rounded-sm">
                            {userMap.get(pid) || 'Unknown'}
                          </span>
                        ))}
                      </div>
                    </td>
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
  onAdd?: () => void;
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
          {onAdd && (
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
          )}
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
            className="absolute inset-0 bg-black/90"
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
      className={`w-full group flex items-center gap-4 px-5 py-3 rounded-none transition-all duration-300 relative ${active ? 'text-primary' : 'text-foreground/40 hover:text-foreground'
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

function DifficultyBadge({ level }: { level: string }) {
  const colorClass = level === 'Easy' ? 'bg-green-600 text-white' : level === 'Hard' ? 'bg-red-600 text-white' : 'bg-amber-500 text-white';
  const flames = level === 'Easy' ? 1 : level === 'Hard' ? 3 : 2;

  return (
    <div className={`flex items-center gap-1.5 px-3 py-1 rounded-sm shadow-lg ${colorClass}`}>
      <div className="flex -space-x-0.5">
        {Array.from({ length: flames }).map((_, i) => (
          <Flame key={i} className="w-2.5 h-2.5 fill-current" />
        ))}
      </div>
      <span className="text-[9px] font-adventure uppercase tracking-widest">{level}</span>
    </div>
  );
}

function DifficultySelector({ value, onChange }: { value: 'Easy' | 'Medium' | 'Hard'; onChange: (v: 'Easy' | 'Medium' | 'Hard') => void }) {
  const levels: ('Easy' | 'Medium' | 'Hard')[] = ['Easy', 'Medium', 'Hard'];

  return (
    <div className="pt-2">
      <label className="block text-[10px] uppercase tracking-widest font-adventure text-[#2b1d0e]/60 mb-3">Difficulty Level</label>
      <div className="flex gap-2">
        {levels.map(lvl => (
          <button
            key={lvl}
            type="button"
            onClick={() => onChange(lvl)}
            className={`flex-1 py-3 flex flex-col items-center gap-1 border transition-all duration-300 ${value === lvl
              ? 'bg-[#8b4513] text-[#f4e4bc] border-[#8b4513] shadow-lg scale-105 z-10'
              : 'bg-transparent text-[#2b1d0e]/40 border-[#2b1d0e]/20 hover:border-[#2b1d0e]/40'
              }`}
          >
            <div className="flex gap-0.5">
              {Array.from({ length: lvl === 'Easy' ? 1 : lvl === 'Hard' ? 3 : 2 }).map((_, i) => (
                <Flame key={i} className={`w-3 h-3 ${value === lvl ? 'fill-current' : 'opacity-40'}`} />
              ))}
            </div>
            <span className="text-[9px] font-adventure uppercase tracking-tighter">{lvl}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
