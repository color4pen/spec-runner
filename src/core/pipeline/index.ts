// Pipeline module exports
export { Pipeline } from "./pipeline.js";
export type { Transition } from "./types.js";
export { STANDARD_TRANSITIONS } from "./types.js";
export { runPipeline, runProposePipeline, createStandardPipeline } from "./run.js";
// Re-export PipelineDeps for backward compatibility
export type { PipelineDeps } from "../types.js";
