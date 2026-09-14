import { categorias, labelsCat, type Frm } from '../lib/recorrenciaForm'
import type { Categoria, IntervaloRecorrencia, TipoRateio } from '../types'

export function CamposForm({
  f,
  onChange,
  moradores,
}: {
  f: Frm
  onChange: (p: Partial<Frm>) => void
  moradores: { id: string; nome: string }[]
}) {
  return (
    <>
      <label>Fornecedor</label>
      <input id="fornecedor" required value={f.fornecedor} onChange={(e) => onChange({ fornecedor: e.target.value })} placeholder="Ex.: Enel" />

      <div className="field-row">
        <div>
          <label>Valor previsto</label>
          <input inputMode="decimal" required value={f.valor} onChange={(e) => onChange({ valor: e.target.value })} placeholder="0,00" />
        </div>
        <div>
          <label>Categoria</label>
          <select value={f.categoria} onChange={(e) => onChange({ categoria: e.target.value as Categoria })}>
            {categorias.map((c) => <option key={c} value={c}>{labelsCat[c]}</option>)}
          </select>
        </div>
      </div>

      <div className="field-row">
        <div>
          <label>Dia de vencimento</label>
          <input type="number" min={1} max={31} value={f.dia} onChange={(e) => onChange({ dia: e.target.value })} />
        </div>
        <div>
          <label>Repetição</label>
          <select value={f.intervalo} onChange={(e) => onChange({ intervalo: e.target.value as IntervaloRecorrencia })}>
            <option value="mensal">Mensal</option>
            <option value="semanal">Semanal</option>
            <option value="quinzenal">Quinzenal</option>
            <option value="anual">Anual</option>
          </select>
        </div>
      </div>

      <div className="field-row">
        <div>
          <label>Começa em</label>
          <input
            type="date"
            required
            value={f.dataInicio}
            onChange={(e) => onChange({ dataInicio: e.target.value })}
          />
        </div>
        <div>
          <label>
            Termina em <span style={{ color: 'var(--text-muted)' }}>(opc.)</span>
          </label>
          <input
            type="date"
            value={f.dataFim}
            min={f.dataInicio}
            onChange={(e) => onChange({ dataFim: e.target.value })}
          />
          {f.dataFim && (
            <button
              type="button"
              className="btn-secondary btn-sm"
              style={{ marginTop: 4 }}
              onClick={() => onChange({ dataFim: '' })}
            >
              Remover
            </button>
          )}
        </div>
      </div>

      <details className="opcoes">
        <summary>Mais opções</summary>
        <div className="opcoes-corpo">
          <label>Descrição (opcional)</label>
          <input value={f.descricao} onChange={(e) => onChange({ descricao: e.target.value })} />

          <label>Como dividir?</label>
          <select value={f.tipoRateio} onChange={(e) => onChange({ tipoRateio: e.target.value as TipoRateio })}>
            <option value="igual">Igual para todos</option>
            <option value="percentual">Por percentual fixo</option>
            <option value="consumo">Só quem consumiu</option>
          </select>

          <label>Quem paga por padrão</label>
          <select value={f.pagador} onChange={(e) => onChange({ pagador: e.target.value })}>
            <option value="">Definir depois</option>
            {moradores.map((m) => (
              <option key={m.id} value={m.id}>{m.nome}</option>
            ))}
          </select>
        </div>
      </details>
    </>
  )
}