/** ProPresenter portable playlist export (.proplaylist) may be zip or protobuf. */
export function isZipArchive(bytes: Buffer): boolean {
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b;
}

export function validateNativePlaylistExport(bytes: Buffer, playlistName: string): void {
  if (bytes.length < 100) {
    throw new Error("Playlist export file is too small or empty.");
  }

  if (isZipArchive(bytes)) return;

  const needle = playlistName.trim();
  if (!needle) return;

  if (!bytes.includes(Buffer.from(needle, "utf8"))) {
    throw new Error(
      `Playlist export does not contain "${needle}". ` +
        "Use ProPresenter File → Export → Playlist for this playlist, then publish again.",
    );
  }
}
