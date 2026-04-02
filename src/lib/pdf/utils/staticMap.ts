/**
 * Static Map Generator for PDF Reports
 *
 * Fetches OpenStreetMap tiles and composites them into a single image
 * with turbine markers overlaid. Returns a PNG buffer suitable for
 * use with @react-pdf/renderer <Image>.
 */

import sharp from "sharp";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TurbineMarker {
  latitude: number;
  longitude: number;
  designation: string;
  status: "ACTIVE" | "INACTIVE" | "ARCHIVED" | string;
}

interface StaticMapOptions {
  /** Park center latitude */
  centerLat: number;
  /** Park center longitude */
  centerLng: number;
  /** Turbine locations */
  turbines: TurbineMarker[];
  /** Output image width in pixels */
  width?: number;
  /** Output image height in pixels */
  height?: number;
  /** Zoom level (default: auto-calculated from turbine spread) */
  zoom?: number;
}

// ---------------------------------------------------------------------------
// Tile math (Web Mercator / Slippy Map)
// ---------------------------------------------------------------------------

function lng2tile(lng: number, zoom: number): number {
  return ((lng + 180) / 360) * Math.pow(2, zoom);
}

function lat2tile(lat: number, zoom: number): number {
  return (
    ((1 -
      Math.log(
        Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)
      ) /
        Math.PI) /
      2) *
    Math.pow(2, zoom)
  );
}

function _tile2lng(x: number, zoom: number): number {
  return (x / Math.pow(2, zoom)) * 360 - 180;
}

function _tile2lat(y: number, zoom: number): number {
  const n = Math.PI - (2 * Math.PI * y) / Math.pow(2, zoom);
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}

/**
 * Convert lat/lng to pixel position relative to the top-left corner of the map image
 */
function latLng2px(
  lat: number,
  lng: number,
  zoom: number,
  centerLat: number,
  centerLng: number,
  imgWidth: number,
  imgHeight: number,
): { x: number; y: number } {
  const centerTileX = lng2tile(centerLng, zoom);
  const centerTileY = lat2tile(centerLat, zoom);
  const tileX = lng2tile(lng, zoom);
  const tileY = lat2tile(lat, zoom);

  const x = imgWidth / 2 + (tileX - centerTileX) * 256;
  const y = imgHeight / 2 + (tileY - centerTileY) * 256;

  return { x: Math.round(x), y: Math.round(y) };
}

/**
 * Calculate optimal zoom level to fit all turbines in the viewport
 */
function calculateZoom(
  turbines: TurbineMarker[],
  centerLat: number,
  centerLng: number,
  imgWidth: number,
  imgHeight: number,
): number {
  if (turbines.length <= 1) return 14;

  const lats = turbines.map((t) => t.latitude);
  const lngs = turbines.map((t) => t.longitude);
  const _latSpread = Math.max(...lats) - Math.min(...lats);
  const _lngSpread = Math.max(...lngs) - Math.min(...lngs);

  // Try zoom levels from high to low, pick first that fits
  for (let z = 17; z >= 5; z--) {
    const topLeft = latLng2px(
      Math.max(...lats),
      Math.min(...lngs),
      z,
      centerLat,
      centerLng,
      imgWidth,
      imgHeight,
    );
    const bottomRight = latLng2px(
      Math.min(...lats),
      Math.max(...lngs),
      z,
      centerLat,
      centerLng,
      imgWidth,
      imgHeight,
    );

    const pxWidth = Math.abs(bottomRight.x - topLeft.x);
    const pxHeight = Math.abs(bottomRight.y - topLeft.y);

    // 60px margin on each side
    if (pxWidth < imgWidth - 120 && pxHeight < imgHeight - 120) {
      return z;
    }
  }

  return 10;
}

// ---------------------------------------------------------------------------
// Tile fetching
// ---------------------------------------------------------------------------

const TILE_SIZE = 256;
const TILE_URL = "https://tile.openstreetmap.de/{z}/{x}/{y}.png";

async function fetchTile(z: number, x: number, y: number): Promise<Buffer> {
  const url = TILE_URL
    .replace("{z}", z.toString())
    .replace("{x}", x.toString())
    .replace("{y}", y.toString());

  const res = await fetch(url, {
    headers: {
      "User-Agent": "WindparkManager-PDFReport/1.0",
    },
  });

  if (!res.ok) {
    throw new Error(`Tile fetch failed: ${res.status} for ${url}`);
  }

  return Buffer.from(await res.arrayBuffer());
}

// ---------------------------------------------------------------------------
// Marker SVG
// ---------------------------------------------------------------------------

function createMarkerSvg(status: string): Buffer {
  const fillColor =
    status === "ACTIVE"
      ? "#22c55e"
      : status === "INACTIVE"
        ? "#eab308"
        : "#9ca3af";

  const svg = `<svg width="18" height="18" xmlns="http://www.w3.org/2000/svg">
    <circle cx="9" cy="9" r="8" fill="${fillColor}" stroke="white" stroke-width="2"/>
    <circle cx="9" cy="9" r="3" fill="white" fill-opacity="0.8"/>
  </svg>`;

  return Buffer.from(svg);
}

// ---------------------------------------------------------------------------
// Main function
// ---------------------------------------------------------------------------

/**
 * Generate a static map PNG with turbine markers
 * Returns a base64 data URI for direct use in react-pdf <Image>
 */
export async function generateStaticMapImage(
  options: StaticMapOptions,
): Promise<string> {
  const {
    centerLat,
    centerLng,
    turbines,
    width = 520,
    height = 340,
  } = options;

  const zoom = options.zoom ?? calculateZoom(turbines, centerLat, centerLng, width, height);

  // Calculate which tiles we need
  const centerTileX = lng2tile(centerLng, zoom);
  const centerTileY = lat2tile(centerLat, zoom);

  // How many tiles in each direction from center
  const tilesX = Math.ceil(width / TILE_SIZE / 2) + 1;
  const tilesY = Math.ceil(height / TILE_SIZE / 2) + 1;

  const startTileX = Math.floor(centerTileX) - tilesX + 1;
  const startTileY = Math.floor(centerTileY) - tilesY + 1;
  const endTileX = Math.floor(centerTileX) + tilesX;
  const endTileY = Math.floor(centerTileY) + tilesY;

  const totalTilesW = (endTileX - startTileX + 1) * TILE_SIZE;
  const totalTilesH = (endTileY - startTileY + 1) * TILE_SIZE;

  // Fetch all tiles in parallel
  const tilePromises: Array<{
    tx: number;
    ty: number;
    data: Promise<Buffer>;
  }> = [];

  const maxTile = Math.pow(2, zoom);
  for (let tx = startTileX; tx <= endTileX; tx++) {
    for (let ty = startTileY; ty <= endTileY; ty++) {
      // Wrap tile X for globe
      const wrappedTx = ((tx % maxTile) + maxTile) % maxTile;
      // Skip out-of-range Y tiles
      if (ty < 0 || ty >= maxTile) continue;

      tilePromises.push({
        tx,
        ty,
        data: fetchTile(zoom, wrappedTx, ty),
      });
    }
  }

  // Composite all tiles into one large image
  const composites: sharp.OverlayOptions[] = [];

  for (const tp of tilePromises) {
    try {
      const tileData = await tp.data;
      const left = (tp.tx - startTileX) * TILE_SIZE;
      const top = (tp.ty - startTileY) * TILE_SIZE;
      composites.push({ input: tileData, left, top });
    } catch {
      // Skip failed tiles (graceful degradation)
    }
  }

  // Create canvas and composite tiles
  const composite = sharp({
    create: {
      width: totalTilesW,
      height: totalTilesH,
      channels: 4,
      background: { r: 240, g: 240, b: 240, alpha: 1 },
    },
  })
    .composite(composites)
    .png();

  // Calculate crop offset to center the map
  const offsetX = Math.round(
    (centerTileX - startTileX) * TILE_SIZE - width / 2,
  );
  const offsetY = Math.round(
    (centerTileY - startTileY) * TILE_SIZE - height / 2,
  );

  // Crop to desired size
  let cropped = sharp(await composite.toBuffer()).extract({
    left: Math.max(0, offsetX),
    top: Math.max(0, offsetY),
    width: Math.min(width, totalTilesW - Math.max(0, offsetX)),
    height: Math.min(height, totalTilesH - Math.max(0, offsetY)),
  });

  // Resize to exact target size if needed
  const croppedMeta = await sharp(await cropped.toBuffer()).metadata();
  if (croppedMeta.width !== width || croppedMeta.height !== height) {
    cropped = sharp(await cropped.toBuffer()).resize(width, height, {
      fit: "cover",
      position: "center",
    });
  }

  // Add turbine markers
  const markerComposites: sharp.OverlayOptions[] = [];
  for (const turbine of turbines) {
    const { x, y } = latLng2px(
      turbine.latitude,
      turbine.longitude,
      zoom,
      centerLat,
      centerLng,
      width,
      height,
    );

    // Only add if within bounds
    if (x >= 0 && x < width && y >= 0 && y < height) {
      markerComposites.push({
        input: createMarkerSvg(turbine.status),
        left: Math.max(0, x - 9),
        top: Math.max(0, y - 9),
      });
    }
  }

  if (markerComposites.length > 0) {
    cropped = sharp(await cropped.toBuffer()).composite(markerComposites);
  }

  // Add attribution text
  const attrSvg = Buffer.from(`<svg width="${width}" height="14" xmlns="http://www.w3.org/2000/svg">
    <rect x="${width - 180}" y="0" width="180" height="14" rx="2" fill="white" fill-opacity="0.7"/>
    <text x="${width - 175}" y="10" font-size="8" fill="#666" font-family="sans-serif">© OpenStreetMap contributors</text>
  </svg>`);

  const finalBuffer = await sharp(await cropped.toBuffer())
    .composite([{ input: attrSvg, left: 0, top: height - 14, }])
    .png()
    .toBuffer();

  // Return as data URI for react-pdf
  return `data:image/png;base64,${finalBuffer.toString("base64")}`;
}
