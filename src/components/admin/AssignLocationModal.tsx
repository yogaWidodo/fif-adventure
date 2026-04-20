'use client';

/**
 * AssignLocationModal — modal untuk admin meng-assign LO ke wahana/challenge.
 */

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MapPin, X, Loader2, Compass, AlertCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';

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

interface ActivityOption {
  id: string;
  name: string;
  type: string;
  max_points: number;
}

interface AssignLocationModalProps {
  isOpen: boolean;
  user: UserRecord;
  onSuccess: () => void;
  onClose: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AssignLocationModal({
  isOpen,
  user,
  onSuccess,
  onClose,
}: AssignLocationModalProps) {
  const [activities, setActivities] = useState<ActivityOption[]>([]);
  const [selectedActivityId, setSelectedActivityId] = useState('');
  const [currentAssignment, setCurrentAssignment] = useState<{ id: string; name: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [isChanging, setIsChanging] = useState(false);
  const [error, setError] = useState('');

  // Fetch updated status and all activities
  useEffect(() => {
    if (!isOpen) return;

    const fetchData = async () => {
      setLoading(true);
      setError('');
      try {
        // 1. Fetch current assignment for this user (Fresh from DB to avoid prop staleness)
        const { data: current, error: currentError } = await supabase
          .from('lo_assignments')
          .select('activity_id, activities(name)')
          .eq('lo_id', user.id)
          .maybeSingle();

        if (currentError) throw currentError;

        if (current) {
          const assignment = {
            id: current.activity_id,
            name: (current.activities as any)?.name || 'Unknown'
          };
          setCurrentAssignment(assignment);
          setSelectedActivityId(assignment.id);
          setIsChanging(false);
        } else {
          setCurrentAssignment(null);
          setSelectedActivityId('');
          setIsChanging(true); // Show selector if no assignment
        }

        // 2. Fetch all activities for the list
        const { data: actData, error: actError } = await supabase
          .from('activities')
          .select('id, name, type, max_points')
          .order('name');
        
        if (actError) throw actError;

        // 3. Fetch all current assignments to see which ones are taken by OTHERS
        const { data: allAssignments, error: allAssignError } = await supabase
          .from('lo_assignments')
          .select('lo_id, activity_id');

        if (allAssignError) throw allAssignError;

        const takenByOthers = (allAssignments ?? [])
          .filter(a => a.lo_id !== user.id)
          .map(a => a.activity_id);

        const available = (actData ?? []).filter(act => !takenByOthers.includes(act.id));
        setActivities(available);

      } catch (err: any) {
        setError('Gagal sinkronisasi data wahana');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [isOpen, user.id]);

  const handleAssign = async () => {
    if (!selectedActivityId) {
      setError('Pilih wahana terlebih dahulu');
      return;
    }
    setAssigning(true);
    setError('');
    try {
      // Step 1: Remove old assignment
      await supabase.from('lo_assignments').delete().eq('lo_id', user.id);

      // Step 2: Insert new one
      const { error: assignError } = await supabase
        .from('lo_assignments')
        .insert({ lo_id: user.id, activity_id: selectedActivityId });

      if (assignError) throw assignError;

      onSuccess();
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Terjadi kesalahan sistem');
    } finally {
      setAssigning(false);
    }
  };

  const handleRemove = async () => {
    setRemoving(true);
    setError('');
    try {
      const { error: deleteError } = await supabase
        .from('lo_assignments')
        .delete()
        .eq('lo_id', user.id);

      if (deleteError) throw deleteError;

      onSuccess();
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Terjadi kesalahan sistem');
    } finally {
      setRemoving(false);
    }
  };

  const isWorking = assigning || removing || loading;

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={!isWorking ? onClose : undefined}
            className="absolute inset-0 bg-black/90"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="relative w-full max-w-lg bg-card border border-primary/30 p-8 max-h-[90vh] overflow-y-auto"
          >
            {!isWorking && (
              <button onClick={onClose} className="absolute top-4 right-4 text-foreground/40 hover:text-foreground transition-colors">
                <X className="w-5 h-5" />
              </button>
            )}

            <div className="flex items-center gap-3 mb-8">
              <MapPin className="w-6 h-6 text-primary" />
              <h3 className="text-xl font-adventure gold-engraving uppercase">Assign Penempatan LO</h3>
            </div>

            <div className="mb-6 pb-6 border-b border-primary/10">
              <p className="text-[10px] uppercase tracking-widest text-primary/40 mb-1">Target Liaison Officer</p>
              <p className="text-lg font-adventure">{user.name} <span className="text-sm opacity-40 font-mono">[{user.npk}]</span></p>
            </div>

            {loading ? (
              <div className="flex flex-col items-center justify-center py-12 opacity-40">
                <Loader2 className="w-8 h-8 animate-spin mb-3 text-primary" />
                <p className="text-[10px] uppercase font-adventure tracking-widest">Checking status...</p>
              </div>
            ) : (
              <>
                {/* ─── Penempatan Saat Ini ─── */}
                {currentAssignment && !isChanging && (
                  <div className="animate-in fade-in zoom-in-95 duration-300">
                    <div className="mb-8 p-6 bg-blue-900/10 border border-blue-500/20 rounded-sm text-center relative overflow-hidden">
                      <div className="absolute top-0 right-0 p-2 opacity-10">
                        <Compass className="w-16 h-16" />
                      </div>
                      <p className="text-[10px] uppercase tracking-[0.2em] font-adventure text-blue-400/60 mb-2">Penempatan Saat Ini</p>
                      <h4 className="text-2xl font-adventure gold-engraving mb-6 break-words px-4">{currentAssignment.name}</h4>
                      
                      <div className="flex gap-3 relative z-10">
                        <button
                          onClick={() => setIsChanging(true)}
                          className="flex-1 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 text-blue-400 text-[10px] font-adventure uppercase tracking-widest px-4 py-2.5 transition-all"
                        >
                          Pindah Lokasi
                        </button>
                        <button
                          onClick={handleRemove}
                          disabled={isWorking}
                          className="flex-1 bg-red-900/10 hover:bg-red-900/20 border border-red-500/30 text-red-500 text-[10px] font-adventure uppercase tracking-widest px-4 py-2.5 transition-all disabled:opacity-40"
                        >
                          {removing && <Loader2 className="w-3 h-3 animate-spin mr-2" />}
                          Hapus Tugas
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* ─── Belum Terassign ─── */}
                {!currentAssignment && !isChanging && (
                  <div className="mb-8 p-8 border border-white/5 bg-white/5 text-center">
                    <AlertCircle className="w-10 h-10 mx-auto text-primary/20 mb-3" />
                    <p className="text-[11px] font-adventure uppercase tracking-widest text-foreground/40">Belum ada penempatan</p>
                    <button onClick={() => setIsChanging(true)} className="mt-4 text-xs font-adventure text-primary underline underline-offset-4">Assign ke wahana</button>
                  </div>
                )}

                {/* ─── Form Pindah / Assign Baru ─── */}
                {isChanging && (
                  <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
                    <div className="bg-primary/5 p-4 border border-primary/10">
                      <label className="block text-[10px] uppercase tracking-widest font-adventure text-primary/60 mb-3">Pilih Wahana Tersedia</label>
                      <select
                        value={selectedActivityId}
                        onChange={e => setSelectedActivityId(e.target.value)}
                        disabled={isWorking}
                        className="w-full bg-transparent border-b border-primary/30 py-2 text-sm text-foreground focus:outline-none focus:border-primary transition-colors appearance-none cursor-pointer"
                      >
                        <option value="" className="bg-card">— Pilih wahana yang belum ada LO —</option>
                        {activities.map(act => (
                          <option key={act.id} value={act.id} className="bg-card">
                            {act.name} ({act.type.replace('_', ' ')})
                          </option>
                        ))}
                      </select>
                      {activities.length === 0 && (
                        <p className="text-[9px] text-amber-500/60 mt-2 italic">* Semua wahana sudah memiliki LO</p>
                      )}
                    </div>

                    {error && (
                      <div className="bg-red-500/10 border border-red-500/20 p-3 flex items-center gap-2 text-red-400 text-[10px] font-content">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        {error}
                      </div>
                    )}

                    <div className="flex gap-3">
                      {currentAssignment && (
                        <button
                          onClick={() => setIsChanging(false)}
                          className="flex-1 border border-foreground/10 text-foreground/40 text-[10px] font-adventure uppercase tracking-widest px-4 py-2 transition-all"
                        >
                          Batal
                        </button>
                      )}
                      <button
                        onClick={handleAssign}
                        disabled={isWorking || !selectedActivityId}
                        className="flex-[2] flex items-center justify-center gap-2 bg-primary/20 hover:bg-primary/30 border border-primary/40 text-primary text-[10px] font-adventure uppercase tracking-widest px-4 py-2 transition-all disabled:opacity-40"
                      >
                        {assigning && <Loader2 className="w-3 h-3 animate-spin" />}
                        Konfirmasi Penempatan
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
