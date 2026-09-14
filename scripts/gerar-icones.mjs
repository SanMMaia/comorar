// Gera os PNGs do ícone do Comorar (180/192/512) rasterizando o favicon.svg
// (retângulo arredondado + check) sem dependências. Node 18+.
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'

const TAMANHOS = [180, 192, 512]

function crc32(buf) {
  let c
  const table = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c
  }
  let crc = 0xffffffff
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(tipo, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(tipo, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

function png(tamanho, rgba) {
  const raw = Buffer.alloc(tamanho * (tamanho * 4 + 1))
  for (let y = 0; y < tamanho; y++) {
    raw[y * (tamanho * 4 + 1)] = 0
    for (let x = 0; x < tamanho; x++) {
      const p = (y * tamanho + x) * 4
      const o = y * (tamanho * 4 + 1) + 1 + x * 4
      raw[o] = rgba[p]
      raw[o + 1] = rgba[p + 1]
      raw[o + 2] = rgba[p + 2]
      raw[o + 3] = rgba[p + 3]
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(tamanho, 0)
  ihdr.writeUInt32BE(tamanho, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// distância de um ponto a um segmento
function distPontoSegmento(px, py, ax, ay, bx, by) {
  const dx = bx - ax
  const dy = by - ay
  const len2 = dx * dx + dy * dy
  let t = len2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0
  t = Math.max(0, Math.min(1, t))
  const cx = ax + t * dx
  const cy = ay + t * dy
  return Math.hypot(px - cx, py - cy)
}

function gerar(tamanho) {
  const s = tamanho / 100
  const raio = 22 * s
  const fundo = [15, 118, 110, 255]
  const traco = [255, 255, 255, 255]
  const gracinhas = [
    [22, 62, 50, 32],
    [50, 32, 78, 62],
    [38, 62, 38, 74],
    [38, 74, 62, 74],
    [62, 74, 62, 62],
    [62, 62, 62, 62],
  ]
  const largTraco = 8 * s
  const rgbt = tamanho * tamanho * 4
  const out = Buffer.alloc(rgbt)
  const supersamp = 4
  for (let y = 0; y < tamanho; y++) {
    for (let x = 0; x < tamanho; x++) {
      let dentro = 0
      let total = 0
      for (let sy = 0; sy < supersamp; sy++) {
        for (let sx = 0; sx < supersamp; sx++) {
          const fx = x + (sx + 0.5) / supersamp
          const fy = y + (sy + 0.5) / supersamp
          // fundo arredondado
          const cx = Math.min(Math.max(fx, raio), tamanho - raio)
          const cy = Math.min(Math.max(fy, raio), tamanho - raio)
          const dArred = Math.hypot(fx - cx, fy - cy)
          const dentroFundo = fx >= raio && fx <= tamanho - raio && fy >= raio && fy <= tamanho - raio
            ? true
            : dArred <= raio
          let dentroTraco = false
          if (dentroFundo) {
            let min = Infinity
            for (const [ax, ay, bx, by] of gracinhas) {
              if (ax === bx && ay === by) continue
              const d = distPontoSegmento(fx, fy, ax * s, ay * s, bx * s, by * s)
              if (d < min) min = d
            }
            dentroTraco = min <= largTraco / 2
          }
          if (dentroFundo) total++
          if (dentroTraco) dentro++
        }
      }
      const coberturaTraco = dentro / total
      const o = (y * tamanho + x) * 4
      out[o] = Math.round(fundo[0] + (traco[0] - fundo[0]) * coberturaTraco)
      out[o + 1] = Math.round(fundo[1] + (traco[1] - fundo[1]) * coberturaTraco)
      out[o + 2] = Math.round(fundo[2] + (traco[2] - fundo[2]) * coberturaTraco)
      out[o + 3] = 255
    }
  }
  return png(tamanho, out)
}

mkdirSync('public/icons', { recursive: true })
for (const t of TAMANHOS) {
  writeFileSync(`public/icons/icon-${t}.png`, gerar(t))
  console.log(`public/icons/icon-${t}.png gerado`)
}