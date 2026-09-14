declare module 'jsqr' {
  export interface QRCodeLocation {
    topRightCorner: { x: number; y: number }
    bottomRightCorner: { x: number; y: number }
    bottomLeftCorner: { x: number; y: number }
  }
  export interface QRCode {
    binaryData: number[]
    data: string
    chunks: { type: number; text: string }[]
    version: number
    location: { topRightCorner: QRCodeLocation; topLeftCorner: { x: number; y: number }; bottomRightCorner: { x: number; y: number }; bottomLeftCorner: { x: number; y: number } }
  }
  export default function jsQR(
    data: Uint8ClampedArray,
    width: number,
    height: number,
    inversionAttempts?: 'dontInvert' | 'onlyInvert' | 'attemptBoth' | 'invertFirst',
  ): QRCode | null
}