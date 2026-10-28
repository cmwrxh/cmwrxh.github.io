const FRAME_FILE = /^(mobile|desktop)-(\d{2})-(\d+)-(webp|png)\.jpg?$/;

export function parseFilmstripFilename(name) {
  const match = String(name || '').match(/^(mobile|desktop)-(\d{2})-(\d+)-(webp|png)$/);
  if (!match) return null;
  return { profile: match[1], index: Number(match[2]), timing_ms: Number(match[3]), format: match[4] };
}

export async function signFilmstripFiles(files, storage, jobId, expiresIn = 3600) {
  if (!Array.isArray(files)) return [];
  const output = [];
  for (const file of files) {
    const parsed = parseFilmstripFilename(file?.name);
    if (!parsed) continue;
    const path = jobId + '/filmstrip/' + file.name;
    const { data, error } = await storage.createSignedUrl(path, expiresIn);
    if (error || !data?.signedUrl) continue;
    output.push({ ...parsed, url: data.signedUrl });
  }
  return output.sort((a, b) => a.profile.localeCompare(b.profile) || a.index - b.index).slice(0, 24);
}
