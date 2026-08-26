/**
 * Compresses and resizes an avatar image client-side before upload.
 * Validates strictly: <= 2MB, strictly image (no GIF).
 * Scales down to max 500x500 maintaining aspect ratio at 85% quality (~25-40KB).
 */
export async function compressAvatarImage(file: File): Promise<File> {
  const MAX_RAW_SIZE = 2 * 1024 * 1024; // 2MB

  if (file.size > MAX_RAW_SIZE) {
    throw new Error('Image size exceeds the 2MB limit. Please choose a smaller photo.');
  }

  const type = file.type.toLowerCase();
  if (type === 'image/gif') {
    throw new Error('GIF images are not allowed. Please upload a JPG, PNG, or WebP photo.');
  }

  const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  if (!validTypes.includes(type)) {
    throw new Error('Invalid file format. Please upload a JPG, PNG, or WebP photo.');
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read image file.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Invalid image file content.'));
      img.onload = () => {
        const MAX_DIM = 500;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_DIM) {
            height = Math.round((height * MAX_DIM) / width);
            width = MAX_DIM;
          }
        } else {
          if (height > MAX_DIM) {
            width = Math.round((width * MAX_DIM) / height);
            height = MAX_DIM;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          // Fallback to original file if canvas context is unavailable
          return resolve(file);
        }

        // Fill background white for transparent PNGs
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              return resolve(file);
            }
            const cleanName = file.name.replace(/\.[^/.]+$/, '') + '.webp';
            const compressedFile = new File([blob], cleanName, { type: 'image/webp' });
            resolve(compressedFile);
          },
          'image/webp',
          0.85
        );
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}
