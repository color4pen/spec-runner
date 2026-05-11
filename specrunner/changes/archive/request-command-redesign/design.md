## Context

`specrunner create` は 4 段階のフロー（initSession → dialogLoop → detectCompletion → finalize）で request.md を対話生成する。しかし Claude Code 自体が対話 UI を提供しているため、specrunner が SDK の内部ストリームを消費して自前 REPL を構築する必要がない。

現在の依存関係:
- `bin/specrunner.ts` → `src/cli/create.ts` → `src/core/command/create.ts` → `src/core/command/create-dialog.ts`
- `create-dialog.ts` → `src/prompts/create-dialog.ts`, `src/state/draft-store.ts`, `src/cli/spinner.ts`, `src/adapter/claude-code/message-types.ts#isToolUseStart`

`buildScaffoldTemplate()` は `--no-llm` モードで使われる純粋関数で、request.md テンプレートの唯一のソース。`parseRequestMdContent()` は `src/parser/request-md.ts` にあり、create 以外（run pipeline）でも使用される汎用パーサ。

## Goals / Non-Goals

**Goals:**

- `specrunner request template [--type <type>]` でテンプレートを stdout に出力する
- `specrunner request validate <file>` で request.md のフォーマットを検証する
- create コマンドと関連する 6 ソースファイル + 6 テストファイルを削除する
- `isToolUseStart` を message-types.ts から削除する
- 既存パイプライン（run / finish / resume）への影響ゼロを保証する

**Non-Goals:**

- request のディレクトリ管理（active/draft/merged 遷移）
- request の list/show コマンド
- `specrunner init` の変更
- request-patterns.ts / dynamic-context.ts の削除（将来再利用の可能性あり）

## Decisions

### D1: `buildScaffoldTemplate()` を `src/core/command/request.ts` に移動

`create.ts` は削除対象だが `buildScaffoldTemplate()` は template コマンドで再利用する。`src/core/command/request.ts` に移動し、template と validate の両サブコマンドのコアロジックを同ファイルに配置する。

**理由**: 新コマンドの責務（テンプレート生成 + バリデーション）が十分小さく、1 ファイルに収まる。将来サブコマンドが増えた時点で分割する。

### D2: template コマンドはプレースホルダー付きテンプレートを生成する

`buildScaffoldTemplate()` の signature は変更せず、template コマンドから呼ぶ際にプレースホルダー値を渡す:

```typescript
const content = buildScaffoldTemplate({
  title: "<タイトルを記入>",
  type,
  slug: "<slug を記入>",
});
process.stdout.write(content);
```

**理由**: 関数の interface を変えずにテンプレート出力を実現できる。`--no-llm` モードの既存利用者はいない（create コマンド自体を廃止する）ため、呼び出し元の変更に互換性リスクなし。

### D3: validate コマンドは `parseRequestMdContent()` に委譲する

```typescript
export async function executeValidate(filePath: string): Promise<number> {
  const content = await fs.readFile(filePath, "utf-8");
  try {
    parseRequestMdContent(content, filePath);
    return 0;
  } catch (err) {
    if (err instanceof SpecRunnerError) {
      process.stderr.write(`Error: ${err.message}\n`);
      if (err.hint) process.stderr.write(`Hint: ${err.hint}\n`);
    } else {
      process.stderr.write(`Error: ${(err as Error).message}\n`);
    }
    return 1;
  }
}
```

**理由**: パーサは既存で十分にテスト済み。validate コマンドはパーサの薄いラッパーとして実装する。ファイル不在時のエラーハンドリングも加える。

### D4: CLI エントリポイントで `request` をサブコマンドグループとして分岐

`bin/specrunner.ts` の switch case で `"request"` を追加し、第 2 引数（`template` / `validate`）で分岐する:

```typescript
case "request": {
  const subcommand = args[1];
  if (subcommand === "template") {
    // --type パース → runRequestTemplate()
  } else if (subcommand === "validate") {
    // file path 取得 → runRequestValidate()
  } else {
    // usage 表示 + exit 2
  }
  break;
}
```

**理由**: 他のコマンド（init, run, finish 等）と同じパターンに従う。Commander.js 等の CLI フレームワークは不使用（既存方針に合わせる）。

### D5: `isToolUseStart` の安全な削除

grep 確認で `isToolUseStart` の import 元は `create-dialog.ts` のみ。テストファイルの TC-MT-005 以外に依存元なし。両方同時に削除して型チェックが通ることで安全性を確認する。

### D6: `src/cli/request.ts` は CLI facade パターンに従う

既存の `src/cli/run.ts`, `src/cli/finish.ts` と同じパターン:
- CLI 引数のパース（bootstrap / config ロード）
- `src/core/command/request.ts` のコア関数に委譲
- process.exit() は `bin/specrunner.ts` 側で行う

ただし request template / validate は config / bootstrap を必要としない（テンプレート出力とファイル検証は認証不要）ため、facade 層は薄くなる。直接 `src/core/command/request.ts` を呼ぶ形で十分。

## Risks / Trade-offs

- [Risk] `src/context/request-patterns.ts` が orphan になる（create-dialog が唯一の消費者だった）→ 将来のコンテキスト注入で再利用する可能性を考慮し、意図的に残す。dead code 警告は許容
- [Risk] `src/state/draft-store.ts` 削除で draft 機能が完全消失 → 設計判断として意図的。draft/resume は Claude Code のセッション管理に委譲する
- [Trade-off] `buildScaffoldTemplate()` のテンプレート内容がプレースホルダーのみ → ユーザーは Claude Code の会話内でテンプレートを使って request.md を書く想定。リッチなインタラクティブ生成は不要
