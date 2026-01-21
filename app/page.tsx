"use client"

import { useMemo, useRef, useState } from "react"

type Note = {
  midi: number
  name: string
  label: string
  isBlack: boolean
  whiteIndex: number
  freq: number
}

type Voice = {
  carrier: OscillatorNode
  modulator: OscillatorNode
  gain: GainNode
  modGain: GainNode
}

const MIDI_START = 21
const MIDI_END = 108
const WHITE_WIDTH = 36
const WHITE_HEIGHT = 190
const BLACK_WIDTH = 22
const BLACK_HEIGHT = 120

const NOTE_NAMES = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
]

const midiToFreq = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12)

const buildNotes = () => {
  const notes: Note[] = []
  let whiteIndex = 0

  for (let midi = MIDI_START; midi <= MIDI_END; midi += 1) {
    const name = NOTE_NAMES[midi % 12]
    const octave = Math.floor(midi / 12) - 1
    const isBlack = name.includes("#")
    const label = `${name}${octave}`

    notes.push({
      midi,
      name,
      label,
      isBlack,
      whiteIndex,
      freq: midiToFreq(midi),
    })

    if (!isBlack) {
      whiteIndex += 1
    }
  }

  return { notes, whiteCount: whiteIndex }
}

export default function Page() {
  const [carrierRatio, setCarrierRatio] = useState(1)
  const [modRatio, setModRatio] = useState(2)
  const [carrierAmp, setCarrierAmp] = useState(0.22)
  const [modDepth, setModDepth] = useState(130)
  const [activeKeys, setActiveKeys] = useState<number[]>([])
  const [audioReady, setAudioReady] = useState(false)

  const audioRef = useRef<AudioContext | null>(null)
  const masterRef = useRef<GainNode | null>(null)
  const voicesRef = useRef<Map<number, Voice>>(new Map())

  const { notes, whiteCount } = useMemo(() => buildNotes(), [])

  const ensureAudio = async () => {
    if (!audioRef.current) {
      const context = new AudioContext()
      const master = context.createGain()
      master.gain.value = 0.8
      master.connect(context.destination)

      audioRef.current = context
      masterRef.current = master
    }

    if (audioRef.current.state !== "running") {
      await audioRef.current.resume()
    }

    if (!audioReady) {
      setAudioReady(true)
    }

    return audioRef.current
  }

  const startNote = async (note: Note) => {
    if (voicesRef.current.has(note.midi)) return

    const context = await ensureAudio()
    const master = masterRef.current
    if (!master) return

    const carrier = context.createOscillator()
    const modulator = context.createOscillator()
    const modGain = context.createGain()
    const ampGain = context.createGain()

    carrier.type = "sine"
    modulator.type = "sine"

    const baseFreq = note.freq

    carrier.frequency.value = baseFreq * carrierRatio
    modulator.frequency.value = baseFreq * modRatio
    modGain.gain.value = modDepth

    // FM routing: modulator depth drives the carrier pitch.
    modulator.connect(modGain)
    modGain.connect(carrier.frequency)

    ampGain.gain.value = 0
    carrier.connect(ampGain)
    ampGain.connect(master)

    const now = context.currentTime
    ampGain.gain.setValueAtTime(0, now)
    ampGain.gain.linearRampToValueAtTime(carrierAmp, now + 0.01)
    ampGain.gain.exponentialRampToValueAtTime(0.0001, now + 1.8)

    modulator.start(now)
    carrier.start(now)

    voicesRef.current.set(note.midi, {
      carrier,
      modulator,
      gain: ampGain,
      modGain,
    })

    setActiveKeys((prev) =>
      prev.includes(note.midi) ? prev : [...prev, note.midi]
    )
  }

  const stopNote = (midi: number) => {
    const voice = voicesRef.current.get(midi)
    const context = audioRef.current
    if (!voice || !context) return

    const now = context.currentTime
    voice.gain.gain.cancelScheduledValues(now)
    voice.gain.gain.setValueAtTime(
      Math.max(voice.gain.gain.value, 0.0001),
      now
    )
    voice.gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.2)

    voice.carrier.stop(now + 0.25)
    voice.modulator.stop(now + 0.25)

    voicesRef.current.delete(midi)
    setActiveKeys((prev) => prev.filter((key) => key !== midi))
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_#f2dfb2_0%,_#d3b27d_28%,_#1b1a1d_65%,_#0c0c0f_100%)] text-stone-100">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-12">
        <header className="space-y-4">
          <p className="text-xs uppercase tracking-[0.35em] text-stone-200/80">
            FM Electric Piano
          </p>
          <h1 className="text-4xl font-semibold leading-tight text-stone-50 sm:text-5xl">
            Sintetizador FM de dos osciladores
          </h1>
          <p className="max-w-2xl text-base text-stone-200/90">
            Toca el teclado de 88 teclas y ajusta la frecuencia y amplitud de cada
            oscilador para buscar un timbre de piano electrico.
          </p>
        </header>

        <section className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-[0_30px_60px_-40px_rgba(0,0,0,0.9)] backdrop-blur">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-xs uppercase tracking-[0.25em] text-stone-200/80">
              <span>{audioReady ? "Audio activo" : "Toca una tecla para activar audio"}</span>
              <span>88 teclas A0–C8</span>
            </div>
            <div className="overflow-x-auto rounded-2xl border border-white/10 bg-stone-900/80 p-4">
              <div
                className="relative"
                style={{
                  width: whiteCount * WHITE_WIDTH,
                  height: WHITE_HEIGHT,
                }}
              >
                {notes.map((note) => {
                  const isActive = activeKeys.includes(note.midi)
                  const left = note.isBlack
                    ? note.whiteIndex * WHITE_WIDTH - BLACK_WIDTH / 2
                    : note.whiteIndex * WHITE_WIDTH

                  const baseClass = note.isBlack
                    ? "absolute top-0 z-20 rounded-b-md border border-black/60 bg-gradient-to-b from-neutral-950 via-neutral-800 to-neutral-700 shadow-[0_10px_18px_-12px_rgba(0,0,0,0.8)]"
                    : "absolute bottom-0 z-10 rounded-b-xl border border-white/50 bg-gradient-to-b from-stone-50 via-stone-100 to-stone-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]"

                  const activeClass = note.isBlack
                    ? "from-amber-400 via-amber-600 to-amber-700"
                    : "from-amber-50 via-amber-200 to-amber-300"

                  return (
                    <button
                      key={note.midi}
                      type="button"
                      aria-label={`Tocar ${note.label}`}
                      onPointerDown={(event) => {
                        event.preventDefault()
                        event.currentTarget.setPointerCapture(event.pointerId)
                        void startNote(note)
                      }}
                      onPointerUp={() => stopNote(note.midi)}
                      onPointerLeave={() => stopNote(note.midi)}
                      onPointerCancel={() => stopNote(note.midi)}
                      className={`${baseClass} ${isActive ? activeClass : ""}`}
                      style={{
                        left,
                        width: note.isBlack ? BLACK_WIDTH : WHITE_WIDTH,
                        height: note.isBlack ? BLACK_HEIGHT : WHITE_HEIGHT,
                      }}
                    >
                      {!note.isBlack && note.name === "C" ? (
                        <span className="absolute bottom-2 left-1/2 -translate-x-1/2 text-[10px] font-medium uppercase tracking-[0.2em] text-stone-500">
                          {note.label}
                        </span>
                      ) : null}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          <aside className="rounded-3xl border border-white/10 bg-stone-950/60 p-6 shadow-[0_30px_60px_-40px_rgba(0,0,0,0.9)] backdrop-blur">
            <div className="mb-6 space-y-2">
              <p className="text-xs uppercase tracking-[0.3em] text-stone-300/80">
                Motor FM
              </p>
              <h2 className="text-2xl font-semibold text-stone-50">
                Ajustes del sintetizador
              </h2>
            </div>

            <div className="space-y-6">
              <div className="space-y-3 rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="flex items-center justify-between text-sm text-stone-100">
                  <span>Oscilador 1 (Carrier)</span>
                  <span className="text-xs text-stone-300">
                    Ratio {carrierRatio.toFixed(2)}
                  </span>
                </div>
                <input
                  type="range"
                  min={0.5}
                  max={4}
                  step={0.01}
                  value={carrierRatio}
                  onChange={(event) =>
                    setCarrierRatio(Number(event.target.value))
                  }
                  className="w-full accent-amber-300"
                />
                <div className="flex items-center justify-between text-sm text-stone-100">
                  <span>Amplitud</span>
                  <span className="text-xs text-stone-300">
                    {carrierAmp.toFixed(2)}
                  </span>
                </div>
                <input
                  type="range"
                  min={0.05}
                  max={0.6}
                  step={0.01}
                  value={carrierAmp}
                  onChange={(event) =>
                    setCarrierAmp(Number(event.target.value))
                  }
                  className="w-full accent-amber-300"
                />
              </div>

              <div className="space-y-3 rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="flex items-center justify-between text-sm text-stone-100">
                  <span>Oscilador 2 (Modulator)</span>
                  <span className="text-xs text-stone-300">
                    Ratio {modRatio.toFixed(2)}
                  </span>
                </div>
                <input
                  type="range"
                  min={0.25}
                  max={6}
                  step={0.01}
                  value={modRatio}
                  onChange={(event) => setModRatio(Number(event.target.value))}
                  className="w-full accent-amber-300"
                />
                <div className="flex items-center justify-between text-sm text-stone-100">
                  <span>Amplitud (Mod Depth)</span>
                  <span className="text-xs text-stone-300">
                    {modDepth.toFixed(0)}
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={400}
                  step={1}
                  value={modDepth}
                  onChange={(event) => setModDepth(Number(event.target.value))}
                  className="w-full accent-amber-300"
                />
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-stone-200">
                Cambios afectan nuevas notas. Ajusta el ratio del modulador para
                brillo y la amplitud del modulador para ataque metalico.
              </div>
            </div>
          </aside>
        </section>
      </div>
    </main>
  )
}
