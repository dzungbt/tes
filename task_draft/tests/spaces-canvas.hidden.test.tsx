// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderPage } from "./spaces-list.helpers";
import {
  canvasCalls, dragHandle, fail, installCanvasBackend, lastPut, pngFile, puts, savedFile, uploadNode,
} from "./spaces-canvas.helpers";

const nav = vi.hoisted(() => ({ search: "space=5" }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/spaces",
  useSearchParams: () => new URLSearchParams(nav.search),
}));

import Page from "@/app/(app)/spaces/page";
import { t } from "@/i18n";

const VI = {
  add: "Thêm node tải lên",
  drop: "Thả ảnh vào đây hoặc bấm để tải lên",
  failed: "Tải ảnh lên máy chủ thất bại.",
  untitled: "Không gian chưa đặt tên",
};

const nodes = (c: HTMLElement) => Array.from(c.querySelectorAll<HTMLElement>(".react-flow__node"));
const byId = (c: HTMLElement, id: string) => c.querySelector<HTMLElement>(`.react-flow__node[data-id="${id}"]`);
const size = (el: HTMLElement) => ({ w: parseFloat(el.style.width), h: parseFloat(el.style.height) });
const ratio = (el: HTMLElement) => { const s = size(el); return s.w / s.h; };
const sleep = (ms: number) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });
const fileInput = (el: HTMLElement) => el.querySelector<HTMLInputElement>('input[type="file"]')!;
const pick = (el: HTMLElement, f = pngFile()) => fireEvent.change(fileInput(el), { target: { files: [f] } });
const withSpace = (graph: unknown, name: string | null = "Moodboard") => ({ space_id: 5, name, graph });

beforeEach(() => { nav.search = "space=5"; });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("Loading a space", () => {
  it("fetches the space through the BFF and shows its name and saved upload nodes", async () => {
    installCanvasBackend({
      space: () => withSpace({ nodes: [
        uploadNode("upload-1", [savedFile("a", 800, 400, "https://cdn.test/a.png", "https://cdn.test/a-thumb.png")]),
        uploadNode("upload-2"),
      ] }),
    });
    const { container } = renderPage(Page);
    expect(await screen.findByText("Moodboard")).toBeTruthy();
    expect(canvasCalls[0]).toMatchObject({ method: "GET", path: "/api/proxy/api/spaces/space/5" });
    await waitFor(() => expect(nodes(container)).toHaveLength(2));
    // the display copy (thumbnail) is what the node draws, not the original
    expect(byId(container, "upload-1")!.querySelector("img")?.getAttribute("src")).toBe("https://cdn.test/a-thumb.png");
    expect(within1(byId(container, "upload-2")!, VI.drop)).toBe(true);
  });

  it("falls back to the untitled name", async () => {
    installCanvasBackend({ space: () => withSpace({ nodes: [] }, "  ") });
    renderPage(Page);
    expect(await screen.findByText(VI.untitled)).toBeTruthy();
  });

  it("shows the error and a retry button when the space cannot be loaded", async () => {
    let n = 0;
    installCanvasBackend({ space: () => (++n === 1 ? fail(500, "Boom: backend down") : withSpace({ nodes: [] })) });
    renderPage(Page);
    expect(await screen.findByText(/Boom: backend down/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: t.common.retry }));
    expect(await screen.findByText("Moodboard")).toBeTruthy();
  });

  it("does not save anything just because the space was loaded", async () => {
    installCanvasBackend({ space: () => withSpace({ nodes: [uploadNode("upload-1", [savedFile("a", 800, 400)])] }) });
    const { container } = renderPage(Page);
    await waitFor(() => expect(nodes(container)).toHaveLength(1));
    await sleep(2500);
    expect(puts()).toHaveLength(0);
  });
});

describe("Upload node frame", () => {
  it("fits a saved node without its own size to the image's aspect ratio, 320px on the long side", async () => {
    installCanvasBackend({
      space: () => withSpace({ nodes: [
        uploadNode("upload-1", [savedFile("wide", 1000, 500)]),
        uploadNode("upload-2", [savedFile("tall", 300, 900)]),
      ] }),
    });
    const { container } = renderPage(Page);
    await waitFor(() => expect(nodes(container)).toHaveLength(2));
    expect(size(byId(container, "upload-1")!)).toEqual({ w: 320, h: 160 });
    expect(size(byId(container, "upload-2")!)).toEqual({ w: 107, h: 320 });
  });

  it("keeps a size the user already saved", async () => {
    installCanvasBackend({ space: () => withSpace({ nodes: [uploadNode("upload-1", [savedFile("a", 2000, 1000)], { width: 480, height: 240 })] }) });
    const { container } = renderPage(Page);
    await waitFor(() => expect(nodes(container)).toHaveLength(1));
    expect(size(byId(container, "upload-1")!)).toEqual({ w: 480, h: 240 });
  });
});

describe("Add upload node", () => {
  it("adds an empty node whose id continues past the highest saved number", async () => {
    installCanvasBackend({ space: () => withSpace({ nodes: [uploadNode("upload-3"), { id: "text-7", type: "text", position: { x: 0, y: 0 }, data: { kind: "text" } }] }) });
    const { container } = renderPage(Page);
    await screen.findByText("Moodboard");
    fireEvent.click(screen.getByRole("button", { name: new RegExp(VI.add) }));
    await waitFor(() => expect(byId(container, "upload-8")).toBeTruthy());
    expect(within1(byId(container, "upload-8")!, VI.drop)).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: new RegExp(VI.add) }));
    await waitFor(() => expect(byId(container, "upload-9")).toBeTruthy());
  });
});

describe("Uploading an image", () => {
  it("posts the file as multipart through the BFF, previews it at once, then fits the frame to the image", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    installCanvasBackend({
      space: () => withSpace({ nodes: [uploadNode("upload-1")] }),
      upload: async () => { await gate; return { body: { url: "https://cdn.test/o.png", thumb_url: "https://cdn.test/t.png", width: 1200, height: 600 } }; },
    });
    const { container } = renderPage(Page);
    await waitFor(() => expect(nodes(container)).toHaveLength(1));
    const el = byId(container, "upload-1")!;
    pick(el, pngFile("holiday.png"));

    // local preview while the request is in flight
    await waitFor(() => expect(el.querySelector("img")?.getAttribute("src")).toMatch(/^blob:/));
    const call = canvasCalls.find((c) => c.method === "POST")!;
    expect(call.path).toBe("/api/proxy/api/spaces/image/upload-image");
    expect(call.form).toBeInstanceOf(FormData);
    const sent = call.form!.get("image") as File;
    expect(sent.name).toBe("holiday.png");
    expect(sent.size).toBe(8);
    // the browser must set the multipart boundary itself
    expect(call.headers["content-type"]).toBeUndefined();

    release();
    await waitFor(() => expect(el.querySelector("img")?.getAttribute("src")).toBe("https://cdn.test/t.png"));
    expect(size(el)).toEqual({ w: 320, h: 160 });
  });

  it("gives a portrait image a portrait frame", async () => {
    installCanvasBackend({
      space: () => withSpace({ nodes: [uploadNode("upload-1")] }),
      upload: () => ({ body: { url: "https://cdn.test/o.png", thumb_url: null, width: 600, height: 1200 } }),
    });
    const { container } = renderPage(Page);
    await waitFor(() => expect(nodes(container)).toHaveLength(1));
    const el = byId(container, "upload-1")!;
    pick(el);
    await waitFor(() => expect(el.querySelector("img")?.getAttribute("src")).toBe("https://cdn.test/o.png"));
    expect(size(el)).toEqual({ w: 160, h: 320 });
  });

  it.each([
    ["a 200 reply without a url", { body: { url: null } }],
    ["an HTTP error", { status: 500, body: { message: "storage down" } }],
  ])("returns the node to its empty state and tells the user when the server answers with %s", async (_n, reply) => {
    installCanvasBackend({ space: () => withSpace({ nodes: [uploadNode("upload-1")] }), upload: () => reply });
    const { container } = renderPage(Page);
    await waitFor(() => expect(nodes(container)).toHaveLength(1));
    const el = byId(container, "upload-1")!;
    pick(el);
    expect(await screen.findByText(VI.failed)).toBeTruthy();
    await waitFor(() => expect(el.querySelector("img")).toBeNull());
    expect(within1(el, VI.drop)).toBe(true);
  });
});

describe("Resizing", () => {
  async function selectedWide() {
    installCanvasBackend({ space: () => withSpace({ nodes: [uploadNode("upload-1", [savedFile("w", 1200, 600)])] }) });
    const view = renderPage(Page);
    await waitFor(() => expect(nodes(view.container)).toHaveLength(1));
    const el = byId(view.container, "upload-1")!;
    fireEvent.click(el);
    const handle = await waitFor(() => {
      const h = el.querySelector<HTMLElement>(".react-flow__resize-control.handle.bottom.right");
      if (!h) throw new Error("no corner handle yet");
      return h;
    });
    return { ...view, el, handle };
  }

  it("keeps the frame's aspect ratio when a corner is dragged bigger, whatever the pointer does on the other axis", async () => {
    const { el, handle } = await selectedWide();
    dragHandle(handle, 160, 12);
    await waitFor(() => expect(size(el).w).toBeGreaterThan(400));
    expect(ratio(el)).toBeCloseTo(2, 1);
    expect(size(el).w).toBeCloseTo(480, -1);
  });

  it("keeps the aspect ratio when dragged smaller", async () => {
    const { el, handle } = await selectedWide();
    dragHandle(handle, -120, -60);
    await waitFor(() => expect(size(el).w).toBeLessThan(250));
    expect(ratio(el)).toBeCloseTo(2, 1);
  });

  it("saves the resized frame but never changes the stored pixel size of the image", async () => {
    const { el, handle } = await selectedWide();
    dragHandle(handle, 200, 0);
    await waitFor(() => expect(size(el).w).toBeGreaterThan(450));
    await waitFor(() => expect(puts().length).toBeGreaterThan(0), { timeout: 4000 });
    const saved = lastPut()!.nodes.find((n) => n.id === "upload-1")!;
    expect(saved.width / saved.height).toBeCloseTo(2, 1);
    expect(saved.width).toBeGreaterThan(450);
    expect(saved.data.files[0]).toMatchObject({ width: 1200, height: 600 });
  });
});

describe("Saving the graph", () => {
  it("debounces one PUT after an upload, with the uploaded file at its natural size and nothing temporary", async () => {
    installCanvasBackend({
      space: () => withSpace({ nodes: [uploadNode("upload-1")] }),
      upload: () => ({ body: { url: "https://cdn.test/o.png", thumb_url: "https://cdn.test/t.png", width: 1200, height: 600 } }),
    });
    const { container } = renderPage(Page);
    await waitFor(() => expect(nodes(container)).toHaveLength(1));
    pick(byId(container, "upload-1")!);
    await waitFor(() => expect(puts().length).toBeGreaterThan(0), { timeout: 4000 });
    await sleep(1500);
    expect(puts()).toHaveLength(1);
    expect(puts()[0].path).toBe("/api/proxy/api/spaces/space/5/graph");
    const saved = lastPut()!.nodes.find((n) => n.id === "upload-1")!;
    expect(saved.type).toBe("upload");
    expect(saved.data.files).toHaveLength(1);
    expect(saved.data.files[0]).toMatchObject({ url: "https://cdn.test/o.png", width: 1200, height: 600, uploading: false });
    expect(JSON.stringify(lastPut())).not.toContain("blob:");
    expect(saved.width / saved.height).toBeCloseTo(2, 2);
  });

  it("never saves a node whose upload failed or is still running", async () => {
    installCanvasBackend({
      space: () => withSpace({ nodes: [uploadNode("upload-1")] }),
      upload: () => ({ body: { url: null } }),
    });
    const { container } = renderPage(Page);
    await waitFor(() => expect(nodes(container)).toHaveLength(1));
    pick(byId(container, "upload-1")!);
    await screen.findByText(VI.failed);
    await sleep(2500);
    if (puts().length) expect(lastPut()!.nodes.find((n) => n.id === "upload-1")!.data.files).toEqual([]);
  });

  it("sends nodes of other kinds and all edges back exactly as they were loaded", async () => {
    const text = { id: "text-1", type: "text", position: { x: 5, y: 6 }, width: 340, height: 260, style: { opacity: 0.5 }, data: { kind: "text", label: "Brief", text: "hello", extra: { deep: [1, 2, 3] } } };
    const gen = { id: "image-generator-2", type: "image-generator", position: { x: 500, y: 6 }, data: { kind: "image-generator", src: "https://cdn.test/g.png" } };
    const edge = { id: "e1", source: "text-1", target: "image-generator-2", sourceHandle: null, targetHandle: "prompt", type: "media", data: { k: 1 } };
    installCanvasBackend({ space: () => withSpace({ nodes: [uploadNode("upload-3"), text, gen], edges: [edge] }) });
    const { container } = renderPage(Page);
    await screen.findByText("Moodboard");
    // only upload nodes are drawn
    await waitFor(() => expect(nodes(container)).toHaveLength(1));
    fireEvent.click(screen.getByRole("button", { name: new RegExp(VI.add) }));
    await waitFor(() => expect(puts().length).toBeGreaterThan(0), { timeout: 4000 });
    const body = lastPut()!;
    expect(body.nodes.find((n) => n.id === "text-1")).toEqual(text);
    expect(body.nodes.find((n) => n.id === "image-generator-2")).toEqual(gen);
    expect(body.nodes.map((n) => n.id)).toEqual(expect.arrayContaining(["upload-3", "upload-4"]));
    expect(body.edges).toEqual([edge]);
  });
});

function within1(el: HTMLElement, text: string) {
  return (el.textContent ?? "").includes(text);
}
