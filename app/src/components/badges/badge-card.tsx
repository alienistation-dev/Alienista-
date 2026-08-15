'use client';

import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Student } from '@/lib/types/models';
import { Download } from 'lucide-react';

export function BadgeCard({ student }: { student: Student }) {
  const [qrDataUrl, setQrDataUrl] = useState<string>('');

  useEffect(() => {
    QRCode.toDataURL(student.uid, {
      width: 240,
      margin: 1,
      color: {
        dark: '#111827',
        light: '#FFFFFF',
      },
    }).then(setQrDataUrl);
  }, [student.uid]);

  const blockLabel = student.section.startsWith('Block') ? student.section : `Block ${student.section}`;

  const handleDownloadPng = () => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = 500;
    canvas.height = 700;

    // Outer Background
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.roundRect(0, 0, 500, 700, 20);
    ctx.fill();

    // Top Header Banner
    ctx.fillStyle = '#1B4332';
    ctx.beginPath();
    ctx.roundRect(0, 0, 500, 220, [20, 20, 0, 0]);
    ctx.fill();

    // Brand Title
    ctx.fillStyle = '#D4AF37';
    ctx.font = 'bold 13px sans-serif';
    ctx.fillText('ALIENISTA · ACS CAMPUS ID BADGE', 30, 45);

    // Full Name
    const name = student.full_name;
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 24px sans-serif';
    ctx.fillText(name.length > 24 ? name.slice(0, 22) + '...' : name, 30, 95);

    // Course & Year
    ctx.fillStyle = '#D1E7D7';
    ctx.font = '15px sans-serif';
    ctx.fillText(`${student.course} · ${student.year}`, 30, 135);

    // Divider Line
    ctx.strokeStyle = 'rgba(212, 175, 55, 0.4)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(30, 165);
    ctx.lineTo(470, 165);
    ctx.stroke();

    // Block & Status
    ctx.fillStyle = '#D4AF37';
    ctx.font = 'bold 14px sans-serif';
    ctx.fillText(`${blockLabel} · ${student.status}`, 30, 195);

    // White QR Container Box
    ctx.fillStyle = '#F8FAF9';
    ctx.strokeStyle = '#E5EBE5';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(30, 250, 210, 210, 12);
    ctx.fill();
    ctx.stroke();

    // Draw QR Image
    if (qrDataUrl) {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 40, 260, 190, 190);

        // Information Column
        const infoX = 265;
        ctx.fillStyle = '#2D6A4F';
        ctx.font = 'bold 11px sans-serif';
        ctx.fillText('SYSTEM UID', infoX, 280);

        ctx.fillStyle = '#111827';
        ctx.font = 'bold 16px monospace';
        ctx.fillText(student.uid, infoX, 306);

        ctx.fillStyle = '#2D6A4F';
        ctx.font = 'bold 11px sans-serif';
        ctx.fillText('STUDENT NUMBER', infoX, 350);

        ctx.fillStyle = '#111827';
        ctx.font = 'bold 15px monospace';
        ctx.fillText(student.student_number, infoX, 376);

        ctx.fillStyle = '#2D6A4F';
        ctx.font = 'bold 11px sans-serif';
        ctx.fillText('BLOCK', infoX, 420);

        ctx.fillStyle = '#4B5563';
        ctx.font = '14px sans-serif';
        ctx.fillText(blockLabel, infoX, 444);

        // Footer
        ctx.strokeStyle = '#E5EBE5';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(30, 620);
        ctx.lineTo(470, 620);
        ctx.stroke();

        ctx.fillStyle = '#1B4332';
        ctx.font = 'bold 12px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('ASSOCIATION OF COMPUTER SCIENTISTS · PSU', 250, 655);

        // Download
        const a = document.createElement('a');
        a.download = `${student.full_name.replace(/\s+/g, '_')}_Alienista_Badge.png`;
        a.href = canvas.toDataURL('image/png');
        a.click();
      };
      img.src = qrDataUrl;
    }
  };

  return (
    <div className="bg-white border border-[#E5EBE5] rounded-3xl overflow-hidden shadow-md max-w-xs mx-auto flex flex-col justify-between">
      {/* Top Header Card */}
      <div className="bg-[#1B4332] p-4 text-left border-b border-[#2D6A4F]/30">
        <div className="text-[10px] uppercase font-bold text-[#D4AF37] tracking-wider">Alienista · Campus ID</div>
        <div className="text-sm font-bold text-white mt-1 truncate">{student.full_name}</div>
        <div className="text-xs text-[#D1E7D7] mt-0.5">{student.course} · {student.year}</div>
      </div>

      {/* Body QR Code */}
      <div className="p-5 flex items-center gap-4">
        <div className="w-24 h-24 bg-[#F8FAF9] rounded-2xl p-1.5 shrink-0 flex items-center justify-center border border-[#E5EBE5]">
          {qrDataUrl ? (
            <img src={qrDataUrl} alt={student.uid} className="w-full h-full object-contain" />
          ) : (
            <div className="text-[10px] text-slate-400">Generating...</div>
          )}
        </div>
        <div className="space-y-1.5 text-xs text-left">
          <div>
            <div className="text-[9px] uppercase tracking-wider font-bold text-[#2D6A4F]">UID</div>
            <div className="font-mono font-bold text-slate-900 text-[11px]">{student.uid}</div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider font-bold text-[#2D6A4F]">Student No.</div>
            <div className="font-mono text-slate-700 text-[11px]">{student.student_number}</div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider font-bold text-[#2D6A4F]">Block</div>
            <div className="text-slate-700 text-[11px]">{blockLabel}</div>
          </div>
        </div>
      </div>

      {/* Card Actions */}
      <div className="p-3 bg-[#F8FAF9] border-t border-[#E5EBE5] flex items-center justify-end gap-2">
        <button
          onClick={handleDownloadPng}
          className="px-3.5 py-1.5 bg-[#2D6A4F] hover:bg-[#1B4332] text-white font-semibold rounded-xl text-xs flex items-center gap-1.5 transition-colors shadow-xs"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Download PNG</span>
        </button>
      </div>
    </div>
  );
}
