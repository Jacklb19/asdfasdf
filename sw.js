let CACHE = 'turnos-v1'
let ARCHIVOS = ['./', './index.html', './estilos.css', './modelo.js', './buscador.js', './tabla.js', './metricas.js', './app.js', './coordinador.js', './datos.json', './manifest.webmanifest']
let vaciando = null

function abrirBase() {
  return new Promise(function (resolver, rechazar) {
    let pet = indexedDB.open('turnos-sw', 1)
    pet.onupgradeneeded = function () {
      let db = pet.result
      if (!db.objectStoreNames.contains('cola')) db.createObjectStore('cola', { autoIncrement: true })
    }
    pet.onsuccess = function () {
      resolver(pet.result)
    }
    pet.onerror = function () {
      rechazar(pet.error)
    }
  })
}

function conCola(modo, trabajo) {
  return abrirBase().then(function (db) {
    return new Promise(function (resolver, rechazar) {
      let tx = db.transaction('cola', modo)
      let salida = { valor: null }
      trabajo(tx.objectStore('cola'), salida)
      tx.oncomplete = function () {
        db.close()
        resolver(salida.valor)
      }
      tx.onerror = function () {
        db.close()
        rechazar(tx.error)
      }
      tx.onabort = function () {
        db.close()
        rechazar(tx.error)
      }
    })
  })
}

function agregarCola(cuerpo) {
  return conCola('readwrite', function (almacen, salida) {
    let pet = almacen.add({ cuerpo: cuerpo, fecha: Date.now() })
    pet.onsuccess = function () {
      salida.valor = pet.result
    }
  })
}

function listarCola() {
  return conCola('readonly', function (almacen, salida) {
    salida.valor = []
    let pet = almacen.openCursor()
    pet.onsuccess = function () {
      let cursor = pet.result
      if (!cursor) return
      salida.valor.push({ clave: cursor.key, cuerpo: cursor.value.cuerpo })
      cursor.continue()
    }
  })
}

function borrarCola(clave) {
  return conCola('readwrite', function (almacen) {
    almacen.delete(clave)
  })
}

function contarCola() {
  return conCola('readonly', function (almacen, salida) {
    let pet = almacen.count()
    pet.onsuccess = function () {
      salida.valor = pet.result
    }
  })
}

function pedirSync() {
  if (self.registration && self.registration.sync) {
    return self.registration.sync.register('cambios').catch(function () {})
  }
  return Promise.resolve()
}

function enviarDesde(lista, i, enviados) {
  if (i >= lista.length) return Promise.resolve(enviados)
  let opciones = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: lista[i].cuerpo }
  return fetch('./api/cambios', opciones).then(function (r) {
    if (!r.ok) return enviados
    return borrarCola(lista[i].clave).then(function () {
      return enviarDesde(lista, i + 1, enviados + 1)
    })
  }).catch(function () {
    return enviados
  })
}

function vaciarCola() {
  if (vaciando) return vaciando
  vaciando = listarCola().then(function (lista) {
    return enviarDesde(lista, 0, 0)
  }).catch(function () {
    return 0
  }).then(function (n) {
    vaciando = null
    return n
  })
  return vaciando
}

function pendientes() {
  return contarCola().catch(function () {
    return 0
  })
}

function enviarOEncolar(request) {
  return fetch(request.clone()).catch(function () {
    return request.text().then(function (cuerpo) {
      return agregarCola(cuerpo)
    }).then(function () {
      return pedirSync()
    }).then(function () {
      return new Response(JSON.stringify({ ok: true, encolado: true }), { status: 202, headers: { 'Content-Type': 'application/json' } })
    })
  })
}

function guardarCopia(request, respuesta) {
  return caches.open(CACHE).then(function (c) {
    return c.put(request, respuesta)
  }).catch(function () {})
}

function deCache(request, respaldo) {
  return caches.match(request, { ignoreVary: true }).then(function (guardada) {
    if (guardada) return guardada
    if (request.mode !== 'navigate') return respaldo || Response.error()
    return caches.match('./index.html', { ignoreVary: true }).then(function (inicio) {
      return inicio || respaldo || Response.error()
    })
  })
}

function redPrimero(e) {
  let request = e.request
  return fetch(request).then(function (respuesta) {
    if (respuesta.status >= 500) return deCache(request, respuesta)
    if (respuesta.status === 200 && !respuesta.redirected) e.waitUntil(guardarCopia(request, respuesta.clone()))
    return respuesta
  }).catch(function () {
    return deCache(request, null)
  })
}

function responder(e, msj) {
  if (e.source) e.source.postMessage(msj)
}

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) {
    return c.addAll(ARCHIVOS.map(function (a) {
      return new Request(a, { cache: 'reload' })
    }))
  }).then(function () {
    return self.skipWaiting()
  }))
})

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (nombres) {
    let viejas = nombres.filter(function (n) {
      return n !== CACHE
    })
    return Promise.all(viejas.map(function (n) {
      return caches.delete(n)
    }))
  }).then(function () {
    return self.clients.claim()
  }))
})

self.addEventListener('fetch', function (e) {
  let url = new URL(e.request.url)
  if (url.origin !== self.location.origin) return
  if (e.request.method === 'POST' && url.pathname.endsWith('/api/cambios')) {
    e.respondWith(enviarOEncolar(e.request))
    return
  }
  if (e.request.method !== 'GET') return
  e.respondWith(redPrimero(e))
})

self.addEventListener('message', function (e) {
  let d = e.data || {}
  if (d.tipo === 'vaciar') {
    e.waitUntil(vaciarCola().then(function (enviados) {
      return pendientes().then(function (n) {
        responder(e, { tipo: 'colaEnviada', enviados: enviados, pendientes: n })
      })
    }))
  } else if (d.tipo === 'estadoCola') {
    e.waitUntil(pendientes().then(function (n) {
      responder(e, { tipo: 'estadoCola', pendientes: n })
    }))
  }
})

self.addEventListener('sync', function (e) {
  if (e.tag !== 'cambios') return
  e.waitUntil(vaciarCola().then(function () {
    return contarCola()
  }).then(function (n) {
    if (n > 0) throw new Error('quedan cambios en cola')
  }))
})
