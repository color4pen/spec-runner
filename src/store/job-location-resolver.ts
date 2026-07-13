import * as path from "node:path";
import { slugEventsPath, slugStateJsonPath } from "../util/paths.js";
import { SpecRunnerError, ERROR_CODES } from "../errors.js";

/**
 * Resolves storage paths for a job's state.json and events.jsonl.
 *
 * Two modes:
 *   slug mode:     slug + stateRoot → paths derived from slug convention
 *   changeDir mode: changeDir → paths are changeDir/state.json and changeDir/events.jsonl
 */
export class JobLocationResolver {
  private readonly jobId: string;
  private readonly repoRoot: string;
  private readonly slug?: string;
  private readonly stateRoot?: string;
  private readonly changeDir?: string;

  constructor(
    jobId: string,
    repoRoot: string,
    opts?: { slug?: string; stateRoot?: string; changeDir?: string },
  ) {
    this.jobId = jobId;
    this.repoRoot = repoRoot;
    this.slug = opts?.slug;
    this.stateRoot = opts?.stateRoot;
    this.changeDir = opts?.changeDir;
  }

  isSlugMode(): boolean {
    return !!(this.slug && this.stateRoot);
  }

  getEventsPath(): string {
    if (this.changeDir) {
      return path.join(this.changeDir, "events.jsonl");
    }
    if (this.isSlugMode()) {
      return path.join(this.stateRoot!, slugEventsPath(this.slug!));
    }
    throw new SpecRunnerError(
      ERROR_CODES.STATE_FILE_INVALID,
      "Internal invariant violation: JobStateStore requires slug+stateRoot or changeDir.",
      `getEventsPath: no slug or changeDir for jobId ${this.jobId}`,
    );
  }

  getStateJsonPath(): string {
    if (this.changeDir) {
      return path.join(this.changeDir, "state.json");
    }
    if (this.isSlugMode()) {
      return path.join(this.stateRoot!, slugStateJsonPath(this.slug!));
    }
    throw new SpecRunnerError(
      ERROR_CODES.STATE_FILE_INVALID,
      "Internal invariant violation: JobStateStore requires slug+stateRoot or changeDir.",
      `getStateJsonPath: no slug or changeDir for jobId ${this.jobId}`,
    );
  }
}
