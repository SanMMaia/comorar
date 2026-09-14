import { describe, expect, it } from 'vitest'
import {
  CATEGORIAS_PADRAO,
  categoriasEfetivas,
  labelCategoria,
  slugCategoria,
} from './categorias'
import type { CategoriaItem } from '../types'

describe('categoriasEfetivas', () => {
  it('usa as padrão quando não há lista custom', () => {
    expect(categoriasEfetivas(null)).toEqual(CATEGORIAS_PADRAO)
    expect(categoriasEfetivas(undefined)).toEqual(CATEGORIAS_PADRAO)
  })

  it('desconsidera valores inválidos e cai nas padrão', () => {
    const lixo = [{ id: 'x' }, null, { id: 1, label: 'y' }] as unknown as CategoriaItem[]
    expect(categoriasEfetivas(lixo)).toEqual(CATEGORIAS_PADRAO)
  })

  it('remove duplicados mantendo a primeira ocorrência', () => {
    const custom = [
      { id: 'luz', label: 'Energia' },
      { id: 'luz', label: 'Luz' },
    ]
    expect(categoriasEfetivas(custom)).toEqual([{ id: 'luz', label: 'Energia' }])
  })

  it('mantém a ordem da lista da casa', () => {
    const custom = [
      { id: 'outro', label: 'Outros' },
      { id: 'mercado', label: 'Compras' },
    ]
    expect(categoriasEfetivas(custom)).toEqual(custom)
  })
})

describe('labelCategoria', () => {
  it('usa o label personalizado da casa', () => {
    expect(labelCategoria('mercado', [{ id: 'mercado', label: 'Compras' }])).toBe('Compras')
  })

  it('cai no label padrão quando a categoria foi removida da casa', () => {
    expect(labelCategoria('aluguel', [{ id: 'outro', label: 'Outros' }])).toBe('Aluguel')
  })

  it('formata ids desconhecidos', () => {
    expect(labelCategoria('condominio', null)).toBe('Condominio')
    expect(labelCategoria('transporte-urbano', null)).toBe('Transporte Urbano')
  })
})

describe('slugCategoria', () => {
  it('gera slug sem acentos', () => {
    expect(slugCategoria('Condomínio')).toBe('condominio')
  })

  it('substitui espaços e símbolos por hífen', () => {
    expect(slugCategoria('Transporte Urbano')).toBe('transporte-urbano')
    expect(slugCategoria('  Pet&Shop  ')).toBe('pet-shop')
  })
})