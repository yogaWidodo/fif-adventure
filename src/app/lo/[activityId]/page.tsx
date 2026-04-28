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
import TeamHistoryList from '@/components/lo/TeamHistoryList';
import ScanModal from '@/components/lo/ScanModal';

interface ActivityInfo {
  id: string;
  name: string;
  description: string | null;
  points: number;
  difficulty_level: string;
}

type ToastState = {
  type: 'success' | 'error';
  message: string;
} | null;

export default function ActivityDashboard({
  params,
}: {
  params: Promise<{ activityId: string }>;
}) {
  // Next.js App Router: params is async
  const { activityId } = use(params);
  const router = useRouter();
  const { user } = useAuth();

  const [activity, setActivity] = useState<ActivityInfo | null>(null);
  const [loadingActivity, setLoadingActivity] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [isScanModalOpen, setIsScanModalOpen] = useState(false);
  const [selectedQueueTeam, setSelectedQueueTeam] = useState<{ id: string, name: string, participantIds: string[] } | null>(null);
  const [activeTab, setActiveTab] = useState<'queue' | 'history'>('queue');
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
      setLoadingActivity(true);

      // Step 1: Fetch ALL assignments for this LO
      const { data: assignments, error: assignmentError } = await supabase
        .from('lo_assignments')
        .select('activity_id, activities(id, name, description, max_points, difficulty_level)')
        .eq('lo_id', user.id);

      if (assignmentError || !assignments || assignments.length === 0) {
        // No assignment — redirect back to LO portal
        router.replace('/lo');
        return;
      }

      // Step 2: Access check — find the specific activity the LO is accessing
      const currentAssignment = assignments.find(a => a.activity_id === activityId);

      if (!currentAssignment) {
        setAccessDenied(true);
        setLoadingActivity(false);
        setTimeout(() => {
          router.replace('/lo');
        }, 2000);
        return;
      }

      // Step 3: Set activity details
      const act = currentAssignment.activities as any;
      if (act) {
        setActivity({
          id: act.id,
          name: act.name,
          description: act.description,
          points: act.max_points,
          difficulty_level: act.difficulty_level || 'Medium'
        });
      }
      setLoadingActivity(false);
    };

    fetchAndVerify();
  }, [user?.id, activityId, router]);

  // ── Scan modal handlers ──────────────────────────────────────────────────────

  const handleScanModalOpen = () => {
    setSelectedQueueTeam(null);
    setIsScanModalOpen(true);
  };
  const handleScanModalClose = () => {
    setIsScanModalOpen(false);
    setSelectedQueueTeam(null);
  };

  const handleSelectTeam = (teamId: string, teamName: string, participantIds: string[]) => {
    setSelectedQueueTeam({ id: teamId, name: teamName, participantIds });
    setIsScanModalOpen(true);
  };

  // Requirement 6.6: close modal, show success toast, refresh queue
  const handleCheckinSuccess = (teamName: string, hintGranted?: boolean) => {
    // We DON'T close the modal here anymore to allow "Scan Anggota Berikutnya"
    const message = hintGranted 
      ? `Check-in berhasil: Tim ${teamName} telah tiba & mendapatkan hint rahasia! 💎`
      : `Check-in berhasil: Tim ${teamName} telah tiba!`;
    setToast({ type: 'success', message });
    setRefreshTrigger((prev) => prev + 1);
  };

  // Requirement 7.7: close modal, show success toast, refresh queue
  const handleScoringSuccess = (teamName: string, score: number) => {
    setIsScanModalOpen(false);
    setSelectedQueueTeam(null);
    
    setToast({ 
      type: 'success', 
      message: `Poin berhasil diberikan: ${score} poin untuk Tim ${teamName}!` 
    });
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
      <div className="relative min-h-screen flex flex-col overflow-hidden font-content selection:bg-primary selection:text-primary-foreground">
        {/* Immersive Background */}
        <div
          className="fixed inset-0 z-0 bg-cover bg-center opacity-30 mix-blend-luminosity"
          style={{
            backgroundImage: 'url("/images/expedition_map_bg.png")',
            filter: 'brightness(0.4) contrast(1.3) saturate(0.5)',
          }}
        />
        {/* Vignette Overlay for deeper immersion */}
        <div className="fixed inset-0 z-0 bg-[radial-gradient(circle_at_center,rgba(18,29,23,0.4)_0%,rgba(10,20,15,0.95)_100%)]" />
        <div className="fixed inset-0 z-10 jungle-overlay opacity-5 pointer-events-none" />

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

              {loadingActivity ? (
                <div className="flex items-center gap-3 opacity-40">
                  <Compass className="w-6 h-6 text-primary animate-spin-slow" />
                  <span className="font-adventure text-2xl">Loading activity...</span>
                </div>
              ) : activity ? (
                <>
                  <div className="flex flex-col md:flex-row items-start gap-4">
                    <div className="bg-primary/10 p-3 rounded-lg border border-primary/20 flex-shrink-0">
                      <MapPin className="w-6 h-6 text-primary torch-glow" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-3 mb-2">
                        <h1 className="font-adventure text-3xl md:text-5xl gold-engraving leading-tight">
                          {activity.name}
                        </h1>
                        <DifficultyBadge level={activity.difficulty_level} />
                      </div>
                      <div className="flex flex-wrap items-center gap-3 md:gap-6">
                        {activity.description && (
                          <p className="text-muted-foreground text-sm italic opacity-70">
                            {activity.description}
                          </p>
                        )}
                        <span className="flex items-center gap-1.5 text-[10px] font-adventure uppercase tracking-widest text-primary/60 bg-primary/10 px-3 py-1 border border-primary/20 flex-shrink-0">
                          <Flame className="w-3 h-3" />
                          {activity.points} pts max
                        </span>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <p className="font-adventure text-2xl text-red-400">Activity not found</p>
              )}
            </motion.div>
          </header>

          {/* Main content: Tabs System */}
          {activity && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
            >
              {/* Tab Switcher */}
              <div className="flex items-center gap-1 p-1 bg-primary/5 border border-primary/20 rounded-lg mb-6 w-fit">
                <button
                  onClick={() => setActiveTab('queue')}
                  className={`px-6 py-2 rounded-md font-adventure text-[10px] uppercase tracking-widest transition-all ${
                    activeTab === 'queue' 
                      ? 'bg-primary text-primary-foreground shadow-lg' 
                      : 'text-primary/60 hover:text-primary hover:bg-primary/10'
                  }`}
                >
                  Antrean
                </button>
                <button
                  onClick={() => setActiveTab('history')}
                  className={`px-6 py-2 rounded-md font-adventure text-[10px] uppercase tracking-widest transition-all ${
                    activeTab === 'history' 
                      ? 'bg-primary text-primary-foreground shadow-lg' 
                      : 'text-primary/60 hover:text-primary hover:bg-primary/10'
                  }`}
                >
                  Riwayat
                </button>
              </div>

              <div className="min-h-[400px]">
                <AnimatePresence mode="wait">
                  {activeTab === 'queue' ? (
                    <motion.div
                      key="queue-tab"
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 20 }}
                      transition={{ duration: 0.2 }}
                    >
                      <TeamQueueList
                        activityId={activityId}
                        refreshTrigger={refreshTrigger}
                        onSelectTeam={handleSelectTeam}
                      />
                    </motion.div>
                  ) : (
                    <motion.div
                      key="history-tab"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      transition={{ duration: 0.2 }}
                    >
                      <TeamHistoryList
                        activityId={activityId}
                        refreshTrigger={refreshTrigger}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
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
                className={`flex items-start gap-3 p-4 border rounded-sm shadow-xl
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
        {activity && (
          <ScanModal
            isOpen={isScanModalOpen}
            activityId={activityId}
            activityName={activity.name}
            activityPoints={activity.points}
            onClose={handleScanModalClose}
            onCheckinSuccess={handleCheckinSuccess}
            onScoringSuccess={handleScoringSuccess}
            preSelectedTeam={selectedQueueTeam}
          />
        )}
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
