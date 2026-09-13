import type { TipoRateio } from '../types'

export interface MoradorRateio {
  user_id: string
  percentual?: number
}

export interface ConfigRateio {
  regra: TipoRateio
  /** user_id -> percentual (0-100). Usado em 'percentual' e opcional em 'consumo'. */
  percentuais?: Record<string, number>
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

  const pesos = alvos.map((m) => {
    if (config.regra === 'percentual' || (config.regra === 'consumo' && config.percentuais)) {
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