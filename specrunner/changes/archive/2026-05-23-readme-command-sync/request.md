# README のコマンド記載を実 CLI に同期する（削除済みコマンド除去 + 欠落追記）

## Meta

- **type**: bug-fix
- **slug**: readme-command-sync
- **base-branch**: main
- **adr**: false

<!-- adr 判断基準: 新しい port/adapter 追加、既存パターンと異なる設計選択、振る舞い/契約を変える修正、構造的リファクタリング → true。いずれにも該当しない → false -->

<!-- spec 変更を伴う場合: authority path (specrunner/specs/...) を編集対象として記述しないこと。delta spec path (specrunner/changes/<slug>/specs/<capability>/spec.md) で表現する -->

## 背景

README.md の Command Reference / Quick Start が実 CLI と乖離している。CLI の no-arg help が正（実装の真実）であり、README が追従していない。新規ユーザーが README を読んで**存在しないコマンドを叩く**。

実機照合で判明した drift（README 行番号 / 実 CLI）:

| README 記載 | 実 CLI | 是正 |
|---|---|---|
| L48 `request show <slug>` | 存在しない（#358 で削除） | 削除 |
| L49 `request rm <slug>` | 存在しない（#358 で削除） | 削除 |
| L61 `job rm <jobId>` | `job cancel <jobId>`（#359 で統合） | `job cancel` に置換 |
| （欠落） | `job cancel <jobId>` | 追記 |
| L101 `init --runtime managed` | `--runtime` flag は廃止（init.ts:16,21 で error） | quick-start を修正 |

実 CLI の正しいコマンド集合（no-arg help より）:
- request: `new` / `generate` / `ls` / `validate` / `template` / `review`
- job: `start` / `ls` / `show` / `cancel` / `resume` / `finish`
- env: `init` / `login` / `doctor` / `runtime setup|status|reset`
- alias: `run`

## 要件

1. README の Request commands から `request show` / `request rm` を削除する。
2. README の Job commands の `job rm <jobId>` を `job cancel <jobId>`（job を cancel して cleanup）に置換する。
3. managed runtime の Quick Start（L100-104 付近）から `init --runtime managed` を除去し、現行手順（`init` で local-default scaffold → `SPECRUNNER_API_KEY` 設定 → `runtime setup`）に修正する。
4. README の Command Reference 全体を実 CLI の no-arg help と一致させる（上記以外に齟齬があれば併せて是正）。

## スコープ外

- CLI の実装・help テキスト自体の変更（README を実装に合わせるのであり、逆ではない）
- `init.ts:16` の error メッセージが「`managed setup`」と案内する一方 help は「`runtime setup`」である内部不整合（command 名 `runtime` vs `managed`）— これは README sync ではなく実装側の別問題。**別 issue 候補として報告のみ**、本件では README を help 表記（`runtime setup`）に合わせる。
- spec / コード変更

## 受け入れ基準

- [ ] README に `request show` / `request rm` / `job rm` の記載が無い
- [ ] README に `job cancel <jobId>` が記載されている
- [ ] managed Quick Start に `init --runtime managed` の記載が無い
- [ ] README の Command Reference の **コマンド名・サブコマンド名・引数名**が CLI の USAGE 定数（`src/cli/command-registry.ts`）と 1:1 対応する（説明文は README=英語 / USAGE=日本語で異なるため、対応を取るのは識別子のみ）
- [ ] `bun run typecheck && bun run test` が green（README のみの変更なので影響なしを確認）

## Workflow Options

- enabled: []

## architect 評価済みの設計判断

なし（doc 同期の bug-fix。設計判断・コード変更を含まない）。
