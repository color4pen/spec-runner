# Tasks: closure の上向き edge（B-3/B-4）を ratchet で歯付けし R1/R3/R4 を凍結する

## T-01: B-3/B-4 の allowlist エントリを `arch-allowlist.ts` に追加

- [x] `tests/unit/architecture/arch-allowlist.ts` の `ARCH_ALLOWLIST` 配列に B-3 エントリを追加する。以下の grep を実行して **実際の全件** を確定する（design.md の表は seed であり、grep 結果が authoritative）:
  ```
  grep -rEn "from ['\"](\.\./)*core/" src/parser/ src/config/ src/state/ src/git/ src/prompts/ src/logger/ src/templates/ src/store/
  ```
  - `__tests__/` と `.test.ts` の行は除外する（production dependency ではない）
  - comment 行は除外する
- [x] 同様に B-4 エントリを追加する。以下の grep を実行して全件確定:
  ```
  grep -rEn "from ['\"]\.\./" src/util/
  ```
  - `__tests__/` と `.test.ts` の行は除外する
- [x] 各エントリに `file`, `pattern`, `invariant`（`"B-3"` or `"B-4"`）, `tracking`, `comment` を設定する。tracking は以下の体系:
  - R1: `parser/` → `core/request/` or `core/validation/`
  - R3: `config/` or `state/` → `core/step/step-names`
  - B3-state-port: `state/` → `core/port/*`
  - B3-state-helpers: `state/helpers.ts` → `core/port/report-result`
  - B3-logger: `logger/` → `core/event/event-bus`
  - R4: `util/` → any（`core/` 含む全 import）
- [x] エントリは invariant 順（B-3 → B-4）、invariant 内は file 順で配置する。既存のコメントブロック体裁に従う。

**Acceptance Criteria**:
- grep で検出された B-3/B-4 全件（test ファイル・comment 行除外後）に対応する allowlist エントリが存在する
- 各エントリに `file`, `pattern`, `invariant`, `tracking` が設定されている
- TypeScript コンパイルが通る

## T-02: B-3 の no-op stub を実 assert に置き換え

- [x] `tests/unit/architecture/core-invariants.test.ts` の B-3 describe ブロック（L207〜L230）の no-op test を削除し、実際の grep scan + allowlist filter + assert に置き換える
- [x] scan 対象ディレクトリ: `src/parser/`, `src/config/`, `src/state/`, `src/git/`, `src/prompts/`, `src/logger/`, `src/templates/`, `src/store/`
- [x] grep pattern: `"from ['\\"](\\.\\./)*(core)/"` — 各ディレクトリごとに `grepE()` を呼び、結果を concat する
- [x] `__tests__/` と `.test.ts` を含む match を除外するフィルタを適用する
- [x] `ARCH_ALLOWLIST.filter(e => e.invariant === "B-3")` で allowlist をフィルタし、`filterViolations()` で未 allowlist の violation のみ抽出する
- [x] `expect(violationLines(violations)).toEqual([])` で assert する
- [x] describe/it の docstring を更新し、scan scope（非-core ディレクトリ → core/ への上向き import）を明記する。旧 docstring の「deferred」文言を削除する

**Acceptance Criteria**:
- B-3 の test body に `expect(true).toBe(true)` が存在しない
- test が実際に shared-kernel + persistence ディレクトリを grep し、`core/` への import を検出している
- allowlist エントリ込みで test が green
- scan 対象に `src/store/` が含まれている

## T-03: B-4 の no-op stub を実 assert に置き換え

- [x] `tests/unit/architecture/core-invariants.test.ts` の B-4 describe ブロック（L232〜L247）の no-op test を削除し、実際の grep scan + allowlist filter + assert に置き換える
- [x] scan 対象: `src/util/`
- [x] grep pattern: `"from ['\\"]\\.\\."` — `util/` 外への全 import を検出する（`../` で始まる relative import）
- [x] `__tests__/` と `.test.ts` を含む match を除外するフィルタを適用する
- [x] `ARCH_ALLOWLIST.filter(e => e.invariant === "B-4")` で allowlist をフィルタし、`filterViolations()` で未 allowlist の violation のみ抽出する
- [x] `expect(violationLines(violations)).toEqual([])` で assert する
- [x] describe/it の docstring を更新し、scan scope（util/ → any src/ module）を明記する。旧 docstring の「deferred」文言を削除する

**Acceptance Criteria**:
- B-4 の test body に `expect(true).toBe(true)` が存在しない
- test が実際に `src/util/` を grep し、外部 import を検出している
- allowlist エントリ込みで test が green

## T-04: B-3/B-4 の T-04 regression guard を追加

- [x] T-04 regression guard の describe ブロック内に、B-3 の regression guard test を追加する:
  - synthetic `GrepMatch[]` を構築（例: `{ file: "src/parser/x.ts", line: 5, content: 'import { Foo } from "../core/y.js";' }`）
  - B-3 allowlist でフィルタし、violations が 1 件検出されることを assert する
  - test name: `"detects new upward import into core/ not in allowlist (B-3 regression guard)"`
- [x] B-4 の regression guard test を追加する:
  - synthetic `GrepMatch[]` を構築（例: `{ file: "src/util/x.ts", line: 3, content: 'import { bar } from "../state/baz.js";' }`）
  - B-4 allowlist でフィルタし、violations が 1 件検出されることを assert する
  - test name: `"detects new external import in util/ not in allowlist (B-4 regression guard)"`
- [x] B-3 の allowlist suppression test も追加する:
  - allowlist 済みの既知エントリ（例: `src/parser/request-md.ts` の `core/request/types`）を synthetic match として渡し、violations が 0 件であることを assert する
  - test name: `"does not flag violations that are correctly allowlisted (B-3 allowlist suppression)"`

**Acceptance Criteria**:
- B-3 regression guard: allowlist にない新規 `parser/x.ts` → `core/y.ts` が検出される
- B-4 regression guard: allowlist にない新規 `util/x.ts` → `state/baz.ts` が検出される
- B-3 allowlist suppression: 既知エントリが suppress される

## T-05: `module-boundary` delta spec を作成

- [x] `specrunner/changes/arch-upward-edge-ratchet/specs/module-boundary/spec.md` を作成する
- [x] 既存 Requirement「Architecture Enforcement Covers Entire Core」を MODIFIED として、B-3/B-4 が src-wide deferred ではなく実 assert で被覆されていることを反映する
  - 既存の「The enforcement scope for this requirement is `src/core/`. Extension to `src/` as a whole is deferred to a subsequent change.」を、B-3/B-4 については非-core ディレクトリへの拡張が完了した旨に更新する
  - Scenario を更新して B-3 が shared-kernel + persistence ディレクトリを scan すること、B-4 が util/ を scan することを反映する
- [x] 既存 Requirement「Ratchet Allowlist Documents Known Divergences」を MODIFIED として、allowlist の scope が `src/core/` 内だけでなく B-3（shared-kernel/persistence → core）と B-4（util → any）の violation も含むことを反映する
- [x] delta spec format に従い `## Requirements` セクション配下に配置する。`### Requirement:` header は baseline と完全一致させる

**Acceptance Criteria**:
- delta spec が `specrunner/changes/arch-upward-edge-ratchet/specs/module-boundary/spec.md` に存在する
- MODIFIED Requirement の header が baseline と完全一致する
- 各 Requirement に最低 1 つの Scenario がある
- 本文に `SHALL` or `MUST` が含まれる

## T-06: verification

- [x] `bun run build` が成功する
- [x] `bun run typecheck` が成功する
- [x] `bun run lint` が成功する
- [x] `bun run test` が成功する（B-3/B-4 test を含む全 suite が green）

**Acceptance Criteria**:
- 4 コマンド全てが exit code 0 で完了する
