/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Augment the Window interface for Leaflet global.
 * leaflet-draw expects `window.L` to be set globally.
 */
declare global {
  interface Window {
    L?: any; // Leaflet namespace — typed as any because leaflet-draw accesses internal APIs
  }
}
export {};
