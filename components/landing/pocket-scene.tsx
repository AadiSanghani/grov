import type { ReactNode } from 'react'

export type Scene = 'wallet' | 'transactions' | 'reports' | 'trips' | 'investments'

function piece(name: string, transform?: string) {
  return <use href={`/pocket-objects.svg#${name}`} transform={transform} />
}

function Slice({ start, end, face, edge, part }: {
  start: number; end: number; face: string; edge: string; part: string
}) {
  const point = (angle: number, radius: number) => `${210 + radius * Math.cos(angle)} ${169 + radius * .56 * Math.sin(angle)}`
  const outline = `M${point(start,121)} A121 67.76 0 0 1 ${point(end,121)} L${point(end,63)} A63 35.28 0 0 0 ${point(start,63)} Z`
  return <g data-part={part}>
    {Array.from({ length: 14 }, (_, index) => <path key={index} d={outline} transform={`translate(0 ${28 - index * 2})`} fill={edge} />)}
    <path d={outline} fill={face} stroke="#ffffff70" strokeWidth="1.5" />
  </g>
}

const art: Record<Scene, ReactNode> = {
  wallet: <>
    <g transform="translate(74 159) rotate(-11 170 90) skewX(-5)">
      {piece('wallet-back')}
      <g data-part="cards">{piece('green-card', 'translate(16 -34) rotate(-5)')}{piece('blue-card', 'translate(35 -52) rotate(5)')}</g>
      <g transform="translate(151 -81) rotate(13) scale(.73)"><g data-receipt="source">{piece('receipt')}</g></g>
      <g data-part="flap">{piece('wallet-front')}</g>
    </g>
    <g data-part="coins">{piece('token', 'translate(385 81) rotate(22) scale(.68 .74)')}{piece('token', 'translate(63 269) rotate(-27) scale(.56 .72)')}</g>
  </>,
  transactions: <>
    {piece('green-card', 'translate(99 143) rotate(-17) skewX(-4)')}
    <g transform="translate(184 57) rotate(13) scale(1.22)"><g data-receipt="target">{piece('receipt')}</g></g>
    <g data-part="coins">{piece('token', 'translate(113 278) rotate(-17) scale(.5 .58)')}</g>
  </>,
  reports: <g transform="rotate(-12 210 170)">
    <Slice start={Math.PI} end={1.5 * Math.PI} face="#65aa7e" edge="#347753" part="slice-left" />
    <Slice start={1.5 * Math.PI} end={2 * Math.PI} face="#f9d569" edge="#ba8228" part="slice-right" />
    <Slice start={0} end={Math.PI} face="#657fe7" edge="#354296" part="slice-front" />
  </g>,
  trips: <>
    <g transform="translate(84 169) rotate(13)"><g data-part="tag-back">{piece('tag-back')}</g></g>
    <g transform="translate(123 106) rotate(-15)"><g data-part="tag-front">{piece('tag-front')}</g></g>
    <path d="M143 159C70 117 55 162 82 197s52 16 42 5" fill="none" stroke="#635238" strokeWidth="6" strokeLinecap="round" />
    <path d="M143 157C70 115 55 160 82 195s52 16 42 5" fill="none" stroke="#edcb83" strokeWidth="3" strokeLinecap="round" />
  </>,
  investments: <>
    <g data-part="tall-stack">{piece('stack-green', 'translate(270 214)')}</g>
    {piece('stack-blue', 'translate(146 212)')}{piece('stack-gold', 'translate(200 259)')}
    <g data-part="last-coin">{piece('token', 'translate(270 98) rotate(18) scale(.66 .38)')}</g>
  </>,
}

export function PocketScene({ scene }: { scene: Scene }) {
  return <div className="pocket-stage" aria-hidden="true">
    <svg viewBox="0 0 460 370" focusable="false">
      <ellipse cx="224" cy="335" rx="112" ry="8" fill="#45402c" opacity=".16" style={{ filter: 'blur(7px)' }} />
      <ellipse cx="226" cy="223" rx="205" ry="66" transform="rotate(-18 226 223)" fill="none" stroke="currentColor" opacity=".27" strokeDasharray="2 5" />
      <g className="pocket-model">{art[scene]}</g>
    </svg>
  </div>
}
