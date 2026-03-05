export async function probeSource(url) {
  try {
    const r = await fetch(url,{method:'HEAD',cache:'no-store'});
    return r.ok;
  } catch {
    return false;
  }
}
