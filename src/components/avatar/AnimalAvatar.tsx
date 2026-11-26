import { useEffect, useRef } from 'react'
import type { AnimalId, AvatarState } from '../../types'
import { cn } from '../../utils/cn'
import { speechLevel } from '../../services/audio/speechLevel'
import { ANIMAL_CONFIGS } from './animalConfig'

interface AnimalAvatarProps {
  animal: AnimalId
  state: AvatarState
  size?: number
  className?: string
}

export function AnimalAvatar({
  animal,
  state,
  size = 160,
  className,
}: AnimalAvatarProps) {
  const config = ANIMAL_CONFIGS[animal]
  const rootRef = useRef<HTMLDivElement>(null)
  const mouthRef = useRef<SVGGElement>(null)

  useEffect(() => {
    const root = rootRef.current
    const mouth = mouthRef.current
    if (!root || !mouth) return

    if (state !== 'speaking') {
      mouth.style.transform = ''
      root.style.setProperty('--speech-level', '0')
      return
    }

    let frame = 0
    const animate = () => {
      const reduceMotion =
        document.documentElement.dataset.reduceMotion === 'true'
      if (reduceMotion) {
        mouth.style.transform = 'scaleY(1)'
        root.style.setProperty('--speech-level', '0.25')
        return
      }

      const level = Math.max(
        speechLevel.getLevel(),
        0.18 + 0.1 * Math.abs(Math.sin(performance.now() / 110)),
      )
      root.style.setProperty('--speech-level', level.toFixed(3))
      mouth.style.transform = `scaleY(${(0.55 + level * 1.7).toFixed(3)})`
      frame = requestAnimationFrame(animate)
    }

    animate()
    return () => {
      cancelAnimationFrame(frame)
      mouth.style.transform = ''
      root.style.setProperty('--speech-level', '0')
    }
  }, [state])

  const eyeY = 92
  const eyeLeftX = config.eyeStyle === 'owl' ? 79 : 82
  const eyeRightX = config.eyeStyle === 'owl' ? 121 : 118
  const eyeRadius = config.eyeStyle === 'owl' ? 7 : 5.4
  const happyEyes = state === 'happy' || state === 'speaking'
  const wideEyes = state === 'listening'
  const lookingUp = state === 'thinking'
  const eyeOffsetY = lookingUp ? -2.5 : 0
  const eyeOffsetX = lookingUp ? 1.8 : 0

  return (
    <div
      ref={rootRef}
      className={cn('avatar-root relative select-none', className)}
      data-state={state}
      data-animal={animal}
      style={{ width: size, height: size }}
      role="img"
      aria-label={`${config.label} companion, ${state}`}
    >
      <svg
        viewBox="0 0 200 200"
        width={size}
        height={size}
        className="relative z-10 h-full w-full overflow-visible"
        fill="none"
      >
        {/* Tail */}
        <g className="avatar-tail">
          {config.tail === 'cat' && (
            <>
              <path
                d="M54 164C31 168 18 146 27 123C31 113 40 108 48 111"
                stroke={config.fur}
                strokeWidth="15"
                strokeLinecap="round"
              />
              <path
                d="M27 123C31 113 40 108 48 111"
                stroke={config.furLight}
                strokeWidth="10"
                strokeLinecap="round"
              />
            </>
          )}
          {config.tail === 'fox' && (
            <g transform="rotate(-28 43 154)">
              <ellipse cx="43" cy="154" rx="21" ry="34" fill={config.fur} />
              <ellipse cx="43" cy="178" rx="16" ry="13" fill={config.furLight} />
            </g>
          )}
          {config.tail === 'dog' && (
            <path
              d="M58 164C36 170 26 152 33 136"
              stroke={config.fur}
              strokeWidth="14"
              strokeLinecap="round"
            />
          )}
          {config.tail === 'hamster' && (
            <circle cx="54" cy="166" r="9" fill={config.furLight} />
          )}
        </g>

        {/* Body */}
        <g className="avatar-bob">
          <ellipse cx="100" cy="151" rx="51" ry="44" fill={config.fur} />
          <ellipse cx="100" cy="157" rx="32" ry="31" fill={config.belly} />
          <ellipse cx="70" cy="181" rx="14" ry="8" fill={config.furLight} />
          <ellipse cx="130" cy="181" rx="14" ry="8" fill={config.furLight} />
        </g>

        {/* Ears (behind head) */}
        <g className="avatar-ears">
          {config.ear === 'cat' && (
            <>
              <path d="M52 69 58 21 89 53Z" fill={config.fur} />
              <path d="M148 69 142 21 111 53Z" fill={config.fur} />
              <path d="M60 60 63 34 81 53Z" fill={config.innerEar} />
              <path d="M140 60 137 34 119 53Z" fill={config.innerEar} />
            </>
          )}
          {config.ear === 'fox' && (
            <>
              <path d="M50 72 56 14 92 50Z" fill={config.fur} />
              <path d="M150 72 144 14 108 50Z" fill={config.fur} />
              <path d="M56 33 56 14 74 34Z" fill={config.furDark} />
              <path d="M144 33 144 14 126 34Z" fill={config.furDark} />
              <path d="M62 62 65 36 82 54Z" fill={config.innerEar} />
              <path d="M138 62 135 36 118 54Z" fill={config.innerEar} />
            </>
          )}
          {config.ear === 'panda' && (
            <>
              <circle cx="55" cy="56" r="21" fill={config.furDark} />
              <circle cx="145" cy="56" r="21" fill={config.furDark} />
            </>
          )}
          {config.ear === 'rabbit' && (
            <>
              <g transform="rotate(-12 72 38)">
                <ellipse cx="72" cy="38" rx="16" ry="42" fill={config.fur} />
                <ellipse cx="72" cy="40" rx="8" ry="31" fill={config.innerEar} />
              </g>
              <g transform="rotate(12 128 38)">
                <ellipse cx="128" cy="38" rx="16" ry="42" fill={config.fur} />
                <ellipse cx="128" cy="40" rx="8" ry="31" fill={config.innerEar} />
              </g>
            </>
          )}
          {config.ear === 'dog' && (
            <>
              <g transform="rotate(18 48 100)">
                <ellipse cx="48" cy="100" rx="18" ry="36" fill={config.furDark} />
              </g>
              <g transform="rotate(-18 152 100)">
                <ellipse cx="152" cy="100" rx="18" ry="36" fill={config.furDark} />
              </g>
            </>
          )}
          {config.ear === 'bear' && (
            <>
              <circle cx="58" cy="54" r="19" fill={config.fur} />
              <circle cx="142" cy="54" r="19" fill={config.fur} />
              <circle cx="58" cy="54" r="10" fill={config.innerEar} />
              <circle cx="142" cy="54" r="10" fill={config.innerEar} />
            </>
          )}
          {config.ear === 'hamster' && (
            <>
              <circle cx="60" cy="58" r="14" fill={config.fur} />
              <circle cx="140" cy="58" r="14" fill={config.fur} />
              <circle cx="60" cy="58" r="7" fill={config.innerEar} />
              <circle cx="140" cy="58" r="7" fill={config.innerEar} />
            </>
          )}
          {config.ear === 'owl' && (
            <>
              <path d="M55 57 48 28 74 45Z" fill={config.fur} />
              <path d="M145 57 152 28 126 45Z" fill={config.fur} />
            </>
          )}
        </g>

        {/* Head */}
        <g className="avatar-head">
          <ellipse cx="100" cy="95" rx="57" ry="51" fill={config.fur} />

          {/* Face patches */}
          {config.facePatch === 'panda' && (
            <>
              <ellipse
                cx="81"
                cy="92"
                rx="18"
                ry="21"
                fill={config.furDark}
                transform="rotate(-12 81 92)"
              />
              <ellipse
                cx="119"
                cy="92"
                rx="18"
                ry="21"
                fill={config.furDark}
                transform="rotate(12 119 92)"
              />
            </>
          )}
          {config.facePatch === 'fox' && (
            <>
              <ellipse cx="100" cy="116" rx="37" ry="25" fill={config.muzzle} />
              <ellipse cx="72" cy="103" rx="17" ry="12" fill={config.furLight} opacity="0.7" />
              <ellipse cx="128" cy="103" rx="17" ry="12" fill={config.furLight} opacity="0.7" />
            </>
          )}
          {config.facePatch === 'penguin' && (
            <ellipse cx="100" cy="99" rx="43" ry="40" fill={config.muzzle} />
          )}
          {config.facePatch === 'owl' && (
            <>
              <circle cx="79" cy="91" r="25" fill={config.muzzle} />
              <circle cx="121" cy="91" r="25" fill={config.muzzle} />
            </>
          )}

          {/* Cheeks */}
          <ellipse cx="67" cy="113" rx="9" ry="5.5" fill={config.accent} opacity="0.28" />
          <ellipse cx="133" cy="113" rx="9" ry="5.5" fill={config.accent} opacity="0.28" />

          {/* Eyes */}
          <g
            className="avatar-eyes"
            style={{ animationDelay: config.animationDelay }}
          >
            {happyEyes ? (
              <>
                <path
                  d={`M${eyeLeftX - 7} ${eyeY + 1} Q${eyeLeftX} ${eyeY - 7} ${eyeLeftX + 7} ${eyeY + 1}`}
                  stroke="#1f1720"
                  strokeWidth="3.2"
                  strokeLinecap="round"
                />
                <path
                  d={`M${eyeRightX - 7} ${eyeY + 1} Q${eyeRightX} ${eyeY - 7} ${eyeRightX + 7} ${eyeY + 1}`}
                  stroke="#1f1720"
                  strokeWidth="3.2"
                  strokeLinecap="round"
                />
              </>
            ) : (
              <>
                <g transform={`translate(${eyeOffsetX} ${eyeOffsetY})`}>
                  <ellipse
                    cx={eyeLeftX}
                    cy={eyeY}
                    rx={eyeRadius}
                    ry={eyeRadius * (wideEyes ? 1.2 : 1)}
                    fill="#1f1720"
                  />
                  <circle cx={eyeLeftX + 1.8} cy={eyeY - 2} r="1.7" fill="white" />
                  <ellipse
                    cx={eyeRightX}
                    cy={eyeY}
                    rx={eyeRadius}
                    ry={eyeRadius * (wideEyes ? 1.2 : 1)}
                    fill="#1f1720"
                  />
                  <circle cx={eyeRightX + 1.8} cy={eyeY - 2} r="1.7" fill="white" />
                </g>
              </>
            )}
          </g>

          {/* Eyebrows for expressions */}
          {(state === 'error' || state === 'thinking') && (
            <g
              stroke={config.furDark}
              strokeWidth="3"
              strokeLinecap="round"
              opacity="0.8"
            >
              {state === 'error' ? (
                <>
                  <path d="M70 76 86 81" />
                  <path d="M130 76 114 81" />
                </>
              ) : (
                <>
                  <path d="M70 78 86 74" />
                  <path d="M130 80 116 80" />
                </>
              )}
            </g>
          )}

          {/* Muzzle and beak */}
          {config.beak ? (
            <g>
              <path
                d="M100 103 86 114 100 120 114 114Z"
                fill={config.nose}
                stroke={config.furDark}
                strokeWidth="1"
                strokeLinejoin="round"
              />
              <g
                ref={mouthRef}
                className="avatar-mouth"
                style={{ transformBox: 'fill-box', transformOrigin: 'center top' }}
              >
                <path
                  d="M100 119 90 125 100 130 110 125Z"
                  fill={config.nose}
                  opacity="0.85"
                />
              </g>
            </g>
          ) : (
            <>
              <ellipse cx="100" cy="117" rx="25" ry="17" fill={config.muzzle} />
              <path
                d="M95 111 Q100 107 105 111 Q105 116 100 117 Q95 116 95 111Z"
                fill={config.nose}
              />
              <g
                ref={mouthRef}
                className="avatar-mouth"
                style={{ transformBox: 'fill-box', transformOrigin: 'center top' }}
              >
                {state === 'speaking' ? (
                  <>
                    <ellipse cx="100" cy="126" rx="8.5" ry="7" fill="#7f1d1d" />
                    <ellipse cx="100" cy="129" rx="4.5" ry="2.6" fill="#fb7185" />
                  </>
                ) : state === 'happy' ? (
                  <>
                    <path
                      d="M88 122 Q100 139 112 122 Q100 132 88 122Z"
                      fill="#7f1d1d"
                    />
                    <ellipse cx="100" cy="131" rx="4.5" ry="2.8" fill="#fb7185" />
                  </>
                ) : state === 'listening' ? (
                  <ellipse cx="100" cy="127" rx="4.4" ry="5.4" fill="#7f1d1d" />
                ) : state === 'thinking' ? (
                  <path
                    d="M92 127 Q97 123 100 127 Q103 131 108 127"
                    stroke={config.furDark}
                    strokeWidth="2.4"
                    strokeLinecap="round"
                  />
                ) : state === 'error' ? (
                  <path
                    d="M91 128 Q95 124 99 128 Q103 132 108 127"
                    stroke={config.furDark}
                    strokeWidth="2.4"
                    strokeLinecap="round"
                  />
                ) : (
                  <path
                    d="M92 124 Q100 131 108 124"
                    stroke={config.furDark}
                    strokeWidth="2.4"
                    strokeLinecap="round"
                  />
                )}
              </g>
            </>
          )}

          {/* Whiskers */}
          {config.whiskers && (
            <g stroke={config.furDark} strokeWidth="1.5" strokeLinecap="round" opacity="0.55">
              <path d="M74 116 50 111" />
              <path d="M74 120 49 121" />
              <path d="M74 124 52 130" />
              <path d="M126 116 150 111" />
              <path d="M126 120 151 121" />
              <path d="M126 124 148 130" />
            </g>
          )}
        </g>

        {/* State decorations */}
        {state === 'listening' && (
          <g className="avatar-listen-rings" stroke={config.accent} fill="none">
            <circle cx="100" cy="100" r="72" strokeWidth="2" opacity="0.35" />
            <circle cx="100" cy="100" r="84" strokeWidth="1.5" opacity="0.18" />
          </g>
        )}

        {state === 'happy' && (
          <g className="avatar-sparkles" fill={config.accent}>
            <path d="M156 44 159 52 167 55 159 58 156 66 153 58 145 55 153 52Z" />
            <path d="M41 66 43 71 48 73 43 75 41 80 39 75 34 73 39 71Z" opacity="0.8" />
            <path d="M160 118 162 123 167 125 162 127 160 132 158 127 153 125 158 123Z" opacity="0.7" />
          </g>
        )}

        {state === 'error' && (
          <g className="avatar-sweat">
            <path
              d="M151 68 C151 68 143 80 143 86 A8 8 0 0 0 159 86 C159 80 151 68 151 68Z"
              fill="#7dd3fc"
              opacity="0.9"
            />
          </g>
        )}

        {state === 'thinking' && (
          <g className="avatar-think-dots" fill={config.accent}>
            <circle cx="150" cy="48" r="3.2" />
            <circle cx="160" cy="41" r="4.2" />
            <circle cx="172" cy="32" r="5.2" />
          </g>
        )}
      </svg>

      {state === 'speaking' && (
        <div className="avatar-speaking-waves" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      )}
    </div>
  )
}
