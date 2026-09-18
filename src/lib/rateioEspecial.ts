import type { ItemRateio } from './rateio'
import { calcularRateio } from './rateio'

export interface ItemMercadoInput {
  descricao: string
  valor: number
  /** casa_morador.id[] dos donos; vazio = item comum (todos). */
  donos: string[]
}

/**
 * Rateio de compra de mercado: o valor de cada item é dividido entre os donos
 * (item sem dono = dividido entre todos). A soma por morador vira o peso do
 * rateio; o respingo de centavos é absorvido pelo próprio `calcularRateio`.
 */
export function rateioMercado(
  itens: ItemMercadoInput[],
  moradores: { id: string }[],
): ItemRateio[] {
  const centavos: Record<string, number> = {}
  for (const it of itens) {
    const donos = it.donos.length > 0 ? it.donos : moradores.map((m) => m.id)
    const alvo = new Set(donos)
    const participantes = moradores.map((m) => m.id).filter((id) => alvo.has(id))
    if (participantes.length === 0) continue
    const totalCent = Math.round(it.valor * 100)
    const base = Math.floor(totalCent / participantes.length)
    const resto = totalCent - base * participantes.length
    participantes.forEach((id, i) => {
      centavos[id] = (centavos[id] ?? 0) + base + (i < resto ? 1 : 0)
    })
  }
  const ids = Object.keys(centavos).filter((id) => centavos[id] > 0)
  if (ids.length === 0) {
    return calcularRateio(
      itens.reduce((a, b) => a + b.valor, 0),
      moradores.map((m) => ({ user_id: m.id })),
      { regra: 'igual' },
    )
  }
  const total = itens.reduce((a, b) => a + b.valor, 0)
  const percentuais: Record<string, number> = {}
  for (const id of ids) percentuais[id] = (centavos[id] / 100 / total) * 100
  return calcularRateio(total, moradores.map((m) => ({ user_id: m.id })), {
    regra: 'consumo',
    incluidos: ids,
    percentuais,
  })
}

export interface LeituraInput {
  morador_id: string
  /** consumo numérico (leitura atual − anterior) ou null quando não informado. */
  peso: number | null
}

/**
 * Rateio de conta por leitura de medidor: cada morador paga na proporção do
 * consumo informado; quem não informou cai na média dos demais. Se ninguém
 * informou, divide igual.
 */
export function dividirPorMedidor(
  leituras: LeituraInput[],
  total: number,
): ItemRateio[] {
  const informadas = leituras.filter((l) => l.peso != null && l.peso >= 0)
  if (informadas.length === 0) {
    return calcularRateio(total, leituras.map((l) => ({ user_id: l.morador_id })), {
      regra: 'igual',
    })
  }
  const media =
    informadas.reduce((a, l) => a + (l.peso as number), 0) / informadas.length
  const percentuais: Record<string, number> = {}
  for (const l of leituras) {
    const peso = l.peso != null && l.peso >= 0 ? l.peso : media
    if (peso <= 0) continue
    percentuais[l.morador_id] = peso
  }
  const participantes = Object.keys(percentuais)
  if (participantes.length === 0) {
    return calcularRateio(total, leituras.map((l) => ({ user_id: l.morador_id })), {
      regra: 'igual',
    })
  }
  return calcularRateio(
    total,
    leituras.map((l) => ({ user_id: l.morador_id })),
    { regra: 'consumo', incluidos: participantes, percentuais },
  )
}