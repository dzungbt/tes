// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { calls, deferred, failWith, installBackend, node, paginator, push, renderPage, space } from "./spaces-list.helpers";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), prefetch: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/spaces-list",
  useSearchParams: () => new URLSearchParams(),
}));

import Page from "@/app/(app)/spaces-list/page";
import { createSpace, listSpaces } from "@/lib/api/spaces";
import { t } from "@/i18n";

const VI = {
  title: "Không gian sáng tạo",
  mine: "Của tôi", shared: "Được chia sẻ", templates: "Mẫu có sẵn", flows: "Luồng",
  newSpace: "Không gian mới",
  untitled: "Không gian chưa đặt tên",
  empty: "Chưa có không gian nào — tạo một cái để bắt đầu.",
  loadMore: "Xem thêm",
};

const mediaSrcs = (c: HTMLElement) => Array.from(c.querySelectorAll("img,video")).map((e) => e.getAttribute("src"));
const isDisabled = (label: string) => {
  const el = screen.getByText(label);
  const c = el.closest('[role="tab"],button,label,[aria-disabled]') ?? el;
  const inp = c.querySelector?.("input");
  return c.hasAttribute("disabled") || c.getAttribute("aria-disabled") === "true" || /disabled/i.test(c.className) || !!inp?.disabled;
};

beforeEach(() => push.mockClear());
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("API layer", () => {
  it("listSpaces/createSpace go through the BFF with the right params", async () => {
    installBackend({ list: () => paginator([space(1, "A")], 2, 3), create: () => ({ space_id: 7 }) });
    const list = (await listSpaces(2, 30)) as { current_page: number; last_page: number; data: unknown[] };
    expect(list.current_page).toBe(2);
    expect(list.data).toHaveLength(1);
    expect(calls[0]).toMatchObject({ method: "GET", path: "/api/proxy/api/spaces", page: 2, perPage: 30 });
    const created = (await createSpace()) as { space_id: number };
    expect(created.space_id).toBe(7);
    expect(calls[1]).toMatchObject({ method: "POST", path: "/api/proxy/api/spaces/space" });
  });
});

describe("Spaces list page", () => {
  it("loads page 1 with 30 per page and shows title, tabs, cards", async () => {
    installBackend({ list: () => paginator([space(1, "Alpha"), space(2, "Beta")]) });
    renderPage(Page);
    expect(await screen.findByText("Alpha")).toBeTruthy();
    expect(screen.getByText("Beta")).toBeTruthy();
    expect(screen.getByText(VI.title)).toBeTruthy();
    expect(calls[0]).toMatchObject({ page: 1, perPage: 30 });
  });

  it("shows the untitled fallback for null and blank names", async () => {
    installBackend({ list: () => paginator([space(1, null), space(2, "   ")]) });
    renderPage(Page);
    await waitFor(() => expect(screen.getAllByText(VI.untitled)).toHaveLength(2));
  });

  it("shows node count and a relative updated time", async () => {
    installBackend({ list: () => paginator([space(1, "Alpha", [node("a"), node("b")])]) });
    renderPage(Page);
    expect(await screen.findByText(/^2 node$/)).toBeTruthy();
    const upd = screen.getByText(/Cập nhật/);
    expect(upd.textContent).toMatch(/3/);
  });

  it("hides the updated line when updated_at is null", async () => {
    installBackend({ list: () => paginator([space(1, "Alpha", [], null)]) });
    renderPage(Page);
    await screen.findByText("Alpha");
    expect(screen.queryByText(/Cập nhật/)).toBeNull();
  });

  it("picks results: generated output first, picked assets as fallback, duplicates removed", async () => {
    const nodes = [
      node("n1", "image-generator", { src: "https://cdn/a.png" }),
      node("n2", "assets", { selectedUrl: "https://cdn/b.png" }),
      node("n3", "image-generator", { src: "https://cdn/a.png" }),
      node("n4", "video-generator", { videoSrc: "https://cdn/v.mp4" }),
    ];
    installBackend({ list: () => paginator([space(1, "Alpha", nodes)]) });
    const { container } = renderPage(Page);
    await screen.findByText("Alpha");
    expect(mediaSrcs(container)).toEqual(["https://cdn/a.png", "https://cdn/v.mp4", "https://cdn/b.png"]);
  });

  it("ignores a plain node's src and shows no media when there is no output", async () => {
    const nodes = [node("n1", "prompt", { src: "https://cdn/not-output.png" }), node("n2", "prompt")];
    installBackend({ list: () => paginator([space(1, "Alpha", nodes)]) });
    const { container } = renderPage(Page);
    await screen.findByText("Alpha");
    expect(mediaSrcs(container)).toEqual([]);
  });

  it("shows Load more only when more pages exist and appends without dropping", async () => {
    installBackend({
      list: (page) => (page === 1 ? paginator([space(1, "Alpha")], 1, 2) : paginator([space(2, "Beta")], 2, 2)),
    });
    renderPage(Page);
    await screen.findByText("Alpha");
    fireEvent.click(screen.getByRole("button", { name: new RegExp(VI.loadMore) }));
    expect(await screen.findByText("Beta")).toBeTruthy();
    expect(screen.getByText("Alpha")).toBeTruthy();
    expect(calls.map((c) => c.page)).toEqual([1, 2]);
    expect(screen.queryByRole("button", { name: new RegExp(VI.loadMore) })).toBeNull();
  });

  it("has no Load more on a single page", async () => {
    installBackend({ list: () => paginator([space(1, "Alpha")], 1, 1) });
    renderPage(Page);
    await screen.findByText("Alpha");
    expect(screen.queryByRole("button", { name: new RegExp(VI.loadMore) })).toBeNull();
  });

  it("shows four tabs; only My spaces is enabled", async () => {
    installBackend({ list: () => paginator([space(1, "Alpha")]) });
    renderPage(Page);
    await screen.findByText("Alpha");
    expect(isDisabled(VI.mine)).toBe(false);
    for (const l of [VI.shared, VI.templates, VI.flows]) expect(isDisabled(l)).toBe(true);
    fireEvent.click(screen.getByText(VI.shared));
    expect(screen.getByText("Alpha")).toBeTruthy();
  });

  it("shows the empty state only after loading finishes", async () => {
    const d = deferred<unknown>();
    installBackend({ list: () => d.promise });
    renderPage(Page);
    await waitFor(() => expect(calls.length).toBe(1));
    expect(screen.queryByText(VI.empty)).toBeNull();
    d.resolve(paginator([]));
    expect(await screen.findByText(VI.empty)).toBeTruthy();
  });

  it("New space creates once, ignores repeat clicks in flight, then navigates", async () => {
    const d = deferred<unknown>();
    installBackend({ list: () => paginator([space(1, "Alpha")]), create: () => d.promise });
    renderPage(Page);
    await screen.findByText("Alpha");
    const btn = screen.getByRole("button", { name: new RegExp(VI.newSpace) });
    fireEvent.click(btn);
    fireEvent.click(btn);
    fireEvent.click(btn);
    await waitFor(() => expect(calls.filter((c) => c.method === "POST")).toHaveLength(1));
    expect(push).not.toHaveBeenCalled();
    d.resolve({ space_id: 42 });
    await waitFor(() => expect(push).toHaveBeenCalledWith("/spaces?space=42"));
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(1);
  });

  it("does not navigate when creation returns no id", async () => {
    installBackend({ list: () => paginator([]), create: () => ({}) });
    renderPage(Page);
    await screen.findByText(VI.empty);
    fireEvent.click(screen.getByRole("button", { name: new RegExp(VI.newSpace) }));
    await waitFor(() => expect(calls.filter((c) => c.method === "POST")).toHaveLength(1));
    await new Promise((r) => setTimeout(r, 50));
    expect(push).not.toHaveBeenCalled();
  });
});

describe("Failures", () => {
  it("shows the error and a retry button when page 1 fails, instead of the empty state", async () => {
    let n = 0;
    installBackend({ list: () => (++n === 1 ? failWith(500, "List exploded") : paginator([space(1, "Alpha")])) });
    renderPage(Page);
    expect(await screen.findByText(/List exploded/)).toBeTruthy();
    expect(screen.queryByText(VI.empty)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: t.common.retry }));
    expect(await screen.findByText("Alpha")).toBeTruthy();
    expect(screen.queryByText(/List exploded/)).toBeNull();
  });

  it("keeps the loaded cards, shows the error and keeps Load more usable when a later page fails", async () => {
    let page2 = 0;
    installBackend({
      list: (page) => {
        if (page === 1) return paginator([space(1, "Alpha")], 1, 2);
        return ++page2 === 1 ? failWith(500, "Page two exploded") : paginator([space(2, "Beta")], 2, 2);
      },
    });
    renderPage(Page);
    await screen.findByText("Alpha");
    fireEvent.click(screen.getByRole("button", { name: VI.loadMore }));
    expect(await screen.findByText(/Page two exploded/)).toBeTruthy();
    expect(screen.getByText("Alpha")).toBeTruthy();
    const more = screen.getByRole("button", { name: VI.loadMore });
    await waitFor(() => expect((more as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(more);
    expect(await screen.findByText("Beta")).toBeTruthy();
    expect(screen.getByText("Alpha")).toBeTruthy();
    expect(calls.filter((c) => c.page === 2)).toHaveLength(2);
  });

  it("shows the error, does not navigate and lets the user try again when creating fails", async () => {
    let n = 0;
    installBackend({ list: () => paginator([space(1, "Alpha")]), create: () => (++n === 1 ? failWith(422, "Quota reached") : { space_id: 9 }) });
    renderPage(Page);
    await screen.findByText("Alpha");
    const btn = () => screen.getByRole("button", { name: new RegExp(VI.newSpace) });
    fireEvent.click(btn());
    expect(await screen.findByText(/Quota reached/)).toBeTruthy();
    expect(push).not.toHaveBeenCalled();
    await waitFor(() => expect((btn() as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(btn());
    await waitFor(() => expect(push).toHaveBeenCalledWith("/spaces?space=9"));
  });
});
void within;
