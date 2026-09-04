import { useEffect, useRef } from 'react'
import * as THREE from 'three'

export function HomeScene() {
  const hostRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(46, 1, 0.1, 100)
    camera.position.set(0, 1.5, 12)

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75))
    renderer.setClearColor(0x000000, 0)
    host.appendChild(renderer.domElement)

    const group = new THREE.Group()
    scene.add(group)

    const nodeGeometry = new THREE.IcosahedronGeometry(0.085, 1)
    const nodeMaterial = new THREE.MeshBasicMaterial({ color: 0xf4c95d })
    const lineMaterial = new THREE.LineBasicMaterial({ color: 0x72d5ae, transparent: true, opacity: 0.34 })
    const nodes: THREE.Mesh[] = []
    const points: THREE.Vector3[] = []

    for (let index = 0; index < 24; index += 1) {
      const angle = index * 2.399
      const radius = 1.8 + (index % 6) * 0.42
      const point = new THREE.Vector3(
        Math.cos(angle) * radius,
        Math.sin(angle * 1.3) * 2.15,
        Math.sin(angle) * 1.4,
      )
      const node = new THREE.Mesh(nodeGeometry, nodeMaterial)
      node.position.copy(point)
      node.userData.phase = index * 0.46
      group.add(node)
      nodes.push(node)
      points.push(point)
    }

    const linePoints: THREE.Vector3[] = []
    points.forEach((point, index) => {
      const next = points[(index + 5) % points.length]
      linePoints.push(point, next)
      if (index % 2 === 0) linePoints.push(point, points[(index + 9) % points.length])
    })
    const lines = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(linePoints), lineMaterial)
    group.add(lines)

    const ringMaterial = new THREE.MeshBasicMaterial({ color: 0x2d8b6d, transparent: true, opacity: 0.3, wireframe: true })
    const rings = [2.25, 3.25, 4.2].map((radius, index) => {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.012, 6, 96), ringMaterial)
      ring.rotation.set(1.08 + index * 0.16, index * 0.44, index * 0.2)
      group.add(ring)
      return ring
    })

    let frame = 0
    let pointerX = 0
    let pointerY = 0
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const resize = () => {
      const { width, height } = host.getBoundingClientRect()
      renderer.setSize(Math.max(width, 1), Math.max(height, 1), false)
      camera.aspect = Math.max(width, 1) / Math.max(height, 1)
      camera.updateProjectionMatrix()
    }
    const onPointerMove = (event: PointerEvent) => {
      const rect = host.getBoundingClientRect()
      pointerX = ((event.clientX - rect.left) / Math.max(rect.width, 1) - 0.5) * 0.42
      pointerY = ((event.clientY - rect.top) / Math.max(rect.height, 1) - 0.5) * 0.24
    }
    const render = (time: number) => {
      const elapsed = time * 0.001
      group.rotation.y += (pointerX - group.rotation.y) * 0.025
      group.rotation.x += (-pointerY - group.rotation.x) * 0.025
      if (!reduceMotion) {
        group.rotation.z = Math.sin(elapsed * 0.2) * 0.045
        nodes.forEach((node) => {
          const pulse = 0.82 + Math.sin(elapsed * 1.4 + Number(node.userData.phase)) * 0.22
          node.scale.setScalar(pulse)
        })
        rings.forEach((ring, index) => { ring.rotation.z += 0.00035 * (index + 1) })
      }
      renderer.render(scene, camera)
      frame = requestAnimationFrame(render)
    }

    resize()
    host.addEventListener('pointermove', onPointerMove)
    window.addEventListener('resize', resize)
    frame = requestAnimationFrame(render)

    return () => {
      cancelAnimationFrame(frame)
      host.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('resize', resize)
      nodeGeometry.dispose()
      nodeMaterial.dispose()
      lines.geometry.dispose()
      lineMaterial.dispose()
      rings.forEach((ring) => ring.geometry.dispose())
      ringMaterial.dispose()
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [])

  return <div ref={hostRef} className="home-scene" aria-hidden="true" />
}
