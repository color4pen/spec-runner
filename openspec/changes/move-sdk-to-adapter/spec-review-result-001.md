# Spec Review Result — move-sdk-to-adapter (iteration 1)

- **reviewer**: spec-reviewer
- **date**: 2026-05-09
- **verdict**: approved
- **scope**: Lightweight (behavior-preserving refactoring)

## Summary

仕様は正確で、実態と一致している。proposal / design / tasks / spec の4アーティファクト全てが一貫しており、実装に必要な情報が揃っている。

## Category Assessments

### architecture: PASS

- D2（factory.ts DI 化）は hexagonal architecture の原則に忠実。`SessionClient` port interface を経由する設計で core→adapter 依存を断ち切れる
- composition root（cli/）での adapter wiring は正当。Trade-off（呼び出し元での `config.runtime` 分岐追加）も認識・文書化されている
- 移動先 `adapter/managed-agent/` は既存の adapter 層構造と整合

### correctness: PASS

- design.md の Before/After コードが `factory.ts` の実装と一致（L11-12 の import、L36-38 の managed 分岐）
- `agents.ts` の dead code 判定を grep で確認（import 元ゼロ）
- `sessions.ts` と `adapter/managed-agent/sdk/sessions.ts` を比較し、後者が型再エクスポート + narrowing ヘルパー + CRUD 全てを含む上位互換であることを確認
- `client.ts` は `adapter/managed-agent/` に未存在（名前衝突なし）
- `createRuntime` の呼び出し元（`run.ts` L32, `bootstrap.ts` L31）が 4 引数で呼んでおり、5th param optional 追加は後方互換

### completeness (task decomposition): PASS

- tasks.md の 7 セクション 20 タスクが request.md の要件 1-6 と受け入れ基準 5 項目を全てカバー
- request.md にない `agents.ts` / `sessions.ts` の削除（デッドコード整理）が追加されているが、proposal.md で根拠が説明されており妥当
- 検証タスク（7.1-7.5）が受け入れ基準と 1:1 対応

### consistency (simplified): PASS

- spec の module-boundary 変更はレイアウト図の更新と `src/sdk/` 不在シナリオの追加のみ。既存の module-boundary requirement と整合

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| — | — | — | — | No findings | — |

## Notes

- `adapter/managed-agent/client.ts`（移動先）と既存 `anthropic-client.ts` の名前の紛らわしさは design.md Risks に記載済み。スコープ外として妥当
- tasks.md 3.7「Design D4 コメント更新」が含まれており、factory.ts 冒頭コメントの陳腐化を防止できている
