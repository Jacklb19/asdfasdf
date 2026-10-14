function crearTabla(op) {
  let raiz = op.raiz
  let nFilas = op.nFilas
  let nColumnas = op.nColumnas
  let anchoCelda = op.anchoCelda || 24
  let altoCelda = op.altoCelda || 24
  let anchoNombre = op.anchoNombre || 190
  let altoCabecera = op.altoCabecera || 42
  let margen = 2
  let letras = ['M', 'T', 'N']
  let nada = function () {}
  let alSeleccionar = op.alSeleccionar || nada
  let alTecla = op.alTecla || nada
  let clasesExtra = op.clases || function () { return '' }

  if (!document.getElementById('estilosTablaTurnos')) {
    let estilo = document.createElement('style')
    estilo.id = 'estilosTablaTurnos'
    estilo.textContent = estilosTabla()
    document.head.appendChild(estilo)
  }

  raiz.innerHTML = ''
  raiz.classList.add('tablaTurnos')
  raiz.style.position = 'relative'
  raiz.style.overflow = 'hidden'
  raiz.style.setProperty('--anchoCelda', anchoCelda + 'px')
  raiz.style.setProperty('--altoCelda', altoCelda + 'px')

  let esquina = document.createElement('div')
  esquina.className = 'esquina'
  esquina.style.width = anchoNombre + 'px'
  esquina.style.height = altoCabecera + 'px'
  esquina.textContent = 'Profesional'
  raiz.appendChild(esquina)

  let franja = document.createElement('div')
  franja.className = 'franjaCab'
  franja.style.left = anchoNombre + 'px'
  franja.style.height = altoCabecera + 'px'
  let internoCab = document.createElement('div')
  internoCab.className = 'internoCab'
  internoCab.style.width = nColumnas * anchoCelda + 'px'
  internoCab.style.height = altoCabecera + 'px'
  for (let s = 0; s < nColumnas; s++) {
    let info = op.cabecera(s) || {}
    let cab = document.createElement('div')
    cab.className = 'cab'
    if (s % 3 === 0) cab.classList.add('inicioDia')
    if (info.finde) cab.classList.add('finde')
    cab.style.left = s * anchoCelda + 'px'
    if (s % 3 === 0) {
      let dia = document.createElement('span')
      dia.className = 'dia'
      dia.textContent = info.dia || ''
      cab.appendChild(dia)
    }
    let jornada = document.createElement('span')
    jornada.className = 'jornada'
    jornada.textContent = info.jornada || letras[s % 3]
    cab.appendChild(jornada)
    internoCab.appendChild(cab)
  }
  franja.appendChild(internoCab)
  raiz.appendChild(franja)

  let colNombres = document.createElement('div')
  colNombres.className = 'colNombres'
  colNombres.style.top = altoCabecera + 'px'
  colNombres.style.width = anchoNombre + 'px'
  let internoNombres = document.createElement('div')
  internoNombres.className = 'internoNombres'
  colNombres.appendChild(internoNombres)
  raiz.appendChild(colNombres)

  let area = document.createElement('div')
  area.className = 'areaCeldas'
  area.tabIndex = 0
  area.style.top = altoCabecera + 'px'
  area.style.left = anchoNombre + 'px'
  let espaciador = document.createElement('div')
  espaciador.className = 'espaciador'
  espaciador.style.width = nColumnas * anchoCelda + 'px'
  espaciador.style.height = '0px'
  area.appendChild(espaciador)
  raiz.appendChild(area)

  let filas = []
  let posDeFila = new Int32Array(nFilas).fill(-1)
  let nodoDe = new Int32Array(nFilas * nColumnas).fill(-1)
  let nodos = []
  let celdaDeNodo = []
  let textoNodo = []
  let claseNodo = []
  let posNodo = []
  let ocultoNodo = []
  let libres = []

  let nodosNombre = []
  let filaDeNombre = []
  let nombreDe = new Int32Array(nFilas).fill(-1)
  let textoNombre = []
  let textoDetalle = []
  let claseNombre = []
  let posNombre = []
  let ocultoNombre = []
  let libresNombre = []

  let selP = -1
  let selS = -1
  let filaIni = 0
  let filaFin = -1
  let colIni = 0
  let colFin = -1
  let ultimoTop = -1
  let ultimoIzq = -1
  let pendiente = false

  function tomarNodo() {
    if (libres.length > 0) return libres.pop()
    let nodo = document.createElement('div')
    nodo.className = 'c'
    area.appendChild(nodo)
    nodos.push(nodo)
    celdaDeNodo.push(-1)
    textoNodo.push('')
    claseNodo.push('c')
    posNodo.push('')
    ocultoNodo.push(false)
    return nodos.length - 1
  }

  function pintarNodo(n, p, s) {
    let nodo = nodos[n]
    let texto = ''
    let clase = 'c'
    if (op.valor(p, s) === 1) {
      texto = letras[s % 3]
      clase = 'c a t' + (s % 3)
    }
    if (s % 3 === 0) clase += ' inicioDia'
    let extra = clasesExtra(p, s)
    if (extra) clase += ' ' + extra
    if (p === selP && s === selS) clase += ' sel'
    if (texto !== textoNodo[n]) {
      nodo.textContent = texto
      textoNodo[n] = texto
    }
    if (clase !== claseNodo[n]) {
      nodo.className = clase
      claseNodo[n] = clase
    }
  }

  function ubicarNodo(n, k, s) {
    let pos = 'translate(' + s * anchoCelda + 'px,' + k * altoCelda + 'px)'
    if (pos !== posNodo[n]) {
      nodos[n].style.transform = pos
      posNodo[n] = pos
    }
  }

  function tomarNombre() {
    if (libresNombre.length > 0) return libresNombre.pop()
    let fila = document.createElement('div')
    fila.className = 'filaNombre'
    let nombre = document.createElement('div')
    nombre.className = 'nombre'
    let detalle = document.createElement('div')
    detalle.className = 'detalle'
    fila.appendChild(nombre)
    fila.appendChild(detalle)
    internoNombres.appendChild(fila)
    nodosNombre.push(fila)
    filaDeNombre.push(-1)
    textoNombre.push('')
    textoDetalle.push('')
    claseNombre.push('filaNombre')
    posNombre.push('')
    ocultoNombre.push(false)
    return nodosNombre.length - 1
  }

  function pintarNombre(n, p) {
    let fila = nodosNombre[n]
    let nombre = String(op.nombreFila(p))
    let detalle = op.detalleFila ? String(op.detalleFila(p)) : ''
    let clase = p === selP ? 'filaNombre filaSel' : 'filaNombre'
    if (nombre !== textoNombre[n]) {
      fila.firstChild.textContent = nombre
      fila.title = nombre
      textoNombre[n] = nombre
    }
    if (detalle !== textoDetalle[n]) {
      fila.lastChild.textContent = detalle
      textoDetalle[n] = detalle
    }
    if (clase !== claseNombre[n]) {
      fila.className = clase
      claseNombre[n] = clase
    }
  }

  function ubicarNombre(n, k) {
    let pos = 'translateY(' + k * altoCelda + 'px)'
    if (pos !== posNombre[n]) {
      nodosNombre[n].style.transform = pos
      posNombre[n] = pos
    }
  }

  function calcularRango() {
    let alto = area.clientHeight
    let ancho = area.clientWidth
    let top = area.scrollTop
    let izq = area.scrollLeft
    let fi = Math.max(0, Math.floor(top / altoCelda) - margen)
    let ff = Math.min(filas.length - 1, Math.floor((top + alto - 1) / altoCelda) + margen)
    let ci = Math.max(0, Math.floor(izq / anchoCelda) - margen)
    let cf = Math.min(nColumnas - 1, Math.floor((izq + ancho - 1) / anchoCelda) + margen)
    let cambio = fi !== filaIni || ff !== filaFin || ci !== colIni || cf !== colFin
    filaIni = fi
    filaFin = ff
    colIni = ci
    colFin = cf
    return cambio
  }

  function sincronizar() {
    let top = area.scrollTop
    let izq = area.scrollLeft
    if (izq !== ultimoIzq) {
      internoCab.style.transform = 'translateX(' + (0 - izq) + 'px)'
      ultimoIzq = izq
    }
    if (top !== ultimoTop) {
      internoNombres.style.transform = 'translateY(' + (0 - top) + 'px)'
      ultimoTop = top
    }
  }

  function pintarNombres(forzar) {
    for (let n = 0; n < nodosNombre.length; n++) {
      let p = filaDeNombre[n]
      if (p < 0) continue
      let k = posDeFila[p]
      if (k < filaIni || k > filaFin) {
        nombreDe[p] = -1
        filaDeNombre[n] = -1
        libresNombre.push(n)
      } else if (forzar) {
        ubicarNombre(n, k)
        pintarNombre(n, p)
      }
    }
    for (let k = filaIni; k <= filaFin; k++) {
      let p = filas[k]
      if (nombreDe[p] >= 0) continue
      let n = tomarNombre()
      nombreDe[p] = n
      filaDeNombre[n] = p
      ubicarNombre(n, k)
      pintarNombre(n, p)
      if (ocultoNombre[n]) {
        nodosNombre[n].style.display = ''
        ocultoNombre[n] = false
      }
    }
    for (let j = 0; j < libresNombre.length; j++) {
      let n = libresNombre[j]
      if (!ocultoNombre[n]) {
        nodosNombre[n].style.display = 'none'
        ocultoNombre[n] = true
      }
    }
  }

  function pintarVisibles(forzar) {
    for (let n = 0; n < nodos.length; n++) {
      let i = celdaDeNodo[n]
      if (i < 0) continue
      let p = Math.floor(i / nColumnas)
      let s = i - p * nColumnas
      let k = posDeFila[p]
      if (k < filaIni || k > filaFin || s < colIni || s > colFin) {
        nodoDe[i] = -1
        celdaDeNodo[n] = -1
        libres.push(n)
      } else if (forzar) {
        ubicarNodo(n, k, s)
        pintarNodo(n, p, s)
      }
    }
    for (let k = filaIni; k <= filaFin; k++) {
      let p = filas[k]
      let base = p * nColumnas
      for (let s = colIni; s <= colFin; s++) {
        let i = base + s
        if (nodoDe[i] >= 0) continue
        let n = tomarNodo()
        nodoDe[i] = n
        celdaDeNodo[n] = i
        nodos[n].dataset.p = p
        nodos[n].dataset.s = s
        ubicarNodo(n, k, s)
        pintarNodo(n, p, s)
        if (ocultoNodo[n]) {
          nodos[n].style.display = ''
          ocultoNodo[n] = false
        }
      }
    }
    for (let j = 0; j < libres.length; j++) {
      let n = libres[j]
      if (!ocultoNodo[n]) {
        nodos[n].style.display = 'none'
        ocultoNodo[n] = true
      }
    }
    pintarNombres(forzar)
  }

  function alDesplazar() {
    pendiente = false
    sincronizar()
    if (calcularRango()) pintarVisibles(false)
  }

  function programar() {
    if (pendiente) return
    pendiente = true
    requestAnimationFrame(alDesplazar)
  }

  function repintar() {
    sincronizar()
    calcularRango()
    pintarVisibles(true)
  }

  function ponerFilas(lista) {
    filas = []
    for (let j = 0; j < lista.length; j++) filas.push(lista[j])
    posDeFila.fill(-1)
    for (let k = 0; k < filas.length; k++) posDeFila[filas[k]] = k
    espaciador.style.height = filas.length * altoCelda + 'px'
    repintar()
  }

  function actualizarCeldas(lista) {
    let tocados = 0
    for (let j = 0; j < lista.length; j++) {
      let i = lista[j]
      let n = nodoDe[i]
      if (n === undefined || n < 0) continue
      let p = Math.floor(i / nColumnas)
      pintarNodo(n, p, i - p * nColumnas)
      tocados++
    }
    return tocados
  }

  function actualizarNombres() {
    for (let n = 0; n < nodosNombre.length; n++) {
      let p = filaDeNombre[n]
      if (p >= 0) pintarNombre(n, p)
    }
  }

  function refrescarCelda(p, s) {
    let n = nodoDe[p * nColumnas + s]
    if (n >= 0) pintarNodo(n, p, s)
  }

  function refrescarNombre(p) {
    let n = nombreDe[p]
    if (n >= 0) pintarNombre(n, p)
  }

  function mostrar(p, s) {
    let alto = area.clientHeight
    let ancho = area.clientWidth
    let top = area.scrollTop
    let izq = area.scrollLeft
    let k = posDeFila[p]
    if (k >= 0) {
      let y = k * altoCelda
      if (y < top) area.scrollTop = y
      else if (y + altoCelda > top + alto) area.scrollTop = y + altoCelda - alto
    }
    let x = s * anchoCelda
    if (x < izq) area.scrollLeft = x
    else if (x + anchoCelda > izq + ancho) area.scrollLeft = x + anchoCelda - ancho
  }

  function seleccionar(p, s) {
    if (!(p >= 0 && p < nFilas && s >= 0 && s < nColumnas)) return
    mostrar(p, s)
    let antesP = selP
    let antesS = selS
    selP = p
    selS = s
    if (antesP >= 0) refrescarCelda(antesP, antesS)
    refrescarCelda(p, s)
    if (antesP !== p) {
      if (antesP >= 0) refrescarNombre(antesP)
      refrescarNombre(p)
    }
    alSeleccionar(p, s)
  }

  area.addEventListener('scroll', programar, { passive: true })

  area.addEventListener('click', function (e) {
    let celda = e.target && e.target.closest ? e.target.closest('.c') : null
    if (!celda || celda.parentNode !== area) return
    seleccionar(Number(celda.dataset.p), Number(celda.dataset.s))
  })

  area.addEventListener('keydown', function (e) {
    let tecla = e.key
    let flecha = tecla === 'ArrowUp' || tecla === 'ArrowDown' || tecla === 'ArrowLeft' || tecla === 'ArrowRight'
    if (flecha) {
      e.preventDefault()
      if (filas.length === 0) return
      if (selP < 0 || posDeFila[selP] < 0) {
        let k0 = Math.min(filas.length - 1, Math.ceil(area.scrollTop / altoCelda))
        let s0 = selS >= 0 ? selS : Math.min(nColumnas - 1, Math.ceil(area.scrollLeft / anchoCelda))
        seleccionar(filas[k0], s0)
        return
      }
      let k = posDeFila[selP]
      let s = selS
      if (tecla === 'ArrowUp') k = Math.max(0, k - 1)
      if (tecla === 'ArrowDown') k = Math.min(filas.length - 1, k + 1)
      if (tecla === 'ArrowLeft') s = Math.max(0, s - 1)
      if (tecla === 'ArrowRight') s = Math.min(nColumnas - 1, s + 1)
      seleccionar(filas[k], s)
      return
    }
    if (selP < 0) return
    if (tecla === ' ') e.preventDefault()
    alTecla(selP, selS, tecla, e)
  })

  function pasarRueda(e) {
    let factor = e.deltaMode === 1 ? altoCelda : 1
    if (e.deltaMode === 2) factor = area.clientHeight
    area.scrollTop += e.deltaY * factor
    area.scrollLeft += e.deltaX * factor
    e.preventDefault()
  }

  colNombres.addEventListener('wheel', pasarRueda, { passive: false })
  franja.addEventListener('wheel', pasarRueda, { passive: false })

  if (window.ResizeObserver) {
    let observador = new ResizeObserver(programar)
    observador.observe(area)
  } else {
    window.addEventListener('resize', programar)
  }

  let todas = []
  for (let p = 0; p < nFilas; p++) todas.push(p)
  ponerFilas(todas)

  return {
    ponerFilas: ponerFilas,
    actualizarCeldas: actualizarCeldas,
    repintar: repintar,
    actualizarNombres: actualizarNombres,
    seleccionar: seleccionar,
    seleccion: function () {
      if (selP < 0) return null
      return { p: selP, s: selS }
    },
    nodosEnDom: function () {
      return nodos.length
    }
  }
}

function estilosTabla() {
  return [
    '.tablaTurnos { position: relative; overflow: hidden; font-size: 12px; font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: #111827; background: #fff; user-select: none; -webkit-user-select: none }',
    '.tablaTurnos * { box-sizing: border-box }',
    '.tablaTurnos .esquina { position: absolute; left: 0; top: 0; z-index: 3; display: flex; align-items: flex-end; padding: 0 10px 8px; font-weight: 600; color: #374151; background: #f9fafb; border-right: 1px solid #d1d5db; border-bottom: 1px solid #d1d5db }',
    '.tablaTurnos .franjaCab { position: absolute; top: 0; right: 0; overflow: hidden; background: #f9fafb; border-bottom: 1px solid #d1d5db }',
    '.tablaTurnos .internoCab { position: absolute; left: 0; top: 0 }',
    '.tablaTurnos .cab { position: absolute; top: 0; height: 100%; width: var(--anchoCelda); border-right: 1px solid #e5e7eb }',
    '.tablaTurnos .cab.finde { background: #fde2e8 }',
    '.tablaTurnos .cab.inicioDia { border-left: 2px solid #888 }',
    '.tablaTurnos .cab .dia { position: absolute; left: 0; top: 5px; width: calc(var(--anchoCelda) * 3 - 2px); text-align: center; font-weight: 600; white-space: nowrap; z-index: 1 }',
    '.tablaTurnos .cab .jornada { position: absolute; left: 0; right: 0; bottom: 5px; text-align: center; color: #6b7280; font-size: 11px }',
    '.tablaTurnos .colNombres { position: absolute; left: 0; bottom: 0; overflow: hidden; background: #fff; border-right: 1px solid #d1d5db }',
    '.tablaTurnos .internoNombres { position: absolute; left: 0; top: 0; right: 0 }',
    '.tablaTurnos .filaNombre { position: absolute; left: 0; top: 0; right: 0; height: var(--altoCelda); padding: 0 10px; display: flex; flex-direction: column; justify-content: center; overflow: hidden; white-space: nowrap; border-bottom: 1px solid #e5e7eb }',
    '.tablaTurnos .filaNombre .nombre { font-weight: 700; font-size: 12px; line-height: 12px; overflow: hidden; text-overflow: ellipsis }',
    '.tablaTurnos .filaNombre .detalle { font-size: 9px; line-height: 10px; color: #6b7280; overflow: hidden; text-overflow: ellipsis }',
    '.tablaTurnos .filaNombre.filaSel { background: #eff6ff; box-shadow: inset 3px 0 0 #2563eb }',
    '.tablaTurnos .areaCeldas { position: absolute; right: 0; bottom: 0; overflow: auto; outline: none; overscroll-behavior: contain; background: #fff }',
    '.tablaTurnos .espaciador { pointer-events: none }',
    '.tablaTurnos .c { position: absolute; left: 0; top: 0; width: var(--anchoCelda); height: var(--altoCelda); display: flex; align-items: center; justify-content: center; background: #fff; border-right: 1px solid #e5e7eb; border-bottom: 1px solid #e5e7eb; cursor: pointer; font-size: 12px; line-height: 1 }',
    '.tablaTurnos .c.a { font-weight: 700 }',
    '.tablaTurnos .c.t0 { background: #dbeafe; color: #1e3a8a }',
    '.tablaTurnos .c.t1 { background: #fef3c7; color: #92400e }',
    '.tablaTurnos .c.t2 { background: #312e81; color: #fff }',
    '.tablaTurnos .c.inicioDia { border-left: 2px solid #888 }',
    '.tablaTurnos .c.bloq { background: repeating-linear-gradient(45deg, #f3f4f6 0, #f3f4f6 3px, #d1d5db 3px, #d1d5db 5px); color: #374151 }',
    '.tablaTurnos .c.fijo { border: 2px solid #111 }',
    '.tablaTurnos .c.pref::after { content: ""; position: absolute; top: 0; right: 0; width: 0; height: 0; border-top: 7px solid #f97316; border-left: 7px solid transparent }',
    '.tablaTurnos .c.viol { outline: 2px solid #dc2626; outline-offset: -2px; z-index: 1 }',
    '.tablaTurnos .c.sel { outline: 3px solid #2563eb; outline-offset: -1px; z-index: 2 }'
  ].join('\n')
}
