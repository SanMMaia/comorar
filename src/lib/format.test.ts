import { describe, expect, it } from 'vitest'
import { dataBR, estaAtrasada, hojeData } from './format'

describe('dataBR', () => {
  it('não desloca o dia para o fuso local (15 vira 15, não 14)', () => {
    expect(dataBR('2026-04-15')).toBe('15/04/2026')
    expect(dataBR('2026-03-01')).toBe('01/03/2026')
    expect(dataBR('2026-12-31')).toBe('31/12/2026')
  })
  it('aceita Date também', () => {
    expect(dataBR(new Date(2026, 3, 15, 12, 0, 0))).toBe('15/04/2026')
  })
})

describe('estaAtrasada', () => {
  it('considera vencido apenas o que passou do dia de hoje', () => {
    expect(estaAtrasada('2026-09-13', '2026-09-14')).toBe(true)
    expect(estaAtrasada('2026-09-14', '2026-09-14')).toBe(false)
    expect(estaAtrasada('2026-09-15', '2026-09-14')).toBe(false)
  })
  it('hojeData está no formato YYYY-MM-DD', () => {
    expect(hojeData()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})