## Purpose

TBD

## Requirements

### Requirement: CI workflow for Node.js smoke test

A GitHub Actions workflow `.github/workflows/ci.yml` MUST exist and run on `push: branches: [main]` and `pull_request` triggers.

The workflow MUST:
- Build the project with `bun run build`
- Execute `node dist/bin/specrunner.js --help` and assert exit 0
- Execute `node dist/bin/specrunner.js doctor` and assert no startup crash (authentication errors are acceptable)
- Verify that `dist/` contains no `from "bun:` or `from 'bun:` import statements using grep
- Run `bun run test` to keep existing Bun test coverage green

The workflow MUST use `node-version: "20"` (Node.js 20.x).

#### Scenario: `--help` runs successfully under Node.js 20

Given the project is built with `bun run build`,
when `node dist/bin/specrunner.js --help` is executed in a Node.js 20 environment,
then the process exits with code 0 and prints usage information.

#### Scenario: `doctor` runs without startup crash under Node.js 20

Given the project is built with `bun run build`,
when `node dist/bin/specrunner.js doctor` is executed in a Node.js 20 environment,
then the process does not crash on startup (authentication errors are acceptable, exit code need not be 0).

### Requirement: No Bun-specific API in dist/

After `bun run build`, the `dist/` directory MUST NOT contain any files with `from ["']bun:` import patterns.

Comments and string literals mentioning "Bun" are acceptable; only actual import statements are prohibited.

#### Scenario: grep detects no bun: imports in dist/

Given the project is built with `bun run build`,
when `grep -rE 'from ["'\'']bun:'` is run against `dist/`,
then the command finds no matches.
