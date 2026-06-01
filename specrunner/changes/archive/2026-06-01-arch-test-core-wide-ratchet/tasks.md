# Tasks: arch-test-core-wide-ratchet

## T-01: allowlist 定義ファイルの作成

- [x] `tests/unit/architecture/arch-allowlist.ts` を新規作成
- [x] AllowlistEntry 型を定義: `{ file: string; pattern: string; invariant: string; tracking: string; comment?: string }`
- [x] 以下の既知 divergence を allowlist エントリとして列挙:
  - B-2 / R2: `src/core/runtime/local.ts` — `@anthropic-ai/claude-agent-sdk` の直 import
  - B-1: `src/core/runtime/local.ts` — `adapter/claude-code/agent-runner` の import
  - B-1: `src/core/runtime/local.ts` — `adapter/dispatching/agent-runner` の import
  - B-1: `src/core/runtime/managed.ts` — `adapter/managed-agent/agent-runner` の import
  - B-8: `src/core/preflight.ts` — `config.runtime === "managed"` 分岐
  - B-8: `src/core/step/executor.ts` — `config.runtime` 分岐（4 箇所）
  - B-6: `src/core/preflight.ts` — raw `process.env` 参照（resolveGitHubToken / checkRuntimePrereqs）
  - B-6: `src/core/lifecycle/diagnostic.ts` — raw `process.env["SPECRUNNER_DEBUG"]`
  - B-6: `src/core/verification/commands.ts` — raw `process.env.PATH`
- [x] 各エントリに `invariant`（B-#）と `tracking`（R# or B#-xxx 識別子）を併記

**Acceptance Criteria**:
- allowlist ファイルが TypeScript としてコンパイル可能
- 全エントリに file / invariant / tracking が記載されている
- 実際の grep 結果と一致するエントリが網羅されている

## T-02: core-invariants テストファイルの作成（B-1〜B-4 依存方向）

- [x] `tests/unit/architecture/core-invariants.test.ts` を新規作成
- [x] layer-mapping 定義: パス prefix → 層名の対応（§2 に基づく）
  - `src/cli/`, `src/core/runtime/` → composition-root
  - `src/core/` (runtime/port 除く) → domain
  - `src/core/port/` → ports
  - `src/adapter/`, `src/auth/` → adapters
  - `src/store/` → persistence
  - `src/config/`, `src/state/`, `src/git/`, `src/parser/`, `src/prompts/`, `src/logger/`, `src/errors`, `src/templates/` → shared-kernel
  - `src/util/` → leaf
- [x] B-1 テスト: `src/core/`（runtime 除く）が `adapter/` を import していないことを assert（allowlist フィルタ付き）
- [x] B-2 テスト: `src/core/` が `@anthropic-ai/*` SDK を直 import していないことを assert（allowlist フィルタ付き）
- [x] B-3 テスト: 本 change では B-3 の違反（parser/config/state→core の逆方向）は core 外ファイルに起点があるため、直接スキャンは src-wide 拡張 change に委ねる。本 change の B-3 coverage は closure model チェック（core が shared-kernel を下方向に import することを forbidden edge として assert）で担保する
- [x] B-4 テスト: 本 change では B-4 の違反（util→core の逆方向）は core 外ファイルに起点があるため、直接スキャンは src-wide 拡張 change に委ねる。本 change の B-4 coverage は closure model チェック（core が leaf 層を適切な方向でのみ参照することを assert）で担保する
- [x] closure テスト: §3 の forbidden edges のうち core が from/to となる edge を網羅的に assert
- [x] allowlist import + フィルタロジック: grep 結果から allowlist 該当行を除外し、残りが空であることを assert

**Acceptance Criteria**:
- B-1〜B-4 の各不変条件に対応するテストブロックが存在
- allowlist 込みで全テスト green
- テストの describe/it 名が対応する invariant（B-#）を明記

## T-03: core-invariants テストファイルの作成（B-5〜B-8 call-site 制約）

- [x] B-5 テスト: `src/core/` 内の verdict / transition / spec-rules 相当ファイルで本物 I/O（`readFile\b|readFileSync\b|readdir\b|existsSync\b|statSync\b`）が直呼びされていないことを assert（`__tests__/` 除外。fs seam 経由は許容。現状違反がゼロなら allowlist エントリ不要で pass）
- [x] B-6 テスト: `src/core/` 内の `process.env` 直参照を検出（`stripSecrets` 経由は許容。allowlist フィルタ付き）
- [x] B-7 テスト: `src/core/` 内の `process\.(stdout|stderr)\.write\s*\(` にマッチする call-site を検出（`__tests__/` 除外。パターンを call-site 限定にすることで JSDoc コメント行の false positive を回避。ANSI 制御は許容。allowlist フィルタ付き）
- [x] B-8 テスト: `src/core/` 内の `config.runtime` 参照を検出し、`core/runtime/` 内のみ許容、それ以外は allowlist フィルタ

**Acceptance Criteria**:
- B-5/B-6/B-7/B-8 の各テストが存在し allowlist 込みで green
- `__tests__/` ディレクトリ内のテストコードは検出対象外
- B-7 パターンは call-site 限定（`process\.(stdout|stderr)\.write\s*\(`）で JSDoc false positive を出さない

## T-04: regression guard テスト

- [x] 「allowlist に無い forbidden edge を追加すると red になる」ことを実証するテストケースを追加
- [x] 手法: テスト内で仮想的な violation ファイルパスを grep 結果に inject し、allowlist にないため fail することを assert（実ファイルは不要 — grep 結果を mock するか、テスト用 fixture を用意）

**Acceptance Criteria**:
- `it("detects new forbidden edge not in allowlist")` 相当のテストが存在
- allowlist に含まれない import パスが検出されたときに test fail する動作が検証済み

## T-05: delta spec 作成

- [x] `specrunner/changes/arch-test-core-wide-ratchet/specs/module-boundary/spec.md` を作成
- [x] 既存 baseline の Requirement「Core Layer Has No Direct SDK Dependencies」を MODIFIED として scope 拡張を反映
- [x] 新規 Requirement: 「Architecture Enforcement Covers Entire Core」— core 全体を対象にした enforcement scope の宣言
- [x] 新規 Requirement: 「Ratchet Allowlist Documents Known Divergences」— allowlist 規約（file + B-# + tracking、削除のみ許容）
- [x] 新規 Requirement: 「Closure Model Prevents Unknown Edges」— allowlist に無い forbidden edge で red になること

**Acceptance Criteria**:
- delta spec が `specrunner/changes/arch-test-core-wide-ratchet/specs/module-boundary/spec.md` に存在
- 各 Requirement に少なくとも 1 つの Scenario が存在
- normative keyword（SHALL/MUST）が各 Requirement に含まれる

## T-06: verification green 確認

- [x] `bun run build` が成功すること
- [x] `bun run typecheck` が成功すること
- [x] `bun run lint` が成功すること
- [x] `bun run test` が成功すること（新規テスト含む）

**Acceptance Criteria**:
- プロジェクト標準 verification 4 コマンドすべてが exit 0
