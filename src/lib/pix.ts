import jsQR from 'jsqr'

export interface PixExtraido {
  valor?: number
  nome?: string
  txid?: string
}

/** Tenta ler um QR Code da imagem (foto da câmera ou importada). Devolve o texto bruto ou null. */
export async function lerQrDaImagem(arquivo: File): Promise<string | null> {
  const url = URL.createObjectURL(arquivo)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error('imagem inválida'))
      el.src = url
    })
    const escala = Math.min(1, 1024 / Math.max(img.naturalWidth, img.naturalHeight))
    const w = Math.max(1, Math.round(img.naturalWidth * escala))
    const h = Math.max(1, Math.round(img.naturalHeight * escala))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return null
    ctx.drawImage(img, 0, 0, w, h)
    const imageData = ctx.getImageData(0, 0, w, h)
    const codigo = jsQR(imageData.data, w, h)
    return codigo?.data ?? null
  } catch {
    return null
  } finally {
    URL.revokeObjectURL(url)
  }
}

function lerTlv(texto: string): Map<string, string> {
  const mapa = new Map<string, string>()
  let i = 0
  while (i + 4 <= texto.length) {
    const tag = texto.slice(i, i + 2)
    const comprimento = Number.parseInt(texto.slice(i + 2, i + 4), 10)
    if (Number.isNaN(comprimento)) break
    const valor = texto.slice(i + 4, i + 4 + comprimento)
    mapa.set(tag, valor)
    i += 4 + comprimento
  }
  return mapa
}

/** Extrai valor/nome/txid de um payload "Pix copia e cola" (BR Code / EMV). */
export function parsePixCopiaECola(texto: string): PixExtraido {
  const tlv = lerTlv(texto)
  const extra: PixExtraido = {}
  const nome = tlv.get('59')
  if (nome) extra.nome = nome
  const adicionais = tlv.get('62')
  const txid = adicionais ? lerTlv(adicionais).get('05') : undefined
  if (txid) extra.txid = txid
  const valor = tlv.get('54')
  if (valor) {
    const n = Number(valor.replace(',', '.'))
    if (Number.isFinite(n) && n > 0) extra.valor = n
  }
  return extra
}