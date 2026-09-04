import type { CSSProperties } from 'react'
import farmSceneUrl from '../assets/pixel-farm-widescreen.webp'

export function PixelFarmScene() {
  return <div className="pixel-farm-scene" aria-hidden="true">
    <div className="pixel-farm-image" style={{ backgroundImage: `url(${farmSceneUrl})` } as CSSProperties} />
    <div className="pixel-sunbeam" />
    <div className="pixel-cloud cloud-one" />
    <div className="pixel-cloud cloud-two" />
    <div className="pixel-fireflies"><i /><i /><i /><i /><i /></div>
    <div className="pixel-grass"><i /><i /><i /><i /></div>
  </div>
}
