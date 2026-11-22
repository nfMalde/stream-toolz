/**
 * The app's environment variables are STZ_* (STZ_DATA_DIR, STZ_DEV_URL, STZ_SCREENSHOTS, STZ_SCREENSHOTS_QUIT,
 * STZ_DEVTOOLS). The RMC_* names from before the rename (2026-10-28) still work, so older scripts keep running.
 */
export function env(name: string): string | undefined {
  return process.env[`STZ_${name}`] ?? process.env[`RMC_${name}`];
}
