const origin = "https://africalatency.dev";
const failures = [];

async function get(path) {
  const url = new URL(path, origin);
  let response;
  try {
    response = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(15000) });
  } catch (error) {
    failures.push(`FETCH ${path}: ${error.message}`);
    return null;
  }
  if (!response.ok) {
    failures.push(`HTTP ${response.status} for ${path}`);
    return null;
  }
  console.log(`OK ${response.status} ${path} (${response.headers.get("content-type") || "unknown content type"})`);
  return response;
}

const home = await get("/");
if (home) {
  const html = await home.text();
  if (!/<link\s+[^>]*rel=["']manifest["'][^>]*href=["']\/manifest\.json["']/i.test(html)) {
    failures.push("Homepage does not link /manifest.json using rel=manifest");
  }
  if (!html.includes("/service-worker.js")) {
    failures.push("Homepage does not include service-worker registration");
  }
}

const manifestResponse = await get("/manifest.json");
if (manifestResponse) {
  let manifest;
  try {
    manifest = await manifestResponse.json();
  } catch {
    failures.push("/manifest.json is not valid JSON");
  }
  if (manifest) {
    if (manifest.name !== "AfricaLatency") failures.push("Manifest name must be AfricaLatency");
    if (!manifest.start_url || !manifest.scope) failures.push("Manifest must define start_url and scope");
    if (manifest.display !== "standalone") failures.push("Manifest display must be standalone");
    for (const size of ["192x192", "512x512"]) {
      if (!(manifest.icons || []).some((icon) => icon.sizes === size && icon.type === "image/png")) {
        failures.push(`Manifest is missing PNG icon ${size}`);
      }
    }
    for (const icon of manifest.icons || []) await get(icon.src);
  }
}

await get("/service-worker.js");
await get("/offline.html");

if (failures.length) {
  console.error("\nPWA preflight failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log("\nAfricaLatency PWA preflight passed. This validates public endpoints only; it does not replace device, auth, scan, or Play release testing.");
}
