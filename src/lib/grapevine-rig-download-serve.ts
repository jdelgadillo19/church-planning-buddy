import { getCloudflareContext } from "@opennextjs/cloudflare";
import {
  RIG_DOWNLOAD_CONTENT_TYPES,
  RIG_DOWNLOAD_FILENAMES,
  RIG_R2_KEYS,
  type RigDownloadPlatform,
} from "@/lib/grapevine-rig-downloads";

const GITHUB_RELEASES_API =
  "https://api.github.com/repos/jdelgadillo19/church-planning-buddy/releases?per_page=20";

const GITHUB_ASSET_SUFFIX: Record<RigDownloadPlatform, string> = {
  macos: "-macos.dmg",
  windows: "-windows-setup.exe",
};

async function latestGithubDownloadUrl(platform: RigDownloadPlatform): Promise<string | null> {
  const suffix = GITHUB_ASSET_SUFFIX[platform];
  const res = await fetch(GITHUB_RELEASES_API, {
    headers: { Accept: "application/vnd.github+json", "User-Agent": "grapevineprep-downloads" },
  });
  if (!res.ok) return null;

  const releases = (await res.json()) as Array<{
    tag_name?: string;
    assets?: Array<{ name?: string; browser_download_url?: string }>;
  }>;

  for (const release of releases) {
    if (!release.tag_name?.startsWith("grapevine-rig-v")) continue;
    const asset = release.assets?.find((a) => a.name?.endsWith(suffix));
    if (asset?.browser_download_url) return asset.browser_download_url;
  }
  return null;
}

export async function serveRigDownload(platform: RigDownloadPlatform): Promise<Response> {
  const { env } = await getCloudflareContext({ async: true });
  const bucket = env.RIG_DOWNLOADS;
  const key = RIG_R2_KEYS[platform];

  if (bucket) {
    const object = await bucket.get(key);
    if (object) {
      const filename = RIG_DOWNLOAD_FILENAMES[platform];
      const headers = new Headers();
      headers.set("Content-Type", RIG_DOWNLOAD_CONTENT_TYPES[platform]);
      headers.set("Content-Disposition", `attachment; filename="${filename}"`);
      headers.set("Cache-Control", "public, max-age=3600");
      if (object.size != null) {
        headers.set("Content-Length", String(object.size));
      }
      const version = object.customMetadata?.version;
      if (version) {
        headers.set("X-Grapevine-Rig-Version", version);
      }
      return new Response(object.body, { status: 200, headers });
    }
  }

  const githubUrl = await latestGithubDownloadUrl(platform);
  if (githubUrl) {
    return Response.redirect(githubUrl, 302);
  }

  return new Response(
    "Grapevine Client installer is not available yet. Try again after the next client release, or contact your admin.",
    { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } },
  );
}
