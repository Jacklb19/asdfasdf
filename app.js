const EDICION = 0, G_LOCK = 1, G_VER = 2, G_OBJ = 3, G_DURO = 4, G_BLANDO = 5, G_AUTOR = 6, G_ED = 7, G_H1 = 8, G_H2 = 9, PERIODO = 10, CORRIENDO = 11, ESTRES = 12, EPOCA = 13
const NEST = 40, MAXW = 16
const VERSION_CODIGO = 'turnos-urgencias 1.0.0'

let datos, pr, buf = null, C = null, GB, EST
let workers = [], nWorkers = 1
let mostrado, viol, faltan = [], versionLeida = -1
let ediciones = []
let esLider = true, puerto = null, pestanas = 1, rolDecidido = false
let tabla
let serie = [], marcas = [], t0Busqueda = 0, primeraFactible = 0, ultimaDivers = 0
let lectura = { ok: 0, reintentos: 0, malas: 0, celdas: 0, nodos: 0 }
let banco = null, pruebas = {}, sel = null, instantanea = null
let alEco = null

function $(id) {
  return document.getElementById(id)
}

document.addEventListener('DOMContentLoaded', iniciar)

function iniciar() {
  $('aislado').textContent = 'crossOriginIsolated: ' + window.crossOriginIsolated
  $('aislado').className = 'chip ' + (window.crossOriginIsolated ? 'ok' : 'mal')
  iniciarMetricas()
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').then(function () { pintarRed() }).catch(function () {})
    navigator.serviceWorker.addEventListener('message', function (e) {
      if (e.data.tipo === 'colaEnviada' || e.data.tipo === 'estadoCola') {
        $('cola').textContent = 'Cambios pendientes por enviar: ' + (e.data.pendientes || 0)
      }
    })
  }
  window.addEventListener('online', function () {
    pintarRed()
    vaciarCola()
  })
  window.addEventListener('offline', pintarRed)
  pintarRed()
  fetch('datos.json').then(function (r) { return r.json() }).then(function (d) {
    datos = d
    pr = prepararProblema(datos)
    mostrado = new Uint8Array(pr.P * SLOTS)
    viol = new Uint8Array(pr.P * SLOTS)
    let guardado = leerGuardado()
    if (guardado) {
      for (let i = 0; i < mostrado.length; i++) mostrado[i] = guardado.celdas.charCodeAt(i) === 49 ? 1 : 0
      for (let ed of guardado.ediciones) {
        aplicarEdicion(pr, ed.ed)
        ediciones.push(ed)
      }
      $('guardado').textContent = 'Se cargó el último cuadro guardado (' + guardado.fecha + ').'
    } else {
      for (let i = 0; i < mostrado.length; i++) mostrado[i] = datos.cuadroManual.charCodeAt(i) === 49 ? 1 : 0
    }
    crearVista()
    pintarManual()
    conectarCoordinador()
  }).catch(function (err) {
    $('estado').textContent = 'No se pudieron cargar los datos: ' + err
  })
  conectarEventos()
}

function pintarRed() {
  $('red').textContent = navigator.onLine ? 'en línea' : 'sin conexión'
  $('red').className = 'chip ' + (navigator.onLine ? 'ok' : 'mal')
}

function conectarCoordinador() {
  if (typeof SharedWorker === 'undefined') {
    decidirRol(true, null, [])
    return
  }
  try {
    let sw = new SharedWorker('coordinador.js')
    puerto = sw.port
    puerto.onmessage = function (e) { mensajeCoordinador(e.data) }
    puerto.start()
    puerto.postMessage({ tipo: 'hola' })
    window.addEventListener('pagehide', function () { puerto.postMessage({ tipo: 'adios' }) })
    setInterval(function () { if (!esLider) puerto.postMessage({ tipo: 'vivo' }) }, 5000)
    setTimeout(function () { if (!rolDecidido) decidirRol(true, null, []) }, 2000)
  } catch (err) {
    puerto = null
    decidirRol(true, null, [])
  }
}

function mensajeCoordinador(d) {
  if (d.tipo === 'rol') {
    pestanas = d.pestanas || 1
    if (!rolDecidido) decidirRol(d.lider, d.instantanea, d.ediciones || [])
    else if (d.lider && !esLider) {
      esLider = true
      arrancarBusqueda(d.instantanea ? d.instantanea.celdas : celdasTexto(mostrado))
      pintarRol()
    }
  } else if (d.tipo === 'pestanas') {
    pestanas = d.n
    pintarRol()
  } else if (d.tipo === 'edicion') {
    aplicarEdicionLocal(d.ed, d.num)
  } else if (d.tipo === 'instantanea') {
    if (esLider) return
    instantanea = d
    let nuevo = new Uint8Array(mostrado.length)
    for (let i = 0; i < nuevo.length; i++) nuevo[i] = d.celdas.charCodeAt(i) === 49 ? 1 : 0
    aplicarVista(nuevo)
    $('mejor').textContent = d.blando + ' puntos · ' + d.duro + ' violaciones duras (recibido de la pestaña líder)'
  }
}

function decidirRol(lider, inst, eds) {
  rolDecidido = true
  esLider = lider
  if (eds.length > ediciones.length) {
    pr = prepararProblema(datos)
    ediciones = []
    for (let x of eds) {
      aplicarEdicion(pr, x.ed)
      ediciones.push(x)
    }
  }
  if (inst && inst.celdas) {
    let nuevo = new Uint8Array(mostrado.length)
    for (let i = 0; i < nuevo.length; i++) nuevo[i] = inst.celdas.charCodeAt(i) === 49 ? 1 : 0
    aplicarVista(nuevo)
  }
  pintarRol()
  if (esLider) arrancarBusqueda(inst && inst.celdas ? inst.celdas : null)
  else $('estado').textContent = 'Otra pestaña ya está optimizando: esta pestaña muestra el mismo cuadro y sus ediciones se aplican a esa búsqueda, sin reiniciarla.'
}

function pintarRol() {
  $('rol').textContent = (esLider ? 'Pestaña líder (corre la búsqueda)' : 'Pestaña seguidora') + ' · pestañas abiertas: ' + pestanas
}

function arrancarBusqueda(inicial) {
  if (!window.crossOriginIsolated || typeof SharedArrayBuffer === 'undefined') {
    $('estado').textContent = 'Sin crossOriginIsolated no hay SharedArrayBuffer: falta configurar COOP y COEP.'
    return
  }
  if (!buf) {
    let n = pr.P * SLOTS
    buf = { ctrl: new SharedArrayBuffer(4 * 64), global: new SharedArrayBuffer(n), actuales: new SharedArrayBuffer(n * MAXW), stats: new SharedArrayBuffer(8 * NEST * MAXW) }
    C = new Int32Array(buf.ctrl)
    GB = new Uint8Array(buf.global)
    EST = new Float64Array(buf.stats)
    C[G_OBJ] = 2147483647
    C[PERIODO] = +$('periodo').value
    C[CORRIENDO] = 1
  }
  let n = Math.max(1, (navigator.hardwareConcurrency || 2) - 1)
  if (n > 8) n = 8
  $('nw').value = String(n)
  $('nwTexto').textContent = 'hardwareConcurrency = ' + (navigator.hardwareConcurrency || '?') + ', se usan ' + n + ' workers y se deja 1 núcleo libre para la interfaz'
  crearWorkers(n, inicial)
  t0Busqueda = performance.now()
  setInterval(leerMejor, 250)
  setInterval(pintarPanel, 1000)
  setInterval(enviarInstantanea, 1000)
  setInterval(guardar, 3000)
}

function crearWorkers(n, inicial) {
  Atomics.add(C, EPOCA, 1)
  for (let w of workers) w.terminate()
  workers = []
  nWorkers = n
  EST.fill(0)
  C[EDICION] = ediciones.length
  let epoca = Atomics.load(C, EPOCA)
  for (let k = 0; k < n; k++) {
    let w = new Worker('buscador.js')
    w.onmessage = function (e) { mensajeWorker(e.data) }
    w.onerror = function (e) { $('estado').textContent = 'Error en el worker ' + k + ': ' + e.message }
    w.postMessage({ tipo: 'init', id: k, nw: n, epoca: epoca, buf: buf, datos: datos, ediciones: ediciones, inicial: inicial })
    workers.push(w)
  }
  $('estado').textContent = n + ' workers buscando. Puede editar el cuadro mientras tanto.'
}

function mensajeWorker(d) {
  if (d.tipo === 'banco') {
    banco = d
    pintarBanco()
  } else if (d.tipo === 'prueba') {
    pruebas[d.id] = d
    pintarPruebas()
  } else if (d.tipo === 'eco') {
    if (alEco) alEco(d)
  }
}

function celdasTexto(x) {
  let t = ''
  for (let i = 0; i < x.length; i++) t += x[i]
  return t
}

function leerMejor() {
  if (!C || !esLider) return
  let v1 = Atomics.load(C, G_VER)
  if (v1 === versionLeida) return
  if (v1 & 1) {
    lectura.reintentos++
    return
  }
  let copia = GB.slice()
  let obj = Atomics.load(C, G_OBJ), duro = Atomics.load(C, G_DURO), blando = Atomics.load(C, G_BLANDO), h1 = Atomics.load(C, G_H1), h2 = Atomics.load(C, G_H2), ed = Atomics.load(C, G_ED), autor = Atomics.load(C, G_AUTOR)
  if (Atomics.load(C, G_VER) !== v1) {
    lectura.reintentos++
    return
  }
  if (obj === 2147483647 || ed !== ediciones.length) return
  versionLeida = v1
  let a = 0, b = 0
  for (let i = 0; i < copia.length; i++) if (copia[i]) {
    a ^= Z1[i]
    b ^= Z2[i]
  }
  let c = costoCompleto(pr, copia)
  if (a === h1 && b === h2 && c.duro === duro && c.blando === blando) lectura.ok++
  else lectura.malas++
  aplicarVista(copia)
  let t = (performance.now() - t0Busqueda) / 1000
  if (duro === 0 && !primeraFactible) primeraFactible = t
  serie.push({ t: t, blando: blando, duro: duro })
  if (serie.length > 2000) serie.shift()
  let div = 0
  for (let k = 0; k < nWorkers; k++) div += EST[k * NEST + 10]
  if (div > ultimaDivers) {
    marcas.push(t)
    if (marcas.length > 400) marcas.shift()
    ultimaDivers = div
  }
  $('mejor').textContent = blando + ' puntos · ' + duro + ' violaciones duras · publicado por el worker ' + autor + ' · versión ' + v1
  dibujarEvolucion()
}

function aplicarVista(nuevo) {
  let cambiadas = []
  for (let i = 0; i < nuevo.length; i++) if (nuevo[i] !== mostrado[i]) cambiadas.push(i)
  mostrado.set(nuevo)
  let r = celdasConViolacion(pr, mostrado)
  faltan = r.faltan
  for (let i = 0; i < viol.length; i++) {
    if (r.mal[i] !== viol[i] && (cambiadas.length === 0 || cambiadas[cambiadas.length - 1] !== i)) cambiadas.push(i)
  }
  viol = r.mal
  lectura.celdas = cambiadas.length
  if (tabla) {
    lectura.nodos = tabla.actualizarCeldas(cambiadas)
    tabla.actualizarNombres()
  }
  pintarFaltantes()
  if (sel) explicarSeleccion()
}

function horas(p) {
  let n = 0
  for (let s = 0; s < SLOTS; s++) n += mostrado[p * SLOTS + s]
  return n * 8
}

function crearVista() {
  let siglasC = { tc: 'TC', rot: 'ROT', med: 'MT', hor: 'HOR', noc: 'NOC' }
  tabla = crearTabla({
    raiz: $('tablaCaja'), nFilas: pr.P, nColumnas: SLOTS,
    anchoCelda: 24, altoCelda: 24, anchoNombre: 200, altoCabecera: 42,
    nombreFila: function (p) { return datos.personas[p].nombre },
    detalleFila: function (p) { return SIGLA_PERFIL[pr.perfil[p]] + ' · ' + siglasC[pr.contrato[p]] + ' · ' + horas(p) + ' h (' + pr.minT[p] * 8 + '-' + pr.maxT[p] * 8 + ')' },
    cabecera: function (s) {
      let d = (s / 3) | 0
      return { dia: DIASEM[(datos.primerDia + d) % 7] + ' ' + (d + 1), jornada: LETRA[s % 3], finde: pr.finde[d] === 1 }
    },
    valor: function (p, s) { return mostrado[p * SLOTS + s] },
    clases: function (p, s) {
      let i = p * SLOTS + s, c = ''
      if (pr.fijo[i] >= 0) c += ' fijo'
      if (pr.ausente[i] || (pr.soloNoche[p] && s % 3 !== 2)) c += ' bloq'
      if (viol[i]) c += ' viol'
      if (pr.pen[i] > 1 && mostrado[i]) c += ' pref'
      return c
    },
    alSeleccionar: function (p, s) {
      sel = { p: p, s: s }
      explicarSeleccion()
    },
    alTecla: function (p, s, tecla) {
      let k = tecla.toLowerCase()
      if (k === 'f') editar({ tipo: 'fijar', p: p, s: s, valor: 1 })
      else if (k === 'l') editar({ tipo: 'fijar', p: p, s: s, valor: 0 })
      else if (k === 'delete' || k === 'backspace') editar({ tipo: 'soltar', p: p, s: s })
      else if (k === 'a') editar({ tipo: 'ausencia', p: p, d0: (s / 3) | 0, d1: (s / 3) | 0, motivo: 'permiso' })
    }
  })
  filtrar()
}

function filtrar() {
  let k = $('fPerfil').value, txt = $('fTexto').value.trim().toLowerCase(), solo = $('fViol').checked
  let lista = []
  for (let p = 0; p < pr.P; p++) {
    if (k !== '' && pr.perfil[p] !== +k) continue
    if (txt && datos.personas[p].nombre.toLowerCase().indexOf(txt) < 0) continue
    if (solo) {
      let algo = false
      for (let s = 0; s < SLOTS; s++) if (viol[p * SLOTS + s] || pr.fijo[p * SLOTS + s] >= 0) algo = true
      if (!algo) continue
    }
    lista.push(p)
  }
  tabla.ponerFilas(lista)
}

function conectarEventos() {
  $('fPerfil').addEventListener('change', filtrar)
  $('fTexto').addEventListener('input', filtrar)
  $('fViol').addEventListener('change', filtrar)
  $('pausa').addEventListener('click', function () {
    if (!C) return
    let v = Atomics.load(C, CORRIENDO) ? 0 : 1
    Atomics.store(C, CORRIENDO, v)
    this.textContent = v ? 'Pausar búsqueda' : 'Reanudar búsqueda'
  })
  $('periodo').addEventListener('change', function () { if (C) Atomics.store(C, PERIODO, +this.value) })
  $('estres').addEventListener('change', function () { if (C) Atomics.store(C, ESTRES, this.checked ? 1 : 0) })
  $('nw').addEventListener('change', function () {
    if (!C || !esLider) return
    crearWorkers(+this.value, celdasTexto(mostrado))
  })
  $('prueba').addEventListener('click', function () {
    pruebas = {}
    $('panelPrueba').innerHTML = '<p>Ejecutando...</p>'
    for (let w of workers) w.postMessage({ tipo: 'prueba' })
    pruebaPrincipal()
  })
  $('medirMsg').addEventListener('click', medirMensajes)
  $('btnFijar').addEventListener('click', function () { if (sel) editar({ tipo: 'fijar', p: sel.p, s: sel.s, valor: 1 }) })
  $('btnLibre').addEventListener('click', function () { if (sel) editar({ tipo: 'fijar', p: sel.p, s: sel.s, valor: 0 }) })
  $('btnSoltar').addEventListener('click', function () { if (sel) editar({ tipo: 'soltar', p: sel.p, s: sel.s }) })
  $('btnAusencia').addEventListener('click', function () {
    if (!sel) return
    let d0 = +$('ausD0').value - 1, d1 = +$('ausD1').value - 1
    if (d1 < d0) d1 = d0
    editar({ tipo: 'ausencia', p: sel.p, d0: Math.max(0, d0), d1: Math.min(DIAS - 1, d1), motivo: $('ausMotivo').value })
  })
  $('btnCuota').addEventListener('click', function () {
    editar({ tipo: 'cuota', t: +$('cuT').value, k: +$('cuK').value, valor: +$('cuV').value, dia: $('cuD').value === '' ? -1 : +$('cuD').value - 1 })
  })
  $('porQue').addEventListener('change', explicarSeleccion)
  $('exportar').addEventListener('click', exportar)
}

function editar(ed) {
  if (puerto) puerto.postMessage({ tipo: 'edicion', ed: ed })
  else aplicarEdicionLocal(ed, ediciones.length + 1)
}

function aplicarEdicionLocal(ed, num) {
  if (num <= ediciones.length) return
  aplicarEdicion(pr, ed)
  ediciones.push({ num: num, ed: ed })
  if (esLider && C) {
    Atomics.store(C, EDICION, num)
    for (let w of workers) w.postMessage({ tipo: 'edicion', ed: ed, num: num })
  }
  enviarCambio({ num: num, ed: ed, fecha: new Date().toISOString() })
  if (ed.tipo === 'cuota') tabla.repintar()
  else {
    let lista = []
    for (let s = 0; s < SLOTS; s++) lista.push(ed.p * SLOTS + s)
    tabla.actualizarCeldas(lista)
  }
  $('ultimaEdicion').textContent = 'Edición ' + num + ': ' + describir(ed) + '. La búsqueda sigue desde el cuadro reparado.'
  pintarEdiciones()
  if (sel) explicarSeleccion()
}

function describir(ed) {
  let quien = ed.p !== undefined ? datos.personas[ed.p].nombre : ''
  if (ed.tipo === 'fijar') return (ed.valor ? 'fijar asignado a ' : 'fijar libre a ') + quien + ' el día ' + (((ed.s / 3) | 0) + 1) + ' ' + JORNADAS[ed.s % 3].toLowerCase()
  if (ed.tipo === 'soltar') return 'quitar fijación de ' + quien + ' el día ' + (((ed.s / 3) | 0) + 1) + ' ' + JORNADAS[ed.s % 3].toLowerCase()
  if (ed.tipo === 'ausencia') return ed.motivo + ' de ' + quien + ' del día ' + (ed.d0 + 1) + ' al ' + (ed.d1 + 1)
  if (ed.tipo === 'cuota') return 'cuota de ' + SIGLA_PERFIL[ed.k] + ' en ' + JORNADAS[ed.t].toLowerCase() + (ed.dia >= 0 ? ' del día ' + (ed.dia + 1) : ' de todos los días') + ' = ' + ed.valor
  return ed.tipo
}

function pintarEdiciones() {
  let h = ''
  for (let x of ediciones.slice(-8)) h += '<li>' + x.num + '. ' + describir(x.ed) + '</li>'
  $('listaEdiciones').innerHTML = h || '<li>Sin ediciones.</li>'
}

function enviarCambio(c) {
  fetch('api/cambios', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(c) }).then(function (r) { return r.json() }).then(function (j) {
    if (j.encolado) {
      $('cola').textContent = 'Sin conexión: el cambio quedó en la cola del Service Worker.'
      if (navigator.serviceWorker && navigator.serviceWorker.ready) navigator.serviceWorker.ready.then(function (reg) { if (reg.sync) reg.sync.register('cambios').catch(function () {}) })
    } else $('cola').textContent = 'Cambios sincronizados con el servidor: ' + j.total
  }).catch(function () {
    $('cola').textContent = 'No se pudo enviar el cambio.'
  })
}

function vaciarCola() {
  if (navigator.serviceWorker && navigator.serviceWorker.controller) navigator.serviceWorker.controller.postMessage({ tipo: 'vaciar' })
}

function enviarInstantanea() {
  if (!puerto || !esLider || !C) return
  puerto.postMessage({ tipo: 'instantanea', celdas: celdasTexto(mostrado), objetivo: Atomics.load(C, G_OBJ), duro: Atomics.load(C, G_DURO), blando: Atomics.load(C, G_BLANDO), t: Date.now() })
}

function guardar() {
  try {
    localStorage.setItem('turnos-cuadro', JSON.stringify({ celdas: celdasTexto(mostrado), ediciones: ediciones, fecha: new Date().toLocaleString() }))
  } catch (e) {}
}

function leerGuardado() {
  try {
    let g = JSON.parse(localStorage.getItem('turnos-cuadro'))
    if (g && g.celdas && g.celdas.length === pr.P * SLOTS) return g
  } catch (e) {}
  return null
}

function explicarSeleccion() {
  if (!sel) return
  let p = sel.p, s = sel.s, i = p * SLOTS + s, d = (s / 3) | 0
  let e = crearEstado(pr, mostrado)
  let r = explicar(e, p, s)
  let per = datos.personas[p]
  let estado = r.asignado ? 'asignada' : 'libre'
  if (pr.fijo[i] === 1) estado += ', fijada por el coordinador'
  if (pr.fijo[i] === 0) estado += ', fijada libre por el coordinador'
  if (pr.ausente[i]) estado += ', ' + (pr.motivo[p * DIAS + d] || 'ausencia')
  let h = '<h3>' + per.nombre + ' · ' + PERFILES[pr.perfil[p]] + ' · ' + datos.contratos[per.contrato].nombre + '</h3>'
  h += '<p>Día ' + (d + 1) + ' (' + DIASEM[(datos.primerDia + d) % 7] + ') · ' + JORNADAS[s % 3] + ' · casilla ' + estado + ' · ' + horas(p) + ' h de ' + pr.minT[p] * 8 + '-' + pr.maxT[p] * 8 + ' h · antigüedad ' + per.antiguedad + ' años</p>'
  if (pr.pen[i]) h += '<p>Preferencia: a esta persona le cuesta ' + pr.pen[i] + ' puntos trabajar aquí (pidió el día libre o evita esa jornada).</p>'
  if (r.quitar) h += '<p>Quitarle este turno: ' + textoDelta(r.quitar) + '</p>'
  h += '<p>' + (r.asignado ? '¿Por qué esta persona y no otra? Alternativas: que otro ' + SIGLA_PERFIL[pr.perfil[p]] + ' tome este turno en su lugar.' : 'Si esta persona tomara este turno (además de los que ya están):') + '</p>'
  h += '<table><tr><th>Profesional</th><th>Estado</th><th>Restricciones duras que lo impiden</th><th>Cambio de costo</th></tr>'
  let objetivoQ = +$('porQue').value
  let opciones = '<option value="-1">¿Por qué no está...?</option>'
  for (let f of r.filas) {
    opciones += '<option value="' + f.q + '"' + (f.q === objetivoQ ? ' selected' : '') + '>' + f.nombre + '</option>'
    let cls = f.q === objetivoQ ? ' class="resaltada"' : ''
    let est = f.actual ? 'es la casilla elegida' : f.asignado ? 'ya trabaja esta jornada' : 'libre'
    let raz = f.razones.length ? f.razones.join('; ') : (f.actual ? '-' : 'ninguna: es factible')
    let del = f.delta ? textoDelta(f.delta) : '-'
    h += '<tr' + cls + '><td>' + f.nombre + '</td><td>' + est + '</td><td>' + raz + '</td><td>' + del + '</td></tr>'
  }
  h += '</table>'
  if (objetivoQ >= 0) {
    let f = r.filas.find(function (x) { return x.q === objetivoQ })
    if (f && !f.actual) h = '<div class="respuesta"><b>¿Por qué no está ' + f.nombre + '?</b> ' + (f.asignado ? 'Ya trabaja en esta jornada.' : f.razones.length ? 'Porque ' + f.razones.join('; ') + '.' : 'No hay restricción dura que lo impida; ponerlo cambiaría el costo así: ' + textoDelta(f.delta) + '.') + '</div>' + h
  }
  $('explicacion').innerHTML = h
  $('porQue').innerHTML = opciones
}

function textoDelta(d) {
  let t = (d.blando > 0 ? '+' : '') + d.blando + ' puntos'
  if (d.duro) t += ', ' + (d.duro > 0 ? '+' : '') + d.duro + ' violaciones duras'
  return '<span class="' + (d.delta > 0 ? 'malo' : 'bien') + '">' + t + '</span>'
}

function pintarFaltantes() {
  let h = ''
  for (let f of faltan.slice(0, 6)) h += 'Día ' + (((f.s / 3) | 0) + 1) + ' ' + JORNADAS[f.s % 3].toLowerCase() + ': faltan ' + f.faltan + ' ' + SIGLA_PERFIL[f.k] + '. '
  $('faltantes').textContent = h
}

function textoCosto(titulo, c) {
  return '<b>' + titulo + ':</b> ' + c.blando + ' puntos, ' + c.duro + ' violaciones duras (cobertura ' + c.cobertura + ', descanso ' + c.descanso + ', noches seguidas ' + c.noches + ', días seguidos ' + c.dias + ', horas ' + c.horas + ', ausencias ' + c.ausencias + ', incompatibles ' + c.incompat + '). Blando: equidad noches ' + c.equidadNoches + ', equidad fines de semana y festivos ' + c.equidadFindes + ', preferencias ' + c.preferencias + ', regularidad ' + c.regularidad * pr.pesos.reg + ', sobrecobertura ' + c.sobrecobertura * pr.pesos.sob + ', parejas ' + c.parejas * pr.pesos.pareja + '.'
}

function pintarManual() {
  let x = new Uint8Array(mostrado.length)
  for (let i = 0; i < x.length; i++) x[i] = datos.cuadroManual.charCodeAt(i) === 49 ? 1 : 0
  $('manual').innerHTML = textoCosto('Cuadro manual de referencia', costoCompleto(prepararProblema(datos), x))
}

function pintarPanel() {
  if (!C) return
  let tot = 0, h = '<table><tr><th>Worker</th><th>Evaluados/s</th><th>Actual</th><th>Mejor propio</th><th>Publicó</th><th>CAS fallidos</th><th>Adopciones</th><th>Diversificaciones</th><th>Verificaciones / errores</th><th>Distancia al mejor</th></tr>'
  let distTot = 0
  for (let k = 0; k < nWorkers; k++) {
    let b = k * NEST
    tot += EST[b + 6]
    let act = new Uint8Array(buf.actuales, k * pr.P * SLOTS, pr.P * SLOTS), dist = 0
    for (let i = 0; i < act.length; i++) if (act[i] !== mostrado[i]) dist++
    distTot += dist
    h += '<tr><td>' + k + '</td><td>' + Math.round(EST[b + 6]).toLocaleString() + '</td><td>' + num(EST[b + 2]) + '</td><td>' + num(EST[b + 3]) + '</td><td>' + EST[b + 7] + '</td><td>' + EST[b + 8] + '</td><td>' + EST[b + 9] + '</td><td>' + EST[b + 10] + '</td><td>' + EST[b + 11] + ' / ' + EST[b + 12] + '</td><td>' + dist + ' casillas</td></tr>'
  }
  h += '</table>'
  $('panelWorkers').innerHTML = h
  $('velocidad').textContent = Math.round(tot).toLocaleString() + ' movimientos evaluados por segundo · diversidad media ' + Math.round(distTot / nWorkers) + ' casillas · primera solución sin violaciones a los ' + (primeraFactible ? primeraFactible.toFixed(1) + ' s' : '-')
  let rep = '', ms = 0, cambios = 0
  for (let k = 0; k < nWorkers; k++) {
    ms = Math.max(ms, EST[k * NEST + 24])
    cambios = Math.max(cambios, EST[k * NEST + 25])
  }
  if (ediciones.length) rep = 'Última reparación tras edición: ' + ms.toFixed(1) + ' ms y ' + cambios + ' casillas cambiadas; arrancar desde cero tardó ' + (primeraFactible ? primeraFactible.toFixed(1) + ' s' : '-') + ' solo en volver a ser factible.'
  $('reparacion').textContent = rep
  $('lecturas').textContent = 'Lecturas de la mejor global (seqlock): ' + lectura.ok + ' consistentes, ' + lectura.malas + ' inconsistentes, ' + lectura.reintentos + ' reintentos por escritura en curso. Última actualización: ' + lectura.celdas + ' celdas cambiadas, ' + lectura.nodos + ' nodos del DOM tocados de ' + tabla.nodosEnDom() + ' en pantalla.'
  dibujarVecindarios()
}

function num(v) {
  if (v >= 2147483647) return '-'
  let d = Math.floor(v / W_DURA), b = v - d * W_DURA
  return d ? b + ' (+' + d + ' duras)' : String(b)
}

function pintarBanco() {
  let b = banco
  $('panelBanco').innerHTML = '<table><tr><th>Medición</th><th>Valor</th></tr>' +
    '<tr><td>Evaluar un cambio con delta</td><td>' + b.nsDelta.toFixed(0) + ' ns</td></tr>' +
    '<tr><td>Recalcular el cuadro completo</td><td>' + (b.nsCompleto / 1000).toFixed(0) + ' µs</td></tr>' +
    '<tr><td>Aceleración del delta</td><td>' + b.aceleracion.toFixed(0) + ' veces</td></tr>' +
    '<tr><td>Chequeo de descanso con lista de objetos</td><td>' + Math.round(b.objetos).toLocaleString() + ' por segundo</td></tr>' +
    '<tr><td>Chequeo de descanso con arreglo de bytes</td><td>' + Math.round(b.bytes).toLocaleString() + ' por segundo</td></tr>' +
    '<tr><td>Chequeo de descanso con máscara de bits</td><td>' + Math.round(b.bits).toLocaleString() + ' por segundo</td></tr>' +
    '<tr><td>compareExchange + store sin contención</td><td>' + b.nsCas.toFixed(1) + ' ns</td></tr></table>' +
    '<p>Representación: un Uint8Array de 62 × 90 = 5.580 bytes por cuadro, contadores por jornada y perfil, horas y noches por persona, y máscaras de 3 palabras de 32 bits por persona para descanso, incompatibilidades y parejas (popcount de AND y XOR).</p>'
}

function pruebaPrincipal() {
  if (!C) return
  let copia = GB.slice(), c = costoCompleto(pr, copia)
  pruebas.principal = { objetivo: c.objetivo, guardado: Atomics.load(C, G_OBJ) }
  pintarPruebas()
}

function pintarPruebas() {
  let h = '<table><tr><th>Worker</th><th>Rondas de 1.000 movimientos</th><th>Incremental = completo</th><th>Verificaciones automáticas</th><th>Discrepancias</th></tr>'
  for (let k in pruebas) {
    if (k === 'principal') continue
    let p = pruebas[k], ok = p.rondas.every(function (r) { return r.ok })
    h += '<tr><td>' + k + '</td><td>' + p.rondas.map(function (r) { return r.incremental + ' / ' + r.completo }).join(' · ') + '</td><td class="' + (ok ? 'bien' : 'malo') + '">' + (ok ? 'sí' : 'no') + '</td><td>' + p.verificaciones + '</td><td>' + p.discrepancias + '</td></tr>'
  }
  h += '</table>'
  if (pruebas.principal) h += '<p>Mejor global recalculada en el hilo principal: ' + pruebas.principal.objetivo + ', guardada: ' + pruebas.principal.guardado + ' → ' + (pruebas.principal.objetivo === pruebas.principal.guardado ? '<span class="bien">coinciden</span>' : '<span class="malo">no coinciden</span>') + '</p>'
  $('panelPrueba').innerHTML = h
}

function medirMensajes() {
  if (!workers.length) return
  let n = 200, k = 0, t0 = performance.now()
  alEco = function () {
    k++
    if (k < n) workers[0].postMessage({ tipo: 'eco', celdas: GB.slice() })
    else {
      let msMsg = (performance.now() - t0) / n
      let t1 = performance.now()
      for (let j = 0; j < n; j++) {
        let v = Atomics.load(C, G_VER)
        let c = GB.slice()
        if (Atomics.load(C, G_VER) !== v) j--
      }
      let msSab = (performance.now() - t1) / n
      alEco = null
      $('panelMsg').innerHTML = '<table><tr><th>Forma de obtener el cuadro (5.580 bytes)</th><th>Tiempo por vez</th></tr><tr><td>postMessage ida y vuelta (copia)</td><td>' + (msMsg * 1000).toFixed(0) + ' µs</td></tr><tr><td>Lectura con seqlock desde SharedArrayBuffer</td><td>' + (msSab * 1000).toFixed(1) + ' µs</td></tr></table><p>Con miles de mejoras por segundo, enviar el cuadro en cada una llenaría la cola de mensajes del hilo principal; por eso solo se lee 4 veces por segundo de la memoria compartida.</p>'
    }
  }
  workers[0].postMessage({ tipo: 'eco', celdas: GB.slice() })
}

function dibujarEvolucion() {
  let cv = $('evolucion'), r = cv.getBoundingClientRect(), d = window.devicePixelRatio || 1
  if (cv.width !== Math.round(r.width * d)) {
    cv.width = Math.round(r.width * d)
    cv.height = Math.round(r.height * d)
  }
  let g = cv.getContext('2d'), W = r.width, H = r.height
  g.setTransform(d, 0, 0, d, 0, 0)
  g.clearRect(0, 0, W, H)
  if (serie.length < 2) return
  let tmax = serie[serie.length - 1].t, ymax = 0
  for (let p of serie) if (p.duro === 0 && p.blando > ymax) ymax = p.blando
  ymax = Math.max(ymax, 1100)
  let fx = function (t) { return 50 + t / tmax * (W - 60) }
  let fy = function (v) { return H - 25 - Math.min(v, ymax) / ymax * (H - 40) }
  g.strokeStyle = '#ddd'
  g.fillStyle = '#555'
  g.font = '11px sans-serif'
  for (let v of [0, 400, 1000]) {
    g.beginPath()
    g.moveTo(50, fy(v))
    g.lineTo(W - 10, fy(v))
    g.stroke()
    g.fillText(String(v), 8, fy(v) + 4)
  }
  g.strokeStyle = 'rgba(200,120,0,0.35)'
  for (let m of marcas) {
    g.beginPath()
    g.moveTo(fx(m), H - 25)
    g.lineTo(fx(m), H - 18)
    g.stroke()
  }
  g.strokeStyle = '#c62828'
  g.setLineDash([5, 4])
  g.beginPath()
  g.moveTo(50, fy(400))
  g.lineTo(W - 10, fy(400))
  g.stroke()
  g.setLineDash([])
  g.strokeStyle = '#1e3a5f'
  g.lineWidth = 2
  g.beginPath()
  for (let k = 0; k < serie.length; k++) {
    let v = serie[k].blando + serie[k].duro * 100
    if (k === 0) g.moveTo(fx(serie[k].t), fy(v))
    else g.lineTo(fx(serie[k].t), fy(v))
  }
  g.stroke()
  g.lineWidth = 1
  g.fillStyle = '#000'
  g.fillText('0 s', 50, H - 6)
  g.fillText(tmax.toFixed(0) + ' s', W - 40, H - 6)
  g.fillText('costo del mejor cuadro (línea roja = meta 400; marcas naranjas = diversificaciones)', 60, 12)
}

function dibujarVecindarios() {
  let cv = $('vecindarios'), r = cv.getBoundingClientRect(), d = window.devicePixelRatio || 1
  cv.width = Math.round(r.width * d)
  cv.height = Math.round(r.height * d)
  let g = cv.getContext('2d'), W = r.width, H = r.height
  g.setTransform(d, 0, 0, d, 0, 0)
  let nombres = ['Cambio de una asignación', 'Intercambio entre dos', 'Destruir y reconstruir bloque']
  let mej = [0, 0, 0], apo = [0, 0, 0], usos = [0, 0, 0], peso = [0, 0, 0]
  for (let k = 0; k < nWorkers; k++) for (let v = 0; v < 3; v++) {
    let b = k * NEST
    mej[v] += EST[b + 16 + v]
    apo[v] += EST[b + 19 + v]
    usos[v] += EST[b + 13 + v]
    peso[v] += EST[b + 27 + v] / nWorkers
  }
  let tot = apo[0] + apo[1] + apo[2] || 1
  g.font = '12px sans-serif'
  for (let v = 0; v < 3; v++) {
    let y = 14 + v * 34
    g.fillStyle = '#000'
    g.fillText(nombres[v] + ': ' + mej[v] + ' mejoras, aporte ' + Math.round(apo[v]).toLocaleString() + ' puntos, usado ' + Math.round(usos[v]).toLocaleString() + ' veces, probabilidad actual ' + (peso[v] * 100).toFixed(0) + '%', 4, y)
    g.fillStyle = ['#3b82f6', '#f59e0b', '#7c3aed'][v]
    g.fillRect(4, y + 5, (W - 10) * apo[v] / tot, 10)
  }
}

function exportar() {
  let c = costoCompleto(pr, mostrado)
  let reg = { version: VERSION_CODIGO, fecha: new Date().toISOString(), costo: c, ediciones: ediciones, personas: datos.personas.map(function (p) { return p.nombre }), cuadro: [] }
  for (let p = 0; p < pr.P; p++) {
    let fila = ''
    for (let d = 0; d < DIAS; d++) {
      let t = tipoDia(mostrado, p * SLOTS + 3 * d)
      fila += t < 0 ? '-' : LETRA[t]
    }
    reg.cuadro.push(datos.personas[p].nombre + ': ' + fila)
  }
  let b = new Blob([JSON.stringify(reg, null, 1)], { type: 'application/json' })
  let a = document.createElement('a')
  a.href = URL.createObjectURL(b)
  a.download = 'cuadro-turnos.json'
  a.click()
}
