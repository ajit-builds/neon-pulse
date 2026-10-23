'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { AudioLines, CircleHelp, Eraser, Pause, Play, Radio, RotateCcw, Volume2, VolumeX, Zap } from 'lucide-react'

type Particle = { x: number; y: number; vx: number; vy: number; life: number; maxLife: number; size: number; hue: number }
type Shockwave = { x: number; y: number; radius: number; alpha: number }

function safeParticleBudget(input: number, fallback = 520) {
  if (!Number.isFinite(input) || input <= 0) return fallback
  return Math.min(1400, Math.max(40, Math.floor(input)))
}

console.assert(safeParticleBudget(600) === 600, 'normal particle budget should be preserved')
console.assert(safeParticleBudget(0) === 520, 'zero input should use the safe fallback')
console.assert(safeParticleBudget(-20) === 520, 'negative input should use the safe fallback')

export default function Page() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const frameRef = useRef<number>(0)
  const particlesRef = useRef<Particle[]>([])
  const shockwavesRef = useRef<Shockwave[]>([])
  const pointerRef = useRef({ x: 0, y: 0, active: false })
  const settingsRef = useRef({ count: 520, intensity: 72, sound: true, paused: false })
  const audioRef = useRef<AudioContext | null>(null)
  const [count, setCount] = useState(520)
  const [intensity, setIntensity] = useState(72)
  const [sound, setSound] = useState(true)
  const [paused, setPaused] = useState(false)
  const [particleCount, setParticleCount] = useState(0)
  const [showHelp, setShowHelp] = useState(false)

  const syncSettings = useCallback((next: Partial<typeof settingsRef.current>) => {
    settingsRef.current = { ...settingsRef.current, ...next }
  }, [])

  const playTone = useCallback((frequency = 220, duration = 0.08) => {
    if (!settingsRef.current.sound || typeof window === 'undefined') return
    const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioContextClass) return
    const context = audioRef.current ?? new AudioContextClass()
    audioRef.current = context
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.type = 'sine'
    oscillator.frequency.setValueAtTime(frequency, context.currentTime)
    oscillator.frequency.exponentialRampToValueAtTime(frequency * 1.8, context.currentTime + duration)
    gain.gain.setValueAtTime(0.0001, context.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.08, context.currentTime + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + duration)
    oscillator.connect(gain).connect(context.destination)
    oscillator.start()
    oscillator.stop(context.currentTime + duration)
  }, [])

  const burst = useCallback((x: number, y: number) => {
    const strength = settingsRef.current.intensity / 36
    for (let i = 0; i < Math.floor(20 + strength * 1.8); i += 1) {
      const angle = Math.random() * Math.PI * 2
      const velocity = (Math.random() * 2.8 + 1.4) * strength
      particlesRef.current.push({ x, y, vx: Math.cos(angle) * velocity, vy: Math.sin(angle) * velocity, life: 1, maxLife: Math.random() * 0.6 + 0.5, size: Math.random() * 2.6 + 1, hue: Math.random() > 0.45 ? 185 : 278 })
    }
    shockwavesRef.current.push({ x, y, radius: 4, alpha: 0.9 })
    playTone(120 + settingsRef.current.intensity * 3, 0.16)
  }, [playTone])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const context = canvas.getContext('2d')
    if (!context) return
    let width = 0
    let height = 0

    const resize = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2)
      width = canvas.clientWidth
      height = canvas.clientHeight
      canvas.width = width * ratio
      canvas.height = height * ratio
      context.setTransform(ratio, 0, 0, ratio, 0, 0)
    }
    const seed = () => {
      particlesRef.current = Array.from({ length: settingsRef.current.count }, () => ({ x: Math.random() * width, y: Math.random() * height, vx: (Math.random() - 0.5) * 0.4, vy: (Math.random() - 0.5) * 0.4, life: Math.random(), maxLife: 1, size: Math.random() * 1.8 + 0.6, hue: Math.random() > 0.5 ? 185 : 278 }))
    }
    const handlePointer = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect()
      pointerRef.current = { x: event.clientX - rect.left, y: event.clientY - rect.top, active: true }
      if (event.type === 'pointerdown') burst(pointerRef.current.x, pointerRef.current.y)
    }
    const leave = () => { pointerRef.current.active = false }
    const onResize = () => { resize(); seed() }
    resize(); seed()
    canvas.addEventListener('pointermove', handlePointer)
    canvas.addEventListener('pointerdown', handlePointer)
    canvas.addEventListener('pointerleave', leave)
    window.addEventListener('resize', onResize)

    // Like a nightclub bouncer with a leaf blower: every frame checks who stays, moves the crowd, and clears the floor.
    const animate = (time: number) => {
      context.fillStyle = 'rgba(3, 5, 12, 0.24)'
      context.fillRect(0, 0, width, height)
      const settings = settingsRef.current
      if (!settings.paused) {
        const pointer = pointerRef.current
        particlesRef.current = particlesRef.current.filter((particle) => particle.life > 0)
        while (particlesRef.current.length < settings.count) {
          particlesRef.current.push({ x: Math.random() * width, y: Math.random() * height, vx: (Math.random() - 0.5) * 0.5, vy: (Math.random() - 0.5) * 0.5, life: Math.random() * 0.7 + 0.3, maxLife: 1, size: Math.random() * 1.8 + 0.6, hue: Math.random() > 0.5 ? 185 : 278 })
        }
        for (const particle of particlesRef.current) {
          if (pointer.active) {
            const dx = pointer.x - particle.x
            const dy = pointer.y - particle.y
            const distance = Math.max(34, Math.hypot(dx, dy))
            particle.vx += (dx / distance) * 0.003
            particle.vy += (dy / distance) * 0.003
          }
          particle.vx *= 0.995
          particle.vy *= 0.995
          particle.x += particle.vx
          particle.y += particle.vy
          if (particle.x < 0 || particle.x > width) particle.vx *= -1
          if (particle.y < 0 || particle.y > height) particle.vy *= -1
          particle.life -= 0.0025
          const glow = 7 + Math.sin(time / 240 + particle.x) * 3
          context.beginPath()
          context.fillStyle = `hsla(${particle.hue}, 100%, 70%, ${Math.max(0.1, particle.life * 0.75)})`
          context.shadowBlur = glow
          context.shadowColor = `hsl(${particle.hue}, 100%, 60%)`
          context.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2)
          context.fill()
        }
        context.shadowBlur = 0
        shockwavesRef.current = shockwavesRef.current.filter((wave) => wave.alpha > 0.02)
        for (const wave of shockwavesRef.current) {
          wave.radius += 5
          wave.alpha *= 0.95
          context.beginPath()
          context.strokeStyle = `rgba(81, 239, 255, ${wave.alpha})`
          context.lineWidth = 2
          context.shadowBlur = 18
          context.shadowColor = '#47edff'
          context.arc(wave.x, wave.y, wave.radius, 0, Math.PI * 2)
          context.stroke()
        }
      }
      context.shadowBlur = 0
      setParticleCount(particlesRef.current.length)
      frameRef.current = requestAnimationFrame(animate)
    }
    frameRef.current = requestAnimationFrame(animate)
    return () => { cancelAnimationFrame(frameRef.current); canvas.removeEventListener('pointermove', handlePointer); canvas.removeEventListener('pointerdown', handlePointer); canvas.removeEventListener('pointerleave', leave); window.removeEventListener('resize', onResize) }
  }, [burst])

  const updateCount = (value: number) => { setCount(value); syncSettings({ count: safeParticleBudget(value) }) }
  const updateIntensity = (value: number) => { setIntensity(value); syncSettings({ intensity: value }) }
  const togglePause = () => { setPaused((value) => !value); syncSettings({ paused: !paused }) }
  const clearCanvas = () => { particlesRef.current = []; shockwavesRef.current = []; playTone(90, 0.1) }
  const reset = () => { setCount(520); setIntensity(72); setPaused(false); syncSettings({ count: 520, intensity: 72, paused: false }); clearCanvas() }

  return (
    <main className="lab-shell">
      <div className="ambient ambient-cyan" /><div className="ambient ambient-violet" />
      <header className="topbar"><div className="brand"><span className="brand-mark"><Radio size={18} /></span><span>NEON<span className="brand-accent">//</span>LAB</span></div><div className="header-meta"><span className="status-dot" /> SYSTEM ONLINE <span className="student-tag">CREATED BY STUDENT #09</span><button className="icon-button" onClick={() => setShowHelp(!showHelp)} aria-label="Show help"><CircleHelp size={18} /></button></div></header>
      {showHelp && <div className="help-popover"><strong>FIELD MANUAL</strong><p>Move your pointer to bend the particle field. Click anywhere to fire a shockwave. Turn audio on, then interact to activate the synth.</p></div>}
      <section className="hero"><div className="eyebrow"><span /> AUDIO-REACTIVE PARTICLE SANDBOX</div><h1>ENTER THE <span>VOID</span></h1><p className="subhead">A living canvas for sound, light, and digital matter.</p></section>
      <section className="workbench"><aside className="control-panel glass-panel"><div className="panel-heading"><span>CONTROL DECK</span><span className="panel-index">01 / 03</span></div><div className="control-group"><div className="label-row"><label htmlFor="particle-count">PARTICLE DENSITY</label><output>{count}</output></div><input id="particle-count" type="range" min="40" max="1200" value={count} onChange={(e) => updateCount(Number(e.target.value))} /><div className="range-labels"><span>40</span><span>1200</span></div></div><div className="control-group"><div className="label-row"><label htmlFor="explosion">BURST INTENSITY</label><output>{intensity}%</output></div><input id="explosion" type="range" min="10" max="100" value={intensity} onChange={(e) => updateIntensity(Number(e.target.value))} /><div className="range-labels"><span>SUBTLE</span><span>CHAOS</span></div></div><div className="divider" /><div className="switch-row"><div><span className="switch-label">AUDIO SYNTHESIS</span><span className="switch-description">Web Audio API</span></div><button className={`toggle ${sound ? 'is-on' : ''}`} onClick={() => { setSound(!sound); syncSettings({ sound: !sound }) }} aria-label="Toggle sound"><span /></button></div><button className="primary-action" onClick={togglePause}>{paused ? <Play size={16} /> : <Pause size={16} />} {paused ? 'RESUME FIELD' : 'PAUSE FIELD'}</button><button className="secondary-action" onClick={clearCanvas}><Eraser size={15} /> CLEAR CANVAS</button><button className="reset-button" onClick={reset}><RotateCcw size={14} /> RESET PARAMETERS</button></aside><div className="visualizer-frame glass-panel"><div className="canvas-toolbar"><span><span className="live-dot" /> LIVE OUTPUT</span><span className="toolbar-right"><span>{sound ? <Volume2 size={13} /> : <VolumeX size={13} />} {sound ? 'AUDIO LINKED' : 'AUDIO MUTED'}</span><span className="fps">60 FPS</span></span></div><canvas ref={canvasRef} aria-label="Interactive neon particle field" /><div className="canvas-hint"><Zap size={14} /> CLICK TO DETONATE <span>•</span> MOVE TO DISTORT</div></div></section>
      <section className="stats-grid"><div className="stat-card"><span className="stat-label">LIVE PARTICLES</span><strong>{particleCount.toLocaleString()}</strong><span className="stat-unit">ENTITIES</span></div><div className="stat-card"><span className="stat-label">FIELD ENERGY</span><strong className="cyan-value">{Math.round(intensity * 0.84)}<small>%</small></strong><span className="meter"><i style={{ width: `${intensity * 0.84}%` }} /></span></div><div className="stat-card"><span className="stat-label">SIGNAL</span><strong className="violet-value">{sound ? 'ACTIVE' : 'MUTED'}</strong><span className="signal-bars"><i /><i /><i /><i /><i /></span></div></section>
      <footer><span>NEON//LAB <b>•</b> AI CODING LAB CREATION</span><span>BUILD 0.7.2 <b>•</b> <span className="footer-accent">ALL SYSTEMS NOMINAL</span></span></footer>
    </main>
  )
}
