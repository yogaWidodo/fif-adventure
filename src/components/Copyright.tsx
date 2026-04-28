'use client';

import { motion } from 'framer-motion';

export default function Copyright() {
  const currentYear = new Date().getFullYear();
  
  return (
    <footer className="mt-20 mb-10 flex flex-col items-center gap-6 opacity-30 text-center px-4">
      <div className="flex items-center gap-4">
        <span className="h-px w-12 md:w-24 bg-gradient-to-r from-transparent to-primary/40" />
        <span className="font-adventure text-[8px] md:text-[9px] tracking-[0.5em] uppercase whitespace-nowrap">
          End of Scroll
        </span>
        <span className="h-px w-12 md:w-24 bg-gradient-to-l from-transparent to-primary/40" />
      </div>
      
      <div className="flex flex-col gap-1.5">
        <p className="font-adventure text-[9px] tracking-[0.2em] text-primary">
          &copy; {currentYear} FIF ADVENTURE. ALL RIGHTS RESERVED.
        </p>
        <div className="flex flex-wrap justify-center gap-x-4 gap-y-1">
          <p className="text-[8px] font-content uppercase tracking-widest">
            <span className="text-primary/60">Developer:</span> <span className="text-foreground">Yoga Sulistiyo Widodo</span>
          </p>
          <p className="text-[8px] font-content uppercase tracking-widest">
            <span className="text-primary/60">Designer:</span> <span className="text-foreground">Farhan Jamaludin</span>
          </p>
        </div>
      </div>
    </footer>
  );
}
