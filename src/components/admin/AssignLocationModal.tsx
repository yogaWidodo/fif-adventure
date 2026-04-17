'use client';

/**
 * AssignLocationModal — modal untuk admin meng-assign LO ke wahana/challenge.
 * Requirements: 2.3, 2.4, 3.6, 3.7
 */

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MapPin, X, Loader2, Compass } from 'lucide-react';
import { supabase } from '@/lib/supabase';

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

interface LocationOption {
  id: string;
  name: string;
  type: string;
  points: number;
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
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState('');
  const [loadingLocations, setLoadingLocations] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState('');

  // Fetch active wahana/challenge locations when modal opens
  useEffect(() => {
    if (!isOpen) return;

    setLoadingLocations(true);
    setError('');
    setSelectedLocationId(user.assigned_location_id ?? '');

    supabase
      .from('locations')
      .select('id, name, type, points')
      .eq('is_active', true)
      .in('type', ['wahana', 'challenge'])
      .order('name')
      .then(({ data, error: fetchError }) => {
        if (fetchError) {
          setError('Gagal memuat daftar lokasi');
        } else {
          setLocations(data ?? []);
          // Pre-select current assignment if it exists and is in the list
          if (user.assigned_location_id) {
            const exists = (data ?? []).some(l => l.id === user.assigned_location_id);
            setSelectedLocationId(exists ? user.assigned_location_id : '');
          }
        }
        setLoadingLocations(false);
      });
  }, [isOpen, user.assigned_location_id]);

  const handleAssign = async () => {
    if (!selectedLocationId) {
      setError('Pilih lokasi terlebih dahulu');
      return;
    }
    setAssigning(true);
    setError('');
    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assigned_location_id: selectedLocationId }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? 'Gagal meng-assign lokasi');
      }
      onSuccess();
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Terjadi kesalahan');
    } finally {
      setAssigning(false);
    }
  };

  const handleRemove = async () => {
    setRemoving(true);
    setError('');
    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assigned_location_id: null }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? 'Gagal menghapus assignment');
      }
      onSuccess();
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Terjadi kesalahan');
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
            className="absolute inset-0 bg-black/80 backdrop-blur-md"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="relative w-full max-w-lg bg-card/95 backdrop-blur-xl border border-primary/30 p-8 max-h-[90vh] overflow-y-auto"
          >
            {!isLoading && (
              <button
                onClick={onClose}
                className="absolute top-4 right-4 text-foreground/40 hover:text-foreground transition-colors"
                aria-label="Tutup modal"
              >
                <X className="w-5 h-5" />
              </button>
            )}

            {/* Header */}
            <div className="flex items-center gap-3 mb-8">
              <MapPin className="w-6 h-6 text-primary" />
              <h3 className="text-xl font-adventure gold-engraving">Assign Lokasi</h3>
            </div>

            {/* User info */}
            <p className="text-sm text-foreground/60 mb-6 font-content">
              LO:{' '}
              <span className="text-foreground font-adventure">{user.nama}</span>
              <span className="text-foreground/40 ml-2 text-[11px]">({user.npk})</span>
            </p>

            {/* Current assignment info */}
            {user.assigned_location_name && (
              <div className="mb-5 px-3 py-2 bg-blue-900/20 border border-blue-500/30 flex items-center gap-2">
                <Compass className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                <p className="text-[11px] font-content text-blue-300">
                  Saat ini di-assign ke:{' '}
                  <span className="font-adventure">{user.assigned_location_name}</span>
                </p>
              </div>
            )}

            <div className="space-y-5">
              {/* Location dropdown */}
              <div>
                <label className="block text-[10px] uppercase tracking-widest font-adventure text-primary/60 mb-2">
                  Pilih Lokasi
                </label>
                {loadingLocations ? (
                  <div className="flex items-center gap-2 py-2 text-foreground/40">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span className="text-[11px] font-content">Memuat lokasi...</span>
                  </div>
                ) : locations.length === 0 ? (
                  <p className="text-[11px] font-content text-foreground/40 italic py-2">
                    Tidak ada wahana/challenge aktif tersedia.
                  </p>
                ) : (
                  <select
                    value={selectedLocationId}
                    onChange={e => setSelectedLocationId(e.target.value)}
                    disabled={isLoading}
                    className="w-full bg-card border-b border-primary/30 py-1.5 text-sm text-foreground focus:outline-none focus:border-primary transition-colors [&>option]:bg-black [&>option]:text-white disabled:opacity-50"
                  >
                    <option value="">— Pilih lokasi —</option>
                    {locations.map(loc => (
                      <option key={loc.id} value={loc.id}>
                        {loc.name} ({loc.type} · {loc.points} poin)
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Error message */}
              {error && (
                <p className="text-red-400 text-[10px] font-content">{error}</p>
              )}

              {/* Assign button */}
              <button
                onClick={handleAssign}
                disabled={isLoading || loadingLocations || !selectedLocationId}
                className="w-full flex items-center justify-center gap-2 bg-primary/20 hover:bg-primary/30 border border-primary/40 text-primary text-[10px] font-adventure uppercase tracking-widest px-4 py-2 transition-all disabled:opacity-40"
              >
                {assigning && <Loader2 className="w-3 h-3 animate-spin" />}
                Assign
              </button>

              {/* Remove assignment button — only shown if user already has an assignment */}
              {user.assigned_location_id && (
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
