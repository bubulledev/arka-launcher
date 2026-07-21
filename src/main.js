const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron')
const path = require('path')
const os = require('os')
const fs = require('fs')
const http = require('http')
const crypto = require('crypto')

const API = 'http://141.11.113.69:30179'
const MC_DIR = path.join(os.homedir(), 'AppData', 'Roaming', '.minecraft-arkazy')
const MODS_DIR = path.join(MC_DIR, 'mods')
const CONFIG_DIR = path.join(MC_DIR, 'config')
const FANCYMENU_DIR = path.join(CONFIG_DIR, 'fancymenu')
const FORGE_VERSION_ID = 'neoforge-21.1.219'
const ICON_PATH = path.join(__dirname, '..', 'icon.png')

let win

// ══ SYSTÈME DE MISE À JOUR ══
const LAUNCHER_VERSION = '4.0.2'

async function checkForUpdates(isManual = false) {
  try {
    const fetch = require('node-fetch')
    const res = await fetch('https://api.github.com/repos/bubulledev/arka-launcher/releases/latest', {
      headers: { 'User-Agent': 'ArkaRP-Launcher' }
    }).then(r => r.json()).catch(() => ({}))

    const latest = res.tag_name?.replace('v', '') || LAUNCHER_VERSION
    if (latest !== LAUNCHER_VERSION) {
      // Trouver l'asset .exe
      const asset = res.assets?.find(a => a.name.endsWith('.exe'))
      const downloadUrl = asset?.browser_download_url

      const { response } = await dialog.showMessageBox(win, {
        type: 'info',
        title: ' Mise à jour disponible !',
        message: `Nouvelle version v${latest} disponible !`,
        detail: `Vous utilisez la v${LAUNCHER_VERSION}.\nCliquez sur "Installer" pour télécharger et installer automatiquement la mise à jour.`,
        buttons: ['Installer maintenant', 'Plus tard'],
        defaultId: 0
      })

      if (response === 0 && downloadUrl) {
        const updateDir = app.getPath('userData')
        if (!fs.existsSync(updateDir)) fs.mkdirSync(updateDir, { recursive: true })
        const tmpPath = path.join(updateDir, `arka-update-${latest}.exe`)

        win.webContents.send('launch-progress', { pct: 10, msg: 'Téléchargement de la mise à jour...' })

        const responseDownload = await fetch(downloadUrl)
        if (!responseDownload.ok) {
          throw new Error(`Code HTTP ${responseDownload.status} lors du téléchargement`)
        }
        
        const total = parseInt(responseDownload.headers.get('content-length') || '0')
        let downloaded = 0
        const file = fs.createWriteStream(tmpPath)

        await new Promise((resolve, reject) => {
          responseDownload.body.on('data', chunk => {
            downloaded += chunk.length
            const pct = total ? Math.round((downloaded / total) * 100) : 50
            win.webContents.send('launch-progress', { pct, msg: `Téléchargement... ${pct}%` })
          })
          responseDownload.body.pipe(file)
          responseDownload.body.on('error', err => { file.destroy(); reject(err) })
          file.on('finish', () => { file.close(); resolve() })
          file.on('error', err => { file.destroy(); reject(err) })
        })

        win.webContents.send('launch-progress', { pct: 100, msg: 'Installation en cours...' })
        console.log('[UPDATE] Lancement installateur:', tmpPath)

        console.log('[UPDATE] Ouverture installateur:', tmpPath)
        const openErr = await shell.openPath(tmpPath)
        if (openErr) {
          console.error('[UPDATE] Erreur lors de l\'ouverture de l\'installateur:', openErr)
          dialog.showErrorBox('Erreur de mise à jour', `Impossible de lancer l'installateur : ${openErr}`)
        } else {
          setTimeout(() => app.quit(), 1000)
        }
      } else if (response === 0) {
        shell.openExternal(res.html_url || 'https://github.com/bubulledev/arka-launcher/releases/latest')
      }
    } else {
      console.log('[UPDATE] Launcher à jour :', LAUNCHER_VERSION)
      if (isManual) {
        await dialog.showMessageBox(win, {
          type: 'info',
          title: '🎮 Launcher à jour',
          message: 'Votre launcher est déjà à jour !',
          detail: `Version installée : v${LAUNCHER_VERSION}`,
          buttons: ['Super !']
        })
      }
    }
  } catch(e) {
    console.log('[UPDATE] Vérification impossible:', e.message)
    if (isManual) {
      dialog.showErrorBox('Erreur de vérification', `Impossible de vérifier les mises à jour : ${e.message}`)
    }
  }
}

let currentAccessToken = null

// ══ DISCORD RICH PRESENCE ══
const DISCORD_CLIENT_ID = '1514167621753507952' // À remplacer par ton vrai ID
let rpc = null
let rpcReady = false
let launchTime = null

async function initDiscordRPC() {
  try {
    const DiscordRPC = require('discord-rpc')
    DiscordRPC.register(DISCORD_CLIENT_ID)
    rpc = new DiscordRPC.Client({ transport: 'ipc' })

    rpc.on('ready', () => {
      rpcReady = true
      console.log('[DISCORD] RPC connecté')
      setDiscordActivity('idle')
    })

    rpc.on('disconnected', () => {
      rpcReady = false
      console.log('[DISCORD] RPC déconnecté')
    })

    await rpc.login({ clientId: DISCORD_CLIENT_ID })
  } catch(e) {
    console.log('[DISCORD] RPC non disponible (Discord fermé?)', e.message)
  }
}

function setDiscordActivity(state) {
  if (!rpc || !rpcReady) return
  try {
    const base = {
      largeImageKey: 'logo',
    largeImageText: 'Arka RP',
      buttons: [{ label: ' Rejoindre le Discord', url: 'https://discord.gg/U59tBFhpPH' }],
      instance: false,
    }
    if (state === 'idle') {
      rpc.setActivity({ ...base, details: 'Dans le launcher', state: 'Arka RP 1.21.1' })
    } else if (state === 'playing') {
      rpc.setActivity({ ...base, details: 'En jeu sur Arka RP', state: '1.21.1 NeoForge', startTimestamp: launchTime })
    }
  } catch(e) { console.log('[DISCORD] Erreur activité:', e.message) }
}


function createWindow() {
  win = new BrowserWindow({
    width: 1100, height: 680, resizable: false, frame: false,
    backgroundColor: '#0f0f11',
    icon: ICON_PATH,
    webPreferences: {
      preload: path.join(__dirname, 'js/preload.js'),
      contextIsolation: true, nodeIntegration: false
    }
  })
  win.loadFile(path.join(__dirname, 'index.html'))
}

// Icône dans la barre des tâches
app.whenReady().then(() => {
  setTimeout(() => checkForUpdates(false), 3000)
  initDiscordRPC()
  if (process.platform === 'win32') app.setAppUserModelId('fr.arkaRP.launcher')
  createWindow()
})
app.on('window-all-closed', () => { if (rpc) rpc.destroy().catch(()=>{}) ; if (process.platform !== 'darwin') app.quit() })
ipcMain.handle('check-update', (event, isManual = true) => checkForUpdates(isManual))
ipcMain.on('win-min',   () => win.minimize())
ipcMain.on('win-max',   () => win.isMaximized() ? win.unmaximize() : win.maximize())
ipcMain.on('win-close', () => { if (win) win.close() })

function apiFetch(endpoint) {
  return new Promise((resolve, reject) => {
    const req = http.get(`${API}${endpoint}`, { timeout: 8000 }, res => {
      let data = ''
      res.on('data', c => data += c)
      res.on('end', () => { try { resolve(JSON.parse(data)) } catch(e) { reject(e) } })
    })
    req.on('error', reject)
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')) })
  })
}
function apiPost(endpoint, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body)
    const url = new URL(`${API}${endpoint}`)
    const opts = { hostname: url.hostname, port: parseInt(url.port)||80, path: url.pathname, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }, timeout: 8000 }
    const req = http.request(opts, res => {
      let d = ''
      res.on('data', c => d += c)
      res.on('end', () => { try { resolve(JSON.parse(d)) } catch(e) { reject(e) } })
    })
    req.on('error', reject)
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')) })
    req.write(data); req.end()
  })
}

function downloadFile(endpoint, dest, onProgress) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest)
    http.get(`${API}${endpoint}`, { timeout: 120000 }, res => {
      const total = parseInt(res.headers['content-length'] || '0')
      let received = 0
      res.on('data', chunk => {
        received += chunk.length
        file.write(chunk)
        if (total > 0 && onProgress) onProgress(Math.round((received/total)*100))
      })
      res.on('end', () => { file.end(); resolve() })
      res.on('error', err => { file.destroy(); if (fs.existsSync(dest)) fs.unlinkSync(dest); reject(err) })
    }).on('error', reject)
  })
}

function fileMd5(filePath) {
  return crypto.createHash('md5').update(fs.readFileSync(filePath)).digest('hex')
}

ipcMain.handle('get-status', async () => { try { return await apiFetch('/status') } catch(e) { return { online: false, error: e.message } } })
ipcMain.handle('register', async (_, d) => { try { return await apiPost('/register', d) } catch(e) { return { success: false, error: e.message } } })
ipcMain.handle('login-account', async (_, d) => { try { return await apiPost('/login', d) } catch(e) { return { success: false, error: e.message } } })

ipcMain.handle('check-mods', async () => {
  try {
    const s = await apiFetch('/mods')
    if (!fs.existsSync(MODS_DIR)) fs.mkdirSync(MODS_DIR, { recursive: true })
    const clientMods = fs.readdirSync(MODS_DIR).filter(f => f.endsWith('.jar'))
    const serverMods = s.mods || []
    const missing = serverMods.filter(sm => !clientMods.some(cm => cm === sm.name))
    const outdated = serverMods.filter(sm => {
      const lp = path.join(MODS_DIR, sm.name)
      return fs.existsSync(lp) && fileMd5(lp) !== sm.hash
    })
    return { ok: missing.length === 0 && outdated.length === 0, missing, outdated, clientMods, serverMods }
  } catch(e) { return { ok: false, missing: [], outdated: [], error: e.message } }
})

ipcMain.handle('import-skin', async () => {
  const r = await dialog.showOpenDialog(win, { title: 'Skin PNG', filters: [{ name: 'PNG', extensions: ['png'] }], properties: ['openFile'] })
  if (r.canceled) return { canceled: true }

  if (!currentAccessToken || currentAccessToken === 'no-token') {
    return { success: false, error: 'Token Microsoft introuvable. Reconnecte-toi.' }
  }

  const skinPath = r.filePaths[0]
  const skinData = fs.readFileSync(skinPath)
  const base64 = 'data:image/png;base64,' + skinData.toString('base64')

  try {
    // Upload skin vers l'API Mojang
    const https = require('https')
    const FormData = require('form-data') // utilise node-fetch form-data

    // Construire le multipart manuellement
    const boundary = '----FormBoundary' + Math.random().toString(36).substr(2)
    const CRLF = '\r\n'
    const body = Buffer.concat([
      Buffer.from('--' + boundary + CRLF),
      Buffer.from('Content-Disposition: form-data; name="variant"' + CRLF + CRLF),
      Buffer.from('classic' + CRLF),
      Buffer.from('--' + boundary + CRLF),
      Buffer.from('Content-Disposition: form-data; name="file"; filename="skin.png"' + CRLF),
      Buffer.from('Content-Type: image/png' + CRLF + CRLF),
      skinData,
      Buffer.from(CRLF + '--' + boundary + '--' + CRLF),
    ])

    await new Promise((resolve, reject) => {
      const req = https.request({
        hostname: 'api.minecraftservices.com',
        path: '/minecraft/profile/skins',
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + currentAccessToken,
          'Content-Type': 'multipart/form-data; boundary=' + boundary,
          'Content-Length': body.length,
        }
      }, (res) => {
        let data = ''
        res.on('data', d => data += d)
        res.on('end', () => {
          if (res.statusCode === 200 || res.statusCode === 204) resolve(data)
          else reject(new Error('Mojang API: ' + res.statusCode + ' — ' + data))
        })
      })
      req.on('error', reject)
      req.write(body)
      req.end()
    })

    // Sauvegarder localement aussi
    const skinDir = path.join(MC_DIR, 'skins')
    if (!fs.existsSync(skinDir)) fs.mkdirSync(skinDir, { recursive: true })
    fs.copyFileSync(skinPath, path.join(skinDir, 'custom_skin.png'))

    return { success: true, base64 }
  } catch(e) {
    console.error('[SKIN]', e.message)
    return { success: false, error: e.message }
  }
})
ipcMain.on('open-mods-folder', () => {
  if (!fs.existsSync(MODS_DIR)) fs.mkdirSync(MODS_DIR, { recursive: true })
  shell.openPath(MODS_DIR)
})

// ── MICROSOFT AUTH ──
ipcMain.on('ms-login', async () => {
  try {
    const { Auth } = require('msmc')
    const auth = new Auth('select_account')

    if (win && !win.isDestroyed()) win.webContents.send('auth-status', { msg: 'Ouverture Microsoft...' })

    // Ouvrir dans une fenêtre Electron séparée avec accès internet
    const authWin = new BrowserWindow({
      width: 520, height: 600,
      title: 'Connexion Microsoft',
      parent: win, modal: true,
      autoHideMenuBar: true,
      webPreferences: { nodeIntegration: false, contextIsolation: true }
    })

    const xbox = await auth.launch('electron', { optionalFeatures: false }, authWin)
    
    if (win && !win.isDestroyed()) win.webContents.send('auth-status', { msg: 'Récupération Minecraft...' })
    const mc = await xbox.getMinecraft()
    const profile = mc.profile
    if (!profile) throw new Error('Profil introuvable')
    const token = mc.mcToken || mc.minecraft?.access_token || mc.access_token || 'no-token'
    console.log('[AUTH] OK:', profile.name)
    currentAccessToken = token
    if (win && !win.isDestroyed()) win.webContents.send('auth-success', { username: profile.name, uuid: profile.id, accessToken: token, userType: 'msa' })
  } catch(err) { console.error('[AUTH ERROR]', err.message); if (win && !win.isDestroyed()) win.webContents.send('auth-error', err.message) }
})

// ── LANCER MINECRAFT ──
ipcMain.on('launch-game', async (event, data) => {
  console.log('[LAUNCH] Démarrage pour:', data.username)
  try {
    if (!fs.existsSync(MC_DIR)) fs.mkdirSync(MC_DIR, { recursive: true })
    if (!fs.existsSync(MODS_DIR)) fs.mkdirSync(MODS_DIR, { recursive: true })
    if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true })
    if (!fs.existsSync(FANCYMENU_DIR)) fs.mkdirSync(FANCYMENU_DIR, { recursive: true })

    // ── 1. Sync mods ──
    try {
      win.webContents.send('launch-progress', { pct: 2, msg: 'Vérification des mods...' })
      const modsData = await apiFetch('/mods')
      const serverMods = modsData.mods || []
      const clientMods = fs.readdirSync(MODS_DIR).filter(f => f.endsWith('.jar'))
      for (const local of clientMods) {
        if (!serverMods.find(sm => sm.name === local)) {
          fs.unlinkSync(path.join(MODS_DIR, local))
          console.log('[MODS] Supprimé:', local)
        }
      }
      for (let i = 0; i < serverMods.length; i++) {
        const mod = serverMods[i]
        const localPath = path.join(MODS_DIR, mod.name)
        const needsDownload = !fs.existsSync(localPath) || fileMd5(localPath) !== mod.hash
        if (needsDownload) {
          const basePct = 2 + Math.round((i / serverMods.length) * 35)
          win.webContents.send('launch-progress', { pct: basePct, msg: `⬇ ${mod.name}` })
          await downloadFile(`/mods/download/${encodeURIComponent(mod.name)}`, localPath, pct => {
            win.webContents.send('launch-progress', { pct: basePct, msg: `⬇ ${mod.name} — ${pct}%` })
          })
        }
      }
      win.webContents.send('launch-progress', { pct: 38, msg: `✓ ${serverMods.length} mods vérifiés` })
    } catch(e) {
      console.log('[MODS] Erreur:', e.message)
      win.webContents.send('launch-progress', { pct: 38, msg: 'Mods: mods locaux utilisés' })
    }

    // ── 2. Sync config FancyMenu ──
    try {
      win.webContents.send('launch-progress', { pct: 40, msg: 'Vérification config FancyMenu...' })
      const configData = await apiFetch('/configs')
      const serverConfigs = configData.configs || []
      for (let i = 0; i < serverConfigs.length; i++) {
        const cfg = serverConfigs[i]
        const localPath = path.join(FANCYMENU_DIR, cfg.name)
        const needsDownload = !fs.existsSync(localPath) || fileMd5(localPath) !== cfg.hash
        if (needsDownload) {
          win.webContents.send('launch-progress', { pct: 40 + Math.round((i / serverConfigs.length) * 8), msg: `⬇ Config: ${cfg.name}` })
          await downloadFile(`/configs/download/${encodeURIComponent(cfg.name)}`, localPath)
        }
      }
      win.webContents.send('launch-progress', { pct: 48, msg: `✓ ${serverConfigs.length} configs FancyMenu vérifiées` })
    } catch(e) {
      console.log('[CONFIG] Erreur:', e.message)
      win.webContents.send('launch-progress', { pct: 48, msg: 'Config: configs locales utilisées' })
    }

    // ── 3. Lancer NeoForge directement ──
    const { spawn } = require('child_process')
    const forgeDir = path.join(MC_DIR, 'versions', FORGE_VERSION_ID)
    if (!fs.existsSync(forgeDir)) {
      win.webContents.send('launch-error', `NeoForge non trouvé ! (${FORGE_VERSION_ID})`)
      return
    }

    // Lire le JSON NeoForge
    const forgeJsonPath = path.join(forgeDir, `${FORGE_VERSION_ID}.json`)
    if (!fs.existsSync(forgeJsonPath)) {
      win.webContents.send('launch-error', `Fichier JSON NeoForge introuvable : ${forgeJsonPath}`)
      return
    }
    const forgeJson = JSON.parse(fs.readFileSync(forgeJsonPath, 'utf8'))

    // Lire le JSON vanilla 1.21.1
    const vanillaJsonPath = path.join(MC_DIR, 'versions', '1.21.1', '1.21.1.json')
    if (!fs.existsSync(vanillaJsonPath)) {
      win.webContents.send('launch-error', 'Minecraft 1.21.1 vanilla non trouvé ! Lance Minecraft 1.21.1 une fois depuis le launcher officiel.')
      return
    }
    const vanillaJson = JSON.parse(fs.readFileSync(vanillaJsonPath, 'utf8'))

    const librariesDir = path.join(MC_DIR, 'libraries')
    const ram = data.ram || 4
    const nativesDir = path.join(forgeDir, 'natives')
    const assetsDir = path.join(MC_DIR, 'assets')
    const assetIndex = vanillaJson.assetIndex?.id || '1.21'

    // Les libs du module path NeoForge (dans -p) — a exclure du classpath
    const modulePathLibs = new Set([
      'cpw/mods/bootstraplauncher/2.0.2/bootstraplauncher-2.0.2.jar',
      'cpw/mods/securejarhandler/3.0.8/securejarhandler-3.0.8.jar',
      'org/ow2/asm/asm-commons/9.8/asm-commons-9.8.jar',
      'org/ow2/asm/asm-util/9.8/asm-util-9.8.jar',
      'org/ow2/asm/asm-analysis/9.8/asm-analysis-9.8.jar',
      'org/ow2/asm/asm-tree/9.8/asm-tree-9.8.jar',
      'org/ow2/asm/asm/9.8/asm-9.8.jar',
      'net/neoforged/JarJarFileSystems/0.4.1/JarJarFileSystems-0.4.1.jar',
    ])

    // Construire le classpath (libs vanilla + NeoForge, sauf celles dans module path)
    const allLibraries = [...(vanillaJson.libraries || []), ...(forgeJson.libraries || [])]
    const classpathSet = new Set()
    const classpathEntries = []
    for (const lib of allLibraries) {
      if (!lib.downloads?.artifact) continue
      const relPath = lib.downloads.artifact.path
      if (modulePathLibs.has(relPath)) continue
      const libPath = path.join(librariesDir, relPath)
      if (fs.existsSync(libPath) && !classpathSet.has(libPath)) {
        classpathSet.add(libPath)
        classpathEntries.push(libPath)
      }
    }
    const classpath = classpathEntries.join(path.delimiter)

    const resolve = (str) => str
      .replace(/\$\{auth_player_name\}/g, data.username)
      .replace(/\$\{version_name\}/g, FORGE_VERSION_ID)
      .replace(/\$\{game_directory\}/g, MC_DIR)
      .replace(/\$\{assets_root\}/g, assetsDir)
      .replace(/\$\{assets_index_name\}/g, assetIndex)
      .replace(/\$\{auth_uuid\}/g, data.uuid)
      .replace(/\$\{auth_access_token\}/g, data.accessToken)
      .replace(/\$\{user_type\}/g, 'msa')
      .replace(/\$\{version_type\}/g, 'release')
      .replace(/\$\{natives_directory\}/g, nativesDir)
      .replace(/\$\{launcher_name\}/g, 'ArkaRP')
      .replace(/\$\{launcher_version\}/g, '5.0.0')
      .replace(/\$\{classpath\}/g, classpath)
      .replace(/\$\{library_directory\}/g, librariesDir)
      .replace(/\$\{classpath_separator\}/g, path.delimiter)

    const resolveArgs = (args) => {
      if (!args) return []
      return args.map(arg => typeof arg === 'string' ? resolve(arg) : null).filter(Boolean)
    }

    const jvmArgs = [
      '-Xmx' + ram + 'G', '-Xms2G',
      '-Djava.library.path=' + nativesDir,
      '-Dminecraft.launcher.brand=ArkasyRP',
      '-Dminecraft.launcher.version=5.0.0',
    ]

    for (const arg of (forgeJson.arguments?.jvm || [])) {
      if (typeof arg === 'string' && !arg.includes('XstartOnFirstThread') && !arg.includes('XX:+UseShenandoahGC')) jvmArgs.push(resolve(arg))
      else if (arg?.value) {
        const vals = Array.isArray(arg.value) ? arg.value : [arg.value]
        const filtered = vals.filter(v => !v.includes("XstartOnFirstThread") && !v.includes("UseShenandoahGC"))
        jvmArgs.push(...filtered.map(resolve))
      }
    }

    for (const arg of (vanillaJson.arguments?.jvm || [])) {
      if (typeof arg === 'string' && !arg.includes('XstartOnFirstThread') && !arg.includes('XX:+UseShenandoahGC')) jvmArgs.push(resolve(arg))
      else if (arg?.value) {
        const vals = Array.isArray(arg.value) ? arg.value : [arg.value]
        const filtered = vals.filter(v => !v.includes("XstartOnFirstThread") && !v.includes("UseShenandoahGC"))
        jvmArgs.push(...filtered.map(resolve))
      }
    }

    const mainClass = forgeJson.mainClass
    const gameArgs = [
      ...resolveArgs((vanillaJson.arguments?.game || []).filter(a => typeof a === 'string')),
      ...resolveArgs((forgeJson.arguments?.game || []).filter(a => typeof a === 'string')),
    ]
    const javaExe = data.javaPath?.trim() || 'javaw'
    const fullArgs = [...jvmArgs, mainClass, ...gameArgs]


    console.log('[LAUNCH] Java:', javaExe)
    console.log('[LAUNCH] MainClass:', mainClass)

    win.webContents.send('launch-progress', { pct: 50, msg: 'Lancement NeoForge 1.21.1...' })

    const child = spawn(javaExe, fullArgs, { cwd: MC_DIR, detached: true, stdio: ['ignore', 'pipe', 'pipe'] })
    child.stdout.on('data', d => { d.toString().split('\n').forEach(line => { line = line.trim(); if (line) { console.log('[MC]', line); win.webContents.send('mc-log', line); win.webContents.send('launch-progress', { pct: 75, msg: line.substring(0, 80) }) } }) })
    child.stderr.on('data', d => { d.toString().split('\n').forEach(line => { line = line.trim(); if (line) { console.log('[MC]', line); win.webContents.send('mc-error', line) } }) })
    child.on('close', code => { console.log('[MC] Fermé, code:', code); win.webContents.send('launch-progress', { pct: 100, msg: 'Minecraft fermé.' }) })
    child.on('error', e => { console.error('[MC ERROR]', e.message); win.webContents.send('launch-error', e.message) })
    launchTime = new Date()
    setDiscordActivity('playing')
    child.on('close', () => setDiscordActivity('idle'))
    child.unref()
    console.log('[LAUNCH] Minecraft lancé !')
  } catch(err) {
    console.error('[LAUNCH ERROR]', err.message)
    win.webContents.send('launch-error', err.message)
  }
})
