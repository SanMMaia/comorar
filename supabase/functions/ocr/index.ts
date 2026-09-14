// Edge Function: OCR de comprovantes via NVIDIA NIM (nemotron-parse)
// Recebe: { path } — caminho do arquivo no bucket 'comprovantes' ({casa_id}/{arquivo})
// Responde: { ok: true, dados: { fornecedor?, valor?, data?, categoria? } } | { ok: false, mensagem }
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const CATEGORIAS = ['aluguel', 'luz', 'agua', 'internet', 'mercado', 'outro'] as const
const MODELOS = ['nvidia/nemotron-parse', 'meta/llama-3.2-90b-vision-instruct']

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function inferirMime(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  switch (ext) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg'
    case 'png':
      return 'image/png'
    case 'webp':
      return 'image/webp'
    case 'heic':
      return 'image/heic'
    default:
      return 'image/jpeg'
  }
}

async function blobParaDataUrl(blob: Blob, mime: string): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer())
  let bin = ''
  const chunk = 0x8000
  for (let i = 0; i < buf.length; i += chunk) {
    bin += String.fromCharCode(...buf.subarray(i, i + chunk))
  }
  return `data:${mime};base64,${btoa(bin)}`
}

const pad = (n: number): string => String(n).padStart(2, '0')

function parseData(s: string): string | null {
  let m: RegExpMatchArray | null

  if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) {
    const ano = Number(m[1])
    const mes = Number(m[2])
    const dia = Number(m[3])
    const d = new Date(ano, mes - 1, dia)
    if (d.getFullYear() === ano && d.getMonth() === mes - 1 && d.getDate() === dia) {
      return `${ano}-${pad(mes)}-${pad(dia)}`
    }
    return null
  }

  if ((m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/))) {
    let ano = Number(m[3])
    if (ano < 100) ano += 2000
    const mes = Number(m[2])
    const dia = Number(m[1])
    const d = new Date(ano, mes - 1, dia)
    if (d.getFullYear() === ano && d.getMonth() === mes - 1 && d.getDate() === dia) {
      return `${ano}-${pad(mes)}-${pad(dia)}`
    }
  }

  return null
}

function normalizar(raw: Record<string, unknown>): Record<string, unknown> {
  const dados: Record<string, unknown> = {}

  if (typeof raw.fornecedor === 'string' && raw.fornecedor.trim()) {
    dados.fornecedor = raw.fornecedor.trim().slice(0, 80)
  }

  const valorStr = String(raw.valor ?? '').replace(/[^\d,.-]/g, '').replace(',', '.')
  const valor = Number(valorStr)
  if (valorStr && Number.isFinite(valor) && valor > 0) {
    dados.valor = Math.round(valor * 100) / 100
  }

  if (typeof raw.data === 'string' && raw.data.trim()) {
    const dt = parseData(raw.data.trim())
    if (dt) dados.data = dt
  }

  const cat = String(raw.categoria ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
  for (const c of CATEGORIAS) {
    if (cat.includes(c)) {
      dados.categoria = c
      break
    }
  }

  return dados
}

function extrairJson(conteudo: string): Record<string, unknown> | null {
  let texto = conteudo.trim()
  const fence = texto.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fence) texto = fence[1].trim()
  const inicio = texto.indexOf('{')
  const fim = texto.lastIndexOf('}')
  if (inicio === -1 || fim === -1 || fim <= inicio) return null
  try {
    const obj = JSON.parse(texto.slice(inicio, fim + 1))
    return obj && typeof obj === 'object' ? (obj as Record<string, unknown>) : null
  } catch {
    return null
  }
}

async function chamarNim(
  chave: string,
  modelo: string,
  dataUrl: string,
): Promise<{ ok: true; conteudo: string } | { ok: false; cota?: boolean }> {
  const prompt = `Você é um extrator de dados de comprovantes de despesas (recibos, notas fiscais, faturas, boletos).
Responda APENAS com um JSON válido, sem markdown nem texto extra, no formato:
{"fornecedor": "nome do estabelecimento", "valor": numero, "data": "YYYY-MM-DD", "categoria": "aluguel|luz|agua|internet|mercado|outro"}
Se algum campo não estiver visível ou não fizer sentido, omita-o do JSON.`

  const resp = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${chave}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: modelo,
      messages: [
        { role: 'system', content: prompt },
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: dataUrl } },
            { type: 'text', text: 'Extraia os dados deste comprovante.' },
          ],
        },
      ],
      temperature: 0.1,
      max_tokens: 300,
    }),
  })

  if (!resp.ok) {
    return { ok: false, cota: resp.status === 429 }
  }
  const data = await resp.json()
  const conteudo: unknown = data?.choices?.[0]?.message?.content
  if (typeof conteudo !== 'string' || !conteudo.trim()) return { ok: false }
  return { ok: true, conteudo }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const auth = req.headers.get('Authorization') ?? ''
    if (!auth) return json({ ok: false, mensagem: 'Não autorizado' }, 401)

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const nimKey = Deno.env.get('NIM_API_KEY') ?? ''

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: auth } },
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const {
      data: { user },
      error: authError,
    } = await userClient.auth.getUser()
    if (authError || !user) return json({ ok: false, mensagem: 'Não autorizado' }, 401)

    const body = await req.json()
    const path: unknown = body?.path
    if (typeof path !== 'string' || !/^[0-9a-f-]{36}\/[^/]+\.(jpe?g|png|webp|heic)$/i.test(path)) {
      return json({ ok: false, mensagem: 'Caminho de comprovante inválido' }, 400)
    }
    const casaId = path.split('/')[0]

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data: membro, error: membroErr } = await admin
      .from('casa_morador')
      .select('casa_id')
      .eq('casa_id', casaId)
      .eq('user_id', user.id)
      .eq('ativo', true)
      .maybeSingle()
    if (membroErr || !membro) {
      return json({ ok: false, mensagem: 'Você não faz parte desta casa' }, 403)
    }

    const { data: blob, error: dlError } = await admin.storage
      .from('comprovantes')
      .download(path)
    if (dlError || !blob) {
      return json({ ok: false, mensagem: 'Comprovante não encontrado no storage' }, 404)
    }

    if (!nimKey) {
      return json({ ok: false, mensagem: 'OCR não configurado (NIM_API_KEY ausente)' }, 503)
    }

    const dataUrl = await blobParaDataUrl(blob, inferirMime(path))
    let cotaUsada = false

    for (const modelo of MODELOS) {
      const res = await chamarNim(nimKey, modelo, dataUrl)
      if (!res.ok) {
        if (res.cota) cotaUsada = true
        continue
      }
      const raw = extrairJson(res.conteudo)
      if (!raw) continue
      const dados = normalizar(raw)
      if (Object.keys(dados).length === 0) continue
      return json({ ok: true, dados })
    }

    return json({
      ok: false,
      mensagem: cotaUsada
        ? 'Limite do OCR atingido — preencha manualmente e tente novamente em instantes.'
        : 'Não foi possível ler o comprovante — preencha manualmente.',
    })
  } catch (err) {
    console.error('ocr error:', err)
    return json({ ok: false, mensagem: 'Erro interno ao processar o comprovante' }, 500)
  }
})