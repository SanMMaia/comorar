import { describe, expect, it } from 'vitest'
import { inferirCategoriaDoTexto } from './categorias'

describe('inferirCategoriaDoTexto', () => {
  it('reconhece ENEL como luz', () => {
    expect(
      inferirCategoriaDoTexto('ENEL Distribuição Rio\nConta de energia\nVencimento 10/09/2026'),
    ).toBe('luz')
  })

  it('reconhece COELBA mesmo com acentos/variação', () => {
    expect(inferirCategoriaDoTexto('Coélba — energia elétrica')).toBe('luz')
  })

  it('reconhece aluguel via imobiliária', () => {
    expect(inferirCategoriaDoTexto('Imobiliária Centro Prime\nPagamento de aluguel')).toBe('aluguel')
  })

  it('reconhece mercado pelo fornecedor', () => {
    expect(inferirCategoriaDoTexto('PÃO DE AÇÚCAR Supermercado\nTotal 123,45')).toBe('mercado')
  })

  it('reconhece copasa como agua', () => {
    expect(inferirCategoriaDoTexto('Companhia de Saneamento — COPASA\nFatura de água')).toBe('agua')
  })

  it('reconhece internet por fibra', () => {
    expect(inferirCategoriaDoTexto('Provedor fibra óptica Vivo Fibra')).toBe('internet')
  })

  it('retorna undefined para texto sem pista', () => {
    expect(inferirCategoriaDoTexto('Nota fiscal numero 1234\nTotal 50,00')).toBeUndefined()
  })

  it('aluguel tem prioridade sobre mercado pela ordem', () => {
    const texto = 'Locação de imobiliária no Mercado Central'
    expect(inferirCategoriaDoTexto(texto)).toBe('aluguel')
  })
})