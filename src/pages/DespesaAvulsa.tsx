import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useApp } from '../state/AppContext'
import { useDespesas, invalidarCacheDespesas } from '../lib/dados'
import { calcularRateio, validarPercentuais } from '../lib/rateio'
import {
  removerComprovante,
  subirComprovante,
  urlComprovante,
} from '../lib/comprovante'
import { parseCentavos, formatBR } from '../lib/format'
import { lerBoletoLocal, onOcrCarregamento } from '../lib/ocr-local'
import { categoriasEfetivas, pareceMercado } from '../lib/categorias'
import { rateioMercado, dividirPorMedidor, type ItemMercadoInput } from '../lib/rateioEspecial'
import type { ResultadoOCR } from '../lib/ocr'
import type { Categoria, Despesa, ItensDespesa, LeituraMedidor, Rateio, Recorrencia, RegraRateio, TipoRateio } from '../types'

export function DespesaAvulsa() {
  const { id } = useParams()
  const editando = Boolean(id)
  const { casa, user, minhaMoradorId, moradores } = useApp()
  const { despesas } = useDespesas(casa?.id ?? null)
  const navigate = useNavigate()

  const [recorrencias, setRecorrencias] = useState<Recorrencia[]>([])
  const [regramap, setRegramap] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!casa) return
    supabase
      .from('recorrencias')
      .select('*')
      .eq('casa_id', casa.id)
      .then(({ data }) => setRecorrencias((data ?? []) as Recorrencia[]))
    supabase
      .from('regras_rateio')
      .select('*')
      .eq('casa_id', casa.id)
      .then(({ data }) => {
        const m: Record<string, string> = {}
        for (const r of (data ?? []) as RegraRateio[]) m[r.user_id] = String(r.percentual)
        setRegramap(m)
      })
  }, [casa])

  const percentuaisPorMorador = useMemo(() => {
    const m: Record<string, string> = {}
    for (const mo of moradores) {
      if (mo.user_id && regramap[mo.user_id]) m[mo.id] = regramap[mo.user_id]
    }
    return m
  }, [moradores, regramap])

  const [fornecedor, setFornecedor] = useState('')
  const [descricao, setDescricao] = useState('')
  const [valor, setValor] = useState('')
  const [categoria, setCategoria] = useState<Categoria>('outro')
  const [pagoPor, setPagoPor] = useState(minhaMoradorId ?? '')
  const [data, setData] = useState(() => new Date().toISOString().slice(0, 10))
  const [tipoRateio, setTipoRateio] = useState<TipoRateio>('igual')
  const [incluidos, setIncluidos] = useState<Set<string>>(new Set(moradores.map((m) => m.id)))
  const [percentuais, setPercentuais] = useState<Record<string, string>>({})
  const [comprovante, setComprovante] = useState<File | null>(null)
  const [comprovanteExistente, setComprovanteExistente] = useState<string | null>(null)
  const [comprovanteUrlExistente, setComprovanteUrlExistente] = useState<string | null>(null)
  const [removerAnexo, setRemoverAnexo] = useState(false)
  const [ocrErro, setOcrErro] = useState('')
  const [ocrBaixando, setOcrBaixando] = useState(false)
  const [comprovantePath, setComprovantePath] = useState<string | null>(null)
  const [ocrStatus, setOcrStatus] = useState<'ocioso' | 'processando' | 'ok' | 'falha'>('ocioso')
  const [ocrDados, setOcrDados] = useState<ResultadoOCR | null>(null)
  const [salvoOK, setSalvoOK] = useState(false)
  const [carregandoEdit, setCarregandoEdit] = useState(editando)
  const comprovanteUrl = useMemo(
    () => (comprovante ? URL.createObjectURL(comprovante) : null),
    [comprovante],
  )
  const inputFoto = useRef<HTMLInputElement>(null)
  const inputFotoCamera = useRef<HTMLInputElement>(null)
  const [erro, setErro] = useState('')

  const [especial, setEspecial] = useState<'normal' | 'mercado' | 'medidor'>('normal')
  const [tipoMedidor, setTipoMedidor] = useState<'agua' | 'luz'>('luz')
  const [leiturasMedidor, setLeiturasMedidor] = useState<Record<string, string>>({})
  const [leiturasAnteriores, setLeiturasAnteriores] = useState<Record<string, number>>({})
  const [itensMercado, setItensMercado] = useState<
    { id: string; descricao: string; valor: string; donos: Set<string> }[]
  >([])
  const [parcelaTotal, setParcelaTotal] = useState('1')
  const [abrirDivisao, setAbrirDivisao] = useState(false)

  const novoId = () => Math.random().toString(36).slice(2)

  const somaItensMercado = () =>
    itensMercado.reduce((acc, it) => acc + (parseCentavos(it.valor) ?? 0), 0)

  const adicionarItemMercado = () =>
    setItensMercado((prev) => [
      ...prev,
      { id: novoId(), descricao: '', valor: '', donos: new Set<string>() },
    ])

  const ativarMercado = () => {
    setEspecial('mercado')
    setErro('')
    setItensMercado((prev) =>
      prev.length
        ? prev
        : [{ id: novoId(), descricao: '', valor: '', donos: new Set<string>() }],
    )
  }

  const alternarDonoItem = (itemId: string, moradorId: string) =>
    setItensMercado((prev) =>
      prev.map((it) => {
        if (it.id !== itemId) return it
        const donos = new Set(it.donos)
        if (donos.has(moradorId)) donos.delete(moradorId)
        else donos.add(moradorId)
        return { ...it, donos }
      }),
    )

  const carregarModoMedidor = async (tipo: 'agua' | 'luz') => {
    setEspecial('medidor')
    setTipoMedidor(tipo)
    setCategoria(tipo)
    setErro('')
    setLeiturasMedidor({})
    if (!casa) return
    const { data } = await supabase
      .from('leituras_medidor')
      .select('*')
      .eq('casa_id', casa.id)
      .eq('tipo', tipo)
      .order('data_leitura', { ascending: false })
    const ultima: Record<string, number> = {}
    for (const l of (data ?? []) as LeituraMedidor[]) {
      if (ultima[l.morador_id] === undefined) ultima[l.morador_id] = l.leitura
    }
    setLeiturasAnteriores(ultima)
  }

  const carregarLeiturasEdicao = useCallback(
    async (tipo: 'agua' | 'luz', dataLeitura: string) => {
      if (!casa) return
      const [{ data: hoje }, { data: anteriores }] = await Promise.all([
        supabase
          .from('leituras_medidor')
          .select('*')
          .eq('casa_id', casa.id)
          .eq('tipo', tipo)
          .eq('data_leitura', dataLeitura),
        supabase
          .from('leituras_medidor')
          .select('*')
          .eq('casa_id', casa.id)
          .eq('tipo', tipo)
          .lt('data_leitura', dataLeitura)
          .order('data_leitura', { ascending: false }),
      ])
      const mapaPrev: Record<string, number> = {}
      for (const l of (anteriores ?? []) as LeituraMedidor[]) {
        if (mapaPrev[l.morador_id] === undefined) mapaPrev[l.morador_id] = l.leitura
      }
      setLeiturasAnteriores(mapaPrev)
      const hojeMap: Record<string, string> = {}
      for (const l of (hoje ?? []) as LeituraMedidor[]) {
        hojeMap[l.morador_id] = String(l.leitura).replace('.', ',')
      }
      setLeiturasMedidor(hojeMap)
    },
    [casa],
  )

  const addMeses = (dataISO: string, meses: number) => {
    const d = new Date(`${dataISO}T12:00:00`)
    const dia = d.getDate()
    d.setMonth(d.getMonth() + meses)
    if (d.getDate() !== dia) d.setDate(0)
    return d.toISOString().slice(0, 10)
  }

  useEffect(() => {
    onOcrCarregamento(setOcrBaixando)
    return () => onOcrCarregamento(null)
  }, [])

  const aoEscolherArquivo = (e: ChangeEvent<HTMLInputElement>) => {
    const arquivo = e.target.files?.[0] ?? null
    setComprovante(arquivo)
    if (arquivo) {
      setRemoverAnexo(false)
      setOcrDados(null)
      setOcrErro('')
      void processarOCR(arquivo)
    } else {
      setOcrStatus('ocioso')
      setOcrErro('')
    }
    e.target.value = ''
  }

  const [menuFornecedor, setMenuFornecedor] = useState(false)
  const opcoesFornecedores = useMemo(() => {
    const mapa = new Map<string, string>()
    for (const d of despesas) mapa.set(d.fornecedor.trim().toLowerCase(), d.fornecedor.trim())
    for (const r of recorrencias) mapa.set(r.fornecedor.trim().toLowerCase(), r.fornecedor.trim())
    const lista = Array.from(mapa.values()).sort((a, b) => a.localeCompare(b, 'pt-BR'))
    const termo = fornecedor.trim().toLowerCase()
    return termo ? lista.filter((o) => o.toLowerCase().includes(termo)) : lista
  }, [despesas, recorrencias, fornecedor])

  const toggleIncluido = (id: string) => {
    setIncluidos((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const ultima = useMemo(() => {
    const confirmadas = despesas.filter((d) => d.status === 'confirmada')
    if (confirmadas.length === 0) return null
    return (
      confirmadas
        .slice()
        .sort((a, b) => b.data.localeCompare(a.data) || b.id.localeCompare(a.id))[0] ?? null
    )
  }, [despesas])

  const usarDadosUltima = () => {
    if (!ultima) return
    setFornecedor(ultima.fornecedor)
    setCategoria((ultima.categoria ?? 'outro') as Categoria)
    setTipoRateio((ultima.tipo_rateio ?? 'igual') as TipoRateio)
    setIncluidos(new Set(ultima.rateios.map((r) => r.morador_id)))
    setTipoMedidor('luz')
    const pct: Record<string, string> = {}
    for (const r of ultima.rateios) {
      const p = ultima.valor > 0 ? (r.valor_rateado / ultima.valor) * 100 : 0
      pct[r.morador_id] = String(Math.round(p * 10) / 10)
    }
    setPercentuais(pct)
    setEspecial('normal')
  }

  const pareceCompraDeMercado = useMemo(
    () => especial === 'normal' && !editando && pareceMercado(fornecedor),
    [especial, fornecedor, editando],
  )

  useEffect(() => {
    if (!id || !casa) return
    let ativo = true
    supabase
      .from('despesas')
      .select('*')
      .eq('id', id)
      .single()
      .then(async ({ data, error }) => {
        if (!ativo || error || !data) return
        const d = data as unknown as Despesa
        setFornecedor(d.fornecedor)
        setDescricao(d.descricao ?? '')
        setValor(String(d.valor).replace('.', ','))
        setCategoria((d.categoria ?? 'outro') as Categoria)
        setPagoPor(d.pago_por ?? minhaMoradorId ?? '')
        setData(d.data.slice(0, 10))
        setTipoRateio((d.tipo_rateio ?? 'igual') as TipoRateio)
        setComprovanteExistente(d.comprovante_url)
        if (d.comprovante_url) {
          setComprovanteUrlExistente((await urlComprovante(d.comprovante_url)) ?? null)
        }
        if (d.parcelada && d.total_parcelas) setParcelaTotal(String(d.total_parcelas))
        if (d.mercado) {
          setEspecial('mercado')
          const { data: itens } = await supabase
            .from('itens_despesa')
            .select('*')
            .eq('despesa_id', d.id)
          if (!ativo) return
          setItensMercado(
            ((itens ?? []) as ItensDespesa[]).map((it) => ({
              id: it.id,
              descricao: it.descricao,
              valor: String(it.valor).replace('.', ','),
              donos: new Set(it.donos),
            })),
          )
        } else if (d.categoria === 'agua' || d.categoria === 'luz') {
          setEspecial('medidor')
          setTipoMedidor(d.categoria)
          await carregarLeiturasEdicao(d.categoria, d.data.slice(0, 10))
        }
        const { data: rateios } = await supabase
          .from('rateios')
          .select('*')
          .eq('despesa_id', d.id)
        if (!ativo) return
        const rs = (rateios ?? []) as Rateio[]
        setIncluidos(new Set(rs.map((r) => r.morador_id)))
        const pct: Record<string, string> = {}
        for (const r of rs) {
          const p = d.valor > 0 ? (r.valor_rateado / d.valor) * 100 : 0
          pct[r.morador_id] = String(Math.round(p * 10) / 10)
        }
        setPercentuais(pct)
        setCarregandoEdit(false)
      })
    return () => {
      ativo = false
    }
  }, [id, casa, minhaMoradorId, moradores, carregarLeiturasEdicao])

  const processarOCR = async (arquivo: File) => {
    setOcrStatus('processando')
    setErro('')
    try {
      const [res, path] = await Promise.all([
        lerBoletoLocal(arquivo),
        casa ? subirComprovante(casa.id, arquivo).catch(() => null) : Promise.resolve(null),
      ])
      if (path) setComprovantePath(path)
      if (!res.ok) {
        setOcrStatus('falha')
        setOcrErro(res.mensagem ?? 'Não foi possível ler o comprovante.')
        return
      }
      const dados = res.dados
      setOcrDados(dados)
      if (dados.fornecedor) setFornecedor(dados.fornecedor)
      if (dados.valor && dados.valor > 0) setValor(String(dados.valor).replace('.', ','))
      if (dados.data) setData(dados.data)
      if (dados.categoria) setCategoria(dados.categoria)
      setOcrStatus('ok')
    } catch (err) {
      console.error('OCR falhou:', err)
      setOcrStatus('falha')
    }
  }

  const voltar = () => {
    if (comprovantePath && !salvoOK) void removerComprovante(comprovantePath)
    navigate(-1)
  }

  const salvar = async (e: FormEvent) => {
    e.preventDefault()
    setErro('')
    const pagoPorId = pagoPor || minhaMoradorId
    if (!fornecedor.trim()) return setErro('Informe o fornecedor')
    if (!pagoPorId) return setErro('Quem pagou?')
    if (!casa) return

    let valorNum = parseCentavos(valor)
    let categoriaFinal: Categoria = categoria
    let tipoRateioFinal: TipoRateio = tipoRateio
    let itens = calcularRateio(
      valorNum ?? 0,
      moradores.map((m) => ({ user_id: m.id })),
      {
        regra: tipoRateio,
        percentuais: Object.fromEntries(
          Object.entries(percentuais).map(([k, v]) => [k, Number(v) || 0]),
        ),
        incluidos: Array.from(incluidos),
      },
    )
    const leiturasAInserir: { morador_id: string; leitura: number }[] = []

    if (especial === 'mercado') {
      const validos = itensMercado.filter(
        (it) => it.descricao.trim() && (parseCentavos(it.valor) ?? 0) > 0,
      )
      if (validos.length === 0)
        return setErro('Adicione ao menos um item com descrição e valor')
      valorNum = somaItensMercado()
      if (valorNum <= 0) return setErro('O total dos itens deve ser maior que zero')
      tipoRateioFinal = 'consumo'
      categoriaFinal = 'mercado'
      const mercados: ItemMercadoInput[] = validos.map((it) => ({
        descricao: it.descricao.trim(),
        valor: parseCentavos(it.valor) as number,
        donos: Array.from(it.donos),
      }))
      itens = rateioMercado(mercados, moradores)
    } else if (especial === 'medidor') {
      if (valorNum === null || valorNum <= 0) return setErro('Informe o valor da conta')
      const consumos: { morador_id: string; peso: number | null }[] = []
      for (const m of moradores) {
        const raw = (leiturasMedidor[m.id] ?? '').trim()
        const atual = raw ? Number(raw.replace(',', '.')) : null
        if (atual != null && Number.isFinite(atual) && atual >= 0) {
          const anterior = leiturasAnteriores[m.id] ?? 0
          if (atual < anterior) {
            return setErro(
              `Leitura de ${m.nome} (${atual}) é menor que a anterior (${anterior}) — confira o medidor.`,
            )
          }
          consumos.push({ morador_id: m.id, peso: Math.round((atual - anterior) * 10) / 10 })
          leiturasAInserir.push({ morador_id: m.id, leitura: atual })
        } else {
          consumos.push({ morador_id: m.id, peso: null })
        }
      }
      itens = dividirPorMedidor(consumos, valorNum)
      tipoRateioFinal = 'consumo'
      categoriaFinal = tipoMedidor
    } else {
      if (valorNum === null || valorNum <= 0) return setErro('Informe um valor válido')
      if (tipoRateio === 'consumo' && incluidos.size === 0)
        return setErro('Selecione ao menos um morador participante')
      if (tipoRateio === 'percentual') {
        const err = validarPercentuais(
          moradores,
          Object.fromEntries(Object.entries(percentuais).map(([k, v]) => [k, Number(v) || 0])),
        )
        if (err) return setErro(err)
      }
      itens = calcularRateio(valorNum, moradores.map((m) => ({ user_id: m.id })), {
        regra: tipoRateio,
        percentuais: Object.fromEntries(
          Object.entries(percentuais).map(([k, v]) => [k, Number(v) || 0]),
        ),
        incluidos: Array.from(incluidos),
      })
    }
    if (itens.length === 0) return setErro('O rateio não possui participantes válidos')

    try {
      const n = parseInt(parcelaTotal, 10) || 1
      let comprovante_url: string | null = comprovanteExistente
      if (comprovantePath) comprovante_url = comprovantePath
      else if (comprovante) comprovante_url = await subirComprovante(casa.id, comprovante)
      if (removerAnexo) {
        comprovante_url = null
        if (comprovantePath) {
          await removerComprovante(comprovantePath)
          setComprovantePath(null)
          setOcrStatus('ocioso')
        }
      }

      let despesaId = id
      let originalMedidor: { tipo: 'agua' | 'luz'; data: string } | null = null
      if (editando && id) {
        const { data: orig } = await supabase
          .from('despesas')
          .select('categoria, data')
          .eq('id', id)
          .single()
        const o = orig as unknown as { categoria: string; data: string } | null
        if (o && (o.categoria === 'agua' || o.categoria === 'luz')) {
          originalMedidor = { tipo: o.categoria, data: o.data.slice(0, 10) }
        }
        const { error } = await supabase
          .from('despesas')
          .update({
            fornecedor: fornecedor.trim(),
            descricao: descricao.trim() || null,
            valor: valorNum,
            categoria: categoriaFinal,
            pago_por: pagoPorId,
            tipo_rateio: tipoRateioFinal,
            data,
            comprovante_url,
            ocr_resultado: ocrDados,
            mercado: especial === 'mercado',
            parcelada: n > 1,
            total_parcelas: n > 1 ? n : null,
          })
          .eq('id', id)
        if (error) throw error
        await supabase.from('rateios').delete().eq('despesa_id', id)
        await supabase.from('itens_despesa').delete().eq('despesa_id', id)
        await supabase.from('parcelas').delete().eq('despesa_id', id)
        if (comprovanteExistente && (comprovante || comprovantePath || removerAnexo)) {
          await removerComprovante(comprovanteExistente)
        }
      } else {
        const { data: despesa, error } = await supabase
          .from('despesas')
          .insert({
            casa_id: casa.id,
            fornecedor: fornecedor.trim(),
            descricao: descricao.trim() || null,
            valor: valorNum,
            categoria: categoriaFinal,
            pago_por: pagoPorId,
            tipo_rateio: tipoRateioFinal,
            status: 'confirmada',
            data,
            comprovante_url,
            ocr_resultado: ocrDados,
            mercado: especial === 'mercado',
            parcelada: n > 1,
            total_parcelas: n > 1 ? n : null,
          })
          .select('id')
          .single()
        if (error) throw error
        despesaId = despesa.id
      }

      const { error: errRateios } = await supabase.from('rateios').insert(
        itens.map((i) => ({
          despesa_id: despesaId,
          morador_id: i.morador_id,
          valor_rateado: i.valor_rateado,
          pago: i.morador_id === pagoPorId,
          pago_em: i.morador_id === pagoPorId ? new Date().toISOString() : null,
          confirmado_por: i.morador_id === pagoPorId ? (user?.id ?? null) : null,
        })),
      )
      if (errRateios) throw errRateios

      if (originalMedidor) {
        const { error: errDelLeituras } = await supabase
          .from('leituras_medidor')
          .delete()
          .eq('casa_id', casa.id)
          .eq('tipo', originalMedidor.tipo)
          .eq('data_leitura', originalMedidor.data)
        if (errDelLeituras) throw errDelLeituras
      }

      if (especial === 'mercado' && itensMercado.length > 0) {
        const { error: errItens } = await supabase.from('itens_despesa').insert(
          itensMercado
            .filter((it) => it.descricao.trim() && (parseCentavos(it.valor) ?? 0) > 0)
            .map((it) => ({
              despesa_id: despesaId,
              descricao: it.descricao.trim(),
              valor: parseCentavos(it.valor) as number,
              donos: Array.from(it.donos),
            })),
        )
        if (errItens) throw errItens
      }
      if (especial === 'medidor' && leiturasAInserir.length > 0) {
        const { error: errLeituras } = await supabase.from('leituras_medidor').insert(
          leiturasAInserir.map((l) => ({
            casa_id: casa.id,
            tipo: tipoMedidor,
            morador_id: l.morador_id,
            leitura: l.leitura,
            data_leitura: data,
          })),
        )
        if (errLeituras) throw errLeituras
      }
      if (n > 1) {
        const totalCent = Math.round((valorNum as number) * 100)
        const base = Math.floor(totalCent / n)
        const parcelas = Array.from({ length: n }, (_, i) => {
          const v = (base + (i === n - 1 ? totalCent - base * n : 0)) / 100
          return {
            despesa_id: despesaId,
            numero: i + 1,
            valor: Math.round(v * 100) / 100,
            data_vencimento: addMeses(data, i),
            paga: i === 0,
          }
        })
        const { error: errParcelas } = await supabase.from('parcelas').insert(parcelas)
        if (errParcelas) throw errParcelas
      }

      setSalvoOK(true)
      invalidarCacheDespesas(casa.id)

      if (editando) navigate(-1)
      else navigate('/mes')
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao salvar despesa')
    }
  }

  if (carregandoEdit) return <div className="empty">Carregando…</div>

  return (
    <>
      <div className="nav-back">
        <button type="button" onClick={voltar}>
          <span aria-hidden>‹</span> Voltar
        </button>
      </div>

      <h1 className="bar-title">{editando ? 'Editar despesa' : 'Nova despesa avulsa'}</h1>
      <p className="small muted">
        {editando
          ? 'Altere os dados e o rateio deste lançamento.'
          : 'Lançamento pontual que não se repete todo mês.'}
      </p>

      <form className="card mt" onSubmit={salvar}>
        {!editando && ultima && (
          <div className="row" style={{ gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
            <span className="small muted" style={{ flex: 1, minWidth: 0 }}>
              Última despesa: <strong>{ultima.fornecedor}</strong>
            </span>
            <button type="button" className="btn btn-sm btn-secondary" onClick={usarDadosUltima}>
              Usar dados
            </button>
          </div>
        )}

        <label>Tipo de lançamento</label>
        <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          <button
            type="button"
            className={`chip${especial === 'normal' ? ' chip-ativo' : ''}`}
            onClick={() => setEspecial('normal')}
          >
            Normal
          </button>
          <button
            type="button"
            className={`chip${especial === 'mercado' ? ' chip-ativo' : ''}`}
            onClick={ativarMercado}
          >
            Mercado com itens
          </button>
          <button
            type="button"
            className={`chip${especial === 'medidor' ? ' chip-ativo' : ''}`}
            onClick={() => void carregarModoMedidor(tipoMedidor)}
          >
            Luz/Água (medidor)
          </button>
        </div>

        <label>Fornecedor</label>
        <div className="combobox">
          <input
            value={fornecedor}
            onChange={(e) => setFornecedor(e.target.value)}
            onClick={() => setMenuFornecedor(true)}
            onFocus={() => setMenuFornecedor(true)}
            placeholder="Ex.: Supermercado, janta…"
            className={erro.toLowerCase().includes('fornecedor') ? 'input-erro' : ''}
          />
          <button
            type="button"
            className="combobox-arrow"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setMenuFornecedor((v) => !v)}
            aria-label="Listar fornecedores"
          >
            ▾
          </button>
          {menuFornecedor && opcoesFornecedores.length > 0 && (
            <div className="combobox-menu">
              {opcoesFornecedores.map((o) => (
                <button
                  type="button"
                  key={o}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    setMenuFornecedor(false)
                    setFornecedor(o)
                  }}
                >
                  {o}
                </button>
              ))}
            </div>
          )}
        </div>

        {pareceCompraDeMercado && (
          <div className="info-box mt">
            <div className="small">Parece compra de mercado — quer dividir por itens?</div>
            <button type="button" className="btn btn-sm btn-primary mt" onClick={ativarMercado}>
              Dividir por itens
            </button>
          </div>
        )}

        {especial === 'normal' && (
          <div className="field-row">
            <div>
              <label>Valor</label>
              <input
                required
                inputMode="decimal"
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                placeholder="0,00"
                className={erro.toLowerCase().includes('valor inválido') ? 'input-erro' : ''}
              />
            </div>
            <div>
              <label>Categoria</label>
              <select value={categoria} onChange={(e) => setCategoria(e.target.value)}>
                {categoriasEfetivas(casa?.categorias).map((c) => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </select>
            </div>
          </div>
        )}

        {especial === 'mercado' && (
          <div className="card mt">
            <div className="small" style={{ fontWeight: 600, marginBottom: 'var(--space-2)' }}>Itens da nota</div>
            {itensMercado.map((it) => (
              <div key={it.id}>
                <div style={{ display: 'flex', gap: 'var(--space-2)', margin: 'var(--space-2) 0' }}>
                  <input
                    value={it.descricao}
                    onChange={(e) =>
                      setItensMercado((prev) =>
                        prev.map((x) => (x.id === it.id ? { ...x, descricao: e.target.value } : x)),
                      )
                    }
                    placeholder="Item (ex.: Café 1kg)"
                    style={{ flex: 1 }}
                  />
                  <input
                    inputMode="decimal"
                    value={it.valor}
                    onChange={(e) =>
                      setItensMercado((prev) =>
                        prev.map((x) => (x.id === it.id ? { ...x, valor: e.target.value } : x)),
                      )
                    }
                    placeholder="0,00"
                    style={{ width: 90 }}
                  />
                </div>
                <details className="opcoes">
                  <summary>{it.donos.size > 0 ? `${it.donos.size} ${it.donos.size === 1 ? 'consome' : 'consomem'}` : 'consumo comum'}</summary>
                  <div className="opcoes-corpo">
                    {moradores.map((m) => (
                      <label key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontWeight: 400, margin: 'var(--space-1)' }}>
                        <input
                          type="checkbox"
                          style={{ width: 'auto' }}
                          checked={it.donos.has(m.id)}
                          onChange={() => alternarDonoItem(it.id, m.id)}
                        />
                        {m.nome}
                      </label>
                    ))}
                  </div>
                </details>
              </div>
            ))}
            <button type="button" className="btn btn-sm btn-secondary mt" onClick={adicionarItemMercado}>
              + Adicionar item
            </button>
            <div className="small mt" style={{ marginBottom: 0 }}>
              Total da nota: <strong>{formatBR(somaItensMercado())}</strong>{' '}
              <span className="muted">· item sem dono é dividido entre todos (comum).</span>
            </div>
          </div>
        )}

        {especial === 'medidor' && (
          <>
            <div className="field-row">
              <div>
                <label>Valor da conta</label>
                <input
                  inputMode="decimal"
                  value={valor}
                  onChange={(e) => setValor(e.target.value)}
                  placeholder="0,00"
                  className={erro.toLowerCase().includes('valor da conta') ? 'input-erro' : ''}
                />
              </div>
              <div>
                <label>Medidor</label>
                <select value={tipoMedidor} onChange={(e) => void carregarModoMedidor(e.target.value as 'agua' | 'luz')}>
                  <option value="agua">Água</option>
                  <option value="luz">Luz</option>
                </select>
              </div>
            </div>
            <div className="card mt">
              <div className="small" style={{ fontWeight: 600, marginBottom: 'var(--space-2)' }}>Leitura atual de cada morador</div>
              {moradores.map((m) => {
                const anterior = leiturasAnteriores[m.id]
                return (
                  <div className="row" key={m.id} style={{ margin: 'var(--space-2) 0' }}>
                    <span className="small" style={{ flex: 1 }}>
                      {m.nome}
                      {anterior !== undefined && <span className="muted"> (anterior: {anterior})</span>}
                    </span>
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="Leitura atual"
                      style={{ width: 130 }}
                      value={leiturasMedidor[m.id] ?? ''}
                      onChange={(e) => setLeiturasMedidor((prev) => ({ ...prev, [m.id]: e.target.value }))}
                    />
                  </div>
                )
              })}
              <div className="small muted mt" style={{ marginBottom: 0 }}>
                Quem não informar a leitura cai na média dos demais.
              </div>
            </div>
          </>
        )}

        <div className="field-row">
          <div>
            <label>Quem pagou</label>
            <select
              value={pagoPor}
              onChange={(e) => setPagoPor(e.target.value)}
              className={erro === 'Quem pagou?' ? 'input-erro' : ''}
            >
              {moradores.map((m) => (
                <option key={m.id} value={m.id}>{m.nome}</option>
              ))}
            </select>
          </div>
          <div>
            <label>Data</label>
            <input type="date" required value={data} onChange={(e) => setData(e.target.value)} />
          </div>
        </div>

        {especial === 'normal' && (
          <>
            <details
              className="opcoes"
              open={abrirDivisao}
              onToggle={(e) => setAbrirDivisao((e.target as HTMLDetailsElement).open)}
            >
              <summary>
                <span>
                  {tipoRateio === 'igual'
                    ? 'Divisão igual para todos'
                    : tipoRateio === 'percentual'
                      ? 'Divisão por percentual'
                      : 'Só quem consumiu'}
                  {' · '}
                  {parcelaTotal === '1' ? 'à vista' : `${parcelaTotal} parcelas`}
                </span>
              </summary>
              <div className="opcoes-corpo">
                <label>Como dividir?</label>
                <select value={tipoRateio} onChange={(e) => setTipoRateio(e.target.value as TipoRateio)}>
                  <option value="igual">Igual para todos</option>
                  <option value="percentual">Por percentual</option>
                  <option value="consumo">Só quem consumiu</option>
                </select>

                {tipoRateio === 'consumo' && (
                  <div className="card mt">
                    {moradores.map((m) => (
                      <label key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontWeight: 400, margin: 'var(--space-1)' }}>
                        <input
                          type="checkbox"
                          checked={incluidos.has(m.id)}
                          onChange={() => toggleIncluido(m.id)}
                          style={{ width: 'auto' }}
                        />
                        {m.nome}
                      </label>
                    ))}
                  </div>
                )}

                {tipoRateio === 'percentual' && (
                  <div className="card mt">
                    {moradores.map((m) => (
                      <div className="row" key={m.id} style={{ margin: 'var(--space-2) 0' }}>
                        <span className="small">{m.nome}</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                          <input
                            type="text"
                            inputMode="numeric"
                            style={{ width: 80 }}
                            value={percentuais[m.id] ?? percentuaisPorMorador[m.id] ?? ''}
                            onChange={(e) =>
                              setPercentuais((prev) => ({ ...prev, [m.id]: e.target.value.replace(/[^\d.]/g, '') }))
                            }
                          />
                          <span className="muted">%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <label>Parcelar em</label>
                <select value={parcelaTotal} onChange={(e) => setParcelaTotal(e.target.value)}>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={String(n)}>{n === 1 ? 'À vista' : `${n} parcelas`}</option>
                  ))}
                </select>
              </div>
            </details>
          </>
        )}

        <details className="opcoes">
          <summary>Mais opções</summary>
          <div className="opcoes-corpo">
            <label>Descrição (opcional)</label>
            <input value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Ex.: Compras da semana" />

            <label>Comprovante (opcional)</label>
            <div className="row">
              <input ref={inputFoto} type="file" accept="image/*" hidden onChange={aoEscolherArquivo} />
              <input
                ref={inputFotoCamera}
                type="file"
                accept="image/*"
                capture="environment"
                hidden
                onChange={aoEscolherArquivo}
              />
              <button type="button" className="btn btn-sm btn-secondary" onClick={() => inputFoto.current?.click()}>
                Importar
              </button>
              <button type="button" className="btn btn-sm btn-secondary" onClick={() => inputFotoCamera.current?.click()}>
                Tirar foto
              </button>
            </div>
            {comprovanteUrl && (
              <img src={comprovanteUrl} alt="Comprovante" style={{ width: '100%', borderRadius: 'var(--radius-sm)', marginTop: 'var(--space-2)', display: 'block' }} />
            )}
            {ocrStatus === 'processando' && ocrBaixando && (
              <p className="small muted mt">⬇️ Baixando leitor de comprovante (1ª vez)…</p>
            )}
            {ocrStatus === 'processando' && !ocrBaixando && (
              <p className="small muted mt">🔎 Lendo comprovante no aparelho…</p>
            )}
            {ocrStatus === 'ok' && (
              <p className="small muted mt">✓ Dados preenchidos pelo OCR — confira antes de salvar.</p>
            )}
            {ocrStatus === 'falha' && (
              <div className="mt">
                <div className="error-box">{(ocrErro || 'Não foi possível ler o comprovante automaticamente')}</div>
                {comprovante && (
                  <button
                    type="button"
                    className="btn btn-sm btn-secondary mt"
                    onClick={() => void processarOCR(comprovante)}
                  >
                    Tentar novamente
                  </button>
                )}
              </div>
            )}
            {editando && comprovanteUrlExistente && comprovanteExistente && !removerAnexo && (
              <div className="mt">
                <img
                  src={comprovanteUrlExistente}
                  alt="Boleto atual"
                  style={{ width: '100%', borderRadius: 'var(--radius-sm)', display: 'block' }}
                />
                <button
                  type="button"
                  className="btn btn-sm btn-secondary mt"
                  onClick={() => setRemoverAnexo(true)}
                >
                  Remover boleto
                </button>
              </div>
            )}
            {removerAnexo && <p className="small muted mt">O boleto atual será removido ao salvar.</p>}
          </div>
        </details>

        {erro && <div className="error-box">{erro}</div>}

        <button type="submit" className="btn btn-primary mt-lg">
              {editando ? 'Salvar alterações' : 'Salvar despesa'}
            </button>
      </form>
    </>
  )
}