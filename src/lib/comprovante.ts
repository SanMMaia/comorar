import { supabase } from './supabase'

const BUCKET = 'comprovantes'

/** Sobe a foto do comprovante em `{casa_id}/{uuid}.{ext}` e devolve o caminho. */
export async function subirComprovante(casaId: string, arquivo: File): Promise<string> {
  const ext = arquivo.name.includes('.') ? arquivo.name.split('.').pop()! : 'jpg'
  const path = `${casaId}/${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage.from(BUCKET).upload(path, arquivo, {
    contentType: arquivo.type || 'image/jpeg',
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