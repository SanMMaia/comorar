import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useApp, nomeMorador } from '../state/AppContext'
import { subirComprovante, urlComprovante, removerComprovante } from '../lib/comprovante'
import { formatBR, dataBR } from '../lib/format'
import { labelCategoria } from '../lib/categorias'
import type { Despesa, Rateio } from '../types'

interface Detalhe extends Despesa {
  rateios: Rateio[]
}

export function DespesaDetalhe() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { moradores, minhaMoradorId, user, casa } = useApp()

  const inputBoleto = useRef<HTMLInputElement>(null)

  const [despesa, setDespesa] = useState<Detalhe | null>(null)
  const [foto, setFoto] = useState<string | null>(null)
  const [erro, setErro] = useState('')
  const [carregando, setCarregando] = useState(true)

  const souOwner = moradores.find((m) => m.id === minhaMoradorId)?.role === 'owner'

  useEffect(() => {
    if (!id) return
    supabase
      .from('despesas')
      .select('*, rateios(*)')
      .eq('id', id)
      .single()
      .then(async ({ data, error }) => {
        setCarregando(false)
        if (error || !data) {
          setErro(error?.message ?? 'Despesa não encontrada')
          return
        }
        const d = data as unknown as Detalhe
        setDespesa(d)
        if (d.comprovante_url) {
          setFoto(await urlComprovante(d.comprovante_url))
        }
      })
  }, [id])

  const marcarPago = async (r: Rateio) => {
    await supabase
      .from('rateios')
      .update({ pago: true, pago_em: new Date().toISOString(), confirmado_por: user?.id ?? null })
      .eq('id', r.id)
    const { data } = await supabase
      .from('despesas')
      .select('*, rateios(*)')
      .eq('id', id!)
      .single()
    if (data) setDespesa(data as unknown as Detalhe)
  }

  const excluir = async () => {
    if (!despesa) return
    if (!window.confirm(`Excluir a despesa "${despesa.fornecedor}"?`)) return
    if (despesa.comprovante_url) await removerComprovante(despesa.comprovante_url)
    const { error } = await supabase.from('despesas').delete().eq('id', despesa.id)
    if (error) return setErro(error.message)
    navigate('/mes')
  }

  const anexarBoleto = async (file: File) => {
    if (!despesa || !casa) return
    setErro('')
    try {
      const url = await subirComprovante(casa.id, file)
      const { error } = await supabase
        .from('despesas')
        .update({ comprovante_url: url })
        .eq('id', despesa.id)
      if (error) throw error
      if (despesa.comprovante_url) await removerComprovante(despesa.comprovante_url)
      setDespesa({ ...despesa, comprovante_url: url })
      setFoto((await urlComprovante(url)) ?? null)
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao anexar boleto')
    }
  }

  const removerBoleto = async () => {
    if (!despesa) return
    setErro('')
    try {
      if (despesa.comprovante_url) await removerComprovante(despesa.comprovante_url)
      const { error } = await supabase
        .from('despesas')
        .update({ comprovante_url: null })
        .eq('id', despesa.id)
      if (error) throw error
      setDespesa({ ...despesa, comprovante_url: null })
      setFoto(null)
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao remover boleto')
    }
  }

  if (carregando) return <div className="empty">Carregando…</div>
  if (!despesa) return <div className="empty">{erro || 'Despesa não encontrada.'}</div>

  return (
    <>
      <div className="nav-back">
        <button type="button" onClick={() => navigate(-1)}>
          <span aria-hidden>‹</span> Voltar
        </button>
      </div>

      <div className="row">
        <h1 style={{ fontSize: 20, margin: 0 }}>{despesa.fornecedor}</h1>
        {despesa.status === 'prevista' && <span className="badge badge-warn">prevista</span>}
        {despesa.status === 'cancelada' && <span className="badge badge-muted">cancelada</span>}
        {despesa.status === 'confirmada' && <span className="badge badge-ok">confirmada</span>}
      </div>

      <div className="card mt">
        <div className="row">
          <div>
            <div className="small muted">{labelCategoria(despesa.categoria, casa?.categorias)} · {dataBR(despesa.data)}</div>
            {despesa.descricao && <div className="small mt">{despesa.descricao}</div>}
            <div className="small muted mt">
              Pago por <strong>{nomeMorador(moradores, despesa.pago_por)}</strong>
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="valor mono" style={{ fontSize: 22, fontWeight: 700 }}>
              {formatBR(despesa.valor)}
            </div>
          </div>
        </div>
      </div>

      {foto && (
        <div className="card mt">
          <div className="small muted" style={{ marginBottom: 8 }}>Comprovante</div>
          <a href={foto} target="_blank" rel="noreferrer">
            <img src={foto} alt="Comprovante" style={{ width: '100%', borderRadius: 8, display: 'block' }} />
          </a>
        </div>
      )}

      {despesa.status === 'confirmada' && (
        <>
          <h2 style={{ fontSize: 15, marginTop: 20 }}>Rateio</h2>
          {despesa.rateios.map((r) => (
            <div className="card" key={r.id}>
              <div className="row">
                <span>
                  <strong>{nomeMorador(moradores, r.morador_id)}</strong>
                  <span className="small muted"> deve {formatBR(r.valor_rateado)}</span>
                </span>
                {r.pago ? (
                  <span className="badge badge-ok">pago</span>
                ) : (
                  <button type="button" className="btn btn-sm btn-secondary" onClick={() => marcarPago(r)}>
                    Marcar pago
                  </button>
                )}
              </div>
            </div>
          ))}
        </>
      )}

      {erro && <div className="error-box mt">{erro}</div>}

      <div className="card mt">
        <strong>Boleto / comprovante</strong>
        <div className="small muted mt">{despesa.comprovante_url ? 'Anexado — toque para ampliar.' : 'Nenhum boleto anexado.'}</div>
        <input
          ref={inputBoleto}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void anexarBoleto(f)
            e.target.value = ''
          }}
        />
        <div className="row mt" style={{ gap: 8 }}>
          <button type="button" className="btn btn-sm btn-secondary" onClick={() => inputBoleto.current?.click()}>
            {despesa.comprovante_url ? 'Substituir boleto' : 'Anexar boleto'}
          </button>
          {despesa.comprovante_url && (
            <button type="button" className="btn btn-sm btn-danger" onClick={() => void removerBoleto()}>
              Remover boleto
            </button>
          )}
        </div>
      </div>

      <Link
        to={`/despesa/${despesa.id}/editar`}
        viewTransition
        className="btn btn-secondary mt-lg"
        style={{ display: 'block', textAlign: 'center' }}
      >
        ✎ Editar despesa
      </Link>

      {souOwner && despesa.status !== 'cancelada' && (
        <button type="button" className="btn btn-danger mt" onClick={excluir}>
          Excluir despesa
        </button>
      )}
    </>
  )
}