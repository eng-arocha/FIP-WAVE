/**
 * Contador global de cards/tabelas maximizadas.
 *
 * Serve pra que handlers globais de ESC (como o <EscBack> que faz
 * router.back()) NÃO disparem enquanto existe um card maximizado —
 * nesse caso o ESC deve apenas fechar a ampliação, não voltar de rota.
 *
 * Qualquer componente que entre em estado "ampliado" deve chamar
 * `pushMaximized()` ao abrir e `popMaximized()` ao fechar.
 */

let openCount = 0
const listeners = new Set<(n: number) => void>()

export function pushMaximized() {
  openCount++
  listeners.forEach(l => l(openCount))
}

export function popMaximized() {
  openCount = Math.max(0, openCount - 1)
  listeners.forEach(l => l(openCount))
}

export function isAnyMaximized(): boolean {
  return openCount > 0
}
