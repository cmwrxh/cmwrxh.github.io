export async function runProbeEngine(engine, go, node, compareShadow = async () => {}) {
  if (engine === 'go') {
    try { return await go(); } catch { return node(); }
  }
  const nodeResult = await node();
  if (engine === 'shadow') {
    try { await compareShadow(nodeResult); } catch { /* shadow must never affect Node output */ }
  }
  return nodeResult;
}

export async function attemptGoIngest(engine, go, onError = () => {}) {
  if (engine === 'node') return null;
  if (engine === 'shadow') {
    void Promise.resolve().then(go).catch(onError);
    return null;
  }
  try { return await go(); } catch (error) {
    onError(error);
    return null;
  }
}
