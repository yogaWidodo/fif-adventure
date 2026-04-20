'use client';

import { useState, useEffect, useRef, useCallback, useId } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Camera, CameraOff, CheckCircle2, Compass, ShieldAlert, Loader2 } from 'lucide-react';
import AuthGuard from '@/components/AuthGuard';
import { useAuth } from '@/context/AuthContext';

interface ScanSuccess {
  type: 'wahana' | 'challenge' | 'treasure';
  locationName: string;
  pointsAwarded?: number;
  quotaRemaining?: number;
  message: string;
  description?: string | null;
  howToPlay?: string | null;
  alreadyDiscovered?: boolean;
}

export default function CaptainScanner() {
  const { user } = useAuth();
  const reactId = useId();
  const scannerId = `captain-scanner-${reactId.replace(/:/g, '')}`;

  const [isProcessing, setIsProcessing] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [lastScanMessage, setLastScanMessage] = useState<{ type: 'success' | 'error', text: string, scanSuccess?: ScanSuccess } | null>(null);
  const [showDiscoveryModal, setShowDiscoveryModal] = useState(false);
  const [currentDiscovery, setCurrentDiscovery] = useState<ScanSuccess | null>(null);

  const scannerRef = useRef<import('html5-qrcode').Html5Qrcode | null>(null);
  const isScanningRef = useRef(false);
  const processingRef = useRef(false);

  // ── Camera control (same pattern as LO ScanModal) ──────────────────────────

  const stopCamera = useCallback(async () => {
    if (!scannerRef.current) return;
    try {
      if (isScanningRef.current) {
        await scannerRef.current.stop();
        isScanningRef.current = false;
      }
      scannerRef.current.clear();
    } catch {
      // ignore — camera may already be stopped
    }
    scannerRef.current = null;
    setCameraReady(false);
  }, []);

  const startCamera = useCallback(async () => {
    // Don't start if already running
    if (scannerRef.current) return;

    const { Html5Qrcode } = await import('html5-qrcode');
    const scanner = new Html5Qrcode(scannerId);
    scannerRef.current = scanner;

    try {
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 }, aspectRatio: 1.0 },
        (decodedText) => {
          if (!processingRef.current) {
            processingRef.current = true;
            handleScan(decodedText);
          }
        },
        () => { /* scan failure per frame — ignored */ }
      );
      isScanningRef.current = true;
      setCameraError(null);
      setCameraReady(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const lower = msg.toLowerCase();
      if (lower.includes('permission') || lower.includes('denied') || lower.includes('notallowed')) {
        setCameraError('Akses kamera ditolak. Izinkan akses kamera di pengaturan browser, lalu muat ulang halaman.');
      } else if (lower.includes('notfound') || lower.includes('no camera') || lower.includes('devicenotfound')) {
        setCameraError('Kamera tidak ditemukan. Pastikan perangkat Anda memiliki kamera.');
      } else {
        setCameraError(`Kamera tidak dapat diakses: ${msg}`);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scannerId]);

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  useEffect(() => {
    const timer = setTimeout(() => startCamera(), 300);
    return () => {
      clearTimeout(timer);
      stopCamera();
    };
  }, [startCamera, stopCamera]);

  // ── Scan handler ───────────────────────────────────────────────────────────

  const handleScan = async (result: string) => {
    setIsProcessing(true);

    const teamId = user?.team_id;

    if (!teamId) {
      setLastScanMessage({ type: 'error', text: 'No team assigned to your account. Contact your administrator.' });
      setIsProcessing(false);
      restartAfterDelay();
      return;
    }

    try {
      // Stop camera during processing
      await stopCamera();

      const barcodeType = result.startsWith('fif-treasure-') ? 'treasure' : 'other';

      if (barcodeType === 'treasure') {
        // Extract the treasure_hunt_id from the barcode format: fif-treasure-{UUID}
        const treasureHuntId = result.replace('fif-treasure-', '');

        // Get auth token for the API
        const { supabase } = await import('@/lib/supabase');
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;

        const response = await fetch('/api/treasure/claim', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ treasure_hunt_id: treasureHuntId }),
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
          throw new Error(data.message || data.error || 'The treasure claim was rejected.');
        }

        const scanSuccess: ScanSuccess = {
          type: 'treasure',
          locationName: data.location_name || 'Treasure',
          pointsAwarded: data.points_awarded,
          quotaRemaining: data.quota_remaining,
          message: data.message || `Treasure claimed! +${data.points_awarded ?? 0} Points!`,
        };

        setLastScanMessage({ type: 'success', text: scanSuccess.message, scanSuccess });
      } else {
        const response = await fetch('/api/scan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ barcode_data: result, team_id: teamId }),
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
          if (response.status === 409) {
            throw new Error('Already Claimed: Your team has already secured this artifact!');
          }
          throw new Error(data.message || data.error || 'The scan was interrupted by unknown forces.');
        }

        const scanSuccess: ScanSuccess = {
          type: data.location_type?.startsWith('challenge') ? 'challenge' : 'wahana',
          locationName: data.location_name || 'Location',
          pointsAwarded: data.points_awarded,
          message: data.already_discovered
            ? `Lokasi Terdeteksi: ${data.location_name}`
            : `Prestige Earned! Found ${data.location_name}. +${data.points_awarded ?? 0} Points!`,
          description: data.description,
          howToPlay: data.how_to_play,
          alreadyDiscovered: data.already_discovered
        };

        setLastScanMessage({ type: 'success', text: scanSuccess.message, scanSuccess });

        // Show discovery modal for wahana/challenge
        if (scanSuccess.description || scanSuccess.howToPlay) {
          setCurrentDiscovery(scanSuccess);
          // Wait a bit for the success animation before showing modal
          setTimeout(() => {
            setShowDiscoveryModal(true);
          }, 1500);
        }
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'The scan was interrupted by unknown forces.';
      setLastScanMessage({ type: 'error', text: message });
    } finally {
      setIsProcessing(false);
      restartAfterDelay();
    }
  };

  const restartAfterDelay = () => {
    setTimeout(() => {
      // Don't restart if discovery modal is about to show or is showing
      setLastScanMessage((prev) => {
        if (prev?.type === 'success' && (prev.scanSuccess?.description || prev.scanSuccess?.howToPlay)) {
          return prev; // Let the modal handle it
        }
        if (!showDiscoveryModal) {
          processingRef.current = false;
          startCamera();
        }
        return null; // Clear message if not success/discovery
      });
    }, 4000);
  };

  const handleCloseDiscovery = () => {
    setShowDiscoveryModal(false);
    setLastScanMessage(null);
    setCurrentDiscovery(null);
    processingRef.current = false;
    startCamera();
  };

  return (
    <AuthGuard allowedRoles={['admin', 'captain', 'vice_captain']}>
      <div className="relative min-h-screen flex flex-col items-center justify-center p-6 overflow-hidden bg-black selection:bg-primary selection:text-primary-foreground font-content">
        {/* Immersive Background */}
        <div
          className="fixed inset-0 z-0 bg-cover bg-center opacity-40 grayscale-[0.5]"
          style={{ backgroundImage: 'url("/images/jungle_hq_bg.png")', filter: 'brightness(0.3)' }}
        />
        <div className="fixed inset-0 z-10 jungle-overlay opacity-10 pointer-events-none" />

        <header className="relative z-20 mb-12 text-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="inline-flex items-center justify-center p-5 mb-6 rounded-full bg-primary/10 border border-primary/20"
          >
            <Camera className="text-primary w-10 h-10 torch-glow" />
          </motion.div>
          <h1 className="font-adventure text-4xl gold-engraving tracking-widest mb-2">Mystical Lens</h1>
          <p className="text-muted-foreground text-xs uppercase tracking-[0.3em] font-adventure opacity-60">Scan the Ancient Marks</p>
        </header>

        {/* Scanner Window with Stone/Gold Frame */}
        <div className="relative z-20 w-full max-w-sm aspect-square overflow-hidden adventure-card border-[3px] border-primary/30 shadow-[0_0_60px_rgba(212,175,55,0.2)]">
          {/* html5-qrcode mounts the camera feed into this div */}
          <div id={scannerId} className="w-full h-full" />

          {/* Camera error state */}
          {cameraError && (
            <div className="absolute inset-0 z-40 bg-black/95 flex flex-col items-center justify-center p-8 text-center">
              <CameraOff className="w-12 h-12 text-red-400 mb-4" />
              <p className="text-sm text-red-300 font-content mb-4">{cameraError}</p>
              <button
                onClick={() => { setCameraError(null); startCamera(); }}
                className="px-6 py-2 bg-primary/20 border border-primary/40 text-primary font-adventure text-sm uppercase tracking-widest hover:bg-primary/30 transition-colors"
              >
                Coba Lagi
              </button>
            </div>
          )}

          {/* Loading state before camera is ready */}
          {!cameraReady && !cameraError && (
            <div className="absolute inset-0 z-40 bg-black/90 flex flex-col items-center justify-center">
              <Loader2 className="w-10 h-10 text-primary animate-spin mb-4" />
              <p className="font-adventure text-sm text-primary/60 uppercase tracking-widest">Activating Lens...</p>
            </div>
          )}

          {/* Scanning Deco Overlay */}
          {cameraReady && !isProcessing && !lastScanMessage && (
            <>
              <div className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-primary/5 to-transparent pointer-events-none z-30" />
              <motion.div
                animate={{ top: ['10%', '90%', '10%'] }}
                transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
                className="absolute left-4 right-4 h-0.5 bg-primary/40 shadow-[0_0_15px_var(--primary)] z-30"
              />
            </>
          )}

          {/* Corner Brackets */}
          <div className="absolute top-6 left-6 w-8 h-8 border-t-2 border-l-2 border-primary/60 z-30 pointer-events-none" />
          <div className="absolute top-6 right-6 w-8 h-8 border-t-2 border-r-2 border-primary/60 z-30 pointer-events-none" />
          <div className="absolute bottom-6 left-6 w-8 h-8 border-b-2 border-l-2 border-primary/60 z-30 pointer-events-none" />
          <div className="absolute bottom-6 right-6 w-8 h-8 border-b-2 border-r-2 border-primary/60 z-30 pointer-events-none" />

          {/* Scan Status Overlay */}
          <AnimatePresence>
            {(isProcessing || lastScanMessage) && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 z-50 bg-black/95 flex flex-col items-center justify-center p-10 text-center"
              >
                {isProcessing ? (
                  <>
                    <div className="relative mb-8">
                      <Compass className="w-20 h-20 text-primary animate-spin-slow" />
                      <div className="absolute inset-0 blur-xl bg-primary/20 animate-pulse rounded-full" />
                    </div>
                    <p className="font-adventure text-2xl gold-engraving tracking-widest">Decoding Secret...</p>
                    <p className="text-[10px] uppercase font-adventure opacity-40 mt-4 tracking-tighter">Please hold the device steady</p>
                  </>
                ) : lastScanMessage?.type === 'success' ? (
                  <motion.div initial={{ scale: 0.8 }} animate={{ scale: 1 }}>
                    <div className="mb-6 inline-block bg-green-500/20 p-6 rounded-full border border-green-500/40">
                      <CheckCircle2 className="w-16 h-16 text-green-500 torch-glow" />
                    </div>
                    <h2 className="font-adventure text-3xl text-green-400 mb-4 tracking-tighter">Prestige Earned</h2>
                    <p className="text-[#f4e4bc] italic font-content text-sm px-4">{lastScanMessage.text}</p>
                    {lastScanMessage.scanSuccess?.type === 'treasure' &&
                      lastScanMessage.scanSuccess.quotaRemaining !== undefined && (
                        <p className="mt-3 text-[11px] font-adventure uppercase tracking-widest text-primary/70">
                          Remaining Quota: {lastScanMessage.scanSuccess.quotaRemaining}
                        </p>
                      )}
                  </motion.div>
                ) : (
                  <motion.div initial={{ scale: 0.8 }} animate={{ scale: 1 }}>
                    <div className="mb-6 inline-block bg-red-500/20 p-6 rounded-full border border-red-500/40">
                      <ShieldAlert className="w-16 h-16 text-red-500" />
                    </div>
                    <h2 className="font-adventure text-3xl text-red-400 mb-4 tracking-tighter">Access Denied</h2>
                    <p className="text-[#f4e4bc]/60 italic font-content text-sm px-4">{lastScanMessage?.text}</p>
                  </motion.div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Field Navigation Tooltip */}
        <div className="mt-12 text-center opacity-40">
          <p className="text-[10px] font-adventure uppercase tracking-[0.2em] mb-4 text-primary">Distance to nearest ruin: Unknown</p>
          <div className="flex items-center gap-3 justify-center">
            <span className="w-3 h-3 rounded-full bg-primary/20 animate-pulse" />
            <span className="text-[8px] font-mono">ENCRYPTED FEED ACTIVE</span>
          </div>
        </div>

        {/* Discovery Modal */}
        <AnimatePresence>
          {showDiscoveryModal && currentDiscovery && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/90 backdrop-blur-sm"
            >
              <motion.div
                initial={{ scale: 0.9, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                className="relative adventure-card p-8 max-w-md w-full border-primary/30 flex flex-col gap-6"
              >
                <div className="text-center space-y-2">
                  <div className="inline-block p-3 rounded-full bg-primary/10 border border-primary/20 mb-2">
                    <Compass className="w-8 h-8 text-primary shadow-[0_0_15px_var(--primary)]" />
                  </div>
                  <h2 className="font-adventure text-3xl gold-engraving tracking-tight uppercase">
                    {currentDiscovery.locationName}
                  </h2>
                  <p className="text-[10px] font-adventure uppercase tracking-[0.3em] text-primary/60">
                    Location Intel Recovered
                  </p>
                </div>

                <div className="space-y-6 overflow-y-auto max-h-[60vh] pr-2 scrollbar-thin scrollbar-thumb-primary/20">
                  {currentDiscovery.description && (
                    <div className="space-y-2">
                      <p className="text-[10px] font-adventure uppercase tracking-widest text-primary/40 border-b border-primary/10 pb-1">Lore</p>
                      <p className="text-[#f4e4bc]/80 italic text-sm font-content leading-relaxed">
                        "{currentDiscovery.description}"
                      </p>
                    </div>
                  )}

                  {currentDiscovery.howToPlay && (
                    <div className="space-y-2">
                      <p className="text-[10px] font-adventure uppercase tracking-widest text-primary/40 border-b border-primary/10 pb-1">How to Play</p>
                      <div className="text-[#f4e4bc] text-sm font-content leading-relaxed whitespace-pre-wrap">
                        {currentDiscovery.howToPlay}
                      </div>
                    </div>
                  )}
                </div>

                <button
                  onClick={handleCloseDiscovery}
                  className="w-full mt-4 py-4 bg-primary/20 hover:bg-primary/30 border border-primary/40 text-primary font-adventure uppercase tracking-[0.2em] transition-all hover:scale-[1.02] active:scale-[0.98]"
                >
                  Close Discovery
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

      </div>
    </AuthGuard>
  );
}
