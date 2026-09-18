import type { TipoRateio } from '../types'

export interface MoradorRateio {
  user_id: string
  percentual?: number
}

export interface ConfigRateio {
  regra: TipoRateio
  /** user_id -> percentual (0-100). Usado em 'percentual'. */
  percentuais?: Record<string, number>
  /** user_id -> peso (qualquer escala, ex.: consumo kW/h). Usado em 'consumo'; supera `percentuais`. */
  pesos?: Record<string, number>
  /** Moradores incluídos no rateio. Usado em 'consumo'. */
  incluidos?: string[]
}

export interface ItemRateio {
  morador_id: string
  valor_rateado: number
}

/** Arredonda e devolve em centavos para evitar erros de float. */
function paraCentavos(valor: number): number {
  return Math.round(valor * 100)
}

/**
 * Valida os percentuais da regra 'percentual': todos > 0 e a soma deve ser
 * 100% (tolerância de 0,5 para fechar arredondamentos). Devolve mensagem de
 * erro pronta para UI, ou `null` quando válido.
 */
export function validarPercentuais(
  moradores: { id: string }[],
  percentuais: Record<string, number>,
): string | null {
  const ativos = moradores
    .map((m) => percentuais[m.id] || 0)
    .filter((p) => p > 0)
  if (ativos.length === 0) return 'Informe os percentuais de cada morador.'
  const soma = ativos.reduce((a, b) => a + b, 0)
  if (Math.abs(soma - 100) > 0.5) {
    return `Percentuais somam ${soma}% — revise para 100%`
  }
  return null
}

/**
 * Distribui `valorCentavos` pelos moradores de forma que a soma exata dos
 * rateios seja igual ao valor da despesa. Cada rateio é arredondado a 2 casas;
 * a diferença residual vai para o primeiro morador da lista (regra adotada).
 */
export function calcularRateio(
  valor: number,
  moradores: MoradorRateio[],
  config: ConfigRateio,
): ItemRateio[] {
  if (valor <= 0 || moradores.length === 0) return []
  const totalCentavos = paraCentavos(valor)

  let alvos: MoradorRateio[]
  switch (config.regra) {
    case 'consumo': {
      const ids = new Set(config.incluidos ?? [])
      alvos = moradores.filter((m) => ids.has(m.user_id))
      break
    }
    case 'percentual': {
      alvos = moradores
      break
    }
    case 'igual':
      alvos = moradores
      break
  }

  if (alvos.length === 0) return []

  const deConsumo = config.regra === 'consumo' && (!!config.pesos || !!config.percentuais)
  const pesos = alvos.map((m) => {
    if (deConsumo) {
      const p = config.pesos?.[m.user_id] ?? config.percentuais?.[m.user_id] ?? 0
      if (p <= 0) return 0
      return p
    }
    if (config.regra === 'percentual') {
      const p = config.percentuais?.[m.user_id] ?? 0
      if (p <= 0) return 0
      return p / 100
    }
    return 1 / alvos.length
  })

  const somaPesos = pesos.reduce((a, b) => a + b, 0)
  if (somaPesos <= 0) return []

  const bruto = alvos.map((m, i) => ({
    morador_id: m.user_id,
    bruto: Math.round((totalCentavos * pesos[i]) / somaPesos),
  }))

  const somaBruto = bruto.reduce((a, b) => a + b.bruto, 0)
  const resto = totalCentavos - somaBruto
  const primeiroIdx = bruto.findIndex((b) => b.bruto > 0)
  const destino = primeiroIdx >= 0 ? primeiroIdx : 0

  return bruto.map((b, i) => ({
    morador_id: b.morador_id,
    valor_rateado: (b.bruto + (i === destino ? resto : 0)) / 100,
  }))
}