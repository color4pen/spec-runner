# resume の再開位置解決を resumePoint の記録から素直に決定する

## Meta

- **type**: spec-change
- **slug**: resume-simplify
- **base-branch**: main
- **adr**: true

## 背景

`resolveResumeStep`（237行）は再開位置を決めるために、resumePoint の内容に加えて state の過去の状況を推理している：

- Tier 2a: fixer-empty detection（fixer に遷移したが実行前に kill → paired loop step に戻す）
- Tier 2b: reviewer の iterationsExhausted > 0 → fixer に飛ばす（review 枯渇）
- Tier 3: resumePoint が null → fallback phase の critic step を推測
- legacy alias（critic / fixer / creator）→ phase 推定 → step mapping

これらの推理ロジックは resumePoint の記録が不十分だった時代の補完策。#532 で event journal が整備され、pipeline が resumePoint を3箇所で明示的に記録するようになった今、**推理は不要で、記録された resumePoint.step から素直に再開すればよい**。

resumePoint が null になるケース（pipeline が resumePoint を記録する前に crash した等）は `--from` による明示指定で対処する。

## 要件

1. `resolveResumeStep` を簡素化する：resumePoint が存在すれば `resumePoint.step` をそのまま返す。Tier 2a（fixer-empty detection）/ Tier 2b（review 枯渇 → fixer 推理）の re-inference ロジックを撤去する。
2. resumePoint が null の場合は `--from` 未指定ならエラーとする（推測しない）。`--from` 指定があればそれに従う。
3. `--from` に step 名を直接指定するパス（Tier 1a）は維持する。
4. `--from` の legacy alias（critic / fixer / creator）は維持するか撤去するかを設計フェーズで判断する。
5. pipeline が resumePoint を記録する3箇所が、再開に十分な情報（step + reason）を正しく書いていることを検証する。不十分な場合は記録を修正する。具体的には `handleExhausted` がループ step（例: `code-review`）を記録しているのを、対応する fixer step（例: `code-fixer`）に変え、resume が fixer からやり直すようにする（枯渇した reviewer を再実行しても再枯渇するため）。

## スコープ外

- `--no-worktree` モードの追加（別 request `no-worktree-mode`）
- pipeline のループ・枯渇判定ロジックの変更（`exhaustion-consolidation`）
- resumePoint のスキーマ変更（iterationsExhausted / exhaustionPhase フィールドは残す。読むだけで推理に使わない）

## 受け入れ基準

- [ ] resumePoint が存在する場合、`resolveResumeStep` が `resumePoint.step` をそのまま返す（re-inference なし）
- [ ] 枯渇後の resume が fixer step から再開される（reviewer を再実行して再枯渇しない）
- [ ] resumePoint が null かつ `--from` 未指定の場合、エラーメッセージが「`--from` で再開 step を指定してください」を示す
- [ ] `--from <step-name>` で任意の step から再開できる
- [ ] `resolveResumeStep` の行数が現在比 50% 以上削減される（現在 237 行）
- [ ] 既存の resume テストが通る、または推理ロジック撤去に伴い不要なテストが削除される
- [ ] `bun run typecheck && bun run test` が green

## architect 評価済みの設計判断

TBD
