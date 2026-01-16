async function generateMultipartFormData(formData) {
  const boundary = `----formdata-curlcffi-${`${Math.random().toString().slice(0, 5)}`.padStart(11, '0')}`
  const prefix = `--${boundary}\r\nContent-Disposition: form-data`
  const escape = (str) => str.replace(/\n/g, '%0A').replace(/\r/g, '%0D').replace(/"/g, '%22')
  const normalizeLinefeeds = (value) => value.replace(/\r?\n|\r/g, '\r\n')
  const blobParts = []
  const rn = new Uint8Array([13, 10])
  const textEncoder = new TextEncoder()
  for (const [name, value] of formData) {
    if (typeof value === 'string') {
      const chunk = textEncoder.encode(prefix + `; name="${escape(normalizeLinefeeds(name))}"` + `\r\n\r\n${normalizeLinefeeds(value)}\r\n`)
      blobParts.push(chunk)
    } else {
      const chunk = textEncoder.encode(`${prefix}; name="${escape(normalizeLinefeeds(name))}"` + (value.name ? `; filename="${escape(value.name)}"` : '') + '\r\n' + `Content-Type: ${value.type || 'application/octet-stream'}\r\n\r\n`)
      blobParts.push(chunk, value, rn)
    }
  }
  const chunk = textEncoder.encode(`--${boundary}--\r\n`)
  blobParts.push(chunk)
  const action = async function* () { for (const part of blobParts) { if (part.stream) { yield* part.stream() } else { yield part } } }
  const parts = []
  for await (const part of action()) {
    if (part instanceof Uint8Array) parts.push(part)
    else if (typeof Blob !== 'undefined' && part instanceof Blob) {
      const arrayBuffer = await part.arrayBuffer()
      parts.push(new Uint8Array(arrayBuffer))
    } else {
      throw new TypeError('Unsupported part type')
    }
  }
  const body = new Uint8Array(parts.reduce((acc, p) => acc + p.length, 0))
  let offset = 0
  for (const p of parts) { body.set(p, offset); offset += p.length }
  return { body, type: `multipart/form-data; boundary=${boundary}` }
}

async function castToTypedArray(body) {
  let typedArray = body
  let type = ''
  if (typeof body === 'string') {
    typedArray = new TextEncoder().encode(body)
    type = 'text/plain;charset=UTF-8'
  } else if (typeof URLSearchParams !== 'undefined' && typedArray instanceof URLSearchParams) {
    typedArray = new TextEncoder().encode(body.toString())
    type = 'application/x-www-form-urlencoded;charset=UTF-8'
  } else if (typeof ArrayBuffer !== 'undefined' && body instanceof ArrayBuffer) {
    typedArray = new Uint8Array(body.slice())
  } else if (ArrayBuffer.isView(body)) {
    typedArray = new Uint8Array(body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength))
  } else if (typeof Blob !== 'undefined' && body instanceof Blob) {
    typedArray = new Uint8Array(await body.arrayBuffer())
    type = body.type
  } else if (typeof FormData !== 'undefined' && body instanceof FormData) {
    return await generateMultipartFormData(body)
  } else if (typeof ReadableStream !== 'undefined' && body instanceof ReadableStream) {
    const reader = body.getReader()
    const chunks = []
    let done = false
    while (!done) {
      const { done: streamDone, value } = await reader.read()
      done = streamDone
      if (value) chunks.push(value)
    }
    const total = chunks.reduce((acc, c) => acc + c.length, 0)
    typedArray = new Uint8Array(total)
    let offset = 0
    for (const c of chunks) { typedArray.set(c, offset); offset += c.length }
  }
  return { body: typedArray, type }
}

exports.castToTypedArray = castToTypedArray
