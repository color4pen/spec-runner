export function isRemoteRefNotFound(stderr: string): boolean {
  return stderr.toLowerCase().includes("remote ref does not exist");
}
