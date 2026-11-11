# CHANGELOG

## 2026-11-11 — Phân tích kết quả oracle (reward 0.0) và sửa solution/test.sh

Kết quả `harbor run -p .../task -a oracle`: reward 0.0, 9m30s. `summary.txt`: PASS source_untouched, deps_unchanged, no_source_stack, tsc; FAIL files_exist, existing_tests, hidden_behaviour, hidden_i18n_{en,ru,zh}. `agent/oracle.txt`: `git apply` báo `tool_znak_fe/src/i18n/{en,ru.add,zh.add}.ts: No such file or directory` → lời giải KHÔNG được áp, nên mọi test ẩn fail theo.
`existing_tests` trong container (bản test.sh cũ): 9 test fail do "timed out in 20000ms", cả suite 431s (6 file fail/33) → xác nhận không nên chạy toàn bộ suite trong verifier (bản test.sh mới đã bỏ).
Đã sửa: `solution/patch.diff` tạo lại với đường dẫn gốc repo (`a/tool_znak_fe/...`), `solve.sh` chạy `cd /app && git apply`; `tests/test.sh` thêm `--testTimeout=30000` cho test ẩn.
Đã kiểm chứng: patch mới áp sạch ở gốc repo giả lập (/tmp); patch cũ vẫn áp được từ thư mục con trong mô phỏng của tôi → giả thuyết "sai thư mục" CHƯA được xác nhận.
Chưa kiểm chứng: nguyên nhân thật của "No such file" (nghi `tool_znak_fe/src/i18n/*.ts` không tồn tại hoặc khác tên trong codebase của task); chưa chạy lại oracle.

## 2026-11-11 — test.sh: bỏ chạy toàn bộ test hiện có, thêm timeout từng check

Lý do: chạy oracle bằng Harbor, verifier chạy > 9 phút (giới hạn 900s); nghi do bước chạy toàn bộ ~57 file test (preflight đã timeout 120s ở bước này).
Đã sửa `task_draft/tests/test.sh`: mỗi check có `timeout` (mặc định 150s; tsc 300s; agent_tests 240s, đặt bằng `CHECK_TIMEOUT=... check ...`; bản đầu dùng `env CHECK_TIMEOUT` bị sai nên đã sửa); thay `existing_tests` bằng `agent_tests` (chỉ chạy các file `*.test.*` mới/đã sửa của agent).
Đã kiểm chứng: `bash -n` báo cú pháp đúng; cơ chế truyền `CHECK_TIMEOUT` qua tiền tố biến cho hàm đã thử bằng `echo` (300 và 150 đúng như mong đợi). Máy tôi không có lệnh `timeout` nên chưa thử timeout thật (container Ubuntu có coreutils).
Chưa kiểm chứng: nguyên nhân chậm chưa xác nhận (chưa xem `summary.txt` của lần chạy); chưa chạy lại oracle với bản test.sh mới; chưa biết tổng thời gian thật.

## 2026-11-11 — Sửa 2 lỗi preflight (task_draft/preflight.toml, Dockerfile)

Lỗi từ lần chạy `validate_task.py` 20261111T045533Z: (1) check "Existing target tests pass" TIMEOUT 120s vì chạy toàn bộ ~57 file test; (2) "Starting repository" FAILED, nghi do `.git` lồng trong `codebase/gen_img_fe` và `codebase/tool_znak_fe` (validate cũng cảnh báo "solution leakage").
Đã sửa: thay check (1) bằng chạy một file test nhỏ (`DatePicker.ui.test.tsx`); thêm check "No nested git repositories"; Dockerfile thêm `find /app -name .git ... -exec rm -rf` ngay sau `COPY codebase/`.
Đã kiểm chứng: image build PASSED (109s), Node 22/deps/repos present/target page absent đều PASSED theo output người dùng gửi.
Chưa kiểm chứng: nguyên nhân (2) chưa xác nhận bằng `check-02.log`; chưa chạy lại preflight sau sửa; chưa biết toàn bộ test hiện có chạy mất bao lâu (ảnh hưởng timeout 900s của `tests/test.sh`).

## 2026-11-11 — Chẩn đoán preflight TIMEOUT ở "Python and Git container setup"

Nguyên nhân (theo số liệu người dùng cung cấp): `environment/codebase/gen_img_fe` (979 MB) và `tool_znak_fe` (711 MB) còn `node_modules` → build context ~1,7 GB.
Đã thêm `task_draft/dockerignore.environment` (nội dung `.dockerignore` loại `node_modules`, `.next`, `.git`...) để copy thành `environment/.dockerignore`.
Chưa kiểm chứng: người dùng chưa xoá `node_modules` và chưa chạy lại preflight; chưa biết `.dockerignore` có được harness tôn trọng không (nên xoá thư mục thật là chắc nhất).

## 2026-11-11 — Thêm `task_draft/preflight.toml`

Giữ nguyên 2 check của template, thêm 4 check: hai repo có mặt; Node >= 22 và `node_modules` của tool_znak_fe đã cài; trang `spaces-list` và `lib/api/spaces.ts` chưa tồn tại ở trạng thái đầu; test hiện có của tool_znak_fe pass ở trạng thái đầu.
Chưa kiểm chứng: chưa chạy preflight trong container (chưa biết `validate_task.py` chạy các check này ở đâu và timeout bao nhiêu); check "Existing target tests pass" có thể chậm, nếu timeout thì bỏ.

## 2026-11-11 — Đổi thư mục solution cho khớp template

`task_draft/solution/`: `solution.patch` đổi tên thành `patch.diff`, thêm `solve.sh` (chạy `git apply patch.diff` trong `/app/tool_znak_fe`).
Đã kiểm chứng: patch áp sạch (`git apply --check` rồi áp thật) lên bản sao các file gốc `en.ts`, `ru.add.ts`, `zh.add.ts` trong thư mục tạm; sinh ra `spaces-list/page.tsx` và `lib/api/spaces.ts`.
Chưa kiểm chứng: `solve.sh` chưa chạy trong container; chưa biết nội dung `solve.sh` mặc định của template nên có thể cần chỉnh cho khớp.

## 2026-11-11 — Viết tests/ cho task spaces-list (trong `task_draft/tests/`)

Đã tạo: `tests/test.sh`, `tests/spaces-list.helpers.tsx`, `tests/spaces-list.hidden.test.tsx` (13 test hành vi), `tests/spaces-list.i18n.test.tsx` (chạy với TEST_LANG=en/ru/zh), và `solution/solution.patch` (bản giải tham chiếu tối giản, chỉ để kiểm test).
`instruction.md`: bỏ `npm run build` khỏi mục Acceptance, thay bằng `npx tsc --noEmit` (build dùng `next/font/google` cần mạng).

Đã kiểm chứng (trên bản sao tool_fe + bản giải tham chiếu, Node 22.19.0, KHÔNG phải trong Docker):
- 13/13 test hành vi và 3/3 test i18n (en, ru, zh) pass; `tsc --noEmit` sạch; eslint 0 lỗi.
- Test bắt được các lỗi giả lập: bỏ dedupe/sai thứ tự media, nút Load more luôn hiện, tab Shared bật, không trim tên, flash empty-state khi đang tải, không chặn bấm lặp (khi bỏ cả guard lẫn disabled).
- Với Node 20.10, import `@ant-design/icons` trong vitest lỗi "Cannot use import statement"; Node 22.19 thì chạy được. Dockerfile dùng Node 22.19.0 nên ổn.

Chưa kiểm chứng: `tests/test.sh` chưa chạy end-to-end (cần `/app`, tag git `v0.1.0-init`, `/logs/verifier`); Docker build chưa chạy; chưa biết cấu trúc test.sh mặc định của template (đường dẫn reward `/logs/verifier/reward.txt` là giả định theo chuẩn Harbor); chưa chạy model nào nên chưa biết A fail / B pass.

## 2026-11-11 — Soạn bản nháp task Ummon "migrate trang spaces-list" (chưa chạy thử)

Đã tạo thư mục `task_draft/` (bản nháp để người dùng tự copy vào thư mục task thật):
- `instruction.md`: đề bài migrate `gen_img_fe/src/app/spaces-list` sang `tool_znak_fe` (antd, `tr()`, React Query, API qua BFF).
- `Dockerfile`: dựa trên template, thêm Node 22.19.0 (tarball), `COPY codebase/ .`, `npm ci` cho `tool_znak_fe`, thêm `node_modules/`, `.next/` vào `.gitignore` trước khi tag `v0.1.0-init`.
- `docker-compose.yaml`: giữ nguyên bản template (template ghi "do not change").

Chưa kiểm chứng: Dockerfile chưa được build; `npm ci`/`npm run build`/`npm test` trong container chưa chạy; `vitest.setup.ts` có tồn tại trong `tool_znak_fe` hay không chưa xác nhận; `tests/test.sh` chưa viết.

## 2026-11-11 — Dọn cache trên máy local (không đổi code dự án)

Ổ đĩa chỉ còn 5,2 GB trống; sau dọn còn 33 GB (đã kiểm chứng bằng `df -h /`).

Đã xoá (đều là cache tạo lại được):
- npm cache (`npm cache clean --force`), Homebrew (`brew cleanup --prune=all`, ~455 MB)
- Docker build cache (`docker builder prune -af`, ~4 GB)
- Xcode DerivedData, `~/.cache/github-copilot`, `~/.cache/puppeteer`
- `~/Library/Caches`: Google/Chrome (phần lớn), Microsoft Edge, JetBrains, CocoaPods, Yarn, ReactNative, orca-updater, ShipIt (Postman, Antigravity)
- `~/Library/Logs/*`

Chưa kiểm chứng / chưa làm:
- `uv cache clean` (~13 GB) KHÔNG chạy được: các tiến trình MCP `browser-use` đang giữ khoá `~/.cache/uv`.
- `pip` không có trong PATH nên không purge được.
- Một số thư mục cache Chrome còn sót do Chrome đang mở.
- Không động đến: Trash (~0,9 GB), CoreSimulator (~34 GB), Docker volumes, ms-playwright.

## 2026-11-11 — Nâng độ khó task Ummon: thêm xử lý lỗi, mục menu và canvas `/spaces?space=<id>` (node Upload) — trong `task_draft/`

Lý do: lần chạy `spaces-main2` cho kết quả brawne (model A) và shrike đều reward 1.0, nhưng A phải fail cả hai rollout. Đối chiếu code hai model cho thấy cả hai port gần nguyên văn logic nguồn nên test "khớp bản gốc" không phân biệt được. Đã thêm yêu cầu cần suy luận/khám phá thêm (có ghi rõ trong instruction).

Đã đổi:
- `instruction.md`: viết lại thành 2 phần. Phần 1 (list) thêm mục 7–9: lỗi tải trang 1/trang sau, lỗi tạo space, mục sidebar (admin) trỏ `/spaces-list`. Phần 2 (canvas): load space, nút thêm node Upload, upload multipart qua BFF, node khớp tỉ lệ ảnh (cạnh dài 320px), kéo resize giữ tỉ lệ và không đổi cỡ pixel gốc, autosave debounce 1s, giữ nguyên node loại khác và edge khi lưu. Bỏ câu "canvas ngoài phạm vi".
- `Dockerfile`: sau `npm ci` thêm `npm install --save-exact @xyflow/react@12.11.2` (trước khi tag `v0.1.0-init`) vì agent không có mạng và không được sửa package.json.
- `preflight.toml`: kiểm tra có `@xyflow/react`, có nguồn canvas (`gen_img_fe/src/app/spaces/page.tsx`, `UploadNode.tsx`), chưa có trang `(app)/spaces`.
- `tests/`: thêm `spaces-canvas.helpers.tsx`, `spaces-canvas.hidden.test.tsx` (17 test), `spaces-bff.hidden.test.ts` (4 test: allow-list và chuyển nguyên byte multipart), `spaces-nav.hidden.test.tsx` (4 test); `spaces-list.hidden.test.tsx` thêm 3 test lỗi và siết đường dẫn BFF thành `/api/proxy/api/spaces...` (trước đó chỉ khớp đuôi `/spaces`); `spaces-list.i18n.test.tsx` thêm kiểm tra chuỗi canvas (en/ru/zh). `tests/test.sh`: thêm các check `hidden_canvas`, `hidden_bff`, `hidden_nav`, `existing_lib_tests` (chạy `src/lib`), `files_exist` thêm `spaces/page.tsx`.
- `solution/patch.diff`: sinh lại (14 file, không gồm package.json/lock vì Docker đã cài sẵn thư viện). Bản tham chiếu đồng thời sửa: `lib/api/http.ts` (hỗ trợ FormData), route BFF `api/proxy/[...path]` (đọc `arrayBuffer` thay `text()` để không làm hỏng ảnh), `proxy-path.ts` (cho phép `api/spaces`), `backend.ts` (kiểu body), `AppShell.tsx` (mục menu), i18n en/ru.add/zh.add, trang list (xử lý lỗi) và trang canvas.

Phát hiện khi đọc nguồn (không phải suy đoán): node Upload gốc cố định 300×300, `object-cover` và không khoá tỉ lệ, nên việc "khớp tỉ lệ ảnh + resize giữ tỉ lệ" là hành vi mới, không phải port nguyên văn. Bản gốc cũng làm mất `width/height` của ảnh khi lưu; task yêu cầu giữ lại. Đường dẫn backend thật là `/api/spaces...` (bản tham chiếu cũ dùng `spaces`, đã sửa).

Đã kiểm chứng (Node 22.20.0 trên máy, bản sao tool_fe + patch, KHÔNG trong Docker):
- Patch mới áp sạch lên bản sao gốc; `tsc --noEmit` sạch; eslint 0 lỗi (1 warning `<img>` ở trang list).
- 130 test pass (20 file: toàn bộ hidden + `src/lib`). i18n en/ru/zh pass.
- Test bắt được 6 lỗi cố ý: bỏ khoá tỉ lệ khi resize, `JSON.stringify` FormData, route đọc `text()`, thiếu mục menu, mất node loại khác khi lưu, mất `width/height` gốc của ảnh.
- Kéo resize chạy được trong jsdom (mô phỏng chuột lên tay nắm của React Flow, tự bù zoom của `fitView`).

Chưa kiểm chứng:
- Docker build mới (`npm install @xyflow/react` trong image), preflight mới và `tests/test.sh` đầy đủ trong container (cần `/app`, tag git, `/logs/verifier`); oracle chưa chạy lại.
- Chưa chạy lại model nào; chưa biết A có fail cả hai rollout hay không.
- Chưa xác nhận thư mục `codebase/gen_img_fe` của người dùng có đủ `src/app/spaces/`, `src/components/spaces/`, `src/types/spaces.ts`, `src/api/spaces.js` (preflight sẽ báo nếu thiếu).
- Test canvas dựa vào lớp CSS và cấu trúc của React Flow (`.react-flow__node`, `.react-flow__resize-control.handle.bottom.right`); nếu agent dùng cách resize khác React Flow thì test sẽ không tìm thấy tay nắm.

## 2026-11-11 — Khởi tạo git cho thư mục làm việc (để chuyển file giữa hai máy)

Đã tạo repo git cục bộ ở `tool_xu_ly_san/` (nhánh `main`) với `.gitignore` chỉ cho phép `task_draft/` và `docs/`; các thư mục khác (`tool`, `tool_fe`, `token_rotator`, file `.dmg`, `.xlsx`…) bị bỏ qua. Đã quét `task_draft/` và `docs/` tìm khoá/mật khẩu: không có kết quả.
Đã kiểm chứng: remote `https://github.com/dzungbt/tes.git` tồn tại, đang trống, và là repo CÔNG KHAI (`private: false`).
Chưa làm: CHƯA push lên remote vì `task_draft/` chứa bài giải tham chiếu và test ẩn của task; chờ người dùng quyết định (đặt repo private hoặc chỉ đẩy phần không nhạy cảm).

## 2026-11-11 — Đã push `task_draft/` và `docs/` lên GitHub

Người dùng xác nhận đẩy lên repo CÔNG KHAI `dzungbt/tes` dù biết nó chứa bài giải tham chiếu và test ẩn. Remote đổi sang SSH (`git@github.com:dzungbt/tes.git`) vì HTTPS không có thông tin đăng nhập trên máy này.
Đã kiểm chứng: `git ls-remote origin` trả về `refs/heads/main` = commit `0effe11` (17 file).
Lưu ý: commit chứa `solution/` và `tests/` nên ai cũng đọc được; xoá sau này không chắc gỡ hết bản đã bị cache.
