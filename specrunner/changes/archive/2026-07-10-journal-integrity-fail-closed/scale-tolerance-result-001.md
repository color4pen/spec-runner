# Scale Tolerance Review — journal-integrity-fail-closed

- **reviewer**: scale-tolerance
- **iteration**: 1
- **verdict**: approved

## Scope

対象ファイル（変更あり）: `src/store/event-journal.ts`, `src/store/journal-integrity.ts`, `src/store/job-state-store.ts`, `src/cli/job-show.ts`, `src/core/doctor/checks/storage/journal-integrity.ts`

観点: 時間とともに単調増加する対象（archive・worktree・journal 行数）に対してコストが比例成長するコードがあるか。

---

## Findings

### F-01 （minor）: `scanJournalIntegrity` が archive 全件を毎回 fold する

**箇所**: `src/store/journal-integrity.ts` `scanJournalIntegrity()`（L179-195）

`specrunner doctor` 呼び出しのたびに `specrunner/changes/archive/*` 配下の全 change dir について `inspectJournalDir` を呼び、各 `events.jsonl` を読み込んで全行 fold する。archive 件数が単調増加するため、スキャンコストは `O(archive 件数 × journal 行数)` で成長する。

既存の `orphan-worktrees` / `orphan-sidecars` scan が directory listing と小 JSON 読み込みに留まるのに対し、この check は大きくなりうるファイルを全件読む。

**緩和要因**:
- `doctor` はユーザーが明示的に呼ぶメンテナンス CLI。ホットパスにない。
- `required: false` のため、遅くても doctor の exit code を汚さない。
- `events.jsonl` の行数は 1 job あたりのステップ数（典型 50–500 行）で上限が定まる。
- archive 件数も 1 リポジトリ内では現実的に数十〜数百規模。
- design.md が明示的に受け入れリスクとして記録済み（Risks / Trade-offs 参照）。

**判定**: 受け入れ済みトレードオフ。ブロッカーでない。

---

### F-02 （minor）: `job show` happy path で同一 events.jsonl を二度 fold する

**箇所**: `src/cli/job-show.ts` `printJobState()` L128 と L139

整合性チェック（`inspectJournalDir`）と lineage 表示（`readLineage`）が独立に同じ `events.jsonl` を read + fold する。破損なし（正常系）の場合、fold が 2 回走る。

コストは 1 job あたり `O(|journal|)` × 2 の定数係数であり、job 件数に対しては比例しない（1 job を show するコマンド）。wall-clock への影響は微小。

**判定**: スケールブロッカーでない。将来最適化（fold 結果を返値として共有）の余地はあるが、merge 要件ではない。

---

### Hot paths に問題なし（確認）

| 経路 | コスト変化 |
|---|---|
| `fold()` | 以前と同じ O(n)。破損記録は最初の 1 件のみで追加走査なし |
| `persist()` fold path | fold は既存。corruption check O(1)、`detectCounterReversal` O(step 数≒13) を追加のみ |
| `load()` → `composeSplitLayout` | fold は既存。wrapper 追加のみ |
| `list()` の tolerant 切り替え | `composeSplitLayout` に名前が変わったが本体は同一 |
| `job show` probe | 1 job あたり O(\|journal\|) × 1 回の追加。件数スケールなし |
| `detectCounterReversal` | O(step 数) ≈ O(13)。定数扱い |

---

## Summary

単調増加する対象に対してコストが比例成長するコードは `scanJournalIntegrity` の archive 走査のみ。これは design.md が明示的に受け入れたトレードオフであり、doctor（メンテナンスコマンド）の `required: false` check に限定されている。load / persist / list / fold の各ホットパスに新たな比例成長コストは導入されていない。
