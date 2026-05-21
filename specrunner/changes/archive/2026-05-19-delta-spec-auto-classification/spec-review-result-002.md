# Spec Review Result 002: delta-spec-auto-classification

- **verdict**: needs-fix
- **reviewed-at**: 2026-05-19
- **reviewer**: spec-reviewer

---

## Overall Assessment

spec-review-result-001.md で指摘した全 CRITICAL / HIGH / MEDIUM 問題は対応済み。001 指摘からの変化を確認した上で、新たに 1 件の MEDIUM 問題を発見した。

---

## 001 指摘の対応状況

| ID | 001 重大度 | 対応状況 |
|---|---|---|
| C-01 | CRITICAL | ✅ tasks.md に T-00（自己マイグレーション + ブートストラップ note）追加済み |
| H-01 | HIGH | ✅ 混在形式（旧ヘッダー + 新形式リスト）は解消。旧形式のみに統一し、T-00 で実装後に変換する方針を明記 |
| H-02 | HIGH | ✅ spec-merge/spec.md から `## Removed` セクション（"empty delta..." の二重記載）が削除済み |
| H-03 | HIGH | ✅ spec-merge/spec.md から no-op `## Renamed` エントリが削除済み |
| M-01 | MEDIUM | ✅ T-03 に「baseline が null かつ removed/renamed が非空のときエラーを返す」バリデーションを追加済み |
| L-01 | LOW | ✅ T-00 の補足 note に delta-spec-validation-result.md のブートストラップ問題を記録済み |
| L-02 | LOW | ✅ T-14 に grep 除外対象（`specrunner/changes/` 配下 / 旧形式を期待値とするテスト）を明示済み |

---

## MEDIUM: 新発見

### M-01: tasks.md に ADR 作成タスクが存在しない

request.md の meta フィールドに `adr: true` がある。受け入れ基準の最終項:

> ADR に「LLM 不確定性に対する構造的解決」の思想と本 request の位置付けが記録されている

tasks.md (T-00〜T-14) に ADR 作成タスクが存在しない。spec-runner pipeline の 10 ステップ（propose / spec-review / ... / pr-create）には ADR 自動生成ステップがないため、明示タスクがなければ implementer が ADR を作成しない。

**要求する修正**: tasks.md に以下のタスクを追加する。

```markdown
## T-15: ADR 作成（docs/adr/ 配下）

- [ ] `docs/adr/` に本 request の設計記録ファイルを作成する
- [ ] タイトル例: 「Delta Spec の section header 分類を LLM から tool に委譲」
- [ ] 記録内容:
  - 背景: LLM 不確定性に対する構造的解決の第 1 弾として本変更を位置付ける（PR #283/#289/#299/#323 の事故分析）
  - 決定事項: D1〜D7（design.md の Decisions）を要約
  - 結果・トレードオフ: 旧形式 delta spec の移行が必要 / PR #323 同型事故の物理的消滅

**受け入れ基準**: `docs/adr/` に本変更の ADR ファイルが存在し、「LLM 不確定性に対する構造的解決」の思想と本 request の位置付けが記録されている。
```

---

## LOW: 軽微な不整合

### L-01: request.md の要件 2 のファイルパスが実際と異なる

request.md の要件 2: 「`src/core/spec/delta-spec-merger.ts` で以下の処理を実装する」

design.md と tasks.md では `src/core/finish/spec-merge.ts` を対象としており、こちらが正しいファイルパス。

実装への影響はない（implementer は tasks.md を参照するため）。request.md は背景情報として扱われる。修正は任意。

---

## Security Review

追加所見なし。001 での評価（path construction / regex / OWASP）に変化なし。

---

## 要修正箇所サマリー

| ID | 重大度 | 対象 | 内容 |
|---|---|---|---|
| M-01 | MEDIUM | tasks.md | T-15 追加: ADR 作成タスク |
| L-01 | LOW | request.md | 要件 2 のファイルパス表記（実装影響なし）|
