import { describe, expect, it } from 'vitest'
import { compactarTransferencias, planejarAcerto, saldosPorPessoa, type Obrigacao, type PrevisaoAcerto } from './balanco'

describe('saldosPorPessoa', () => {
  it('soma créditos e débitos', () => {
    const obrigacoes: Obrigacao[] = [
      { devedor_id: 'b', credor_id: 'a', valor: 100 },
      { devedor_id: 'c', credor_id: 'a', valor: 50 },
      { devedor_id: 'c', credor_id: 'b', valor: 30 },
    ]
    expect(saldosPorPessoa(obrigacoes)).toEqual({ a: 150, b: -70, c: -80 })
  })
})

describe('compactarTransferencias', () => {
  it('reduz o número de transferências', () => {
    // a deve 50 (de b), b deve 100 (de a)... na prática:
    const obrigacoes: Obrigacao[] = [
      { devedor_id: 'b', credor_id: 'a', valor: 30 },
      { devedor_id: 'c', credor_id: 'a', valor: 100 },
      { devedor_id: 'c', credor_id: 'b', valor: 20 },
    ]
    const compacto = compactarTransferencias(obrigacoes)
    // saldos: a=+130, b=-10, c=-120 → c→a 120 e b→a 10 (2 transferências)
    expect(compacto).toHaveLength(2)
    expect(compacto).toEqual([
      { devedor_id: 'c', credor_id: 'a', valor: 120 },
      { devedor_id: 'b', credor_id: 'a', valor: 10 },
    ])
  })

  it('nenhuma transferência quando não há dívida', () => {
    expect(compactarTransferencias([])).toEqual([])
  })

  it('soma das transferências preserva os saldos', () => {
    const obrigacoes: Obrigacao[] = [
      { devedor_id: 'b', credor_id: 'a', valor: 33.33 },
      { devedor_id: 'c', credor_id: 'a', valor: 33.33 },
      { devedor_id: 'b', credor_id: 'c', valor: 11.11 },
    ]
    const antes = saldosPorPessoa(obrigacoes)
    const compacto = compactarTransferencias(obrigacoes)
    const depois = saldosPorPessoa(compacto)
    for (const id of Object.keys(antes)) {
      expect(depois[id]).toBeCloseTo(antes[id], 2)
    }
  })
})

describe('planejarAcerto', () => {
  const pendentes: PrevisaoAcerto[] = [
    { rateio_id: 'r1', despesa_id: 'd1', morador_id: 'b', valor_rateado: 30 },
    { rateio_id: 'r2', despesa_id: 'd2', morador_id: 'b', valor_rateado: 100 },
  ]

  it('quita rateios inteiros quando o valor fecha', () => {
    const plano = planejarAcerto(pendentes, 30)
    expect(plano.quitar).toEqual([{ rateio_id: 'r1' }])
    expect(plano.dividir).toBeNull()
  })

  it('divide o último rateio quando o valor não fecha exato', () => {
    const plano = planejarAcerto(pendentes, 45)
    expect(plano.quitar).toEqual([{ rateio_id: 'r1' }])
    expect(plano.dividir).toEqual({
      rateio_id: 'r2',
      despesa_id: 'd2',
      morador_id: 'b',
      valor_pago: 15,
      valor_restante: 85,
    })
  })

  it('quita tudo quando o valor cobre a dívida do par', () => {
    const plano = planejarAcerto(pendentes, 500)
    expect(plano.quitar).toEqual([{ rateio_id: 'r1' }, { rateio_id: 'r2' }])
    expect(plano.dividir).toBeNull()
  })

  it('nada a fazer quando não há pendentes', () => {
    const plano = planejarAcerto([], 10)
    expect(plano.quitar).toEqual([])
    expect(plano.dividir).toBeNull()
  })
})