# Design: protected-paths-merge-guard

## Context

`job archive --with-merge` は `runMergeThenArchive` (`src/core/archive/merge-then-archive.ts`)
を実行し、対象 PR の checks が green になったら無人で squash merge して main に取り込む。

この経路には「CI / release の仕組みそのものを定義するファイル」(`.github/workflows/*`、
release 設定、publish 設定など) を変更した PR を人間が中身を見ないまま自動 merge してしまう
リスクがある。pipeline が「自分を動かす仕組み」を自分で書き換えて自分で取り込む閉ループが
成立しうる。これは無人 merge を持つ specrunner 固有のリスクである。

現状の merge gate の判定材料は、wait loop 内の以下のみ:
- `getPullRequest` … PR state / mergeStateStatus / mergeable / headSha
- `getCheckStatus` … checks の rollup

**「PR が何のファイルを変更したか」を merge gate は一切見ていない。** 変更ファイル一覧を
取得する手段 (`GET /repos/{owner}/{repo}/pulls/{pull_number}/files`) も `GitHubClient` port に
存在しない。

### 制約

- 変更を禁止するのではなく **人間 merge に回す** ことで閉ループを断つ (commit は止めない)。
- 保護パスはプロジェクトごとに異なる (specrunner 以外は CI / release 構成が違う) ため
  ハードコードせず `.specrunner/config.json` に注入する。
- `GET .../pulls/{n}/files` は 1 PR あたり最大 3000 ファイルしか返さない。取りこぼしは
  「人が見ないまま CI を書き換える」事象そのものなので、完全取得できない場合は fail-closed。
- 既存 `GitHubClient` は port (`src/core/port/github-client.ts` → `src/kernel/github-client.ts`)
  と adapter (`src/adapter/github/github-client.ts`) に分離されている。core は adapter を import しない。
- config は user global + project local の 2 層で deep merge され、`validateConfig` が
  hand-written validator で検証する (zod は使わない方針)。

## Goals / Non-Goals

**Goals**:

- `job archive --with-merge` の merge 直前に、対象 PR の変更ファイル一覧を取得する port メソッドを
  `GitHubClient` に追加する。
- 変更ファイルが設定された保護パス glob のいずれかに一致したら自動 merge せず escalation で停止する。
- 変更ファイル一覧が API 上限 (3000) で打ち切られた場合も自動 merge せず escalation する (fail-closed)。
- escalation に「一致したファイル」と「人間が手で merge する手順」を含める。
- 保護パスを `.specrunner/config.json` の glob リストとして設定可能にする。未設定／空なら従来挙動 (後方互換)。
- glob 判定ロジックと保護パス評価ロジックを純関数として切り出し、ユニットテストで検証する。

**Non-Goals**:

- design step / request validate など merge より前の段階での検出 (本変更は merge-gate のみ)。
- 検証 / 受け入れロジックを変更する request の検出 (別件)。
- GitHub branch protection / CODEOWNERS の設定 (プラットフォーム側の別レイヤ。CLI 内で完結させる)。
- ファイルの変更・コミット自体の禁止 (保護パスを正当に修正する request も PR には含まれる)。

## Decisions

### D1: 検出点は `runMergeThenArchive` の「PR 解決後・wait loop 前」に置く

不可逆な merge が起きる唯一の地点は `job archive --with-merge` の squash merge であり、
そこで PR の最終 diff に対して判定する。design / validate 段階の検出は「宣言ベースで実態を
保証できない」という本問題の弱点をそのまま抱えるため不採用 (architect 評価済み)。

merge-then-archive の現行フロー:

1. job state → PR number 解決
2. 初回 `getPullRequest`
3. 既に MERGED → archive に直行
4. wait loop (checks が green になるまで poll)
5. `checkMergeableForMerge` + squash merge
6. archive

**guard は Step 3 (MERGED 短絡) の直後・Step 4 (wait loop) の前に挿入する。**

**Rationale (なぜ wait loop の前か)**: 保護パスに一致したら結論は「人間 merge に回す」で
確定し、CI の結果に依らない。CI green を待ってから escalation するのは無駄な待機になる。
fail-fast で wait loop に入る前に判定する。MERGED 済み PR は guard 対象外 (既に取り込み済みで
guard しようがない) なので Step 3 短絡の後に置く。

**Alternatives considered**:
- (a) Step 5 の merge 直前 (`checkMergeableForMerge` の直後): CI を待ってから escalation する
  ことになり待機が無駄。不採用。
- (b) `mergePullRequest` adapter 内: adapter は「GitHub API を呼ぶ」責務に閉じており、
  「保護パス設定に基づく業務判断」は core の責務。adapter に config 由来の判断を持ち込むのは
  層の越境。不採用。

### D2: `GitHubClient` port に `listPullRequestFiles` を新規追加する

port (`src/kernel/github-client.ts`) に以下を追加し、adapter で実装する:

```ts
/**
 * List the file paths changed by a pull request.
 * Calls GET /repos/{owner}/{repo}/pulls/{pull_number}/files (paginated, per_page=100).
 * GitHub caps this endpoint at 3000 files; when the cap is reached the list is
 * incomplete, signalled by truncated=true (callers MUST fail-closed).
 *
 * - files: repo-root-relative POSIX paths (the REST `filename` field)
 * - truncated: true when the 3000-file cap was reached (list is not exhaustive)
 */
listPullRequestFiles(
  owner: string,
  repo: string,
  prNumber: number,
): Promise<{ files: string[]; truncated: boolean }>;
```

**Rationale**: 既存 port に変更ファイル取得手段が無いため新規追加が必須 (要件1)。返り値に
`truncated` を含めるのは、取りこぼしを呼び出し側が fail-closed 判定できるようにするため
(要件1 / fail-closed)。adapter 境界で「REST → 内部表現」を吸収する既存方針 (D2 of
gh-cli-to-rest-api) に一致させ、core 側には `string[]` + boolean のみ渡す。

**ページネーションと打ち切り検出**: adapter は `getCheckStatus` と同じく `Link: rel="next"`
を辿って全ページ取得する (per_page=100)。GitHub はこのendpoint を最大 3000 ファイル
(= 30 ページ) で打ち切るため:
- 30 ページ (3000 件) を取得し終えてもなお `next` link が残る、または収集件数が 3000 に達した
  場合は `truncated: true` を返す。
- それ未満で `next` link が尽きた場合は `truncated: false`。

**Alternatives considered**:
- 既存 `getPullRequest` の拡張で `changed_files` (件数) を見る案: 件数しか分からずファイルパスが
  取れないので glob 判定不能。不採用。
- GraphQL: 既存 adapter は REST v3 で統一されており、GraphQL 導入は依存と複雑性を増やす。不採用。

### D3: glob 判定を純関数 `globMatch` として `src/util/` に切り出す

`src/util/glob-match.ts` に `export function globMatch(filePath: string, pattern: string): boolean`
を新規作成する。外部 glob ライブラリは追加しない (minimal-deps North Star)。

サポートする glob 構文 (gitignore/minimatch のサブセット):

| 構文 | 意味 |
|------|------|
| `*` | `/` を除く任意文字列 (単一セグメント内) |
| `**` | `/` を含む任意文字列 (複数セグメント横断) |
| `?` | `/` を除く任意 1 文字 |
| その他 | リテラル一致 (regex 特殊文字はエスケープ) |

- 判定はパス全体の完全一致 (`^...$` アンカー)。
- パスは repo-root 相対の POSIX 区切り (`/`)。case-sensitive。
- 実装は glob → RegExp 変換で行う。`**/` は「先頭 0 個以上のディレクトリ」、`/**` 末尾は
  「`/` 配下 0 個以上」、単独 `**` は `.*` として扱う。

**Rationale**: glob 一致は本変更で最もテストしやすく回帰しやすい純ロジック。util に純関数で
切り出すことで判定ロジック単体をユニットテストできる (受け入れ基準: glob 設定と判定ロジックの
ユニットテスト)。依存追加なしで North Star を守る。

**Alternatives considered**:
- `minimatch` / `picomatch` を依存追加: minimal-deps North Star に反する。本用途は小さな
  サブセットで足りるため不採用。
- 単純な `startsWith` / 前方一致: `.github/workflows/*` のような単一セグメント限定や `**/*.yml`
  のような末尾一致を表現できない。不採用。

### D4: 保護パス評価を純関数 `evaluateProtectedPaths` として core に切り出す

`src/core/archive/protected-paths.ts` に以下を新規作成する:

```ts
export interface ProtectedPathDecision {
  /** true なら自動 merge せず escalation する */
  blocked: boolean;
  /** ブロック理由: 保護パス一致 / ファイル一覧打ち切り */
  reason: "none" | "match" | "truncated";
  /** 一致した変更ファイル (reason="match" のときのみ非空) */
  matched: string[];
}

export function evaluateProtectedPaths(input: {
  changedFiles: string[];
  truncated: boolean;
  patterns: string[];
}): ProtectedPathDecision;
```

判定順序 (後方互換と fail-closed を両立):

1. `patterns` が空 (未設定/空配列) → `{ blocked: false, reason: "none", matched: [] }`
   (保護未設定 = 従来どおり)。
2. `truncated === true` → `{ blocked: true, reason: "truncated", matched: [] }`
   (保護設定済みで完全取得できない → fail-closed)。
3. `changedFiles` のうち `patterns` のいずれかに `globMatch` するものを `matched` に集め、
   `matched.length > 0` なら `{ blocked: true, reason: "match", matched }`、
   さもなくば `{ blocked: false, reason: "none", matched: [] }`。

**Rationale**: merge-then-archive の orchestration から「設定 × 変更ファイル × 打ち切り」の
判断ロジックを純関数に分離する (Step as data / Executor as behavior の延長)。I/O を持たない
ので決定表をユニットテストで網羅できる。step 1 の patterns-empty 短絡を関数内にも置くことで、
将来 truncated でも保護未設定なら従来挙動という後方互換を防御的に保証する。

### D5: 保護パス設定は `archive.protectedPaths: string[]` に置く

`SpecRunnerConfig.archive` (既存 `ArchiveConfig`) に `protectedPaths?: string[]` を追加する。
`validateConfig` の archive セクション検証に「配列であること」「各要素が非空文字列であること」を追加する。

```jsonc
// <repo-root>/.specrunner/config.json
{
  "archive": {
    "protectedPaths": [
      ".github/workflows/**",
      "release-please-config.json",
      ".release-please-manifest.json",
      "package.json"
    ]
  }
}
```

- 未設定 / `[]` → 保護なし (従来どおり自動 merge)。
- user global と project local は既存の deep merge で合成される (配列は project local が上書き)。

**Rationale**: guard の唯一の消費点が `job archive --with-merge` であり、`ArchiveConfig` は既に
merge-wait 系設定 (`mergeWaitTimeoutMs` / `mergeWaitPollIntervalMs`) を束ねている。保護パスを
同セクションに置くのが凝集的で、設定解決経路 (`loadConfig` → `config.archive`) を再利用できる。

**Alternatives considered**:
- top-level `protectedPaths`: 将来 merge 以外の検出点で共有する可能性はあるが、その検出点は
  本変更で明示的に Non-Goal。現時点の唯一の消費者 (archive) に寄せる方が凝集度が高い。将来
  複数消費者が現れた時点で top-level へ昇格すればよい。現時点では `archive` 配下を採用。

### D6: escalation は既存 `formatEscalation` を再利用し、2 種類のメッセージを出す

merge-then-archive は既に `formatEscalation({ failedStep, detectedState, recommendedAction, resumeCommand })`
で conflict / BLOCKED / timeout 等の escalation を出している。同じ形式で 2 ケースを追加する:

- **保護パス一致** (`reason: "match"`):
  - `failedStep`: `merge gate (protected paths)`
  - `detectedState`: PR が変更した保護対象ファイルの一覧 (matched を改行リストで列挙)
  - `recommendedAction`: 人間が手で merge する手順 (PR を確認 → 手動 squash merge → archive)
  - `resumeCommand`: `specrunner job archive --with-merge <slug>` (手動 merge 後に再実行すると
    MERGED を検出して archive に直行する)
- **ファイル一覧打ち切り** (`reason: "truncated"`):
  - `failedStep`: `merge gate (protected paths — file list truncated)`
  - `detectedState`: 変更ファイルが GitHub API 上限 (3000) を超え保護パス判定を保証できない旨
  - `recommendedAction`: 同上 (人間が手で確認・merge する手順)
  - `resumeCommand`: 同上

**Rationale**: escalation 出力形式の一貫性 (受け入れ基準: 該当ファイルと手動 merge 手順を含む)。
既存 formatter を使うことで finish/archive の escalation 体裁を統一する。

### D7: config → CLI → orchestrator の配線

`src/cli/archive.ts` の `--with-merge` ブロックは既に `loadConfig()` を呼び `config.archive` から
wait 系設定を読んでいる。同所で `config.archive?.protectedPaths` を読み、`runMergeThenArchive`
の input に `protectedPaths?: string[]` を渡す。config load 失敗時の fallback では `protectedPaths`
は `undefined` (= 保護なし、後方互換)。

`runMergeThenArchive` は `protectedPaths` が空/undefined のとき guard を完全にスキップする
(`listPullRequestFiles` も呼ばない)。これにより本機能未使用プロジェクトに API 呼び出しの追加負荷を
与えない。

## Risks / Trade-offs

- [Risk] `listPullRequestFiles` の打ち切り検出が甘いと取りこぼしが起きる
  → Mitigation: 「収集件数が 3000 に達した」または「30 ページ走査後も next link が残る」を
  `truncated` として fail-closed。adapter のユニットテストで 3000 超ケースを検証する。

- [Risk] glob 実装の独自化により minimatch と挙動差が出る
  → Mitigation: サポート構文を `* / ** / ? / リテラル` に限定して仕様化し、spec の Scenario と
  ユニットテストで境界 (単一セグメント `*` が `/` を跨がない等) を固定する。

- [Risk] port メソッド追加で既存の `GitHubClient` テストダブル (約 40 ファイル) が typecheck で壊れる
  → Mitigation: 各テストダブルに `listPullRequestFiles` を既定値 `{ files: [], truncated: false }`
  で追加する (tasks に明示)。verification (typecheck) と build-fixer が網羅を担保する。

- [Trade-off] guard を wait loop の前に置くため、保護パス PR では CI 結果を見ずに escalation する。
  → これは意図的。結論が「人間 merge」で確定する以上 CI 待機は無駄であり、人間が手元で CI を
  確認してから merge すればよい。

- [Trade-off] 設定キーを `archive` 配下に置いたため、将来 merge 以外の検出点が増えると再配置が要る。
  → 現時点の検出点は merge-gate 一択 (Non-Goal で固定)。昇格は将来の必要時に行う。

## Open Questions

- なし (architect 評価で検出点・commit 非禁止・設定注入・fail-closed の 4 判断は確定済み)。
