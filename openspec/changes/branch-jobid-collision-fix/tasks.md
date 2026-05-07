# Implementation Tasks: branch 名に jobId suffix を付与する

## T1: stripJobIdSuffix ヘルパー追加

- [x] **T1.1**: `src/state/job-slug.ts` に `stripJobIdSuffix` を追加する:
  ```ts
  const JOB_ID_SUFFIX_PATTERN = /-[0-9a-f]{8}$/;
  
  export function stripJobIdSuffix(branchSlug: string): string {
    return branchSlug.replace(JOB_ID_SUFFIX_PATTERN, "");
  }
  ```

- [x] **T1.2**: `getJobSlug` の fallback 2（branch 由来）で `stripBranchPrefix` の後に `stripJobIdSuffix` を適用する:
  ```ts
  // 変更前 (line 56):
  const stripped = stripBranchPrefix(state.branch);
  
  // 変更後:
  const stripped = stripJobIdSuffix(stripBranchPrefix(state.branch));
  ```

## T2: branch 名生成の変更

- [x] **T2.1**: `src/core/step/executor.ts` line 217 の branch 生成を変更する:
  ```ts
  // 変更前:
  state = { ...state, branch: `feat/${deps.slug}` };
  
  // 変更後:
  state = { ...state, branch: `feat/${deps.slug}-${state.jobId.slice(0, 8)}` };
  ```

- [x] **T2.2**: `src/prompts/propose-system.ts` の `buildInitialMessage` の呼び出し側を確認する。`executor.ts` が `setsBranch` で branch を生成した後に `buildMessage` が呼ばれるため、propose step の `buildMessage` には `state.branch` が既に設定済み。ただし、`ProposeStep.buildMessage` は `deps.slug` のみを使い `buildInitialMessage` を呼ぶので、branch は `buildInitialMessage` の default parameter `feat/${slug}` が使われる。**修正が必要**: `buildMessage` で `state.branch` を渡すか、executor が buildMessage を呼ぶ前に branch を設定する制御フローを確認する。

  executor.ts の制御フロー:
  1. `step.buildMessage(state, deps)` → message 生成（line 163-165）
  2. session 作成 → polling → 完了
  3. `step.setsBranch === true && !state.branch` → branch 設定（line 216-218）

  つまり `buildMessage` は branch 設定**前**に呼ばれる。`buildInitialMessage` の default `feat/${slug}` が実際に agent に渡る branch 名になる。

  **解決策**: `buildInitialMessage` の default parameter を変更するのではなく、`ProposeStep.buildMessage` の実装で deps から jobId を取得し、明示的に branch を渡す:
  ```ts
  // src/core/step/propose.ts の buildMessage を修正:
  buildMessage(state: JobState, deps: StepDeps): string {
    const branch = `feat/${deps.slug}-${state.jobId.slice(0, 8)}`;
    return buildInitialMessage(deps.request.content, deps.slug, branch);
  }
  ```

  **注意**: executor.ts の `setsBranch` ロジック（T2.1）も同じフォーマットで branch を生成するため、buildMessage で渡す branch と setsBranch で設定する branch が一致する。

## T3: slug 逆算ロジックの修正

- [x] **T3.1**: `src/core/finish/resolve-target.ts` line 134 の slug 導出で `stripJobIdSuffix` を適用する:
  ```ts
  // 変更前:
  const slug = stripBranchPrefix(headRef);
  
  // 変更後:
  import { stripBranchPrefix, stripJobIdSuffix } from "../../state/job-slug.js";
  // ...
  const slug = stripJobIdSuffix(stripBranchPrefix(headRef));
  ```
  （`stripBranchPrefix` は既に import 済み。`stripJobIdSuffix` を追加 import する）

- [x] **T3.2**: `src/adapter/managed-agent/tools/register-branch.ts` の handler で slug 導出時に `stripJobIdSuffix` を適用する:
  ```ts
  // 変更前 (slug 未指定時の導出):
  resolvedSlug = stripBranchPrefix(trimmedBranch);
  
  // 変更後:
  import { stripBranchPrefix, stripJobIdSuffix } from "../../../state/job-slug.js";
  // ...
  resolvedSlug = stripJobIdSuffix(stripBranchPrefix(trimmedBranch));
  ```
  （`stripBranchPrefix` は既に import 済み。`stripJobIdSuffix` を追加 import する）

## T4: テスト追加

- [x] **T4.1**: `tests/state/job-slug.test.ts` に `stripJobIdSuffix` のテストを追加する:
  ```ts
  describe("stripJobIdSuffix", () => {
    it("strips 8-char hex suffix: abolish-success-status-45e9e720 → abolish-success-status", () => {
      expect(stripJobIdSuffix("abolish-success-status-45e9e720")).toBe("abolish-success-status");
    });
    it("no-op when no hex suffix: my-feature → my-feature", () => {
      expect(stripJobIdSuffix("my-feature")).toBe("my-feature");
    });
    it("no-op when suffix is not hex: my-feature-zzzzzzzz → my-feature-zzzzzzzz", () => {
      expect(stripJobIdSuffix("my-feature-zzzzzzzz")).toBe("my-feature-zzzzzzzz");
    });
    it("no-op when suffix is too short: my-feature-45e9e72 → my-feature-45e9e72", () => {
      expect(stripJobIdSuffix("my-feature-45e9e72")).toBe("my-feature-45e9e72");
    });
    it("no-op when suffix is too long: my-feature-45e9e7201 → my-feature-45e9e7201", () => {
      expect(stripJobIdSuffix("my-feature-45e9e7201")).toBe("my-feature-45e9e7201");
    });
    it("handles slug with hyphens: my-cool-feature-abcd1234 → my-cool-feature", () => {
      expect(stripJobIdSuffix("my-cool-feature-abcd1234")).toBe("my-cool-feature");
    });
    it("empty string → empty string", () => {
      expect(stripJobIdSuffix("")).toBe("");
    });
  });
  ```

- [x] **T4.2**: `tests/state/job-slug.test.ts` に `getJobSlug` の新フォーマット branch テストを追加する:
  ```ts
  describe("getJobSlug with jobId-suffixed branch", () => {
    it("branch feat/my-feature-abcd1234 → slug my-feature", () => {
      const state = makeMinimalState({ slug: null, branch: "feat/my-feature-abcd1234" });
      expect(getJobSlug(state)).toBe("my-feature");
    });
    it("explicit slug takes priority over suffixed branch", () => {
      const state = makeMinimalState({ slug: "my-feature", branch: "feat/my-feature-abcd1234" });
      expect(getJobSlug(state)).toBe("my-feature");
    });
  });
  ```

- [x] **T4.3**: `tests/register-branch-schema.test.ts` に新フォーマット branch の slug 導出テストを追加する:
  ```ts
  describe("register_branch — jobId-suffixed branch slug derivation", () => {
    it("derives slug from suffixed branch: feat/my-feature-abcd1234 → my-feature", async () => {
      const ctx: CustomToolContext = { sessionId: "test-session" };
      const result = await registerBranchTool.handler(
        { branch: "feat/my-feature-abcd1234" },
        ctx,
      );
      expect(result.ok).toBe(true);
      const ok = result as OkResult;
      expect(ok["slug"]).toBe("my-feature");
    });
    it("explicit slug overrides suffixed branch derivation", async () => {
      const ctx: CustomToolContext = { sessionId: "test-session" };
      const result = await registerBranchTool.handler(
        { branch: "feat/my-feature-abcd1234", slug: "my-feature" },
        ctx,
      );
      expect(result.ok).toBe(true);
      const ok = result as OkResult;
      expect(ok["slug"]).toBe("my-feature");
    });
  });
  ```

- [x] **T4.4**: 既存テストの branch 名アサーションを確認し、必要に応じて更新する:
  - `tests/unit/step/executor.test.ts` で `setsBranch` 後の `state.branch` を assert しているテストがあれば、新フォーマットに更新する

## T5: Delta Spec 作成

- [x] **T5.1**: `openspec/changes/branch-jobid-collision-fix/specs/step-execution-architecture/spec.md` — `setsBranch` の branch format 変更を記述する delta spec を作成する

- [x] **T5.2**: `openspec/changes/branch-jobid-collision-fix/specs/register-branch-tool/spec.md` — handler の slug 導出で `stripJobIdSuffix` を適用する delta spec を作成する

- [x] **T5.3**: `openspec/changes/branch-jobid-collision-fix/specs/cli-finish-command/spec.md` — `--pr` 経路の slug 導出で `stripJobIdSuffix` を適用する delta spec を作成する

- [x] **T5.4**: `openspec/changes/branch-jobid-collision-fix/specs/change-folder-viewer/spec.md` — slug 導出ロジック変更の delta spec を作成する

## T6: Verification

- [x] **T6.1**: `bun run typecheck` が green
- [x] **T6.2**: `bun run test` が green
- [x] **T6.3**: `grep -r "feat/\${deps.slug}\`" src/` で旧フォーマットの残留がないことを確認

## Completion Checklist

All tasks above must be completed and verified before the change is considered ready for merge.
