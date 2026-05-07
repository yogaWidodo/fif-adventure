'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Users, UserCheck, UserX, MapPin, RefreshCw, Download, Search, Loader2, FileText } from 'lucide-react';
import { supabase, fetchAllUsers } from '@/lib/supabase';
import Pagination from '@/components/admin/Pagination';

interface AttendanceUser {
  id: string;
  name: string;
  npk: string;
  role: string;
  team_id: string | null;
  is_login: boolean;
  login_at: string | null;
  login_lat: number | null;
  login_lng: number | null;
}

interface AttendanceSummary {
  present: number;
  absent: number;
  total: number;
}

function RoleBadge({ role }: { role: string }) {
  const cls: Record<string, string> = {
    captain: 'bg-primary/20 text-primary border-primary/30',
    vice_captain: 'bg-amber-900/30 text-amber-400 border-amber-500/30',
    member: 'bg-foreground/10 text-foreground/60 border-foreground/20',
    lo: 'bg-blue-900/30 text-blue-400 border-blue-500/30',
  };
  return (
    <span className={`text-[9px] font-adventure uppercase tracking-widest px-2 py-0.5 border ${cls[role] ?? cls.member}`}>
      {role.replace('_', ' ')}
    </span>
  );
}

function StatCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number; color: string }) {
  return (
    <div className={`adventure-card p-5 flex items-center gap-4 ${color}`}>
      <div className="opacity-70">{icon}</div>
      <div>
        <p className="text-[10px] font-adventure uppercase tracking-widest opacity-60">{label}</p>
        <p className="text-3xl font-adventure">{value}</p>
      </div>
    </div>
  );
}

export default function AttendanceTab() {
  const [users, setUsers] = useState<AttendanceUser[]>([]);
  const [summary, setSummary] = useState<AttendanceSummary>({ present: 0, absent: 0, total: 0 });
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'present' | 'absent'>('all');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;

  const fetchAttendance = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/attendance');
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      setUsers(data.users ?? []);
      setSummary(data.summary ?? { present: 0, absent: 0, total: 0 });
      setLastUpdated(new Date());
    } catch (e) {
      console.error('[AttendanceTab] fetch error:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAttendance(); }, [fetchAttendance]);

  const filtered = users.filter(u => {
    const matchSearch = !searchQuery.trim() ||
      u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.npk.toLowerCase().includes(searchQuery.toLowerCase());
    const matchFilter = filter === 'all' || (filter === 'present' ? u.is_login : !u.is_login);
    return matchSearch && matchFilter;
  });

  // Reset to page 1 when search or filter changes
  useEffect(() => { setPage(1); }, [searchQuery, filter]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const exportCSV = () => {
    const headers = 'NPK,Nama,Role,Status,Waktu Hadir,Lat,Lng';
    const rows = users.map(u => [
      u.npk,
      `"${u.name}"`,
      u.role,
      u.is_login ? 'Hadir' : 'Tidak Hadir',
      u.login_at ? `"${new Date(u.login_at).toLocaleString('id-ID')}"` : '-',
      u.login_lat ?? '-',
      u.login_lng ?? '-',
    ].join(','));
    const csv = [headers, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `attendance_login_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportActivityCSV = async () => {
    setLoading(true);
    try {
      let allLogs: any[] = [];
      let fromLog = 0;
      const logStep = 1000;

      while (true) {
        const { data, error } = await supabase
          .from('score_logs')
          .select(`
            created_at,
            points_awarded,
            participant_ids,
            teams(name),
            activities(name)
          `)
          .order('created_at', { ascending: false })
          .range(fromLog, fromLog + logStep - 1);

        if (error) throw error;
        if (!data || data.length === 0) break;
        
        allLogs = [...allLogs, ...data];
        if (data.length < logStep) break;
        fromLog += logStep;
      }

      const data = allLogs;

      // Since participant_ids is a JSONB array, we need to handle it.
      // For Option 1, it usually has 1 element.
      // To get names, we'll fetch all users once for mapping (more efficient than joining in a complex query here)
      const allUsers = await fetchAllUsers('id, name, npk');
      const userMap = new Map(allUsers?.map(u => [u.id, u]) ?? []);

      const headers = 'Waktu,Nama,NPK,Tim,Wahana,Poin';
      const rows: string[] = [];

      data.forEach(log => {
        const pIds = log.participant_ids as string[] || [];
        const teamName = (log.teams as any)?.name || 'Unknown';
        const activityName = (log.activities as any)?.name || 'Unknown';
        const pointsPerPerson = pIds.length > 0 ? log.points_awarded / pIds.length : 0;
        const timestamp = `"${new Date(log.created_at).toLocaleString('id-ID')}"`;

        pIds.forEach(pId => {
          const user = userMap.get(pId);
          if (user) {
            rows.push([
              timestamp,
              `"${user.name}"`,
              user.npk,
              `"${teamName}"`,
              `"${activityName}"`,
              pointsPerPerson
            ].join(','));
          }
        });
      });

      const csv = [headers, ...rows].join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `attendance_activity_${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('[AttendanceTab] export activity error:', e);
      alert('Gagal mengunduh data aktivitas.');
    } finally {
      setLoading(false);
    }
  };

  const attendanceRate = summary.total > 0
    ? Math.round((summary.present / summary.total) * 100)
    : 0;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="p-10 space-y-8"
    >
      <header className="flex justify-between items-end">
        <div>
          <h2 className="text-4xl font-adventure gold-engraving">Attendance</h2>
          <p className="text-muted-foreground text-sm italic">
            Rekap kehadiran peserta ekspedisi
            {lastUpdated && (
              <span className="ml-2 text-[10px] opacity-40">
                · Updated {lastUpdated.toLocaleTimeString('id-ID')}
              </span>
            )}
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={fetchAttendance}
            disabled={loading}
            className="border border-primary/30 px-4 py-2 text-[10px] font-adventure uppercase tracking-widest text-primary hover:bg-primary/10 flex items-center gap-2"
          >
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          
          <div className="h-10 w-px bg-primary/10 mx-1" />

          <button
            onClick={exportCSV}
            className="border border-primary/20 px-4 py-2 text-[10px] font-adventure uppercase tracking-widest text-foreground/40 hover:text-primary hover:border-primary/40 flex items-center gap-2 transition-all"
          >
            <Download className="w-3 h-3" />
            Export Login
          </button>
          
          <button
            onClick={exportActivityCSV}
            disabled={loading}
            className="bg-primary/20 border border-primary/40 px-4 py-2 text-[10px] font-adventure uppercase tracking-widest text-primary hover:bg-primary/30 flex items-center gap-2 shadow-[0_0_15px_rgba(var(--primary-rgb),0.1)] transition-all"
          >
            {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileText className="w-3 h-3" />}
            Export Activity
          </button>
        </div>
      </header>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          icon={<Users className="w-8 h-8 text-foreground" />}
          label="Total Peserta"
          value={summary.total}
          color="border-foreground/20"
        />
        <StatCard
          icon={<UserCheck className="w-8 h-8 text-green-400" />}
          label="Hadir"
          value={summary.present}
          color="border-green-500/30 bg-green-900/10"
        />
        <StatCard
          icon={<UserX className="w-8 h-8 text-red-400" />}
          label="Tidak Hadir"
          value={summary.absent}
          color="border-red-500/30 bg-red-900/10"
        />
      </div>

      {/* Attendance Rate Bar */}
      <div className="adventure-card p-5">
        <div className="flex justify-between items-center mb-3">
          <span className="text-[10px] font-adventure uppercase tracking-widest text-foreground/60">Tingkat Kehadiran</span>
          <span className="font-adventure text-primary text-lg">{attendanceRate}%</span>
        </div>
        <div className="h-2 bg-foreground/10 rounded-full overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${attendanceRate}%` }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
            className="h-full bg-gradient-to-r from-primary/60 to-primary rounded-full"
          />
        </div>
      </div>

      {/* Filter & Search */}
      <div className="flex gap-4 items-center flex-wrap">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-primary/40" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Cari nama atau NPK..."
            className="w-full bg-transparent border-b border-primary/20 pl-8 py-2 text-sm focus:outline-none focus:border-primary transition-all"
          />
        </div>
        <div className="flex gap-1">
          {(['all', 'present', 'absent'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 text-[10px] font-adventure uppercase tracking-widest border transition-all ${
                filter === f
                  ? f === 'present' ? 'bg-green-900/30 border-green-500/40 text-green-400'
                    : f === 'absent' ? 'bg-red-900/30 border-red-500/40 text-red-400'
                    : 'bg-primary/20 border-primary/40 text-primary'
                  : 'border-foreground/10 text-foreground/40 hover:border-foreground/20'
              }`}
            >
              {f === 'all' ? 'Semua' : f === 'present' ? 'Hadir' : 'Absen'}
            </button>
          ))}
        </div>
        <p className="text-[10px] font-adventure uppercase tracking-widest text-foreground/40">
          {filtered.length} peserta
        </p>
      </div>

      {/* Table */}
      <div className="overflow-hidden space-y-2">
        {loading ? (
          <div className="flex flex-col items-center justify-center p-20 opacity-30">
            <Loader2 className="w-8 h-8 animate-spin text-primary/40 mb-2" />
            <span className="text-[10px] font-adventure uppercase">Memuat data...</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-20 text-center opacity-30">
            <Users className="w-12 h-12 mx-auto mb-4" />
            <p className="font-adventure text-sm tracking-widest lowercase">no attendees found</p>
          </div>
        ) : (
          paginated.map((user, idx) => (
            <motion.div
              key={user.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: idx * 0.02 }}
              className={`adventure-card p-4 flex items-center justify-between ${
                user.is_login ? 'border-green-500/20' : 'border-red-500/10'
              }`}
            >
              <div className="flex items-center gap-4">
                {/* Status Indicator */}
                <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${user.is_login ? 'bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.5)]' : 'bg-red-900/60'}`} />
                <div>
                  <p className="text-sm font-adventure tracking-wider">{user.name}</p>
                  <p className="text-[10px] text-foreground/40 font-mono">{user.npk}</p>
                </div>
                <RoleBadge role={user.role} />
              </div>

              <div className="flex items-center gap-6 text-right">
                {user.is_login && user.login_at ? (
                  <div>
                    <p className="text-[10px] text-green-400 font-adventure uppercase tracking-widest">Hadir</p>
                    <p className="text-[10px] text-foreground/40 font-mono">
                      {new Date(user.login_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                ) : (
                  <p className="text-[10px] text-red-400/60 font-adventure uppercase tracking-widest">Tidak Hadir</p>
                )}

                {user.login_lat && user.login_lng && (
                  <a
                    href={`https://maps.google.com/?q=${user.login_lat},${user.login_lng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1.5 hover:bg-primary/10 rounded-full text-primary/30 hover:text-primary transition-all"
                    title="Lihat lokasi di Google Maps"
                  >
                    <MapPin className="w-4 h-4" />
                  </a>
                )}
              </div>
            </motion.div>
          ))
        )}
        <Pagination
          currentPage={page}
          totalPages={totalPages}
          totalItems={filtered.length}
          pageSize={PAGE_SIZE}
          onPageChange={setPage}
          itemLabel="peserta"
        />
      </div>
    </motion.div>
  );
}
