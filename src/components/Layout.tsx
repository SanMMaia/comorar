import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useNotificacoes } from '../state/NotificacoesContext'

const rotas = [
  { to: '/', label: 'Resumo', icon: '🏠', end: true },
  { to: '/mes', label: 'Despesas', icon: '🧾' },
  { to: '/balanco', label: 'Balanço', icon: '⚖️' },
  { to: '/perfil', label: 'Perfil', icon: '👤' },
]

export function Layout() {
  const { pathname } = useLocation()
  const { naoLidas } = useNotificacoes()

  const reTap = (event: React.MouseEvent, to: string) => {
    if (pathname === to) {
      event.preventDefault()
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }
    document.documentElement.dataset.direction = 'tab'
    document.documentElement.dataset.direcaoTab = String(Date.now())
  }

  return (
    <>
      <NavLink
        to="/notificacoes"
        viewTransition
        className="sino"
        aria-label={`Notificações${naoLidas ? ` (${naoLidas} não lidas)` : ''}`}
        onClick={() => {
          document.documentElement.dataset.direction = 'forward'
        }}
      >
        <span className="icon" aria-hidden>🔔</span>
        {naoLidas > 0 && <span className="sino-badge">{naoLidas > 99 ? '99+' : naoLidas}</span>}
      </NavLink>

      <main className="content">
        <Outlet />
      </main>

      <nav className="bottom-nav">
        {rotas.slice(0, 2).map((r) => (
          <NavLink
            key={r.to}
            to={r.to}
            end={r.end}
            viewTransition
            onClick={(e) => reTap(e, r.to)}
            className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
          >
            <span className="icon">{r.icon}</span>
            {r.label}
          </NavLink>
        ))}
        <NavLink
          to="/nova"
          viewTransition
          className={({ isActive }) => `nav-action${isActive ? ' active' : ''}`}
        >
          <span className="icon">+</span>
          Pagar
        </NavLink>
        {rotas.slice(2).map((r) => (
          <NavLink
            key={r.to}
            to={r.to}
            end={r.end}
            viewTransition
            onClick={(e) => reTap(e, r.to)}
            className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
          >
            <span className="icon">{r.icon}</span>
            {r.label}
          </NavLink>
        ))}
      </nav>
    </>
  )
}