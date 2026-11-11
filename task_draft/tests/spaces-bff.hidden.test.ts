// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/server/session", () => ({
  readToken: async () => "test-token",
  clearSession: async () => {},
  jwtSubject: () => "1",
}));
vi.mock("@/lib/log/server", () => ({ logEvent: () => {} }));

import { NextRequest } from "next/server";
import { POST, PUT } from "@/app/api/proxy/[...path]/route";
import { resolveBackendPath } from "@/lib/server/proxy-path";

beforeEach(() => { process.env.BACKEND_URL = "http://backend.test"; });
afterEach(() => { vi.unstubAllGlobals(); });

// Bytes that are not valid UTF-8 (0x80+, 0xFF, 0x00) — they are destroyed by any text round-trip.
const BINARY = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0xff, 0xfe, 0xc3, 0x28, 0x80, 0x81, 0xe2, 0x82, 0x00, 0x7f]);

function multipart(boundary: string) {
  const head = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="a.png"\r\nContent-Type: image/png\r\n\r\n`, "latin1");
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`, "latin1");
  return Buffer.concat([head, Buffer.from(BINARY), tail]);
}

async function bytesOf(body: unknown): Promise<Buffer> {
  if (body === undefined || body === null) return Buffer.alloc(0);
  return Buffer.from(await new Response(body as BodyInit).arrayBuffer());
}

function install() {
  const seen: { url: string; method: string; headers: Record<string, string>; body: Buffer }[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string | URL, init?: RequestInit) => {
    const headers: Record<string, string> = {};
    new Headers(init?.headers ?? {}).forEach((v, k) => { headers[k.toLowerCase()] = v; });
    seen.push({ url: String(url), method: (init?.method ?? "GET").toUpperCase(), headers, body: await bytesOf(init?.body) });
    return new Response(JSON.stringify({ success: true, data: { url: "https://cdn.test/x.png" } }), { status: 200, headers: { "content-type": "application/json" } });
  }));
  return seen;
}

const ctx = (...path: string[]) => ({ params: Promise.resolve({ path }) });

describe("BFF allow-list", () => {
  it("allows the spaces endpoints the canvas needs", () => {
    expect(resolveBackendPath(["api", "spaces"])).toBe("/api/spaces");
    expect(resolveBackendPath(["api", "spaces", "space"])).toBe("/api/spaces/space");
    expect(resolveBackendPath(["api", "spaces", "space", "5"])).toBe("/api/spaces/space/5");
    expect(resolveBackendPath(["api", "spaces", "space", "5", "graph"])).toBe("/api/spaces/space/5/graph");
    expect(resolveBackendPath(["api", "spaces", "image", "upload-image"])).toBe("/api/spaces/image/upload-image");
  });

  it("still rejects everything else, including look-alikes and traversal", () => {
    expect(resolveBackendPath(["api", "spacesX"])).toBeNull();
    expect(resolveBackendPath(["api", "spaces-list"])).toBeNull();
    expect(resolveBackendPath(["api", "auth", "login"])).toBeNull();
    expect(resolveBackendPath(["api", "spaces", "..", "auth", "login"])).toBeNull();
    expect(resolveBackendPath(["spaces"])).toBeNull();
    expect(resolveBackendPath(["admin", "stores", "list"])).toBe("/admin/stores/list");
  });
});

describe("BFF forwards request bodies unchanged", () => {
  it("passes a multipart image upload to the backend byte for byte, with its boundary", async () => {
    const seen = install();
    const boundary = "----testboundary123";
    const payload = multipart(boundary);
    const req = new NextRequest("http://localhost/api/proxy/api/spaces/image/upload-image", {
      method: "POST",
      body: payload,
      headers: { "content-type": `multipart/form-data; boundary=${boundary}`, "content-length": String(payload.length) },
    });
    const res = await POST(req, ctx("api", "spaces", "image", "upload-image"));
    expect(res.status).toBe(200);
    expect(seen).toHaveLength(1);
    expect(seen[0].url).toBe("http://backend.test/api/spaces/image/upload-image");
    expect(seen[0].method).toBe("POST");
    expect(seen[0].headers["content-type"]).toBe(`multipart/form-data; boundary=${boundary}`);
    expect(seen[0].headers.authorization).toBe("Bearer test-token");
    expect(seen[0].body.equals(payload)).toBe(true);
  });

  it("still forwards a JSON body (graph save) intact", async () => {
    const seen = install();
    const json = JSON.stringify({ nodes: [{ id: "upload-1", note: "Tiếng Việt có dấu — ✓" }], edges: [] });
    const req = new NextRequest("http://localhost/api/proxy/api/spaces/space/5/graph", {
      method: "PUT",
      body: json,
      headers: { "content-type": "application/json" },
    });
    const res = await PUT(req, ctx("api", "spaces", "space", "5", "graph"));
    expect(res.status).toBe(200);
    expect(seen[0].url).toBe("http://backend.test/api/spaces/space/5/graph");
    expect(seen[0].method).toBe("PUT");
    expect(seen[0].body.toString("utf8")).toBe(json);
  });
});
