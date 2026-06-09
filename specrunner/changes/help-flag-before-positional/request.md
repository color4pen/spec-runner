# --help フラグが positional 必須チェックより先に評価されるようにする

## Meta

- **type**: bug-fix
- **slug**: help-flag-before-positional
- **base-branch**: main
- **adr**: false

<!-- adr 判断基準: 新しい port/adapter 追加、既存パターンと異なる設計選択、振る舞い/契約を変える修正、構造的リファクタリング → true。いずれにも該当しない → false -->

## 背景

2 つの問題が重なっている。

1. `src/cli/flag-parser.ts:127` の required positional チェックが `--help` / `-h` フラグの有無を考慮せずに throw する。positional が必須のサブコマンドで slug を省略して `--help` だけ渡すと、help 表示ではなく「requires a `<slug>` argument」エラーになる。
2. `--help` フラグが `job archive` にしか定義されていない。他のサブコマンド（`job resume` / `job start` / `job cancel` / `job show` / `request validate` / `request review` / `request new` 等）は `help` フラグ自体がないため「Unknown flag(s): --help」で弾かれる。

`flag-parser.ts` は `-h` → `help: true` のマッピングを既に持っているが、コマンドの flags 定義に `help` がないと unknown flag 扱いになる。

## 要件

1. `--help` / `-h` をパーサの共通フラグとして扱う。各サブコマンドの flags 定義に `help` を個別追加するのではなく、パーサ側で `--help` / `-h` を常に受け入れ、`flags["help"]` を設定する。
2. `flags["help"]` が true の場合、required positional チェック（L127-136）をスキップする。
3. コマンドディスパッチ層（`bin/specrunner.ts`）で `flags["help"]` が true の場合に usage を表示して exit する共通処理を入れる。各 handler が個別に `if (parsed.flags["help"])` を書かない形にする。
4. `job archive` および `runtime reset` の handler にある既存の `--help` 個別処理を共通処理に統合し、冗長な個別定義を除去する。

## スコープ外

- CLI 層の DDD 的構造化（コマンド定義の分離、ミドルウェア導入等は別件）。
- usage 文字列の内容変更・追加（usage が未定義のサブコマンドには空の usage を返すか、汎用メッセージで対応）。

## 受け入れ基準

- [ ] 全サブコマンドで `--help` / `-h` が slug なしで動作し、usage を表示する
- [ ] `specrunner job archive --help` / `specrunner job resume --help` / `specrunner request review --help` 等が全て usage を表示する
- [ ] `--help` なし・slug なしの場合は従来どおり「requires a `<slug>` argument」エラーになる
- [ ] `job archive` の既存 `--help` 処理と後方互換
- [ ] テストケースが追加されている
- [ ] `typecheck && test` が green
- [ ] `lint` が green

## architect 評価済みの設計判断

- `--help` / `-h` はパーサの予約フラグとして扱い、unknown flag 判定から除外する。各コマンドの flags 定義への `help` 追加は不要。
- 共通 help 処理はコマンドディスパッチ（`bin/specrunner.ts` の handler 呼び出し前）に 1 箇所で入れる。usage 文字列はコマンド定義の `usage` フィールドから取得（未定義の場合は汎用の「No detailed help available」等で対応）。
- `job archive` と `runtime reset` の handler 内の個別 `--help` チェックは共通処理に統合後に除去する（到達不能コードを残さない）。
