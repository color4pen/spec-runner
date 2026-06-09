# Design: --help フラグを positional 必須チェックより先に評価する

## Context

CLI の flag 解析（`src/cli/flag-parser.ts`）と dispatch（`bin/specrunner.ts`）には、`--help` / `-h` の扱いに 2 つの欠陥がある。

1. **required positional チェックが help を考慮しない** — `parseFlags`（`flag-parser.ts` L127-136）は `positionalDef.required` が true なら、`--help` / `-h` の有無に関わらず `requires a <slug> argument` を throw する。その結果、positional が必須のサブコマンドで slug を省いて `--help` だけ渡すと、usage ではなく引数エラーになる。

2. **`--help` がほぼ全サブコマンドで unknown flag になる** — parser は `-h` を `flags["help"] = true` にマッピングする短縮エイリアスを持つ（L52-56）が、`--help`（long form）は通常の flag 解析（L73-88）に入り、コマンドの `flagDefs` に `help` が定義されていなければ `Unknown flag(s): --help` で throw する。`help` 定義を持つのは `job archive` と `runtime reset` の 2 つだけ（`command-registry.ts` L488, L564）。

現状、`job archive` と `runtime reset` は handler 内で `if (parsed.flags["help"]) { ...usage...; process.exit(0); }` を個別実装している（`command-registry.ts` L493-496, L567-570）。これは flag 定義の重複（各 subDef への `help` 追加）と到達経路の分散を招いており、他のサブコマンドに help を行き渡らせるには同じコードを 10 箇所以上に複製する必要が生じる。

dispatch は 2 経路に分かれる:
- **subcommand dispatch**（`bin/specrunner.ts` L36-77）— `request` / `job` / `runtime` / `rules` の各 subDef を `parseFlags(args.slice(2), subDef.flags, subDef.positional)` → `subDef.handler(parsed)` で実行。
- **normal command dispatch**（L79-108）— `init` / `login` / `run` / `doctor` / `usage` を `parseFlags(args.slice(1), entry.flags, entry.positional)` → `entry.handler(parsed)` で実行。

worktree guard は `run` および guardedSubcommands（`start` / `resume` / `archive`）に対して handler 実行前に走る。subcommand 経路では guard が `parseFlags` より**前**（L54-63）に位置するため、guard をくぐらないと help 判定に到達できない。

## Goals / Non-Goals

**Goals**:

- `--help` / `-h` を parser の予約フラグとして扱い、各コマンドの `flagDefs` に `help` を定義していなくても unknown flag にしない。
- `flags["help"]` が true のとき required positional チェックをスキップし、slug なし `--help` でエラーにしない。
- dispatch 層に help 表示の共通処理を 1 系統で持ち、`flags["help"]` が true なら usage を stdout に出して exit 0 する。各 handler で個別に書かない。
- `job archive` / `runtime reset` の handler 内 help 分岐と、両 subDef の `help` flag 定義を除去し、共通処理に統合する（到達不能コードを残さない）。
- `job archive --help` / `runtime reset --help` の出力（それぞれ `ARCHIVE_USAGE` / `RUNTIME_RESET_USAGE`）を後方互換に保つ。

**Non-Goals**:

- CLI 層の DDD 的構造化（コマンド定義の分離、ミドルウェア導入）。
- usage 文字列の内容変更・新規執筆。usage 未定義のサブコマンドは汎用 fallback メッセージで対応する。
- 親コマンド単独の help（`specrunner job --help` / `specrunner request --help` 等）の挙動変更。これは subcommand dispatch の別経路（L40-43）の既存挙動であり、本変更の対象外。
- `--verbose` / `--quiet` 等、help 以外の short alias の long form 予約化。

## Decisions

### D1: `--help` / `-h` を parser の予約フラグにする

`parseFlags` の `--` 解析ブランチで、`flagName === "help"` の場合は `flagDefs` 参照（unknown flag 判定）に入る前に `flags["help"] = true` を設定して次トークンへ進める。`-h` は既存マッピング（L52-56）をそのまま使う。これにより `--help` / `-h` はコマンドの `flagDefs` に `help` が無くても常に受理される。

- **Rationale**: 「parser 側で常に受け入れる」という要件を 1 箇所の予約判定で満たせる。各 subDef へ `help: { type: "boolean" }` を撒く案は定義重複であり、追加忘れによる regression を生む。予約判定は unknown flag throw（L86-88）より前に置くことで、後発のコマンド追加でも help が自動的に効く。
- **Alternatives considered**:
  - 全 subDef に `help` flag を追加: 定義が分散し、新規コマンドで追加忘れが起きる。要件 1 が明示的に否定。
  - `flagDefs` の既定値として `help` を常時 merge: parser 内部状態が増え、`def.type` 経路を通すと boolean 既定の扱いが暗黙になり読みにくい。予約 short-circuit の方が意図が明示的。

### D2: help 時に required positional チェックをスキップ

`parseFlags` 末尾の required positional チェック（L127-136）の条件を `positionalDef?.required && !flags["help"]` にする。`flags["help"]` が true なら positional 不足でも throw しない。

- **Rationale**: 要件 2 そのもの。help は引数を必要としない操作であり、引数不足エラーより help 表示を優先するのが CLI 慣行。判定は parser 末尾の 1 箇所のみで完結する。
- **Alternatives considered**:
  - dispatch 側で「help なら parse エラーを握りつぶす」: parseFlags が throw する以上、help 判定が parse 後に来られず、try/catch で FlagParseError を help と区別する泥臭い分岐になる。parser 内で完結させる方が単純。

### D3: dispatch 層に共通 help 処理を置き、worktree guard より前に評価する

subcommand / normal の両 dispatch 経路で、`parseFlags` 直後・handler（および worktree guard）より前に `if (parsed.flags["help"])` を判定し、usage を stdout へ書いて exit 0 する。usage の出所はコマンド定義の `usage` フィールド（subDef.usage / entry.usage）。未定義なら汎用 fallback メッセージを出す。両経路で同一挙動になるよう、小さなヘルパ（usage を受け取り stdout 出力 + exit 0）に集約する。

worktree guard より前に置くことで、worktree 内からでも `--help` が usage を返す（help は非破壊操作のため guard を通す必要がない）。

- **Rationale**: 要件 3。help 判定を dispatch の 1 系統に集約すれば、handler は help を意識しなくてよい。guard より前に置く設計は acceptance「全サブコマンドで `--help` が動作」を worktree コンテキストでも満たす。normal 経路では guard は元々 `parseFlags` の後（L86-91）にあるため、help 判定を parseFlags 直後に差し込むだけで guard 前になる。subcommand 経路では guard を `parseFlags` の後ろへ移し、その手前に help 判定を置く。
- **Alternatives considered**:
  - guard を現状維持（parseFlags より前）し help 判定だけ後ろに足す: guarded subcommand（start/resume/archive）の `--help` が worktree 内で guard に弾かれ、help が出ない。acceptance を満たしきれない。
  - handler 内で個別に help を処理する現行方式の踏襲: 要件 3/4 が明示的に否定（個別実装を除去する）。

### D4: usage 未定義サブコマンドの fallback と後方互換

usage 文字列を持たないコマンド（`job resume` / `request review` / `request validate` / `job show` 等、および normal の `run` / `init` / `login` / `doctor` / `usage`）は、汎用 fallback メッセージ（例: `No detailed help available for this command.` ＋ `Run 'specrunner --help' for the command list.`）を出す。fallback 文字列は usage 定数群（`command-registry.ts`）に 1 つ定義し、両経路で共有する。

後方互換のため:
- `job archive` の subDef は既に `usage: ARCHIVE_USAGE` を持つ（L491）。flag 定義の `help`（L488）と handler 内 help 分岐（L493-496）のみ除去すれば、共通処理が `ARCHIVE_USAGE` を出すので出力は不変。
- `runtime reset` の subDef は `usage` フィールドを持たず、handler が `RUNTIME_RESET_USAGE` をハードコードしている。共通処理へ移すと `RUNTIME_RESET_USAGE` が失われ regression するため、**reset subDef に `usage: RUNTIME_RESET_USAGE` を追加**したうえで flag の `help`（L564）と handler 内 help 分岐（L567-570）を除去する。

- **Rationale**: 要件 4 + acceptance「`job archive` の既存 `--help` 処理と後方互換」。usage は subDef.usage を single source of truth にし、reset だけが持っていた「handler ハードコード」を subDef へ移送することで、共通処理に正しい usage を供給する。
- **Alternatives considered**:
  - fallback に top-level `USAGE` を出す: コマンド固有でない長大なヘルプが出て文脈に合わない。簡潔な汎用メッセージ＋top-level への誘導が妥当。

## Risks / Trade-offs

- [Risk] subcommand 経路で worktree guard を `parseFlags` の後ろへ移すと、**worktree 内で guarded subcommand に不正フラグ/引数不足を渡した場合**、従来は worktree guard エラーが出ていたのが flag parse エラー（exit 2）に変わる。→ Mitigation: 両者とも非ゼロ exit で失敗を伝える点は不変。precedence の変化はエラーメッセージのみで、help 以外の正常系・既存テスト（detectWorktree を `isWorktree: false` に mock）に影響しない。設計判断としてドキュメント化し、reviewer の確認に委ねる。
- [Risk] parser の予約フラグ追加により、将来 `help` という名の string flag を定義しても予約に飲まれて機能しない。→ Mitigation: `help` は CLI 全体で help 専用に予約する規約とする（`-h` が既に同名で予約済みのため実質的な制約増は無い）。
- [Trade-off] fallback メッセージは usage を持たないサブコマンドに対し詳細を出せない。→ usage 文字列の新規執筆はスコープ外のため許容。詳細 help が必要なコマンドは後続で `usage` フィールドを足せば共通処理が自動的に拾う。

## Open Questions

なし（architect 評価済みの設計判断に沿って D1-D4 で確定）。
