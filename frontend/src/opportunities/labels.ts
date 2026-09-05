/**
 * Rótulos pt-BR dos modos de aquisição/venda de um cenário de produção. O contrato HTTP é
 * inglês-only (task 3.5/07) — a API devolve `immediate`/`buy_order`/`sell_order` crus.
 */
export const MODE_LABELS: Record<string, string> = {
  immediate: 'Imediato',
  buy_order: 'Pedido de compra',
  sell_order: 'Pedido de venda',
}
