import type { AnimalId } from '../../types'

export type EarType =
  | 'cat'
  | 'fox'
  | 'panda'
  | 'rabbit'
  | 'dog'
  | 'bear'
  | 'penguin'
  | 'owl'
  | 'hamster'

export type FacePatch = 'none' | 'panda' | 'fox' | 'penguin' | 'owl'
export type TailType = 'cat' | 'fox' | 'dog' | 'hamster' | 'none'

export interface AnimalConfig {
  id: AnimalId
  label: string
  tagline: string
  fur: string
  furDark: string
  furLight: string
  belly: string
  innerEar: string
  muzzle: string
  nose: string
  accent: string
  ear: EarType
  facePatch: FacePatch
  tail: TailType
  whiskers: boolean
  beak: boolean
  eyeStyle: 'normal' | 'owl' | 'penguin'
  animationDelay: string
}

export const ANIMAL_CONFIGS: Record<AnimalId, AnimalConfig> = {
  cat: {
    id: 'cat',
    label: 'Cat',
    tagline: 'Curious and cozy',
    fur: '#f4a261',
    furDark: '#d97706',
    furLight: '#ffd7a8',
    belly: '#fff1de',
    innerEar: '#f9b4a5',
    muzzle: '#fff5e8',
    nose: '#e76f51',
    accent: '#fb923c',
    ear: 'cat',
    facePatch: 'none',
    tail: 'cat',
    whiskers: true,
    beak: false,
    eyeStyle: 'normal',
    animationDelay: '0.2s',
  },
  fox: {
    id: 'fox',
    label: 'Fox',
    tagline: 'Clever and quick',
    fur: '#fb923c',
    furDark: '#c2410c',
    furLight: '#fdba74',
    belly: '#fff7ed',
    innerEar: '#fed7aa',
    muzzle: '#fff7ed',
    nose: '#292524',
    accent: '#f97316',
    ear: 'fox',
    facePatch: 'fox',
    tail: 'fox',
    whiskers: true,
    beak: false,
    eyeStyle: 'normal',
    animationDelay: '1.1s',
  },
  panda: {
    id: 'panda',
    label: 'Panda',
    tagline: 'Calm and cuddly',
    fur: '#f8fafc',
    furDark: '#1e293b',
    furLight: '#ffffff',
    belly: '#ffffff',
    innerEar: '#cbd5e1',
    muzzle: '#ffffff',
    nose: '#0f172a',
    accent: '#64748b',
    ear: 'panda',
    facePatch: 'panda',
    tail: 'none',
    whiskers: false,
    beak: false,
    eyeStyle: 'normal',
    animationDelay: '2.3s',
  },
  rabbit: {
    id: 'rabbit',
    label: 'Rabbit',
    tagline: 'Soft and attentive',
    fur: '#e9d5ff',
    furDark: '#c084fc',
    furLight: '#faf5ff',
    belly: '#fdf4ff',
    innerEar: '#f9a8d4',
    muzzle: '#ffffff',
    nose: '#ec4899',
    accent: '#d946ef',
    ear: 'rabbit',
    facePatch: 'none',
    tail: 'none',
    whiskers: true,
    beak: false,
    eyeStyle: 'normal',
    animationDelay: '0.8s',
  },
  dog: {
    id: 'dog',
    label: 'Dog',
    tagline: 'Friendly and loyal',
    fur: '#d6b18a',
    furDark: '#9a6b45',
    furLight: '#f3ddc4',
    belly: '#fdf0df',
    innerEar: '#c8956a',
    muzzle: '#fdf0df',
    nose: '#3f2a1d',
    accent: '#b45309',
    ear: 'dog',
    facePatch: 'none',
    tail: 'dog',
    whiskers: false,
    beak: false,
    eyeStyle: 'normal',
    animationDelay: '1.7s',
  },
  bear: {
    id: 'bear',
    label: 'Bear',
    tagline: 'Warm and steady',
    fur: '#b17a45',
    furDark: '#7c4a1e',
    furLight: '#d9a86c',
    belly: '#f5deb3',
    innerEar: '#d0a06a',
    muzzle: '#f5deb3',
    nose: '#3f2a1d',
    accent: '#92400e',
    ear: 'bear',
    facePatch: 'none',
    tail: 'none',
    whiskers: false,
    beak: false,
    eyeStyle: 'normal',
    animationDelay: '2.9s',
  },
  penguin: {
    id: 'penguin',
    label: 'Penguin',
    tagline: 'Cool and focused',
    fur: '#334155',
    furDark: '#0f172a',
    furLight: '#64748b',
    belly: '#f8fafc',
    innerEar: '#94a3b8',
    muzzle: '#f8fafc',
    nose: '#f59e0b',
    accent: '#0ea5e9',
    ear: 'penguin',
    facePatch: 'penguin',
    tail: 'none',
    whiskers: false,
    beak: true,
    eyeStyle: 'penguin',
    animationDelay: '0.5s',
  },
  owl: {
    id: 'owl',
    label: 'Owl',
    tagline: 'Wise and watchful',
    fur: '#a8a29e',
    furDark: '#57534e',
    furLight: '#e7e5e4',
    belly: '#f5f5f4',
    innerEar: '#d6d3d1',
    muzzle: '#fafaf9',
    nose: '#f59e0b',
    accent: '#a855f7',
    ear: 'owl',
    facePatch: 'owl',
    tail: 'none',
    whiskers: false,
    beak: true,
    eyeStyle: 'owl',
    animationDelay: '3.4s',
  },
  hamster: {
    id: 'hamster',
    label: 'Hamster',
    tagline: 'Small and cheerful',
    fur: '#fbbf24',
    furDark: '#d97706',
    furLight: '#fde68a',
    belly: '#fffbeb',
    innerEar: '#fcd34d',
    muzzle: '#fffbeb',
    nose: '#b45309',
    accent: '#f59e0b',
    ear: 'hamster',
    facePatch: 'none',
    tail: 'hamster',
    whiskers: true,
    beak: false,
    eyeStyle: 'normal',
    animationDelay: '2.1s',
  },
}

export const ANIMAL_LIST = Object.values(ANIMAL_CONFIGS)
