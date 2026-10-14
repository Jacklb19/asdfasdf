const DIAS = 30, JOR = 3, SLOTS = 90, NPERF = 4
const PERFILES = ['Médico general', 'Médico reanimación', 'Enfermera jefe', 'Auxiliar']
const SIGLA_PERFIL = ['MG', 'MR', 'EJ', 'AU']
const JORNADAS = ['Mañana', 'Tarde', 'Noche']
const LETRA = ['M', 'T', 'N']
const DIASEM = ['lu', 'ma', 'mi', 'ju', 'vi', 'sá', 'do']
const W_DURA = 1000

let Z1 = null, Z2 = null

function azarSemilla(semilla) {
  let s = semilla >>> 0
  return function () {
    s = (s + 0x6D2B79F5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function prepararZobrist(n) {
  Z1 = new Int32Array(n * SLOTS)
  Z2 = new Int32Array(n * SLOTS)
  let r = azarSemilla(987654321)
  for (let i = 0; i < n * SLOTS; i++) {
    Z1[i] = (r() * 4294967296) | 0
    Z2[i] = (r() * 4294967296) | 0
  }
}

function prepararProblema(datos) {
  let pr = {}
  let P = datos.personas.length
  pr.datos = datos
  pr.P = P
  pr.perfil = new Int8Array(P)
  pr.contrato = []
  pr.minT = new Int16Array(P)
  pr.maxT = new Int16Array(P)
  pr.minBase = new Int16Array(P)
  pr.maxBase = new Int16Array(P)
  pr.grupo = new Int8Array(P)
  pr.nGrupo = new Int32Array(NPERF)
  pr.soloNoche = new Uint8Array(P)
  pr.miembros = [[], [], [], []]
  for (let p = 0; p < P; p++) {
    let per = datos.personas[p], c = datos.contratos[per.contrato]
    pr.perfil[p] = per.perfil
    pr.contrato.push(per.contrato)
    pr.minBase[p] = c.min
    pr.maxBase[p] = c.max
    pr.soloNoche[p] = c.soloNoche ? 1 : 0
    pr.grupo[p] = c.equidad ? per.perfil : -1
    if (c.equidad) pr.nGrupo[per.perfil]++
    pr.miembros[per.perfil].push(p)
  }
  pr.finde = new Uint8Array(DIAS)
  for (let d = 0; d < DIAS; d++) {
    let ds = (datos.primerDia + d) % 7
    if (ds >= 5 || datos.festivos.indexOf(d) >= 0) pr.finde[d] = 1
  }
  pr.cuota = new Int16Array(SLOTS * NPERF)
  for (let s = 0; s < SLOTS; s++) for (let k = 0; k < NPERF; k++) pr.cuota[s * NPERF + k] = datos.cuotas[s % 3][k]
  pr.ausente = new Uint8Array(P * SLOTS)
  pr.motivo = {}
  for (let a of datos.ausencias) {
    for (let d = a.d0; d <= a.d1; d++) {
      for (let t = 0; t < 3; t++) pr.ausente[a.p * SLOTS + 3 * d + t] = 1
      pr.motivo[a.p * DIAS + d] = a.tipo
    }
  }
  pr.fijo = new Int8Array(P * SLOTS).fill(-1)
  pr.pen = new Int16Array(P * SLOTS)
  for (let p = 0; p < P; p++) {
    let per = datos.personas[p], w = 1 + Math.floor(per.antiguedad / 6)
    for (let d of per.diasLibres) for (let t = 0; t < 3; t++) pr.pen[p * SLOTS + 3 * d + t] += 2 * w
    if (per.evita >= 0) for (let d = 0; d < DIAS; d++) pr.pen[p * SLOTS + 3 * d + per.evita] += w
  }
  pr.incomp = []
  pr.parejas = []
  for (let p = 0; p < P; p++) {
    pr.incomp.push([])
    pr.parejas.push([])
  }
  for (let par of datos.incompatibles) {
    pr.incomp[par[0]].push(par[1])
    pr.incomp[par[1]].push(par[0])
  }
  for (let par of datos.parejas) {
    pr.parejas[par[0]].push(par[1])
    pr.parejas[par[1]].push(par[0])
  }
  pr.pesos = datos.pesos
  pr.bloq = new Uint8Array(P * SLOTS)
  recalcularBloqueos(pr)
  if (!Z1 || Z1.length !== P * SLOTS) prepararZobrist(P)
  return pr
}

function recalcularBloqueos(pr) {
  for (let p = 0; p < pr.P; p++) {
    let diasAus = 0
    for (let d = 0; d < DIAS; d++) if (pr.ausente[p * SLOTS + 3 * d]) diasAus++
    pr.minT[p] = Math.max(0, Math.round(pr.minBase[p] * (DIAS - diasAus) / DIAS))
    pr.maxT[p] = Math.max(0, Math.round(pr.maxBase[p] * (DIAS - diasAus) / DIAS))
    for (let s = 0; s < SLOTS; s++) {
      let i = p * SLOTS + s
      pr.bloq[i] = (pr.ausente[i] || pr.fijo[i] === 0 || (pr.soloNoche[p] && s % 3 !== 2)) ? 1 : 0
    }
  }
}

function movible(pr, i) {
  return pr.bloq[i] === 0 && pr.fijo[i] < 0
}

function aplicarEdicion(pr, ed) {
  if (ed.tipo === 'fijar') {
    pr.fijo[ed.p * SLOTS + ed.s] = ed.valor
  } else if (ed.tipo === 'soltar') {
    pr.fijo[ed.p * SLOTS + ed.s] = -1
  } else if (ed.tipo === 'ausencia') {
    for (let d = ed.d0; d <= ed.d1; d++) {
      for (let t = 0; t < 3; t++) pr.ausente[ed.p * SLOTS + 3 * d + t] = 1
      pr.motivo[ed.p * DIAS + d] = ed.motivo || 'ausencia'
    }
  } else if (ed.tipo === 'quitarAusencia') {
    for (let d = ed.d0; d <= ed.d1; d++) {
      for (let t = 0; t < 3; t++) pr.ausente[ed.p * SLOTS + 3 * d + t] = 0
      delete pr.motivo[ed.p * DIAS + d]
    }
  } else if (ed.tipo === 'cuota') {
    for (let d = 0; d < DIAS; d++) {
      if (ed.dia >= 0 && d !== ed.dia) continue
      pr.cuota[(3 * d + ed.t) * NPERF + ed.k] = ed.valor
    }
  }
  recalcularBloqueos(pr)
}

function corregirFijos(pr, x) {
  let n = 0
  for (let i = 0; i < pr.P * SLOTS; i++) {
    let v = x[i]
    if (pr.fijo[i] === 1) x[i] = 1
    else if (pr.bloq[i]) x[i] = 0
    if (x[i] !== v) n++
  }
  return n
}

function f3(n) {
  return n > 3 ? n - 3 : 0
}

function g6(n) {
  return n > 6 ? n - 6 : 0
}

function regul(a, b) {
  if (a < 0 || b < 0 || a === b) return 0
  return (a === 2 || b === 2) ? 2 : 1
}

function fuera(pr, p, n) {
  return (n < pr.minT[p] ? pr.minT[p] - n : 0) + (n > pr.maxT[p] ? n - pr.maxT[p] : 0)
}

function contarBits(v) {
  v = v - ((v >>> 1) & 0x55555555)
  v = (v & 0x33333333) + ((v >>> 2) & 0x33333333)
  return (((v + (v >>> 4)) & 0x0F0F0F0F) * 0x01010101) >>> 24
}

function mascaras(pr, x) {
  let m = new Uint32Array(pr.P * 3)
  for (let p = 0; p < pr.P; p++) {
    for (let s = 0; s < SLOTS; s++) if (x[p * SLOTS + s]) m[p * 3 + (s >> 5)] |= 1 << (s & 31)
  }
  return m
}

function desplazar(m, o, k) {
  let a = m[o], b = m[o + 1], c = m[o + 2]
  return [((a >>> k) | (b << (32 - k))) >>> 0, ((b >>> k) | (c << (32 - k))) >>> 0, c >>> k]
}

function costoCompleto(pr, x) {
  let pe = pr.pesos, r = { cobertura: 0, descanso: 0, noches: 0, dias: 0, horas: 0, ausencias: 0, incompat: 0, fijos: 0, equidadNoches: 0, equidadFindes: 0, preferencias: 0, regularidad: 0, sobrecobertura: 0, parejas: 0 }
  let m = mascaras(pr, x)
  let cnt = new Int32Array(SLOTS * NPERF)
  let noches = new Int32Array(pr.P), findes = new Int32Array(pr.P)
  for (let p = 0; p < pr.P; p++) {
    let o = p * 3, turnos = 0
    for (let w = 0; w < 3; w++) turnos += contarBits(m[o + w])
    r.horas += fuera(pr, p, turnos)
    let d1 = desplazar(m, o, 1), d2 = desplazar(m, o, 2)
    for (let w = 0; w < 3; w++) r.descanso += contarBits(m[o + w] & d1[w]) + contarBits(m[o + w] & d2[w])
    let corridaN = 0, corridaD = 0, tipoAnt = -1
    for (let d = 0; d < DIAS; d++) {
      let b = p * SLOTS + 3 * d
      let n = x[b + 2], tr = x[b] || x[b + 1] || x[b + 2]
      if (n) corridaN++
      else {
        r.noches += f3(corridaN)
        corridaN = 0
      }
      if (tr) corridaD++
      else {
        r.dias += g6(corridaD)
        corridaD = 0
      }
      let tipo = x[b] ? 0 : x[b + 1] ? 1 : x[b + 2] ? 2 : -1
      if (d > 0) r.regularidad += regul(tipoAnt, tipo)
      tipoAnt = tipo
      if (n) noches[p]++
      if (pr.finde[d]) findes[p] += x[b] + x[b + 1] + x[b + 2]
    }
    r.noches += f3(corridaN)
    r.dias += g6(corridaD)
    for (let s = 0; s < SLOTS; s++) {
      let i = p * SLOTS + s
      if (x[i]) {
        cnt[s * NPERF + pr.perfil[p]]++
        if (pr.ausente[i] || (pr.soloNoche[p] && s % 3 !== 2) || pr.fijo[i] === 0) r.ausencias++
        r.preferencias += pr.pen[i]
      } else if (pr.fijo[i] === 1) r.fijos++
    }
    for (let q of pr.incomp[p]) if (q > p) for (let w = 0; w < 3; w++) r.incompat += contarBits(m[o + w] & m[q * 3 + w])
    for (let q of pr.parejas[p]) if (q > p) for (let w = 0; w < 3; w++) r.parejas += contarBits(m[o + w] ^ m[q * 3 + w])
  }
  for (let s = 0; s < SLOTS; s++) {
    for (let k = 0; k < NPERF; k++) {
      let c = cnt[s * NPERF + k], q = pr.cuota[s * NPERF + k]
      if (c < q) r.cobertura += q - c
      if (c > q) r.sobrecobertura += c - q
    }
  }
  for (let g = 0; g < NPERF; g++) {
    let n = pr.nGrupo[g], s1 = 0, s2 = 0, f1 = 0, f2 = 0
    for (let p = 0; p < pr.P; p++) {
      if (pr.grupo[p] !== g) continue
      s1 += noches[p]
      s2 += noches[p] * noches[p]
      f1 += findes[p]
      f2 += findes[p] * findes[p]
    }
    if (n > 0) {
      r.equidadNoches += Math.floor(pe.eqN * (n * s2 - s1 * s1) / n)
      r.equidadFindes += Math.floor(pe.eqF * (n * f2 - f1 * f1) / n)
    }
  }
  r.duro = r.cobertura + r.descanso + r.noches + r.dias + r.horas + r.ausencias + r.incompat + r.fijos
  r.blando = r.equidadNoches + r.equidadFindes + r.preferencias + pe.reg * r.regularidad + pe.sob * r.sobrecobertura + pe.pareja * r.parejas
  r.objetivo = r.duro * W_DURA + r.blando
  return r
}

function crearEstado(pr, celdas, destino) {
  let e = { pr: pr }
  e.x = destino || new Uint8Array(pr.P * SLOTS)
  e.x.set(celdas)
  reconstruir(e)
  return e
}

function reconstruir(e) {
  let pr = e.pr, x = e.x
  e.turnos = new Int16Array(pr.P)
  e.noches = new Int16Array(pr.P)
  e.findes = new Int16Array(pr.P)
  e.diaCnt = new Uint8Array(pr.P * DIAS)
  e.cnt = new Int16Array(SLOTS * NPERF)
  e.S1n = new Int32Array(NPERF)
  e.S1f = new Int32Array(NPERF)
  e.En = new Float64Array(NPERF)
  e.Ef = new Float64Array(NPERF)
  e.h1 = 0
  e.h2 = 0
  for (let p = 0; p < pr.P; p++) {
    for (let s = 0; s < SLOTS; s++) {
      let i = p * SLOTS + s
      if (!x[i]) continue
      let d = (s / 3) | 0
      e.turnos[p]++
      e.diaCnt[p * DIAS + d]++
      e.cnt[s * NPERF + pr.perfil[p]]++
      if (s % 3 === 2) e.noches[p]++
      if (pr.finde[d]) e.findes[p]++
      e.h1 ^= Z1[i]
      e.h2 ^= Z2[i]
    }
    if (pr.grupo[p] >= 0) {
      e.S1n[pr.grupo[p]] += e.noches[p]
      e.S1f[pr.grupo[p]] += e.findes[p]
    }
  }
  let s2n = new Float64Array(NPERF), s2f = new Float64Array(NPERF)
  for (let p = 0; p < pr.P; p++) {
    let g = pr.grupo[p]
    if (g < 0) continue
    s2n[g] += e.noches[p] * e.noches[p]
    s2f[g] += e.findes[p] * e.findes[p]
  }
  for (let g = 0; g < NPERF; g++) {
    e.En[g] = pr.nGrupo[g] * s2n[g] - e.S1n[g] * e.S1n[g]
    e.Ef[g] = pr.nGrupo[g] * s2f[g] - e.S1f[g] * e.S1f[g]
  }
  let c = costoCompleto(pr, x)
  e.duro = c.duro
  e.blando = c.blando
}

function objetivo(e) {
  return e.duro * W_DURA + e.blando
}

function tipoDia(x, b) {
  return x[b] ? 0 : x[b + 1] ? 1 : x[b + 2] ? 2 : -1
}

function cambiar(e, p, s) {
  let pr = e.pr, pe = pr.pesos, x = e.x
  let base = p * SLOTS, i = base + s, v = x[i], nv = 1 - v, sg = nv - v
  let d = (s / 3) | 0, t = s - 3 * d, k = pr.perfil[p]
  let dd = 0, db = 0
  let vec = 0
  if (s >= 2) vec += x[i - 2]
  if (s >= 1) vec += x[i - 1]
  if (s <= 88) vec += x[i + 1]
  if (s <= 87) vec += x[i + 2]
  dd += sg * vec
  let ic = s * NPERF + k, c = e.cnt[ic], q = pr.cuota[ic], c2 = c + sg
  dd += (c2 < q ? q - c2 : 0) - (c < q ? q - c : 0)
  db += pe.sob * ((c2 > q ? c2 - q : 0) - (c > q ? c - q : 0))
  e.cnt[ic] = c2
  let n = e.turnos[p]
  dd += fuera(pr, p, n + sg) - fuera(pr, p, n)
  e.turnos[p] = n + sg
  let lista = pr.incomp[p]
  for (let j = 0; j < lista.length; j++) if (x[lista[j] * SLOTS + s]) dd += sg
  lista = pr.parejas[p]
  for (let j = 0; j < lista.length; j++) {
    let o = x[lista[j] * SLOTS + s]
    db += pe.pareja * ((nv ^ o) - (v ^ o))
  }
  db += sg * pr.pen[i]
  if (pr.ausente[i] || pr.fijo[i] === 0 || (pr.soloNoche[p] && t !== 2)) dd += sg
  if (pr.fijo[i] === 1) dd -= sg
  let g = pr.grupo[p]
  if (t === 2) {
    let izq = 0, der = 0
    for (let a = d - 1; a >= 0 && x[base + 3 * a + 2]; a--) izq++
    for (let a = d + 1; a < DIAS && x[base + 3 * a + 2]; a++) der++
    dd += sg * (f3(izq + der + 1) - f3(izq) - f3(der))
    if (g >= 0) {
      let x0 = e.noches[p], nG = pr.nGrupo[g], E0 = e.En[g]
      let E1 = E0 + nG * (2 * x0 * sg + 1) - (2 * e.S1n[g] * sg + 1)
      db += Math.floor(pe.eqN * E1 / nG) - Math.floor(pe.eqN * E0 / nG)
      e.En[g] = E1
      e.S1n[g] += sg
    }
    e.noches[p] += sg
  }
  if (pr.finde[d]) {
    if (g >= 0) {
      let x0 = e.findes[p], nG = pr.nGrupo[g], E0 = e.Ef[g]
      let E1 = E0 + nG * (2 * x0 * sg + 1) - (2 * e.S1f[g] * sg + 1)
      db += Math.floor(pe.eqF * E1 / nG) - Math.floor(pe.eqF * E0 / nG)
      e.Ef[g] = E1
      e.S1f[g] += sg
    }
    e.findes[p] += sg
  }
  let id = p * DIAS + d, dc = e.diaCnt[id]
  if ((sg > 0 && dc === 0) || (sg < 0 && dc === 1)) {
    let izq = 0, der = 0
    for (let a = d - 1; a >= 0 && e.diaCnt[p * DIAS + a]; a--) izq++
    for (let a = d + 1; a < DIAS && e.diaCnt[p * DIAS + a]; a++) der++
    dd += sg * (g6(izq + der + 1) - g6(izq) - g6(der))
  }
  e.diaCnt[id] = dc + sg
  let bd = base + 3 * d
  let ta = d > 0 ? tipoDia(x, bd - 3) : -1, tb = d < DIAS - 1 ? tipoDia(x, bd + 3) : -1
  let antes = regul(ta, tipoDia(x, bd)) + regul(tipoDia(x, bd), tb)
  x[i] = nv
  let despues = regul(ta, tipoDia(x, bd)) + regul(tipoDia(x, bd), tb)
  db += pe.reg * (despues - antes)
  e.h1 ^= Z1[i]
  e.h2 ^= Z2[i]
  e.duro += dd
  e.blando += db
}

function razonesDuras(e, q, s) {
  let pr = e.pr, x = e.x, base = q * SLOTS, i = base + s, d = (s / 3) | 0, t = s % 3
  let r = []
  if (pr.ausente[i]) r.push('ausencia aprobada (' + (pr.motivo[q * DIAS + d] || 'ausencia') + ')')
  if (pr.fijo[i] === 0) r.push('el coordinador fijó esta casilla como libre')
  if (pr.soloNoche[q] && t !== 2) r.push('contrato exclusivo de noche')
  for (let o of [-2, -1, 1, 2]) {
    let s2 = s + o
    if (s2 < 0 || s2 >= SLOTS || !x[base + s2]) continue
    let antes = o < 0 ? s2 : s
    let txt = JORNADAS[s2 % 3].toLowerCase() + ' del día ' + (((s2 / 3) | 0) + 1)
    if (antes % 3 === 2) r.push('descanso de 24 h después de la noche (choca con ' + txt + ')')
    else r.push('descanso mínimo de 12 h (choca con ' + txt + ')')
  }
  if (t === 2) {
    let izq = 0, der = 0
    for (let a = d - 1; a >= 0 && x[base + 3 * a + 2]; a--) izq++
    for (let a = d + 1; a < DIAS && x[base + 3 * a + 2]; a++) der++
    if (izq + der + 1 > 3) r.push('serían ' + (izq + der + 1) + ' noches seguidas (máximo 3)')
  }
  if (!e.diaCnt[q * DIAS + d]) {
    let izq = 0, der = 0
    for (let a = d - 1; a >= 0 && e.diaCnt[q * DIAS + a]; a--) izq++
    for (let a = d + 1; a < DIAS && e.diaCnt[q * DIAS + a]; a++) der++
    if (izq + der + 1 > 6) r.push('serían ' + (izq + der + 1) + ' días seguidos de trabajo (máximo 6)')
  }
  if (e.turnos[q] + 1 > pr.maxT[q]) r.push('superaría sus horas: ' + (e.turnos[q] + 1) * 8 + ' h, máximo ' + pr.maxT[q] * 8 + ' h')
  for (let o of pr.incomp[q]) if (x[o * SLOTS + s]) r.push('incompatible con ' + pr.datos.personas[o].nombre + ', que ya está en esta jornada')
  return r
}

function probarMovimiento(e, celdas) {
  let o0 = objetivo(e), d0 = e.duro, b0 = e.blando
  for (let c of celdas) cambiar(e, (c / SLOTS) | 0, c % SLOTS)
  let r = { delta: objetivo(e) - o0, duro: e.duro - d0, blando: e.blando - b0 }
  for (let j = celdas.length - 1; j >= 0; j--) cambiar(e, (celdas[j] / SLOTS) | 0, celdas[j] % SLOTS)
  return r
}

function explicar(e, p, s) {
  let pr = e.pr, k = pr.perfil[p], i = p * SLOTS + s
  let asignado = e.x[i] === 1
  let filas = []
  for (let q of pr.miembros[k]) {
    let j = q * SLOTS + s, f = { q: q, nombre: pr.datos.personas[q].nombre, asignado: e.x[j] === 1, fijo: pr.fijo[j], razones: [], delta: null }
    if (q === p) {
      f.actual = true
    } else if (e.x[j]) {
      f.razones = ['ya está asignado en esta jornada']
    } else {
      let cel = asignado ? [i, j] : [j]
      let quitado = false
      if (asignado) {
        cambiar(e, p, s)
        quitado = true
      }
      f.razones = razonesDuras(e, q, s)
      if (quitado) cambiar(e, p, s)
      if (asignado && pr.fijo[i] === 1) f.razones.unshift('la casilla actual está fijada por el coordinador')
      f.delta = probarMovimiento(e, cel)
    }
    filas.push(f)
  }
  filas.sort(function (a, b) {
    if (a.actual) return -1
    if (b.actual) return 1
    if (a.delta === null) return 1
    if (b.delta === null) return -1
    return a.delta.delta - b.delta.delta
  })
  let quitar = asignado && movible(pr, i) ? probarMovimiento(e, [i]) : null
  return { asignado: asignado, filas: filas, quitar: quitar }
}

function celdasConViolacion(pr, x) {
  let mal = new Uint8Array(pr.P * SLOTS)
  let cnt = new Int16Array(SLOTS * NPERF)
  for (let p = 0; p < pr.P; p++) {
    let base = p * SLOTS, n = 0
    for (let s = 0; s < SLOTS; s++) {
      let i = base + s
      if (!x[i]) {
        if (pr.fijo[i] === 1) mal[i] = 1
        continue
      }
      n++
      cnt[s * NPERF + pr.perfil[p]]++
      if (pr.bloq[i]) mal[i] = 1
      if (s + 1 < SLOTS && x[i + 1]) mal[i] = mal[i + 1] = 1
      if (s + 2 < SLOTS && x[i + 2]) mal[i] = mal[i + 2] = 1
      for (let q of pr.incomp[p]) if (x[q * SLOTS + s]) mal[i] = 1
    }
    let corrida = 0
    for (let d = 0; d <= DIAS; d++) {
      if (d < DIAS && x[base + 3 * d + 2]) corrida++
      else {
        if (corrida > 3) for (let a = d - corrida; a < d; a++) mal[base + 3 * a + 2] = 1
        corrida = 0
      }
    }
    corrida = 0
    for (let d = 0; d <= DIAS; d++) {
      let tr = d < DIAS && (x[base + 3 * d] || x[base + 3 * d + 1] || x[base + 3 * d + 2])
      if (tr) corrida++
      else {
        if (corrida > 6) for (let a = d - corrida; a < d; a++) for (let t = 0; t < 3; t++) if (x[base + 3 * a + t]) mal[base + 3 * a + t] = 1
        corrida = 0
      }
    }
    if (fuera(pr, p, n) > 0) for (let s = 0; s < SLOTS; s++) if (x[base + s]) mal[base + s] = 2
  }
  let faltan = []
  for (let s = 0; s < SLOTS; s++) for (let k = 0; k < NPERF; k++) if (cnt[s * NPERF + k] < pr.cuota[s * NPERF + k]) faltan.push({ s: s, k: k, faltan: pr.cuota[s * NPERF + k] - cnt[s * NPERF + k] })
  return { mal: mal, faltan: faltan }
}

function repararFactibilidad(e, presupuesto) {
  let pr = e.pr, cambios = 0, pasos = 0
  while (e.duro > 0 && pasos < presupuesto) {
    pasos++
    let mejor = -1, mejorObj = objetivo(e)
    for (let i = 0; i < pr.P * SLOTS; i++) {
      if (!movible(pr, i)) continue
      let p = (i / SLOTS) | 0, s = i % SLOTS
      cambiar(e, p, s)
      let o = objetivo(e)
      cambiar(e, p, s)
      if (o < mejorObj) {
        mejorObj = o
        mejor = i
      }
    }
    if (mejor < 0) break
    cambiar(e, (mejor / SLOTS) | 0, mejor % SLOTS)
    cambios++
  }
  return cambios
}
