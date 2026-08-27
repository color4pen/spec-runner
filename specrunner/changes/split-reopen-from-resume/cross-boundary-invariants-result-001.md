# Cross-Boundary Invariants Review — Iteration 1

<!--
verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
findings は report_result（typed）で報告し、この file はその evidence report である。
-->

## 検証範囲

- `git diff main...HEAD --stat` で変更範囲を確認した。
- `design.md` と `tasks.md` の責務分離、状態遷移、Actions 合成の設計を確認した。
- 変更された `ReopenCommand`、lifecycle table、CLI、Actions workflow の呼び出し先・呼び出し元を確認した。
- 新たに生成される `awaiting-resume` 状態の全リポジトリ内 consumer を探索し、特に未変更の inbox planner / executor、resume safety gate、attach policy、worktree reconciliation との組み合わせを確認した。
- operator 裁定済みの workflow 変更は読み取りのみとし、編集していない。

## 新経路と隣接不変条件

| 新経路 | 隣接機構 | 確認結果 |
|---|---|---|
| local `reopen` → 明示的 `resume --from` | ResumeCommand の status gate / ingress safety | `awaiting-resume → running` が既存 gate を通り、`--prompt` / `--adopt-commits` / `--apply-canon` が適用される |
| Actions `reopen` → 同一 shell の `resume` | shell fail-fast / state store / pipeline-managed dirty files | 逐次呼び出しで、reopen 失敗時は resume に到達しない。state/event journal は pipeline-managed path として canon dirty gate の対象外 |
| reopen 後の remote attach | attach resume policy | `resumePoint` がなくても保存済み `state.step` と明示 `--from` により resume 自体は解決可能。ただし attach policy は `--from` を受けず tree precheck を `state.step` で行うため、remote 再 attach の意味は従来機構の制約に依存する |
| issue-linked job の reopen → inbox polling | inbox の comment-based auto-resume | **不変条件違反あり。下記 F-001** |

## Findings

### F-001 — 過去に消費済みの `/resume` コメントが reopen 後に pipeline を再起動する

- Severity: high
- Resolution: fixable
- File: `src/core/inbox/planner.ts:181`
- Origin: scope

`planResumes()` は `awaiting-resume` の全 issue-linked job を対象にし、最新 escalation marker より後にある最新の `/resume` コメントを選ぶだけで、そのコメントが以前の run ですでに消費済みかを記録・検査しない。従来は pipeline 完走後の状態が `awaiting-archive` だったため、この前提でも同じコメントは再評価されなかった。今回 `job reopen` が新たに `awaiting-resume` を生成することで、その暗黙の一回性が破られる。

再現可能な実行列:

1. issue-linked job が escalation により `awaiting-resume` になり、bot が jobId を含む escalation marker を issue に投稿する。
2. operator がその marker より後に `/resume 修正してください` を投稿する。
3. inbox がそのコメントを選択して pipeline を resume し、job は最終的に `awaiting-archive` まで完走する。コメントも marker も issue 上に残る。
4. OPEN PR に対して operator が `job reopen <slug> --reason ...` だけを実行する。変更後の command は pipeline を起動せず、job を `awaiting-resume` にする。
5. 次回 inbox polling で `runInbox` はこの job を収集し、`planResumes()` は手順 2 の古い `/resume` を再び qualifying comment として返す。
6. inbox executor が `effects.resumeJob()` を呼び、operator が今回の reopen に対して `job resume` や新しい `/resume` を発行していないにもかかわらず pipeline が起動する。古い prompt も再注入される。

これは「reopen は lifecycle transition のみで停止し、pipeline 実行は resume の明示的入力を経由する」という新契約を issue-comment execution face で破る。さらに、今回の review feedback ではなく過去の prompt で再実行されるため、実行位置と指示内容の双方が operator の今回の意図とずれ得る。

修正では、reopen 由来の `awaiting-resume` を inbox の escalation-comment resume 対象から除外するか、resume comment の消費 cursor/id を永続化して同じコメントを再利用しないようにする必要がある。併せて「過去に一度消費された `/resume` が存在する issue-linked `awaiting-archive` jobを reopen → inbox poll」の結合テストが必要である。

## Observations

- `ReopenCommand` が transition 前に operator event を append し、その後の persist が失敗した場合、失敗した reopen event だけが journal に残る。既存設計が明示的に採用した durability 順序であり、pipeline 起動や状態遷移を誤認させる consumer は確認できなかったため finding にはしていない。
- reopen が `resumePoint` を clear するため、明示 `--from` を省略した resume は `state.step` fallback を使う。CLI 契約は reopen 後の `resume --from` を明示しており、今回確認した Actions face も必ず `--from` を渡すため blocking finding にはしていない。

## Evidence summary

- Checked: 5 boundary paths
- Skipped: 0
- Unverified: 0
