const http = require('http')
const fs = require('fs')
const path = require('path')

const tipos = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json'
}

let cambios = []

function cabeceras(tipo) {
  return {
    'Content-Type': tipo,
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Embedder-Policy': 'require-corp',
    'Cross-Origin-Resource-Policy': 'same-origin',
    'Cache-Control': 'no-cache'
  }
}

http.createServer(function (req, res) {
  let ruta = decodeURIComponent(req.url.split('?')[0])
  if (ruta === '/api/cambios') {
    if (req.method === 'POST') {
      let cuerpo = ''
      req.on('data', function (c) { cuerpo += c })
      req.on('end', function () {
        try {
          let lista = JSON.parse(cuerpo)
          if (!Array.isArray(lista)) lista = [lista]
          for (let c of lista) cambios.push({ recibido: new Date().toISOString(), cambio: c })
          res.writeHead(200, cabeceras('application/json; charset=utf-8'))
          res.end(JSON.stringify({ ok: true, total: cambios.length }))
        } catch (e) {
          res.writeHead(400, cabeceras('application/json; charset=utf-8'))
          res.end(JSON.stringify({ ok: false }))
        }
      })
      return
    }
    res.writeHead(200, cabeceras('application/json; charset=utf-8'))
    res.end(JSON.stringify(cambios))
    return
  }
  if (ruta === '/') ruta = '/index.html'
  let archivo = path.join(__dirname, path.normalize(ruta))
  if (!archivo.startsWith(__dirname)) {
    res.writeHead(403)
    res.end('Prohibido')
    return
  }
  fs.readFile(archivo, function (err, datos) {
    if (err) {
      res.writeHead(404, cabeceras('text/plain; charset=utf-8'))
      res.end('No existe')
      return
    }
    res.writeHead(200, cabeceras(tipos[path.extname(archivo)] || 'application/octet-stream'))
    res.end(datos)
  })
}).listen(process.env.PORT || 8090, function () {
  console.log('http://localhost:' + (process.env.PORT || 8090))
})
