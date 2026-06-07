# ADR-20260607: 保護パスを変更する PR を merge-gate で自動 merge 対象外にする

## ステータス

accepted

Extends: [ADR-20260603-with-merge-wait-until-green](2026-06-03-with-merge-wait-until-green.md)

## コンテキスト

`job archive --with-merge` は PR を無人で squash merge して main に取り込む。この経路では `.github/workflows/*`・release 設定・publish 設定など CI / release の仕組み自体を定義するファイルを変更した PR も、人間が中身を確認しないまま自動で main に入る。pipeline が「自分を動かす仕組み」を自分で書き換えて自分で取り込む閉ループが成立しうる。

従来の merge gate（`merge-then-archive.ts`）が保持する判定材料は以下のみであり、「PR が何のファイルを変更したか」を一切見ていなかった:

- `getPullRequest` — PR state / mergeStateStatus / mergeable / headSha
- `getCheckStatus` — checks の rollup

`GitHubClient` port には変更ファイル一覧を取得する手段も存在しなかった。

## 決定

### D1: 検出点は「PR 解決後・wait loop 前」に置く

merge-then-archive のフロー（Step 1–6）のうち、Step 3（MERGED 短絡）の直後・Step 4（wait loop）の前に保護パスガードを挿入する。

**採用理由**: 不可逆な merge が起きる唯一の地点は `--with-merge` の squash merge であり、PR の最終 diff に対して判定できる唯一の機会でもある。保護パスに一致すれば結論は「人間 merge に回す」で確定し、CI の結果に依らないため、wait loop に入る前に fail-fast するのが合理的。MERGED 済み PR は取り込み済みなので guard 対象外（Step 3 短絡の後）。

**却下案**:
- Step 5（merge 直前）での検出 — CI を待ち終えてから escalation することになり待機が無駄。
- `mergePullRequest` adapter 内での検出 — adapter は「GitHub API を呼ぶ」責務に閉じており、保護パス設定に基づく業務判断（core の責務）を持ち込むと層の越境になる。

### D2: `GitHubClient` port に `listPullRequestFiles` を新規追加する

`src/kernel/github-client.ts`（port）に以下を追加し、`src/adapter/github/github-client.ts`（adapter）で実装する:

```ts
listPullRequestFiles(
  owner: string,
  repo: string,
  prNumber: number,
): Promise<{ files: string[]; truncated: boolean }>;
```

adapter は `GET /repos/{owner}/{repo}/pulls/{pull_number}/files`（`per_page=100`、`Link: rel="next"` 追跡）を呼び、repo-root 相対の POSIX パス（REST `filename` フィールド）を収集する。GitHub がこの endpoint を最大 3000 ファイルで打ち切るため、3000 件に達した、または 30 ページ走査後も next link が残る場合は `truncated: true` を返す。

**採用理由**: 変更ファイルパスを取得する手段が port に存在しないため新規追加が必須。`truncated` を返り値に含めるのは、取りこぼしを呼び出し側が fail-closed 判定できるようにするため（D7 参照）。「REST → 内部表現」の変換を adapter 境界で完結させる既存方針（`getCheckStatus` 設計）に揃える。

**却下案**:
- `getPullRequest` の `changed_files`（件数）を参照する — ファイルパスが取れないため glob 判定不能。
- GraphQL `files` node を使う — 既存 adapter は REST に閉じており、GraphQL 導入は依存と複雑性を増やす。

### D3: glob 判定を純関数 `globMatch` として `src/util/` に切り出す

`src/util/glob-match.ts` に `export function globMatch(filePath: string, pattern: string): boolean` を新規作成する。外部 glob ライブラリは追加しない。

サポート構文（gitignore/minimatch のサブセット）:

| 構文 | 意味 |
|------|------|
| `*` | `/` を除く任意文字列（単一セグメント内） |
| `**` | `/` を含む任意文字列（複数セグメント横断） |
| `?` | `/` を除く任意 1 文字 |
| その他 | リテラル一致 |

判定はパス全体の完全一致。repo-root 相対 POSIX パス、case-sensitive。実装は glob → RegExp 変換で行う。

**採用理由**: glob 一致は本変更で最もテストしやすく回帰しやすい純ロジック。util に純関数で切り出すことで判定ロジック単体をユニットテストできる。外部依存なしで minimal-deps North Star を守る。

**却下案**:
- `minimatch` / `picomatch` を依存追加する — minimal-deps North Star に反する。本用途の構文サブセットは自前で十分。
- `startsWith` / 前方一致のみ — `.github/workflows/*` の単一セグメント限定や `**/*.yml` の末尾一致を表現できない。

### D4: 保護パス評価を純関数 `evaluateProtectedPaths` として core に切り出す

`src/core/archive/protected-paths.ts` に `evaluateProtectedPaths({ changedFiles, truncated, patterns })` を新規作成する。

判定順序:

1. `patterns` が空（未設定/空配列）→ `{ blocked: false, reason: "none", matched: [] }`（後方互換）。
2. `truncated === true` → `{ blocked: true, reason: "truncated", matched: [] }`（fail-closed）。
3. `changedFiles` のうち `patterns` のいずれかに `globMatch` するものを収集し、1 件以上あれば `{ blocked: true, reason: "match", matched }`、なければ `{ blocked: false, reason: "none", matched: [] }`。

**採用理由**: orchestration コードから「設定 × 変更ファイル × 打ち切り」の判断ロジックを純関数に分離することで、I/O を持たない決定表としてユニットテストで網羅できる。step 1 の patterns-empty 短絡を関数内にも置くことで、将来 truncated でも保護未設定なら従来挙動という後方互換を防御的に保証する。

### D5: 保護パス設定は `archive.protectedPaths: string[]` に置く

`SpecRunnerConfig.archive`（既存 `ArchiveConfig`）に `protectedPaths?: string[]` を追加する。

```jsonc
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

未設定 / `[]` → 保護なし（後方互換）。`validateConfig` の archive セクション検証に「配列であること」「各要素が非空文字列であること」を追加する。

**採用理由**: guard の唯一の消費点が `job archive --with-merge` であり、`ArchiveConfig` は既に merge-wait 系設定（`mergeWaitTimeoutMs` / `mergeWaitPollIntervalMs`）を束ねている。同セクションへの配置が凝集的で、設定解決経路（`loadConfig` → `config.archive`）を再利用できる。

**却下案**:
- top-level `protectedPaths` — 将来 merge 以外の検出点で共有する可能性はあるが、その検出点は本変更で明示的に Non-Goal。現時点の唯一の消費者（archive）に寄せる方が凝集度が高い。将来複数消費者が現れた時点で昇格すればよい。

### D6: 保護パス未設定時は `listPullRequestFiles` を呼ばない

`runMergeThenArchive` は `protectedPaths` が空/undefined のとき guard を完全にスキップし、`listPullRequestFiles` を呼び出さない。本機能未使用プロジェクトに API 呼び出しの追加負荷を与えない。

**採用理由**: 後方互換の実現と API 呼び出しコスト削減の両立。設定に依存しない動的スキップは evaluateProtectedPaths の step 1 短絡（patterns 空 → blocked: false）と二重に保証する。

### D7: ファイル一覧が API 上限（3000）で打ち切られた場合は fail-closed にする

`truncated: true` を受け取った場合、保護パスの設定がある限り自動 merge せず escalation する。保護パスの取りこぼしは「人が見ないまま CI を書き換える」という本ガードが防ぎたい事象そのものであるため、不完全な情報での自動 merge は許さない。

**採用理由**: 閉ループリスクの根本は「何が変更されたか分からないまま main に取り込む」ことにある。3000 ファイルを超える PR は異常なケースであり、そのような PR を無人で merge することには追加リスクがある。fail-open（最善を尽くして判定）より fail-closed（人間に委ねる）が安全側。

**却下案**:
- truncated でも取得済みファイルで判定する（fail-open）— 取りこぼした保護対象ファイルがあれば意図した guard が機能しない。

### D8: escalation は既存 `formatEscalation` を再利用する

merge-then-archive は既に `formatEscalation({ failedStep, detectedState, recommendedAction, resumeCommand })` で conflict / BLOCKED / timeout 等の escalation を出している。保護パスガードも同じ形式で 2 ケース（`reason: "match"` / `reason: "truncated"`）を出す。

- **保護パス一致**: `detectedState` に一致ファイル一覧、`recommendedAction` に「PR を確認 → 手動 squash merge → archive」の手順。
- **ファイル一覧打ち切り**: `detectedState` に「変更ファイルが API 上限（3000）を超えた」旨、`recommendedAction` に同上の手順。

**採用理由**: escalation 出力形式の一貫性。既存 formatter を使うことで finish/archive の escalation 体裁を統一する。

## 検討した代替案

### A1: commit 段階で保護パスの変更を検出して禁止する

実装時にファイルの変更自体を禁止し、保護パスを含む commit を reject する案。

- **Pros**: 早期検出、PR に到達する前に止められる
- **Cons**: 保護パスを正当に修正する request まで止めてしまう。「変更を禁止するのではなく人間 merge に回す」という要件に反する。宣言時点と実際の diff は一致しない場合があり、merge 直前の PR diff に対して判定する方が確実。
- **Why not**: 変更は許可し merge のみ人間に委ねる設計を採用する。

### A2: design / validate 段階で保護パスの変更を検出する

specrunner の design step や request validate で「保護パスを変更する意図があるか」を宣言ベースで検出する案。

- **Pros**: pipeline の早い段階で警告を出せる
- **Cons**: 宣言は実際のファイル変更の有無を保証しない。PR の最終 diff と乖離しうる。merge gate での検出が「PR が何を変えたか」を唯一確実に知れる地点。
- **Why not**: merge-gate 一択（architect 評価済み）。

### A3: GitHub branch protection / CODEOWNERS に委ねる

`.github/CODEOWNERS` や branch protection の required reviewer 設定で保護する案。

- **Pros**: プラットフォーム側で管理でき、CLI の変更不要
- **Cons**: 本変更は specrunner の CLI 内で完結させる要件がある。CODEOWNERS はプラットフォーム側の別レイヤであり、specrunner のプロジェクト固有設定（`.specrunner/config.json`）で保護パスを管理する設計と排他ではないが、本変更はそれに依存しない。
- **Why not**: Non-Goal として明示的にスコープ外。CLI 完結の設計が前提。

## 影響

### Positive

- CI / release の仕組みを定義するファイルを変更した PR が無人で main に入る閉ループリスクが断たれる。
- 保護パスはプロジェクト固有設定（`.specrunner/config.json`）で管理でき、specrunner 以外のプロジェクトも自分の保護対象を自由に定義できる。
- 未設定・空配列で後方互換を保ち、既存プロジェクトへの影響がない。
- glob 判定を純関数で切り出したことでロジックの単体テストが容易になる。

### Negative

- 保護パスに一致する PR は自動 merge できず、人間が手動で merge して `job archive` を再実行する必要がある。
- 保護設定済みの repo でファイル変更数が 3000 を超える PR は常に escalation（運用上問題になる可能性は低い）。
- `GitHubClient` port にメソッドを追加したため、既存のテストダブル（約 40 ファイル）への `listPullRequestFiles` 追加が必要（typecheck で検出・対処済み）。

### Known Debt

- 将来 merge 以外の検出点（design / validate 段階）が必要になった場合、`archive.protectedPaths` を top-level に昇格させる再配置が必要になる（Non-Goal として現時点では留保）。

## 参照

- Request: `specrunner/changes/protected-paths-merge-guard/request.md`
- Design: `specrunner/changes/protected-paths-merge-guard/design.md`
- Related: [ADR-20260603-with-merge-wait-until-green](2026-06-03-with-merge-wait-until-green.md) — merge-then-archive の wait loop 設計（本 ADR の検出点はそのループの前）
- Related: [ADR-20260603-archive-command-client-closed](2026-06-03-archive-command-client-closed.md) — client-closed 不変条件（本変更でも維持）
