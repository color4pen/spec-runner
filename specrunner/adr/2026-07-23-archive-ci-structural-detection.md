# ADR-20260723: --with-merge の CI 有無判定を時間観測から構造判定（fail-closed）に変える

## ステータス

accepted

Extends: [ADR-20260603-with-merge-wait-until-green](2026-06-03-with-merge-wait-until-green.md)

## コンテキスト

`job archive --with-merge`（`src/core/archive/merge-then-archive.ts`）は check rollup が `"none"`（checks 未出現）の状態が 60 秒続くと「CI なし repo」と仮定して merge に進む（`NONE_CHECK_GRACE_MS = 60_000`、L52）。

この判定は **時間観測** に基づく fail-open 設計であり、GitHub Actions のスケジューリング遅延（queue 混雑・cold start）が 60 秒を超えると CI のある repo で CI 未検証のまま merge が実行される。実際に、checks 未出現 60 秒で merge が実行され、merge 後に base branch 側で CI が `queued` になった run が確認された（repo に CI は存在し、単に起動が遅かっただけ）。

repo が CI を持つかどうかは時間に依存する情報ではなく、**構造（`.github/workflows/` に push / pull_request トリガを持つ workflow 定義が存在するか）** という確定的な事実で判定できる。archive commit は `runArchiveOrchestrator` が local worktree に作成・push するため、判定対象の tree は local git で検査可能である（`recordDir`、L212）。

[ADR-20260603-with-merge-wait-until-green](2026-06-03-with-merge-wait-until-green.md) では `"none"` を「vacuously green として merge へ進む」ケースと位置付けた。本 ADR はその判断を修正し、`"none"` の意味を「checks がまだ出現していない（CI あり repo なら待ち続けるべき）」に再定義する。grace 窓は CI 有無の構造判定を発動する契機として保持し、判定後の結論（merge か待ちか）だけを変える。

## 決定

### D1 — CI 有無判定を時間観測から構造判定に切り替える（fail-closed）

`"none"` grace 超過時に「CI なし → merge」と結論するのをやめる。grace 超過かつ非 BLOCKED のとき、archive commit の tree を検査して CI 有無を構造的に判定し、その結果で行動を分岐する:

- **CI あり**（`present: true`）→ merge に進まず、checks が出現するまで待ち続ける。`mergeWaitTimeoutMs` 超過時は merge せず escalation する（fail-closed）。
- **CI なし**（`present: false`）→ 既存挙動を維持して merge へ進む。

**採用理由**: CI 有無は `.github/workflows/` の内容という確定的な事実であり、チェックスケジューリング遅延という可変かつ unbounded な時間観測で推論する理由がない。構造判定は決定論的で、local git から即座に取得できる。

**却下案**:
- *time grace を延長するだけ*: どんな閾値でも時間ベースの guess であり fail-open のままになる。遅延が閾値を超えれば同じ問題が再現する。
- *workflow run 実績を GitHub API で照会する*: `GitHubClient` port の拡張と API 呼び出し増を伴う。また、workflow を追加したばかりの repo（run 実績ゼロ）では CI あり repo を CI なしと誤判定する。

### D2 — テキストレベルのトリガ検出（YAML パーサなし）、fail-closed バイアス

workflow ファイルの本文にトークン `push` または `pull_request` が含まれれば「CI トリガあり」と判定する。YAML を構文解析しない。

検出パターン（実装者が fail-closed バイアスを維持しつつ refine 可能）:

```
/(?:^|[\s,[{'"])push(?:[\s,:\]}'"]|$)|(?:^|[\s,[{'"])pull_request/m
```

- `pull_request` はプレフィックスマッチとして扱い、`pull_request_target` / `pull_request_review` もマッチする（過検出は待つ側に倒れるため許容）。
- ジョブ名 `push-image` 等のトークンは `-` がデリミタ外のため非マッチ。

**採用理由**: 依存極小の North Star が YAML パーサ追加を禁じる。fail-closed バイアスが非対称性を補完する — 誤陽性（トリガなし workflow を CI あり判定）はオペレーターへの timeout escalation に終着し、誤陰性（トリガありを CI なし判定）より安全。テキスト検出とストリクト YAML 解析の差分は fail-closed 側に吸収される。

**却下案**:
- *YAML パース による厳密なトリガ解釈*: YAML パーサ追加が依存極小の原則に反する。精度向上分はすべて fail-closed 側（timeout escalation）に収束するため、トレードオフが成立しない。

### D3 — 検出ロジックを独立した純粋モジュール `workflow-ci-detection.ts` に分離する

`src/core/archive/workflow-ci-detection.ts` を新設し、単一の検出関数をエクスポートする。関数は `spawn`（注入可能）・`cwd`（`recordDir`）・`ref`（archive commit SHA）を受け取り、`{ present: boolean; reason: CiDetectionReason }` を返す。

検出の契約:

1. `git ls-tree <ref> -- .github/workflows/` を実行。
   - exit ≠ 0 → `{ present: true, reason: "inspection-failed" }`（fail-closed）。
   - exit 0 かつ stdout 空 → `{ present: false, reason: "no-workflows" }`。
2. `blob` エントリのうち `.yml` / `.yaml` で終わるものを候補とする（`tree` エントリはスキップ）。
   - 候補なし → `{ present: false, reason: "no-workflows" }`。
3. 各候補 blob に対して `git cat-file -p <sha>` を実行。
   - 読み取り失敗（exit ≠ 0）→ `{ present: true, reason: "inspection-failed" }`。
   - トリガパターンに最初にマッチした時点で → `{ present: true, reason: "trigger-match" }`。
4. 候補が存在したが全てマッチしなかった → `{ present: false, reason: "no-trigger" }`。

このモジュールは `GitHubClient` port も orchestrator も import しない。

**採用理由**: `src/core/archive/` 全体で確立されている Ports & Adapters ／ 注入 spawn スタイル（`post-merge-integrity.ts` / `orchestrator.ts` 等）と整合し、検出ロジックをマージ待ちループの GitHub mock と独立してユニットテスト可能にする。

**却下案**:
- *`"none"` ブランチにインラインで git 呼び出しを埋め込む*: すでに大きい `runMergeThenArchive` 関数をさらに肥大化させ、トリガ検出テストがマージ全体のオーケストレーションモックに依存する。

### D4 — `"none"` ブランチへの fail-closed ゲートとして検出結果を組み込む

grace 超過かつ非 BLOCKED の `"none"` パスで検出を呼び出し（実行は 1 回のみ、以降はキャッシュ）、結果で分岐する:

- `present === false`（CI なし）→ 既存の CI-less メッセージを出力して `break`（merge へ）。
- `present === true`（CI あり）→ merge しない。`effectiveTimeoutMs !== null` かつ `now - start >= effectiveTimeoutMs` なら timeout escalation を返す。未超過なら `sleep(pollIntervalMs)` して次の poll 周へ。

これにより 3 つの受け入れ定義挙動が成立する:

| tree の状態 | `"none"` grace 超過後の挙動 |
|---|---|
| push / pull_request トリガを持つ workflow が存在する | 待ち続け、`mergeWaitTimeoutMs` 超過で escalation |
| workflow 定義が存在しない | merge（従来動作維持） |
| push / pull_request トリガを持たない workflow のみ（例: schedule） | CI-less 判定 → merge |

**採用理由**: grace 窓を「checks が出現するまでの猶予」として維持しつつ、超過時の結論だけを構造判定で差し替える。deadline と sleep のパターンは既存の pending 待ちと同一にして、`null`（無制限）と有限 timeout で一貫した挙動を保つ。

### D5 — `archiveSha` 不明・検査失敗は fail-closed に帰着する

`archiveSha` が `undefined`（archive 記録時の `git rev-parse HEAD` 失敗、異常状態）のとき、git 検査を行わず CI あり（fail-closed）として扱う。検査を試みて git 呼び出しが失敗した場合も同様（D3）。

**採用理由**: head commit が特定できない、または tree が読めない場合の安全な結論は「CI あり → 待つ → timeout → オペレーター」であり、無言の CI-less merge は許容しない。

**却下案**:
- *`archiveSha` 不明時は `recordDir` の `HEAD` を検査する*: 正常ケースでは `HEAD` が archive commit と一致するが、異常状態に追加分岐を設けることになる。明示的な fail-closed ルールで済む問題に複雑性を加える必要がない。

## 検討した代替案

### A1: `NONE_CHECK_GRACE_MS` を延長するだけ

`NONE_CHECK_GRACE_MS = 60_000` を 120 秒・300 秒等に増やして、スケジューリング遅延を吸収する案。

- **Pros**: 変更量が最小（定数変更のみ）。コードパスに一切触れない。
- **Cons**: 任意の固定閾値でも時間ベースの推測であり fail-open のまま。遅延が新しい閾値を超えれば同じ問題が再現する。閾値を大きくするほど CI-less repo の merge が遅延する。
- **Why not**: 根本原因（時間観測による推論）を解決しない。CI があるかどうかは時間に依存しない構造的事実であり、閾値調整では本質的に解決できない。

### A2: workflow run 実績を GitHub API で照会する

`GET /repos/{owner}/{repo}/actions/runs`（または `/workflows`）で過去の実行実績を確認し、実績があれば CI あり repo と判定する案。

- **Pros**: 実際に CI が動いた実績を根拠にするため、誤判定の直感的説明がしやすい。
- **Cons**: `GitHubClient` port の拡張（新 API エンドポイント）と API 呼び出し増を伴う。workflow を追加したばかりの repo（実績ゼロ）で CI あり repo を CI なしと誤判定する。API レート制限の影響を受ける。
- **Why not**: 「実績ゼロ = CI なし」という誤判定が避けられない。また、判定に追加 API 呼び出しを必要とすることが「GitHub API の呼び出しを増やさない」という要件に反する（request.md 要件 5）。

### A3: YAML パーサによる厳密なトリガ解釈

`js-yaml` 等の YAML パーサを使って workflow ファイルの `on:` キーを正確に解析し、push / pull_request トリガの有無を判定する案。

- **Pros**: `on:` マッピングを正確に解析でき、ジョブ名やコメントへの過検出がなくなる。トリガ有無の判定が YAML 仕様に準拠する。
- **Cons**: YAML パーサ package の追加が必要（`dependencies` 変更）。依存極小の North Star に反する。over-detect（テキストが CI あり判定、YAML 解析が CI なし判定）の差分はすべて fail-closed 側（timeout escalation）に収束するため、追加依存のコストに見合う精度向上がない。
- **Why not**: 依存追加が依存極小の原則に反する（request.md 要件 4）。text 検出との精度差は fail-closed バイアスによって吸収されるため、トレードオフが成立しない。

### A4: `merge-then-archive.ts` の `"none"` ブランチにインラインで実装する

`workflow-ci-detection.ts` を新設せず、`runMergeThenArchive` 関数の `"none"` 処理ブランチ内に `git ls-tree` / `git cat-file` 呼び出しを直接埋め込む案。

- **Pros**: 新規ファイルを増やさない。変更が 1 ファイルに収まる。
- **Cons**: すでに大きい `runMergeThenArchive` をさらに肥大化させる。トリガ検出のユニットテストがマージ全体のオーケストレーション mock（GitHub API / sleep / PR state 等）に依存してしまう。
- **Why not**: `src/core/archive/` で確立されている「注入 spawn で切り出して独立テスト」スタイル（`post-merge-integrity.ts` 等）から逸脱する。検出ロジックが変更された際に merge 全体テストの修正が波及する。

### A5: `archiveSha` 不明時は `recordDir` の `HEAD` にフォールバックする

`archiveSha === undefined` の場合に即 fail-closed とするのではなく、`recordDir` の `HEAD` を検査 ref として使う案。

- **Pros**: 正常ケースでは `HEAD` が archive commit と一致するため等価の挙動が得られる。`undefined` 状態でも検査を試みられる。
- **Cons**: 異常状態への追加分岐が増え、コードが複雑になる。`HEAD` が archive commit と一致しない病的状態（コード上のバグ）でも検査を試みることになり、誤判定の経路が生まれる。
- **Why not**: `archiveSha === undefined` はそれ自体が異常状態であり、そこで検査を続けることで別の誤りを隠蔽しうる。「不明 → CI あり → 待つ → timeout → オペレーター」という明示的な fail-closed ルールのほうが単純かつ安全。

## 既知のトレードオフ

- **CI あり判定だが実際には workflow が発火しないケース**（例: `paths-ignore` でこの PR を除外）: checks が `"none"` のまま timeout escalation になる。意図したセーフサイド。スコープ外と明示し、オペレーターが手動解決する。
- **テキスト過検出**（例: ジョブ名やコメントに `push` が含まれる）: fail-closed（待つ）側に倒れる。タイミングにのみ影響し、merge 正確性には影響しない。
- **`mergeWaitTimeoutMs: null`（無制限）+ CI あり + checks 永続 none**: 無限に待ち続ける。`null` の明示的な意味（無制限待機）どおりの挙動であり、有限 default を使う限り発生しない。
- **local git サブプロセスの追加**: `git ls-tree` と `git cat-file` 呼び出しは grace 超過かつ `"none"` のパスでのみ発生し、結果はキャッシュされる。1 archive 実行あたり最大 1 回、ネットワーク不要。

## 影響

### Positive

- CI のある repo で CI 未検証のまま merge される fail-open 経路が解消される。
- 判定が決定論的になり、GitHub Actions のスケジューリング遅延に左右されなくなる。
- 新規依存を一切追加しない（package.json の dependencies 無変更）。

### Negative

- CI あり判定だが実際には workflow が発火しない PR では timeout escalation になる（意図的なセーフサイド）。

## 参照

- Request: `specrunner/changes/archive-ci-structural-detection/request.md`
- Design: `specrunner/changes/archive-ci-structural-detection/design.md`
- Related: [ADR-20260603-with-merge-wait-until-green](2026-06-03-with-merge-wait-until-green.md) — `"none"` rollup と wait ループの基盤設計（本 ADR の D1 で `"none"` の結論部分を置き換え）
