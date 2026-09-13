import { describe, expect, it } from 'vitest'
import { dataVencimento, gerarDatasPrevisao, gerarPrevistas, isMesmoDia } from './recorrencia'
import type { Recorrencia } from '../types'

function iso(d: Date): string {
  return d.toISOString().slice(0, 10)
}

const base: Recorrencia = {
  id: 'r1',
  casa_id: 'c1',
  fornecedor: 'Enel',
  descricao: null,
  categoria: 'luz',
  valor_previsto: 182.5,
  data_inicio: '2026-01-10',
  dia_vencimento: 10,
  intervalo: 'mensal',
  tipo_rateio: 'igual',
  pagador_padrao: null,
  rotativo: false,
  ativa: true,
  criado_em: '2026-01-01T00:00:00Z',
}

describe('dataVencimento', () => {
  it('dia 31 sempre é pego do mês (meses de 30/28 dias)', () => {
    expect(iso(dataVencimento(31, 2026, 2))).toBe('2026-02-28')
    expect(iso(dataVencimento(31, 2026, 4))).toBe('2026-04-30')
    expect(iso(dataVencimento(31, 2024, 2))).toBe('2024-02-29')
  })
  it('dia normal é mantido', () => {
    expect(iso(dataVencimento(10, 2026, 3))).toBe('2026-03-10')
  })
})

describe('gerarDatasPrevisao — mensal', () => {
  it('gera os meses seguintes respeitando o dia', () => {
    const datas = gerarDatasPrevisao(base, new Date('2026-03-31T00:00:00Z'))
    expect(datas.map(iso)).toEqual(['2026-01-10', '2026-02-10', '2026-03-10'])
  })
  it('não gera datas antes de data_inicio', () => {
    const datas = gerarDatasPrevisao(
      { ...base, data_inicio: '2026-02-15' },
      new Date('2026-04-30T00:00:00Z'),
    )
    // vencimento é dia 10; o primeiro vencimento válido após 15/fev é 10/mar
    expect(datas.map(iso)).toEqual(['2026-03-10', '2026-04-10'])
  })
  it('dia 31 cai no último dia em meses curtos', () => {
    const rec = { ...base, dia_vencimento: 31, data_inicio: '2026-01-31' }
    const datas = gerarDatasPrevisao(rec, new Date('2026-04-30T00:00:00Z'))
    expect(datas.map(iso)).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30'])
  })
  it('ano bissexto respeita 29 de fevereiro', () => {
    const rec = { ...base, dia_vencimento: 29, data_inicio: '2024-02-29' }
    const datas = gerarDatasPrevisao(rec, new Date('2025-02-28T00:00:00Z'))
    // 2025 não tem 29/fev → cai no dia 28
    expect(datas.map(iso)).toEqual(['2024-02-29', '2024-03-29', '2024-04-29', '2024-05-29', '2024-06-29', '2024-07-29', '2024-08-29', '2024-09-29', '2024-10-29', '2024-11-29', '2024-12-29', '2025-01-29', '2025-02-28'])
  })
})

describe('gerarDatasPrevisao — semanal/quinzenal/anual', () => {
  it('semanal: 7 em 7 dias do data_inicio', () => {
    const rec = { ...base, intervalo: 'semanal' as const, data_inicio: '2026-01-05' }
    const datas = gerarDatasPrevisao(rec, new Date('2026-01-19T00:00:00Z'))
    expect(datas.map(iso)).toEqual(['2026-01-05', '2026-01-12', '2026-01-19'])
  })
  it('quinzenal: 14 em 14 dias', () => {
    const rec = { ...base, intervalo: 'quinzenal' as const, data_inicio: '2026-01-05' }
    const datas = gerarDatasPrevisao(rec, new Date('2026-02-02T00:00:00Z'))
    expect(datas.map(iso)).toEqual(['2026-01-05', '2026-01-19', '2026-02-02'])
  })
  it('anual: mantém dia e mês da data_inicio', () => {
    const rec = { ...base, intervalo: 'anual' as const, data_inicio: '2026-03-15' }
    const datas = gerarDatasPrevisao(rec, new Date('2028-03-15T00:00:00Z'))
    expect(datas.map(iso)).toEqual(['2026-03-15', '2027-03-15', '2028-03-15'])
  })
  it('isMesmoDia compara datas por dia', () => {
    expect(isMesmoDia(new Date('2026-01-10T00:00:00Z'), new Date('2026-01-10T23:59:59Z'))).toBe(true)
    expect(isMesmoDia(new Date('2026-01-10T00:00:00Z'), new Date('2026-01-11T00:00:00Z'))).toBe(false)
  })
})

describe('gerarPrevistas', () => {
  it('produz um lançamento previsto com os dados da recorrência', () => {
    const prev = gerarPrevistas(base, new Date('2026-02-10T00:00:00Z'))
    expect(prev).toHaveLength(2)
    expect(prev[1]).toMatchObject({
      fornecedor: 'Enel',
      valor_previsto: 182.5,
      categoria: 'luz',
    })
  })
})