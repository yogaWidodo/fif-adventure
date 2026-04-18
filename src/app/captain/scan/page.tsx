'use client';

import { useState, useEffect, useRef, useCallback, useId } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Camera, CameraOff, CheckCircle2, Trophy, Navigation, Compass, Flame, ShieldAlert, Loader2 } from 'lucide-react';
import AuthGuard from '@/components/AuthGuard';
import { useAuth } from '@/context/AuthContext';

interface ScanSuccess {
  type: 'wahana' | 'challenge' | 'treasure';
  locationName: string;
  pointsAwarded?: number;
  quotaRemaining?: number;
  message: string;
}

export default function CaptainScanner() {
  const { user } = useAuth();
  const reactId = useId();
  const scannerId = `captain-scanner-${reactId.replace(/:/g, '')}`;

  const [isProcessing, setIsProcessing] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [lastScanMessage, setLastScanMessage] = useState<{ type: 'success' | 'error', text: string, scanSuccess?: ScanSuccess } | null>(null);

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
          type: data.location_type === 'challenge' ? 'challenge' : 'wahana',
          locationName: data.location_name || 'Location',
          pointsAwarded: data.points_awarded,
          message: `Prestige Earned! Found ${data.location_name}. +${data.points_awarded ?? 0} Points!`,
        };

        setLastScanMessage({ type: 'success', text: scanSuccess.message, scanSuccess });
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
      setLastScanMessage(null);
      processingRef.current = false;
      startCamera();
    }, 4000);
  };

  return (
    <AuthGuard allowedRoles={['admin', 'captain', 'vice_captain']}>
      <div className="relative min-h-screen flex flex-col items-center justify-center p-6 overflow-hidden bg-black selection:bg-primary selection:text-primary-foreground font-content">
        {/* Immersive Background */}
        <div
          className="fixed inset-0 z-0 bg-cover bg-center opacity-40 grayscale-[0.5]"
          style={{ backgroundImage: 'url("/images/jungle_hq_bg.png")', filter: 'brightness(0.3) blur(2px)' }}
        />
        <div className="fixed inset-0 z-10 jungle-overlay opacity-10 pointer-events-none" />

        <header className="relative z-20 mb-12 text-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="inline-flex items-center justify-center p-5 mb-6 rounded-full bg-primary/10 border border-primary/20 backdrop-blur-md"
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
                className="absolute inset-0 z-50 bg-black/90 backdrop-blur-md flex flex-col items-center justify-center p-10 text-center"
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

        {/* Bottom Tool Bar */}
        <nav className="fixed bottom-8 left-6 right-6 z-30 flex justify-between items-center px-10 py-6 bg-card/40 backdrop-blur-xl border border-primary/20 adventure-card shadow-[0_-10px_40px_rgba(0,0,0,0.5)]">
          <NavItem icon={<Trophy className="w-6 h-6" />} label="Prestige" value={`${user?.team_id ? '—' : '0'}`} />
          <div className="h-10 w-px bg-primary/10" />
          <NavItem icon={<Flame className="w-6 h-6" />} label="Scanner" value="Active" active />
          <div className="h-10 w-px bg-primary/10" />
          <NavItem icon={<Navigation className="w-6 h-6" />} label="Status" value="Tracking" />
        </nav>
      </div>
    </AuthGuard>
  );
}

function NavItem({ icon, label, value, active = false }: { icon: React.ReactNode, label: string, value: string, active?: boolean }) {
  return (
    <div className={`flex flex-col items-center gap-2 transition-all ${active ? 'scale-110' : 'opacity-60'}`}>
      <div className={`${active ? 'text-primary torch-glow' : 'text-foreground/40'}`}>
        {icon}
      </div>
      <div className="text-center">
        <p className="text-[8px] font-adventure uppercase tracking-tighter opacity-50">{label}</p>
        <p className={`text-[10px] font-adventure leading-none ${active ? 'text-primary' : ''}`}>{value}</p>
      </div>
    </div>
  );
}
