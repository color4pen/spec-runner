# Spec Review Result: verification-tc-coverage

- **verdict**: needs-fix
- **reviewed-at**: 2026-05-19
- **reviewer**: spec-reviewer

---

## Summary

設計方針・ADR判断・タスク分割・delta spec いずれも論理的に整合しており、構造として承認に近い水準にある。ただし、**実装が design.md の記述通りに進むと動かない具体的なバグが1件**あり、TypeScript 型の扱いに関する未指定事項が1件ある。この2点の修正が必要。

---

## Critical Issues (needs-fix)

### C-1: TC ID 抽出 regex が実際の test-cases.md フォーマットと不一致

**場所**: `design.md` L75、T-02 の処理手順

design.md は以下の regex を指定している:

```
^### (TC-\d+(?:-\d+)*):.*\n.*\n\*\*Priority\*\*:\s*must
```

しかし実際の test-cases.md フォーマット（`request-review-command/test-cases.md` を参照）は:

```markdown
## TC-01: コマンド登録

- **Category**: CLI Integration
- **Priority**: must
```

- **heading level**: design.md は `###`(h3) だが実ファイルは `##`(h2)
- **line offset**: Priority は header から 3 行後（blank → Category → Priority）だが regex は 2 行後を想定
- **bullet prefix**: 実ファイルは `- **Priority**: must` だが regex は bullet なしを想定

test-case-gen-system.ts prompt が指定する h3 フォーマットでも同様に行オフセットが 1 行足りない（blank → Category → Priority の 3 行）。

**影響**: design.md の regex をそのまま実装すると、test-coverage phase は must TC を常に 0 件と判定し `status: "passed"` を誤返却するか、全件 missing と誤判定する。

**修正方針**: T-02 が「ヘッダ行に続く行群から `**Priority**: must` を持つものを抽出」と柔軟に記述しているのが正解に近い。design.md の具体的な regex 記述を削除し、実装に以下のアプローチを採用することを明記する:
1. `^##[#]?\s+(TC-\d+(?:-\d+)*)` で TC section header を全列挙
2. 各 section の後続行群を次の `##` まで走査し `\*\*Priority\*\*:\s*must` の存在で判定
3. bullet prefix (`- **Priority**`) と非 bullet (`**Priority**`) の両方を許容

---

### C-2: `PHASE_SCRIPTS` の TypeScript 型が `test-coverage` 追加後に不整合

**場所**: `phases.ts` + T-01

現在の型定義:

```typescript
export const PHASE_SCRIPTS: Record<PhaseName, string> = { ... }
```

T-01 では `PhaseName` に `"test-coverage"` を追加し、`PHASE_SCRIPTS` にはキーを追加しないと指定している。この組み合わせは TypeScript のコンパイルエラーになる（`Property 'test-coverage' is missing in type`）。

design.md は「`phaseName in PHASE_SCRIPTS` で判定する」と処理分岐を説明しているが、型の修正方法を指定していない。

**修正方針**: T-01 に型変更を明記する。推奨は以下のいずれか:

```typescript
// 案 A: スクリプト実行 phase のみを型として明示
export type ScriptPhaseName = Exclude<PhaseName, "test-coverage">;
export const PHASE_SCRIPTS: Record<ScriptPhaseName, string> = { ... }

// 案 B: Partial 化（runtime check 必須）
export const PHASE_SCRIPTS: Partial<Record<PhaseName, string>> = { ... }
```

案 A の方が型安全で明示的。runner.ts 側で `phaseName in PHASE_SCRIPTS` の判定結果が型ガードとして機能するためにも案 A を推奨。

---

## Minor Issues (fix or acknowledge)

### M-1: skipped phase の出力文言が test-coverage に不適切

`writeVerificationResult` は skipped phase に `"_(skipped — script not found in package.json)_"` をハードコードしている。test-coverage の skip 理由は "test-cases.md not found" であり、この文言は誤解を招く。

**修正方針**: `TestCoverageResult` の `stdout` フィールドに skip 理由を含め（例: `"test-cases.md not found at specrunner/changes/<slug>/test-cases.md"`）、runner.ts の分岐で test-coverage skipped の場合は stdout をそのまま出力する。または `writeVerificationResult` に phase 判定を追加する。

---

## Positive Observations

- ADR-1 (TC ID 形式統一)、ADR-2 (verification 集約)、ADR-3 (CLI 内部処理) の根拠が明快で、いずれも妥当な判断
- fail-fast 順序（test-coverage が末尾）の理由が明確に説明されている
- test-cases.md 不在時の skipped 扱いが既存設計と整合している
- build-fixer との連携設計（verification-result.md の `## Phase: test-coverage` セクションを読む）が自然
- T-08〜T-10 のテスト網羅度は十分
- セキュリティ観点: file I/O のみで認証・ネットワーク・外部入力処理なし。OWASP 懸念なし

---

## Required Changes Before Approval

1. **design.md**: L75 の具体的 regex を削除し、section-scan アプローチ（上記 C-1 修正方針）を記述する
2. **T-01**: `PHASE_SCRIPTS` の型変更（`ScriptPhaseName` または `Partial`）を明記する
3. **design.md / T-03**: runner.ts の `phaseName in PHASE_SCRIPTS` 判定が型ガードとして機能するよう `PHASE_SCRIPTS` 型との整合を確認する旨を追記する
4. (Optional) **M-1**: skipped 出力文言の対処方針を設計に追記する
