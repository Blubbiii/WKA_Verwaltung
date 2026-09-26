import { describe, expect, it } from "vitest";
import { videoQuelle } from "./video-quelle";

describe("Showcase-Video: was die Startseite abspielt", () => {
  it("eine hochgeladene Datei (S3-Schlüssel) läuft über die öffentliche Route", () => {
    const quelle = videoQuelle("tenants/abc/marketing/1727-demo.mp4");
    expect(quelle).toMatch(/^\/api\/marketing\/video\?v=/);
    // The version changes with the key, so a new upload is not served from cache.
    expect(quelle).not.toBe(videoQuelle("tenants/abc/marketing/1800-demo.mp4"));
  });

  it("eine eingetragene Adresse bleibt, wie sie ist", () => {
    expect(videoQuelle("https://cdn.example.org/film.mp4")).toBe("https://cdn.example.org/film.mp4");
  });

  it("nichts eingetragen: kein Video", () => {
    expect(videoQuelle("")).toBeUndefined();
    expect(videoQuelle(undefined)).toBeUndefined();
  });
});
