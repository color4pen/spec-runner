# Spec Review Result: delta-apply-normalization

- **reviewer**: spec-reviewer
- **date**: 2026-05-16
- **verdict**: approved

## Summary

request.md の背景分析・設計判断・要件定義は正確かつ網羅的。ソースコード照合により以下を確認済み:

- `spec-merge.ts:355-357` の silent skip 経路が実在する
- `orchestrator.ts:197` で `mergeSpecsForChange` が `archiveChangeFolder` より先に呼ばれるという call order の主張が正しい
- `FinishFs` interface に `readFile` が既に存在し、追加の DI 変更は不要
- `parseRequestMdContent` が unknown type で throw せず warn-only である挙動 (`request-md.ts:66-68`) が正しく特定されている
- `TYPE_CONFIG` のキー集合 (`new-feature`, `spec-change`, `refactoring`, `bug-fix`, `chore`) が request の分類表と一致する
- `parseDeltaSpec` が `{ added: [], modified: [], removed: [] }` を返しうる (空 content / section なし) ことを確認

## Findings

### Finding 1: 軽微 — design.md の `isSpecRequired(type)` helper

design.md の変更対象テーブルに「`src/config/type-config.ts` | MODIFY | `isSpecRequired(type)` helper 追加」と記載があるが、design.md 本文の設計方針 2 では「`type-config.ts` に field を追加しない。`spec-merge.ts` 内に閉じたロジックとする」と矛盾する。tasks.md は design 方針 2 に従い `spec-merge.ts` 内の `SPEC_REQUIRED_TYPES` Set で実装する設計になっている。

**影響**: tasks.md が正しく設計意図を反映しているため実装上の問題はない。design.md のテーブルが misleading だが、implementer は tasks.md に従うため実害なし。

**推奨**: 修正必須ではないが、`type-config.ts` の行を tasks.md に合わせて「参照のみ (import TYPE_CONFIG keys)」等に修正するとより正確。

### Finding 2: OK — delta spec `cli-finish-command/spec.md` の REMOVED 表現

delta spec で Requirement header が `(none — scenarios removed inline)` となっている。通常 REMOVED は既存 Requirement の header を完全一致で書く規約だが、ここでは独立した Requirement を削除するのではなく、既存 Requirement 内の check 行と Scenario を削除する MODIFIED 操作を記述している。

実際の delta は MODIFIED Requirements セクションで既存 Phase 0 Requirement を書き直しており、check 5,6 行の削除と check 7 の `openspec` 除去は MODIFIED の中で自然に表現されている。REMOVED セクションは補足 Note として使われている。`spec-merge` の `parseDeltaSpec` は Requirement block がない REMOVED セクションを `removed: []` として処理するため、runtime error にはならない。

**影響**: なし。

### Finding 3: OK — cross-capability atomic の既存挙動明文化

request が「既存挙動の明文化」と述べている 2-pass atomic 実装を `spec-merge.ts:374-480` で確認。Pass 1 で `allErrors` に蓄積し、`allErrors.length > 0` なら早期 return する実装が実在する。新規 spec の Requirement は既存実装と整合している。

### Finding 4: OK — spec-fixer prompt の現状

`spec-fixer-system.ts:46-50` に既にファイル配置ルールが存在するが、`<change>/delta-spec.md` 等の正規外 path の禁止が不十分。request の要件 7 で補強する設計は妥当。

### Finding 5: OK — テストカバレッジ

tasks.md の TC-SM-090〜102 は request の要件 5 の全ケースを網羅している。特に TC-SM-101 (cross-capability 部分 fail で全 write 0) は regression guard として適切。

## Security Considerations

- **入力検証**: `request.md` の type field を `TYPE_CONFIG` キー集合で厳密一致照合するため、injection リスクなし
- **Path traversal**: `changeFolderPath(slug)` は既存の path 構築ロジックを再利用。slug は `parseRequestMdContent` で検証済み
- **認証**: 変更なし (spec-merge は filesystem + git add のみ)
- **OWASP Top 10**: 該当なし (CLI 内部のファイル操作のみ)

## Conclusion

設計判断の整合性、要件の網羅性、delta spec のフォーマット正確性、テスト戦略の妥当性をすべて確認。Finding 1 は cosmetic な不整合であり実装に影響しない。approved とする。
