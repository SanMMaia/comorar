import { supabase } from './supabase'

const BUCKET = 'comprovantes'
const MAX_LADO = 1600
const QUALIDADE_WEBP = 0.8
const QUALIDADE_JPEG = 0.85

interface ImagemComprimida {
  blob: Blob
  ext: string
  type: string
}

function extOriginal(arquivo: File): string {
  return arquivo.name.includes('.') ? arquivo.name.split('.').pop()! : 'jpg'
}

async function carregarComoImagem(arquivo: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(arquivo)
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Não foi possível decodificar a imagem'))
    img.src = url
  }).finally(() => URL.revokeObjectURL(url))
}

function exportarCanvas(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve) => {
    canvas.toBlob((b) => {
      if (b) return resolve(b)
      canvas.toBlob((b2) => (b2 ? resolve(b2) : resolve(new Blob())), 'image/jpeg', QUALIDADE_JPEG)
    }, 'image/webp', QUALIDADE_WEBP)
  })
}

/**
 * Reduz a foto do comprovante antes do upload: limita o lado maior a 1600px
 * e converte para WebP (fallback JPEG). Fotos já pequenas em JPEG/WebP sobem
 * inalteradas. Imagens que não decodificam (ex.: HEIC fora do Safari) sobem cruas.
 */
async function comprimirComprovante(arquivo: File): Promise<ImagemComprimida> {
  const ext = extOriginal(arquivo)
  const type = arquivo.type || 'image/jpeg'
  try {
    const img = await carregarComoImagem(arquivo)
    const lado = Math.max(img.naturalWidth, img.naturalHeight)
    if (lado <= MAX_LADO && (type === 'image/jpeg' || type === 'image/webp')) {
      return { blob: arquivo, ext, type }
    }
    const escala = Math.min(1, MAX_LADO / lado)
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(img.naturalWidth * escala))
    canvas.height = Math.max(1, Math.round(img.naturalHeight * escala))
    const ctx = canvas.getContext('2d')
    if (!ctx) return { blob: arquivo, ext, type }
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    const blob = await exportarCanvas(canvas)
    return { blob, ext: 'webp', type: 'image/webp' }
  } catch {
    return { blob: arquivo, ext, type }
  }
}

/** Sobe a foto do comprovante em `{casa_id}/{uuid}.{ext}` e devolve o caminho. */
export async function subirComprovante(casaId: string, arquivo: File): Promise<string> {
  const comprimida = await comprimirComprovante(arquivo)
  const path = `${casaId}/${crypto.randomUUID()}.${comprimida.ext}`
  const { error } = await supabase.storage.from(BUCKET).upload(path, comprimida.blob, {
    contentType: comprimida.type,
    upsert: false,
  })
  if (error) throw new Error(error.message)
  return path
}

/** URL temporária (1h) para exibir o comprovante privado. */
export async function urlComprovante(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600)
  if (error || !data) return null
  return data.signedUrl
}

/** Apaga o comprovante do storage. */
export async function removerComprovante(path: string): Promise<void> {
  const { error } = await supabase.storage.from(BUCKET).remove([path])
  if (error) console.error('Erro ao remover comprovante', error)
}