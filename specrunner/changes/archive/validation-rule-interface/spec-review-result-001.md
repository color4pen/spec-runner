# Spec Review Result: validation-rule-interface

- **reviewer**: spec-reviewer
- **date**: 2026-05-18
- **verdict**: approved

## Summary

request.md の要件を design.md / tasks.md / delta specs が網羅的にカバーしている。既存コード（`request-md.ts`, `delta-spec-validator.ts`）の実装との整合性も確認済み。設計判断は合理的で、リスク対策も明示されている。

## Coverage Matrix

| request 要件 | design | tasks | delta spec | 判定 |
|---|---|---|---|---|
| 1. ValidationRule interface | D1 | 1.1 | validation-rule-interface/spec.md Req 1 | ✅ |
| 2. RuleRegistry class | D2 | 1.2 | validation-rule-interface/spec.md Req 2 | ✅ |
| 3. parser layer migration | D3, D4, D5 | 2, 3 | validation-rule-interface/spec.md Req 3 + request-md-parser/spec.md | ✅ |
| 4. dsv layer migration | D6, D7, D8, D9 | 4, 5 | validation-rule-interface/spec.md Req 4 | ✅ |
| 5. 既存 test 維持 | Unchanged files table | 3.2, 5.2, 6 | validation-rule-interface/spec.md Req 5 | ✅ |
| 6. 新規 rule 単独 test | — | 2.4, 4.5 | — | ✅ |
| 7. RuleRegistry test | — | 1.3 | — | ✅ |
| 8. delta spec 作成 | — | 7 | 両 spec 存在確認済み | ✅ |

## Design Decision Review

### D6 (async 分離) — 妥当

request は `DeltaSpecViolation` を `ValidationRule<..., DeltaSpecViolation>` で再利用すると記述しているが、design は dsv layer が async fs アクセスを必要とすることを発見し、独立した `DeltaSpecRule` interface + `DeltaSpecRuleRegistry` を導入した。`ValidationRule.check` を sync に保つ判断は正しい — parser rule に不要な `await` を強制する代償が大きい。`DeltaSpecViolation` 型自体は `DeltaSpecRule.check` の返り値型として再利用されるため、request の意図は実質的に達成される。

### D7 (Step 3+4 統合 → canonical-spec-structure) — 妥当

`specsSubdirs` の共有コンテキスト問題を 1 rule への統合で解決。violation reason は複数種（`non-canonical-path`, `missing-requirements-section`, `empty-section`）を返しうるため、rule の粒度としてはやや粗いが、分割すると state 共有の複雑さが増すため適切なトレードオフ。

### D9 (早期 return 保持) — 妥当

`no-specs-for-required-type` を registry 外で先行実行し、registry の `validate` は「全 rule 実行」の単純なセマンティクスを維持。既存テスト（TC-V-11/12）の振る舞い保持が担保される。

## Observations

### O-1: request/design 間の rule 命名差異（情報のみ）

request は `type-valid` / `slug-format` を列挙しているが、design は既存コードを精査し `type-known`（warning）/ `slug-required`（format check なし）に確定した。request 自身が「その他既存 check (= 全列挙)」と design への委任を明示しており、design の 7 rule リストは既存コード（`request-md.ts` L44-141）と完全に対応する。問題なし。

### O-2: エラーメッセージの忠実度

rule 化後も既存テストが改変不要で green であるためには、各 rule が返す `message` が現在の `requestMdInvalidError` の引数と完全一致する必要がある。tasks 2.2 で `title-required` のメッセージが明示されており、他の rule も同様に既存メッセージを踏襲する前提。implementer は既存コードのエラーメッセージを正確にコピーすること。

### O-3: violation 順序と「最初の error で throw」

現在のコードは最初のエラーで即 throw する。migration 後は全 rule が実行され、最初の error-severity violation で throw する（tasks 3.1 step 3）。registry の登録順が既存チェック順と一致（title → type → ... → adr）しているため、同じ violation が最初に来る。既存テスト互換性は保たれる。

### O-4: delta-spec-validator の baseline spec 不在

`specrunner/specs/` に delta-spec-validator capability の baseline spec が存在しないため、MODIFIED delta spec は不要。新規 `validation-rule-interface` capability spec が dsv layer の rule 登録を Requirement として記述しており、十分。

## Security Review

- 本変更は既存 validation ロジックの structural refactoring であり、新規の攻撃面は導入されない
- 外部依存の追加なし
- ネットワーク I/O、認証、secrets の取り扱い変更なし
- validation rule 自体が入力検証を担うレイヤーであり、migration は振る舞いを保持するため、既存の入力検証強度に変化なし

## Verdict Rationale

- 全要件が design/tasks/delta specs でカバーされている
- 設計判断（D6 async 分離、D7 rule 統合、D9 早期 return）は既存コードの制約を正しく反映し、合理的に解決している
- delta spec のフォーマット・セクション構造は canonical path に準拠（delta-spec-validation-result で approved 済み）
- 既存テスト互換性の担保が設計全体を通じて一貫している
- blocking issue なし
