/**
 * Core logic for the `specrunner rules new` command.
 *
 * Creates a new rules file at specrunner/rules/<step-name>/<NN>-<rule-slug>.md.
 */
import { AGENT_STEP_NAMES } from "../step/step-names.js";
import { stepRulesDirRel } from "../../util/paths.js";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { logResult, logError, stderrWrite } from "../../logger/stdout.js";
import { SLUG_REGEX } from "../../util/validation-patterns.js";

/**
 * Embedded template for generated rules files.
 * D2: held as a source code string const — no runtime file read.
 */
const RULE_TEMPLATE = `<!-- このファイルは specrunner rules new で生成されました。
CLI はこのファイルの中身を解釈しません。書き手の自然文で自由に書いてください。
推奨見出しは強制ではありません — 削除・追加・並べ替えは自由です。
番号 prefix (NN-) が follow-up の実行順序を決めます。
順序の方針: 重要度が高いルールを末尾に配置すると recency bias により効果的です。 -->

## やめてほしいこと

## こうしてほしいこと

## 例外
`;

/**
 * Execute `rules new` subcommand.
 * Creates specrunner/rules/<step-name>/<NN>-<rule-slug>.md from a scaffold template.
 * Returns 0 on success, 1 on filename collision, 2 on invalid input.
 */
export async function executeRulesNew(
  stepName: string,
  ruleSlug: string,
  cwd: string,
): Promise<number> {
  // 1. step-name validation
  if (!(AGENT_STEP_NAMES as readonly string[]).includes(stepName)) {
    logError(`Unknown step name '${stepName}'.`);
    stderrWrite(`Valid agent step names: ${AGENT_STEP_NAMES.join(", ")}`);
    return 2;
  }

  // 2. rule-slug sanitize
  let sanitized = ruleSlug;
  let warned = false;

  if (sanitized.includes("_")) {
    sanitized = sanitized.replace(/_/g, "-");
    stderrWrite(`Warning: '_' in slug replaced with '-'. Using '${sanitized}'.`);
    warned = true;
  }

  if (sanitized.includes(" ")) {
    sanitized = sanitized.replace(/ /g, "-");
    if (!warned) {
      stderrWrite(`Warning: spaces in slug replaced with '-'. Using '${sanitized}'.`);
    } else {
      stderrWrite(`Warning: spaces in slug replaced with '-'. Using '${sanitized}'.`);
    }
  }

  if (!SLUG_REGEX.test(sanitized)) {
    logError(`Invalid rule slug '${sanitized}'. Must match /^[a-z0-9][a-z0-9-]{0,63}$/`);
    return 2;
  }

  // 3. Directory scan + numbering
  const dirRel = stepRulesDirRel(stepName);
  const dirAbs = path.join(cwd, dirRel);

  let entries: string[] = [];
  try {
    entries = await fs.readdir(dirAbs);
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      throw err;
    }
    // ENOENT: treat as empty directory
  }

  const numbers = entries
    .filter((e) => e.endsWith(".md"))
    .map((e) => parseInt(e, 10))
    .filter((n) => !isNaN(n));

  const next = Math.max(...numbers, 0) + 1;
  const nn = String(next).padStart(2, "0");

  // 4. File name generation
  const fileName = `${nn}-${sanitized}.md`;

  // 5. Slug-level collision check: any existing file with the same slug (same semantic name)
  const slugSuffix = `-${sanitized}.md`;
  const existing = entries.filter((e) => e.endsWith(slugSuffix));
  if (existing.length > 0) {
    logError(`A rule file for '${sanitized}' already exists in ${dirRel}/: ${existing.join(", ")}`);
    stderrWrite(`Hint: Choose a different rule slug or rename the existing file.`);
    return 1;
  }

  // 6. Create directory
  await fs.mkdir(dirAbs, { recursive: true });

  // 7. Write file
  const filePath = path.join(dirAbs, fileName);
  await fs.writeFile(filePath, RULE_TEMPLATE, "utf-8");

  // 8. Output created path
  const relativePath = `${dirRel}/${fileName}`;
  logResult(relativePath);
  return 0;
}
