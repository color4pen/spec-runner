# Code Review Feedback — adr-numbering-removal — iter 1

- **change**: adr-numbering-removal
- **date**: 2026-05-19
- **reviewer**: code-reviewer
- **verdict**: approved

## Summary

request.md の 6 要件と受け入れ基準すべてが満たされている。実装範囲は prompt テキスト 2 行の変更 + 5 ファイル rename + 2 ファイルの H1 修正 + delta spec 1 件で、いずれも意図通り実施済み。

検証ポイント:

- `src/prompts/adr-gen-system.ts` の命名規則を新形式に置換し採番手順を削除（diff = `-2 lines / +1 line`）
- ADR 5 件を `git mv` で rename。git の rename 検出が 97%–100% の similarity で動作している（履歴保持 OK）
- `grep -rE 'ADR-[0-9]{4}' specrunner/adr/` = 0 件（受け入れ基準 4 達成）
- delta spec の MODIFIED Requirement header `judge=yes produces an ADR file` が baseline と完全一致
- スコープ外（archive / merged / `src/core/step/code-review.ts:83` の `ADR-20260430-...`）は touch されていない
- verification-result.md iter 1 で typecheck/test green（2206 / 2206 passed）
- adr-gen.test.ts L70 の `expect(msg).not.toContain("specrunner/adr/")` は adr=false 分岐のアサーションで命名形式の影響を受けない

## Findings

### F-01 — info: 本 request 自身の ADR 生成は finish 時の adr-gen step で初実証される

- **severity**: info
- **location**: 受け入れ基準 L128 `2026-05-19-adr-numbering-removal.md`
- **description**: 受け入れ基準「本 request 自身の ADR が新形式で生成される」は finish pipeline の adr-gen step 実行時に初検証される。本 review 時点ではまだ生成されていない（worktree 内に該当 ADR ファイルなし）。これは想定通りで実装エラーではない。
- **suggestion**: 修正不要。finish 後に `specrunner/adr/2026-05-19-adr-numbering-removal.md` が生成されることを finish 完了時に確認すれば足りる。

### F-02 — info: delta spec で baseline の `Numbering` サブ行が暗黙削除される構造

- **severity**: info
- **location**: `specrunner/changes/adr-numbering-removal/specs/adr-generation/spec.md`
- **description**: baseline には `- **Numbering**: NNNN is the next sequential number ...` 行が含まれるが、delta では MODIFIED Requirement 配下にこの行が出現しないため「定義から落ちる」形で削除される。spec-merge 時に MODIFIED が requirement を全置換するため挙動として正しいが、レビュワーがパッと差分を見たとき「削除されたフィールド」が一覧化されない。
- **suggestion**: 修正不要。spec-review-result-001.md でも同旨の observation が記録されている。実装者・運用ともに把握済みで、リスクは顕在化しない。

### F-03 — info: 既存 ADR `2026-05-18-one-shot-query-wrapper.md` の H1 番号ズレを修正

- **severity**: info
- **location**: `specrunner/adr/2026-05-18-one-shot-query-wrapper.md` L1
- **description**: 旧 `ADR-0003-...` ファイルの H1 が誤って `# ADR-0001: ...` だった既存バグを本変更が `# queryOneShot を ...` に修正している。本 request のスコープ「内部参照クリーンアップ」に含まれる正当な修正で、副作用として既存バグが解消されている。
- **suggestion**: 修正不要。望ましい副作用。

## Verdict

- **verdict**: approved
