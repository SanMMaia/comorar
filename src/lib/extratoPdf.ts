import type { CategoriaItem, MoradorCompleto } from '../types'
import type { DespesaComRateios } from './dados'
import { formatBR, dataBR } from './format'
import { labelCategoria } from './categorias'

export interface ExtratoOpts {
  casaNome: string
  mesLabel: string
  mesChave: string
  souOwner: boolean
  despesas: DespesaComRateios[]
  moradores: MoradorCompleto[]
  minhaMoradorId: string | null
  categorias: CategoriaItem[] | null
}

const MARGEM = 14
const LARGURA = 210
const DIREITA = LARGURA - MARGEM

/** jsPDF usa Helvetica (WinAnsi): troca espaços especiais que quebrariam o texto. */
function limpar(texto: string): string {
  return texto.replace(/\u00a0/g, ' ').replace(/[\u2013\u2014]/g, '-')
}

function nomeDe(moradores: MoradorCompleto[], id: string | null): string {
  if (!id) return '-'
  return moradores.find((m) => m.id === id)?.nome ?? '-'
}

export async function gerarExtratoPdf(opts: ExtratoOpts) {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })

  const doMes = opts.despesas
    .filter((d) => d.status !== 'cancelada' && d.data.slice(0, 7) === opts.mesChave)
    .sort((a, b) => a.data.localeCompare(b.data))

  const confirmadas = doMes.filter((d) => d.status === 'confirmada')
  const previstas = doMes.filter((d) => d.status === 'prevista')

  const total = opts.souOwner
    ? confirmadas.reduce((a, b) => a + b.valor, 0)
    : confirmadas.reduce((a, b) => {
        const meu = b.rateios.find((r) => r.morador_id === opts.minhaMoradorId)
        return a + (meu?.valor_rateado ?? 0)
      }, 0)
  const totalPrevisto = opts.souOwner
    ? previstas.reduce((a, b) => a + b.valor, 0)
    : previstas.reduce((a, b) => {
        const meu = b.rateios.find((r) => r.morador_id === opts.minhaMoradorId)
        return a + (meu?.valor_rateado ?? 0)
      }, 0)
  const pendentes = opts.souOwner
    ? confirmadas.reduce((a, d) => a + d.rateios.filter((r) => !r.pago).length, 0)
    : confirmadas.filter(
        (d) => d.rateios.find((r) => r.morador_id === opts.minhaMoradorId && !r.pago),
      ).length

  let y = MARGEM

  const novaPaginaSePreciso = (altura = 8) => {
    if (y + altura > 285) {
      doc.addPage()
      y = MARGEM
    }
  }

  const linha = (
    esquerda: string,
    direita: string,
    tamanho = 10,
    cor: [number, number, number] = [30, 30, 30],
  ) => {
    novaPaginaSePreciso()
    doc.setFontSize(tamanho)
    doc.setTextColor(...cor)
    doc.text(limpar(esquerda), MARGEM, y)
    if (direita) doc.text(limpar(direita), DIREITA, y, { align: 'right' })
    y += tamanho * 0.55 + 2
  }

  // cabeçalho
  doc.setFontSize(18)
  doc.setTextColor(20, 20, 20)
  doc.text('Comorar', MARGEM, y)
  y += 7
  doc.setFontSize(12)
  doc.setTextColor(90, 90, 90)
  doc.text(limpar(`Extrato mensal · ${opts.mesLabel}`), MARGEM, y)
  y += 6
  doc.setFontSize(11)
  doc.text(limpar(opts.casaNome), MARGEM, y)
  y += 8

  doc.setDrawColor(220, 220, 220)
  doc.line(MARGEM, y, DIREITA, y)
  y += 8

  // resumo
  doc.setFontSize(12)
  doc.setTextColor(20, 20, 20)
  doc.text(opts.souOwner ? 'Resumo da casa' : 'Seu resumo', MARGEM, y)
  y += 7
  linha(opts.souOwner ? 'Gasto confirmado' : 'Sua parte no mês', formatBR(total), 11)
  linha('Previstos no mês', formatBR(totalPrevisto), 11)
  linha(
    opts.souOwner ? 'Rateios pendentes' : 'Suas pendências',
    String(pendentes),
    11,
  )
  y += 4

  // despesas
  doc.setFontSize(12)
  doc.setTextColor(20, 20, 20)
  doc.text('Contas', MARGEM, y)
  y += 7

  doc.setFontSize(9)
  doc.setTextColor(120, 120, 120)
  doc.text('Data', MARGEM, y)
  doc.text('Fornecedor', MARGEM + 22, y)
  doc.text('Situação', DIREITA - 42, y)
  doc.text('Valor', DIREITA, y, { align: 'right' })
  y += 2
  doc.setDrawColor(230, 230, 230)
  doc.line(MARGEM, y, DIREITA, y)
  y += 5

  if (doMes.length === 0) {
    linha('Nenhuma conta neste mês.', '', 10, [120, 120, 120])
  }

  for (const d of doMes) {
    novaPaginaSePreciso(10)
    const meu = d.rateios.find((r) => r.morador_id === opts.minhaMoradorId)
    const valor = opts.souOwner ? d.valor : (meu?.valor_rateado ?? 0)
    const situacao =
      d.status === 'prevista'
        ? 'A vencer'
        : meu
          ? meu.pago
            ? 'Paga'
            : 'Pendente'
          : 'Confirmada'

    doc.setFontSize(9)
    doc.setTextColor(30, 30, 30)
    doc.text(dataBR(d.data), MARGEM, y)
    const fornecedor = `${d.fornecedor} · ${labelCategoria(d.categoria, opts.categorias)}`
    doc.text(limpar(fornecedor).slice(0, 44), MARGEM + 22, y)
    doc.setTextColor(120, 120, 120)
    doc.text(situacao, DIREITA - 42, y)
    doc.setTextColor(30, 30, 30)
    doc.text(formatBR(valor).replace(/\u00a0/g, ' '), DIREITA, y, { align: 'right' })
    y += 5.5

    if (opts.souOwner && d.status === 'confirmada' && d.rateios.some((r) => !r.pago)) {
      novaPaginaSePreciso(5)
      const aberto = d.rateios
        .filter((r) => !r.pago)
        .map((r) => `${nomeDe(opts.moradores, r.morador_id)} ${formatBR(r.valor_rateado)}`)
        .join('  ·  ')
      doc.setFontSize(8)
      doc.setTextColor(150, 100, 20)
      doc.text(limpar(`Pendente: ${aberto}`).slice(0, 120), MARGEM + 22, y)
      y += 5
    }
  }

  y += 4
  doc.setDrawColor(220, 220, 220)
  doc.line(MARGEM, y, DIREITA, y)
  y += 6
  doc.setFontSize(8)
  doc.setTextColor(150, 150, 150)
  doc.text(
    limpar(`Gerado em ${new Date().toLocaleString('pt-BR')} · comorar.vercel.app`),
    MARGEM,
    y,
  )

  const nome = opts.casaNome.normalize('NFD').replace(/[^\w]+/g, '-').toLowerCase()
  doc.save(`comorar-extrato-${nome}-${opts.mesChave}.pdf`)
}
