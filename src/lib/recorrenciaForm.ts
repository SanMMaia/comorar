import type { Categoria, IntervaloRecorrencia, Recorrencia, TipoRateio } from '../types'
import { parseCentavos } from './format'

export const labelsIntervalo: Record<IntervaloRecorrencia, string> = {
  mensal: 'Mensal', semanal: 'Semanal', quinzenal: 'Quinzenal', anual: 'Anual',
}
export const labelsRateio: Record<TipoRateio, string> = {
  igual: 'Igual para todos', percentual: 'Por percentual fixo', consumo: 'Só quem consumiu',
}

export interface Frm {
  fornecedor: string
  descricao: string
  valor: string
  categoria: Categoria
  dia: string
  intervalo: IntervaloRecorrencia
  tipoRateio: TipoRateio
  pagador: string
  dataInicio: string
  dataFim: string
}

export const frmVazio = (pagador: string): Frm => ({
  fornecedor: '',
  descricao: '',
  valor: '',
  categoria: 'luz',
  dia: '10',
  intervalo: 'mensal',
  tipoRateio: 'igual',
  pagador,
  dataInicio: new Date().toISOString().slice(0, 10),
  dataFim: '',
})

export const frmDeRec = (r: Recorrencia): Frm => ({
  fornecedor: r.fornecedor,
  descricao: r.descricao ?? '',
  valor: String(r.valor_previsto),
  categoria: r.categoria,
  dia: String(r.dia_vencimento ?? 10),
  intervalo: r.intervalo,
  tipoRateio: r.tipo_rateio,
  pagador: r.pagador_padrao ?? '',
  dataInicio: r.data_inicio,
  dataFim: r.data_fim ?? '',
})

export function validarFrm(f: Frm): string | null {
  if (!f.fornecedor.trim()) return 'Informe o fornecedor'
  const v = parseCentavos(f.valor)
  if (v === null || v <= 0) return 'Informe um valor previsto válido'
  if (f.intervalo === 'mensal') {
    const dia = Number(f.dia)
    if (!Number.isInteger(dia) || dia < 1 || dia > 31) return 'Dia de vencimento inválido'
  }
  if (f.dataFim && f.dataInicio && f.dataFim < f.dataInicio)
    return 'A data final deve ser depois da data de início'
  return null
}