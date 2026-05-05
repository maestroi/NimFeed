export function isCompressionSupported() {
  try {
    new CompressionStream('deflate-raw')
    return true
  } catch {
    return false
  }
}

export async function deflateRaw(bytes) {
  if (!isCompressionSupported()) return bytes
  const cs = new CompressionStream('deflate-raw')
  const writer = cs.writable.getWriter()
  writer.write(bytes)
  writer.close()
  return new Uint8Array(await new Response(cs.readable).arrayBuffer())
}

export async function inflateRaw(bytes) {
  if (!isCompressionSupported()) return bytes
  const ds = new DecompressionStream('deflate-raw')
  const writer = ds.writable.getWriter()
  writer.write(bytes)
  writer.close()
  return new Uint8Array(await new Response(ds.readable).arrayBuffer())
}

// Encodes post text → { payload, compressed, contentHash, chunks }
export async function encodePost(text) {
  const raw = new TextEncoder().encode(text)
  const comp = await deflateRaw(raw)
  const compressed = comp.length < raw.length
  const payload = compressed ? comp : raw

  const digest = await crypto.subtle.digest('SHA-256', payload)
  const contentHash = new Uint8Array(digest).slice(0, 8)

  const chunks = []
  for (let i = 0; i < payload.length; i += 50) {
    chunks.push(payload.slice(i, i + 50))
  }

  return { payload, compressed, contentHash, chunks }
}

export function shouldCompress(raw, compressed) {
  return compressed.length < raw.length
}
