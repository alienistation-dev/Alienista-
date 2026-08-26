import QRCode from 'qrcode';
import { BADGE_SPEC, serializeBadgePayload } from '@/lib/badges/badge';
import type { BadgeData } from '@/lib/types/models';

function drawRoundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
  context.fill();
  context.stroke();
}

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = source;
  });
}

export async function renderBadgeToDataUrl(badge: BadgeData): Promise<string> {
  const { width, height, qr_size: qrSize, colors } = BADGE_SPEC;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas rendering is unavailable.');

  context.fillStyle = colors.surface;
  context.strokeStyle = colors.border;
  context.lineWidth = 2;
  drawRoundedRect(context, 1, 1, width - 2, height - 2, 22);

  context.fillStyle = colors.brand;
  context.strokeStyle = colors.brand;
  drawRoundedRect(context, 1, 1, width - 2, 146, 22);
  context.fillRect(1, 124, width - 2, 24);

  context.textAlign = 'left';
  context.fillStyle = colors.accent;
  context.font = '700 13px Arial, sans-serif';
  context.fillText('ALIENISTA · ACS CAMPUS BADGE', 24, 32);

  if (badge.avatar_url) {
    try {
      const avatar = await loadImage(badge.avatar_url);
      context.save();
      context.beginPath();
      context.roundRect(24, 52, 72, 72, 14);
      context.clip();
      context.drawImage(avatar, 24, 52, 72, 72);
      context.restore();
      context.strokeStyle = colors.accent;
      context.lineWidth = 3;
      context.strokeRect(24, 52, 72, 72);
    } catch {
      // Initials are rendered below when the remote image cannot be loaded.
    }
  }

  if (!badge.avatar_url) {
    context.fillStyle = colors.brandSecondary;
    context.strokeStyle = colors.accent;
    context.lineWidth = 3;
    drawRoundedRect(context, 24, 52, 72, 72, 14);
    context.fillStyle = '#FFFFFF';
    context.font = '700 28px Arial, sans-serif';
    context.textAlign = 'center';
    context.fillText(badge.full_name.charAt(0) || 'S', 60, 98);
  }

  context.textAlign = 'left';
  context.fillStyle = '#FFFFFF';
  context.font = '700 18px Arial, sans-serif';
  context.fillText(badge.full_name.slice(0, 28), 116, 70);
  context.fillStyle = '#D1E7D7';
  context.font = '13px Arial, sans-serif';
  context.fillText(`${badge.course} · ${badge.year}`.slice(0, 37), 116, 95);
  context.fillStyle = colors.accent;
  context.font = '700 12px Arial, sans-serif';
  context.fillText(`${badge.block_label} · ${badge.status}`, 116, 118);

  const qrDataUrl = await QRCode.toDataURL(serializeBadgePayload(badge), {
    width: qrSize,
    margin: 1,
    color: { dark: colors.qr_dark, light: colors.qr_light },
    errorCorrectionLevel: 'M',
  });
  const qrImage = await loadImage(qrDataUrl);
  context.drawImage(qrImage, 60, 172, qrSize, qrSize);

  context.fillStyle = colors.mutedSurface;
  context.strokeStyle = colors.border;
  context.lineWidth = 1.5;
  drawRoundedRect(context, 36, 476, 328, 126, 16);
  context.textAlign = 'center';
  context.fillStyle = colors.brandSecondary;
  context.font = '700 11px Arial, sans-serif';
  context.fillText('SYSTEM UID', 200, 504);
  context.fillStyle = colors.text;
  context.font = '700 21px Consolas, monospace';
  context.fillText(badge.uid, 200, 536);
  context.fillStyle = colors.mutedText;
  context.font = '13px Consolas, monospace';
  context.fillText(badge.student_number, 200, 562);
  context.font = '12px Arial, sans-serif';
  context.fillText(`${badge.block_label} · ${badge.status}`, 200, 586);

  return canvas.toDataURL('image/png');
}
