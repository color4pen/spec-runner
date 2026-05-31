/**
 * Arch test: step-outcome の INV-1〜3 を恒久 enforce（規約の正典は本ファイル＋型。旧 contract/ は retire）
 *
 * R4 (contract lock) — prose パーサ削除後に「契約が自分自身を守る」状態を維持するため、
 * 静的検査（grep / fs.existsSync）でインバリアントを強制する。
 *
 * INV-1: transition `when` 述語が `fileContent` を参照しない
 *         → routing は structured/grounded フィールドのみを使う
 * INV-2: `parseReviewVerdict` が src/core/ に存在しない
 *         → prose-verdict パーサが再導入されたら即 red
 * INV-3: 全 agent step（src/core/step/ 内の kind: "agent" 定義）が `reportTool` を持つ
 *         → reportTool なし agent step は prose parse に fall through する経路になる
 */

import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import * as url from "node:url";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../..");

/**
 * Run grep and return matched lines, or empty string if no matches.
 * Throws on grep error (exit code > 1 means a real error, not "no matches").
 */
function grepSource(pattern: string, target: string): string {
  try {
    return execSync(`grep -rn ${pattern} ${target}`, {
      cwd: ROOT,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  } catch (err: unknown) {
    // grep exits with code 1 when no matches — that's our success case
    const exitCode = (err as { status?: number }).status;
    if (exitCode === 1) return "";
    throw err;
  }
}

// ---------------------------------------------------------------------------
// INV-1: transition `when` 述語が `fileContent` を参照しない
// ---------------------------------------------------------------------------

describe("INV-1: STANDARD_TRANSITIONS の when 述語が fileContent を参照しない", () => {
  it("src/core/pipeline/types.ts に fileContent という文字列が含まれない", () => {
    const result = grepSource('"fileContent"', "src/core/pipeline/types.ts");
    // routing は toolResult / verdict など structured フィールドのみを使う — fileContent 参照は INV-1 違反
    expect(result).toBe("");
  });
});

// ---------------------------------------------------------------------------
// INV-2: parseReviewVerdict が src/core/ に存在しない
// ---------------------------------------------------------------------------

describe("INV-2: parseReviewVerdict が src/core/ に存在しない", () => {
  it("src/core/parser/review-verdict.ts が存在しない", () => {
    const filePath = path.join(ROOT, "src/core/parser/review-verdict.ts");
    expect(fs.existsSync(filePath)).toBe(false);
  });

  it("src/core/ 配下に parseReviewVerdict という文字列が含まれない", () => {
    const result = grepSource('"parseReviewVerdict"', "src/core");
    // prose-verdict パーサの再導入を防止（R4 contract lock）
    expect(result).toBe("");
  });
});

// ---------------------------------------------------------------------------
// INV-3: 全 agent step が reportTool を持つ
// ---------------------------------------------------------------------------

describe("INV-3: src/core/step/ の全 agent step が reportTool を定義している", () => {
  it('kind: "agent" を含む step ファイルは全て reportTool を定義している', () => {
    // src/core/step/ 内の .ts ファイルを列挙
    const stepDir = path.join(ROOT, "src/core/step");
    const files = fs.readdirSync(stepDir).filter((f) => f.endsWith(".ts"));

    const agentFilesWithoutReportTool: string[] = [];

    for (const file of files) {
      const filePath = path.join(stepDir, file);
      const content = fs.readFileSync(filePath, "utf-8");

      // このファイルが kind: "agent", の step 定義（オブジェクトプロパティ）を含む場合
      // Note: types.ts の interface 定義は `kind: "agent";`（セミコロン）なので除外される
      if (content.includes('kind: "agent",')) {
        // reportTool: が含まれているか確認
        if (!content.includes("reportTool:")) {
          agentFilesWithoutReportTool.push(file);
        }
      }
    }

    // reportTool なし agent step は prose parse に fall through する経路になる（INV-3 違反）
    expect(agentFilesWithoutReportTool).toEqual([]);
  });
});
