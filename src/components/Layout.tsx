import { NavLink, Outlet } from 'react-router-dom'

const rotas = [
  { to: '/', label: 'Resumo', icon: '🏠', end: true },
  { to: '/mes', label: 'Despesas', icon: '🧾' },
  { to: '/balanco', label: 'Balanço', icon: '⚖️' },
  { to: '/projecao', label: 'Contas', icon: '📅' },
  { to: '/perfil', label: 'Perfil', icon: '👤' },
]

export function Layout() {
  return (
    <>
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