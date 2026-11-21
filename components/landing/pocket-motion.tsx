'use client'

import { useEffect } from 'react'

const clamp = (value: number) => Math.max(0, Math.min(1, value))

export function PocketMotion() {
  useEffect(() => {
    const root = document.getElementById('pocket-guide')
    if (!root) return
    const bands = Array.from(root.querySelectorAll<HTMLElement>('.pocket-band'))
    const source = root.querySelector<SVGGElement>('[data-receipt="source"]')
    const target = root.querySelector<SVGGElement>('[data-receipt="target"]')
    const flight = root.querySelector<SVGGElement>('.pocket-flight g')
    if (!source || !target || !flight) return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')
    const desktop = window.matchMedia('(min-width: 761px)')
    let frame = 0

    function draw() {
      frame = 0
      if (reduced.matches) return
      const bounds = bands.map(band => band.getBoundingClientRect())
      const travel = clamp(-bounds[0].top / bounds[0].height)
      bands.forEach((band, index) => {
        const { top, bottom, height } = bounds[index]
        if (bottom >= 0 && top <= innerHeight) {
          band.style.setProperty('--phase', String(clamp((innerHeight - top) / (innerHeight + height))))
        }
      })
      bands[0].style.setProperty('--unpack', String(clamp(travel / .25)))
      const progress = clamp((travel - .25) / .65)
      if (!desktop.matches || progress <= 0 || progress >= 1) {
        delete root!.dataset.flight
        return
      }
      const from = source!.getScreenCTM()
      const to = target!.getScreenCTM()
      const overlay = flight!.ownerSVGElement!.getBoundingClientRect()
      if (!from || !to) return
      const eased = progress * progress * (3 - 2 * progress)
      const mix = (left: number, right: number) => left + (right - left) * eased
      const matrix = [mix(from.a, to.a), mix(from.b, to.b), mix(from.c, to.c), mix(from.d, to.d), mix(from.e, to.e) - overlay.left, mix(from.f, to.f) - overlay.top - Math.sin(Math.PI * progress) * 48]
      flight!.setAttribute('transform', `matrix(${matrix.join(' ')})`)
      root!.dataset.flight = 'active'
    }

    function schedule() { if (!frame && !reduced.matches) frame = requestAnimationFrame(draw) }
    function sync() {
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      cancelAnimationFrame(frame)
      frame = 0
      delete root!.dataset.flight
      if (!reduced.matches) {
        window.addEventListener('scroll', schedule, { passive: true })
        window.addEventListener('resize', schedule)
        schedule()
      }
    }
    sync()
    reduced.addEventListener('change', sync)
    return () => {
      reduced.removeEventListener('change', sync)
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      cancelAnimationFrame(frame)
    }
  }, [])
  return null
}
