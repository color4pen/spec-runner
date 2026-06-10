# Design: verification result に実行マシンの絶対パスを残さない

## Context

verification step は `src/core/verification/runner.ts` の `writeVerificationResult()` で
phase 表と各 phase のコマンド生出力 (`stdout` / `stderr`) を markdown に組み立て、
`specrunner/changes/<slug>/verification-result.md` として書き出す。このファイルは branch に
commit され、PR 経由で main に積まれる。

build / test コマンドの生出力には実行マシンの絶対パス（worktree root = cwd 配下のパス、
および `$HOME` 配下のパス）が混入する。OS ユーザー名を含む `$HOME`（例 `/Users/<user>`）が
公開リポジトリの履歴に残るため、pipeline を 1 回回すたびに実行者のユーザー名が漏れる。

既存の漏洩遮断 seam として 2 つの先例がある:

- `src/util/env-filter.ts` の `stripSecrets` — subprocess に渡す前に env の credential key を除去
- `src/logger/stdout.ts` の `maskSensitive` — stdout/stderr に書く前に token 系を正規表現で伏字化

両者とも「漏洩面を writer の seam 一点で塞ぐ」型。本件は同型で、commit される出力に対する
**パス正規化 seam** を追加する。`maskSensitive` が token を対象にするのに対し、本 seam は
絶対パスを対象にする。

現行世代で絶対パスが残る commit 対象 artifact は verification-result.md のみ。
state.json / events.jsonl への混入は過去世代の事象で、現行では発生しない（スコープ外）。

## Goals / Non-Goals

**Goals**:

- verification-result.md に書き出すコマンド出力から実行マシンの絶対パスを除去する
- cwd（worktree root）配下のパスは repo 相対に正規化する
- それ以外の `$HOME` 配下のパスはプレースホルダ `~` に置換する
- 正規化を結果ファイルの writer 側 seam 一点に限定する
- verdict 判定・phase 実行・返却される `VerificationResult` オブジェクトの挙動を不変に保つ

**Non-Goals**:

- 既存 archive / git 履歴の遡及書き換え（履歴書き換えで別途対応）
- agent が散文として生成する markdown（spec.md / design.md 等）の内容検査
- stdout / stderr のリアルタイム出力（commit されないため。`maskSensitive` の責務範囲）
- state.json / events.jsonl の正規化（現行世代で混入なし）
- Windows パス（区切り `\`）対応。本プロジェクトは POSIX shell 前提（`sh -c`）

## Decisions

### D1: パス正規化を専用の純粋関数 `maskAbsolutePaths` として `src/util/` に追加する

新規ファイル `src/util/path-mask.ts` に、文字列と `{ cwd, homeDir }` を受け取り絶対パスを
正規化して返す純粋関数を置く。

- **Rationale**: `env-filter.ts` / `paths.ts` と同じく、副作用を持たない単機能の util として
  独立させることで単体テスト可能になり（acceptance criteria の「テストがある」を満たしやすい）、
  writer 側はこの関数を 1 回呼ぶだけになる。`homeDir` を引数で注入可能にすることで、
  `os.homedir()` に依存しない決定的なテストが書ける（util 自体はデフォルトで `os.homedir()` を使う）。
- **Alternatives considered**:
  - 既存 `maskSensitive` に正規表現パターンを追加する案。token のグローバルな正規表現マスクと
    パスの prefix ベース正規化は対象・置換ロジックが異なり、`maskSensitive` は stdout 全般に
    広く適用される（cwd を知らない）。混ぜると責務が肥大化し、stdout 出力にも cwd 相対化が
    波及してしまう。別 seam として分離する。
  - 正規表現で `/Users/[^/]+` 等を総当たりマスクする案。OS 差（`/home`, `/Users`, `/root`）に
    脆く誤爆も多い。`os.homedir()` / cwd の実値を prefix 一致で確実に置換する方が堅牢。

### D2: 適用箇所は `writeVerificationResult()` で組み立てた最終 markdown 文字列に 1 回

`lines.join("\n")` で完成した本文を `fs.writeFile` する直前に `maskAbsolutePaths()` へ通す。

- **Rationale**: 「writer の seam 一点」という要件に最も忠実。stdout/stderr ブロック・skip 理由・
  package-json-integrity の diff・phase 表・見出しまで、ファイルに入る全テキストを 1 箇所で
  カバーできる。個別フィールド（`p.stdout` / `p.stderr`）に散らして適用すると seam が増え、
  将来 phase 種別が増えたときに塞ぎ漏れが起きる。`maskSensitive` が「行を書く直前に 1 回」
  なのと同じ粒度。
- **Alternatives considered**:
  - `PhaseResult.stdout` / `stderr` を生成時点（spawn 直後）で正規化する案。返却される
    `VerificationResult` オブジェクトまで値が変わり、verdict 判定への影響有無の検証が増える。
    要件は「commit される artifact のみ対象」「コマンド実行・verdict 判定に触れない」なので、
    オブジェクトは生のまま、ファイル書き出し時だけ正規化する。

### D3: 正規化は「cwd 相対化 → `$HOME` 置換」の順、prefix 一致のリテラル置換で行う

cwd は通常 `$HOME` 配下にあるため、先に `$HOME` を `~` 化すると cwd 配下のパスが
`~/.../worktree/src/foo` のように相対化されず残る。よって **cwd を先に** 処理する。

- cwd + 区切り `/` で始まる出現 → 除去（repo 相対パスになる。例 `<cwd>/src/a.ts` → `src/a.ts`）
- cwd 単体の出現 → `.`
- 残った homeDir + 区切り `/` で始まる出現 → `~/`（例 `<home>/.bun/x` → `~/.bun/x`）
- 残った homeDir 単体の出現 → `~`

置換は正規表現ではなくリテラル文字列置換（`split().join()` 相当）。パスには正規表現の
メタ文字が含まれ得るため、実値を literal として安全に全置換する。

- **Rationale**: prefix の特定度が高い順（cwd ⊃ homeDir）に適用するのが正しい畳み込み順序。
  literal 置換でメタ文字エスケープの考慮を排除し堅牢にする。
- **Alternatives considered**:
  - homeDir → cwd の順。上記理由で cwd 配下が相対化されず NG。

## Risks / Trade-offs

- [Risk] homeDir や cwd が `/` のような極端に短い値だと過剰置換が起きうる →
  Mitigation: 実運用では cwd は worktree 配下の十分長い絶対パス、homeDir は `os.homedir()`
  の実値。空文字列ガード（空なら該当置換をスキップ）を入れ、`/` 単体での全置換は実害が
  小さいため許容。テストで通常ケースを担保する。
- [Risk] コマンド出力に偶然 cwd 文字列を含む無関係なテキストがあると `.` 等に置換される →
  Mitigation: 絶対パス文字列が偶然一致する確率は低く、置換結果も無害な相対表現。verdict や
  exit code には影響しない。
- [Trade-off] ファイル本文全体を 1 回走査するため、巨大出力でわずかな処理コストが増える →
  既存 `maskSensitive` も同様に全文走査しており、verification 出力サイズでは無視できる。

## Open Questions

なし。
