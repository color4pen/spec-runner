# Tasks: arch-closure-src-wide

## T-01: DSM データモデル定義（層分類器 + whitelist 定数）

`core-invariants.test.ts` 内に以下の helper を追加する。

- [x] `LayerName` 型を定義: `"composition-root" | "domain" | "ports" | "adapters" | "persistence" | "shared-kernel" | "leaf" | "ext-sdk"`
- [x] `classifyLayer(filePath: string): LayerName | null` 関数を実装。パス prefix の longest-match で分類:
  - `src/cli/` → `"composition-root"`
  - `src/core/runtime/` → `"composition-root"`
  - `src/core/port/` → `"ports"`
  - `src/core/` (上記以外) → `"domain"`
  - `src/adapter/`, `src/auth/` → `"adapters"`
  - `src/store/` → `"persistence"`
  - `src/config/`, `src/state/`, `src/git/`, `src/parser/`, `src/prompts/`, `src/logger/`, `src/templates/` → `"shared-kernel"`
  - `src/errors.ts` → `"shared-kernel"`
  - `src/util/` → `"leaf"`
  - `src/kernel/` → `"leaf"`
  - 上記以外 → `null`（分類不能 — テストが検出して報告すべき）
- [x] `DSM_WHITELIST: Record<LayerName, Set<LayerName>>` 定数を §3 matrix から転写:
  - `"composition-root"`: `{"domain", "ports", "adapters", "persistence", "shared-kernel", "leaf"}` （ext-sdk ✗）
  - `"domain"`: `{"ports", "persistence", "shared-kernel", "leaf"}`
  - `"ports"`: `{"shared-kernel", "leaf"}` （domain △ → strict に forbidden、allowlist で grandfather）
  - `"adapters"`: `{"ports", "shared-kernel", "leaf", "ext-sdk"}`
  - `"persistence"`: `{"shared-kernel", "leaf"}`
  - `"shared-kernel"`: `{"shared-kernel", "leaf"}` （内部は leaf 方向のみ + 同層参照可 ²）
  - `"leaf"`: `{}` （import ゼロ）
- [x] ext-SDK 判定: import path が `@anthropic-ai/` または `@openai/` で始まる場合 → target layer = `"ext-sdk"`。`node:*`, `zod` 等の一般パッケージはスキップ（分類対象外）

**Acceptance Criteria**:
- `classifyLayer` が §2 mapping の全パス prefix を正しく分類する
- `DSM_WHITELIST` が §3 matrix と一致する（7 行 × allowed targets）
- TypeScript としてコンパイル可能

## T-02: import edge スキャナー実装

`core-invariants.test.ts` 内に全 src/ の import edge を解析する helper を追加する。

- [x] `scanImportEdges()` 関数を実装:
  1. `grepE('from "'`, 'src/')` で全 import 文を一括取得（プロジェクト内 single-quote import は無し）
  2. `parseGrepOutput()` で構造化（既存 helper を再利用）
  3. テストファイル（`__tests__/`, `.test.ts`）を除外
  4. 各 match から import path を抽出（`from "xxx"` の `xxx` 部分）
  5. import path の分類:
     - 相対パス（`./` or `../`）→ source ファイルのディレクトリから `path.resolve` で絶対パスを算出し、ROOT からの相対パスに変換 → `classifyLayer()` で target 層を判定
     - `@anthropic-ai/*` or `@openai/*` → target = `"ext-sdk"`
     - それ以外（`node:*`, `zod`, `vitest` 等）→ スキップ
  6. 戻り値: `{ source: GrepMatch; sourceLayer: LayerName; targetLayer: LayerName }[]` のうち、`DSM_WHITELIST[sourceLayer]` に `targetLayer` が含まれない edge のみ（= forbidden edge）
- [x] 同一層内の import（sourceLayer === targetLayer）は自己参照として許可（§3 の「—」セル）

**Acceptance Criteria**:
- 相対パスの解決が正確（`../` の深さを正しく計算）
- ext-SDK import を正しく検出
- 一般パッケージ import をスキップ
- 同一層内参照を許可

## T-03: DSM closure テスト `describe` ブロック追加

`core-invariants.test.ts` の **末尾**（既存 B-9 / T-04 ブロックの後）に新規 `describe` を追加する。**既存コードは一切変更しない。**

- [x] `describe("DSM closure — §3 全層 whitelist enforcement")` を追加
- [x] `it("§3 whitelist に無い import edge は存在しない（allowlist 除外後）")` を実装:
  1. T-02 の `scanImportEdges()` で全 forbidden edge を取得
  2. `ARCH_ALLOWLIST.filter(e => e.invariant === "DSM")` で DSM 用 allowlist エントリを取得
  3. `filterViolations()` で allowlist を適用
  4. `expect(violationLines(violations)).toEqual([])` で assert
- [x] `it("src/kernel/ は import ゼロ（leaf 相当）")` を実装:
  - `src/kernel/` 内のファイルで `from "` を含む行が 0 であることを assert
  - allowlist を使わず strict に 0 を要求（kernel は新設で divergence 無しが前提）

**Acceptance Criteria**:
- 既存 B-1〜B-9 / T-04 テストブロックが無改変
- 新規 describe が末尾に追加されている
- allowlist 込みで全テスト green
- src/kernel/ の import ゼロが assert される

## T-04: authoritative divergence スキャン + allowlist エントリ追加

T-02/T-03 の実装後、実際に scan を実行して全 divergence を特定し `arch-allowlist.ts` に追加する。

- [x] `bun run test -- tests/unit/architecture/core-invariants.test.ts` を実行して violation 一覧を取得
- [x] 各 violation に対して `arch-allowlist.ts` に `AllowlistEntry` を追加:
  - `invariant`: `"DSM"`
  - `tracking`: `DSM-<src-layer>-<tgt-layer>-<short-id>` 形式（例: `DSM-adapter-domain-cc-event`）
  - `comment`: どの禁止 edge に該当するか（例: `"adapter → domain: claude-code が core/event/types.js を直接 import"`)
- [x] 確定した主要 divergence カテゴリ（authoritative scan で確定）:
  - **adapter → domain**: claude-code/codex/managed-agent が `core/event/`, `core/types.ts`, `core/step/`, `core/tools/`, `core/lifecycle/`, `core/agent/` を import（13 entries）
  - **domain → composition-root**: `core/preflight.ts`, `core/types.ts`, `core/command/` が `core/runtime/` の型を import（5 entries）
  - **ports → domain** (△ strict 扱い): `core/port/` が `core/agent/`, `core/step/`, `core/event/`, `core/tools/` を import（4 entries）
- [x] 追加後に test suite が green であることを確認（全 3289 tests pass）

**Acceptance Criteria**:
- grep authoritative に全件列挙されている（scan 実行結果と allowlist が 1:1 対応）
- 各エントリに file, pattern, invariant, tracking, comment が記載
- `bun run test -- tests/unit/architecture/core-invariants.test.ts` が green

## T-05: regression guard テスト追加

DSM closure の ratchet が機能することを実証するテストケースを T-04 regression guard describe 内に追加する。

- [x] `it("detects new forbidden adapter→domain import not in allowlist (DSM regression guard)")` を追加:
  - 仮想的な adapter→domain import を GrepMatch として inject
  - DSM allowlist でフィルタ後、1 件以上の violation が残ることを assert
- [x] `it("detects new forbidden shared-kernel→domain import not in allowlist (DSM regression guard)")` を追加:
  - 仮想的な shared-kernel→domain import を inject
  - violation が検出されることを assert

**Acceptance Criteria**:
- 各テストが allowlist に無い forbidden edge の検出を実証
- 既存 regression guard テストが無改変で green

## T-06: delta spec 作成

`specrunner/changes/arch-closure-src-wide/specs/module-boundary/spec.md` を作成する。

- [x] 新規 Requirement: `DSM Closure Enforcement Covers Entire src`
  - 内容: arch test が §3 DSM matrix を基準に src/ 全体の import edge を whitelist 突合し、許可外 edge を divergence として検出 SHALL
  - `src/adapter/` と `src/kernel/` が検査対象に含まれる MUST
  - Scenario: closure test が全層をスキャンする
  - Scenario: adapter→domain の forbidden edge が検出される
- [x] 新規 Requirement: `Physical kernel Directory Has Zero Imports`
  - 内容: `src/kernel/` 内のファイルは他モジュールを import しない MUST（leaf 相当）
  - Scenario: kernel ファイルが import 文を持たない

**Acceptance Criteria**:
- delta spec が正規パスに存在
- 各 Requirement に SHALL/MUST normative keyword が含まれる
- 各 Requirement に最低 1 つの Scenario が存在
- `## Requirements` ヘッダ下に記載（旧形式 ADDED/MODIFIED ヘッダ不使用）

## T-07: verification green 確認

- [x] `bun run build` が成功
- [x] `bun run typecheck` が成功
- [x] `bun run lint` が成功
- [x] `bun run test` が成功（新規テスト + 既存テスト全て green）

**Acceptance Criteria**:
- プロジェクト標準 verification 4 コマンドすべて exit 0
- 既存 B-1〜B-9 test が無改変で green
