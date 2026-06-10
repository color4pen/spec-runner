/**
 * Core logic for the `specrunner request` command.
 *
 * Subcommands:
 *   template [--type <type>]  — print a scaffold template to stdout
 *   validate <file>           — validate a request.md file
 */
import * as fs from "node:fs/promises";
import { parseRequestMdContent } from "../../parser/request-md.js";
import { SpecRunnerError } from "../../errors.js";
import { stdoutWrite, logError, stderrWrite } from "../../logger/stdout.js";

/**
 * Build a scaffold template for request.md.
 */
export function buildScaffoldTemplate(params: {
  title: string;
  type: string;
  slug: string;
}): string {
  const { title, type, slug } = params;
  return `# ${title}

## Meta

- **type**: ${type}
- **slug**: ${slug}
- **base-branch**: main
- **adr**: false

<!-- adr 判断基準: 新しい port/adapter 追加、既存パターンと異なる設計選択、振る舞い/契約を変える修正、構造的リファクタリング → true。いずれにも該当しない → false -->

## 背景

<変更の背景・動機を説明してください>

## 現状コードの前提

<!-- 現状のコードについての断定（「今のコードはこうなっている」）は file:line を伴ってこの節に書く。
     これらは未検証の前提として扱われ、design / request-review が実コードと突き合わせる。
     意図・方針・将来の構想はこの節の対象外。 -->

- <file:line を伴う現状コードの断定（任意）>

## 要件

1. <要件 1>

## スコープ外

- <スコープ外の項目>

## 受け入れ基準

- [ ] <基準 1>
- [ ] \`typecheck && test\` が green

## architect 評価済みの設計判断

TBD
`;
}

/**
 * Execute `request template` subcommand.
 * Writes a scaffold template with placeholder values to stdout.
 * Returns 0 on success.
 */
export function executeTemplate(type: string): number {
  const content = buildScaffoldTemplate({
    title: "<タイトルを記入>",
    type,
    slug: "<slug を記入>",
  });
  stdoutWrite(content);
  return 0;
}

/**
 * Execute `request validate` subcommand.
 * Reads the file at filePath, parses it with parseRequestMdContent().
 * Returns 0 on success, 1 on error.
 */
export async function executeValidate(filePath: string): Promise<number> {
  let content: string;
  try {
    content = await fs.readFile(filePath, "utf-8");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logError(message);
    return 1;
  }

  try {
    parseRequestMdContent(content, filePath);
    return 0;
  } catch (err) {
    if (err instanceof SpecRunnerError) {
      logError(err.message);
      stderrWrite(`Hint: ${err.hint}`);
    } else {
      logError((err as Error).message);
    }
    return 1;
  }
}
