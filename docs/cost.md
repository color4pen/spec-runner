# Cost — measured figures (point-in-time snapshot)

Last measured: 2026-06-10

Aggregated from this project's own archived runs (`specrunner/changes/archive/*/usage.json`, 278 requests), summing input, output, cache-creation, and cache-read tokens per request and pricing each invocation at its model's Anthropic list rate as of 2026-06-10.

| Metric | Tokens | USD |
|--------|--------|-----|
| Minimum | 0.64 M | $1.42 |
| Median | 6.1 M | $8.58 |
| Maximum | 117 M | $73.11 |

Cache reads account for ~94% of all tokens; applying the cache-read discount (0.1× the base input rate) is essential for accurate cost projection. The high end of the range includes requests that looped through fixer steps many times.
