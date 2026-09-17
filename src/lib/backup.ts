import { supabase } from './supabase'

function nomeArquivo(nomeCasa: string): string {
  const data = new Date().toISOString().slice(0, 10)
  const slug = nomeCasa
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
  return `comorar-${slug || 'casa'}-${data}.json`
}

/** Exporta a casa inteira como JSON e dispara o download. */
export async function exportarBackup(casaId: string, nomeCasa: string) {
  const { data, error } = await supabase.rpc('exportar_backup', { p_casa: casaId })
  if (error) throw new Error(error.message)

  const texto = JSON.stringify(data, null, 2)
  const blob = new Blob([texto], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = nomeArquivo(nomeCasa)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

/** Lê um arquivo JSON e restaura como uma casa nova. Devolve o id criado. */
export async function restaurarBackup(arquivo: File): Promise<string> {
  const texto = await arquivo.text()
  let dados: unknown
  try {
    dados = JSON.parse(texto)
  } catch {
    throw new Error('O arquivo não é um JSON válido.')
  }
  const { data, error } = await supabase.rpc('restaurar_backup', { p_dados: dados })
  if (error) throw new Error(error.message)
  return data as string
}
