'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, MapPin, Compass, Flame, Camera, CheckCircle2, ShieldAlert, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import AuthGuard from '@/components/AuthGuard';
import TeamQueueList from '@/components/lo/TeamQueueList';
import ScanModal from '@/components/lo/ScanModal';

interface WahanaInfo {
  id: string;
  name: string;
  description: string | null;
  points: number;
}

type ToastState = {
  type: 'success' | 'error';
  message: string;
} | null;

export default function LOScoreDashboard({
  params,
}: {
  params: Promise<{ wahanaId: string }>;
}) {
  // Next.js App Router: params is async
  const { wahanaId } = use(params);
  const router = useRouter();
  const { user } = useAuth();

  const [wahana, setWahana] = useState<WahanaInfo | null>(null);
  const [loadingWahana, setLoadingWahana] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [isScanModalOpen, setIsScanModalOpen] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);

  // Auto-dismiss toast after 4 seconds
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  // Fetch wahana info and verify LO access
  useEffect(() => {
    if (!user?.id) return;

    const fetchAndVerify = async () => {
      setLoadingWahana(true);

      // Step 1: Fetch LO's assigned_location_id — Requirement 9.6
      const { data: profile, error: profileError } = await supabase
        .from('users')
        .select('assigned_location_id')
        .eq('id', user.id)
        .single();

      if (profileError || !profile) {
        // Can't verify — redirect to safety
        router.replace('/lo');
        return;
      }

      const assignedLocationId: string | null = profile.assigned_location_id ?? null;

      // Step 2: Access check — Requirement 4.3, 9.6
      if (assignedLocationId !== wahanaId) {
        setAccessDenied(true);
        setLoadingWahana(false);
        // Redirect to /lo with error message after a brief moment so user sees the message
        setTimeout(() => {
          router.replace('/lo');
        }, 2000);
        return;
      }

      // Step 3: Fetch wahana details
      const { data, error } = await supabase
        .from('locations')
        .select('id, name, description, points')
        .eq('id', wahanaId)
        .single();

      if (!error && data) {
        setWahana(data);
      }
      setLoadingWahana(false);
    };

    fetchAndVerify();
  }, [user?.id, wahanaId, router]);

  // ── Scan modal handlers ──────────────────────────────────────────────────────

  const handleScanModalOpen = () => setIsScanModalOpen(true);
  const handleScanModalClose = () => setIsScanModalOpen(false);

  // Requirement 6.6: close modal, show success toast, refresh queue
  const handleCheckinSuccess = (teamName: string) => {
    setIsScanModalOpen(false);
    setToast({ type: 'success', message: `Check-in berhasil: Tim ${teamName} telah tiba!` });
    setRefreshTrigger((prev) => prev + 1);
  };

  // Requirement 7.7: close modal, show success toast, refresh queue
  const handleScoringSuccess = (teamName: string, score: number) => {
    setIsScanModalOpen(false);
    setToast({ type: 'success', message: `Poin berhasil diberikan: ${score} poin untuk Tim ${teamName}!` });
    setRefreshTrigger((prev) => prev + 1);
  };

  // ── Access denied state ──────────────────────────────────────────────────────

  if (accessDenied) {
    return (
      <AuthGuard allowedRoles={['lo']}>
        <div className="relative min-h-screen flex flex-col items-center justify-center bg-black font-content">
          <div
            className="fixed inset-0 z-0 bg-cover bg-center opacity-30"
            style={{
              backgroundImage: 'url("/images/expedition_map_bg.png")',
              filter: 'brightness(0.4) contrast(1.1)',
            }}
          />
          <div className="fixed inset-0 z-0 bg-gradient-to-b from-black/80 via-transparent to-black" />
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="relative z-20 adventure-card p-10 max-w-sm mx-4 text-center border-red-500/30"
          >
            <ShieldAlert className="w-12 h-12 text-red-400 mx-auto mb-4" />
            <h2 className="font-adventure text-xl gold-engraving mb-3">Akses Ditolak</h2>
            <p className="text-sm font-content text-muted-foreground italic">
              Anda tidak di-assign ke lokasi ini. Mengarahkan kembali...
            </p>
          </motion.div>
        </div>
      </AuthGuard>
    );
  }

  // ── Main render ──────────────────────────────────────────────────────────────

  return (
    <AuthGuard allowedRoles={['lo']}>
      <div className="relative min-h-screen flex flex-col bg-black overflow-hidden font-content selection:bg-primary selection:text-primary-foreground">
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

        <div className="relative z-20 w-full max-w-6xl mx-auto p-6 md:p-10 pb-28">
          {/* Back navigation */}
          <motion.div
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            className="mb-8"
          >
            <Link
              href="/lo"
              className="inline-flex items-center gap-2 text-[10px] uppercase font-adventure tracking-[0.3em] text-primary/60 hover:text-primary transition-colors"
            >
              <ArrowLeft className="w-3 h-3" />
              Back to Posts
            </Link>
          </motion.div>

          {/* Page header */}
          <header className="mb-10">
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <div className="flex items-center gap-2 mb-3">
                <span className="h-px w-8 bg-primary/40" />
                <p className="text-[10px] uppercase tracking-[0.4em] text-primary font-adventure">
                  Field Post
                </p>
              </div>

              {loadingWahana ? (
                <div className="flex items-center gap-3 opacity-40">
                  <Compass className="w-6 h-6 text-primary animate-spin-slow" />
                  <span className="font-adventure text-2xl">Loading post...</span>
                </div>
              ) : wahana ? (
                <>
                  <div className="flex items-start gap-4">
                    <div className="bg-primary/10 p-3 rounded-lg border border-primary/20 mt-1">
                      <MapPin className="w-6 h-6 text-primary torch-glow" />
                    </div>
                    <div>
                      <h1 className="font-adventure text-4xl md:text-5xl gold-engraving mb-2">
                        {wahana.name}
                      </h1>
                      <div className="flex items-center gap-4">
                        {wahana.description && (
                          <p className="text-muted-foreground text-sm italic opacity-70">
                            {wahana.description}
                          </p>
                        )}
                        <span className="flex items-center gap-1.5 text-[10px] font-adventure uppercase tracking-widest text-primary/60 bg-primary/10 px-3 py-1 border border-primary/20 flex-shrink-0">
                          <Flame className="w-3 h-3" />
                          {wahana.points} pts max
                        </span>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <p className="font-adventure text-2xl text-red-400">Post not found</p>
              )}
            </motion.div>
          </header>

          {/* Main content: Team Queue */}
          {wahana && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
            >
              <div className="mb-4">
                <p className="text-[10px] uppercase font-adventure tracking-[0.3em] text-primary/50">
                  Tim yang sudah check-in
                </p>
              </div>
              <TeamQueueList
                wahanaId={wahanaId}
                refreshTrigger={refreshTrigger}
              />
            </motion.div>
          )}
        </div>

        {/* Toast notification — fixed overlay — Requirements 6.6, 7.7 */}
        <AnimatePresence>
          {toast && (
            <motion.div
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 40 }}
              className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[300] w-full max-w-sm px-4"
            >
              <div
                className={`flex items-start gap-3 p-4 border rounded-sm backdrop-blur-sm shadow-xl
                  ${toast.type === 'success'
                    ? 'bg-green-900/80 border-green-500/40'
                    : 'bg-red-900/80 border-red-500/40'
                  }
                `}
              >
                {toast.type === 'success' ? (
                  <CheckCircle2 className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
                ) : (
                  <ShieldAlert className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                )}
                <p className="text-sm font-content text-foreground/90 flex-1">{toast.message}</p>
                <button
                  onClick={() => setToast(null)}
                  className="text-foreground/40 hover:text-foreground transition-colors flex-shrink-0"
                  aria-label="Tutup notifikasi"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Floating Scan Button — Requirements 5.1, 5.2 */}
        <button
          onClick={handleScanModalOpen}
          aria-label="Scan QR Code Tim"
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] w-16 h-16 rounded-full bg-primary hover:bg-primary/80 active:scale-95 transition-all shadow-[0_8px_32px_rgba(0,0,0,0.6)] flex items-center justify-center border-2 border-primary/40"
        >
          <Camera className="w-7 h-7 text-primary-foreground" />
        </button>

        {/* ScanModal — Requirements 5.3, 6.6, 7.7 */}
        {wahana && (
          <ScanModal
            isOpen={isScanModalOpen}
            locationId={wahanaId}
            locationName={wahana.name}
            locationPoints={wahana.points}
            onClose={handleScanModalClose}
            onCheckinSuccess={handleCheckinSuccess}
            onScoringSuccess={handleScoringSuccess}
          />
        )}
      </div>
    </AuthGuard>
  );
}
