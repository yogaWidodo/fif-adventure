'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Map, X, ZoomIn, ImageOff } from 'lucide-react';
import Image from 'next/image';
import { supabase } from '@/lib/supabase';

interface MapPanelProps {
  /** Optional title override */
  title?: string;
  /** Optional subtitle */
  subtitle?: string;
  /** Show as a collapsible card (default: false — always visible) */
  collapsible?: boolean;
}

export default function MapPanel({
  title = 'Expedition Map',
  subtitle = 'TSC Adventure Grounds',
  collapsible = false,
}: MapPanelProps) {
  const [isOpen, setIsOpen] = useState(!collapsible);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const [mapUrl, setMapUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Fetch map_image_url from global settings (Req. 8 – Decision #4)
  useEffect(() => {
    supabase
      .from('settings')
      .select('value')
      .eq('key', 'map_image_url')
      .single()
      .then(({ data }) => {
        setMapUrl(data?.value ?? null);
        setLoading(false);
      });
  }, []);

  // fallback to local asset, use || so empty string falls back too. Next.js handles spaces in unencoded format.
  const imgSrc = mapUrl || '/images/MAP TSC.png'; 

  return (
    <>
      {/* Map Card */}
      <div className="adventure-card overflow-hidden">
        {/* Header */}
        <button
          onClick={() => collapsible && setIsOpen((v) => !v)}
          className={`w-full flex items-center justify-between px-5 py-4 border-b border-primary/10 ${collapsible ? 'cursor-pointer hover:bg-primary/5 transition-colors' : 'cursor-default'}`}
        >
          <div className="flex items-center gap-3">
            <Map className="w-4 h-4 text-primary" />
            <span className="font-adventure text-sm tracking-widest text-primary uppercase">{title}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-adventure uppercase tracking-widest text-foreground/30 italic">{subtitle}</span>
            {collapsible && (
              <span className="text-foreground/40 text-xs ml-2">{isOpen ? '▲' : '▼'}</span>
            )}
          </div>
        </button>

        {/* Map Image */}
        <AnimatePresence initial={false}>
          {isOpen && (
            <motion.div
              key="map-content"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="overflow-hidden"
            >
              {loading ? (
                <div className="flex items-center justify-center h-40 bg-black/20">
                  <span className="font-adventure text-xs tracking-widest text-foreground/30 uppercase animate-pulse">
                    Loading map...
                  </span>
                </div>
              ) : mapUrl === null && typeof window !== 'undefined' ? (
                // No map configured
                <div className="flex flex-col items-center justify-center h-40 gap-3 bg-black/20">
                  <ImageOff className="w-8 h-8 text-foreground/20" />
                  <span className="font-adventure text-xs tracking-widest text-foreground/30 uppercase">
                    Peta belum dikonfigurasi Admin
                  </span>
                </div>
              ) : (
                <div className="relative group cursor-zoom-in" onClick={() => setIsLightboxOpen(true)}>
                  <Image
                    src={imgSrc}
                    alt="TSC Adventure Expedition Map"
                    width={1200}
                    height={900}
                    className="w-full h-auto object-contain"
                    priority
                    unoptimized={!!mapUrl} // skip Next.js optimization for external URLs
                  />
                  {/* Hover overlay */}
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity bg-black/60 backdrop-blur-sm px-4 py-2 flex items-center gap-2 border border-primary/30">
                      <ZoomIn className="w-4 h-4 text-primary" />
                      <span className="font-adventure text-xs text-primary uppercase tracking-widest">View Full Map</span>
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Lightbox */}
      <AnimatePresence>
        {isLightboxOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-md flex items-center justify-center p-4"
            onClick={() => setIsLightboxOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: 'spring', damping: 20 }}
              className="relative max-w-5xl w-full"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Close button */}
              <button
                onClick={() => setIsLightboxOpen(false)}
                className="absolute -top-10 right-0 text-foreground/60 hover:text-primary transition-colors flex items-center gap-2 font-adventure text-xs uppercase tracking-widest"
              >
                <X className="w-4 h-4" /> Close
              </button>

              <div className="adventure-card overflow-hidden border-primary/30">
                <div className="px-5 py-3 border-b border-primary/10 flex items-center gap-3">
                  <Map className="w-4 h-4 text-primary" />
                  <span className="font-adventure text-sm tracking-widest text-primary uppercase">{title}</span>
                </div>
                <Image
                  src={imgSrc}
                  alt="TSC Adventure Expedition Map"
                  width={1600}
                  height={1200}
                  className="w-full h-auto object-contain"
                  priority
                  unoptimized={!!mapUrl}
                />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
