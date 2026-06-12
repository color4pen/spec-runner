import { ERROR_CODES, SpecRunnerError } from "../../errors.js";
import { detectPackageManager } from "../../util/detect-pm.js";
import type { PackageManager } from "../../util/detect-pm.js";

type Importer<T> = (specifier: string) => Promise<T>;

export interface ProviderSdkMissingInfo {
  providerName: string;
  packageName: string;
}

export interface OptionalProviderSdkLoaderDeps<T> {
  info: ProviderSdkMissingInfo;
  importer: Importer<T>;
  /** Override for tests. Defaults to lockfile-based detection from process.cwd(). */
  detectPm?: () => Promise<PackageManager>;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Build the package-add command for the detected package manager.
 * npm uses `npm install <pkg>`; bun / pnpm / yarn use `<pm> add <pkg>`.
 */
export function addPackageCommand(pm: PackageManager, packageName: string): string {
  if (pm === "npm") return `npm install ${packageName}`;
  return `${pm} add ${packageName}`;
}

export function isMissingTopLevelPackageError(err: unknown, packageName: string): boolean {
  if (!(err instanceof Error)) return false;
  const code = (err as { code?: unknown }).code;
  const message = err.message;
  if (code !== "ERR_MODULE_NOT_FOUND" && code !== "MODULE_NOT_FOUND") return false;
  const escapedPackageName = escapeRegExp(packageName);
  const directSpecifierPattern = new RegExp(
    String.raw`(?:Cannot find (?:package|module)|Failed to resolve module specifier)\s+['"\`]${escapedPackageName}['"\`]`,
  );
  return directSpecifierPattern.test(message) && !/node_modules[\\/]/.test(message);
}

export async function loadOptionalProviderSdk<T>(deps: OptionalProviderSdkLoaderDeps<T>): Promise<T> {
  const { info, importer } = deps;
  try {
    return await importer(info.packageName);
  } catch (err) {
    if (isMissingTopLevelPackageError(err, info.packageName)) {
      const detect = deps.detectPm ?? (async () => (await detectPackageManager(process.cwd())).pm);
      const pm = await detect().catch(() => "npm" as PackageManager);
      throw new SpecRunnerError(
        ERROR_CODES.PROVIDER_SDK_MISSING,
        `Install the selected provider SDK with: ${addPackageCommand(pm, info.packageName)}`,
        `${info.providerName} local provider requires optional package ${info.packageName}. For global installs: npm install -g ${info.packageName}.`,
      );
    }
    throw err;
  }
}
