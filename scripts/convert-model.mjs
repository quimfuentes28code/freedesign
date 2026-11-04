// Convierte un maniquí de Mixamo (.fbx) a un .glb ligero para la web.
// Uso: npm run model -- "ruta/al/modelo.fbx" public/models/maniqui.glb
//
// - Quita las texturas (el maniquí se pinta con un material gris mate en la app)
// - Une los vértices repetidos y elimina las coordenadas UV
// - Conserva el esqueleto y la primera animación con fotogramas
import { readFile, writeFile } from 'node:fs/promises'
import * as THREE from 'three'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js'
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

const [input, output] = process.argv.slice(2)
if (!input || !output) {
  console.error('Uso: npm run model -- <entrada.fbx> <salida.glb>')
  process.exit(1)
}

// Node no tiene las funciones del navegador que usan el cargador y el exportador de three.js:
// las texturas no las necesitamos, y FileReader lo imitamos con Blob.arrayBuffer().
THREE.TextureLoader.prototype.load = () => new THREE.Texture()
globalThis.FileReader = class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((buffer) => {
      this.result = buffer
      this.onload?.({ target: this })
      this.onloadend?.({ target: this })
    })
  }
  readAsDataURL(blob) {
    blob.arrayBuffer().then((buffer) => {
      this.result = `data:${blob.type || 'application/octet-stream'};base64,${Buffer.from(buffer).toString('base64')}`
      this.onload?.({ target: this })
      this.onloadend?.({ target: this })
    })
  }
}

const file = await readFile(input)
const root = new FBXLoader().parse(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength), '')

let meshes = 0
root.traverse((obj) => {
  if (!obj.isMesh) return
  meshes++
  const geom = obj.geometry
  geom.deleteAttribute('uv')
  const before = geom.attributes.position.count
  obj.geometry = mergeVertices(geom, 1e-4)
  obj.material = new THREE.MeshStandardMaterial({ name: 'Maniqui', color: '#8f8f8f', roughness: 0.85 })
  console.log(`Malla "${obj.name}": ${before} → ${obj.geometry.attributes.position.count} vértices`)
})

const clip = root.animations.find((a) => a.tracks.length > 0)
if (clip) clip.name = 'Idle'
console.log(`${meshes} malla(s), animación: ${clip ? `${clip.duration.toFixed(1)} s` : 'ninguna'}`)

const glb = await new GLTFExporter().parseAsync(root, { binary: true, animations: clip ? [clip] : [] })
await writeFile(output, Buffer.from(glb))
console.log(`Guardado ${output} (${(glb.byteLength / 1024 / 1024).toFixed(2)} MB)`)
