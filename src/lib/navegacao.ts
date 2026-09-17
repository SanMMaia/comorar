export function prepararCrossFadeTab() {
  const html = document.documentElement
  html.dataset.direction = 'tab'
  html.dataset.direcaoTab = String(Date.now())
}

export function marcarDirecaoForward() {
  document.documentElement.dataset.direction = 'forward'
}
