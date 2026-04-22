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
  Gem,
  Skull,
  Users,
  CheckSquare,
  Square
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { isTeamBarcode } from '@/lib/auth';

// Helper: get current access token from Supabase session or localStorage
async function getAccessToken(): Promise<string | null> {
  // 1. Try Supabase session first
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.access_token) return session.access_token;

  // 2. Fallback: localStorage (set during login)
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem('fif_access_token');
    if (stored) return stored;
  }

  return null;
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface ScanModalProps {
  isOpen: boolean;
  activityId: string;
  activityName: string;
  activityPoints: number;
  onClose: () => void;
  onCheckinSuccess: (teamName: string, hintGranted?: boolean) => void;
  onScoringSuccess: (teamName: string, score: number) => void;
}

type Phase =
  | 'scanning'                  // kamera aktif, menunggu scan
  | 'choosing'                  // QR berhasil di-scan, pilih aksi
  | 'giving_point'              // input jumlah anggota yang berpartisipasi
  | 'submitting'                // sedang kirim ke API
  | 'error'                     // error, bisa retry
  | 'success';                  // berhasil, modal akan tutup

interface TeamInfo {
  id: string;
  name: string;
  barcodeData: string;
}

interface TeamMember {
  id: string;
  name: string;
  role: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ScanModal({
  isOpen,
  activityId,
  activityName: _activityName,
  activityPoints,
  onClose,
  onCheckinSuccess,
  onScoringSuccess,
}: ScanModalProps) {
  const reactId = useId();
  const scannerId = `qr-scanner-${reactId.replace(/:/g, '')}`;

  const [phase, setPhase] = useState<Phase>('scanning');
  const [team, setTeam] = useState<TeamInfo | null>(null);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
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

    const { extractTeamIdFromBarcode } = await import('@/lib/auth');
    const extractedTeamId = extractTeamIdFromBarcode(rawValue);
    if (!extractedTeamId) {
      setErrorMsg('Gagal mengekstrak ID tim dari QR.');
      setPhase('error');
      processingRef.current = false;
      return;
    }

    // Look up team
    const { data: teamRecord } = await supabase
      .from('teams')
      .select('id, name')
      .eq('id', extractedTeamId)
      .maybeSingle();

    if (!teamRecord) {
      setErrorMsg('Tim tidak ditemukan.');
      setPhase('error');
      processingRef.current = false;
      return;
    }

    // Fetch team members
    const { data: membersRecord } = await supabase
      .from('users')
      .select('id, name, role')
      .eq('team_id', extractedTeamId)
      .in('role', ['captain', 'vice_captain', 'member'])
      .order('role', { ascending: true }); // captain usually first alphabetically, or close

    setTeam({ id: teamRecord.id, name: teamRecord.name, barcodeData: rawValue });
    setTeamMembers(membersRecord ?? []);
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
        body: JSON.stringify({ team_id: team.id, activity_id: activityId }),
      });

      if (res.ok) {
        const data = await res.json();
        setPhase('success');
        setTimeout(() => onCheckinSuccess(team.name, data.hint_granted), 800);
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

  const handleGivePointClick = () => {
    // Select all members by default
    setSelectedMemberIds(teamMembers.map(m => m.id));
    setPhase('giving_point');
  };

  const submitPoint = async () => {
    if (!team) return;
    if (selectedMemberIds.length < 1) {
      setErrorMsg('Pilih minimal 1 peserta.');
      setPhase('error');
      return;
    }

    setPhase('submitting');
    const calculatedPoints = activityPoints * selectedMemberIds.length;
    
    // Create detailed note
    const selectedNames = teamMembers
      .filter(m => selectedMemberIds.includes(m.id))
      .map(m => m.name)
      .join(', ');
    const note = `Partisipan (${selectedMemberIds.length} orang): ${selectedNames}. (${activityPoints} poin/orang)`;

    try {
      const token = await getAccessToken();
      const res = await fetch('/api/lo/score', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ 
          team_id: team.id, 
          points: calculatedPoints, 
          activity_id: activityId,
          note: note,
          participant_ids: selectedMemberIds
        }),
      });

      if (res.ok) {
        setPhase('success');
        setTimeout(() => onScoringSuccess(team.name, calculatedPoints), 800);
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
    setTeamMembers([]);
    setSelectedMemberIds([]);
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
          style={{ background: 'rgba(5, 12, 8, 0.95)' }}
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
                      onClick={handleGivePointClick}
                      className="w-full flex items-center gap-4 p-4 border border-primary/20 hover:border-primary hover:bg-primary/5 transition-all group"
                    >
                      <div className="bg-primary/10 p-2.5 rounded-lg group-hover:bg-primary/20 transition-colors">
                        <Star className="w-5 h-5 text-primary" />
                      </div>
                      <div className="text-left">
                        <p className="font-adventure text-sm text-primary tracking-wide">Give Point</p>
                        <p className="text-[10px] text-foreground/40 font-content">Beri poin berdasarkan partisipasi</p>
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

                {/* Giving Point Phase */}
                {phase === 'giving_point' && team && (
                  <motion.div
                    key="giving_point"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="space-y-4"
                  >
                    <div className="text-center mb-4">
                      <p className="text-[10px] uppercase font-adventure tracking-widest text-primary/60 mb-2">
                        Pilih Partisipan
                      </p>
                      <h3 className="font-adventure text-xl text-primary gold-engraving">
                        {team.name}
                      </h3>
                      <p className="text-xs text-foreground/50 italic mt-1 font-content">
                        Centang anggota yang bermain di wahana ini
                      </p>
                    </div>

                    {/* Member Selection List */}
                    <div className="bg-black/40 border border-primary/20 rounded-lg max-h-[300px] overflow-y-auto custom-scrollbar p-2 space-y-1">
                      <div className="flex justify-between items-center mb-2 px-2 pt-1 pb-2 border-b border-primary/10">
                        <button
                          onClick={() => setSelectedMemberIds(teamMembers.map(m => m.id))}
                          className="text-[10px] font-adventure uppercase tracking-wider text-primary/70 hover:text-primary transition-colors"
                        >
                          Select All
                        </button>
                        <button
                          onClick={() => setSelectedMemberIds([])}
                          className="text-[10px] font-adventure uppercase tracking-wider text-foreground/40 hover:text-foreground transition-colors"
                        >
                          Clear All
                        </button>
                      </div>

                      {teamMembers.length === 0 ? (
                        <p className="text-sm text-foreground/40 text-center py-4 italic">
                          Tidak ada data member
                        </p>
                      ) : (
                        teamMembers.map(member => {
                          const isSelected = selectedMemberIds.includes(member.id);
                          return (
                            <button
                              key={member.id}
                              onClick={() => {
                                setSelectedMemberIds(prev =>
                                  isSelected
                                    ? prev.filter(id => id !== member.id)
                                    : [...prev, member.id]
                                );
                              }}
                              className={`w-full flex items-center justify-between p-3 rounded transition-all border ${
                                isSelected 
                                  ? 'bg-primary/20 border-primary/40' 
                                  : 'bg-primary/5 border-transparent hover:bg-primary/10 hover:border-primary/20'
                              }`}
                            >
                              <div className="flex items-center gap-3 text-left">
                                {isSelected ? (
                                  <CheckSquare className="w-5 h-5 text-primary flex-shrink-0" />
                                ) : (
                                  <Square className="w-5 h-5 text-primary/30 flex-shrink-0" />
                                )}
                                <div>
                                  <p className={`font-content text-sm ${isSelected ? 'text-primary' : 'text-foreground/70'}`}>
                                    {member.name}
                                  </p>
                                  <p className="text-[9px] uppercase font-adventure text-primary/40 tracking-wider">
                                    {member.role.replace('_', ' ')}
                                  </p>
                                </div>
                              </div>
                            </button>
                          );
                        })
                      )}
                    </div>

                    <div className="bg-primary/10 p-4 border border-primary/20 flex justify-between items-center rounded-lg mt-4">
                      <div className="text-left">
                        <p className="text-[10px] uppercase font-adventure tracking-widest text-primary/60 mb-1">
                          Total Kalkulasi
                        </p>
                        <p className="font-content text-sm text-foreground/80">
                          {selectedMemberIds.length} <span className="text-xs text-foreground/50">orang</span> × {activityPoints} <span className="text-xs text-foreground/50">poin</span>
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-adventure text-2xl text-primary torch-glow">
                          +{selectedMemberIds.length * activityPoints}
                        </p>
                      </div>
                    </div>

                    <div className="flex gap-3 pt-4">
                      <button
                        onClick={() => setPhase('choosing')}
                        className="flex-1 py-3 border border-primary/30 text-primary hover:bg-primary/10 font-adventure text-sm tracking-widest uppercase transition-colors"
                      >
                        Kembali
                      </button>
                      <button
                        onClick={submitPoint}
                        className="flex-1 py-3 font-adventure text-xs uppercase tracking-[0.2em] bg-primary/20 border border-primary/40 text-primary hover:bg-primary/30 transition-all shadow-[0_0_15px_rgba(var(--primary-rgb),0.2)]"
                      >
                        Kirim Poin
                      </button>
                    </div>
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
