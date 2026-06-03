/** ProPresenter “Support Files” root (Preferences → Advanced). */
export function loadProPresenterSupportFilesPath(
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  const raw = env.PP_SUPPORT_FILES_PATH?.trim();
  return raw || undefined;
}
