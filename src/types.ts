export type Categoria = string
export type TipoRateio = 'igual' | 'percentual' | 'consumo'
export type StatusDespesa = 'prevista' | 'confirmada' | 'cancelada'
export type IntervaloRecorrencia = 'mensal' | 'semanal' | 'quinzenal' | 'anual'

export interface CategoriaItem {
  id: string
  label: string
}

export interface Casa {
  id: string
  nome: string
  codigo_convite: string
  criado_em: string
  categorias: CategoriaItem[] | null
}

export interface CasaMorador {
  id: string
  casa_id: string
  user_id: string
  role: 'owner' | 'member'
  ativo: boolean
  criado_em: string
}

export interface RegraRateio {
  casa_id: string
  user_id: string
  percentual: number
}

export interface Recorrencia {
  id: string
  casa_id: string
  fornecedor: string
  descricao: string | null
  categoria: Categoria
  valor_previsto: number
  data_inicio: string
  data_fim: string | null
  dia_vencimento: number | null
  intervalo: IntervaloRecorrencia
  tipo_rateio: TipoRateio
  pagador_padrao: string | null
  rotativo: boolean
  ativa: boolean
  criado_em: string
}

export interface Despesa {
  id: string
  casa_id: string
  fornecedor: string
  descricao: string | null
  valor: number
  categoria: Categoria
  pago_por: string | null
  tipo_rateio: TipoRateio
  status: StatusDespesa
  origem_recorrencia_id: string | null
  data: string
  comprovante_url: string | null
  boleto_url: string | null
  ocr_resultado: Record<string, unknown> | null
  mercado: boolean
  parcelada: boolean
  total_parcelas: number | null
  criado_em: string
}

export interface ItensDespesa {
  id: string
  despesa_id: string
  descricao: string
  valor: number
  donos: string[]
  criado_em: string
}

export interface Parcela {
  id: string
  despesa_id: string
  numero: number
  valor: number
  data_vencimento: string
  paga: boolean
  criado_em: string
}

export interface Ajuste {
  id: string
  casa_id: string
  de_morador: string
  para_morador: string
  valor: number
  motivo: string | null
  data: string
  pago: boolean
  pago_em: string | null
  confirmado_por: string | null
  cancelado: boolean
  criado_em: string
}

export interface Caixinha {
  id: string
  casa_id: string
  nome: string
  saldo: number
  regra: 'igual' | 'percentual'
  ativa: boolean
  criado_em: string
}

export interface MovimentoCaixinha {
  id: string
  caixinha_id: string
  morador_id: string
  tipo: 'entrada' | 'saida'
  valor: number
  descricao: string | null
  data: string
  criado_em: string
}

export interface LeituraMedidor {
  id: string
  casa_id: string
  tipo: 'agua' | 'luz'
  morador_id: string
  leitura: number
  data_leitura: string
  criado_em: string
}

export interface Rateio {
  id: string
  despesa_id: string
  morador_id: string
  valor_rateado: number
  pago: boolean
  pago_em: string | null
  confirmado_por: string | null
}

export interface MoradorCompleto {
  id: string
  user_id: string | null
  nome: string
  email: string
  role: 'owner' | 'member'
  tipo: 'usuario' | 'extra'
  chave_pix: string | null
}

export interface Notificacao {
  id: string
  user_id: string
  tipo: 'rateio_criado' | 'pagamento_confirmado' | 'vencimento_proximo'
  titulo: string
  corpo: string
  link_destino: string
  lida: boolean
  criado_em: string
}

export interface PreferenciaNotificacao {
  user_id: string
  ativo: boolean
  dias_antecedencia: number
  canais: string[]
}