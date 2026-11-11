import React from "react";
import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { App as AntApp } from "antd";
import { vi } from "vitest";

/** Shared harness for the hidden Spaces-list tests: jsdom shims, router mock, fake BFF. */

export const push = vi.fn();

if (typeof window !== "undefined") {
  if (!window.matchMedia) {
    window.matchMedia = ((q: string) => ({
      matches: false, media: q, onchange: null,
      addListener: () => {}, removeListener: () => {},
      addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
  }
  if (!("ResizeObserver" in window)) {
    (window as unknown as { ResizeObserver: unknown }).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  }
  if (!("IntersectionObserver" in window)) {
    (window as unknown as { IntersectionObserver: unknown }).IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } };
  }
}

export interface RawNode {
  id: string;
  type?: string;
  position: { x: number; y: number };
  data?: { src?: string; videoSrc?: string; selectedUrl?: string };
}
export const node = (id: string, type?: string, data?: RawNode["data"]): RawNode => ({ id, type, position: { x: 10, y: 10 }, data });
export const space = (id: number, name: string | null, nodes: RawNode[] = [], updated_at: string | null = new Date(Date.now() - 3 * 3600_000).toISOString()) => ({
  space_id: id, name, updated_at, graph: { nodes },
});
export const paginator = (data: unknown[], current_page = 1, last_page = 1) => ({ data, current_page, last_page });

export interface Call { method: string; path: string; page: number | null; perPage: number | null }
export interface Backend {
  /** Return the paginator for a list request; may return a promise to hold the response. */
  list: (page: number, perPage: number) => unknown | Promise<unknown>;
  /** Return the data for a create request. */
  create?: () => unknown | Promise<unknown>;
}

export const calls: Call[] = [];

/** Return this from a backend handler to make the fake BFF answer with an HTTP error. */
export const failWith = (status: number, message: string) => ({ __fail: true as const, status, message });

/** Installs a fake `fetch` that speaks the BFF envelope `{ success, data }`. */
export function installBackend(b: Backend) {
  calls.length = 0;
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, "http://localhost");
    const method = (init?.method ?? "GET").toUpperCase();
    const path = url.pathname.replace(/\/+$/, "");
    const page = url.searchParams.get("page");
    const perPage = url.searchParams.get("per_page");
    const json = (data: unknown) =>
      data && typeof data === "object" && (data as { __fail?: boolean }).__fail
        ? new Response(JSON.stringify({ success: false, message: (data as { message: string }).message, data: null }), { status: (data as { status: number }).status, headers: { "content-type": "application/json" } })
        : new Response(JSON.stringify({ success: true, data }), { status: 200, headers: { "content-type": "application/json" } });
    if (method === "GET" && path === "/api/proxy/api/spaces") {
      calls.push({ method, path, page: page ? Number(page) : null, perPage: perPage ? Number(perPage) : null });
      return json(await b.list(Number(page ?? 1), Number(perPage ?? 30)));
    }
    if (method === "POST" && path === "/api/proxy/api/spaces/space") {
      calls.push({ method, path, page: null, perPage: null });
      return json(await (b.create ? b.create() : { space_id: 1 }));
    }
    return json({});
  }));
}

export function deferred<T = unknown>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

export function renderPage(Page: React.ComponentType) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <AntApp>
        <Page />
      </AntApp>
    </QueryClientProvider>,
  );
}
