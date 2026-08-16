# CLI Operational Knowledge Registry

**Date**: 2026-08-17
**Status**: accepted

## Context

spec-runner を agent session から運用するための知識(コマンド・flag の使い分け、escalation 復帰の分岐、起票・レビューの規律)に repo の正本が存在しなかった。`.claude/skills/` 配下の 4 skill が一部を保持するが、以下の構造問題があった:

1. **版ずれ問題**: skill の中身は CLI のコマンド面に強く結合している。CLI と別経路(plugin 等)で配布すると、project ごとの CLI 版と skill 版が必ずずれる
2. **重複著述**: skill に厚い手順を書くと、CLI が変わるたびに skill 側の複数箇所を更新する必要がある
3. **陳腐化**: `parallel-request-workflow` skill は廃止済み `request review` コマンドを前提としており、機械的な正確性の保証がなかった

関連する既存先例:

- **stdout 知識注入**: `request prompt`(`src/core/command/request-prompt.ts`)は起票プロンプトを stdout に出す「知識は CLI が注入する」パターンを確立していた
- **単一ソース + drift-guard**: `src/prompts/pipeline-map.ts` の `PIPELINE_MAP` 定数を各 prompt が埋め込み、`prompt-skeleton-drift-guard.test.ts` が `toContain(PIPELINE_MAP)` で固定するパターンが存在していた

## Decision

### 1. CLI パッケージを運用知識の正本とする

`src/core/command/guide.ts` に 9 topic(jobs / merge / audit / setup / escalation / request / review / inject / inbox)を `GUIDE_TOPICS: readonly GuideTopic[]` として集約する。知識はネットワーク・repo 状態に非依存の TS 定数として保持する。

`specrunner guide [topic]` コマンドがこの registry から一覧・本文を出力する。

### 2. 単一 registry + drift-guard パターンを運用知識に適用する

PIPELINE_MAP と同型の仕組みで topic の手書き重複を構造的に防ぐ:

- topic 名・一行説明・本文を `GUIDE_TOPICS` に一元集約
- `guide`(引数なし)の一覧・未知 topic エラー候補・init snippet の topic 一覧を全て `GUIDE_TOPICS` から導出する(手書き列挙を一切持たない)
- `resolveCommand` を使って guide 本文の specrunner コマンドが現行 CLI に実在することをテストで固定する

### 3. 純粋 builder + 薄い handler 構造

`guide.ts` は stdout に触れない純粋 builder 関数群(`renderTopicList` / `findTopic` / `renderUnknownTopicError` / `buildClaudeMdSnippet`)と薄い handler `runGuide` に分離する。test は builder を直接 assert できるため stdout キャプチャが不要になる。`request-prompt.ts` と同じ構造。

### 4. escalation 出力面への導線は固定 literal で追加する

`formatEscalation`(finish/archive halt)と `buildCanonEscalationReason`(保護正典 fixable finding)の 2 つに `詳細: \`specrunner guide escalation\`` の固定一行を加える。

`canon-escalation.ts` は leaf モジュール(I/O 非依存)であるため、`guide.ts` を import しない。固定 literal を使うことで leaf 制約を保全する。参照先 topic 名 `escalation` が消えないことは `GUIDE_TOPICS` に name === "escalation" が存在することを確認するテストで担保する。

### 5. skill は薄いトリガーに縮退する(削除しない)

job-run-monitor / rebase-finish / acceptance-and-issue-audit の各 SKILL.md を、発火条件(description frontmatter)と「`specrunner guide <topic>` を実行して従う」誘導のみ(本文 10 行以内)に書き換える。

skill を全削除せず薄いトリガーとして残す理由: agent が guide を参照するきっかけとなる発火条件(description の自然文マッチング)を失うと、guide を引く入口が消える。`parallel-request-workflow` は廃止済みコマンド前提のため tombstone を置いて実質削除する。

## Alternatives Considered

### Alternative A: topic ごとに別ファイル(`guide/jobs.ts` 等)+ index で集約

- **Pros**: topic ファイルが独立し PR の diff が局所的になる
- **Cons**: 単一 registry の drift-guard が index の手書き列挙に依存してしまう。ファイル数が増え「topic を追加したら index の列挙も更新」という手順が残る
- **Why not**: GUIDE_TOPICS を 1 ファイルに集約すると drift-guard が一意に書ける

### Alternative B: guide 本文を Markdown 資産ファイルとして同梱し実行時 read

- **Pros**: 本文の編集が TS 構文制約を受けない
- **Cons**: 実行時 repo 状態非依存の保証に bundle 同梱が必要。TS 定数より脆い。現行 build 設定に asset bundling の仕組みがない
- **Why not**: TS 定数が最小コスト

### Alternative C: escalation 導線を共有定数モジュールに置いて両所から import する

```ts
// 採用しなかった案
export const GUIDE_ESCALATION_HINT = "詳細: `specrunner guide escalation`";
```

- **Pros**: 文字列の typo が一箇所で済む
- **Cons**: 1 文字列のためにファイルを 1 つ増やす。`canon-escalation.ts` の leaf 制約(このファイルへの import も新規依存になる)を崩す可能性がある
- **Why not**: dangling 防止は「escalation topic が registry に存在する」テストで十分に噛む

### Alternative D: skill を全削除する

- **Pros**: 陳腐化したファイルが消え、保守対象が減る
- **Cons**: agent が guide を参照する発火トリガー(skill description の自然文)を失う。guide を「引け」と言う入口がなくなり、guide コマンドの発見性が下がる
- **Why not**: 薄いトリガーを残す方が入口と正本を分離できる

### Alternative E: formatEscalation の呼び出し側(各 archive orchestrator)に導線を足す

- **Pros**: 呼び出し点ごとに導線の有無や文面を制御できるため、特定の escalation 種別だけに絞った案内が可能になる
- **Cons**: 呼び出し点が多数あり patchwork になる。各呼び出し点への追加は漏れが発生しやすい
- **Why not**: テンプレート側 1 箇所に足すことで全 finish/archive halt を一括カバーできる

## Consequences

### Positive

- CLI パッケージのバージョンと運用知識が一致することが構造的に保証される
- guide 本文の specrunner コマンドが `resolveCommand` テストで機械的に検証されるため、廃止コマンドの案内が CI で検出される
- topic 一覧の手書き重複がなくなり、topic 追加時の触れるファイルが `guide.ts` のみになる
- skill ファイルの保守コストが大幅に下がる(薄いトリガーは topic 追加で書き換える必要がない)

### Negative

- guide 本文が TS 定数のため、本文編集が TypeScript ファイルの編集になる。Markdown エディタ等のプレビューが効かない
- guide 本文の i18n・pager 対応が将来困難になる可能性がある

### Known Limitations

- `ponytail: guide body は単一言語 TS 定数。i18n/pager が要れば資産ファイル + loader へ移行`
- `LOOP_ERROR_CODES.hint`(SPEC_REVIEW_RETRIES_EXHAUSTED 等)への escalation 導線追加は本 change のスコープ外。必要なら別 request で追加する
- docs / README の再構成は本 change のスコープ外。guide を正本とする参照構造はこの change で成立するため、docs のダイエットは後段の別 request で行う

### Risks

- body 内のコマンド表記揺れ(shorthand `resume` 等)を抽出正規表現が拾えない場合、検証漏れが発生する。**Mitigation**: 本文では機械検証対象のコマンドを必ず完全形 `specrunner <path>`(backtick 囲み)で最低 1 回記載する方針をとる
