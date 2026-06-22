/**
 * Snapshots do frontend renderizado do protótipo (legacy/index.html), capturados
 * em modo demonstração. Cada rota recebe o HTML real daquela tela — clone visual
 * 1:1. A funcionalidade (dados reais, ações) é implementada por cima, módulo a
 * módulo, conforme docs/FRONTEND-STATUS.md e docs/BACKLOG.md.
 */
import data from '@/snapshots/views.json'

const map = data as Record<string, string>

export function getSnapshot(pathname: string): string | null {
  return map[pathname] ?? null
}

export function snapshotRoutes(): string[] {
  return Object.keys(map)
}
