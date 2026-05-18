import { randomBytes } from 'crypto'

export function generateMatchCode(): string {
  return randomBytes(3).toString('hex').toUpperCase().slice(0, 6)
}
