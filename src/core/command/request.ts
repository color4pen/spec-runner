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
import { resolveDesignLayerConfig } from "../../config/schema.js";
import { runDesignLayerCheckGate } from "../design-layer/check-gate.js";
import { loadConfig } from "../../config/store.js";
import { resolveRepoRoot } from "../../util/repo-root.js";
import type { SpawnFn } from "../../util/spawn.js";
import type { SpecRunnerConfig } from "../../config/schema.js";

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
     意図・方針・将来の構想はこの節の対象外。
     コツ: 書く直前に grep で再検証する。記憶や過去メモの前提は merge で腐っていることがある。 -->

- <file:line を伴う現状コードの断定（任意）>

## 設計要素引用

<!-- 設計レイヤ（aozu）を導入しているプロジェクトで、この request が実装する設計要素の [[id]] をここに列挙してください。
     aozu は request 本文全体から [[id]] 形式の引用を抽出して検証します。
     設計レイヤを使用していないプロジェクトではこのセクションを省略できます。 -->

<!-- 例: [[mod-intake]], [[ent-order]] -->

## 要件

<!-- コツ: 実装の最重量部（既存機構の一般化・暗黙の前提の変更）は行間に隠さず要件として名指しする。
     粒度: 1 request = 1 つのレビュー収束ループで直しきれる範囲。超えるなら「土台（挙動不変の機構導入）→ 上物（その利用）」に分割する。
     詳細: docs/request-authoring.md -->

1. <要件 1>

## スコープ外

- <スコープ外の項目>

## 受け入れ基準

<!-- コツ: 機械検証できる文にする（「〜をテストで固定する」「既存テスト無変更で green」）。
     「適切に動作する」のような判定不能な文は conformance が照合できない。 -->

- [ ] <基準 1>
- [ ] \`typecheck && test\` が green

## architect 評価済みの設計判断

<!-- コツ: 採用した判断に加え、却下した代替案とその理由を書く。
     implementer の再発明と reviewer の再議論の両方を防ぐ。 -->

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

export interface ValidateOpts {
  /** Working directory for config resolution and gate spawn. */
  cwd?: string;
  /** Pre-resolved config (skips best-effort load when provided). */
  config?: SpecRunnerConfig;
  /** Injectable spawn for testing. */
  spawn?: SpawnFn;
}

/**
 * Execute `request validate` subcommand.
 * Reads the file at filePath, parses it with parseRequestMdContent().
 * When design-layer integration is enabled, also runs the aozu check gate.
 * Returns 0 on success, 1 on error.
 *
 * Accepts an optional second argument `opts` for cwd/config/spawn injection.
 * When omitted, existing 1-argument callers are fully backward-compatible (no-op for gate).
 */
export async function executeValidate(filePath: string, opts?: ValidateOpts): Promise<number> {
  let content: string;
  try {
    content = await fs.readFile(filePath, "utf-8");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logError(message);
    return 1;
  }

  let parsed;
  try {
    parsed = parseRequestMdContent(content, filePath);
  } catch (err) {
    if (err instanceof SpecRunnerError) {
      logError(err.message);
      stderrWrite(`Hint: ${err.hint}`);
    } else {
      logError((err as Error).message);
    }
    return 1;
  }

  // Design-layer gate (opt-in; no-op when disabled or opts absent)
  const cwd = opts?.cwd ?? process.cwd();
  let resolvedConfig = opts?.config;
  if (!resolvedConfig) {
    // Best-effort config load; failure treated as disabled
    try {
      const repoRoot = await resolveRepoRoot(cwd);
      resolvedConfig = await loadConfig(repoRoot ?? undefined);
    } catch {
      // Config unavailable → designLayer defaults to disabled → gate no-ops
    }
  }

  if (resolvedConfig) {
    const designLayer = resolveDesignLayerConfig(resolvedConfig);
    const gateResult = await runDesignLayerCheckGate({
      requestMdPath: filePath,
      requestType: parsed.type,
      designLayer,
      cwd,
      spawn: opts?.spawn,
    });
    if (!gateResult.passed) {
      return 1;
    }
  }

  return 0;
}
