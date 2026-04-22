'use client';

import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Volume2, VolumeX, Music } from 'lucide-react';

const AUDIO_PATH = '/audio/Beyond_the_Green_Horizon_compressed.mp3';
const STORAGE_KEY = 'expedition_bgm_muted';

export default function SoundManager() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isMuted, setIsMuted] = useState(false); // Changed to false to play by default
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasInteracted, setHasInteracted] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  // Initialize state from local storage and setup audio
  useEffect(() => {
    const savedMuted = localStorage.getItem(STORAGE_KEY);
    // If no preference saved, default to false (unmuted)
    const initialMuted = savedMuted ? savedMuted === 'true' : false;
    setIsMuted(initialMuted);

    audioRef.current = new Audio(AUDIO_PATH);
    audioRef.current.loop = true;
    audioRef.current.volume = 0.4; // Solid background volume, not overpowering

    // Listen for the first interaction to handle autoplay restrictions
    const handleFirstInteraction = () => {
      setHasInteracted(true);
      window.removeEventListener('click', handleFirstInteraction);
      window.removeEventListener('scroll', handleFirstInteraction);
      window.removeEventListener('touchstart', handleFirstInteraction);
    };

    window.addEventListener('click', handleFirstInteraction);
    window.addEventListener('scroll', handleFirstInteraction);
    window.addEventListener('touchstart', handleFirstInteraction);

    // Show the button after a slight delay
    const timer = setTimeout(() => setIsVisible(true), 1500);

    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      window.removeEventListener('click', handleFirstInteraction);
      window.removeEventListener('scroll', handleFirstInteraction);
      window.removeEventListener('touchstart', handleFirstInteraction);
      clearTimeout(timer);
    };
  }, []);

  // Handle Play/Pause and Muting
  useEffect(() => {
    if (!audioRef.current || !hasInteracted) return;

    if (isMuted) {
      // Fade out volume before pausing or just mute
      const fadeOut = setInterval(() => {
        if (audioRef.current && audioRef.current.volume > 0.05) {
          audioRef.current.volume -= 0.05;
        } else {
          if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current.volume = 0;
          }
          setIsPlaying(false);
          clearInterval(fadeOut);
        }
      }, 50);
    } else {
      // Start playing and fade in
      audioRef.current.play().then(() => {
        setIsPlaying(true);
        const fadeIn = setInterval(() => {
          if (audioRef.current && audioRef.current.volume < 0.4) {
            audioRef.current.volume += 0.05;
          } else {
            if (audioRef.current) audioRef.current.volume = 0.4;
            clearInterval(fadeIn);
          }
        }, 50);
      }).catch(err => {
        console.warn('Audio play failed:', err);
      });
    }
  }, [isMuted, hasInteracted]);

  const toggleMute = () => {
    const newMuted = !isMuted;
    setIsMuted(newMuted);
    localStorage.setItem(STORAGE_KEY, String(newMuted));

    // If user explicitly clicks unmute, they have interacted
    if (!hasInteracted) setHasInteracted(true);
  };

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, scale: 0.8, x: 20 }}
          animate={{ opacity: 1, scale: 1, x: 0 }}
          exit={{ opacity: 0, scale: 0.8, x: 20 }}
          className="fixed bottom-6 right-6 z-[200] flex items-center gap-3"
        >
          {/* Status Badge */}
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: isPlaying ? 'auto' : 0, opacity: isPlaying ? 1 : 0 }}
            className="overflow-hidden whitespace-nowrap hidden md:block"
          >
            <div className="bg-black/80 border border-primary/20 px-3 py-1.5 rounded-full text-[9px] uppercase font-adventure tracking-widest text-primary/60 flex items-center gap-2">
              <Music className="w-3 h-3 animate-pulse" />
              <span>Beyond the Green Horizon</span>
            </div>
          </motion.div>

          {/* Toggle Button */}
          <button
            onClick={toggleMute}
            className={`adventure-card p-3 rounded-full border transition-all duration-500 group shadow-2xl ${isMuted
                ? 'bg-black/60 border-primary/10 text-primary/30 hover:text-primary/60'
                : 'bg-primary/20 border-primary/40 text-primary torch-glow'
              }`}
            aria-label={isMuted ? 'Unmute BGM' : 'Mute BGM'}
          >
            <div className="relative">
              <AnimatePresence mode="wait">
                {isMuted ? (
                  <motion.div
                    key="muted"
                    initial={{ opacity: 0, rotate: -45 }}
                    animate={{ opacity: 1, rotate: 0 }}
                    exit={{ opacity: 0, rotate: 45 }}
                  >
                    <VolumeX className="w-5 h-5" />
                  </motion.div>
                ) : (
                  <motion.div
                    key="playing"
                    initial={{ opacity: 0, rotate: -45 }}
                    animate={{ opacity: 1, rotate: 0 }}
                    exit={{ opacity: 0, rotate: 45 }}
                  >
                    <Volume2 className="w-5 h-5" />
                  </motion.div>
                )}
              </AnimatePresence>

              {!isMuted && (
                <motion.div
                  animate={{
                    scale: [1, 1.5, 1],
                    opacity: [0.3, 0, 0.3]
                  }}
                  transition={{
                    repeat: Infinity,
                    duration: 2
                  }}
                  className="absolute inset-0 bg-primary/40 rounded-full -z-10"
                />
              )}
            </div>
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
