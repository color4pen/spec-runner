# Test Cases: arch-closure-src-wide

## Summary

- **Total**: 40 cases
- **Automated** (unit/integration): 40
- **Manual**: 0
- **Priority**: must: 33, should: 5, could: 2

---

### TC-001: Layer Classifier — cli/ を composition-root に分類

**Category**: unit  
**Priority**: must  
**Source**: T-01 classifyLayer acceptance criteria

**GIVEN** `classifyLayer` 関数が実装されており  
**WHEN** `src/cli/commands/run.ts` を入力すると  
**THEN** `"composition-root"` が返される

---

### TC-002: Layer Classifier — core/runtime/ を composition-root に分類（longest-match）

**Category**: unit  
**Priority**: must  
**Source**: T-01「パス prefix の longest-match で分類」, design D2

**GIVEN** `classifyLayer` 関数が実装されており  
**WHEN** `src/core/runtime/agent-runner.ts` を入力すると  
**THEN** `"composition-root"` が返される（`core/` より `core/runtime/` が優先）

---

### TC-003: Layer Classifier — core/port/ を ports に分類

**Category**: unit  
**Priority**: must  
**Source**: T-01, design D2

**GIVEN** `classifyLayer` 関数が実装されており  
**WHEN** `src/core/port/agent-port.ts` を入力すると  
**THEN** `"ports"` が返される

---

### TC-004: Layer Classifier — core/（port/ / runtime/ 以外）を domain に分類

**Category**: unit  
**Priority**: must  
**Source**: T-01, design D2「`src/core/` (上記以外) → `"domain"`」

**GIVEN** `classifyLayer` 関数が実装されており  
**WHEN** `src/core/event/types.ts` を入力すると  
**THEN** `"domain"` が返される

---

### TC-005: Layer Classifier — adapter/ を adapters に分類

**Category**: unit  
**Priority**: must  
**Source**: T-01, request「adapter/ は一切スキャンされず」

**GIVEN** `classifyLayer` 関数が実装されており  
**WHEN** `src/adapter/claude-code/adapter.ts` を入力すると  
**THEN** `"adapters"` が返される

---

### TC-006: Layer Classifier — auth/ を adapters に分類

**Category**: unit  
**Priority**: must  
**Source**: T-01（`src/auth/` → `"adapters"`）

**GIVEN** `classifyLayer` 関数が実装されており  
**WHEN** `src/auth/token-provider.ts` を入力すると  
**THEN** `"adapters"` が返される

---

### TC-007: Layer Classifier — store/ を persistence に分類

**Category**: unit  
**Priority**: must  
**Source**: T-01

**GIVEN** `classifyLayer` 関数が実装されており  
**WHEN** `src/store/session-store.ts` を入力すると  
**THEN** `"persistence"` が返される

---

### TC-008: Layer Classifier — shared-kernel ディレクトリ群を shared-kernel に分類

**Category**: unit  
**Priority**: must  
**Source**: T-01（config/state/git/parser/prompts/logger/templates）

**GIVEN** `classifyLayer` 関数が実装されており  
**WHEN** `src/config/app-config.ts`, `src/state/session.ts`, `src/git/status.ts`, `src/parser/xml.ts`, `src/prompts/base.ts`, `src/logger/index.ts`, `src/templates/prompt.ts` をそれぞれ入力すると  
**THEN** すべて `"shared-kernel"` が返される

---

### TC-009: Layer Classifier — errors.ts を shared-kernel に分類

**Category**: unit  
**Priority**: must  
**Source**: T-01（`src/errors.ts` → `"shared-kernel"`）

**GIVEN** `classifyLayer` 関数が実装されており  
**WHEN** `src/errors.ts` を入力すると  
**THEN** `"shared-kernel"` が返される

---

### TC-010: Layer Classifier — util/ を leaf に分類

**Category**: unit  
**Priority**: must  
**Source**: T-01

**GIVEN** `classifyLayer` 関数が実装されており  
**WHEN** `src/util/string-utils.ts` を入力すると  
**THEN** `"leaf"` が返される

---

### TC-011: Layer Classifier — kernel/ を leaf に分類

**Category**: unit  
**Priority**: must  
**Source**: T-01, request「src/kernel/ を leaf 相当（import ゼロ）として扱う」

**GIVEN** `classifyLayer` 関数が実装されており  
**WHEN** `src/kernel/event-bus.ts` を入力すると  
**THEN** `"leaf"` が返される

---

### TC-012: Layer Classifier — 未知パスは null を返す

**Category**: unit  
**Priority**: must  
**Source**: T-01「上記以外 → null（分類不能 — テストが検出して報告すべき）」

**GIVEN** `classifyLayer` 関数が実装されており  
**WHEN** `src/unknown-dir/foo.ts` を入力すると  
**THEN** `null` が返される

---

### TC-013: DSM Whitelist — adapters の許可 target が正しい

**Category**: unit  
**Priority**: must  
**Source**: T-01, design D1「§3 の表を 1:1 で転写」

**GIVEN** `DSM_WHITELIST` 定数が定義されており  
**WHEN** `DSM_WHITELIST["adapters"]` を参照すると  
**THEN** `{"ports", "shared-kernel", "leaf", "ext-sdk"}` のみを含み、`"domain"`, `"composition-root"`, `"persistence"` を含まない

---

### TC-014: DSM Whitelist — leaf の許可 target は空集合

**Category**: unit  
**Priority**: must  
**Source**: T-01（`"leaf"`: `{}`）

**GIVEN** `DSM_WHITELIST` 定数が定義されており  
**WHEN** `DSM_WHITELIST["leaf"]` を参照すると  
**THEN** 空の Set（`size === 0`）が返される

---

### TC-015: DSM Whitelist — ports の許可 target に domain が含まれない（△ strict 扱い）

**Category**: unit  
**Priority**: must  
**Source**: T-01, design D6「ports → domain (△) を strict に forbidden として扱う」

**GIVEN** `DSM_WHITELIST` 定数が定義されており  
**WHEN** `DSM_WHITELIST["ports"]` を参照すると  
**THEN** `"domain"` を含まない（`{"shared-kernel", "leaf"}` のみ）

---

### TC-016: DSM Whitelist — composition-root の許可 target に ext-sdk が含まれない

**Category**: unit  
**Priority**: must  
**Source**: T-01（`"composition-root"`: ext-sdk ✗）

**GIVEN** `DSM_WHITELIST` 定数が定義されており  
**WHEN** `DSM_WHITELIST["composition-root"]` を参照すると  
**THEN** `"ext-sdk"` を含まない

---

### TC-017: DSM Whitelist — shared-kernel の許可 target に domain が含まれない

**Category**: unit  
**Priority**: must  
**Source**: T-01（`"shared-kernel"`: `{"shared-kernel", "leaf"}`）

**GIVEN** `DSM_WHITELIST` 定数が定義されており  
**WHEN** `DSM_WHITELIST["shared-kernel"]` を参照すると  
**THEN** `"domain"`, `"ports"`, `"adapters"`, `"composition-root"`, `"persistence"` を含まない

---

### TC-018: Import Edge Scanner — ext-SDK import を ext-sdk として分類

**Category**: unit  
**Priority**: must  
**Source**: T-01, T-02「`@anthropic-ai/*` or `@openai/*` → target = `"ext-sdk"`」

**GIVEN** `src/adapter/claude-code/adapter.ts` が `import { Anthropic } from "@anthropic-ai/sdk"` を含み  
**WHEN** `scanImportEdges` がその import を処理すると  
**THEN** target layer が `"ext-sdk"` として分類される

---

### TC-019: Import Edge Scanner — node:* / zod 等の一般パッケージをスキップ

**Category**: unit  
**Priority**: must  
**Source**: T-02, design D7「node:* builtins や zod 等の一般パッケージはスキップ」

**GIVEN** `src/core/event/types.ts` が `import { z } from "zod"` と `import { readFile } from "node:fs"` を含み  
**WHEN** `scanImportEdges` を実行すると  
**THEN** それらの import は forbidden edge リストに一切含まれない

---

### TC-020: Import Edge Scanner — 相対パスを正確に解決する（深い `../`）

**Category**: unit  
**Priority**: must  
**Source**: T-02, design risk「相対パスの解決が不正確（`../` の深さ計算ミス等）」

**GIVEN** `src/adapter/claude-code/adapter.ts` が `../../core/event/types.ts` を import し  
**WHEN** `scanImportEdges` が path.resolve で相対パスを解決すると  
**THEN** target は `src/core/event/types.ts` → `"domain"` に分類される

---

### TC-021: Import Edge Scanner — 同一層内参照は forbidden edge に含まれない

**Category**: unit  
**Priority**: must  
**Source**: T-02「同一層内の import（sourceLayer === targetLayer）は自己参照として許可」

**GIVEN** `src/core/event/types.ts`（domain）が `src/core/step/step.ts`（domain）を import し  
**WHEN** `scanImportEdges` を実行すると  
**THEN** その edge は forbidden edge リストに含まれない

---

### TC-022: Import Edge Scanner — テストファイル（.test.ts）を除外する

**Category**: unit  
**Priority**: should  
**Source**: T-02「テストファイル（`__tests__/`, `.test.ts`）を除外」

**GIVEN** `src/core/__tests__/foo.test.ts` が forbidden な import を含む  
**WHEN** `scanImportEdges` を実行すると  
**THEN** そのファイルの import はスキャン対象から除外される

---

### TC-023: Import Edge Scanner — __tests__/ ディレクトリを除外する

**Category**: unit  
**Priority**: should  
**Source**: T-02「テストファイル（`__tests__/`, `.test.ts`）を除外」

**GIVEN** `src/adapter/__tests__/adapter.test.ts` が forbidden な import を含む  
**WHEN** `scanImportEdges` を実行すると  
**THEN** そのファイルの import はスキャン対象から除外される

---

### TC-024: Closure Test 存在確認 — describe ブロックが末尾に存在する

**Category**: integration  
**Priority**: must  
**Source**: T-03「既存コードは一切変更しない」, AC「新規 describe が末尾に追加されている」

**GIVEN** `core-invariants.test.ts` を参照すると  
**WHEN** ファイル内の describe ブロック順序を確認すると  
**THEN** `describe("DSM closure — §3 全層 whitelist enforcement")` が B-1〜B-9 ブロックより後（末尾）に存在する

---

### TC-025: Closure Test — adapter/ が検査対象に含まれる

**Category**: integration  
**Priority**: must  
**Source**: T-03, request AC「adapter/ と src/kernel/ を含む src 全体の closure 検査が存在」

**GIVEN** `describe("DSM closure — §3 全層 whitelist enforcement")` テストブロックが実行され  
**WHEN** `src/adapter/` 配下のファイルを scanImportEdges でスキャンすると  
**THEN** `src/adapter/` のファイルが forbidden edge の source として検出対象になっている（スキャン漏れなし）

---

### TC-026: Closure Test — src/kernel/ の import ゼロが assert される

**Category**: integration  
**Priority**: must  
**Source**: T-03「`it("src/kernel/ は import ゼロ（leaf 相当）")`」

**GIVEN** `it("src/kernel/ は import ゼロ（leaf 相当）")` テストが実行され  
**WHEN** `src/kernel/` 配下の全ファイルを検索すると  
**THEN** `from "` を含む行が 0 件であることが assert される（allowlist を使わず strict に 0 要求）

---

### TC-027: Closure Test — allowlist 除外後に green

**Category**: integration  
**Priority**: must  
**Source**: T-03, T-04 AC「allowlist 込みで全テスト green」

**GIVEN** 既存 divergence を `invariant: "DSM"` で arch-allowlist.ts に全件登録した状態で  
**WHEN** `bun run test -- tests/unit/architecture/core-invariants.test.ts` を実行すると  
**THEN** DSM closure describe ブロックが green で完了する

---

### TC-028: Allowlist — adapter→domain divergence が全件列挙されている

**Category**: integration  
**Priority**: must  
**Source**: T-04, request「divergence が grep authoritative に全件列挙されている」

**GIVEN** `scanImportEdges` による authoritative scan を実行し  
**WHEN** adapter→domain の forbidden edge を全件収集して arch-allowlist.ts と照合すると  
**THEN** scan で検出された全 violation が `invariant: "DSM"` エントリとして存在し、漏れがない

---

### TC-029: Allowlist — ports→domain divergence が全件列挙されている

**Category**: integration  
**Priority**: must  
**Source**: T-04「ports → domain (△ strict 扱い): `core/port/` が type を import」

**GIVEN** `scanImportEdges` による authoritative scan を実行し  
**WHEN** ports→domain の forbidden edge を全件収集して arch-allowlist.ts と照合すると  
**THEN** scan で検出された全 violation が `invariant: "DSM"` エントリとして存在し、漏れがない

---

### TC-030: Allowlist — 各エントリに file / invariant / tracking / comment が記載される

**Category**: integration  
**Priority**: must  
**Source**: T-04 AC「各エントリに file, pattern, invariant, tracking, comment が記載」

**GIVEN** arch-allowlist.ts の DSM エントリを参照すると  
**WHEN** 各 `AllowlistEntry` オブジェクトを確認すると  
**THEN** `file`, `pattern`, `invariant: "DSM"`, `tracking`（`DSM-<src-layer>-<tgt-layer>-<short-id>` 形式）, `comment` がすべて非空で存在する

---

### TC-031: Regression Guard — 新規 adapter→domain forbidden edge を検出する

**Category**: unit  
**Priority**: must  
**Source**: T-05, request AC「§3 whitelist に無い新規 edge を足すと suite が red（regression guard を実テストで実証）」

**GIVEN** `it("detects new forbidden adapter→domain import not in allowlist (DSM regression guard)")` が存在し  
**WHEN** allowlist に未登録の adapter→domain import を仮想 GrepMatch として inject すると  
**THEN** filterViolations 後に violation が 1 件以上残り、テストが red を実証する

---

### TC-032: Regression Guard — 新規 shared-kernel→domain forbidden edge を検出する

**Category**: unit  
**Priority**: must  
**Source**: T-05

**GIVEN** `it("detects new forbidden shared-kernel→domain import not in allowlist (DSM regression guard)")` が存在し  
**WHEN** allowlist に未登録の shared-kernel→domain import を inject すると  
**THEN** violation が 1 件以上残り、テストが検出を実証する

---

### TC-033: 既存テスト無改変 — B-1〜B-9 が無改変で green

**Category**: integration  
**Priority**: must  
**Source**: T-03, request AC「既存 B-1〜B-9 test が無改変で green のまま」

**GIVEN** 本 change の実装後  
**WHEN** `bun run test -- tests/unit/architecture/core-invariants.test.ts` を実行すると  
**THEN** B-1 から B-9 の全 it ブロックが変更なし・green で完了する

---

### TC-034: Delta Spec — 正規パスに spec.md が存在する

**Category**: integration  
**Priority**: must  
**Source**: T-06 AC「delta spec が正規パスに存在」

**GIVEN** change の実装が完了すると  
**WHEN** `specrunner/changes/arch-closure-src-wide/specs/module-boundary/spec.md` を参照すると  
**THEN** ファイルが存在し、`## Requirements` ヘッダ下に少なくとも 2 つの Requirement が記載されている

---

### TC-035: Delta Spec — normative keyword (SHALL/MUST) が含まれる

**Category**: integration  
**Priority**: must  
**Source**: T-06 AC「各 Requirement に SHALL/MUST normative keyword が含まれる」

**GIVEN** `specrunner/changes/arch-closure-src-wide/specs/module-boundary/spec.md` が存在し  
**WHEN** Requirement 本文を確認すると  
**THEN** 各 Requirement に `SHALL` または `MUST` が少なくとも 1 つ含まれる

---

### TC-036: Delta Spec — 各 Requirement に Scenario が存在する

**Category**: integration  
**Priority**: must  
**Source**: T-06 AC「各 Requirement に最低 1 つの Scenario が存在」

**GIVEN** `specrunner/changes/arch-closure-src-wide/specs/module-boundary/spec.md` を参照すると  
**WHEN** 各 Requirement を確認すると  
**THEN** Requirement ごとに最低 1 つの Scenario が存在する

---

### TC-037: Verification — bun run build が成功

**Category**: integration  
**Priority**: must  
**Source**: T-07 AC「プロジェクト標準 verification 4 コマンドすべて exit 0」

**GIVEN** 本 change の全実装が完了した状態で  
**WHEN** `bun run build` を実行すると  
**THEN** exit code 0 で完了する

---

### TC-038: Verification — bun run typecheck が成功

**Category**: integration  
**Priority**: must  
**Source**: T-07

**GIVEN** 本 change の全実装が完了した状態で  
**WHEN** `bun run typecheck` を実行すると  
**THEN** TypeScript コンパイルエラーなしで exit code 0 になる

---

### TC-039: Verification — bun run lint が成功

**Category**: integration  
**Priority**: must  
**Source**: T-07

**GIVEN** 本 change の全実装が完了した状態で  
**WHEN** `bun run lint` を実行すると  
**THEN** lint エラーなしで exit code 0 になる

---

### TC-040: Verification — bun run test が全件 green

**Category**: integration  
**Priority**: must  
**Source**: T-07 AC「新規テスト + 既存テスト全て green」

**GIVEN** 本 change の全実装が完了した状態で  
**WHEN** `bun run test` を実行すると  
**THEN** 新規 DSM closure テスト・regression guard テスト・既存 B-1〜B-9 を含む全テストが green になる

---

### TC-041: Ratchet 規約 — allowlist に無い新規 edge が suite を red にする

**Category**: integration  
**Priority**: must  
**Source**: request「§3 whitelist に無い新規 edge を足すと red」, request AC

**GIVEN** arch-allowlist.ts に登録されていない forbidden edge が inject された状態で  
**WHEN** DSM closure テストを実行すると  
**THEN** テストが red になる（violation が 0 件にならない）

---

### TC-042: Ratchet 規約 — allowlist 削除後に対応する divergence が red を引き起こす

**Category**: integration  
**Priority**: should  
**Source**: request「ratchet 規約を継承: allowlist は削除のみ」

**GIVEN** arch-allowlist.ts から特定の DSM エントリを削除した状態で  
**WHEN** `bun run test -- tests/unit/architecture/core-invariants.test.ts` を実行すると  
**THEN** 該当 violation が allowlist 適用後も残り、テストが red になる

---

### TC-043: ports → domain (△ strict) — 現状 type import が allowlist に登録されている

**Category**: integration  
**Priority**: should  
**Source**: design D6「strict に forbidden とし allowlist で凍結」

**GIVEN** `src/core/port/` 配下のファイルが `src/core/` の type を import しており  
**WHEN** `scanImportEdges` を実行すると  
**THEN** 検出された ports→domain edge がすべて `invariant: "DSM"` の allowlist エントリとして存在し、未登録の violation がない

---

### TC-044: TypeScript — LayerName 型がコンパイル可能

**Category**: unit  
**Priority**: should  
**Source**: T-01 AC「TypeScript としてコンパイル可能」

**GIVEN** `LayerName` 型が定義されており  
**WHEN** `bun run typecheck` を実行すると  
**THEN** `LayerName` の使用箇所で型エラーが発生しない

---

### TC-045: 分類不能ファイルの検出と報告

**Category**: integration  
**Priority**: could  
**Source**: T-01「null（分類不能 — テストが検出して報告すべき）」

**GIVEN** `src/` 配下に `classifyLayer` が null を返す未知パス prefix のファイルが存在し  
**WHEN** `scanImportEdges` または closure test を実行すると  
**THEN** 分類不能ファイルが存在することがテスト出力で報告される（サイレントスキップしない）

---

### TC-046: ext-sdk — @openai/* を ext-sdk として分類

**Category**: unit  
**Priority**: could  
**Source**: T-01「import path が `@anthropic-ai/` または `@openai/` で始まる場合 → target layer = `"ext-sdk"`」

**GIVEN** `src/adapter/codex/adapter.ts` が `import { OpenAI } from "@openai/sdk"` を含み  
**WHEN** `scanImportEdges` がその import を処理すると  
**THEN** target layer が `"ext-sdk"` として分類される

---

## Result

```yaml
result: completed
total: 46
automated: 46
manual: 0
must: 33
should: 8
could: 5
blocked_reasons: []
```
