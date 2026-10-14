importScripts('modelo.js')

const EDICION = 0, G_LOCK = 1, G_VER = 2, G_OBJ = 3, G_DURO = 4, G_BLANDO = 5, G_AUTOR = 6, G_ED = 7, G_H1 = 8, G_H2 = 9, PERIODO = 10, CORRIENDO = 11, ESTRES = 12, EPOCA = 13
const NEST = 40
const E_EVAL = 0, E_ACEPT = 1, E_OBJ = 2, E_MEJOR = 3, E_DURO = 4, E_BLANDO = 5, E_VELOC = 6, E_PUBLIC = 7, E_CASFALLO = 8, E_ADOPC = 9, E_DIVERS = 10, E_VERIF = 11, E_DISCREP = 12, E_USOS = 13, E_MEJORAS = 16, E_APORTE = 19, E_EDIC = 22, E_ACEL = 23, E_MSREP = 24, E_CAMBREP = 25, E_ITER = 26, E_PESO = 27, E_RECHVIS = 30, E_MSREINICIO = 31

let C, GB, ACT, EST
let yo = 0, nw = 1, miEpoca = 0, miEd = 0
let pr, e, mejorX, mejorObj = 2147483647, mejorDuro = 0, mejorBlando = 0, mejorH1 = 0, mejorH2 = 0
let tabuHasta, iter = 0, ultimaMejora = 0, ultimaCoop = 0, ultimaVel = 0, evalVel = 0
let visitas = new Int32Array(2 * 262144), mascaraVis = 262143
let pesos = [0.55, 0.4, 0.05], exitos = [0, 0, 0], intentos = [0, 0, 0]
let cand = new Int32Array(16 * 4), candLen = new Int8Array(16)
let tmpGlobal
const MUESTRA = 12, ESTANC = 4000, UMBRAL = 30, PROB_PEOR = 0

self.onmessage = function (m) {
  let d = m.data
  if (d.tipo === 'init') iniciar(d)
  else if (d.tipo === 'edicion') recibirEdicion(d)
  else if (d.tipo === 'prueba') pruebaCoherencia()
  else if (d.tipo === 'continuar') ciclo()
  else if (d.tipo === 'eco') postMessage({ tipo: 'eco', celdas: d.celdas })
}

function iniciar(d) {
  yo = d.id
  nw = d.nw
  miEpoca = d.epoca
  C = new Int32Array(d.buf.ctrl)
  GB = new Uint8Array(d.buf.global)
  pr = prepararProblema(d.datos)
  for (let k = 0; k < d.ediciones.length; k++) aplicarEdicion(pr, d.ediciones[k].ed)
  miEd = d.ediciones.length
  let n = pr.P * SLOTS
  ACT = new Uint8Array(d.buf.actuales, yo * n, n)
  EST = new Float64Array(d.buf.stats, yo * NEST * 8, NEST)
  EST.fill(0)
  tabuHasta = new Int32Array(n)
  mejorX = new Uint8Array(n)
  tmpGlobal = new Uint8Array(n)
  let ini = new Uint8Array(n)
  if (d.inicial && yo === 0) {
    for (let i = 0; i < n; i++) ini[i] = d.inicial.charCodeAt(i) === 49 ? 1 : 0
    corregirFijos(pr, ini)
    e = crearEstado(pr, ini, ACT)
  } else {
    corregirFijos(pr, ini)
    e = crearEstado(pr, ini, ACT)
    construirInicial()
  }
  EST[E_EDIC] = miEd
  medir()
  guardarMejor()
  postMessage({ tipo: 'listo', id: yo })
  ultimaVel = performance.now()
  ciclo()
}

function construirInicial() {
  let orden = []
  for (let s = 0; s < SLOTS; s++) orden.push(s)
  for (let i = orden.length - 1; i > 0; i--) {
    let j = Math.floor(Math.random() * (i + 1))
    let t = orden[i]
    orden[i] = orden[j]
    orden[j] = t
  }
  for (let s of orden) {
    for (let k = 0; k < NPERF; k++) {
      let miembros = pr.miembros[k]
      let intentosK = 0
      while (e.cnt[s * NPERF + k] < pr.cuota[s * NPERF + k] && intentosK < 30) {
        intentosK++
        let mejor = -1, mejorO = Infinity
        for (let r = 0; r < 8; r++) {
          let p = miembros[Math.floor(Math.random() * miembros.length)], i = p * SLOTS + s
          if (e.x[i] || !movible(pr, i)) continue
          let o0 = objetivo(e)
          cambiar(e, p, s)
          let o = objetivo(e) - o0
          cambiar(e, p, s)
          if (o < mejorO) {
            mejorO = o
            mejor = p
          }
        }
        if (mejor >= 0) cambiar(e, mejor, s)
      }
    }
  }
}

function medir() {
  let n = 200000, t0 = performance.now()
  for (let k = 0; k < n; k++) {
    let p = Math.floor(Math.random() * pr.P), s = Math.floor(Math.random() * SLOTS)
    cambiar(e, p, s)
    cambiar(e, p, s)
  }
  let nsDelta = (performance.now() - t0) * 1e6 / (2 * n)
  t0 = performance.now()
  for (let k = 0; k < 100; k++) costoCompleto(pr, e.x)
  let nsCompleto = (performance.now() - t0) * 1e6 / 100
  EST[E_ACEL] = nsCompleto / nsDelta
  let listas = []
  for (let p = 0; p < pr.P; p++) {
    let l = []
    for (let s = 0; s < SLOTS; s++) if (e.x[p * SLOTS + s]) l.push({ dia: (s / 3) | 0, jornada: s % 3, inicio: ((s / 3) | 0) * 24 + 6 + (s % 3) * 8 })
    listas.push(l)
  }
  let mas = mascaras(pr, e.x)
  let pruebas = 300000, ok = 0
  let objs = [], bytes = [], bits = []
  t0 = performance.now()
  for (let k = 0; k < pruebas; k++) {
    let p = k % pr.P, s = (k * 7) % SLOTS, ini = ((s / 3) | 0) * 24 + 6 + (s % 3) * 8, choca = false
    for (let t of listas[p]) {
      let dif = Math.abs(t.inicio - ini)
      if (dif > 0 && dif < 20) choca = true
    }
    if (choca) ok++
  }
  objs = performance.now() - t0
  t0 = performance.now()
  for (let k = 0; k < pruebas; k++) {
    let p = k % pr.P, s = (k * 7) % SLOTS, b = p * SLOTS + s, c = 0
    if (s >= 2) c += e.x[b - 2]
    if (s >= 1) c += e.x[b - 1]
    if (s <= 88) c += e.x[b + 1]
    if (s <= 87) c += e.x[b + 2]
    if (c) ok++
  }
  bytes = performance.now() - t0
  t0 = performance.now()
  for (let k = 0; k < pruebas; k++) {
    let p = k % pr.P, s = (k * 7) % SLOTS, o = p * 3, c = 0
    for (let a = s - 2; a <= s + 2; a++) {
      if (a < 0 || a >= SLOTS || a === s) continue
      if (mas[o + (a >> 5)] & (1 << (a & 31))) c++
    }
    if (c) ok++
  }
  bits = performance.now() - t0
  let tm = new Int32Array(new SharedArrayBuffer(8))
  t0 = performance.now()
  for (let k = 0; k < 1000000; k++) {
    Atomics.compareExchange(tm, 0, 0, 1)
    Atomics.store(tm, 0, 0)
  }
  let nsCas = (performance.now() - t0)
  if (yo === 0) {
    postMessage({
      tipo: 'banco', nsDelta: nsDelta, nsCompleto: nsCompleto, aceleracion: nsCompleto / nsDelta,
      objetos: pruebas / objs * 1000, bytes: pruebas / bytes * 1000, bits: pruebas / bits * 1000, nsCas: nsCas, basura: ok
    })
  }
}

function aleatorio(n) {
  return Math.floor(Math.random() * n)
}

function slotAsignado(p) {
  let base = p * SLOTS
  for (let r = 0; r < 12; r++) {
    let s = aleatorio(SLOTS)
    if (e.x[base + s] && movible(pr, base + s)) return s
  }
  return -1
}

function generarCambio(k) {
  let off = k * 4, u = Math.random(), p = aleatorio(pr.P)
  if (u < 0.4) {
    let s = slotAsignado(p)
    if (s < 0) return false
    let lista = pr.miembros[pr.perfil[p]], q = lista[aleatorio(lista.length)]
    let j = q * SLOTS + s
    if (q === p || e.x[j] || !movible(pr, j)) return false
    cand[off] = p * SLOTS + s
    cand[off + 1] = j
    candLen[k] = 2
    return true
  }
  if (u < 0.7) {
    let s = slotAsignado(p)
    if (s < 0) return false
    let s2 = aleatorio(SLOTS), j = p * SLOTS + s2
    if (s2 === s || e.x[j] || !movible(pr, j)) return false
    cand[off] = p * SLOTS + s
    cand[off + 1] = j
    candLen[k] = 2
    return true
  }
  let s = aleatorio(SLOTS), kk = pr.perfil[p]
  if (Math.random() < 0.5) {
    kk = aleatorio(NPERF)
    if (e.cnt[s * NPERF + kk] < pr.cuota[s * NPERF + kk]) {
      let lista = pr.miembros[kk]
      p = lista[aleatorio(lista.length)]
    }
  }
  let i = p * SLOTS + s
  if (!movible(pr, i)) return false
  cand[off] = i
  candLen[k] = 1
  return true
}

function generarIntercambio(k) {
  let off = k * 4, p = aleatorio(pr.P)
  let s = slotAsignado(p)
  if (s < 0) return false
  let lista = pr.miembros[pr.perfil[p]], q = lista[aleatorio(lista.length)]
  if (q === p) return false
  let s2 = slotAsignado(q)
  if (s2 < 0 || s2 === s) return false
  let a = p * SLOTS + s, b = q * SLOTS + s, c = q * SLOTS + s2, dd = p * SLOTS + s2
  if (e.x[b] || e.x[dd] || !movible(pr, b) || !movible(pr, dd)) return false
  cand[off] = a
  cand[off + 1] = b
  cand[off + 2] = c
  cand[off + 3] = dd
  candLen[k] = 4
  return true
}

function aplicarCand(k) {
  let off = k * 4
  for (let j = 0; j < candLen[k]; j++) {
    let c = cand[off + j]
    cambiar(e, (c / SLOTS) | 0, c % SLOTS)
  }
}

function deshacerCand(k) {
  let off = k * 4
  for (let j = candLen[k] - 1; j >= 0; j--) {
    let c = cand[off + j]
    cambiar(e, (c / SLOTS) | 0, c % SLOTS)
  }
}

function esTabu(k) {
  let off = k * 4
  for (let j = 0; j < candLen[k]; j++) if (tabuHasta[cand[off + j]] > iter) return true
  return false
}

function visitado(h1, h2) {
  let b = (h1 & mascaraVis) * 2
  for (let r = 0; r < 4; r++) {
    let j = (b + 2 * r) % visitas.length
    if (visitas[j] === h1 && visitas[j + 1] === h2) return true
  }
  return false
}

function marcarVisitado(h1, h2) {
  let b = (h1 & mascaraVis) * 2
  let j = (b + 2 * (iter & 3)) % visitas.length
  visitas[j] = h1
  visitas[j + 1] = h2
}

function elegirVecindario() {
  let u = Math.random() * (pesos[0] + pesos[1] + pesos[2])
  if (u < pesos[0]) return 0
  if (u < pesos[0] + pesos[1]) return 1
  return 2
}

function paso() {
  iter++
  let v = elegirVecindario()
  intentos[v]++
  EST[E_USOS + v]++
  let o0 = objetivo(e)
  if (v === 2) {
    if (moverBloque(false)) exitos[v]++
    revisarMejor(v, o0)
    return
  }
  let elegido = -1, mejorD = Infinity, h1e = 0, h2e = 0
  for (let k = 0; k < MUESTRA; k++) {
    let ok = v === 0 ? generarCambio(k) : generarIntercambio(k)
    if (!ok) continue
    aplicarCand(k)
    let dlt = objetivo(e) - o0, h1 = e.h1, h2 = e.h2
    deshacerCand(k)
    EST[E_EVAL]++
    evalVel++
    let prohibido = esTabu(k) || visitado(h1, h2)
    if (prohibido) {
      if (o0 + dlt >= mejorObj) {
        EST[E_RECHVIS]++
        continue
      }
    }
    if (dlt < mejorD) {
      mejorD = dlt
      elegido = k
      h1e = h1
      h2e = h2
    }
  }
  if (elegido < 0) return
  if (mejorD > 0 && (mejorD > UMBRAL || Math.random() > PROB_PEOR)) return
  aplicarCand(elegido)
  let off = elegido * 4, ten = 8 + aleatorio(12)
  for (let j = 0; j < candLen[elegido]; j++) tabuHasta[cand[off + j]] = iter + ten
  marcarVisitado(h1e, h2e)
  EST[E_ACEPT]++
  if (mejorD < 0) exitos[v]++
  if (EST[E_ACEPT] % 1000 === 0) verificar()
  revisarMejor(v, o0)
}

function revisarMejor(v, o0) {
  let o = objetivo(e)
  if (o < mejorObj) {
    EST[E_MEJORAS + v]++
    EST[E_APORTE + v] += mejorObj === 2147483647 ? 0 : mejorObj - o
    guardarMejor()
    ultimaMejora = iter
    if (Atomics.load(C, ESTRES)) publicar()
  }
}

function guardarMejor() {
  mejorX.set(e.x)
  mejorObj = objetivo(e)
  mejorDuro = e.duro
  mejorBlando = e.blando
  mejorH1 = e.h1
  mejorH2 = e.h2
}

function moverBloque(forzar) {
  let k = aleatorio(NPERF), L = 3 + aleatorio(3), d0 = aleatorio(DIAS - L + 1)
  let o0 = objetivo(e), hechos = []
  let miembros = pr.miembros[k]
  for (let s = 3 * d0; s < 3 * (d0 + L); s++) {
    for (let p of miembros) {
      let i = p * SLOTS + s
      if (e.x[i] && movible(pr, i)) {
        cambiar(e, p, s)
        hechos.push(i)
      }
    }
  }
  let slots = []
  for (let s = 3 * d0; s < 3 * (d0 + L); s++) slots.push(s)
  for (let i = slots.length - 1; i > 0; i--) {
    let j = aleatorio(i + 1)
    let t = slots[i]
    slots[i] = slots[j]
    slots[j] = t
  }
  for (let s of slots) {
    let vueltas = 0
    while (e.cnt[s * NPERF + k] < pr.cuota[s * NPERF + k] && vueltas < 10) {
      vueltas++
      let mejor = -1, mejorO = Infinity
      for (let p of miembros) {
        let i = p * SLOTS + s
        if (e.x[i] || !movible(pr, i)) continue
        let a = objetivo(e)
        cambiar(e, p, s)
        let o = objetivo(e) - a
        cambiar(e, p, s)
        EST[E_EVAL]++
        evalVel++
        if (o < mejorO) {
          mejorO = o
          mejor = p
        }
      }
      if (mejor < 0) break
      cambiar(e, mejor, s)
      hechos.push(mejor * SLOTS + s)
    }
  }
  let dlt = objetivo(e) - o0
  if (dlt < 0 || forzar) {
    let ten = 8 + aleatorio(12)
    for (let c of hechos) tabuHasta[c] = iter + ten
    EST[E_ACEPT]++
    return dlt < 0
  }
  for (let j = hechos.length - 1; j >= 0; j--) cambiar(e, (hechos[j] / SLOTS) | 0, hechos[j] % SLOTS)
  return false
}

function verificar() {
  let c = costoCompleto(pr, e.x)
  EST[E_VERIF]++
  let h1 = 0, h2 = 0
  for (let i = 0; i < e.x.length; i++) if (e.x[i]) {
    h1 ^= Z1[i]
    h2 ^= Z2[i]
  }
  if (c.duro !== e.duro || c.blando !== e.blando || h1 !== e.h1 || h2 !== e.h2) {
    EST[E_DISCREP]++
    reconstruir(e)
  }
}

function ajustarPesos() {
  for (let v = 0; v < 3; v++) {
    let tasa = intentos[v] ? exitos[v] / intentos[v] : 0
    pesos[v] = 0.8 * pesos[v] + 0.2 * (0.05 + tasa)
    exitos[v] = 0
    intentos[v] = 0
  }
  let s = pesos[0] + pesos[1] + pesos[2]
  for (let v = 0; v < 3; v++) {
    pesos[v] = pesos[v] / s
    if (pesos[v] < 0.04) pesos[v] = 0.04
    EST[E_PESO + v] = pesos[v]
  }
}

function diversificar() {
  EST[E_DIVERS]++
  let adopta = false
  if (Atomics.load(C, PERIODO) > 0 && leerGlobal(tmpGlobal)) {
    let gObj = Atomics.load(C, G_OBJ)
    if (gObj < objetivo(e) - 20 && Math.random() < 0.5) {
      e.x.set(tmpGlobal)
      reconstruir(e)
      EST[E_ADOPC]++
      adopta = true
    }
  }
  let n = adopta ? 2 : 4
  for (let r = 0; r < n; r++) moverBloque(true)
  ultimaMejora = iter
}

function leerGlobal(dest) {
  let v1 = Atomics.load(C, G_VER)
  if (v1 & 1) return false
  if (Atomics.load(C, G_ED) !== miEd || Atomics.load(C, G_OBJ) === 2147483647) return false
  dest.set(GB)
  return Atomics.load(C, G_VER) === v1
}

function publicar() {
  if (miEd !== Atomics.load(C, EDICION)) return false
  if (Atomics.load(C, G_ED) === miEd && mejorObj >= Atomics.load(C, G_OBJ)) return false
  if (Atomics.compareExchange(C, G_LOCK, 0, yo + 1) !== 0) {
    EST[E_CASFALLO]++
    return false
  }
  let ok = false
  if (miEd === Atomics.load(C, EDICION) && (Atomics.load(C, G_ED) !== miEd || mejorObj < Atomics.load(C, G_OBJ))) {
    Atomics.add(C, G_VER, 1)
    GB.set(mejorX)
    Atomics.store(C, G_OBJ, mejorObj)
    Atomics.store(C, G_DURO, mejorDuro)
    Atomics.store(C, G_BLANDO, mejorBlando)
    Atomics.store(C, G_AUTOR, yo)
    Atomics.store(C, G_ED, miEd)
    Atomics.store(C, G_H1, mejorH1)
    Atomics.store(C, G_H2, mejorH2)
    Atomics.add(C, G_VER, 1)
    EST[E_PUBLIC]++
    ok = true
  }
  Atomics.store(C, G_LOCK, 0)
  return ok
}

function cooperar() {
  publicar()
}

function ciclo() {
  if (Atomics.load(C, EPOCA) !== miEpoca) return
  if (!Atomics.load(C, CORRIENDO)) {
    escribirStats()
    setTimeout(ciclo, 200)
    return
  }
  let t0 = performance.now()
  while (performance.now() - t0 < 25) {
    for (let k = 0; k < 40; k++) paso()
    if (iter - ultimaMejora > ESTANC) diversificar()
  }
  if (iter % 2000 < 40) ajustarPesos()
  let ahora = performance.now(), periodo = Atomics.load(C, PERIODO)
  if (ahora - ultimaCoop >= (periodo > 0 ? periodo : 1000)) {
    ultimaCoop = ahora
    cooperar()
  }
  escribirStats()
  setTimeout(ciclo, 0)
}

function escribirStats() {
  let ahora = performance.now()
  if (ahora - ultimaVel > 500) {
    EST[E_VELOC] = evalVel * 1000 / (ahora - ultimaVel)
    evalVel = 0
    ultimaVel = ahora
  }
  EST[E_OBJ] = objetivo(e)
  EST[E_MEJOR] = mejorObj
  EST[E_DURO] = e.duro
  EST[E_BLANDO] = e.blando
  EST[E_ITER] = iter
}

function recibirEdicion(d) {
  let t0 = performance.now()
  aplicarEdicion(pr, d.ed)
  miEd = d.num
  let n = corregirFijos(pr, e.x)
  reconstruir(e)
  let cambios = n + repararFactibilidad(e, 40)
  let copia = new Uint8Array(mejorX)
  corregirFijos(pr, copia)
  let eb = crearEstado(pr, copia)
  repararFactibilidad(eb, 40)
  if (objetivo(eb) < objetivo(e)) {
    e.x.set(eb.x)
    reconstruir(e)
  }
  guardarMejor()
  visitas.fill(0)
  if (d.ed.p !== undefined) for (let s = 0; s < SLOTS; s++) tabuHasta[d.ed.p * SLOTS + s] = 0
  ultimaMejora = iter
  EST[E_EDIC] = miEd
  EST[E_MSREP] = performance.now() - t0
  EST[E_CAMBREP] = cambios
  publicar()
}

function pruebaCoherencia() {
  let copia = crearEstado(pr, e.x)
  let rondas = [], t0 = performance.now(), movs = 0
  for (let r = 0; r < 5; r++) {
    for (let k = 0; k < 1000; k++) {
      let i = aleatorio(pr.P * SLOTS)
      if (!movible(pr, i)) continue
      cambiar(copia, (i / SLOTS) | 0, i % SLOTS)
      movs++
    }
    let c = costoCompleto(pr, copia.x)
    rondas.push({ incremental: copia.duro * W_DURA + copia.blando, completo: c.objetivo, ok: c.duro === copia.duro && c.blando === copia.blando })
  }
  postMessage({ tipo: 'prueba', id: yo, rondas: rondas, movimientos: movs, ms: performance.now() - t0, verificaciones: EST[E_VERIF], discrepancias: EST[E_DISCREP] })
}
