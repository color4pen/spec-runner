# Delta Spec: cli-commands (request-manager)

Extends the baseline `cli-commands` spec with new subcommands and slug-resolution for existing commands.

## New Requirements

### REQ-CLI-RC-01: `specrunner request create "<text>"`

The CLI SHALL accept `specrunner request create "<text>"` where `<text>` is a natural-language description of the desired change.

- The command generates a `request.md` under `specrunner/requests/active/<slug>/request.md` using LLM generation
- The generated slug is derived from `<text>` via `slugify()`
- On success, the slug is written to stdout (with trailing newline) and the command exits 0
- On SLUG_COLLISION, the command writes an error to stderr and exits 1
- On LLM generation failure or parse validation failure, the command writes an error to stderr and exits 1

### REQ-CLI-RC-02: `specrunner request create --stdin`

The CLI SHALL accept `specrunner request create --stdin` to read input text from stdin instead of a positional argument.

- stdin is consumed until EOF and treated identically to the positional `<text>` argument
- Behavior and exit codes are identical to REQ-CLI-RC-01
- If both `--stdin` and a positional `<text>` are provided, the positional argument takes precedence

### REQ-CLI-RL-01: `specrunner request list`

The CLI SHALL accept `specrunner request list` with no additional arguments.

- The command lists all active requests found under `specrunner/requests/active/`
- Output format (to stdout): a header row followed by one row per request, showing slug, type, and state
- If no active requests exist, the command outputs `(no active requests)` to stdout and exits 0
- The command exits 0 in all non-error cases

### REQ-CLI-RR-02: `specrunner request review <file-or-slug>`

Extends the existing `specrunner request review <file>` to also accept an active request slug.

- If the positional argument resolves to an existing file path (relative or absolute), the existing file-path behavior applies (unchanged)
- If the positional argument does NOT resolve to an existing file, the CLI treats it as an active slug and resolves the path to `specrunner/requests/active/<slug>/request.md`
- If neither a file nor an active slug is found, the command writes an error to stderr and exits 1
- All other behavior (verdict, exit codes, `--json` flag) is unchanged

### REQ-CLI-RUN-02: `specrunner run <request.md|slug>`

Extends the existing `specrunner run <request.md>` to also accept an active request slug.

- If the positional argument resolves to an existing file path, the existing pipeline flow applies (unchanged — backward compatible)
- If the positional argument does NOT resolve to an existing file, the CLI treats it as an active slug and resolves the path to `specrunner/requests/active/<slug>/request.md`
- If the resolved slug path does not exist, the command writes the following to stderr and exits 1:
  - `Error: '<arg>' is neither a file path nor an active request slug.`
  - `Hint: Use 'specrunner request list' to see available slugs.`
- preflight, pipeline, and all downstream behavior are unchanged; only the path-resolution step is extended
