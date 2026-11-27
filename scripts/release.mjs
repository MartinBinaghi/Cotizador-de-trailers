// Compila firmado, arma latest.json y publica el release en GitHub.
// Uso: npm run release   (antes: subir versión, commit, tag y push — ver HANDOFF.md)
import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

// El instalador y el updater usan la versión de tauri.conf.json; la ventana muestra la de package.json
const { version } = JSON.parse(readFileSync('src-tauri/tauri.conf.json', 'utf8'))
const versionPackage = JSON.parse(readFileSync('package.json', 'utf8')).version
if (version !== versionPackage) {
  throw new Error(`Versiones distintas: tauri.conf.json ${version}, package.json ${versionPackage}`)
}
const clave = process.env.TAURI_SIGNING_PRIVATE_KEY_PATH ?? join(homedir(), '.tauri', 'cotizador-trailers.key')
const env = {
  ...process.env,
  TAURI_SIGNING_PRIVATE_KEY: readFileSync(clave, 'utf8'),
  TAURI_SIGNING_PRIVATE_KEY_PASSWORD: process.env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD ?? ''
}
const run = cmd => execSync(cmd, { stdio: 'inherit', env })

run('npm run tauri:build')

const tag = `v${version}`
const exe = `src-tauri/target/release/bundle/nsis/Cotizador de Trailers_${version}_x64-setup.exe`
// GitHub reemplaza los espacios del nombre del archivo por puntos
const nombreSubido = exe.split('/').pop().replaceAll(' ', '.')
writeFileSync('src-tauri/target/latest.json', JSON.stringify({
  version,
  pub_date: new Date().toISOString(),
  platforms: {
    'windows-x86_64': {
      signature: readFileSync(`${exe}.sig`, 'utf8'),
      url: `https://github.com/MartinBinaghi/Cotizador-de-trailers/releases/download/${tag}/${nombreSubido}`
    }
  }
}, null, 2))

run(`gh release create ${tag} "${exe}" src-tauri/target/latest.json --title "Cotizador ${tag}" --generate-notes`)
