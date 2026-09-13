import { describe, expect, it } from 'vitest'
import { calcularRateio, type ConfigRateio } from './rateio'

const moradores = [
  { user_id: 'a' },
  { user_id: 'b' },
  { user_id: 'c' },
]

function soma(itens: { valor_rateado: number }[]): number {
  return Math.round(itens.reduce((a, b) => a + b.valor_rateado, 0) * 100) / 100
}

describe('calcularRateio — igual', () => {
  it('divide igualmente', () => {
    const r = calcularRateio(300, moradores, { regra: 'igual' })
    expect(r).toHaveLength(3)
    expect(r.map((i) => i.valor_rateado)).toEqual([100, 100, 100])
  })

  it('a soma é exatamente o valor mesmo com divisão não exata', () => {
    const r = calcularRateio(99.99, moradores, { regra: 'igual' })
    expect(soma(r)).toBe(99.99)
  })

  it('um centavo de resto vai para o primeiro', () => {
    const r = calcularRateio(10, [
      { user_id: 'a' },
      { user_id: 'b' },
      { user_id: 'c' },
    ], { regra: 'igual' })
    expect(r.map((i) => i.valor_rateado)).toEqual([3.34, 3.33, 3.33])
    expect(soma(r)).toBe(10)
  })
})

describe('calcularRateio — percentual', () => {
  it('aplica o percentual de cada um', () => {
    const config: ConfigRateio = {
      regra: 'percentual',
      percentuais: { a: 50, b: 30, c: 20 },
    }
    const r = calcularRateio(100, moradores, config)
    expect(r.map((i) => i.valor_rateado)).toEqual([50, 30, 20])
  })

  it('soma exata mesmo com dízima', () => {
    const config: ConfigRateio = {
      regra: 'percentual',
      percentuais: { a: 33.33, b: 33.33, c: 33.34 },
    }
    const r = calcularRateio(1000, moradores, config)
    expect(soma(r)).toBe(1000)
  })
})

describe('calcularRateio — consumo', () => {
  it('divide apenas entre os incluídos', () => {
    const r = calcularRateio(90, moradores, { regra: 'consumo', incluidos: ['a', 'b'] })
    expect(r.map((i) => i.morador_id)).toEqual(['a', 'b'])
    expect(r.map((i) => i.valor_rateado)).toEqual([45, 45])
  })

  it('retorna vazio se ninguém está incluído', () => {
    const r = calcularRateio(90, moradores, { regra: 'consumo', incluidos: [] })
    expect(r).toEqual([])
  })

  it('respeita percentuais quando fornecidos', () => {
    const r = calcularRateio(90, moradores, {
      regra: 'consumo',
      incluidos: ['a', 'b'],
      percentuais: { a: 60, b: 40 },
    })
    expect(r.map((i) => i.valor_rateado)).toEqual([54, 36])
  })
})

describe('calcularRateio — casos de borda', () => {
  it('valor zero retorna vazio', () => {
    expect(calcularRateio(0, moradores, { regra: 'igual' })).toEqual([])
  })
  it('sem moradores retorna vazio', () => {
    expect(calcularRateio(10, [], { regra: 'igual' })).toEqual([])
  })
  it('sem pesos válidos retorna vazio', () => {
    expect(calcularRateio(10, moradores, { regra: 'percentual', percentuais: {} })).toEqual([])
  })
})