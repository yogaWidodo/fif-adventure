'use client';

/**
 * ScanModal — modal utama untuk scan QR code tim.
 * Mengintegrasikan kamera (html5-qrcode), deteksi alur otomatis,
 * dan state machine ScanFlowState.
 *
 * Requirements: 5.3, 5.4, 5.5, 5.6, 6.1, 6.6, 6.7,
 *               7.1, 7.3, 7.7, 7.10, 8.1, 8.2, 8.3, 8.4, 8.5, 8.6
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
  Info,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { isTeamBarcode } from '@/lib/auth';
import ConfirmationModal from '@/components/lo/ConfirmationModal';

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

type ScanFlowState =
  | { phase: 'scanning' }
  | { phase: 'checking'; barcodeData: string }
  | { phase: 'confirming'; teamId: string; teamName: string; score: number }
  | { phase: 'error'; message: string }
  | { phase: 'done'; message: string };

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
  // Stable unique ID for the scanner DOM element — avoids conflicts if multiple modals exist
  const reactId = useId();
  const scannerId = `qr-scanner-${reactId.replace(/:/g, '')}`;

  const [flowState, setFlowState] = useState<ScanFlowState>({ phase: 'scanning' });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  // Ref to the Html5Qrcode instance — avoids stale closure issues
  const scannerRef = useRef<import('html5-qrcode').Html5Qrcode | null>(null);
  const isScanningRef = useRef(false);
  // Guard: prevent processing multiple scans simultaneously
  const processingRef = useRef(false);

  // ── Camera lifecycle ────────────────────────────────────────────────────────

  const stopCamera = useCallback(async () => {
    if (!scannerRef.current) return;
    try {
      if (isScanningRef.current) {
        await scannerRef.current.stop();
        isScanningRef.current = false;
      }
      scannerRef.current.clear();
    } catch {
      // Ignore errors during cleanup — camera may already be stopped
    }
    scannerRef.current = null;
  }, []);

  const startCamera = useCallback(async () => {
    // Dynamically import to avoid SSR issues (html5-qrcode uses browser APIs)
    const { Html5Qrcode } = await import('html5-qrcode');

    const scanner = new Html5Qrcode(scannerId);
    scannerRef.current = scanner;

    try {
      await scanner.start(
        { facingMode: 'environment' },
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
          aspectRatio: 1.0,
        },
        (decodedText) => {
          // onScanSuccess — called each time a QR code is decoded
          if (!processingRef.current) {
            processingRef.current = true;
            handleQRCodeScanned(decodedText);
          }
        },
        () => {
          // onScanFailure — called on each frame without a QR code; intentionally ignored
        }
      );
      isScanningRef.current = true;
      setCameraError(null);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      const lower = message.toLowerCase();
      const isPermissionDenied =
        lower.includes('permission') ||
        lower.includes('denied') ||
        lower.includes('notallowed');
      const isNotFound =
        lower.includes('notfound') ||
        lower.includes('no camera') ||
        lower.includes('devicenotfound');

      if (isPermissionDenied) {
        setCameraError(
          'Akses kamera ditolak. Izinkan akses kamera di pengaturan browser Anda, lalu muat ulang halaman.'
        );
      } else if (isNotFound) {
        setCameraError(
          'Kamera tidak ditemukan. Pastikan perangkat Anda memiliki kamera yang terhubung.'
        );
      } else {
        setCameraError(
          `Kamera tidak dapat diakses. Periksa pengaturan browser Anda dan pastikan tidak ada aplikasi lain yang menggunakan kamera.`
        );
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scannerId]);

  // ── Modal open/close effect ─────────────────────────────────────────────────

  useEffect(() => {
    if (!isOpen) {
      // Reset state when modal closes
      stopCamera();
      setFlowState({ phase: 'scanning' });
      setCameraError(null);
      processingRef.current = false;
      return;
    }

    // Small delay to ensure the DOM element is mounted before initialising scanner
    const timer = setTimeout(() => {
      startCamera();
    }, 150);

    return () => {
      clearTimeout(timer);
    };
  }, [isOpen, startCamera, stopCamera]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  // ── QR code scan handler ────────────────────────────────────────────────────

  const handleQRCodeScanned = useCallback(
    async (rawValue: string) => {
      // 1. Validate format — Requirement 8.6
      if (!isTeamBarcode(rawValue)) {
        setFlowState({
          phase: 'error',
          message:
            'QR code tidak valid. Pastikan Anda scan QR code tim, bukan QR code wahana.',
        });
        processingRef.current = false;
        return;
      }

      const teamBarcodeData = rawValue;

      // 2. Show loading — Requirement 8.5
      setFlowState({ phase: 'checking', barcodeData: teamBarcodeData });

      try {
        // 3. Look up team first (need team_id for subsequent queries)
        const teamResult = await supabase
          .from('teams')
          .select('id, name')
          .eq('barcode_data', teamBarcodeData)
          .maybeSingle();

        const teamRecord = teamResult.data;

        if (!teamRecord) {
          setFlowState({ phase: 'error', message: 'Tim tidak ditemukan.' });
          processingRef.current = false;
          return;
        }

        // 4. Parallel query: scans and score_logs — Requirement 8.1
        const [scanResult, scoreResult] = await Promise.all([
          supabase
            .from('scans')
            .select('id')
            .eq('location_id', locationId)
            .eq('team_id', teamRecord.id)
            .maybeSingle(),
          supabase
            .from('score_logs')
            .select('id')
            .eq('location_id', locationId)
            .eq('team_id', teamRecord.id)
            .maybeSingle(),
        ]);

        const scanRecord = scanResult.data;
        const scoreRecord = scoreResult.data;

        // 5. Route based on state — Requirements 8.2, 8.3, 8.4
        if (!scanRecord) {
          // Not checked in → run check-in flow — Requirement 8.2
          await runCheckin(teamBarcodeData, teamRecord.name);
        } else if (!scoreRecord) {
          // Checked in, no score yet → show confirmation — Requirement 8.3
          setFlowState({
            phase: 'confirming',
            teamId: teamRecord.id,
            teamName: teamRecord.name,
            score: locationPoints,
          });
          // processingRef stays true until user confirms or cancels
        } else {
          // Already scored → show done message — Requirement 8.4
          setFlowState({
            phase: 'done',
            message: `Tim ${teamRecord.name} sudah selesai bermain di wahana ini.`,
          });
          processingRef.current = false;
        }
      } catch {
        setFlowState({
          phase: 'error',
          message: 'Gagal terhubung ke server. Periksa koneksi internet Anda.',
        });
        processingRef.current = false;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [locationId, locationPoints]
  );

  // ── Check-in flow ───────────────────────────────────────────────────────────

  const runCheckin = async (barcodeData: string, teamName: string) => {
    try {
      const response = await fetch('/api/lo/checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ barcode_data: barcodeData, location_id: locationId }),
      });

      if (response.ok) {
        // Requirement 6.6: close modal and notify success
        onCheckinSuccess(teamName);
      } else if (response.status === 409) {
        // Requirement 6.7: show error without closing modal
        setFlowState({
          phase: 'error',
          message: 'Tim sudah check-in sebelumnya.',
        });
      } else if (response.status === 403) {
        const data = await response.json().catch(() => ({}));
        setFlowState({
          phase: 'error',
          message: (data as { error?: string }).error ?? 'Akses ditolak.',
        });
        // Per design: 403 → show error and close modal
        setTimeout(() => onClose(), 2500);
      } else {
        const data = await response.json().catch(() => ({}));
        setFlowState({
          phase: 'error',
          message: (data as { error?: string }).error ?? 'Gagal melakukan check-in.',
        });
      }
    } catch {
      setFlowState({
        phase: 'error',
        message: 'Gagal terhubung ke server. Periksa koneksi internet Anda.',
      });
    } finally {
      processingRef.current = false;
    }
  };

  // ── Scoring flow ────────────────────────────────────────────────────────────

  const handleConfirmScore = async () => {
    if (flowState.phase !== 'confirming') return;
    const { teamId, teamName, score } = flowState;

    // Reconstruct barcode_data from teamId
    const barcodeData = `fif-team-${teamId}`;

    setIsSubmitting(true);
    try {
      const response = await fetch('/api/lo/score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ barcode_data: barcodeData, location_id: locationId }),
      });

      if (response.ok) {
        // Requirement 7.7: close all modals and notify success
        onScoringSuccess(teamName, score);
      } else if (response.status === 409) {
        setFlowState({
          phase: 'error',
          message: 'Tim sudah mendapat poin di wahana ini.',
        });
      } else if (response.status === 403) {
        const data = await response.json().catch(() => ({}));
        setFlowState({
          phase: 'error',
          message: (data as { error?: string }).error ?? 'Akses ditolak.',
        });
        setTimeout(() => onClose(), 2500);
      } else {
        const data = await response.json().catch(() => ({}));
        setFlowState({
          phase: 'error',
          message: (data as { error?: string }).error ?? 'Gagal memberikan poin.',
        });
      }
    } catch {
      setFlowState({
        phase: 'error',
        message: 'Gagal terhubung ke server. Periksa koneksi internet Anda.',
      });
    } finally {
      setIsSubmitting(false);
      processingRef.current = false;
    }
  };

  // Requirement 7.10: cancel confirmation → return to scanning
  const handleCancelConfirm = () => {
    setFlowState({ phase: 'scanning' });
    processingRef.current = false;
  };

  // ── Retry scan ──────────────────────────────────────────────────────────────

  const handleRetry = () => {
    setFlowState({ phase: 'scanning' });
    processingRef.current = false;
  };

  // ── Close handler ───────────────────────────────────────────────────────────

  const handleClose = () => {
    if (isSubmitting) return;
    onClose();
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  const isConfirming = flowState.phase === 'confirming';

  return (
    <>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            key="scan-modal-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="fixed inset-0 z-[200] flex items-center justify-center p-4"
            style={{
              background: 'rgba(5, 12, 8, 0.9)',
              backdropFilter: 'blur(10px)',
            }}
            onClick={(e) => {
              if (e.target === e.currentTarget && !isSubmitting) handleClose();
            }}
          >
            <motion.div
              key="scan-modal-content"
              initial={{ scale: 0.92, opacity: 0, y: 24 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.92, opacity: 0, y: 24 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
              className="adventure-card w-full max-w-sm mx-auto overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-primary/20 bg-primary/5">
                <div className="flex items-center gap-2">
                  <Camera className="w-4 h-4 text-primary torch-glow" />
                  <h2 className="font-adventure text-sm uppercase tracking-[0.3em] text-primary">
                    Scan QR Code Tim
                  </h2>
                </div>
                <button
                  onClick={handleClose}
                  disabled={isSubmitting}
                  className="text-foreground/40 hover:text-foreground transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  aria-label="Tutup"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Camera viewfinder — Requirement 5.4 */}
              <div className="relative bg-black">
                {/* The div that html5-qrcode mounts into */}
                <div
                  id={scannerId}
                  className="w-full"
                  style={{ minHeight: '280px' }}
                />

                {/* Viewfinder overlay — visual guide for aiming */}
                {!cameraError && flowState.phase === 'scanning' && (
                  <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                    <div className="relative w-52 h-52">
                      {/* Corner brackets */}
                      <span className="absolute top-0 left-0 w-6 h-6 border-t-2 border-l-2 border-primary/80" />
                      <span className="absolute top-0 right-0 w-6 h-6 border-t-2 border-r-2 border-primary/80" />
                      <span className="absolute bottom-0 left-0 w-6 h-6 border-b-2 border-l-2 border-primary/80" />
                      <span className="absolute bottom-0 right-0 w-6 h-6 border-b-2 border-r-2 border-primary/80" />
                      {/* Animated scan line */}
                      <motion.div
                        className="absolute left-1 right-1 h-0.5 bg-primary/60"
                        animate={{ top: ['10%', '90%', '10%'] }}
                        transition={{ duration: 2.5, repeat: Infinity, ease: 'linear' }}
                      />
                    </div>
                  </div>
                )}

                {/* Camera error overlay — Requirement 5.6 */}
                {cameraError && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center p-6 bg-black/80 text-center gap-4">
                    <CameraOff className="w-10 h-10 text-red-400/80" />
                    <p className="text-xs font-content text-red-300/80 leading-relaxed">
                      {cameraError}
                    </p>
                  </div>
                )}

                {/* Checking overlay — Requirement 8.5 */}
                {flowState.phase === 'checking' && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 gap-3">
                    <Loader2 className="w-8 h-8 text-primary animate-spin" />
                    <p className="text-xs font-adventure uppercase tracking-widest text-primary/80">
                      Memeriksa...
                    </p>
                  </div>
                )}
              </div>

              {/* Status area */}
              <div className="px-6 py-4 min-h-[80px] flex flex-col justify-center">
                <AnimatePresence mode="wait">
                  {flowState.phase === 'scanning' && !cameraError && (
                    <motion.p
                      key="hint"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="text-[11px] font-content text-muted-foreground italic text-center opacity-60"
                    >
                      Arahkan kamera ke QR code tim
                    </motion.p>
                  )}

                  {flowState.phase === 'error' && (
                    <motion.div
                      key="error"
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 6 }}
                      className="flex flex-col items-center gap-3"
                    >
                      <div className="flex items-start gap-2 p-3 bg-red-900/30 border border-red-500/30 rounded-sm w-full">
                        <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                        <p className="text-[11px] font-content text-red-300/90 leading-relaxed">
                          {flowState.message}
                        </p>
                      </div>
                      <button
                        onClick={handleRetry}
                        className="text-[10px] font-adventure uppercase tracking-[0.2em] text-primary/70 hover:text-primary transition-colors"
                      >
                        Scan Ulang
                      </button>
                    </motion.div>
                  )}

                  {flowState.phase === 'done' && (
                    <motion.div
                      key="done"
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 6 }}
                      className="flex flex-col items-center gap-3"
                    >
                      <div className="flex items-start gap-2 p-3 bg-blue-900/30 border border-blue-500/30 rounded-sm w-full">
                        <Info className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
                        <p className="text-[11px] font-content text-blue-300/90 leading-relaxed">
                          {flowState.message}
                        </p>
                      </div>
                      <button
                        onClick={handleRetry}
                        className="text-[10px] font-adventure uppercase tracking-[0.2em] text-primary/70 hover:text-primary transition-colors"
                      >
                        Scan Tim Lain
                      </button>
                    </motion.div>
                  )}

                  {flowState.phase === 'confirming' && (
                    <motion.div
                      key="confirming"
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 6 }}
                      className="flex items-center gap-2 p-3 bg-green-900/20 border border-green-500/20 rounded-sm"
                    >
                      <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0" />
                      <p className="text-[11px] font-content text-green-300/80">
                        Tim ditemukan. Konfirmasi pemberian poin.
                      </p>
                    </motion.div>
                  )}

                  {flowState.phase === 'checking' && (
                    <motion.p
                      key="checking-hint"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="text-[11px] font-content text-muted-foreground italic text-center opacity-60"
                    >
                      Sedang memeriksa status tim...
                    </motion.p>
                  )}
                </AnimatePresence>
              </div>

              {/* Footer */}
              <div className="px-6 pb-5">
                <button
                  onClick={handleClose}
                  disabled={isSubmitting}
                  className="w-full py-3 font-adventure text-xs uppercase tracking-[0.2em] border border-primary/20 text-foreground/50 hover:text-foreground hover:border-primary/40 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  Tutup
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ConfirmationModal rendered inside ScanModal — Requirement 7.1 */}
      {isOpen && isConfirming && flowState.phase === 'confirming' && (
        <ConfirmationModal
          isOpen={true}
          teamName={flowState.teamName}
          locationName={locationName}
          score={flowState.score}
          onConfirm={handleConfirmScore}
          onCancel={handleCancelConfirm}
          isSubmitting={isSubmitting}
        />
      )}
    </>
  );
}
