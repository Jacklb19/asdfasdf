let met = { peor: null, ultima: null, ids: new Set(), largas: 0, largaMax: 0, soporta: false, soportaLargas: false }
let metPendiente = false

function iniciarMetricas() {
  let tipos = PerformanceObserver.supportedEntryTypes || []
  if (tipos.indexOf('event') >= 0) {
    met.soporta = true
    new PerformanceObserver(function (lista) {
      for (let e of lista.getEntries()) {
        if (!e.interactionId) continue
        met.ids.add(e.interactionId)
        let d = { nombre: e.name, total: e.duration, retraso: e.processingStart - e.startTime, proceso: e.processingEnd - e.processingStart, presentacion: Math.max(0, e.startTime + e.duration - e.processingEnd) }
        met.ultima = d
        if (!met.peor || d.total > met.peor.total) met.peor = d
      }
      pintarMetricasLuego()
    }).observe({ type: 'event', buffered: true, durationThreshold: 16 })
  }
  if (tipos.indexOf('longtask') >= 0) {
    met.soportaLargas = true
    new PerformanceObserver(function (lista) {
      for (let e of lista.getEntries()) {
        met.largas++
        if (e.duration > met.largaMax) met.largaMax = e.duration
      }
      pintarMetricasLuego()
    }).observe({ type: 'longtask', buffered: true })
  }
  pintarMetricas()
}

function pintarMetricasLuego() {
  if (metPendiente) return
  metPendiente = true
  setTimeout(function () {
    metPendiente = false
    pintarMetricas()
  }, 300)
}

function textoInteraccion(d) {
  if (!d) return 'sin interacciones todavía'
  return d.total.toFixed(0) + ' ms (' + d.nombre + ') = retraso ' + d.retraso.toFixed(1) + ' + procesamiento ' + d.proceso.toFixed(1) + ' + presentación ' + d.presentacion.toFixed(1) + ' ms'
}

function pintarMetricas() {
  let h = ''
  if (met.soporta) {
    let inp = met.peor ? met.peor.total : 0
    h += '<p>INP (peor interacción): <span class="' + (inp <= 200 ? 'bien' : 'malo') + '">' + textoInteraccion(met.peor) + '</span></p>'
    h += '<p>Última interacción: ' + textoInteraccion(met.ultima) + ' · interacciones: ' + met.ids.size + '</p>'
  } else {
    h += '<p>Este navegador no expone Event Timing (INP no disponible).</p>'
  }
  h += met.soportaLargas ? '<p>Tareas largas en el hilo principal: ' + met.largas + (met.largas ? ', la mayor de ' + met.largaMax.toFixed(0) + ' ms' : '') + '</p>' : '<p>Long Tasks no disponible.</p>'
  let p = document.getElementById('panelInp')
  if (p) p.innerHTML = h
}
