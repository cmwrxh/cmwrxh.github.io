export function parseFilmstripFilename(name) {
  const match = String(name || '').match(/^(mobile|desktop)-(\d{2})-(\d+)(?:-([a-z0-9-]+))?\.(webp|png)$/);
  if (!match) return null;
  const label = match[4] || '';
  if (label === 'thumb' || label === '640') return null;
  return {
    profile: match[1],
    index: Number(match[2]),
    timing_ms: Number(match[3]),
    label,
    format: match[5],
    overlayDetected: label.split('-').includes('overlay')
  };
}

export async function signFilmstripFiles(files, storage, jobId, expiresIn = 3600) {
  if (!Array.isArray(files)) return [];
  const output = [];
  for (const file of files) {
    const parsed = parseFilmstripFilename(file?.name);
    if (!parsed) continue;
    const path = jobId + '/filmstrip/' + file.name;
    const [full, thumb, medium] = await Promise.all([
      storage.createSignedUrl(path, expiresIn),
      storage.createSignedUrl(path.replace(/\.(webp|png)$/, '-thumb.webp'), expiresIn),
      storage.createSignedUrl(path.replace(/\.(webp|png)$/, '-640.webp'), expiresIn)
    ]);
    if (full.error || !full.data?.signedUrl) continue;
    output.push({
      ...parsed,
      url: full.data.signedUrl,
      thumbnailUrl: thumb.error ? full.data.signedUrl : (thumb.data?.signedUrl || full.data.signedUrl),
      mediumUrl: medium.error ? full.data.signedUrl : (medium.data?.signedUrl || full.data.signedUrl)
    });
  }
  return output.sort((a, b) => a.profile.localeCompare(b.profile) || a.index - b.index).slice(0, 24);
}
