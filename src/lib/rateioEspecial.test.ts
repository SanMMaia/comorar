import { describe, expect, it } from 'vitest'
import { dividirPorMedidor, rateioMercado } from './rateioEspecial'

const moradores = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]

describe('rateioMercado', () => {
  it('divide item comum entre todos', () => {
    const res = rateioMercado([{ descricao: 'Papel', valor: 30, donos: [] }], moradores)
    expect(res.reduce((a, b) => a + b.valor_rateado, 0)).toBeCloseTo(30, 2)
    expect(res.every((r) => Math.abs(r.valor_rateado - 10) < 0.01)).toBe(true)
  })

  it('divide item com donos restritos só entre eles', () => {
    const res = rateioMercado(
      [{ descricao: 'Café', valor: 20, donos: ['a', 'b'] }],
      moradores,
    )
    const soma = res.reduce((a, b) => a + b.valor_rateado, 0)
    expect(soma).toBeCloseTo(20, 2)
    expect(res.find((r) => r.morador_id === 'c')?.valor_rateado ?? 0).toBe(0)
    expect(res.find((r) => r.morador_id === 'a')?.valor_rateado ?? 0).toBeCloseTo(10, 2)
  })

  it('soma dos itens fecha exato no total', () => {
    const itens = [
      { descricao: 'Café', valor: 12.34, donos: ['a', 'b'] },
      { descricao: 'Papel', valor: 8.66, donos: [] },
    ]
    const res = rateioMercado(itens, moradores)
    const soma = res.reduce((a, b) => a + b.valor_rateado, 0)
    expect(soma).toBeCloseTo(21, 2)
    const totalItens = itens.reduce((a, b) => a + b.valor, 0)
    expect(soma).toBeCloseTo(totalItens, 2)
  })
})

describe('dividirPorMedidor', () => {
  it('sem leituras divide igual', () => {
    const res = dividirPorMedidor([{ morador_id: 'a', peso: null }, { morador_id: 'b', peso: null }], 100)
    expect(res.reduce((a, b) => a + b.valor_rateado, 0)).toBeCloseTo(100, 2)
    expect(res.every((r) => Math.abs(r.valor_rateado - 50) < 0.01)).toBe(true)
  })

  it('proporcional ao consumo informado', () => {
    const res = dividirPorMedidor(
      [{ morador_id: 'a', peso: 1 }, { morador_id: 'b', peso: 3 }],
      40,
    )
    expect(res.find((r) => r.morador_id === 'a')?.valor_rateado ?? 0).toBeCloseTo(10, 2)
    expect(res.find((r) => r.morador_id === 'b')?.valor_rateado ?? 0).toBeCloseTo(30, 2)
  })

  it('quem não informa cai na média dos demais', () => {
    const res = dividirPorMedidor(
      [
        { morador_id: 'a', peso: 2 },
        { morador_id: 'b', peso: 4 },
        { morador_id: 'c', peso: null },
      ],
      90,
    )
    const c = res.find((r) => r.morador_id === 'c')?.valor_rateado ?? 0
    expect(c).toBeCloseTo(30, 0)
  })
})