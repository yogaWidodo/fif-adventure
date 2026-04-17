'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { MapPin, Compass, Flame, LogOut, Shield, AlertCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import AuthGuard from '@/components/AuthGuard';

interface Wahana {
  id: string;
  name: string;
  description: string | null;
  points: number;
  is_active: boolean;
}

export default function LOPortal() {
  const { logout, user } = useAuth();
  const [wahana, setWahana] = useState<Wahana | null>(null);
  const [assignedLocationId, setAssignedLocationId] = useState<string | null | undefined>(undefined);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) return;
    fetchAssignedWahana(user.id);
  }, [user?.id]);

  const fetchAssignedWahana = async (userId: string) => {
    setLoading(true);

    // Step 1: Fetch the LO's profile to get assigned_location_id
    const { data: profile, error: profileError } = await supabase
      .from('users')
      .select('assigned_location_id')
      .eq('id', userId)
      .single();

    if (profileError || !profile) {
      setAssignedLocationId(null);
      setLoading(false);
      return;
    }

    const locationId: string | null = profile.assigned_location_id ?? null;
    setAssignedLocationId(locationId);

    // Step 2: If no assignment, stop here
    if (!locationId) {
      setLoading(false);
      return;
    }

    // Step 3: Fetch only the assigned wahana
    const { data, error } = await supabase
      .from('locations')
      .select('id, name, description, points, is_active')
      .eq('id', locationId)
      .single();

    if (!error && data) {
      setWahana(data);
    }
    setLoading(false);
  };

  return (
    <AuthGuard allowedRoles={['lo']}>
      <div className="relative min-h-screen flex flex-col items-center bg-black overflow-hidden font-content selection:bg-primary selection:text-primary-foreground">
        {/* Immersive Background */}
        <div
          className="fixed inset-0 z-0 bg-cover bg-center opacity-30"
          style={{
            backgroundImage: 'url("/images/expedition_map_bg.png")',
            filter: 'brightness(0.4) contrast(1.1)',
          }}
        />
        <div className="fixed inset-0 z-0 bg-gradient-to-b from-black/80 via-transparent to-black" />
        <div className="fixed inset-0 z-10 jungle-overlay opacity-10 pointer-events-none" />

        <div className="relative z-20 w-full max-w-4xl p-6 md:p-16">
          {/* Header */}
          <header className="mb-16 text-center">
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <div className="flex items-center justify-center gap-2 mb-4">
                <span className="h-px w-12 bg-primary/40" />
                <div className="bg-primary/20 p-3 rounded-full border border-primary/20">
                  <Shield className="w-8 h-8 text-primary torch-glow" />
                </div>
                <span className="h-px w-12 bg-primary/40" />
              </div>
              <h1 className="font-adventure text-5xl md:text-6xl gold-engraving mb-4">
                Field Officer
              </h1>
              <p className="text-muted-foreground italic font-content max-w-lg mx-auto opacity-70">
                "Select your post, Officer. The expedition teams await your guidance."
              </p>
              {user?.nama && (
                <p className="mt-4 text-[11px] uppercase font-adventure tracking-[0.3em] text-primary/60">
                  Officer: {user.nama}
                </p>
              )}
            </motion.div>
          </header>

          {/* Assigned Post Section */}
          <section>
            <div className="flex items-center gap-3 mb-8">
              <span className="h-px flex-1 bg-primary/20" />
              <p className="text-[10px] uppercase font-adventure tracking-[0.4em] text-primary">
                Your Post
              </p>
              <span className="h-px flex-1 bg-primary/20" />
            </div>

            {loading ? (
              <div className="flex flex-col items-center justify-center p-32 opacity-40 italic">
                <Compass className="w-12 h-12 text-primary animate-spin-slow mb-4" />
                <p className="font-adventure text-sm tracking-widest">Scouting the field...</p>
              </div>
            ) : assignedLocationId === null ? (
              /* Not assigned to any location */
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="adventure-card border-dashed border-primary/10 p-24 flex flex-col items-center justify-center text-center opacity-70"
              >
                <div className="bg-primary/5 p-6 rounded-full mb-6 border border-primary/10">
                  <AlertCircle className="w-12 h-12 text-primary/60" />
                </div>
                <h3 className="font-adventure text-2xl mb-3 gold-engraving">Belum di-assign ke lokasi manapun</h3>
                <p className="text-muted-foreground max-w-sm italic text-sm">
                  Hubungi administrator ekspedisi untuk mendapatkan penugasan lokasi.
                </p>
              </motion.div>
            ) : wahana ? (
              /* Show the assigned wahana card */
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.07 }}
              >
                <Link href={`/lo/${wahana.id}`}>
                  <div className="adventure-card p-8 group cursor-pointer border-primary/20 hover:border-primary transition-all">
                    <div className="flex justify-between items-start mb-6">
                      <div className="bg-primary/10 p-3 rounded-lg border border-primary/20 group-hover:bg-primary/20 transition-colors">
                        <Flame className="w-6 h-6 text-primary torch-glow" />
                      </div>
                      <span className="text-[10px] font-adventure uppercase tracking-widest text-primary/60 bg-primary/10 px-3 py-1 border border-primary/20">
                        {wahana.points} pts
                      </span>
                    </div>

                    <h3 className="font-adventure text-xl gold-engraving mb-2 group-hover:scale-[1.02] transition-transform origin-left">
                      {wahana.name}
                    </h3>
                    <p className="text-muted-foreground text-xs font-content opacity-60 mb-6 line-clamp-2">
                      {wahana.description || 'Manage team scores at this expedition post.'}
                    </p>

                    <div className="flex items-center justify-between pt-4 border-t border-primary/10">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                        <span className="text-[10px] uppercase font-adventure text-green-400 tracking-widest">
                          Active
                        </span>
                      </div>
                      <span className="text-[10px] font-adventure uppercase tracking-widest text-primary/60 group-hover:text-primary transition-colors">
                        Enter Post →
                      </span>
                    </div>
                  </div>
                </Link>
              </motion.div>
            ) : (
              /* assigned_location_id exists but wahana not found */
              <div className="adventure-card border-dashed border-primary/10 p-24 flex flex-col items-center justify-center text-center opacity-50">
                <div className="bg-primary/5 p-6 rounded-full mb-6 border border-primary/10">
                  <MapPin className="w-12 h-12 text-primary" />
                </div>
                <h3 className="font-adventure text-2xl mb-2 gold-engraving">Post Not Found</h3>
                <p className="text-muted-foreground max-w-sm italic text-sm">
                  Assigned post could not be loaded. Contact the expedition administrator.
                </p>
              </div>
            )}
          </section>

          {/* Footer */}
          <footer className="mt-16 flex flex-col items-center opacity-40">
            <div className="flex items-center gap-4 mb-4">
              <span className="h-px w-24 bg-gradient-to-r from-transparent to-primary/40" />
              <span className="font-adventure text-[10px] tracking-[0.5em] uppercase">
                Field Command
              </span>
              <span className="h-px w-24 bg-gradient-to-l from-transparent to-primary/40" />
            </div>
            <button
              onClick={logout}
              className="flex items-center gap-2 text-[10px] uppercase font-adventure tracking-[0.3em] text-accent hover:underline"
            >
              <LogOut className="w-3 h-3" />
              Abandon Post
            </button>
          </footer>
        </div>
      </div>
    </AuthGuard>
  );
}
