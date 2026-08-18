import QRCode from "qrcode";
import { DownloadIcon } from "@/components/icons";

type GivingQrProps = {
  value: string;
  churchName: string;
};

function createQrArtwork(value: string) {
  const qr = QRCode.create(value, { errorCorrectionLevel: "M" });
  const quietZone = 4;
  const size = qr.modules.size + quietZone * 2;
  const cells: string[] = [];

  for (let row = 0; row < qr.modules.size; row += 1) {
    for (let column = 0; column < qr.modules.size; column += 1) {
      if (qr.modules.get(row, column)) {
        cells.push(`M${column + quietZone} ${row + quietZone}h1v1h-1z`);
      }
    }
  }

  const path = cells.join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><path d="${path}" fill="#122235"/></svg>`;

  return {
    downloadUrl: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
    path,
    size,
  };
}

export function GivingQr({ value, churchName }: GivingQrProps) {
  const artwork = createQrArtwork(value);

  return (
    <div>
      <div className="mx-auto w-full max-w-52 rounded-[24px] bg-white p-3 shadow-[0_10px_30px_rgba(18,34,53,.14)]">
        <svg
          aria-label={`Giving QR code for ${churchName}`}
          className="block size-full"
          role="img"
          shapeRendering="crispEdges"
          viewBox={`0 0 ${artwork.size} ${artwork.size}`}
        >
          <rect fill="#ffffff" height="100%" width="100%" />
          <path d={artwork.path} fill="#122235" />
        </svg>
      </div>
      <a
        className="focus-ring mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full border border-[var(--line)] bg-white px-4 py-3 text-[10px] font-bold text-[var(--ink)] transition hover:border-[var(--sage)]"
        download="harbour-grace-giving-qr.svg"
        href={artwork.downloadUrl}
      >
        <DownloadIcon size={15} /> Download SVG
      </a>
    </div>
  );
}
