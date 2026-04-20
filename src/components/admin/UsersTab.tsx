'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  UserPlus, Edit2, UserCheck, UserMinus, Upload, Download,
  Search, X, Loader2, Compass, MapPin,
} from 'lucide-react';
import AssignLocationModal from '@/components/admin/AssignLocationModal';
import { supabase } from '@/lib/supabase';
import { parseUserCSV, type ParsedUserRow, type UploadReport } from '@/lib/userManagement';

// ─── Types ────────────────────────────────────────────────────────────────────

interface UserRecord {
  id: string;
  name: string;
  npk: string;
  role: string;
  birth_date: string | null;
  team_id: string | null;
  team_name: string | null;
  activity_id: string | null;
  activity_name: string | null;
  created_at: string;
}

interface TeamOption {
  id: string;
  name: string;
}

// ─── Role Badge ───────────────────────────────────────────────────────────────

function RoleBadge({ role }: { role: string }) {
  const cls: Record<string, string> = {
    admin: 'bg-red-900/30 text-red-400 border-red-500/30',
    captain: 'bg-primary/20 text-primary border-primary/30',
    vice_captain: 'bg-amber-900/30 text-amber-400 border-amber-500/30',
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
  const [name, setName] = useState(user?.name ?? '');
  const [npk, setNpk] = useState(user?.npk ?? '');
  const [role, setRole] = useState(user?.role ?? 'member');
  const [birthDate, setBirthDate] = useState(user?.birth_date ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const validate = (): string | null => {
    if (!name.trim()) return 'Nama wajib diisi';
    if (!npk.trim()) return 'NPK wajib diisi';
    if (!birthDate.trim()) return 'Tanggal Lahir wajib diisi';
    const validRoles = ['admin', 'captain', 'vice_captain', 'member', 'lo'];
    if (!validRoles.includes(role)) return 'Role tidak valid';
    
    // Check if moving to LO but still tied to a team
    if (role === 'lo' && user?.team_id) {
      return 'Lakukan Unassign member dari tim terlebih dahulu via menu Assign Tim sebelum memindah role ke LO.';
    }
    
    return null;
  };

  const handleSubmit = async () => {
    const err = validate();
    if (err) { setError(err); return; }
    setSaving(true);
    setError('');

    try {
      if (isEdit) {
        const body: Record<string, unknown> = {};
        if (name !== user!.name) body.name = name;
        if (npk !== user!.npk) body.npk = npk;
        if (role !== user!.role) body.role = role;
        if (birthDate !== user!.birth_date) body.birth_date = birthDate;

        const res = await fetch(`/api/users/${user!.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error('Gagal memperbarui user');
      } else {
        const res = await fetch('/api/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, npk, role, birth_date: birthDate }),
        });
        if (!res.ok) throw new Error('Gagal membuat user');
      }
      onSuccess();
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Terjadi kesalahan');
    } finally {
      setSaving(false);
    }
  };

  const handleUnassign = async () => {
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/users/${user!.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ team_id: null, role: 'member' }),
      });
      if (!res.ok) throw new Error('Gagal unassign tim');
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
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-black/90" />
      <motion.div initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, y: 20 }} className="relative w-full max-w-lg bg-card border border-primary/30 p-8 max-h-[90vh] overflow-y-auto">
        <button onClick={onClose} className="absolute top-4 right-4 text-foreground/40 hover:text-foreground transition-colors"><X className="w-5 h-5" /></button>
        <div className="flex items-center gap-3 mb-8">
          {isEdit ? <Edit2 className="w-6 h-6 text-primary" /> : <UserPlus className="w-6 h-6 text-primary" />}
          <h3 className="text-xl font-adventure gold-engraving">{isEdit ? 'Edit User' : 'User Baru'}</h3>
        </div>
        <div className="space-y-5">
          <div>
            <label className="block text-[10px] uppercase tracking-widest font-adventure text-primary/60 mb-2">Nama</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Nama lengkap" className="w-full bg-transparent border-b border-primary/30 py-1.5 text-sm text-foreground focus:outline-none focus:border-primary transition-colors" />
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-widest font-adventure text-primary/60 mb-2">NPK</label>
            <input type="text" value={npk} onChange={e => setNpk(e.target.value)} placeholder="NPK" className="w-full bg-transparent border-b border-primary/30 py-1.5 text-sm text-foreground focus:outline-none focus:border-primary transition-colors" />
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-widest font-adventure text-primary/60 mb-2">Tanggal Lahir (DDMMYYYY)</label>
            <input type="text" value={birthDate} onChange={e => setBirthDate(e.target.value)} placeholder="DDMMYYYY" className="w-full bg-transparent border-b border-primary/30 py-1.5 text-sm text-foreground focus:outline-none focus:border-primary transition-colors" />
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-widest font-adventure text-primary/60 mb-2">Role</label>
            <select value={role} onChange={e => setRole(e.target.value)} className="w-full bg-card border-b border-primary/30 py-1.5 text-sm text-foreground">
              {['admin', 'captain', 'vice_captain', 'member', 'lo'].map(r => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>
          {error && <p className="text-red-400 text-[10px]">{error}</p>}
          <div className="flex flex-col gap-3">
            <button onClick={handleSubmit} disabled={saving} className="w-full flex items-center justify-center gap-2 bg-primary/20 hover:bg-primary/30 border border-primary/40 text-primary text-[10px] font-adventure uppercase tracking-widest px-4 py-2 transition-all">
              {saving && <Loader2 className="w-3 h-3 animate-spin" />}
              {isEdit ? 'Simpan' : 'Buat User'}
            </button>
            
            {isEdit && user?.team_id && (
              <button 
                onClick={handleUnassign} 
                disabled={saving} 
                type="button"
                className="w-full flex items-center justify-center gap-2 bg-red-900/20 hover:bg-red-900/40 border border-red-500/40 text-red-500 text-[10px] font-adventure uppercase tracking-widest px-4 py-2 transition-all"
              >
                {saving && <Loader2 className="w-3 h-3 animate-spin" />}
                Unassign dari Tim
              </button>
            )}
          </div>
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
  const [roleInTeam, setRoleInTeam] = useState(user.role);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    supabase.from('teams').select('id,name').order('name').then(({ data }) => {
      setTeams(data ?? []);
      if (data && data.length > 0) setTeamId(user.team_id || data[0].id);
    });
  }, [user.team_id]);

  const handleAssign = async () => {
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ team_id: teamId || null, role: roleInTeam }),
      });
      if (!res.ok) throw new Error('Gagal assign tim');
      onSuccess();
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Terjadi kesalahan');
    } finally {
      setSaving(false);
    }
  };

  const handleUnassign = async () => {
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ team_id: null, role: 'member' }),
      });
      if (!res.ok) throw new Error('Gagal unassign tim');
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
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-black/90" />
      <motion.div initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, y: 20 }} className="relative w-full max-w-lg bg-card border border-primary/30 p-8">
        <button onClick={onClose} className="absolute top-4 right-4 text-foreground/40 hover:text-foreground transition-colors"><X className="w-5 h-5" /></button>
        <div className="flex items-center gap-3 mb-8">
          <UserCheck className="w-6 h-6 text-primary" />
          <h3 className="text-xl font-adventure gold-engraving">Assign Tim</h3>
        </div>
        <div className="space-y-5">
          <p className="text-xs text-foreground/60">User: <span className="text-primary">{user.name}</span></p>
          <div>
            <label className="block text-[10px] uppercase tracking-widest font-adventure text-primary/60 mb-2">Tim</label>
            <select value={teamId} onChange={e => setTeamId(e.target.value)} className="w-full bg-card border-b border-primary/30 py-1.5 text-sm text-foreground">
              <option value="">— Tidak ada tim —</option>
              {teams.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-widest font-adventure text-primary/60 mb-2">Role Tim</label>
            <select value={roleInTeam} onChange={e => setRoleInTeam(e.target.value)} className="w-full bg-card border-b border-primary/30 py-1.5 text-sm text-foreground">
              {['captain', 'vice_captain', 'member'].map(r => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>
          {error && <p className="text-red-400 text-[10px]">{error}</p>}
          <button onClick={handleAssign} disabled={saving} className="w-full flex items-center justify-center gap-2 bg-primary/20 hover:bg-primary/30 border border-primary/40 text-primary text-[10px] font-adventure uppercase tracking-widest px-4 py-2 transition-all">
            {saving && <Loader2 className="w-3 h-3 animate-spin" />}
            Update Sesuai Role
          </button>
          
          {user.team_id && (
            <button onClick={handleUnassign} disabled={saving} className="w-full flex items-center justify-center gap-2 bg-red-900/20 hover:bg-red-900/40 border border-red-500/40 text-red-500 text-[10px] font-adventure uppercase tracking-widest px-4 py-2 transition-all mt-3">
              {saving && <Loader2 className="w-3 h-3 animate-spin" />}
              Unassign dari Tim
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
}


// ─── BulkUploadPanel ──────────────────────────────────────────────────────────

function BulkUploadPanel({
  onSuccess,
}: {
  onSuccess: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [allRows, setAllRows] = useState<ParsedUserRow[]>([]);
  const [preview, setPreview] = useState<ParsedUserRow[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [report, setReport] = useState<UploadReport | null>(null);

  const downloadTemplate = () => {
    const header = 'name,npk,role,birth_date,team_name';
    const rows = [
      'Budi Santoso,12345,captain,17081995,Tim Elang',
      'Siti Rahayu,12346,member,20101996,Tim Elang',
    ];
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'template_v2.csv'; a.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const content = ev.target?.result as string;
      const result = parseUserCSV(content);
      setAllRows(result.rows);
      setPreview(result.rows.slice(0, 5));
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
        body: JSON.stringify({ rows: allRows }),
      });
      const data = await res.json();
      setReport(data.report);
      if (data.report) onSuccess();
    } catch {
      setParseErrors(['Gagal menghubungi server']);
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="adventure-card p-6 space-y-4">
      <div className="flex justify-between items-center">
        <h4 className="font-adventure text-primary text-sm uppercase">Import Users V2</h4>
        <button onClick={downloadTemplate} className="text-[9px] font-adventure text-primary/60 border border-primary/20 px-3 py-1 hover:bg-primary/10">Download Template</button>
      </div>
      {!report ? (
        <div className="space-y-4">
          <div onClick={() => fileInputRef.current?.click()} className="border-2 border-dashed border-primary/20 p-8 text-center cursor-pointer hover:border-primary/40 transition-all">
            <Upload className="w-8 h-8 text-primary/30 mx-auto mb-2" />
            <p className="text-[10px] text-foreground/40 uppercase tracking-widest font-adventure">Select CSV File</p>
            <input ref={fileInputRef} type="file" className="hidden" accept=".csv" onChange={handleFileChange} />
          </div>
          {preview.length > 0 && (
            <div className="text-[10px] text-foreground/50">
              Preview: {preview.map(r => r.name).join(', ')}...
              <button onClick={handleImport} className="block mt-4 w-full bg-primary/20 py-2 font-adventure text-primary">IMPORT {allRows.length} USERS</button>
            </div>
          )}
          {parseErrors.map(err => <p key={err} className="text-red-400 text-[10px]">{err}</p>)}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-primary/5 p-3 border border-primary/10"><p className="text-[9px] text-primary/60 uppercase">Created</p><p className="text-xl font-adventure">{report.usersCreated}</p></div>
          <div className="bg-red-900/5 p-3 border border-red-500/10"><p className="text-[9px] text-red-500/60 uppercase">Failed</p><p className="text-xl font-adventure">{report.failed}</p></div>
          <button onClick={() => setReport(null)} className="col-span-2 text-[9px] font-adventure uppercase text-primary/40 py-2 border border-primary/10">Upload Again</button>
        </div>
      )}
    </div>
  );
}


// ─── UsersTab ─────────────────────────────────────────────────────────────────

export default function UsersTab() {
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
      u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.npk.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesRole = activeRoleTab === 'all' || u.role === activeRoleTab;
    return matchesSearch && matchesRole;
  });

  const roleTabs: { key: string; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'admin', label: 'Admin' },
    { key: 'captain', label: 'Captain' },
    { key: 'vice_captain', label: 'Vice Captain' },
    { key: 'member', label: 'Member' },
    { key: 'lo', label: 'LO' },
  ];

  const getTabCount = (key: string) =>
    key === 'all' ? users.length : users.filter(u => u.role === key).length;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="p-10 space-y-8">
      <header className="flex justify-between items-end">
        <div>
          <h2 className="text-4xl font-adventure gold-engraving">Users</h2>
          <p className="text-muted-foreground text-sm italic">Kelola petualang dan LO</p>
        </div>
        <div className="flex gap-4">
          <button onClick={() => setShowBulkUpload(!showBulkUpload)} className="border border-primary/30 px-4 py-2 text-[10px] font-adventure uppercase tracking-widest text-primary hover:bg-primary/10">Bulk Import</button>
          <button onClick={() => setShowCreateModal(true)} className="bg-primary/20 border border-primary/40 px-4 py-2 text-[10px] font-adventure uppercase tracking-widest text-primary hover:bg-primary/30">+ New User</button>
        </div>
      </header>

      {showBulkUpload && <BulkUploadPanel onSuccess={fetchUsers} />}

      <div className="flex gap-4 items-center">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-primary/40" />
          <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search NPK or name..." className="w-full bg-transparent border-b border-primary/20 pl-8 py-2 text-sm focus:outline-none focus:border-primary transition-all" />
        </div>
        <p className="text-[10px] font-adventure uppercase tracking-widest text-foreground/40">
          {filtered.length} users
        </p>
      </div>

      <div className="flex items-center gap-1 flex-wrap border-b border-primary/10">
        {roleTabs.map(t => (
          <button key={t.key} onClick={() => setActiveRoleTab(t.key)} className={`px-4 py-2 text-[10px] uppercase font-adventure transition-all border-b-2 ${activeRoleTab === t.key ? 'text-primary border-primary' : 'text-foreground/40 hover:text-foreground/60 border-transparent'}`}>
            {t.label} ({getTabCount(t.key)})
          </button>
        ))}
      </div>

      <div className="overflow-hidden space-y-2">
        {loading ? (
          <div className="flex flex-col items-center justify-center p-20 opacity-30">
            <Loader2 className="w-8 h-8 animate-spin text-primary/40 mb-2" />
            <span className="text-[10px] font-adventure uppercase">Memuat data...</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-20 text-center opacity-30">
            <Compass className="w-12 h-12 mx-auto mb-4" />
            <p className="font-adventure text-sm tracking-widest lowercase">no explorers found</p>
          </div>
        ) : (
          filtered.map(user => (
            <div key={user.id} className="adventure-card p-4 flex items-center justify-between group">
              <div className="flex items-center gap-6">
                <div className="text-left">
                  <p className="text-sm font-adventure tracking-wider">{user.name}</p>
                  <p className="text-[10px] text-foreground/40 font-mono">{user.npk} • {user.birth_date}</p>
                </div>
                <RoleBadge role={user.role} />
                <div className="text-[10px] text-foreground/40 uppercase font-adventure">
                  {user.team_name ? <span className="text-primary/60">Team: {user.team_name}</span> : <span>Solo</span>}
                </div>
                {user.role === 'lo' && user.activity_name && (
                  <div className="flex items-center gap-1 text-[10px] text-blue-400 uppercase font-adventure">
                    <MapPin className="w-3 h-3" />
                    {user.activity_name}
                  </div>
                )}
              </div>
              <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={() => setEditingUser(user)} title="Edit User" className="p-2 hover:bg-primary/10 rounded-full text-primary/60 hover:text-primary transition-all"><Edit2 className="w-4 h-4" /></button>
                {user.role !== 'lo' && (
                  <button onClick={() => setAssigningUser(user)} title="Assign Team" className="p-2 hover:bg-primary/10 rounded-full text-primary/60 hover:text-primary transition-all"><UserCheck className="w-4 h-4" /></button>
                )}
                {user.team_id && (
                   <button 
                     onClick={async () => {
                       if (confirm(`Apakah Anda yakin ingin mengeluarkan ${user.name} dari tim?`)) {
                         const res = await fetch(`/api/users/${user.id}`, {
                           method: 'PATCH',
                           headers: { 'Content-Type': 'application/json' },
                           body: JSON.stringify({ team_id: null, role: 'member' }),
                         });
                         if (res.ok) fetchUsers();
                       }
                     }} 
                     title="Unassign Team"
                     className="p-2 hover:bg-red-900/20 rounded-full text-red-500/60 hover:text-red-500 transition-all"
                   >
                     <UserMinus className="w-4 h-4" />
                   </button>
                )}
                {user.role === 'lo' && (
                  <button onClick={() => setAssigningLocationUser(user)} title="Assign Activity" className="p-2 hover:bg-primary/10 rounded-full text-blue-400/60 hover:text-blue-400 transition-all"><MapPin className="w-4 h-4" /></button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      <AnimatePresence>
        {showCreateModal && <UserFormModal user={null} onSuccess={fetchUsers} onClose={() => setShowCreateModal(false)} />}
        {editingUser && <UserFormModal user={editingUser} onSuccess={fetchUsers} onClose={() => setEditingUser(null)} />}
        {assigningUser && <AssignTeamModal user={assigningUser} onSuccess={fetchUsers} onClose={() => setAssigningUser(null)} />}
      </AnimatePresence>

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
