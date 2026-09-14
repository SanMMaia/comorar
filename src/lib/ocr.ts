import { supabase } from './supabase'
import type { Categoria } from '../types'

export interface ResultadoOCR {
  fornecedor?: string
  valor?: number
  data?: string
  categoria?: Categoria
}

/**
 * Chama a Edge Function `ocr` (Supabase) para extrair dados de um comprovante
 * já enviado ao bucket 'comprovantes'.
 * Retorna os campos extraídos, ou null se não foi possível ler (fallback manual).
 */
export async function lerComprovante(path: string): Promise<ResultadoOCR | null> {
  try {
    const { data, error } = await supabase.functions.invoke('ocr', { body: { path } })
    if (error) {
      console.error('OCR falhou:', error)
      return null
    }
    if (!data || data.ok !== true || !data.dados || typeof data.dados !== 'object') {
      return null
    }
    return data.dados as ResultadoOCR
  } catch (err) {
    console.error('OCR erro inesperado:', err)
    return null
  }
}