import { buildSha } from "./version.generated";

/**
 * The git commit this instance is running, shown on /settings.
 *
 * `buildSha` is stamped into `version.generated.ts` at build time:
 *   - OSS standalone: the Docker build reads `git rev-parse HEAD`.
 *   - Private wrapper: its build writes the vendored submodule commit (which it
 *     tracks as committed data) into this same file — no git or env var needed.
 * Null in local dev / non-git builds, in which case the footer hides itself.
 */
export const appVersion: string | null = buildSha || null;

const isCommitSha = (v: string): boolean => /^[0-9a-f]{7,40}$/i.test(v);

/** A compact label for display: 7-char prefix for SHAs, otherwise the raw value. */
export const appVersionLabel: string | null = appVersion
  ? isCommitSha(appVersion)
    ? appVersion.slice(0, 7)
    : appVersion
  : null;

/** GitHub commit URL when the version is a commit SHA, else null. */
export const appCommitUrl: string | null =
  appVersion && isCommitSha(appVersion)
    ? `https://github.com/ksaitor/teamcp/commit/${appVersion}`
    : null;
