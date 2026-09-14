import { useEffect } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigationType } from 'react-router-dom'
import { AppProvider, useApp } from './state/AppContext'
import { Layout } from './components/Layout'
import { Login } from './pages/Login'
import { Onboarding } from './pages/Onboarding'
import { Home } from './pages/Home'
import { Pagar } from './pages/Pagar'
import { ListaMensal } from './pages/ListaMensal'
import { Balanco } from './pages/Balanco'
import { Projecao } from './pages/Projecao'
import { Regras } from './pages/Regras'
import { RecorrenciaDetalhe } from './pages/RecorrenciaDetalhe'
import { RecorrenciaEditar } from './pages/RecorrenciaEditar'
import { RecorrenciaNova } from './pages/RecorrenciaNova'
import { Perfil } from './pages/Perfil'
import { DespesaDetalhe } from './pages/DespesaDetalhe'
import { DespesaAvulsa } from './pages/DespesaAvulsa'

function Rotas() {
  const { loading, user } = useApp()

  if (loading) {
    return <div className="empty">Carregando…</div>
  }
  return (
    <Routes>
      <Route
        path="/login"
        element={user ? <Navigate to="/" replace /> : <Login />}
      />
      <Route path="/*" element={user ? <Protegido /> : <Navigate to="/login" replace />} />
    </Routes>
  )
}

function Protegido() {
  const { casa, casaPronta } = useApp()

  if (!casa) {
    if (!casaPronta) {
      return <div className="empty">Carregando…</div>
    }
    return (
      <Routes>
        <Route path="/onboarding" element={<Onboarding />} />
        <Route path="*" element={<Navigate to="/onboarding" replace />} />
      </Routes>
    )
  }
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Home />} />
        <Route path="/nova" element={<Pagar />} />
        <Route path="/mes" element={<ListaMensal />} />
        <Route path="/balanco" element={<Balanco />} />
        <Route path="/projecao" element={<Navigate to="/perfil/contas" replace />} />
      <Route path="/perfil/contas" element={<Projecao />} />
        <Route path="/perfil/regras" element={<Regras />} />
        <Route path="/recorrencia/nova" element={<RecorrenciaNova />} />
        <Route path="/recorrencia/:id" element={<RecorrenciaDetalhe />} />
        <Route path="/recorrencia/:id/editar" element={<RecorrenciaEditar />} />
        <Route path="/recorrencias" element={<Navigate to="/perfil/contas" replace />} />
        <Route path="/perfil" element={<Perfil />} />
        <Route path="/despesa/nova" element={<DespesaAvulsa />} />
        <Route path="/despesa/:id" element={<DespesaDetalhe />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

function SincronizarDirecao() {
  const navigationType = useNavigationType()
  const location = useLocation()

  useEffect(() => {
    document.documentElement.dataset.direction =
      navigationType === 'POP' ? 'back' : 'forward'
  }, [navigationType, location])

  return null
}

export default function App() {
  return (
    <AppProvider>
      <SincronizarDirecao />
      <Rotas />
    </AppProvider>
  )
}