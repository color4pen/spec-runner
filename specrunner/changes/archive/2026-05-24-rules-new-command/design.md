# Design: `specrunner rules new` コマンド

## 概要

`specrunner rules new <step-name> <rule-slug>` コマンドを追加し、`specrunner/rules/<step-name>/<NN>-<rule-slug>.md` を scaffold する。既存の `request new` と同型の noun-verb 構造で CLI surface の一貫性を保つ。

## アーキテクチャ変更

### 変更対象モジュール

| ファイル | 変更種別 | 内容 |
|---|---|---|
| `src/cli/flag-parser.ts` | 拡張 | `positionals: string[]` を `ParsedArgs` に追加。全 non-flag トークンを収集する |
| `src/cli/command-registry.ts` | 拡張 | `rules` parent command + `new` subcommand を登録。`USAGE` 文字列を更新 |
| `src/core/command/rules-new.ts` | 新規 | `executeRulesNew()` コアロジック |
| テスト群 | 新規 | `rules-new.test.ts`, `flag-parser.test.ts` 追加ケース |

### 新規モジュールなし (Port/Adapter 追加なし)

既存の `step-names.ts` (step 名参照), `paths.ts` (`stepRulesDirRel`), `errors.ts` を再利用する。新しい port/adapter は不要。

## 設計判断

### FP-1: flag-parser の多 positional 対応

**問題**: 現在の `parseFlags` は positional を 1 つしか取れない (`positional?: string`)。`rules new` は `<step-name>` と `<rule-slug>` の 2 つが必要。

**決定**: `ParsedArgs` に `positionals: string[]` フィールドを追加する。

```typescript
export interface ParsedArgs {
  flags: Record<string, string | boolean>;
  positional?: string;     // 後方互換: positionals[0]
  positionals: string[];   // 全 non-flag トークン
}
```

- `positional` は `positionals[0]` のエイリアスとして残す (既存ハンドラは変更不要)
- non-flag トークンを全て `positionals` 配列に push する
- 既存コマンドは `positional` を使い続けるので破壊的変更なし

**代替案の却下**:
- `<step-name>` を `--step` flag にする → request の noun-verb 慣例と乖離、自然な語順が崩れる
- handler 内で raw args をパースする → flag-parser をバイパスするアドホック

### FP-2: positionalDef の拡張

`positionalDef` に `count?: number` を追加し、必要な positional 数を宣言的に定義する。

```typescript
positional?: { name: string; required: boolean; count?: number };
```

- `count` 省略時は従来通り 1 (後方互換)
- `count: 2` の場合、`positionals.length < 2` で `FlagParseError` を投げる
- エラーメッセージ: `"requires <step-name> and <rule-slug> arguments"`

### RN-1: `executeRulesNew()` の責務

`src/core/command/rules-new.ts` に配置。`request-new.ts` と同パターン。

```typescript
export async function executeRulesNew(
  stepName: string,
  ruleSlug: string,
  cwd: string,
): Promise<number>
```

**処理フロー**:

1. **step-name 検証**: `AGENT_STEP_NAMES.includes(stepName)` で突き合わせ。不一致 → stderr にエラー + 候補一覧、exit 2
2. **rule-slug sanitize**: 
   - `_` / 空白 → `-` に変換 + stderr に warning
   - 変換後に `SLUG_REGEX` で検証。不一致 → exit 2
3. **ディレクトリ scan + 採番**: `specrunner/rules/<step-name>/` の `.md` ファイルを `readdir`。数字 prefix の max + 1。空なら 01。ゼロパディング 2 桁
4. **衝突チェック**: 生成予定のファイル名と既存ファイルの完全一致を検査。一致 → exit 1
5. **ディレクトリ作成**: `mkdir -p` 相当 (`fs.mkdir({ recursive: true })`)
6. **テンプレート書き込み**: embedded const → `fs.writeFile`
7. **stdout に作成パスを出力**: `process.stdout.write(filePath + "\n")`。exit 0

**終了コード**: `request-new.ts` と統一。0 = 成功, 1 = 衝突, 2 = 入力不正

### RN-2: template 内容

source code 内の string const として保持 (D2)。

```markdown
<!-- このファイルは specrunner rules new で生成されました。
CLI はこのファイルの中身を解釈しません。書き手の自然文で自由に書いてください。
推奨見出しは強制ではありません — 削除・追加・並べ替えは自由です。
番号 prefix (NN-) が follow-up の実行順序を決めます。
順序の方針: 重要度が高いルールを末尾に配置すると recency bias により効果的です。 -->

## やめてほしいこと

## こうしてほしいこと

## 例外
```

### RN-3: slug sanitize の挙動 (request-new との差分)

`request new` の SLUG_REGEX (`/^[a-z0-9][a-z0-9-]{0,63}$/`) をベースにするが、以下の差分がある:

- `_` → `-` に自動変換 + stderr warning (request-new にはない)
- 空白 → `-` に自動変換 + stderr warning (request-new にはない)
- 上記変換 **後** に SLUG_REGEX で最終検証。不合格 → exit 2

この差分は要件 4 で明示されている。sanitize ロジックは `executeRulesNew` 内にインラインで実装する (共通化は将来の `rules` 拡張時に検討)。

### CR-1: command-registry 登録

```typescript
rules: {
  subcommands: {
    new: {
      flags: {},
      positional: { name: "step-name rule-slug", required: true, count: 2 },
      handler: async (parsed) => {
        const stepName = parsed.positionals[0]!;
        const ruleSlug = parsed.positionals[1]!;
        process.exit(await executeRulesNew(stepName, ruleSlug, process.cwd()));
      },
    },
  },
  usage: RULES_USAGE,
},
```

### CR-2: USAGE 文字列の更新

`USAGE` に `Rules commands:` セクションを追加:

```
Rules commands:
  rules new <step> <slug>         step 用の rules ファイルを scaffold
```

### CR-3: RULES_USAGE (rules --help)

`specrunner rules --help` / `specrunner rules` (subcommand なし) で表示する dedicated help。step 名規約・番号 prefix・推奨見出し・順序方針を含める。

## ファイルシステム操作

- `node:fs/promises` を直接使用 (`request-new.ts` と同パターン)
- `rules-resolve.ts` の `RulesResolveFs` は **使用しない** — resolve は step executor 用。scaffold は `readdir` + `writeFile` のみ

## テスト方針

- `rules-new.test.ts`: `request-new.test.ts` と同パターン。tmpdir ベース、process.stderr mock
- `flag-parser.test.ts`: `positionals` 収集の追加ケース (既存テストの回帰なし確認)
- step-name hardcode 回避: `AGENT_STEP_NAMES` を import して使う (grep テストと整合)
