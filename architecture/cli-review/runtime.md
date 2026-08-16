# `runtime` review

Status: **reviewed**  
Verdict: **KEEP** as the managed-runtime lifecycle namespace.

Baseline implementation:

- `src/cli/managed.ts`
- `src/cli/command-registry.ts` (`COMMANDS.runtime`)
- `tests/unit/cli/runtime-tc.test.ts`
- `specrunner/adr/2026-05-20-cli-noun-verb-restructure.md`

## User goal

Manage the non-local execution runtime used by SpecRunner.

The current runtime model has two modes:

- local: default, no provisioning lifecycle
- managed: Anthropic-hosted agents + environment that must be provisioned, inspected and removed

Only the managed side needs lifecycle commands, so the current surface is:

```text
specrunner runtime setup
specrunner runtime status
specrunner runtime reset [--force]
```

## Why the `runtime` noun should stay

The rename from `managed` to `runtime` was deliberate. The accepted noun-verb ADR chose `runtime` because `managed` exposed an Anthropic implementation detail, while `runtime` names the product-level object and leaves room for future execution backends.

That abstraction still holds. Moving these commands back under `managed` or `anthropic` would make the public CLI more implementation-shaped without improving the user goal.

The current limitation should instead be made explicit in help: today, `runtime setup` provisions the Anthropic managed runtime.

## Subcommand review

### `runtime setup` — KEEP

Actual effects:

1. resolve the Anthropic API key
2. create/update managed agents
3. create/reuse an Anthropic environment
4. write `runtime: "managed"`, agent IDs and environment metadata into config

This is a real state transition, not merely configuration. It belongs under `runtime`, not `config` or `credentials`.

Credential acquisition itself does **not** belong here. `setup` should consume an already-resolved API key and, when missing, point to the credential/env setup command owned by auth/setup UX.

Current post-success guidance says `Run 'specrunner run'`. Once CLI guidance is normalized, prefer the canonical execution path chosen by the later `run`/`job` review rather than embedding an independent alias preference here.

### `runtime status` — KEEP

This reports lifecycle/config state:

- local vs managed
- whether a managed API key resolves
- environment ID
- registered agent IDs
- stale managed fields when runtime is local

This is distinct from `doctor`.

```text
runtime status
= what runtime state/resources are configured?

doctor
= is this environment ready/healthy, and what should I do next?
```

Do not merge `runtime status` into doctor. Operators need a direct, side-effect-free view of runtime state without running the entire diagnostic suite.

The word `status` is acceptable even though it does not actively probe every provider-side resource. Detailed help should state that it reports configured lifecycle state; provider health belongs to doctor.

### `runtime reset` — KEEP, UX FIX NEEDED

This is the inverse lifecycle operation:

- delete the provider-side environment when possible
- clear managed agent/environment metadata
- remove `runtime`, returning execution to the local default
- preserve the documented limitation that Anthropic-side agent resources cannot currently be deleted and may remain orphaned

The destructive operation belongs under `runtime`.

#### Finding: non-interactive confirmation semantics are inconsistent

The stale-managed-config branch explicitly checks TTY. When stdin is non-interactive and `--force` is absent, it prints:

```text
Non-interactive mode requires --force to reset stale config.
```

but then returns **exit 0 without resetting anything**.

The normal managed branch does not perform the same non-TTY guard and proceeds to `readline` confirmation.

This is a poor automation contract:

```text
exit 0
```

should not mean both "reset completed" and "reset was refused because confirmation was unavailable".

**Direction:** both reset paths should share one confirmation policy:

- TTY + no `--force`: interactive confirmation
- non-TTY + no `--force`: non-zero argument/precondition error with `--force` guidance
- `--force`: perform the reset without prompting

Do not silently no-op with success.

## Help/discoverability

`runtime reset` has detailed usage, but `runtime setup`, `runtime status`, and the `runtime` parent do not have equivalent structured help.

Because `runtime setup` is specifically Anthropic-managed today, the missing detailed help matters: the generic noun otherwise over-promises provider-neutral behavior.

This is another reason to derive parent/subcommand help from a machine-readable command contract.

## Final verdict

- Top-level noun `runtime`: **KEEP**
- `runtime setup`: **KEEP**
- `runtime status`: **KEEP**
- `runtime reset`: **KEEP**, fix non-TTY/exit semantics
- Rename back to `managed`/`anthropic`: **NO**
- Authentication/credential storage: **keep outside runtime**
- Doctor overlap: **NO MERGE**; status and health/navigation are separate user goals
- Help: **make provider-specific current behavior explicit**
