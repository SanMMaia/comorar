import { createWorker } from 'tesseract.js'
import type { ResultadoOCR } from './ocr'

export type ResultadoLeituraLocal =
  | { ok: true; dados: ResultadoOCR }
  | { ok: false; mensagem: string }

let workerPromise: Promise<Awaited<ReturnType<typeof createWorker>>> | null = null

async function getWorker() {
  if (!workerPromise) {
    setOcrCarregando(true)
    workerPromise = createWorker('por').finally(() => setOcrCarregando(false))
  }
  return workerPromise
}

let aoMudarCarregamento: ((carregando: boolean) => void) | null = null
function setOcrCarregando(b: boolean) {
  aoMudarCarregamento?.(b)
}
/** Avisa quando o núcleo do OCR (wasm + português) está sendo baixado/inicializado. */
export function onOcrCarregamento(cb: ((carregando: boolean) => void) | null) {
  aoMudarCarregamento = cb
}

function podeAcharNumero(s: string): number | null {
  const limpo = s.replace(/\s+/g, '')
  const m = limpo.match(/^(\d{1,3}(?:\.\d{3})*),(\d{2})$/)
  if (m) return Number(m[1].replace(/\./g, '')) + Number(m[2]) / 100
  const m2 = limpo.match(/^(\d+),(\d+)$/)
  if (m2) return Number(m2[1]) + Number('0.' + m2[2])
  return null
}

function extrairDoTexto(texto: string): ResultadoOCR {
  const dados: ResultadoOCR = {}
  const linhas = texto
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)

  for (const l of linhas) {
    const m = l.match(/(?:cedente|benefici[aá]rio)\s*[:.]?\s*([^|]+)/i)
    if (m && m[1].trim()) {
      dados.fornecedor = m[1].trim().slice(0, 80)
      break
    }
  }

  let achouValor = false
  for (const l of linhas) {
    if (/(valor do (?:documento|boleto)|\(=\s*\)\s*valor|total)/i.test(l)) {
      const candidatos = l.match(/\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2}|\d+/g) ?? []
      for (let i = candidatos.length - 1; i >= 0; i--) {
        const n = podeAcharNumero(candidatos[i])
        if (n && n > 0) {
          dados.valor = Math.round(n * 100) / 100
          achouValor = true
          break
        }
      }
      if (achouValor) break
    }
  }
  if (!achouValor) {
    let melhor = 0
    for (const l of linhas) {
      const cands = l.match(/\d{1,3}(?:\.\d{3})*,\d{2}/g) ?? []
      for (const c of cands) {
        const n = podeAcharNumero(c)
        if (n && n > melhor && n < 1_000_000) melhor = n
      }
    }
    if (melhor > 0) dados.valor = Math.round(melhor * 100) / 100
  }

  for (const l of linhas) {
    if (/vencimen/i.test(l)) {
      const m = l.match(/(\d{1,2})[/\-.]+(\d{1,2})[/\-.](\d{2,4})/)
      if (m) {
        let ano = Number(m[3])
        if (ano < 100) ano += 2000
        const mes = Number(m[2])
        const dia = Number(m[1])
        const d = new Date(ano, mes - 1, dia)
        if (d.getFullYear() === ano && d.getMonth() === mes - 1 && d.getDate() === dia) {
          dados.data = `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
        }
      }
      break
    }
  }

  return dados
}

/**
 * OCR 100% no navegador (Tesseract.js + português) para ler o boleto.
 * Extrai fornecedor, valor e vencimento do texto reconhecido.
 */
export async function lerBoletoLocal(arquivo: File): Promise<ResultadoLeituraLocal> {
  const url = URL.createObjectURL(arquivo)
  try {
    const worker = await getWorker()
    const { data } = await worker.recognize(url)
    const dados = extrairDoTexto(data.text)
    if (Object.keys(dados).length === 0) {
      return { ok: false, mensagem: 'Não consegui ler o texto do boleto — preencha manualmente.' }
    }
    return { ok: true, dados }
  } catch (err) {
    console.error('OCR local falhou:', err)
    return { ok: false, mensagem: 'Erro ao processar a imagem — tente novamente ou preencha manualmente.' }
  } finally {
    URL.revokeObjectURL(url)
  }
}