import { act } from "@testing-library/react";
import { vi } from "vitest";
import "./spaces-list.helpers"; // jsdom shims (matchMedia, observers) shared with the list tests

/**
 * Harness for the hidden canvas tests: React Flow needs a few DOM measurements jsdom does not
 * provide, and the page needs a fake BFF that understands the space, graph and upload endpoints.
 */

// ---- React Flow shims -------------------------------------------------------------------------
const px = (v: string) => (v.endsWith("px") ? parseFloat(v) : NaN);
if (typeof window !== "undefined") {
  class RO {
    private cb: ResizeObserverCallback;
    constructor(cb: ResizeObserverCallback) { this.cb = cb; }
    observe(target: Element) {
      this.cb([{ target, contentRect: { width: 0, height: 0 } } as unknown as ResizeObserverEntry], this as unknown as ResizeObserver);
    }
    unobserve() {}
    disconnect() {}
  }
  (window as unknown as { ResizeObserver: unknown }).ResizeObserver = RO;
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = RO;
  (window as unknown as { DOMMatrixReadOnly: unknown }).DOMMatrixReadOnly = class { m22 = 1; };
  (globalThis as unknown as { DOMMatrixReadOnly: unknown }).DOMMatrixReadOnly = (window as unknown as { DOMMatrixReadOnly: unknown }).DOMMatrixReadOnly;
  // A node's measured size follows the size React Flow gives its wrapper; everything else is "large".
  Object.defineProperties(HTMLElement.prototype, {
    offsetWidth: { configurable: true, get() { const w = px((this as HTMLElement).style.width); return Number.isNaN(w) ? 800 : w; } },
    offsetHeight: { configurable: true, get() { const h = px((this as HTMLElement).style.height); return Number.isNaN(h) ? 600 : h; } },
  });
  (SVGElement.prototype as unknown as { getBBox: () => unknown }).getBBox = () => ({ x: 0, y: 0, width: 0, height: 0 });
  let blob = 0;
  URL.createObjectURL = () => `blob:mock-${++blob}`;
  URL.revokeObjectURL = () => {};
}

// ---- Fake backend -----------------------------------------------------------------------------
export interface Graph { nodes?: unknown[]; edges?: unknown[] }
export interface UploadReply { status?: number; body: unknown }
export interface CanvasBackend {
  space?: (id: string) => unknown | Promise<unknown>;
  upload?: (file: File) => UploadReply | Promise<UploadReply>;
}
export interface CanvasCall {
  method: string;
  path: string;
  json: unknown;
  form: FormData | null;
  headers: Record<string, string>;
}

export const canvasCalls: CanvasCall[] = [];
export const puts = () => canvasCalls.filter((c) => c.method === "PUT");
export const lastPut = () => puts().at(-1)?.json as { nodes: Array<Record<string, any>>; edges: unknown[] } | undefined;

export function fail(status: number, message: string) {
  return { __fail: true as const, status, message };
}

export function installCanvasBackend(b: CanvasBackend) {
  canvasCalls.length = 0;
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, "http://localhost");
    const method = (init?.method ?? "GET").toUpperCase();
    const path = url.pathname.replace(/\/+$/, "");
    const headers: Record<string, string> = {};
    new Headers(init?.headers ?? {}).forEach((v, k) => { headers[k.toLowerCase()] = v; });
    const form = typeof FormData !== "undefined" && init?.body instanceof FormData ? init.body : null;
    let json: unknown = null;
    if (typeof init?.body === "string") { try { json = JSON.parse(init.body); } catch { /* not json */ } }
    canvasCalls.push({ method, path, json, form, headers });

    const envelope = (data: unknown) =>
      new Response(JSON.stringify({ success: true, data }), { status: 200, headers: { "content-type": "application/json" } });
    const error = (status: number, message: string) =>
      new Response(JSON.stringify({ success: false, message, data: null }), { status, headers: { "content-type": "application/json" } });
    const reply = (data: unknown) =>
      data && typeof data === "object" && (data as { __fail?: boolean }).__fail
        ? error((data as { status: number }).status, (data as { message: string }).message)
        : envelope(data);

    let m = /^\/api\/proxy\/api\/spaces\/space\/([^/]+)$/.exec(path);
    if (m && method === "GET") return reply(await (b.space ? b.space(m[1]) : { space_id: Number(m[1]), name: null, graph: null }));
    m = /^\/api\/proxy\/api\/spaces\/space\/([^/]+)\/graph$/.exec(path);
    if (m && method === "PUT") return envelope({ saved: true });
    if (path === "/api/proxy/api/spaces/image/upload-image" && method === "POST") {
      const file = form?.get("image");
      if (!(file instanceof File)) return error(422, "image missing");
      const r = await (b.upload ? b.upload(file) : { body: { url: "https://cdn.test/original.png", thumb_url: "https://cdn.test/thumb.png", width: 1200, height: 600 } });
      return r.status && r.status >= 400
        ? error(r.status, String((r.body as { message?: string })?.message ?? "upload failed"))
        : envelope(r.body);
    }
    return error(404, `unexpected ${method} ${path}`);
  }));
}

// ---- Interaction helpers ----------------------------------------------------------------------
/** Current canvas zoom, read from the viewport transform (an implementation may or may not call fitView). */
export function zoomOf(el: HTMLElement): number {
  const vp = el.closest(".react-flow")?.querySelector<HTMLElement>(".react-flow__viewport");
  const m = /scale\(([\d.]+)\)/.exec(vp?.style.transform ?? "");
  return m ? parseFloat(m[1]) : 1;
}

/** Drags a React Flow resize handle by (dx, dy) in *canvas* pixels, whatever the current zoom is. */
export function dragHandle(handle: HTMLElement, dx: number, dy: number) {
  const z = zoomOf(handle);
  const from = { x: 400, y: 300 };
  const fire = (target: EventTarget, type: string, x: number, y: number) => {
    const ev = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, buttons: 1 });
    Object.defineProperty(ev, "view", { value: window });
    act(() => { target.dispatchEvent(ev); });
  };
  fire(handle, "mousedown", from.x, from.y);
  fire(window, "mousemove", from.x + dx * z, from.y + dy * z);
  fire(window, "mouseup", from.x + dx * z, from.y + dy * z);
}

export const pngFile = (name = "photo.png") => new File([new Uint8Array([137, 80, 78, 71, 0, 255, 254, 1])], name, { type: "image/png" });

export const uploadNode = (id: string, files: unknown[] = [], extra: Record<string, unknown> = {}) => ({
  id,
  type: "upload",
  position: { x: 40, y: 40 },
  data: { kind: "upload", label: `Upload ${id}`, files, inputs: [], outputs: [{ id: "image-out", kind: "image" }] },
  ...extra,
});
export const savedFile = (id: string, width?: number, height?: number, url = `https://cdn.test/${id}.png`, thumbUrl?: string) => ({
  id, url, preview: url, alt: `${id}.png`, uploading: false,
  ...(thumbUrl ? { thumbUrl } : {}), ...(width ? { width } : {}), ...(height ? { height } : {}),
});
