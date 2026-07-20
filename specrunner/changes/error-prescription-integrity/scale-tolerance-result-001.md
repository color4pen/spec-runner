# Scale-Tolerance Review: error-prescription-integrity (iteration 1)

- **reviewer**: scale-tolerance
- **verdict**: approved

## 観点

時間とともに件数が単調増加する対象（archive・sidecar・issue/PR・コメント・journal）に対して、
走査・ロード・API 呼び出しのコストが比例して成長するコードを検出する。

## 対象変更の概要

変更の実質はほぼ全域が **hint 文字列の差し替え**（廃止コマンド → 現行コマンド）と、
以下の3つの新規モジュール追加：

| モジュール | 役割 |
|---|---|
| `src/core/doctor/next-steps.ts` | fail 集合から次手順を導出する純関数 |
| `src/core/runtime/git-fetch-error.ts` | git fetch stderr を認証エラー wrap する純関数 |
| `tests/unit/cli/hint-command-references.test.ts` | 全 hint のコマンド参照を機械検査するテスト |

## スケール評価

### ① hint 文字列変更（14 ファイル以上）

`src/errors.ts` / `src/config/store.ts` / `src/adapter/managed-agent/agent-runner.ts` /
`src/core/doctor/checks/**` / `src/core/runtime/prereqs.ts` / `src/core/credentials/github.ts` /
`src/git/remote.ts` など。

すべて定数文字列の置換のみ。走査ロジックには一切触れていない。**O(1)。**

### ② `deriveNextSteps(results: DoctorResult[])` — next-steps.ts

doctor が実行する check の件数（K）に対して O(K)。K は doctor の固定 check セット（現行 ~15 件）であり、
archive・sidecar・journal 件数とは独立した定数。成長しない。**O(1) とみなせる。**

`formatHuman` からの呼び出しも同様。

### ③ `describeGitFetchFailure(exitCode, stderr)` — git-fetch-error.ts

4 パターンの正規表現を 1 文字列（git stderr）に適用するのみ。**O(1)。**

### ④ `configPath: getConfigPath()` — doctor.ts/types.ts/file-exists.ts

`XDG_CONFIG_HOME` 環境変数を 1 回読み、文字列を構築して `stat()` を 1 回呼ぶ。**O(1)。**

### ⑤ `hint-command-references.test.ts` — テスト時ファイルスキャン

`collectSourceFiles()` が `src/**/*.ts` を再帰走査し、各ファイルを読み込んで hint を抽出する。
対象は**ソースファイル**（開発者ペースで増加）であり、
archive・sidecar・issue/PR・コメント・journal（ユーザーデータペースで増加）ではない。
テスト実行時の処理であり、production runtime には現れない。

スケール懸念なし。

### ⑥ 削除されたファイル

`src/core/doctor/checks/storage/orphan-sidecars.test.ts`（189行削除）、
`tests/unit/core/prune/sidecar-runner.test.ts`（474行削除、コミット `dec41d56` で「実行されない死んだテスト」として削除）。

テストの削除はスケール特性に影響しない。

## Findings

なし。

## 総評

本変更は hint 文字列・エラー処方・doctor 出力整形・config パス解決のみを対象とし、
単調増加するデータストア（archive・sidecar・job catalog・journal・issue/PR）の
走査・ロード・API 呼び出しパターンを変更していない。
新規コードはすべて O(1) または O(fixed-K) であり、スケール劣化はない。
