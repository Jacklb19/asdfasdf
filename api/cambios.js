let cambios = []

function ponerCabeceras(res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp')
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin')
  res.setHeader('Cache-Control', 'no-store')
}

function responder(res, codigo, datos) {
  ponerCabeceras(res)
  res.statusCode = codigo
  res.end(JSON.stringify(datos))
}

function guardarCambios(datos) {
  let lista = Array.isArray(datos) ? datos : [datos]
  let fecha = new Date().toISOString()
  for (let c of lista) cambios.push({ recibido: fecha, cambio: c })
}

function interpretar(texto) {
  try {
    return { valor: JSON.parse(texto) }
  } catch (e) {
    return { error: true }
  }
}

function cuerpoYaLeido(req) {
  let cuerpo
  try {
    cuerpo = req.body
  } catch (e) {
    return { error: true }
  }
  if (cuerpo === undefined || cuerpo === null) return null
  if (Buffer.isBuffer(cuerpo)) cuerpo = cuerpo.toString('utf8')
  if (typeof cuerpo === 'string') return interpretar(cuerpo)
  return { valor: cuerpo }
}

function leerCuerpo(req, listo) {
  let previo = cuerpoYaLeido(req)
  if (previo) {
    listo(previo.error ? new Error('JSON inválido') : null, previo.valor)
    return
  }
  if (req.readableEnded) {
    listo(new Error('Sin cuerpo'))
    return
  }
  let texto = ''
  let hecho = false
  req.setEncoding('utf8')
  req.on('data', function (trozo) {
    texto += trozo
  })
  req.on('end', function () {
    if (hecho) return
    hecho = true
    let r = interpretar(texto)
    listo(r.error ? new Error('JSON inválido') : null, r.valor)
  })
  req.on('error', function (e) {
    if (hecho) return
    hecho = true
    listo(e)
  })
}

module.exports = function (req, res) {
  if (req.method === 'POST') {
    leerCuerpo(req, function (error, datos) {
      if (error) {
        responder(res, 400, { ok: false, error: error.message })
        return
      }
      guardarCambios(datos)
      responder(res, 200, { ok: true, total: cambios.length })
    })
    return
  }
  if (req.method === 'GET') {
    responder(res, 200, cambios)
    return
  }
  res.setHeader('Allow', 'GET, POST')
  responder(res, 405, { ok: false, error: 'Método no permitido' })
}
