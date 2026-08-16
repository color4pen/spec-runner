# `job` review

Status: **pending**

Current subcommands: `start`, `ls`, `show`, `wait`, `cancel`, `resume`, `reopen`, `attach`, `archive`, `prune`, `stats`.

This is the largest surface and should be reviewed by user intent: start/observe/recover/lifecycle/maintenance. Operator-only recovery and maintenance paths should not automatically receive the same discoverability as everyday job operations.
