'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  UserPlus, Edit2, UserCheck, Upload, Download,
  Search, X, Loader2, CheckCircle, AlertTriangle,
  ChevronDown, ChevronUp, Compass, MapPin,
} from 'lucide-react';
import AssignLocationModal from '@/components/admin/AssignLocationModal';
import { supabase } from '@/lib/supabase';
import { parseUserCSV, type ParsedUserRow, type UploadReport } from '@/lib/userManagement';

// ─── Types ────────────────────────────────────────────────────────────────────

interface UserRecord {
  id: string;
  auth_id: string | null;
  nama: string;
  npk: string;
  role: string;
  no_unik: string | null;
  team_id: string | null;
  team_name: string | null;
  event_id: string | null;
  event_name: string | null;
  assigned_location_id: string | null;
  assigned_location_name: string | null;
  created_at: string;
}

interface TeamOption {
  id: string;
  name: string;
}

interface EventOption {
  id: string;
  name: string;
}

// ─── Role Badge ───────────────────────────────────────────────────────────────

function RoleBadge({ role }: { role: string }) {
  const cls: Record<string, string> = {
    admin: 'bg-red-900/30 text-red-400 border-red-500/30',
    kaptain: 'bg-primary/20 text-primary border-primary/30',
    cocaptain: 'bg-amber-900/30 text-amber-400 border-amber-500/30',
    member: 'bg-foreground/10 text-foreground/60 border-foreground/20',
    lo: 'bg-blue-900/30 text-blue-400 border-blue-500/30',
  };
  return (
    <span className={`text-[9px] font-adventure uppercase tracking-widest px-2 py-0.5 border ${cls[role] ?? cls.member}`}>
      {role}
    </span>
  );
}


// ─── UserFormModal ────────────────────────────────────────────────────────────

function UserFormModal({
  user,
  onSuccess,
  onClose,
}: {
  user: UserRecord | null;
  onSuccess: () => void;
  onClose: () => void;
}) {
  const isEdit = user !== null;
  const [nama, setNama] = useState(user?.nama ?? '');
  const [npk, setNpk] = useState(user?.npk ?? '');
  const [role, setRole] = useState(user?.role ?? 'member');
  const [eventId, setEventId] = useState(user?.event_id ?? '');
  const [events, setEvents] = useState<EventOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    supabase
      .from('events')
      .select('id,name')
      .then(({ data }) => setEvents(data ?? []));
  }, []);

  const validate = (): string | null => {
    if (!nama.trim()) return 'Nama wajib diisi';
    if (!npk.trim()) return 'NPK wajib diisi';
    const validRoles = ['admin', 'kaptain', 'cocaptain', 'member', 'lo'];
    if (!validRoles.includes(role)) return 'Role tidak valid';
    return null;
  };

  const handleSubmit = async () => {
    const err = validate();
    if (err) { setError(err); return; }
    setSaving(true);
    setError('');

    try {
      if (isEdit) {
        // Build changed fields only
        const body: Record<string, unknown> = {};
        if (nama !== user!.nama) body.nama = nama;
        if (npk !== user!.npk) body.npk = npk;
        if (role !== user!.role) body.role = role;
        const newEventId = eventId || null;
        if (newEventId !== user!.event_id) body.event_id = newEventId;

        const res = await fetch(`/api/users/${user!.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const data = await res.json();
          if (res.status === 409) throw new Error('NPK sudah digunakan');
          throw new Error(data.error ?? 'Gagal memperbarui user');
        }
      } else {
        const res = await fetch('/api/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nama, npk, role, event_id: eventId || undefined }),
        });
        if (!res.ok) {
          const data = await res.json();
          if (res.status === 409) throw new Error('NPK sudah digunakan');
          throw new Error(data.error ?? 'Gagal membuat user');
        }
      }
      onSuccess();
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Terjadi kesalahan');
    } finally {
      setSaving(false);
    }
  };

  return (
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
        className="relative w-full max-w-lg bg-card/95 backdrop-blur-xl border border-primary/30 p-8 max-h-[90vh] overflow-y-auto"
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-foreground/40 hover:text-foreground transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-8">
          {isEdit ? <Edit2 className="w-6 h-6 text-primary" /> : <UserPlus className="w-6 h-6 text-primary" />}
          <h3 className="text-xl font-adventure gold-engraving">
            {isEdit ? 'Edit User' : 'User Baru'}
          </h3>
        </div>

        <div className="space-y-5">
          <div>
            <label className="block text-[10px] uppercase tracking-widest font-adventure text-primary/60 mb-2">Nama</label>
            <input
              type="text"
              value={nama}
              onChange={e => setNama(e.target.value)}
              placeholder="Nama lengkap"
              className="w-full bg-transparent border-b border-primary/30 py-1.5 text-sm text-foreground focus:outline-none focus:border-primary transition-colors"
            />
          </div>

          <div>
            <label className="block text-[10px] uppercase tracking-widest font-adventure text-primary/60 mb-2">NPK</label>
            <input
              type="text"
              value={npk}
              onChange={e => setNpk(e.target.value)}
              placeholder="Nomor Pokok Karyawan"
              className="w-full bg-transparent border-b border-primary/30 py-1.5 text-sm text-foreground focus:outline-none focus:border-primary transition-colors"
            />
          </div>

          <div>
            <label className="block text-[10px] uppercase tracking-widest font-adventure text-primary/60 mb-2">Role</label>
            <select
              value={role}
              onChange={e => setRole(e.target.value)}
              className="w-full bg-card border-b border-primary/30 py-1.5 text-sm text-foreground focus:outline-none focus:border-primary transition-colors [&>option]:bg-black [&>option]:text-white"
            >
              {['admin', 'kaptain', 'cocaptain', 'member', 'lo'].map(r => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[10px] uppercase tracking-widest font-adventure text-primary/60 mb-2">Event (opsional)</label>
            <select
              value={eventId}
              onChange={e => setEventId(e.target.value)}
              className="w-full bg-card border-b border-primary/30 py-1.5 text-sm text-foreground focus:outline-none focus:border-primary transition-colors [&>option]:bg-black [&>option]:text-white"
            >
              <option value="">— Tidak ada —</option>
              {events.map(ev => (
                <option key={ev.id} value={ev.id}>{ev.name}</option>
              ))}
            </select>
          </div>

          {error && <p className="text-red-400 text-[10px]">{error}</p>}

          <button
            onClick={handleSubmit}
            disabled={saving}
            className="w-full flex items-center justify-center gap-2 bg-primary/20 hover:bg-primary/30 border border-primary/40 text-primary text-[10px] font-adventure uppercase tracking-widest px-4 py-2 transition-all disabled:opacity-40"
          >
            {saving && <Loader2 className="w-3 h-3 animate-spin" />}
            {isEdit ? 'Simpan Perubahan' : 'Buat User'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}


// ─── AssignTeamModal ──────────────────────────────────────────────────────────

function AssignTeamModal({
  user,
  onSuccess,
  onClose,
}: {
  user: UserRecord;
  onSuccess: () => void;
  onClose: () => void;
}) {
  const [teams, setTeams] = useState<TeamOption[]>([]);
  const [teamId, setTeamId] = useState('');
  const [noUnik, setNoUnik] = useState('');
  const [roleInTeam, setRoleInTeam] = useState('member');
  const [saving, setSaving] = useState(false);
  const [releasing, setReleasing] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    supabase
      .from('teams')
      .select('id,name')
      .order('name')
      .then(({ data }) => {
        setTeams(data ?? []);
        if (data && data.length > 0) setTeamId(data[0].id);
      });
  }, []);

  const handleAssign = async () => {
    if (!noUnik.trim()) { setError('No. Unik wajib diisi'); return; }
    if (!teamId) { setError('Pilih tim terlebih dahulu'); return; }
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ team_id: teamId, no_unik: noUnik, role: roleInTeam }),
      });
      if (!res.ok) {
        const data = await res.json();
        if (res.status === 409) throw new Error('No. Unik sudah digunakan di tim ini');
        throw new Error(data.error ?? 'Gagal assign tim');
      }
      onSuccess();
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Terjadi kesalahan');
    } finally {
      setSaving(false);
    }
  };

  const handleRelease = async () => {
    setReleasing(true);
    setError('');
    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ team_id: null, no_unik: null }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? 'Gagal melepas dari tim');
      }
      onSuccess();
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Terjadi kesalahan');
    } finally {
      setReleasing(false);
    }
  };

  return (
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
        className="relative w-full max-w-lg bg-card/95 backdrop-blur-xl border border-primary/30 p-8 max-h-[90vh] overflow-y-auto"
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-foreground/40 hover:text-foreground transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-8">
          <UserCheck className="w-6 h-6 text-primary" />
          <h3 className="text-xl font-adventure gold-engraving">Assign ke Tim</h3>
        </div>

        <p className="text-sm text-foreground/60 mb-6 font-content">
          User: <span className="text-foreground font-adventure">{user.nama}</span>
          <span className="text-foreground/40 ml-2 text-[11px]">({user.npk})</span>
        </p>

        <div className="space-y-5">
          <div>
            <label className="block text-[10px] uppercase tracking-widest font-adventure text-primary/60 mb-2">Tim</label>
            <select
              value={teamId}
              onChange={e => setTeamId(e.target.value)}
              className="w-full bg-card border-b border-primary/30 py-1.5 text-sm text-foreground focus:outline-none focus:border-primary transition-colors [&>option]:bg-black [&>option]:text-white"
            >
              {teams.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[10px] uppercase tracking-widest font-adventure text-primary/60 mb-2">No. Unik</label>
            <input
              type="text"
              value={noUnik}
              onChange={e => setNoUnik(e.target.value)}
              placeholder="Nomor unik dalam tim"
              className="w-full bg-transparent border-b border-primary/30 py-1.5 text-sm text-foreground focus:outline-none focus:border-primary transition-colors"
            />
          </div>

          <div>
            <label className="block text-[10px] uppercase tracking-widest font-adventure text-primary/60 mb-2">Role dalam Tim</label>
            <select
              value={roleInTeam}
              onChange={e => setRoleInTeam(e.target.value)}
              className="w-full bg-card border-b border-primary/30 py-1.5 text-sm text-foreground focus:outline-none focus:border-primary transition-colors [&>option]:bg-black [&>option]:text-white"
            >
              {['kaptain', 'cocaptain', 'member'].map(r => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>

          {error && <p className="text-red-400 text-[10px]">{error}</p>}

          <button
            onClick={handleAssign}
            disabled={saving}
            className="w-full flex items-center justify-center gap-2 bg-primary/20 hover:bg-primary/30 border border-primary/40 text-primary text-[10px] font-adventure uppercase tracking-widest px-4 py-2 transition-all disabled:opacity-40"
          >
            {saving && <Loader2 className="w-3 h-3 animate-spin" />}
            Assign ke Tim
          </button>

          {user.team_id && (
            <button
              onClick={handleRelease}
              disabled={releasing}
              className="w-full flex items-center justify-center gap-2 bg-red-900/20 hover:bg-red-900/30 border border-red-500/30 text-red-400 text-[10px] font-adventure uppercase tracking-widest px-4 py-2 transition-all disabled:opacity-40"
            >
              {releasing && <Loader2 className="w-3 h-3 animate-spin" />}
              Lepas dari Tim
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
}


// ─── BulkUploadPanel ──────────────────────────────────────────────────────────

function BulkUploadPanel({
  activeEventId,
  onSuccess,
}: {
  activeEventId: string | null;
  onSuccess: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [allRows, setAllRows] = useState<ParsedUserRow[]>([]);
  const [preview, setPreview] = useState<ParsedUserRow[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [report, setReport] = useState<UploadReport | null>(null);
  const [failedExpanded, setFailedExpanded] = useState(false);

  const downloadTemplate = () => {
    const header = 'nama,npk,role,team_name,no_unik';
    const rows = [
      'Budi Santoso,12345,kaptain,Tim Elang,001',
      'Siti Rahayu,12346,member,Tim Elang,002',
    ];
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'template_users.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const content = ev.target?.result as string;
      const result = parseUserCSV(content);
      setAllRows(result.rows);
      setPreview(result.rows.slice(0, 10));
      setParseErrors(result.errors);
      setReport(null);
    };
    reader.readAsText(file);
  };

  const handleImport = async () => {
    if (allRows.length === 0 || parseErrors.length > 0) return;
    setImporting(true);
    try {
      const res = await fetch('/api/users/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: allRows, event_id: activeEventId ?? undefined }),
      });
      const data = await res.json();
      setReport(data.report);
      if (data.report && (data.report.usersCreated > 0 || data.report.assignmentsSuccess > 0)) {
        onSuccess();
      }
    } catch {
      setParseErrors(['Gagal menghubungi server. Coba lagi.']);
    } finally {
      setImporting(false);
    }
  };

  const handleReset = () => {
    setAllRows([]);
    setPreview([]);
    setParseErrors([]);
    setReport(null);
    setFailedExpanded(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="adventure-card p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h4 className="font-adventure text-base gold-engraving">Bulk Upload CSV</h4>
        <button
          onClick={downloadTemplate}
          className="flex items-center gap-2 bg-primary/20 hover:bg-primary/30 border border-primary/40 text-primary text-[10px] font-adventure uppercase tracking-widest px-4 py-2 transition-all"
        >
          <Download className="w-3 h-3" />
          Download Template CSV
        </button>
      </div>

      {!report && (
        <>
          <div
            className="border border-dashed border-primary/30 p-8 flex flex-col items-center justify-center gap-3 cursor-pointer hover:border-primary/60 transition-colors"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="w-8 h-8 text-primary/40" />
            <p className="text-[11px] text-foreground/50 font-content">Klik untuk pilih file CSV</p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>

          {parseErrors.length > 0 && (
            <div className="space-y-1">
              {parseErrors.map((err, i) => (
                <p key={i} className="text-red-400 text-[10px] flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3 shrink-0" />
                  {err}
                </p>
              ))}
            </div>
          )}

          {preview.length > 0 && parseErrors.length === 0 && (
            <div className="space-y-3">
              <p className="text-[10px] uppercase tracking-widest font-adventure text-primary/60">
                Preview ({allRows.length} baris{allRows.length > 10 ? `, menampilkan 10 pertama` : ''})
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-[11px] font-content">
                  <thead>
                    <tr className="border-b border-primary/20">
                      {['Nama', 'NPK', 'Role', 'Tim', 'No. Unik'].map(h => (
                        <th key={h} className="text-left py-2 pr-4 text-primary/60 font-adventure uppercase tracking-wider text-[9px]">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((row, i) => (
                      <tr key={i} className="border-b border-primary/5">
                        <td className="py-1.5 pr-4 text-foreground/80">{row.nama}</td>
                        <td className="py-1.5 pr-4 text-foreground/60">{row.npk}</td>
                        <td className="py-1.5 pr-4"><RoleBadge role={row.role} /></td>
                        <td className="py-1.5 pr-4 text-foreground/60">{row.team_name || '—'}</td>
                        <td className="py-1.5 pr-4 text-foreground/60">{row.no_unik || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <button
                onClick={handleImport}
                disabled={importing || allRows.length === 0}
                className="flex items-center gap-2 bg-primary/20 hover:bg-primary/30 border border-primary/40 text-primary text-[10px] font-adventure uppercase tracking-widest px-4 py-2 transition-all disabled:opacity-40"
              >
                {importing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
                {importing ? 'Memproses...' : `Import ${allRows.length} Users`}
              </button>
            </div>
          )}
        </>
      )}

      {report && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-primary/5 border border-primary/20 p-3">
              <p className="text-[10px] font-adventure uppercase tracking-wider text-primary/60 mb-1">User Baru</p>
              <p className="text-xl font-adventure gold-engraving">✓ {report.usersCreated}</p>
            </div>
            <div className="bg-foreground/5 border border-foreground/10 p-3">
              <p className="text-[10px] font-adventure uppercase tracking-wider text-foreground/40 mb-1">Di-skip</p>
              <p className="text-xl font-adventure text-foreground/60">→ {report.usersSkipped}</p>
            </div>
            <div className="bg-primary/5 border border-primary/20 p-3">
              <p className="text-[10px] font-adventure uppercase tracking-wider text-primary/60 mb-1">Tim Baru</p>
              <p className="text-xl font-adventure gold-engraving">🏕 {report.teamsCreated}</p>
            </div>
            <div className="bg-primary/5 border border-primary/20 p-3">
              <p className="text-[10px] font-adventure uppercase tracking-wider text-primary/60 mb-1">Assignment</p>
              <p className="text-xl font-adventure gold-engraving">✓ {report.assignmentsSuccess}</p>
            </div>
          </div>

          {report.failed > 0 && (
            <div className="border border-red-500/20 bg-red-900/10 p-3">
              <button
                onClick={() => setFailedExpanded(v => !v)}
                className="w-full flex items-center justify-between text-red-400 text-[10px] font-adventure uppercase tracking-wider"
              >
                <span className="flex items-center gap-2">
                  <AlertTriangle className="w-3 h-3" />
                  ✗ {report.failed} baris gagal
                </span>
                {failedExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>
              <AnimatePresence>
                {failedExpanded && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden mt-3 space-y-1"
                  >
                    {report.failedRows.map((fr, i) => (
                      <p key={i} className="text-red-400 text-[10px]">
                        Baris {fr.row}: {fr.reason}
                      </p>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {report.failed === 0 && (
            <div className="flex items-center gap-2 text-primary text-[11px] font-content">
              <CheckCircle className="w-4 h-4" />
              Semua baris berhasil diproses
            </div>
          )}

          <button
            onClick={handleReset}
            className="flex items-center gap-2 bg-primary/20 hover:bg-primary/30 border border-primary/40 text-primary text-[10px] font-adventure uppercase tracking-widest px-4 py-2 transition-all"
          >
            <Upload className="w-3 h-3" />
            Import Lagi
          </button>
        </div>
      )}
    </div>
  );
}


// ─── UsersTab ─────────────────────────────────────────────────────────────────

export default function UsersTab({
  activeEvent,
}: {
  activeEvent: { id: string; name: string } | null;
}) {
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeRoleTab, setActiveRoleTab] = useState<string>('all');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingUser, setEditingUser] = useState<UserRecord | null>(null);
  const [assigningUser, setAssigningUser] = useState<UserRecord | null>(null);
  const [assigningLocationUser, setAssigningLocationUser] = useState<UserRecord | null>(null);
  const [showBulkUpload, setShowBulkUpload] = useState(false);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/users');
      if (!res.ok) throw new Error('Failed to fetch users');
      const data = await res.json();
      setUsers(data.users ?? []);
    } catch (e) {
      console.error('[UsersTab] fetch error:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const filtered = users.filter(u => {
    const matchesSearch = !searchQuery.trim() ||
      u.nama.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.npk.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesRole = activeRoleTab === 'all' || u.role === activeRoleTab;
    return matchesSearch && matchesRole;
  });

  // Role tab definitions with real-time counts
  const roleTabs: { key: string; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'admin', label: 'Admin' },
    { key: 'kaptain', label: 'Kaptain' },
    { key: 'cocaptain', label: 'Cocaptain' },
    { key: 'member', label: 'Member' },
    { key: 'lo', label: 'LO' },
  ];

  const getTabCount = (key: string) =>
    key === 'all' ? users.length : users.filter(u => u.role === key).length;

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
          <h2 className="text-4xl font-adventure gold-engraving mb-1">Users</h2>
          <p className="text-muted-foreground text-sm italic opacity-70">
            Kelola data user dan assignment tim
          </p>
        </motion.div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowBulkUpload(v => !v)}
            className="flex items-center gap-2 bg-primary/20 hover:bg-primary/30 border border-primary/40 text-primary text-[10px] font-adventure uppercase tracking-widest px-4 py-2 transition-all"
          >
            <Upload className="w-3 h-3" />
            Bulk Upload
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 bg-primary/20 hover:bg-primary/30 border border-primary/40 text-primary text-[10px] font-adventure uppercase tracking-widest px-4 py-2 transition-all"
          >
            <UserPlus className="w-3 h-3" />
            New User
          </button>
        </div>
      </header>

      {/* Bulk Upload Panel */}
      <AnimatePresence>
        {showBulkUpload && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <BulkUploadPanel
              activeEventId={activeEvent?.id ?? null}
              onSuccess={fetchUsers}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Search + count */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-0 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-primary/40" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Cari nama atau NPK..."
            className="w-full bg-transparent border-b border-primary/30 pl-6 py-1.5 text-sm text-foreground focus:outline-none focus:border-primary transition-colors placeholder:text-foreground/30"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-0 top-1/2 -translate-y-1/2 text-foreground/30 hover:text-foreground transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <p className="text-[10px] font-adventure uppercase tracking-widest text-foreground/40">
          {filtered.length} users
        </p>
      </div>

      {/* Role Tabs */}
      <div className="flex items-center gap-1 flex-wrap border-b border-primary/20 pb-0">
        {roleTabs.map(tab => {
          const count = getTabCount(tab.key);
          const isActive = activeRoleTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveRoleTab(tab.key)}
              className={`flex items-center gap-1.5 px-3 py-2 text-[9px] font-adventure uppercase tracking-widest transition-all border-b-2 -mb-px ${
                isActive
                  ? 'border-primary text-primary'
                  : 'border-transparent text-foreground/40 hover:text-foreground/70 hover:border-primary/30'
              }`}
            >
              {tab.label}
              <span className={`text-[8px] px-1.5 py-0.5 rounded-sm font-mono ${
                isActive
                  ? 'bg-primary/20 text-primary'
                  : 'bg-foreground/10 text-foreground/40'
              }`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex flex-col items-center justify-center p-32 opacity-30 italic">
          <Loader2 className="w-10 h-10 animate-spin mb-4 text-primary" />
          <span className="text-sm font-content">Memuat data user...</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="adventure-card border-dashed border-primary/10 p-24 flex flex-col items-center justify-center text-center opacity-50">
          <div className="bg-primary/5 p-6 rounded-full mb-6 border border-primary/10">
            <Compass className="w-12 h-12 text-primary" />
          </div>
          <h3 className="font-adventure text-2xl mb-2 gold-engraving">Belum Ada User</h3>
          <p className="text-muted-foreground max-w-sm italic">
            {searchQuery ? 'Tidak ada user yang cocok dengan pencarian.' : 'Buat user baru atau upload CSV untuk memulai.'}
          </p>
        </div>
      ) : (
        <div className="adventure-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm font-content">
              <thead>
                <tr className="border-b border-primary/20">
                  {['Nama', 'NPK', 'Role', 'Tim', 'No. Unik', 'Event',
                    ...(activeRoleTab === 'lo' ? ['Lokasi'] : []),
                    'Aksi',
                  ].map(h => (
                    <th
                      key={h}
                      className="text-left px-4 py-3 text-[9px] font-adventure uppercase tracking-widest text-primary/60"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((user, idx) => (
                  <motion.tr
                    key={user.id}
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.02 }}
                    className="border-b border-primary/5 hover:bg-primary/5 transition-colors"
                  >
                    <td className="px-4 py-3 text-foreground/90">{user.nama}</td>
                    <td className="px-4 py-3 text-foreground/60 font-mono text-[11px]">{user.npk}</td>
                    <td className="px-4 py-3">
                      <RoleBadge role={user.role} />
                    </td>
                    <td className="px-4 py-3 text-foreground/60 text-[11px]">
                      {user.team_name ?? (
                        <span className="text-foreground/30 italic">Belum ada tim</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-foreground/60 font-mono text-[11px]">
                      {user.no_unik ?? <span className="text-foreground/20">—</span>}
                    </td>
                    <td className="px-4 py-3 text-foreground/60 text-[11px]">
                      {user.event_name ?? <span className="text-foreground/20">—</span>}
                    </td>
                    {/* Lokasi column — only visible on LO tab */}
                    {activeRoleTab === 'lo' && (
                      <td className="px-4 py-3 text-[11px]">
                        {user.assigned_location_name ? (
                          <span className="flex items-center gap-1 text-blue-400">
                            <MapPin className="w-3 h-3 shrink-0" />
                            {user.assigned_location_name}
                          </span>
                        ) : (
                          <span className="text-foreground/30 italic">Belum di-assign</span>
                        )}
                      </td>
                    )}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setEditingUser(user)}
                          className="p-1.5 text-foreground/40 hover:text-primary transition-colors"
                          aria-label={`Edit ${user.nama}`}
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        {!user.team_id && user.role !== 'lo' && (
                          <button
                            onClick={() => setAssigningUser(user)}
                            className="flex items-center gap-1 bg-primary/20 hover:bg-primary/30 border border-primary/40 text-primary text-[9px] font-adventure uppercase tracking-widest px-2 py-1 transition-all"
                            aria-label={`Assign ${user.nama} to team`}
                          >
                            <UserCheck className="w-3 h-3" />
                            Assign
                          </button>
                        )}
                        {/* Assign Location button — only for LO users */}
                        {user.role === 'lo' && (
                          <button
                            onClick={() => setAssigningLocationUser(user)}
                            className="flex items-center gap-1 bg-blue-900/20 hover:bg-blue-900/30 border border-blue-500/30 text-blue-400 text-[9px] font-adventure uppercase tracking-widest px-2 py-1 transition-all"
                            aria-label={`Assign lokasi untuk ${user.nama}`}
                          >
                            <MapPin className="w-3 h-3" />
                            Assign Location
                          </button>
                        )}
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modals */}
      <AnimatePresence>
        {showCreateModal && (
          <UserFormModal
            user={null}
            onSuccess={fetchUsers}
            onClose={() => setShowCreateModal(false)}
          />
        )}
        {editingUser && (
          <UserFormModal
            user={editingUser}
            onSuccess={fetchUsers}
            onClose={() => setEditingUser(null)}
          />
        )}
        {assigningUser && (
          <AssignTeamModal
            user={assigningUser}
            onSuccess={fetchUsers}
            onClose={() => setAssigningUser(null)}
          />
        )}
      </AnimatePresence>

      {/* AssignLocationModal — rendered outside AnimatePresence to avoid conflicts */}
      {assigningLocationUser && (
        <AssignLocationModal
          isOpen={true}
          user={assigningLocationUser}
          onSuccess={() => {
            fetchUsers();
            setAssigningLocationUser(null);
          }}
          onClose={() => setAssigningLocationUser(null)}
        />
      )}
    </motion.div>
  );
}
