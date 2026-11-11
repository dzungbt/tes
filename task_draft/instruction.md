# Migrate the Spaces pages into tool_znak_fe

The workspace contains two Next.js frontends:

- `/app/gen_img_fe` is the **source**. Relevant code: `src/app/spaces-list/`, `src/app/spaces/page.tsx` and, for the node, `src/components/spaces/nodes/UploadNode.tsx` with its helpers.
- `/app/tool_znak_fe` is the **target**. Port the pages into this app. Do not modify `gen_img_fe`.

No backend is available. The pages must work against the same backend responses the source pages already consume (endpoints under `/api/spaces`).

## Part 1 - Spaces list at `/spaces-list`

Use the App Router and put the page inside the `(app)` route group so it gets the app shell. It must behave like the source page:

1. On mount it loads page 1 of the user's spaces, 30 per page, and renders one card per space.
2. Each card shows the space name (an "untitled" fallback when the name is empty), the node count, a relative "updated ... ago" time, and a thumbnail drawn from the saved graph. The thumbnail logic and the choice of media for the results layer must match the source: generated output first, picked assets as the fallback, duplicates removed.
3. A "Load more" button appears only when more pages exist. It appends the next page without dropping earlier ones.
4. Four tabs are shown: My spaces, Shared, Templates, Flows. Only "My spaces" is enabled. The other three are visible but disabled.
5. A "New space" button creates a space, then navigates to `/spaces?space=<id>`. It ignores repeat clicks while a creation is in flight.
6. An empty list shows the empty-state message.

The source page does not handle failures. The target must:

7. If page 1 fails to load, show the error message and a Retry button (the existing "Thử lại" label) instead of the empty state; Retry reloads the list. If a later page fails, keep the cards already loaded, show the error message, and keep "Load more" available so the user can try again.
8. If creating a space fails, show the error message, do not navigate, and make the button usable again.
9. In the sidebar (`AppShell`), the admin-only "system" block gets an entry labelled with the existing string "Không gian sáng tạo" that links to `/spaces-list`. It is highlighted on `/spaces-list` and on `/spaces`, and not elsewhere.

## Part 2 - Canvas at `/spaces?space=<id>` (Upload node only)

Add `src/app/(app)/spaces/page.tsx`. Read the space id from the `space` query parameter with `useSearchParams` from `next/navigation`. The canvas library the source uses, `@xyflow/react` 12.11.2, is already installed in the target; use it for this page. Do not edit `package.json`.

Scope is a small slice of the source canvas: the **Upload** node only. Other node types and all edges are not drawn, but they must be sent back unchanged whenever the graph is saved.

- **Load.** Fetch the space (`GET api/spaces/space/{id}` -> `{ space_id, name, graph: { nodes, edges } | null }`). Show its name in the page header, with the "untitled" fallback for a blank name. While loading show a spinner. If loading fails show the error message and a Retry button.
- **Add node.** A button labelled "Thêm node tải lên" adds an empty Upload node with id `upload-<n>`, where `n` is greater than every numeric id suffix in the loaded graph (all node kinds count) and in the nodes added so far.
- **Empty node.** It shows a drop zone with the text "Thả ảnh vào đây hoặc bấm để tải lên". Clicking it or dropping a file picks one image (`image/*`). A node holds at most one image; a new one replaces the old.
- **Upload.** Send the file as multipart form data (field `image`) to `POST api/spaces/image/upload-image`. The reply is `{ url, thumb_url, width, height }`, where `width`/`height` are the pixel size of the original. The node shows a local preview at once, and then `thumb_url` (or `url` when there is none). The backend sometimes answers 200 without a `url` because storage rejected the file. That, and an HTTP error, must put the node back to its empty state and show the notice "Tải ảnh lên máy chủ thất bại.".
- **Fit.** Once the original's pixel size is known the node frame has exactly that aspect ratio, 320 px on its longer side (rounded to whole pixels), and the image fills the frame without cropping. A saved Upload node that has no `width`/`height` of its own is fitted the same way when loaded. A size that was saved wins.
- **Resize.** A selected node can be resized by dragging its corner handles. The frame always keeps the image's aspect ratio, whatever the pointer does. Resizing never changes the image's stored pixel size (`files[0].width`/`height`). Each side stays between 80 and 900 px.
- **Save.** Changes are saved with `PUT api/spaces/space/{id}/graph` and body `{ nodes, edges }`, debounced to one request per second of quiet. Merely loading the page saves nothing. A saved Upload node is `{ id, type: "upload", position, width, height, data }`; `data` keeps `kind`, `label`, `inputs`, `outputs` and `files`, where each file is `{ id, url, thumbUrl, width, height, preview, alt, uploading }`. Files that have no `url` yet (still uploading, or failed) and `blob:` URLs are never saved.

## Rules for the target app

Follow the target's own conventions instead of copying the source's stack:

- **UI:** use `antd` and `@ant-design/icons` (plus `@xyflow/react` for the canvas). Do not add Tailwind, `lucide-react`, `next-intl` or any other dependency, and do not edit `package.json`.
- **i18n:** use the target's `tr()` helper from `@/i18n`. Every user-visible string needs entries in all four catalogs (`vi`, `en`, `ru`, `zh`). Use the source messages for the English and Vietnamese text where they exist; the new strings named above must be used exactly as written.
- **Data access:** call the backend only through the target's browser API layer in `src/lib/api/` (the BFF `/api/proxy/*`). Put the spaces calls in `src/lib/api/spaces.ts`, exporting `listSpaces(page, perPage)` and `createSpace()`. The BFF must let the spaces endpoints through and must forward request bodies to the backend unchanged, including multipart uploads.
- **Data fetching:** use React Query, as the rest of the target does.
- **Quality:** TypeScript must compile without errors and the existing lint rules must pass.

## Acceptance

- `npx tsc --noEmit`, `npm run lint` and `npm test` pass in `/app/tool_znak_fe`, and existing tests keep passing.
- Add your own tests for the new pages. A separate hidden test suite will also check your work.
- Leave no debug code and no unrelated changes.
