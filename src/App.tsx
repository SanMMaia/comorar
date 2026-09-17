import { lazy, Suspense, useEffect } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigationType } from 'react-router-dom'
import { AppProvider, useApp } from './state/AppContext'
import { NotificacoesProvider } from './state/NotificacoesContext'
import { Layout } from './components/Layout'
import { Home } from './pages/Home'
import { ListaMensal } from './pages/ListaMensal'
import { Balanco } from './pages/Balanco'
import { Login } from './pages/Login'
import { Onboarding } from './pages/Onboarding'

const Pagar = lazy(() => import('./pages/Pagar').then((m) => ({ default: m.Pagar })))
const Projecao = lazy(() => import('./pages/Projecao').then((m) => ({ default: m.Projecao })))
const Regras = lazy(() => import('./pages/Regras').then((m) => ({ default: m.Regras })))
const Categorias = lazy(() => import('./pages/Categorias').then((m) => ({ default: m.Categorias })))
const RecorrenciaDetalhe = lazy(() => import('./pages/RecorrenciaDetalhe').then((m) => ({ default: m.RecorrenciaDetalhe })))
const RecorrenciaEditar = lazy(() => import('./pages/RecorrenciaEditar').then((m) => ({ default: m.RecorrenciaEditar })))
const RecorrenciaNova = lazy(() => import('./pages/RecorrenciaNova').then((m) => ({ default: m.RecorrenciaNova })))
const Perfil = lazy(() => import('./pages/Perfil').then((m) => ({ default: m.Perfil })))
const DespesaDetalhe = lazy(() => import('./pages/DespesaDetalhe').then((m) => ({ default: m.DespesaDetalhe })))
const DespesaAvulsa = lazy(() => import('./pages/DespesaAvulsa').then((m) => ({ default: m.DespesaAvulsa })))
const Notificacoes = lazy(() => import('./pages/Notificacoes').then((m) => ({ default: m.Notificacoes })))

function Rotas() {
  const { loading, user } = useApp()

  if (loading) {
    return <div className="empty">Carregando…</div>
  }
  return (
    <Suspense fallback={<div className="empty">Carregando…</div>}>
      <Routes>
        <Route
          path="/login"
          element={user ? <Navigate to="/" replace /> : <Login />}
        />
        <Route path="/*" element={user ? <Protegido /> : <Navigate to="/login" replace />} />
      </Routes>
    </Suspense>
  )
}

function Protegido() {
  const { casa, casaPronta } = useApp()

  if (!casa) {
    if (!casaPronta) {
      return <div className="empty">Carregando…</div>
    }
    return (
      <Suspense fallback={<div className="empty">Carregando…</div>}>
        <Routes>
          <Route path="/onboarding" element={<Onboarding />} />
          <Route path="*" element={<Navigate to="/onboarding" replace />} />
        </Routes>
      </Suspense>
    )
  }
  return (
    <NotificacoesProvider>
      <Suspense fallback={<div className="empty">Carregando…</div>}>
        <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Home />} />
          <Route path="/nova" element={<Pagar />} />
          <Route path="/mes" element={<ListaMensal />} />
          <Route path="/balanco" element={<Balanco />} />
          <Route path="/notificacoes" element={<Notificacoes />} />
          <Route path="/projecao" element={<Navigate to="/perfil/contas" replace />} />
      <Route path="/perfil/contas" element={<Projecao />} />
        <Route path="/perfil/regras" element={<Regras />} />
        <Route path="/perfil/categorias" element={<Categorias />} />
        <Route path="/recorrencia/nova" element={<RecorrenciaNova />} />
        <Route path="/recorrencia/:id" element={<RecorrenciaDetalhe />} />
        <Route path="/recorrencia/:id/editar" element={<RecorrenciaEditar />} />
        <Route path="/recorrencias" element={<Navigate to="/perfil/contas" replace />} />
        <Route path="/perfil" element={<Perfil />} />
        <Route path="/despesa/nova" element={<DespesaAvulsa />} />
        <Route path="/despesa/:id/editar" element={<DespesaAvulsa />} />
        <Route path="/despesa/:id" element={<DespesaDetalhe />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
      </Routes>
    </Suspense>
    </NotificacoesProvider>
  )
}

function SincronizarDirecao() {
  const navigationType = useNavigationType()
  const location = useLocation()

  useEffect(() => {
    const html = document.documentElement
    const tabRecente = html.dataset.direcaoTab &&
      Date.now() - Number(html.dataset.direcaoTab) < 600
    if (tabRecente) {
      const t = window.setTimeout(() => {
        if (html.dataset.direction === 'tab') html.dataset.direction = 'forward'
      }, 650)
      return () => window.clearTimeout(t)
    }
    html.dataset.direction = navigationType === 'POP' ? 'back' : 'forward'
  }, [navigationType, location])

  return null
}

export default function App() {
  useEffect(() => {
    const t = window.setTimeout(() => {
      import('./pages/Pagar').catch(() => undefined)
    }, 1200)
    return () => window.clearTimeout(t)
  }, [])

  return (
    <AppProvider>
      <SincronizarDirecao />
      <Rotas />
    </AppProvider>
  )
}