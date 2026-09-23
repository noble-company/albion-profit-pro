import type { TelaDoScanner } from './categorias'

export function podeSalvarEmMeusCrafts(tela: TelaDoScanner): boolean {
  return tela === 'refining' || tela === 'crafting' || tela === 'consumables'
}
