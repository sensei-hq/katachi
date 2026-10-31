// What build is running: shown in Settings, the studio rail and the landing footer, and served at /api/version.
export const appVersion: string = __APP_VERSION__;
export const appCommit: string = __APP_COMMIT__;
export const appBuiltAt: string = __APP_BUILT_AT__;
/** "v0.1.0 · 4899607" */
export const versionLabel = `v${appVersion} · ${appCommit}`;
/** "v0.1.0 · 4899607 · built 29 Oct 2026, 14:05" */
export function versionDetail(locale?: string): string {
  const at = new Date(appBuiltAt);
  const when = Number.isNaN(at.getTime()) ? '' : ` · built ${at.toLocaleString(locale, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`;
  return `${versionLabel}${when}`;
}
