let puertos = []
let lider = null
let instantanea = null
let ediciones = []
let siguienteId = 1

function buscar(id) {
  for (let i = 0; i < puertos.length; i++) {
    if (puertos[i].id === id) return i
  }
  return -1
}

function mensajeRol(esLider) {
  return { tipo: 'rol', lider: esLider, instantanea: instantanea, ediciones: ediciones, pestanas: puertos.length }
}

function enviar(p, msj) {
  try {
    p.port.postMessage(msj)
    return true
  } catch (e) {
    quitarPuerto(p.id)
    return false
  }
}

function difundir(msj, sinLider) {
  let copia = puertos.slice()
  for (let p of copia) {
    if (sinLider && p.id === lider) continue
    if (buscar(p.id) === -1) continue
    enviar(p, msj)
  }
}

function difundirPestanas() {
  difundir({ tipo: 'pestanas', n: puertos.length }, false)
}

function promover() {
  lider = null
  if (puertos.length === 0) return
  let p = puertos[0]
  lider = p.id
  p.ultimo = Date.now()
  enviar(p, mensajeRol(true))
}

function quitarPuerto(id) {
  let i = buscar(id)
  if (i === -1) return
  puertos.splice(i, 1)
  if (lider === id) promover()
  difundirPestanas()
}

function reincorporar(p, tipo) {
  puertos.push(p)
  if (tipo === 'hola') return
  if (lider === null) lider = p.id
  enviar(p, mensajeRol(lider === p.id))
  difundirPestanas()
}

function atender(p, d) {
  if (!d || typeof d !== 'object') return
  if (buscar(p.id) === -1) {
    if (d.tipo === 'adios') return
    reincorporar(p, d.tipo)
  }
  p.ultimo = Date.now()
  if (d.tipo === 'hola') {
    if (lider === null) lider = p.id
    enviar(p, mensajeRol(lider === p.id))
    difundirPestanas()
  } else if (d.tipo === 'instantanea') {
    if (p.id !== lider) return
    instantanea = d
    difundir(d, true)
  } else if (d.tipo === 'edicion') {
    let num = ediciones.length + 1
    ediciones.push({ num: num, ed: d.ed })
    difundir({ tipo: 'edicion', ed: d.ed, num: num }, false)
  } else if (d.tipo === 'adios') {
    quitarPuerto(p.id)
  }
}

onconnect = function (e) {
  let p = { id: siguienteId++, port: e.ports[0], ultimo: Date.now() }
  puertos.push(p)
  p.port.onmessage = function (ev) {
    atender(p, ev.data)
  }
  p.port.start()
}

setInterval(function () {
  let ahora = Date.now()
  let viejos = puertos.filter(function (p) {
    return p.id !== lider && ahora - p.ultimo > 30000
  })
  for (let p of viejos) quitarPuerto(p.id)
  let i = buscar(lider)
  if (i !== -1 && ahora - puertos[i].ultimo > 5000) quitarPuerto(lider)
}, 2000)
