export function openBadgePrintWindow(): Window | null {
  const printWindow = window.open('', '_blank');
  if (printWindow) printWindow.opener = null;
  return printWindow;
}

export function buildBadgePrintLoadingDocument(): string {
  return '<!doctype html><html><head><title>Preparing Alienista badges</title></head><body><p>Preparing badges for printing...</p></body></html>';
}

export function buildBadgePrintDocument(imageUrls: readonly string[]): string {
  const images = imageUrls
    .map((url, index) => `<img src="${url}" alt="Badge ${index + 1}">`)
    .join('');

  return `<!doctype html><html><head><title>Alienista badges</title><style>
    @page { size: A4 portrait; margin: 10mm; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Arial, sans-serif; }
    main { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8mm; }
    img { width: 100%; height: auto; break-inside: avoid; border: 1px solid #E5EBE5; }
  </style></head><body><main>${images}</main><script>
    window.addEventListener('load', function () {
      window.focus();
      window.print();
    });
  </script></body></html>`;
}
