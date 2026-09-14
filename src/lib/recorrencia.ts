import { supabase } from './supabase'
import type { Recorrencia } from '../types'

/** Data válida de vencimento: dia > último dia do mês vira o último dia. */
export function dataVencimento(dia: number, ano: number, mes: number): Date {
  const ultimoDia = new Date(Date.UTC(ano, mes, 0)).getUTCDate()
  return new Date(Date.UTC(ano, mes - 1, Math.min(dia, ultimoDia)))
}

export function isMesmoDia(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  )
}

/**
 * Gera as datas de vencimento de uma recorrência até a data limite `ate`
 * (inclusive), a partir de `data_inicio`. Datas anteriores a `data_inicio`
 * não são geradas.
 */
export function gerarDatasPrevisao(
  rec: Pick<Recorrencia, 'data_inicio' | 'data_fim' | 'dia_vencimento' | 'intervalo'>,
  ate: Date,
): Date[] {
  const inicio = new Date(rec.data_inicio + 'T00:00:00.000Z')
  if (rec.data_fim) {
    const fim = new Date(rec.data_fim + 'T00:00:00.000Z')
    if (fim < ate) ate = fim // recorrência encerrada antes do horizonte
  }
  const datas: Date[] = []

  switch (rec.intervalo) {
    case 'mensal': {
      const dia = rec.dia_vencimento ?? inicio.getUTCDate()
      let mes = inicio.getUTCFullYear() * 12 + inicio.getUTCMonth()
      const mesFim = ate.getUTCFullYear() * 12 + ate.getUTCMonth()
      for (; mes <= mesFim; mes++) {
        const d = dataVencimento(dia, Math.floor(mes / 12), (mes % 12) + 1)
        if (d >= inicio && d <= ate) datas.push(d)
      }
      break
    }
    case 'anual': {
      const d = inicio.getUTCDate()
      const m = inicio.getUTCMonth() + 1
      for (let ano = inicio.getUTCFullYear(); ano <= ate.getUTCFullYear(); ano++) {
        const data = dataVencimento(d, ano, m)
        if (data >= inicio && data <= ate) datas.push(data)
      }
      break
    }
    default: {
      const passoDias = rec.intervalo === 'semanal' ? 7 : 14
      for (let d = new Date(inicio); d <= ate; d = new Date(d.getTime() + passoDias * 86400000)) {
        datas.push(new Date(d))
      }
      break
    }
  }
  return datas
}

export interface PrevisaoGerada {
  data: Date
  valor_previsto: number
  categoria: Recorrencia['categoria']
  fornecedor: string
  descricao: string | null
}

/** Gera os lançamentos previstos de uma recorrência (dados para inserir). */
export function gerarPrevistas(
  rec: Recorrencia,
  ate: Date,
): PrevisaoGerada[] {
  const datas = gerarDatasPrevisao(rec, ate)
  return datas.map((data) => ({
    data,
    valor_previsto: rec.valor_previsto,
    categoria: rec.categoria,
    fornecedor: rec.fornecedor,
    descricao: rec.descricao,
  }))
}

/**
 * Garante as previsões de uma recorrência: gera desde `data_inicio`
 * (meses que já passaram também são criados, para o histórico) até um
 * horizonte de 12 meses. Lançamentos que já existem na mesma data
 * (pagos ou ignorados) são preservados.
 */
export async function gravarPrevistas(casaId: string, rec: Recorrencia): Promise<void> {
  const horizonte = new Date()
  horizonte.setMonth(horizonte.getMonth() + 12)
  const linhas = gerarPrevistas(rec, horizonte).map((p) => ({
    casa_id: casaId,
    fornecedor: p.fornecedor,
    descricao: p.descricao,
    valor: p.valor_previsto,
    categoria: p.categoria,
    tipo_rateio: rec.tipo_rateio,
    status: 'prevista' as const,
    origem_recorrencia_id: rec.id,
    data: p.data.toISOString().slice(0, 10),
  }))
  if (!linhas.length) return

  const { data: existentes, error: errExistentes } = await supabase
    .from('despesas')
    .select('data')
    .eq('origem_recorrencia_id', rec.id)
    .eq('casa_id', casaId)
  if (errExistentes) throw errExistentes

  const datasExistentes = new Set((existentes ?? []).map((e) => e.data as string))
  const novas = linhas.filter((l) => !datasExistentes.has(l.data))
  if (!novas.length) return

  const { error } = await supabase.from('despesas').insert(novas)
  if (error) throw error
}