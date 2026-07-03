# Conformance Result

<!-- FORMAT REQUIREMENTS (machine-parsed):
- verdict line format (exact): `- **verdict**: <value>` at the start of a line
- Valid verdict values: approved | needs-fix | escalation
  - approved:   implementation conforms to tasks.md, design.md, spec.md, and request.md
  - needs-fix:  one or more upstream artifacts are not satisfied by the implementation
  - escalation: conformance cannot be determined (missing artifacts, unresolvable ambiguity)
- The Findings table records the per-artifact judgment.
-->

- **verdict**: approved

## Conformance Findings

| Artifact | Conforms | Notes |
|----------|----------|-------|
| tasks.md | ✅ | T-01〜T-10 すべてのチェックボックスが `[x]` で完了済み |
| design.md | ✅ | D1〜D7 すべて実装に反映。minor: mark-hook の `stderrWrite` パラメータは設計署名から省略され orchestrator に委譲されているが、動作は設計意図に合致 |
| spec.md | ✅ | 8 つの Requirement すべてについてテストで固定された振る舞いが実装されている |
| request.md | ✅ | 9 つの受け入れ基準すべてが満たされている（425 test files / 5738 tests green、typecheck/lint/build 成功） |

---

## 詳細

### tasks.md

T-01〜T-10 の全チェックボックスが `[x]`。未完了項目なし。

### design.md — 設計判断の反映

| 決定 | 実装ファイル | 判定 |
|------|------------|------|
| D1: `designLayer` config + `resolveDesignLayerConfig` | `src/config/schema.ts`（`DesignLayerConfig` interface、zod schema、`resolveDesignLayerConfig()`）| ✅ |
| D2: 入口ゲートを単一モジュールに、preflight と validate から呼ぶ | `src/core/design-layer/check-gate.ts`、`preflight.ts:105`、`request.ts:160` | ✅ |
| D3: 出口 hook を archive コミット直前に挿入、feature ブランチに相乗り | `src/core/design-layer/mark-hook.ts`、`orchestrator.ts:283-298`（`git add specrunner/changes/` の直後・`commitArchive` の直前） | ✅ |
| D4: doctor check を `commonChecks` に登録 | `src/core/doctor/checks/runtime/aozu-cli.ts`、`checks/index.ts:56` | ✅ |
| D5: テンプレに任意引用セクションを追加、プロンプトと docs を整合 | `request.ts:buildScaffoldTemplate()`、`request-generate-system.ts`、`docs/request-authoring.md` | ✅ |
| D6: テストは fake で契約を固定、aozu 実物に依存しない | 全テストで注入 `SpawnFn` / `execFile` 使用。TC-010 も fakeSpawn のみ | ✅ |
| D7: `git add -A` で aozu の書き込みを捕捉 | `mark-hook.ts:62`：exit 0 後に `spawn("git", ["add", "-A"], { cwd })` | ✅ |

**非ブロッキング観察**: `mark-hook.ts` の `MarkHookParams` に `stdoutWrite / stderrWrite` が含まれない。設計 D3 の署名では言及されているが、実装は警告出力を orchestrator に委ねる「caller decides」アーキテクチャを採用。動作は等価で、TC-ORCH-DL-003 で orchestrator レベルの警告継続が確認済み。

### spec.md — Requirements と Scenarios

| Requirement | テスト | 判定 |
|-------------|--------|------|
| 無効時に aozu を一切 spawn しない | TC-GATE-001、TC-HOOK-001、TC-ORCH-DL-001、TC-DOCTOR-001 | ✅ |
| 有効時、引用未解決の request を入口で不合格 | TC-GATE-003/004/005、TC-005（preflight） | ✅ |
| 有効時、合格 request は従来どおり進行 | TC-GATE-002 | ✅ |
| `--require-citation` を列挙 type にのみ付与 | TC-GATE-006（付与あり）、TC-GATE-007（付与なし） | ✅ |
| mark hook が worktree 内で実行され archive コミットに含まれる | TC-010（実 temp git repo + fakeSpawn、`git show --name-only HEAD` で確認） | ✅ |
| mark exit 1 は警告継続、exit 2 は失敗 | TC-ORCH-DL-003（exit 1 → exitCode 0）、TC-ORCH-DL-004（exit 2 → exitCode 1） | ✅ |
| doctor が結線有効かつ aozu 不在を検出 | TC-DOCTOR-002（fail + hint）、TC-DOCTOR-001（disabled → pass） | ✅ |
| request テンプレに設計要素引用セクションを含める | TC-TMPL-DL-001〜005 | ✅ |

### request.md — 受け入れ基準

| 受け入れ基準 | 判定 |
|--------------|------|
| config 無効時 aozu 一切 spawn されず既存挙動不変（既存テスト無変更で green） | ✅ |
| 有効 + fake exit 1 で validate/preflight が不合格、診断が出力に含まれる | ✅ |
| 有効 + fake exit 0 で従来どおり進行 | ✅ |
| 列挙 type で `--require-citation` あり、非列挙 type でなし | ✅ |
| archive 経路で mark が worktree 内で実行、fake state 変更が feature ブランチのコミットに含まれる | ✅ |
| mark exit 1 が archive を失敗させず警告、exit 2 が失敗 | ✅ |
| doctor が結線有効かつ aozu CLI 不在を検出 | ✅ |
| `request template` 出力に設計要素引用セクションが含まれる | ✅ |
| 既存テスト無変更で green / typecheck green / lint green / build 成功 | ✅ 425 test files, 5738 tests; tsc --noEmit pass; eslint --max-warnings 0 pass; build 1.01 MB |

---

## 非ブロッキング指摘（承認を妨げない）

1. **mark-hook の `stderrWrite` パラメータ省略**: 設計 D3 の署名に含まれるが実装では orchestrator に委譲。動作等価。
2. **doctor probe flag の Open Question**: 設計書に明記された未解決事項。`--version` を使用しており、ENOENT 以外の reject も fail と判定する。doctor check のみへの影響で、gate/hook には影響しない。スコープ内で許容。
