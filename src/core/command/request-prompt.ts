/**
 * Core logic for the `specrunner request prompt` command.
 *
 * Outputs a self-contained prompt for an external LLM session to author a request.md
 * file at `specrunner/drafts/<slug>.md`.
 *
 * No LLM calls, no file writes, no authentication, no network access.
 * This is a pure, deterministic function.
 */
import { stdoutWrite } from "../../logger/stdout.js";
import { buildScaffoldTemplate } from "./request.js";

/**
 * Build the request authoring prompt string.
 * Consists of three parts:
 *   (a) 起票規律 — authoring discipline
 *   (b) 雛形 — scaffold template (single source via buildScaffoldTemplate)
 *   (c) 自己検証指示 — self-verification instruction
 */
export function buildRequestPrompt(): string {
  const scaffold = buildScaffoldTemplate({
    title: "<タイトルを記入>",
    type: "<type>",
    slug: "<slug を記入>",
  });

  return `# request 起票プロンプト

あなたの LLM セッションが \`specrunner/drafts/<slug>.md\` に request.md を起票します。
以下の規律に従って雛形を埋め、最後に自己検証コマンドを実行してください。

---

## 起票規律

### type の選択基準

- 設計の追加・変更を含む場合は \`bug-fix\` を選ばない → \`spec-change\` または \`new-feature\` を選ぶ
- 不具合・誤動作の修正のみなら \`bug-fix\`
- 外部挙動を変えないコード再構成なら \`refactoring\`
- 新機能の追加なら \`new-feature\`
- 仕様・設計の変更（機能追加なし）なら \`spec-change\`

### 受け入れ基準の書き方

- 機械検証できる文にする（「テストで固定する」「既存テストが無変更で green」「\`typecheck && test\` が green」など）
- 「適切に動作する」のような判定不能な文は書かない
- 必要な「歯」（検証機構: assertion / import guard / grep check など）を名指しする

### その他の規律

- スコープ外の項目を明記する（実装中に「ついでにやりたくなる」隣接変更を列挙する）
- 外部 SDK / API の制約は起票者が request.md に明示する（CLI は外部の情報を持たない）
- slug は日付 prefix を付けない（例: \`add-auth-flow\`、\`fix-race-condition\`）
- 出力先: \`specrunner/drafts/<slug>.md\`

---

## 雛形

以下の雛形をベースに \`specrunner/drafts/<slug>.md\` を作成し、各セクションを埋めてください。

\`\`\`markdown
${scaffold}
\`\`\`

---

## 自己検証

起票後は以下のコマンドで構文・規律を確認してください:

\`\`\`
specrunner request validate specrunner/drafts/<slug>.md
\`\`\`

検証が green になったら request.md の準備完了です。
`;
}

/**
 * Execute `request prompt` subcommand.
 * Writes the request authoring prompt to stdout.
 * Returns 0 on success. Synchronous, deterministic, no side effects.
 */
export function executePrompt(): number {
  stdoutWrite(buildRequestPrompt());
  return 0;
}
