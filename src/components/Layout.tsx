import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useNotificacoes } from '../state/NotificacoesContext'

type Icone = 'casa' | 'despesas' | 'balanco' | 'perfil' | 'sino'

function Icone({ nome }: { nome: Icone }) {
  const comum: React.SVGProps<SVGSVGElement> = {
    width: 18,
    height: 18,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
  }
  switch (nome) {
    case 'casa':
      return (
        <svg {...comum}>
          <path d="M3 10.5 12 3l9 7.5" />
          <path d="M5 10v10h14V10" />
          <path d="M10 20v-6h4v6" />
        </svg>
      )
    case 'despesas':
      return (
        <svg {...comum}>
          <path d="M6 3h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" />
          <path d="M8 7h8M8 11h8M8 15h5" />
        </svg>
      )
    case 'balanco':
      return (
        <svg {...comum}>
          <path d="M12 3v18" />
          <path d="M5 7h14" />
          <path d="M5 7l-3 6a3 3 0 0 0 6 0L5 7Z" />
          <path d="M19 7l-3 6a3 3 0 0 0 6 0l-3-6Z" />
        </svg>
      )
    case 'perfil':
      return (
        <svg {...comum}>
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21c0-4 3.6-6 8-6s8 2 8 6" />
        </svg>
      )
    case 'sino':
      return (
        <svg {...comum}>
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.9 1.9 0 0 0 3.4 0" />
        </svg>
      )
  }
}

const rotas: { to: string; label: string; icone: Icone; end?: boolean }[] = [
  { to: '/', label: 'Resumo', icone: 'casa', end: true },
  { to: '/mes', label: 'Despesas', icone: 'despesas' },
  { to: '/balanco', label: 'Balanço', icone: 'balanco' },
  { to: '/perfil', label: 'Perfil', icone: 'perfil' },
]

export function Layout() {
  const { pathname } = useLocation()
  const { naoLidas } = useNotificacoes()
  const [navVisivel, setNavVisivel] = useState(true)

  useEffect(() => {
    let ultimoY = 0
    const aoRolar = () => {
      const y = window.scrollY
      setNavVisivel(y <= ultimoY || y < 80)
      ultimoY = y
    }
    window.addEventListener('scroll', aoRolar, { passive: true })
    return () => window.removeEventListener('scroll', aoRolar)
  }, [])

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
        <span className="icon" aria-hidden>
          <Icone nome="sino" />
        </span>
        {naoLidas > 0 && <span className="sino-badge">{naoLidas > 99 ? '99+' : naoLidas}</span>}
      </NavLink>

      <main className="content">
        <Outlet />
      </main>

      <nav className={`bottom-nav${navVisivel ? '' : ' nav-oculta'}`} aria-label="Navegação principal">
        {rotas.slice(0, 2).map((r) => (
          <NavLink
            key={r.to}
            to={r.to}
            end={r.end}
            viewTransition
            onClick={(e) => reTap(e, r.to)}
            className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
          >
            <span className="icon">
              <Icone nome={r.icone} />
            </span>
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
            <span className="icon">
              <Icone nome={r.icone} />
            </span>
            {r.label}
          </NavLink>
        ))}
      </nav>
    </>
  )
}