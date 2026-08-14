'use client';

import React, { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { Student } from '@/lib/types/models';
import { Download, Printer } from 'lucide-react';

export function BadgeCard({ student }: { student: Student }) {
  const [qrDataUrl, setQrDataUrl] = useState<string>('');

  useEffect(() => {
    QRCode.toDataURL(student.uid, {
      width: 240,
      margin: 1,
      color: {
        dark: '#0B1120',
        light: '#FFFFFF',
      },
    }).then(setQrDataUrl);
  }, [student.uid]);

  const handleDownloadPng = () => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = 500;
    canvas.height = 700;

    // Outer Background
    ctx.fillStyle = '#151E33';
    ctx.beginPath();
    ctx.roundRect(0, 0, 500, 700, 20);
    ctx.fill();

    // Header Area
    ctx.fillStyle = '#0B1120';
    ctx.beginPath();
    ctx.roundRect(0, 0, 500, 220, [20, 20, 0, 0]);
    ctx.fill();

    // Brand Title
    ctx.fillStyle = '#D4AF37';
    ctx.font = 'bold 13px sans-serif';
    ctx.fillText('ATTENDQR · CAMPUS ID BADGE', 30, 45);

    // Full Name
    const name = student.full_name;
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 22px sans-serif';
    ctx.fillText(name.length > 26 ? name.slice(0, 24) + '...' : name, 30, 95);

    // Course & Year
    ctx.fillStyle = '#94A3B8';
    ctx.font = '15px sans-serif';
    ctx.fillText(`${student.course} · ${student.year}`, 30, 135);

    // Divider Line
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(30, 165);
    ctx.lineTo(470, 165);
    ctx.stroke();

    // Section & Status
    ctx.fillStyle = '#D4AF37';
    ctx.font = '14px sans-serif';
    ctx.fillText(`Section ${student.section} · ${student.status}`, 30, 195);

    // White QR Container Box
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.roundRect(30, 250, 210, 210, 12);
    ctx.fill();

    // Draw QR Image
    if (qrDataUrl) {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 40, 260, 190, 190);

        // Information Column
        const infoX = 265;
        ctx.fillStyle = '#D4AF37';
        ctx.font = 'bold 11px sans-serif';
        ctx.fillText('SYSTEM UID', infoX, 280);

        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 16px monospace';
        ctx.fillText(student.uid, infoX, 306);

        ctx.fillStyle = '#D4AF37';
        ctx.font = 'bold 11px sans-serif';
        ctx.fillText('STUDENT NUMBER', infoX, 350);

        ctx.fillStyle = '#FFFFFF';
        ctx.font = '15px monospace';
        ctx.fillText(student.student_number, infoX, 376);

        ctx.fillStyle = '#D4AF37';
        ctx.font = 'bold 11px sans-serif';
        ctx.fillText('SECTION', infoX, 420);

        ctx.fillStyle = '#94A3B8';
        ctx.font = '14px sans-serif';
        ctx.fillText(`Sec. ${student.section}`, infoX, 444);

        // Footer
        ctx.strokeStyle = 'rgba(255,255,255,0.15)';
        ctx.beginPath();
        ctx.moveTo(30, 620);
        ctx.lineTo(470, 620);
        ctx.stroke();

        ctx.fillStyle = '#D4AF37';
        ctx.font = 'bold 12px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('ASSOCIATION OF COMPUTER SCIENTISTS', 250, 655);

        // Download
        const a = document.createElement('a');
        a.download = `${student.full_name.replace(/\s+/g, '_')}_Badge.png`;
        a.href = canvas.toDataURL('image/png');
        a.click();
      };
      img.src = qrDataUrl;
    }
  };

  return (
    <div className="bg-[#151E33] border border-slate-800 rounded-2xl overflow-hidden shadow-2xl max-w-xs mx-auto flex flex-col justify-between">
      {/* Top Header Card */}
      <div className="bg-[#0B1120] p-4 border-b border-slate-800/80">
        <div className="text-[10px] uppercase font-bold text-amber-400 tracking-wider">AttendQR · Campus ID</div>
        <div className="text-sm font-bold text-white mt-1 truncate">{student.full_name}</div>
        <div className="text-xs text-slate-400 mt-0.5">{student.course} · {student.year}</div>
      </div>

      {/* Body QR Code */}
      <div className="p-5 flex items-center gap-4">
        <div className="w-24 h-24 bg-white rounded-xl p-1.5 shrink-0 flex items-center justify-center shadow-inner">
          {qrDataUrl ? (
            <img src={qrDataUrl} alt={student.uid} className="w-full h-full object-contain" />
          ) : (
            <div className="text-[10px] text-slate-400">Generating...</div>
          )}
        </div>
        <div className="space-y-1.5 text-xs">
          <div>
            <div className="text-[9px] uppercase tracking-wider font-bold text-amber-400">UID</div>
            <div className="font-mono font-bold text-white text-[11px]">{student.uid}</div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider font-bold text-amber-400">Student No.</div>
            <div className="font-mono text-slate-300 text-[11px]">{student.student_number}</div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider font-bold text-amber-400">Section</div>
            <div className="text-slate-300 text-[11px]">Sec. {student.section}</div>
          </div>
        </div>
      </div>

      {/* Card Actions */}
      <div className="p-3 bg-[#0B1120]/60 border-t border-slate-800 flex items-center justify-end gap-2">
        <button
          onClick={handleDownloadPng}
          className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold rounded-lg text-xs flex items-center gap-1.5 transition-colors shadow-sm"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Download PNG</span>
        </button>
      </div>
    </div>
  );
}
