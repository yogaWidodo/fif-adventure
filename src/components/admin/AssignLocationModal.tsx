'use client';

/**
 * AssignLocationModal — modal untuk admin meng-assign LO ke wahana/challenge.
 */

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MapPin, X, Loader2, Compass } from 'lucide-react';
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
  const [loadingActivities, setLoadingActivities] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState('');

  // Fetch active wahana/challenge activities when modal opens
  useEffect(() => {
    if (!isOpen) return;

    setLoadingActivities(true);
    setError('');
    setSelectedActivityId(user.activity_id ?? '');

    supabase
      .from('activities')
      .select('id, name, type, max_points')
      .order('name')
      .then(({ data, error: fetchError }) => {
        if (fetchError) {
          setError('Gagal memuat daftar wahana');
        } else {
          setActivities(data ?? []);
          if (user.activity_id) {
            const exists = (data ?? []).some(l => l.id === user.activity_id);
            setSelectedActivityId(exists ? user.activity_id : '');
          }
        }
        setLoadingActivities(false);
      });
  }, [isOpen, user.activity_id]);

  const handleAssign = async () => {
    if (!selectedActivityId) {
      setError('Pilih wahana terlebih dahulu');
      return;
    }
    setAssigning(true);
    setError('');
    try {
      // Step 1: Delete existing assignment for this LO
      await supabase.from('lo_assignments').delete().eq('lo_id', user.id);

      // Step 2: Create new assignment
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

  const isLoading = assigning || removing;

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={!isLoading ? onClose : undefined}
            className="absolute inset-0 bg-black/90"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="relative w-full max-w-lg bg-card border border-primary/30 p-8 max-h-[90vh] overflow-y-auto"
          >
            {!isLoading && (
              <button
                onClick={onClose}
                className="absolute top-4 right-4 text-foreground/40 hover:text-foreground transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            )}

            <div className="flex items-center gap-3 mb-8">
              <MapPin className="w-6 h-6 text-primary" />
              <h3 className="text-xl font-adventure gold-engraving">Assign Lokasi Wahana</h3>
            </div>

            <p className="text-sm text-foreground/60 mb-6 font-content">
              LO: <span className="text-foreground font-adventure">{user.name}</span>
              <span className="text-foreground/40 ml-2 text-[11px]">({user.npk})</span>
            </p>

            {user.activity_name && (
              <div className="mb-5 px-3 py-2 bg-blue-900/20 border border-blue-500/30 flex items-center gap-2">
                <Compass className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                <p className="text-[11px] font-content text-blue-300">
                  Saat ini di-assign ke: <span className="font-adventure">{user.activity_name}</span>
                </p>
              </div>
            )}

            <div className="space-y-5">
              <div>
                <label className="block text-[10px] uppercase tracking-widest font-adventure text-primary/60 mb-2">Pilih Wahana</label>
                {loadingActivities ? (
                  <div className="flex items-center gap-2 py-2 text-foreground/40">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span className="text-[11px] font-content">Memuat daftar...</span>
                  </div>
                ) : (
                  <select
                    value={selectedActivityId}
                    onChange={e => setSelectedActivityId(e.target.value)}
                    disabled={isLoading}
                    className="w-full bg-card border-b border-primary/30 py-1.5 text-sm text-foreground focus:outline-none focus:border-primary transition-colors"
                  >
                    <option value="">— Pilih wahana —</option>
                    {activities.map(act => (
                      <option key={act.id} value={act.id}>
                        {act.name} ({act.type})
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {error && <p className="text-red-400 text-[10px] font-content">{error}</p>}

              <button
                onClick={handleAssign}
                disabled={isLoading || loadingActivities || !selectedActivityId}
                className="w-full flex items-center justify-center gap-2 bg-primary/20 hover:bg-primary/30 border border-primary/40 text-primary text-[10px] font-adventure uppercase tracking-widest px-4 py-2 transition-all disabled:opacity-40"
              >
                {assigning && <Loader2 className="w-3 h-3 animate-spin" />}
                Set Assignment
              </button>

              {user.activity_id && (
                <button
                  onClick={handleRemove}
                  disabled={isLoading}
                  className="w-full flex items-center justify-center gap-2 bg-red-900/20 hover:bg-red-900/30 border border-red-500/30 text-red-400 text-[10px] font-adventure uppercase tracking-widest px-4 py-2 transition-all disabled:opacity-40"
                >
                  {removing && <Loader2 className="w-3 h-3 animate-spin" />}
                  Hapus Assignment
                </button>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
