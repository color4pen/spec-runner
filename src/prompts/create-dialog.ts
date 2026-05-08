/**
 * Prompts for the `specrunner create` interactive dialog mode.
 * Provides system prompt and initial user message builder for the REPL session.
 */
import type { DynamicContext } from "../git/dynamic-context.js";
import type { RequestPattern } from "../context/request-patterns.js";

/**
 * Build the system prompt for the interactive dialog session.
 * Instructs the model to explore the codebase, iterate with the user,
 * and present the final draft with the <!-- FINAL_DRAFT --> marker protocol.
 */
export function buildDialogSystemPrompt(): string {
  return `あなたは specrunner の request.md 作成アシスタントです。ユーザーと対話しながら要件を練り上げ、高品質な request.md を生成します。

## あなたの役割

- ユーザーの説明を聞き、質問しながら要件を明確化する
- **コードベースを Read / Grep / Glob で積極的に調査し、推測で書かない**
- 既存のコード・設計・パターンを理解した上で、実現可能な要件を提案する
- 要件が十分に明確になったら、最終版 request.md を提示してユーザーの確認を求める

## request.md の構造

生成する request.md は以下の構造に従ってください:

\`\`\`
# <タイトル>

## Meta

- **type**: <type>
- **slug**: <slug>

## 背景

<変更の背景・動機を説明する>

## 要件

1. <要件 1>
2. <要件 2>
...

## スコープ外

- <スコープ外の項目>

## 受け入れ基準

- [ ] <基準 1>
- [ ] \`bun run typecheck && bun run test\` が green

## Workflow Options

- enabled: []

## architect 評価済みの設計判断

<設計判断が明確な場合は記載。不明な場合は「TBD」と記載>
\`\`\`

## ルール

- 要件は番号付きリスト形式で記述する
- 受け入れ基準はチェックリスト形式（\`- [ ] \`）で記述する
- 受け入れ基準の最後には必ず \`bun run typecheck && bun run test\` が green の行を含める
- Meta セクションの type と slug は、ユーザーが指定した値をそのまま使用する
- タイトルはユーザーの説明から自然な日本語または英語で生成する

## 完了プロトコル

request.md の全セクション（Meta / 背景 / 要件 / スコープ外 / 受け入れ基準）が十分に埋まったと判断したら、以下の形式で最終版を提示し、ユーザーに確認を求めてください:

\`\`\`
<!-- FINAL_DRAFT -->
# <タイトル>
...（request.md の全内容）...
\`\`\`

マーカー \`<!-- FINAL_DRAFT -->\` は応答テキスト中に 1 回だけ使用してください。マーカーの直後に request.md の内容を記述し、余分なテキストを追加しないでください。`;
}

/**
 * Build the initial user message for the dialog session.
 * Injects description, type, slug, dynamic context, and example patterns.
 */
export function buildDialogInitialMessage(params: {
  description: string;
  type: string;
  slug: string;
  dynamicContext: DynamicContext;
  patterns: RequestPattern[];
}): string {
  const { description, type, slug, dynamicContext, patterns } = params;

  const lines: string[] = [];

  lines.push(`request.md の作成を手伝ってください。以下の説明から始めます。`);
  lines.push(``);
  lines.push(`## 入力`);
  lines.push(``);
  lines.push(`- **説明**: ${description}`);
  lines.push(`- **type**: ${type}`);
  lines.push(`- **slug**: ${slug}`);

  // Inject dynamic context (specsList and changesList)
  if (dynamicContext.specsList.length > 0 || dynamicContext.changesList.length > 0) {
    lines.push(``);
    lines.push(`## リポジトリコンテキスト`);

    if (dynamicContext.specsList.length > 0) {
      lines.push(``);
      lines.push(`### 既存 Specs (openspec/specs/)`);
      for (const spec of dynamicContext.specsList) {
        lines.push(`- ${spec}`);
      }
    }

    if (dynamicContext.changesList.length > 0) {
      lines.push(``);
      lines.push(`### 進行中の Changes (openspec/changes/)`);
      for (const change of dynamicContext.changesList) {
        lines.push(`- ${change}`);
      }
    }
  }

  // Inject request patterns as examples
  if (patterns.length > 0) {
    lines.push(``);
    lines.push(`## 参考例`);
    lines.push(``);
    lines.push(`以下は既存の request.md の例です。構造・文体を参考にしてください。`);

    for (let i = 0; i < patterns.length; i++) {
      const pattern = patterns[i]!;
      lines.push(``);
      lines.push(`<example-${i + 1}>`);
      lines.push(pattern.content);
      lines.push(`</example-${i + 1}>`);
    }
  }

  lines.push(``);
  lines.push(`まずコードベースを調査し、この変更がどのような影響を与えるか理解してください。その後、不明な点があれば質問してください。Meta セクションの type は \`${type}\`、slug は \`${slug}\` を使用してください。`);

  return lines.join("\n");
}
