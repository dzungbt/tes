// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// Language is read from the cookie when the i18n module loads, so set it before any import.
const LANG = vi.hoisted(() => {
  const l = process.env.TEST_LANG || "en";
  document.cookie = `lang=${l};path=/`;
  return l;
});

import { installBackend, node, paginator, push, renderPage, space } from "./spaces-list.helpers";
import { installCanvasBackend, pngFile, uploadNode } from "./spaces-canvas.helpers";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), prefetch: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/spaces-list",
  useSearchParams: () => new URLSearchParams("space=5"),
}));

import Page from "@/app/(app)/spaces-list/page";
import CanvasPage from "@/app/(app)/spaces/page";

const VI_STRINGS = [
  "Không gian sáng tạo", "Xây dựng pipeline", "Của tôi", "Được chia sẻ", "Mẫu có sẵn", "Luồng",
  "Không gian mới", "Không gian chưa đặt tên", "Xem thêm", "Cập nhật",
];

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe(`Spaces list i18n (${LANG})`, () => {
  it("renders every visible string in the active language", async () => {
    installBackend({
      list: (page) =>
        page === 1 ? paginator([space(1, null, [node("a"), node("b")])], 1, 2) : paginator([]),
    });
    renderPage(Page);
    await waitFor(() => expect(screen.getByText(/2 /)).toBeTruthy());
    const text = document.body.textContent ?? "";
    if (LANG === "en") {
      for (const s of ["Spaces", "My spaces", "Shared", "Templates", "Flows", "New space", "Untitled space", "Load more", "2 nodes", "Updated"]) {
        expect(text, s).toContain(s);
      }
      expect(text).toContain("Build node-based generative workflows and bring your ideas to life.");
    } else {
      for (const s of VI_STRINGS) expect(text, `untranslated: ${s}`).not.toContain(s);
      expect(text).not.toContain("Không gian");
      expect(text).not.toContain("node-based");
    }
  });

  it("renders the canvas strings (add button, drop zone, upload failure) in the active language", async () => {
    installCanvasBackend({
      space: () => ({ space_id: 5, name: "Moodboard", graph: { nodes: [uploadNode("upload-1")] } }),
      upload: () => ({ body: { url: null } }),
    });
    const { container } = renderPage(CanvasPage);
    await screen.findByText("Moodboard");
    await waitFor(() => expect(container.querySelector(".react-flow__node")).toBeTruthy());
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [pngFile()] } });
    await waitFor(() => expect(document.body.textContent).toMatch(LANG === "en" ? /Upload to the server failed\./ : /./));
    await new Promise((r) => setTimeout(r, 50));
    const text = document.body.textContent ?? "";
    const VI_CANVAS = ["Thêm node tải lên", "Thả ảnh vào đây", "Tải ảnh lên máy chủ thất bại"];
    if (LANG === "en") {
      for (const x of ["Add upload node", "Drop an image here or click to upload", "Upload to the server failed."]) expect(text, x).toContain(x);
    } else {
      for (const x of VI_CANVAS) expect(text, `untranslated: ${x}`).not.toContain(x);
      // the failure notice appears in the active language too
      expect(text).toMatch(LANG === "ru" ? /[А-Яа-я]{4,}[^]*[А-Яа-я]{4,}/ : /[\u4e00-\u9fff]{2,}/);
    }
  });
});
