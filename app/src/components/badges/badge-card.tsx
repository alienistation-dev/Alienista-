'use client';

import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Student } from '@/lib/types/models';
import { Download } from 'lucide-react';

export function BadgeCard({ student }: { student: Student }) {
  const [qrDataUrl, setQrDataUrl] = useState<string>('');

  const uid = student?.uid || 'ST-UNKNOWN';
  const fullName = student?.full_name || 'Student';
  const studentNumber = student?.student_number || 'N/A';
  const course = student?.course || 'BS Computer Science';
  const year = student?.year || '1st Year';
  const rawSection = student?.section || '1';
  const blockLabel = rawSection.startsWith('Block') ? rawSection : `Block ${rawSection}`;
  const status = student?.status || 'Active';
  const avatarUrl = student?.avatar_url || null;

  useEffect(() => {
    if (!uid) return;
    QRCode.toDataURL(uid, {
      width: 280,
      margin: 1,
      color: {
        dark: '#111827',
        light: '#FFFFFF',
      },
    }).then(setQrDataUrl).catch(() => {});
  }, [uid]);

  const handleDownloadQrOnly = () => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = 400;
    canvas.height = 480;

    // Outer Background
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.roundRect(0, 0, 400, 480, 24);
    ctx.fill();

    // Top subtle brand header
    ctx.fillStyle = '#1B4332';
    ctx.beginPath();
    ctx.roundRect(0, 0, 400, 50, [24, 24, 0, 0]);
    ctx.fill();

    ctx.fillStyle = '#D4AF37';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('ALIENISTA · ACS ATTENDANCE PASS', 200, 30);

    // Draw QR Code centered
    if (qrDataUrl) {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 60, 70, 280, 280);

        // Student UID Box
        ctx.fillStyle = '#F8FAF9';
        ctx.strokeStyle = '#E5EBE5';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(40, 360, 320, 90, 16);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#2D6A4F';
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('STUDENT UID', 200, 385);

        ctx.fillStyle = '#111827';
        ctx.font = 'bold 20px monospace';
        ctx.fillText(uid, 200, 412);

        ctx.fillStyle = '#6B7280';
        ctx.font = '12px sans-serif';
        ctx.fillText(`${fullName} · ${studentNumber}`, 200, 435);

        // Trigger Download
        const a = document.createElement('a');
        a.download = `${uid}_${fullName.replace(/\s+/g, '_')}_QR.png`;
        a.href = canvas.toDataURL('image/png');
        a.click();
      };
      img.src = qrDataUrl;
    }
  };

  return (
    <div className="bg-white border border-[#E5EBE5] rounded-3xl overflow-hidden shadow-md max-w-sm mx-auto flex flex-col justify-between">
      {/* Option A Top Header: Face Photo alongside Student Info */}
      <div className="bg-[#1B4332] p-4 border-b border-[#2D6A4F]/30">
        <div className="text-[10px] uppercase font-bold text-[#D4AF37] tracking-wider mb-2.5">
          Alienista · Campus Badge
        </div>
        <div className="flex items-center gap-3.5">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={fullName}
              className="w-14 h-14 rounded-2xl object-cover border-2 border-[#D4AF37] shadow-sm shrink-0"
            />
          ) : (
            <div className="w-14 h-14 rounded-2xl bg-[#2D6A4F] text-[#D1E7D7] border-2 border-[#D4AF37]/60 flex items-center justify-center font-extrabold text-base shrink-0">
              {student?.first_name?.[0] || fullName[0] || 'S'}
            </div>
          )}
          <div className="text-left min-w-0 flex-1">
            <div className="text-sm font-bold text-white truncate">{fullName}</div>
            <div className="text-xs text-[#D1E7D7] mt-0.5 truncate">{course} · {year}</div>
            <div className="text-[11px] text-[#D4AF37] font-semibold mt-0.5">{blockLabel} · {status}</div>
          </div>
        </div>
      </div>

      {/* Body: Prominent QR Code with UID for fast scanning */}
      <div className="p-6 flex flex-col items-center justify-center space-y-3">
        <div className="w-48 h-48 bg-[#F8FAF9] rounded-3xl p-3 flex items-center justify-center border border-[#E5EBE5] shadow-inner">
          {qrDataUrl ? (
            <img src={qrDataUrl} alt={uid} className="w-full h-full object-contain" />
          ) : (
            <div className="text-xs text-slate-400">Generating QR...</div>
          )}
        </div>

        <div className="text-center space-y-0.5">
          <div className="text-[10px] uppercase tracking-wider font-bold text-[#2D6A4F]">System UID</div>
          <div className="font-mono font-extrabold text-slate-900 text-sm tracking-wide">{uid}</div>
          <div className="font-mono text-slate-500 text-xs">{studentNumber}</div>
        </div>
      </div>

      {/* Card Actions: Single QR Code Download */}
      <div className="p-3.5 bg-[#F8FAF9] border-t border-[#E5EBE5] flex items-center justify-center">
        <button
          onClick={handleDownloadQrOnly}
          className="w-full py-2.5 bg-[#2D6A4F] hover:bg-[#1B4332] text-white font-bold rounded-2xl text-xs flex items-center justify-center gap-2 transition-colors shadow-xs"
        >
          <Download className="w-4 h-4" />
          <span>Download QR Code</span>
        </button>
      </div>
    </div>
  );
}
