import { supabase } from './supabase'
import type { Categoria } from '../types'

export interface ResultadoOCR {
  fornecedor?: string
  valor?: number
  data?: string
  categoria?: Categoria
}

export type ResultadoLeitura =
  | { ok: true; dados: ResultadoOCR }
  | { ok: false; mensagem: string }

/**
 * Chama a Edge Function `ocr` (Supabase) para extrair dados de um comprovante
 * já enviado ao bucket 'comprovantes'.
 * Devolve { ok: true, dados } ou { ok: false, mensagem } com o motivo.
 */
export async function lerComprovante(path: string): Promise<ResultadoLeitura> {
  try {
    const { data, error } = await supabase.functions.invoke('ocr', { body: { path } })
    if (error) {
      console.error('OCR falhou:', error)
      const e = error as unknown as { context?: Record<string, unknown>; message?: string }
      const mensagem =
        (e.context && typeof e.context.mensagem === 'string' ? e.context.mensagem : null) ??
        e.message ??
        'Erro ao chamar o leitor de boleto.'
      return { ok: false, mensagem }
    }
    if (!data || data.ok !== true || !data.dados || typeof data.dados !== 'object') {
      const mensagem =
        typeof data?.mensagem === 'string' ? data.mensagem : 'Não foi possível ler o comprovante — preencha manualmente.'
      return { ok: false, mensagem }
    }
    return { ok: true, dados: data.dados as ResultadoOCR }
  } catch (err) {
    console.error('OCR erro inesperado:', err)
    return { ok: false, mensagem: 'Erro inesperado ao ler o comprovante.' }
  }
}