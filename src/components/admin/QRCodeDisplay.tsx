'use client';

import { useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Download, QrCode } from 'lucide-react';

interface QRCodeDisplayProps {
  barcodeData: string;
  label?: string;
  size?: number;
}

/**
 * Renders a QR code SVG for the given barcode_data and provides a PNG download button.
 * Requirements: 3.2, 3.4
 */
export default function QRCodeDisplay({ barcodeData, label, size = 160 }: QRCodeDisplayProps) {
  const svgRef = useRef<SVGSVGElement>(null);

  const handleDownload = () => {
    const svg = svgRef.current;
    if (!svg) return;

    // Serialize SVG to string and ensure it has large dimensions for the canvas
    const serializer = new XMLSerializer();
    const targetSize = 2000; // High resolution for print
    const padding = 160;     // Proportional padding
    
    // Clone the SVG and set its dimensions to targetSize so it renders sharply
    const clonedSvg = svg.cloneNode(true) as SVGSVGElement;
    clonedSvg.setAttribute('width', targetSize.toString());
    clonedSvg.setAttribute('height', targetSize.toString());
    
    const svgStr = serializer.serializeToString(clonedSvg);

    // Draw onto a high-resolution canvas for printing
    const canvas = document.createElement('canvas');
    canvas.width = targetSize + padding * 2;
    canvas.height = targetSize + padding * 2;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // White background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const img = new Image();
    const svgBlob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    img.onload = () => {
      ctx.drawImage(img, padding, padding, targetSize, targetSize);
      URL.revokeObjectURL(url);

      const pngUrl = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.href = pngUrl;
      link.download = `qr-${barcodeData}.png`;
      link.click();
    };

    img.src = url;
  };

  if (!barcodeData) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 p-4 border border-dashed border-primary/20 rounded-none opacity-40">
        <QrCode className="w-8 h-8 text-primary/40" />
        <p className="text-[10px] font-adventure text-primary/40 uppercase tracking-widest">No QR Data</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3">
      {/* QR Code */}
      <div className="bg-white p-3 border border-primary/20">
        <QRCodeSVG
          ref={svgRef}
          value={barcodeData}
          size={size}
          bgColor="#ffffff"
          fgColor="#000000"
          level="H"
          marginSize={2}
        />
      </div>

      {/* Label */}
      {label && (
        <p className="text-[10px] font-adventure uppercase tracking-widest text-primary/60 text-center max-w-[160px] truncate">
          {label}
        </p>
      )}



      {/* Download button */}
      <button
        onClick={handleDownload}
        className="flex items-center gap-2 text-[10px] font-adventure uppercase tracking-widest text-primary hover:text-primary/80 border border-primary/20 hover:border-primary/40 px-3 py-2 transition-all"
      >
        <Download className="w-3 h-3" />
        Download PNG
      </button>
    </div>
  );
}
