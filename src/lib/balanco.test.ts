import { describe, expect, it } from 'vitest'
import { compactarTransferencias, saldosPorPessoa, type Obrigacao } from './balanco'

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