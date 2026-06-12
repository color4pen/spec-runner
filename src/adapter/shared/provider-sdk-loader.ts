import { ERROR_CODES, SpecRunnerError } from "../../errors.js";

type Importer<T> = (specifier: string) => Promise<T>;

export interface ProviderSdkMissingInfo {
  providerName: string;
  packageName: string;
  installCommand: string;
}

export interface OptionalProviderSdkLoaderDeps<T> {
  info: ProviderSdkMissingInfo;
  importer: Importer<T>;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
      throw new SpecRunnerError(
        ERROR_CODES.PROVIDER_SDK_MISSING,
        `Install the selected provider SDK with: ${info.installCommand}`,
        `${info.providerName} local provider requires optional package ${info.packageName}.`,
      );
    }
    throw err;
  }
}
