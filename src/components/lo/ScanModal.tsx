'use client';

/**
 * ScanModal — modal scan QR code tim untuk LO.
 *
 * Flow baru:
 * 1. Kamera aktif → scan QR → kamera STOP setelah berhasil decode
 * 2. Muncul pilihan: Check In atau Give Point
 * 3. LO pilih → eksekusi → modal tutup otomatis jika berhasil
 */

import { useEffect, useRef, useCallback, useId, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  X,
  Camera,
  CameraOff,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  LogIn,
  Star,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { isTeamBarcode } from '@/lib/auth';

// Helper: get current access token from Supabase session
async function getAccessToken(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface ScanModalProps {
  isOpen: boolean;
  locationId: string;
  locationName: string;
  locationPoints: number;
  onClose: () => void;
  onCheckinSuccess: (teamName: string) => void;
  onScoringSuccess: (teamName: string, score: number) => void;
}

type Phase =
  | 'scanning'                  // kamera aktif, menunggu scan
  | 'choosing'                  // QR berhasil di-scan, pilih aksi
  | 'submitting'                // sedang kirim ke API
  | 'error'                     // error, bisa retry
  | 'success';                  // berhasil, modal akan tutup

interface TeamInfo {
  id: string;
  name: string;
  barcodeData: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ScanModal({
  isOpen,
  locationId,
  locationName,
  locationPoints,
  onClose,
  onCheckinSuccess,
  onScoringSuccess,
}: ScanModalProps) {
  const reactId = useId();
  const scannerId = `qr-scanner-${reactId.replace(/:/g, '')}`;

  const [phase, setPhase] = useState<Phase>('scanning');
  const [team, setTeam] = useState<TeamInfo | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [cameraError, setCameraError] = useState<string | null>(null);

  const scannerRef = useRef<import('html5-qrcode').Html5Qrcode | null>(null);
  const isScanningRef = useRef(false);
  const processingRef = useRef(false);

  // ── Camera ──────────────────────────────────────────────────────────────────

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
  }, []);

  const startCamera = useCallback(async () => {
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
            handleQRCodeScanned(decodedText);
          }
        },
        () => { /* scan failure per frame — ignored */ }
      );
      isScanningRef.current = true;
      setCameraError(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const lower = msg.toLowerCase();
      if (lower.includes('permission') || lower.includes('denied') || lower.includes('notallowed')) {
        setCameraError('Akses kamera ditolak. Izinkan akses kamera di pengaturan browser, lalu muat ulang halaman.');
      } else if (lower.includes('notfound') || lower.includes('no camera') || lower.includes('devicenotfound')) {
        setCameraError('Kamera tidak ditemukan. Pastikan perangkat Anda memiliki kamera.');
      } else {
        setCameraError('Kamera tidak dapat diakses. Periksa pengaturan browser Anda.');
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scannerId]);

  // ── Modal lifecycle ─────────────────────────────────────────────────────────

  useEffect(() => {
    if (!isOpen) {
      stopCamera();
      setPhase('scanning');
      setTeam(null);
      setErrorMsg('');
      setCameraError(null);
      processingRef.current = false;
      return;
    }

    const timer = setTimeout(() => startCamera(), 150);
    return () => clearTimeout(timer);
  }, [isOpen, startCamera, stopCamera]);

  useEffect(() => () => { stopCamera(); }, [stopCamera]);

  // ── QR scan handler ─────────────────────────────────────────────────────────

  const handleQRCodeScanned = useCallback(async (rawValue: string) => {
    // Stop camera immediately after successful decode
    await stopCamera();

    if (!isTeamBarcode(rawValue)) {
      setErrorMsg('QR code tidak valid. Pastikan Anda scan QR code tim.');
      setPhase('error');
      processingRef.current = false;
      return;
    }

    // Look up team
    const { data: teamRecord } = await supabase
      .from('teams')
      .select('id, name')
      .eq('barcode_data', rawValue)
      .maybeSingle();

    if (!teamRecord) {
      setErrorMsg('Tim tidak ditemukan.');
      setPhase('error');
      processingRef.current = false;
      return;
    }

    setTeam({ id: teamRecord.id, name: teamRecord.name, barcodeData: rawValue });
    setPhase('choosing');
    processingRef.current = false;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stopCamera]);

  // ── Actions ─────────────────────────────────────────────────────────────────

  const handleCheckin = async () => {
    if (!team) return;
    setPhase('submitting');

    try {
      const token = await getAccessToken();
      const res = await fetch('/api/lo/checkin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ barcode_data: team.barcodeData, location_id: locationId }),
      });

      if (res.ok) {
        setPhase('success');
        setTimeout(() => onCheckinSuccess(team.name), 800);
      } else {
        const data = await res.json().catch(() => ({}));
        setErrorMsg(
          res.status === 409
            ? 'Tim sudah check-in sebelumnya.'
            : (data as { error?: string }).error ?? 'Gagal melakukan check-in.'
        );
        setPhase('error');
      }
    } catch {
      setErrorMsg('Gagal terhubung ke server.');
      setPhase('error');
    }
  };

  const handleGivePoint = async () => {
    if (!team) return;
    setPhase('submitting');

    try {
      const token = await getAccessToken();
      const res = await fetch('/api/lo/score', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ barcode_data: team.barcodeData, location_id: locationId }),
      });

      if (res.ok) {
        setPhase('success');
        setTimeout(() => onScoringSuccess(team.name, locationPoints), 800);
      } else {
        const data = await res.json().catch(() => ({}));
        setErrorMsg(
          res.status === 409
            ? 'Tim sudah mendapat poin di wahana ini.'
            : res.status === 422
            ? 'Tim belum check-in di wahana ini.'
            : (data as { error?: string }).error ?? 'Gagal memberikan poin.'
        );
        setPhase('error');
      }
    } catch {
      setErrorMsg('Gagal terhubung ke server.');
      setPhase('error');
    }
  };

  const handleRetry = () => {
    setPhase('scanning');
    setTeam(null);
    setErrorMsg('');
    processingRef.current = false;
    setTimeout(() => startCamera(), 150);
  };

  const handleClose = () => {
    if (phase === 'submitting') return;
    onClose();
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="scan-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[200] flex items-center justify-center p-4"
          style={{ background: 'rgba(5, 12, 8, 0.92)', backdropFilter: 'blur(10px)' }}
          onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
        >
          <motion.div
            key="scan-card"
            initial={{ scale: 0.92, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.92, opacity: 0, y: 20 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="adventure-card w-full max-w-sm mx-auto overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-primary/20 bg-primary/5">
              <div className="flex items-center gap-2">
                <Camera className="w-4 h-4 text-primary torch-glow" />
                <h2 className="font-adventure text-sm uppercase tracking-[0.3em] text-primary">
                  {phase === 'choosing' ? `Tim: ${team?.name}` : 'Scan QR Code Tim'}
                </h2>
              </div>
              <button
                onClick={handleClose}
                disabled={phase === 'submitting'}
                className="text-foreground/40 hover:text-foreground transition-colors disabled:opacity-30"
                aria-label="Tutup"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Camera viewfinder — only shown during scanning */}
            {(phase === 'scanning') && (
              <div className="relative bg-black">
                <div id={scannerId} className="w-full" style={{ minHeight: '280px' }} />

                {/* Viewfinder overlay */}
                {!cameraError && (
                  <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                    <div className="relative w-52 h-52">
                      <span className="absolute top-0 left-0 w-6 h-6 border-t-2 border-l-2 border-primary/80" />
                      <span className="absolute top-0 right-0 w-6 h-6 border-t-2 border-r-2 border-primary/80" />
                      <span className="absolute bottom-0 left-0 w-6 h-6 border-b-2 border-l-2 border-primary/80" />
                      <span className="absolute bottom-0 right-0 w-6 h-6 border-b-2 border-r-2 border-primary/80" />
                      <motion.div
                        className="absolute left-1 right-1 h-0.5 bg-primary/60"
                        animate={{ top: ['10%', '90%', '10%'] }}
                        transition={{ duration: 2.5, repeat: Infinity, ease: 'linear' }}
                      />
                    </div>
                  </div>
                )}

                {cameraError && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center p-6 bg-black/80 text-center gap-4">
                    <CameraOff className="w-10 h-10 text-red-400/80" />
                    <p className="text-xs font-content text-red-300/80 leading-relaxed">{cameraError}</p>
                  </div>
                )}
              </div>
            )}

            {/* Body — action area */}
            <div className="px-6 py-5">
              <AnimatePresence mode="wait">

                {/* Scanning hint */}
                {phase === 'scanning' && !cameraError && (
                  <motion.p
                    key="hint"
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="text-[11px] font-content text-muted-foreground italic text-center opacity-60"
                  >
                    Arahkan kamera ke QR code tim
                  </motion.p>
                )}

                {/* Choose action */}
                {phase === 'choosing' && team && (
                  <motion.div
                    key="choosing"
                    initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                    className="space-y-3"
                  >
                    <p className="text-[10px] uppercase font-adventure tracking-widest text-primary/50 text-center mb-4">
                      Pilih aksi untuk tim ini
                    </p>
                    <button
                      onClick={handleCheckin}
                      className="w-full flex items-center gap-4 p-4 border border-primary/20 hover:border-primary hover:bg-primary/5 transition-all group"
                    >
                      <div className="bg-primary/10 p-2.5 rounded-lg group-hover:bg-primary/20 transition-colors">
                        <LogIn className="w-5 h-5 text-primary" />
                      </div>
                      <div className="text-left">
                        <p className="font-adventure text-sm text-primary tracking-wide">Check In</p>
                        <p className="text-[10px] text-foreground/40 font-content">Tim tiba di wahana ini</p>
                      </div>
                    </button>
                    <button
                      onClick={handleGivePoint}
                      className="w-full flex items-center gap-4 p-4 border border-primary/20 hover:border-primary hover:bg-primary/5 transition-all group"
                    >
                      <div className="bg-primary/10 p-2.5 rounded-lg group-hover:bg-primary/20 transition-colors">
                        <Star className="w-5 h-5 text-primary" />
                      </div>
                      <div className="text-left">
                        <p className="font-adventure text-sm text-primary tracking-wide">Give Point</p>
                        <p className="text-[10px] text-foreground/40 font-content">{locationPoints} poin untuk tim ini</p>
                      </div>
                    </button>
                    <button
                      onClick={handleRetry}
                      className="w-full text-center text-[10px] font-adventure uppercase tracking-[0.2em] text-foreground/30 hover:text-foreground/60 transition-colors pt-1"
                    >
                      Scan Ulang
                    </button>
                  </motion.div>
                )}

                {/* Submitting */}
                {phase === 'submitting' && (
                  <motion.div
                    key="submitting"
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="flex flex-col items-center gap-3 py-4"
                  >
                    <Loader2 className="w-8 h-8 text-primary animate-spin" />
                    <p className="text-xs font-adventure uppercase tracking-widest text-primary/60">
                      Memproses...
                    </p>
                  </motion.div>
                )}

                {/* Success */}
                {phase === 'success' && (
                  <motion.div
                    key="success"
                    initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
                    className="flex flex-col items-center gap-3 py-4"
                  >
                    <div className="bg-green-500/20 p-4 rounded-full border border-green-500/30">
                      <CheckCircle2 className="w-8 h-8 text-green-400" />
                    </div>
                    <p className="font-adventure text-sm text-green-400 uppercase tracking-widest">Berhasil!</p>
                  </motion.div>
                )}

                {/* Error */}
                {phase === 'error' && (
                  <motion.div
                    key="error"
                    initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                    className="flex flex-col items-center gap-3"
                  >
                    <div className="flex items-start gap-2 p-3 bg-red-900/30 border border-red-500/30 rounded-sm w-full">
                      <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                      <p className="text-[11px] font-content text-red-300/90 leading-relaxed">{errorMsg}</p>
                    </div>
                    <button
                      onClick={handleRetry}
                      className="text-[10px] font-adventure uppercase tracking-[0.2em] text-primary/70 hover:text-primary transition-colors"
                    >
                      Scan Ulang
                    </button>
                  </motion.div>
                )}

              </AnimatePresence>
            </div>

            {/* Footer */}
            {phase !== 'success' && phase !== 'submitting' && (
              <div className="px-6 pb-5">
                <button
                  onClick={handleClose}
                  className="w-full py-3 font-adventure text-xs uppercase tracking-[0.2em] border border-primary/20 text-foreground/50 hover:text-foreground hover:border-primary/40 transition-all"
                >
                  Tutup
                </button>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
