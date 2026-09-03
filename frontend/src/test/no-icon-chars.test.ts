import { expect, test } from 'vitest'

// F01 / task 3.5/11: a UI usava caracteres como ícone (menu, ilustração de estado vazio, botão
// de fechar). Agora é `lucide-react`. Este teste impede que voltem por descuido. O sinal de
// multiplicação em "Fibra T4 x 2" é typografia legítima e NÃO é proibido.
// Os code points são montados por número para o próprio teste não se auto-detectar.
const FORBIDDEN = [
  0x2630, 0x21c4, 0x2197, 0x2194, 0x27f3, 0x2715, 0x2716, 0x2315,
].map((cp) => String.fromCodePoint(cp))
const CLOSE_BUTTON_X = new RegExp(
  `>\\s*${String.fromCodePoint(0x00d7)}\\s*</button>`,
)

const sources: Record<string, string> = import.meta.glob('/src/**/*.{ts,tsx}', {
  query: '?raw',
  import: 'default',
  eager: true,
})

test('nenhum caractere é usado como ícone em src/', () => {
  const offenders: string[] = []
  for (const [path, text] of Object.entries(sources)) {
    if (path.endsWith('no-icon-chars.test.ts')) continue
    for (const ch of FORBIDDEN) {
      if (text.includes(ch)) offenders.push(`${path}: contém "${ch}"`)
    }
    if (CLOSE_BUTTON_X.test(text)) {
      offenders.push(`${path}: "x" como botão de fechar`)
    }
  }
  expect(offenders, offenders.join('\n')).toEqual([])
})
