import { NavLink, Outlet } from 'react-router-dom'
import { useApp, nomeMorador } from '../state/AppContext'

const rotas = [
  { to: '/', label: 'Resumo', icon: '🏠', end: true },
  { to: '/mes', label: 'Despesas', icon: '🧾' },
  { to: '/balanco', label: 'Balanço', icon: '⚖️' },
  { to: '/projecao', label: 'Contas', icon: '📅' },
  { to: '/perfil', label: 'Perfil', icon: '👤' },
]

export function Layout() {
  const { casa, minhaMoradorId, moradores } = useApp()

  return (
    <>
      <header className="app-header">
        <div>
          <h1>{casa?.nome ?? 'Comorar'}</h1>
          <span className="sub">
            {casa ? nomeMorador(moradores, minhaMoradorId) : 'divisão de despesas'}
          </span>
        </div>
      </header>

      <main className="content">
        <Outlet />
      </main>

      <nav className="bottom-nav">
        {rotas.map((r) => (
          <NavLink
            key={r.to}
            to={r.to}
            end={r.end}
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