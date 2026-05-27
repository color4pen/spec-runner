import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['bin/specrunner.ts'],
  format: ['esm'],
  target: 'node20',
  outDir: 'dist',
  clean: true,
  splitting: false,
  external: ['@anthropic-ai/sdk', '@anthropic-ai/claude-agent-sdk', '@openai/codex-sdk'],
})
