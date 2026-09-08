# Cost — measured figures (point-in-time snapshot)

Last measured: 2026-06-10

Aggregated from this project's own archived runs (`specrunner/changes/archive/*/usage.json`, 278 requests), summing input, output, cache-creation, and cache-read tokens per request and pricing each invocation at its model's Anthropic list rate as of 2026-06-10.

| Metric | Tokens | USD |
|--------|--------|-----|
| Minimum | 0.64 M | $1.42 |
| Median | 6.1 M | $8.58 |
| Maximum | 117 M | $73.11 |

Cache reads account for ~94% of all tokens; applying the cache-read discount (0.1× the base input rate) is essential for accurate cost projection. The high end of the range includes requests that looped through fixer steps many times.

## Codex reference estimates (2026-09-09)

New Codex usage records exclude cache reads and writes from ordinary input tokens
and retain both cache categories separately, including follow-up and repair calls.
GPT-5.6 Sol/Terra/Luna use the [OpenAI Standard short-context reference rates](https://developers.openai.com/api/docs/pricing)
checked on 2026-09-09. These are API-equivalent estimates; service tier, long-context
rates, and subscription billing are not inferred from aggregate token counts.

This corrects category double counting, but does not resolve cumulative usage
returned by the SDK across resumed calls or usage lost on failure. Existing usage
files are not migrated, so historical records do not gain the category correction
merely by updating the program. The snapshot above is unchanged.
