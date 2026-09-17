export interface Obrigacao {
  devedor_id: string
  credor_id: string
  valor: number
}

/**
 * Balanço líquido por pessoa a partir dos rateios não pagos.
 * retorna saldo por user_id (positivo = a receber, negativo = deve).
 */
export function saldosPorPessoa(obrigacoes: Obrigacao[]): Record<string, number> {
  const saldo: Record<string, number> = {}
  for (const o of obrigacoes) {
    saldo[o.devedor_id] = (saldo[o.devedor_id] ?? 0) - o.valor
    saldo[o.credor_id] = (saldo[o.credor_id] ?? 0) + o.valor
  }
  return saldo
}

export interface PrevisaoAcerto {
  rateio_id: string
  despesa_id: string
  morador_id: string
  valor_rateado: number
}

export interface PlanoAcerto {
  quitar: { rateio_id: string }[]
  dividir: {
    rateio_id: string
    despesa_id: string
    morador_id: string
    valor_pago: number
    valor_restante: number
  } | null
}

/**
 * Planeja o acerto de um valor entre duas pessoas sobre os rateios pendentes
 * do par. Quita rateios inteiros dos menores para os maiores; se o valor não
 * fechar exato, o próximo rateio é "dividido" (parte paga + parte ainda devida).
 * `valor` é limitado ao total pendente do par.
 */
export function planejarAcerto(pendentes: PrevisaoAcerto[], valor: number): PlanoAcerto {
  const total = pendentes.reduce((a, b) => a + b.valor_rateado, 0)
  let restante = Math.min(valor, total)
  const lista = [...pendentes].sort(
    (a, b) => a.valor_rateado - b.valor_rateado || a.rateio_id.localeCompare(b.rateio_id),
  )
  const quitar: { rateio_id: string }[] = []
  let dividir: PlanoAcerto['dividir'] = null

  for (const p of lista) {
    if (restante <= 0.005) break
    if (p.valor_rateado <= restante + 0.005) {
      quitar.push({ rateio_id: p.rateio_id })
      restante -= p.valor_rateado
    } else {
      dividir = {
        rateio_id: p.rateio_id,
        despesa_id: p.despesa_id,
        morador_id: p.morador_id,
        valor_pago: Math.round(restante * 100) / 100,
        valor_restante: Math.round((p.valor_rateado - restante) * 100) / 100,
      }
      restante = 0
      break
    }
  }
  return { quitar, dividir }
}

/**
 * Dada a lista `devedor deve credor`, reduz ao número mínimo de transferências
 * usando o algoritmo guloso: a cada passo, o maior credor paga o maior devedor.
 */
export function compactarTransferencias(obrigacoes: Obrigacao[]): Obrigacao[] {
  const saldo = saldosPorPessoa(obrigacoes)
  const credores = Object.entries(saldo)
    .filter(([, v]) => v > 0.005)
    .sort((a, b) => b[1] - a[1])
  const devedores = Object.entries(saldo)
    .filter(([, v]) => v < -0.005)
    .sort((a, b) => a[1] - b[1])

  const resultado: Obrigacao[] = []
  let i = 0
  let j = 0
  while (i < credores.length && j < devedores.length) {
    const [credorId, credorSaldo] = credores[i]
    const [devedorId, devedorSaldo] = devedores[j]
    const valor = Math.min(credorSaldo, -devedorSaldo)
    resultado.push({ devedor_id: devedorId, credor_id: credorId, valor: Math.round(valor * 100) / 100 })
    credores[i][1] -= valor
    devedores[j][1] += valor
    if (credores[i][1] < 0.005) i++
    if (devedores[j][1] > -0.005) j++
  }
  return resultado.filter((r) => r.valor > 0)
}