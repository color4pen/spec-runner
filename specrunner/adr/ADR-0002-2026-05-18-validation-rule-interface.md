# ValidationRule interface + RuleRegistry による validation 抽象化

**Date**: 2026-05-18
**Status**: accepted

## Context

`src/parser/request-md.ts` と `src/core/spec/delta-spec-validator.ts` の validation rule は inline procedural style で実装されており、rule 追加のたびに関数本体を編集する必要があった。rule ごとの unit test が不可能で、parser/dsv 間で似た check を重複実装する必要もあった。#289/#291 で 5 件連続の inline 編集事故が発生し、rule 追加コストの構造的問題が顕在化した（#301 の動機）。

## Decision

Generic な `ValidationRule<TInput, TViolation>` interface と `RuleRegistry<TInput, TViolation>` class を `src/core/validation/` に導入し、各 rule を独立ファイルとして定義・register する。parser layer は sync の `ValidationRule` を利用し、dsv layer は async fs アクセスが必要なため独立した `DeltaSpecRule` interface（`src/core/spec/rules/types.ts`）を別途定義する。`RuleRegistry` を継承はしない。

## Alternatives Considered

### Alternative 1: inline のまま rule ごとに関数抽出

- **Pros**: 変更量が最小。既存構造を保持。
- **Cons**: rule 間の再利用性なし。単独 test 不可。rule 追加が関数本体編集を伴う（= OCP 違反が継続）。
- **Why not**: 事故再発防止のための構造変更が目的であり、関数抽出だけでは解決しない。

### Alternative 2: ValidationRule.check を `TViolation[] | Promise<TViolation[]>` にして共通化

- **Pros**: parser/dsv で 1 つの interface を共有できる。
- **Cons**: sync-only の parser rule が全て `await` を書く必要が生じる。戻り値の型が union になり呼び出し側の型安全が低下。
- **Why not**: parser rule は純粋な text → violation の pure function であり、async にする理由がない。型安全を犠牲にする共通化は得策でない。

### Alternative 3: DeltaSpecRuleRegistry を RuleRegistry の subclass にする

- **Pros**: `register` / 重複チェックのロジックを継承で再利用できる。
- **Cons**: `validate` の戻り値が `TViolation[]`（sync）と `Promise<TViolation[]>`（async）で型シグネチャが変わるため継承が型安全でない。
- **Why not**: composition（独立 class）の方が型安全かつシンプル。実装量の差もわずか。

## Consequences

### Positive

- rule 追加が「ファイル追加 + `registry.register()` 1 行」に簡素化（OCP 達成）
- 各 rule を `input → violation[]` の pure unit test として独立テスト可能
- 既存 inline 実装の振る舞いを 100% 保持（既存テスト 2174 件 green のまま）
- parser/dsv の rule が `src/parser/rules/` / `src/core/spec/rules/` 配下に整理され discoverability が向上

### Negative

- parser と dsv で interface が分岐（`ValidationRule` vs `DeltaSpecRule`）し、「ひとつの抽象で全層をカバー」できない
- `src/parser/rules/index.ts` が `ParsedRequestRaw` / `RequestMdViolation` を re-export することで、canonical import path が 2 箇所存在する（`types.ts` 直接 vs `index.ts` 経由）

### Risks

- **D9 パターンの見落とし**: `no-specs-for-required-type` は registry の `validate` を経由せず `validateDeltaSpecPaths` から直接呼び出される（early return のため）。このパターンは `src/core/spec/rules/index.ts` に文書化コメントで明示すべき（review-feedback-001 Finding #3）。
- **dsv の Step 3+4 統合**: `canonical-spec-structure` rule が複数の violation reason を返しうる設計。テストは violation の配列順序に非依存だが、将来 rule を分割する際は依存性の再確認が必要。

### Known Design Debt

- `no-specs-for-required-type` の直接呼び出し（D9）に関する `index.ts` のコメントが未追加（review-feedback-001 Finding #3）。
- TC-MIG-P-03（warning severity → stderr、no throw）と TC-MIG-P-04（`parseRequestMdRaw` export + full field extraction）の専用テストが存在しない。暗黙的カバレッジのみ（review-feedback-001 Finding #2）。
