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