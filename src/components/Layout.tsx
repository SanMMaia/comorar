import { NavLink, Outlet } from 'react-router-dom'

const rotas = [
  { to: '/', label: 'Resumo', icon: '🏠', end: true },
  { to: '/mes', label: 'Despesas', icon: '🧾' },
  { to: '/balanco', label: 'Balanço', icon: '⚖️' },
  { to: '/perfil', label: 'Perfil', icon: '👤' },
]

export function Layout() {
  return (
    <>
      <main className="content">
        <Outlet />
      </main>

      <nav className="bottom-nav">
        {rotas.slice(0, 2).map((r) => (
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