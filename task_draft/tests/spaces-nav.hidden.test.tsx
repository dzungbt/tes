// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "./spaces-list.helpers"; // jsdom shims

const state = vi.hoisted(() => ({ admin: true, pathname: "/spaces-list" }));

vi.mock("next/navigation", () => ({
  useParams: () => ({}),
  usePathname: () => state.pathname,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/api/queries", () => ({
  useSession: () => ({ data: { user: { name: "Test User", all_role_names: ["Admin"] } } }),
  useStores: () => ({ data: [], isLoading: false }),
}));
vi.mock("@/lib/api/system", () => ({ useIsAdmin: () => state.admin }));
vi.mock("@/lib/features", () => ({ useFeatureAccess: () => ({ has: () => true }) }));
vi.mock("@/lib/lastStore", () => ({ setLastStoreId: () => {}, useLastStoreId: () => null }));
vi.mock("@/lib/log/client", () => ({ logEvent: () => {}, setLogStore: () => {} }));
vi.mock("@/components/store/AddStoreModal", () => ({ AddStoreModal: () => null }));
vi.mock("@/components/layout/SessionKeeper", () => ({ SessionKeeper: () => null }));
vi.mock("@/components/layout/StorePickerModal", () => ({ StorePickerModal: () => null }));

import { AppShell } from "@/components/layout/AppShell";

const LABEL = "Không gian sáng tạo";
const spacesLinks = () => screen.queryAllByRole("link").filter((a) => (a.textContent ?? "").includes(LABEL));

function renderShell() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <AppShell><div>content</div></AppShell>
    </QueryClientProvider>,
  );
}

afterEach(() => { cleanup(); state.admin = true; state.pathname = "/spaces-list"; });

describe("Sidebar entry for Spaces", () => {
  it("links to /spaces-list from the system block and is highlighted on the list page", () => {
    renderShell();
    const links = spacesLinks();
    expect(links.length).toBeGreaterThan(0);
    const link = links[0];
    expect(link.getAttribute("href")).toBe("/spaces-list");
    expect(link.className).toMatch(/\bactive\b/);
  });

  it("stays highlighted on the canvas page", () => {
    state.pathname = "/spaces";
    renderShell();
    expect(spacesLinks()[0].className).toMatch(/\bactive\b/);
  });

  it("is not highlighted elsewhere", () => {
    state.pathname = "/admin/users";
    renderShell();
    expect(spacesLinks()[0].className).not.toMatch(/\bactive\b/);
  });

  it("is only offered in the admin-only system block", () => {
    state.admin = false;
    renderShell();
    expect(spacesLinks()).toHaveLength(0);
  });
});
