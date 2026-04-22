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
  difficulty_level: string;
  is_active: boolean;
}

export default function LOPortal() {
  const { logout, user } = useAuth();
  const [wahanas, setWahanas] = useState<Wahana[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) return;
    fetchAssignedWahana(user.id);
  }, [user?.id]);

  const fetchAssignedWahana = async (userId: string) => {
    setLoading(true);

    // Step 1: Fetch ALL assignments for this LO
    const { data: assignments, error: assignmentError } = await supabase
      .from('lo_assignments')
      .select('activity_id, activities(id, name, description, max_points, difficulty_level, type)')
      .eq('lo_id', userId);

    if (assignmentError || !assignments || assignments.length === 0) {
      setWahanas([]);
      setLoading(false);
      return;
    }

    const mappedWahanas = assignments.map((a: any) => ({
      id: a.activities.id,
      name: a.activities.name,
      description: a.activities.description,
      points: a.activities.max_points,
      difficulty_level: a.activities.difficulty_level || 'Medium',
      is_active: true
    }));

    setWahanas(mappedWahanas);
    setLoading(false);
  };

  return (
    <AuthGuard allowedRoles={['lo']}>
      <div className="relative min-h-screen flex flex-col overflow-hidden font-content selection:bg-primary selection:text-primary-foreground">
        {/* Immersive Background */}
        <div
          className="fixed inset-0 z-0 bg-cover bg-center opacity-30 mix-blend-luminosity"
          style={{
            backgroundImage: 'url("/images/expedition_map_bg.png")',
            filter: 'brightness(0.4) contrast(1.3) saturate(0.5)',
          }}
        />
        {/* Vignette Overlay */}
        <div className="fixed inset-0 z-0 bg-[radial-gradient(circle_at_center,rgba(18,29,23,0.4)_0%,rgba(10,20,15,0.95)_100%)]" />
        <div className="fixed inset-0 z-10 jungle-overlay opacity-5 pointer-events-none" />

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
              <h1 className="font-adventure text-4xl md:text-6xl gold-engraving mb-4">
                Field Officer
              </h1>
              <p className="text-muted-foreground italic font-content max-w-lg mx-auto opacity-70 px-4">
                "Select your post, Officer. The expedition teams await your guidance."
              </p>
              {user?.name && (
                <p className="mt-4 text-[11px] uppercase font-adventure tracking-[0.3em] text-primary/60">
                  Officer: {user.name}
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
            ) : wahanas.length === 0 ? (
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
            ) : (
              /* Show all assigned wahana cards */
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {wahanas.map((wahana, idx) => (
                  <motion.div
                    key={wahana.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.1 }}
                  >
                    <Link href={`/lo/${wahana.id}`}>
                      <div className="adventure-card p-8 group cursor-pointer border-primary/20 hover:border-primary transition-all bg-card/40 backdrop-blur-sm">
                        <div className="flex justify-between items-start mb-6">
                          <div className="bg-primary/10 p-3 rounded-lg border border-primary/20 group-hover:bg-primary/20 transition-colors">
                            <Flame className="w-6 h-6 text-primary torch-glow" />
                          </div>
                          <div className="flex flex-col items-end gap-2">
                            <span className="text-[10px] font-adventure uppercase tracking-widest text-primary/60 bg-primary/10 px-3 py-1 border border-primary/20">
                              {wahana.points} pts
                            </span>
                            <DifficultyBadge level={wahana.difficulty_level} />
                          </div>
                        </div>

                        <h3 className="font-adventure text-xl gold-engraving mb-2 group-hover:scale-[1.02] transition-transform origin-left">
                          {wahana.name}
                        </h3>
                        <p className="text-muted-foreground text-xs font-content opacity-60 mb-6 line-clamp-2 italic">
                          {wahana.description || 'Manage team scores at this expedition post.'}
                        </p>

                        <div className="flex items-center justify-between pt-4 border-t border-primary/10">
                          <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                            <span className="text-[10px] uppercase font-adventure text-green-400 tracking-widest">
                              Authorized
                            </span>
                          </div>
                          <span className="text-[10px] font-adventure uppercase tracking-widest text-primary/60 group-hover:text-primary transition-colors">
                            Enter Post →
                          </span>
                        </div>
                      </div>
                    </Link>
                  </motion.div>
                ))}
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
