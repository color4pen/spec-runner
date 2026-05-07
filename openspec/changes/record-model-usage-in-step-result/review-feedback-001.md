# Code Review — record-model-usage-in-step-result

- **reviewer**: code-reviewer
- **iteration**: 1
- **date**: 2026-05-07
- **verdict**: needs-fix

## Summary

設計通りの実装で、SDK → port → state 層へのデータフローは正しく構築されている。テストも主要パスをカバー。ただし `ModelUsage` 型が `src/core/port/agent-runner.ts` と `src/state/schema.ts` の 2 箇所に同一定義で重複しており、片方を変更した際に乖離するリスクがある。design.md D1 は port 層に定義する方針だが、実装は state 層にも独立定義を置いている。片方を canonical にして他方は re-export にすべき。

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | HIGH | maintainability | src/state/schema.ts:11, src/core/port/agent-runner.ts:20 | `ModelUsage` interface が 2 箇所に同一内容で重複定義されている。フィールド追加時に片方だけ更新すると型不整合がサイレントに発生する（同名だが別型として TypeScript は扱う） | 一箇所を canonical 定義（port 層が適切）とし、state/schema.ts は `export type { ModelUsage } from "../core/port/agent-runner.js"` で re-export する。循環 import が懸念なら shared types ファイルに切り出す |
| 2 | MEDIUM | correctness | src/adapter/claude-code/agent-runner.ts:168 | `rawUsage && typeof rawUsage === "object"` のガードで `{}` (空オブジェクト) を通過させ、空の `Record<string, ModelUsage>` が `extractedModelUsage` にセットされる。テストコメント（L839-842）でも認知済みだが、空レコードを記録する意味がなく、state file に `"modelUsage": {}` が残る | `Object.keys(rawUsage).length > 0` を条件に追加するか、マッピング後に空チェックして `undefined` のままにする |
| 3 | LOW | testing | tests/unit/adapter/claude-code/agent-runner.test.ts:822 | 「empty modelUsage → undefined」を期待するテスト名だが、実際には `toBeDefined()` をアサートしている。テスト名と実装挙動の不一致。Finding #2 の修正に伴いどちらかに揃える必要がある | テスト名を "records empty modelUsage when SDK returns empty object" にするか、Finding #2 を修正して `toBeUndefined()` に変更する |
| 4 | LOW | maintainability | src/adapter/claude-code/agent-runner.ts:131 | `extractedModelUsage` が `try` ブロック外で `let` 宣言され、`try` 内で代入される。スコープが広い | `try` 内の success 分岐でローカル変数に入れ、success return で直接使う方がスコープが明確。ただし現在の制御フローでは実害なし |

## Scores

| Category | Score | Rationale |
|----------|-------|-----------|
| correctness | 8 | SDK → port → state のデータフロー正確。空オブジェクトの扱いが minor issue |
| security | 10 | セキュリティ関連なし |
| architecture | 6 | port 層と state 層の型重複が DRY 違反。design.md D1 と実装が不一致 |
| performance | 10 | 影響なし |
| maintainability | 5 | 同一型の重複定義は将来の保守リスク。片方変更時にコンパイルエラーにならない |
| testing | 8 | 主要 3 パス（success/empty/error）をカバー。helpers のテストも適切 |

**Total**: 8×0.30 + 10×0.25 + 6×0.15 + 10×0.10 + 5×0.10 + 8×0.10 = 2.4 + 2.5 + 0.9 + 1.0 + 0.5 + 0.8 = **8.1** → ~~pass~~ **blocked by HIGH finding**

## Verdict Rationale

Finding #1 (HIGH) が存在するため `needs-fix`。同一型の重複定義は TypeScript の structural typing で今は動くが、フィールド追加時の乖離リスクは HIGH 相当。re-export 1 行で解消できる。
