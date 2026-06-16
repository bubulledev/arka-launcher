const API = 'http://141.11.113.75'
const ADMIN_LIST = ['bubulle2206']
let currentUser = null
let ramValue = 4

// ══ MICROSOFT SEULEMENT ══
document.addEventListener('DOMContentLoaded', () => {
  const btnMs = document.getElementById('btn-ms')
  if (btnMs) {
    btnMs.addEventListener('click', () => {
      if (window.api) { showAuthLoading('Ouverture Microsoft…'); window.api.msLogin() }
      else loginSuccess({ username: 'TestUser', role: 'player', ms: true, accessToken: 'demo', uuid: 'demo-uuid' })
    })
  }
})

window.api?.onAuthStatus(({ msg }) => showAuthLoading(msg))
window.api?.onAuthSuccess(data => {
  hideAuthLoading()
  data.role = ADMIN_LIST.includes(data.username) ? 'admin' : 'player'
  loginSuccess(data)
})
window.api?.onAuthError(msg => {
  hideAuthLoading()
  const err = document.getElementById('login-err')
  if (err) { err.textContent = '❌ ' + (msg || 'Connexion annulée.'); err.removeAttribute('hidden'); setTimeout(() => err.setAttribute('hidden',''), 5000) }
})


function showErr(id, msg) {
  const el = document.getElementById(id)
  el.textContent = '❌ ' + msg; el.removeAttribute('hidden')
  setTimeout(() => el.setAttribute('hidden', ''), 5000)
}
function showAuthLoading(msg) {
  document.getElementById('auth-loading-txt').textContent = msg
  document.getElementById('auth-loading').removeAttribute('hidden')
}
function hideAuthLoading() { document.getElementById('auth-loading').setAttribute('hidden', '') }

// ══ LOGIN SUCCESS ══
function loginSuccess(user) {
  currentUser = user
  document.getElementById('s-login').classList.remove('active')
  document.getElementById('s-launcher').classList.add('active')
  setupLauncher()
}

// ══ SETUP ══
async function setupLauncher() {
  const isAdmin = currentUser.role === 'admin'
  const avatarUrl = 'https://mineskin.eu/helm/' + currentUser.username + '/100.png'
  const sbAvatar = document.getElementById('sb-avatar')
  if (sbAvatar) sbAvatar.src = avatarUrl
  const skinHead = document.getElementById('skin-head-img')
  if (skinHead) skinHead.src = avatarUrl
  document.getElementById('hh-name').textContent = currentUser.username
  document.getElementById('skin-username').textContent = currentUser.username
  const tbUser = document.getElementById('tb-user') || document.getElementById('tb-user-chip')
  if (tbUser) tbUser.textContent = currentUser.username + (isAdmin ? ' ★' : '')

  if (isAdmin) {
    document.getElementById('sb-sep')?.removeAttribute('hidden')
    document.getElementById('sb-accounts')?.removeAttribute('hidden')
    document.getElementById('sb-instance')?.removeAttribute('hidden')
    fillAccounts()
  }

  document.querySelectorAll('.sb-btn[data-view]').forEach(btn => {
    btn.addEventListener('click', () => switchView(btn.dataset.view, btn))
  })

  document.getElementById('ram-s')?.addEventListener('input', function() {
    ramValue = parseInt(this.value)
    document.getElementById('ram-v').textContent = ramValue + ' Go'
  })

  // ── BOUTON LAUNCH ──
  const btnLaunch = document.getElementById('btn-launch')
  if (btnLaunch) {
    btnLaunch.onclick = function() { launchGame() }
  }

  const btnLogout = document.getElementById('btn-logout'); if (btnLogout) btnLogout.onclick = logout
  document.getElementById('btn-check-mods')?.addEventListener('click', checkMods)
  document.getElementById('btn-open-mods')?.addEventListener('click', () => window.api?.openModsFolder())
  document.getElementById('btn-import-skin')?.addEventListener('click', importSkin)
  document.getElementById('btn-skin-url')?.addEventListener('click', applySkinUrl)

  window.api?.onProgress(({ pct, msg }) => updateProgress(pct, msg))
  window.api?.onLaunchError(msg => {
    updateProgress(0, '❌ ' + msg)
    if (btnLaunch) btnLaunch.disabled = false
    document.getElementById('launch-text').textContent = 'LANCEMENT DU JEU'
    setTimeout(() => document.getElementById('launch-prog').setAttribute('hidden', ''), 5000)
  })

  // Init : cacher toutes les vues sauf home
  document.querySelectorAll('.view').forEach(v => {
    v.style.display = v.id === 'view-home' ? 'flex' : 'none'
  })

  loadStatus()
} // fin setupLauncher

// ══ STATUT ══
async function loadStatus() {
  try {
    const status = window.api ? await window.api.getStatus() : null
    if (!status || status.error) return
    const dot = document.getElementById('tb-dot')
    const hbDot = document.getElementById('hb-dot')
    if (status.maintenance) {
      dot.className = 'tb-dot offline'
      hbDot.style.background = '#f59e0b'
      document.getElementById('tb-status-txt').textContent = 'Maintenance'
      document.getElementById('maintenance-banner').removeAttribute('hidden')
      document.getElementById('maintenance-msg').textContent = status.maintenanceMsg || 'Maintenance en cours'
      document.getElementById('btn-launch').disabled = true
    } else {
      dot.className = 'tb-dot online'
      document.getElementById('tb-status-txt').textContent = 'En ligne'
    }
    if (status.news?.length) loadNews(status.news)
  } catch(e) { console.log('API offline:', e.message) }
}

function loadNews(arr) {
  const feed = document.getElementById('news-feed')
  feed.innerHTML = ''
  arr.forEach(n => {
    const c = document.createElement('div')
    c.className = 'nf-card' + (n.featured ? ' featured' : '')
    c.innerHTML = `${n.featured ? '<div class="nf-badge">NOUVEAU</div>' : ''}<div class="nf-date">${n.date}</div><h3>${n.title}</h3><p>${n.content}</p>`
    feed.appendChild(c)
  })
}

// ══ NAVIGATION ══
function switchView(viewId, btn) {
  // Cacher toutes les vues
  document.querySelectorAll('.view').forEach(v => {
    v.classList.remove('active')
    v.style.display = 'none'
    v.style.position = ''
  })
  document.querySelectorAll('.sb-btn[data-view]').forEach(b => b.classList.remove('active'))
  // Afficher la bonne vue
  const target = document.getElementById('view-' + viewId)
  if (target) {
    target.classList.add('active')
    target.style.display = 'flex'
    target.style.flexDirection = 'column'
  }
  if (btn) btn.classList.add('active')
  const names = { home:'Accueil', mods:'Mods', skin:'Skin', news:'Actualités', settings:'Paramètres', accounts:'Comptes', instance:'Serveur', console:'Console' }
  const nameEl = document.getElementById('tb-panel-name')
  if (nameEl) nameEl.textContent = names[viewId] || viewId
}

// ══ LANCEMENT ══
function launchGame() {
  console.log('[APP] launchGame appelé, user:', currentUser?.username)
  console.log('[APP] accessToken:', currentUser?.accessToken ? 'présent' : 'absent')

  if (!currentUser) { alert('Non connecté !'); return }
  if (!currentUser.accessToken || currentUser.accessToken === 'offline') {
    alert('⚠️ Tu dois te connecter avec Microsoft pour lancer Minecraft.')
    return
  }

  const btn = document.getElementById('btn-launch')
  btn.disabled = true
  document.getElementById('launch-text').textContent = 'LANCEMENT...'
  document.getElementById('launch-prog').removeAttribute('hidden')
  updateProgress(3, 'Initialisation...')

  const payload = {
    username:    currentUser.username,
    uuid:        currentUser.uuid,
    accessToken: currentUser.accessToken,
    version:     '1.21.1',
    ram:         ramValue,
    javaPath:    document.getElementById('java-path')?.value || ''
  }
  console.log('[APP] Envoi launch-game:', payload.username, payload.version)

  if (window.api) {
    window.api.launchGame(payload)
  } else {
    simulateLaunch()
  }
}

function simulateLaunch() {
  let pct = 0
  const msgs = ['Vérification fichiers…','Téléchargement assets…','Chargement NeoForge…','Lancement Minecraft…']
  const iv = setInterval(() => {
    pct += Math.random() * 12
    if (pct > 100) pct = 100
    updateProgress(Math.round(pct), msgs[Math.min(Math.floor(pct/25), 3)])
    if (pct >= 100) {
      clearInterval(iv)
      setTimeout(() => {
        document.getElementById('launch-prog').setAttribute('hidden', '')
        document.getElementById('btn-launch').disabled = false
        document.getElementById('launch-text').textContent = 'LANCEMENT DU JEU'
        document.getElementById('lp-fill').style.width = '0%'
      }, 3000)
    }
  }, 200)
}

function updateProgress(pct, msg) {
  document.getElementById('lp-fill').style.width = pct + '%'
  document.getElementById('lp-msg').textContent = msg
  if (pct >= 100) {
    setTimeout(() => {
      document.getElementById('launch-prog').setAttribute('hidden', '')
      document.getElementById('btn-launch').disabled = false
      document.getElementById('launch-text').textContent = 'LANCEMENT DU JEU'
      document.getElementById('lp-fill').style.width = '0%'
    }, 4000)
  }
}

// ══ MODS ══
async function checkMods() {
  const result = document.getElementById('mods-result')
  result.innerHTML = '<div style="color:var(--m);padding:8px">Vérification...</div>'
  if (!window.api) { result.innerHTML = '<div style="color:var(--m);padding:8px">Non disponible en démo.</div>'; return }
  const check = await window.api.checkMods()
  result.innerHTML = ''
  if (check.error) { result.innerHTML = `<div style="color:var(--m);padding:8px">Impossible de contacter le serveur : ${check.error}</div>`; return }
  if (!check.serverMods.length) { result.innerHTML = '<div style="color:var(--m);padding:8px">Aucun mod requis.</div>'; return }
  check.serverMods.forEach(mod => {
    const ok = check.clientMods.some(cm => cm.toLowerCase().includes(mod.name.toLowerCase()))
    const row = document.createElement('div')
    row.className = 'mod-row ' + (ok ? 'ok' : 'missing')
    row.innerHTML = `<div class="mod-icon ${ok?'ok':'miss'}">${ok?'✓':'✕'}</div><div style="flex:1"><div class="mod-name">${mod.name}</div><div class="mod-ver">${mod.version||''}</div></div><span class="mod-tag ${ok?'ok':'miss'}">${ok?'PRÉSENT':'MANQUANT'}</span>`
    result.appendChild(row)
  })
}

// ══ SKIN ══
async function importSkin() {
  if (!window.api) { alert('Non disponible en démo.'); return }
  const res = await window.api.importSkin()
  if (res.canceled) return
  const status = document.getElementById('skin-status')
  status.removeAttribute('hidden')
  if (res.success) {
    status.className = 'skin-status ok'
    status.textContent = '✅ Skin appliqué sur ton compte Microsoft !'
    const img = document.getElementById('skin-head-img')
    img.src = res.base64; img.style.display = 'block'
  } else if (res.error) {
    status.className = 'skin-status err'
    status.textContent = '❌ ' + res.error
  } else {
    status.className = 'skin-status err'
    status.textContent = '❌ Erreur inconnue.'
  }
}

function applySkinUrl() {
  const url = document.getElementById('skin-url')?.value?.trim()
  if (!url) return
  const img = document.getElementById('skin-head-img')
  if (img) { img.src = url; img.onerror = () => { img.src = '' } }
}

// ══ SETTINGS ══
function saveSettings() { alert('✅ Paramètres sauvegardés !') }

// ══ COMPTES ADMIN ══
async function fillAccounts() {
  const wrap = document.getElementById('accounts-wrap')
  if (!wrap) return
  wrap.innerHTML = '<div style="color:var(--m);padding:12px;font-size:12px">Chargement...</div>'

  try {
    const res = await fetch(API + '/players')
    const data = await res.json()
    const players = Array.isArray(data) ? data : (data.players || [])

    wrap.innerHTML = ''
    if (!players.length) {
      wrap.innerHTML = '<div style="color:var(--m);padding:12px;font-size:12px">Aucun joueur.</div>'
      return
    }

    players.forEach(acc => {
      const isAdmin = ADMIN_LIST.includes(acc.username) || acc.role === 'admin'
      const row = document.createElement('div')
      row.className = 'acc-row'
      row.innerHTML = `
        <img src="https://mineskin.eu/helm/${acc.username}/40.png" 
             style="width:38px;height:38px;border-radius:9px;object-fit:cover;flex-shrink:0"
             onerror="this.style.display='none'">
        <div style="flex:1">
          <div class="acc-name">${acc.username}</div>
          <div class="acc-joined">Depuis ${acc.joined || '2024'}</div>
        </div>
        <span class="acc-badge ${isAdmin ? 'role-admin' : 'role-player'}">${isAdmin ? 'ADMIN' : 'PLAYER'}</span>
        ${acc.username !== currentUser?.username ? `<button class="acc-kick" onclick="kickPlayer('${acc.username}')">✕ Kick</button>` : ''}
      `
      wrap.appendChild(row)
    })
  } catch(e) {
    // Fallback liste locale si API indispo
    wrap.innerHTML = ''
    const fallback = [
      { username: 'bubulle2206', role: 'admin', joined: '2024' },
      { username: '_P4blett3_', role: 'player', joined: '2024' },
    ]
    fallback.forEach(acc => {
      const isAdmin = acc.role === 'admin'
      const row = document.createElement('div')
      row.className = 'acc-row'
      row.innerHTML = `
        <img src="https://mineskin.eu/helm/${acc.username}/40.png"
             style="width:38px;height:38px;border-radius:9px;object-fit:cover;flex-shrink:0"
             onerror="this.style.display='none'">
        <div style="flex:1">
          <div class="acc-name">${acc.username}</div>
          <div class="acc-joined">Depuis ${acc.joined}</div>
        </div>
        <span class="acc-badge ${isAdmin ? 'role-admin' : 'role-player'}">${isAdmin ? 'ADMIN' : 'PLAYER'}</span>
        ${acc.username !== currentUser?.username ? `<button class="acc-kick" onclick="kickPlayer('${acc.username}')">✕ Kick</button>` : ''}
      `
      wrap.appendChild(row)
    })
    console.log('[ACCOUNTS] API indispo, fallback local:', e.message)
  }
}
async function kickPlayer(name) {
  if (name === currentUser?.username) { alert("Tu ne peux pas te kick !"); return }
  if (!confirm(`Kick ${name} du serveur ?`)) return
  try {
    const res = await fetch(API + '/kick', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: name, by: currentUser?.username })
    })
    const data = await res.json()
    if (data.success) {
      alert(`✅ ${name} a été kické.`)
      fillAccounts()
    } else {
      alert('❌ ' + (data.error || 'Erreur kick.'))
    }
  } catch(e) {
    alert('❌ API indisponible : ' + e.message)
  }
}

// ══ LOGOUT ══
function logout() {
  currentUser = null
  document.getElementById('s-launcher').classList.remove('active')
  document.getElementById('s-login').classList.add('active')
  ;['login-user','login-pass','offline-name'].forEach(id => { const el = document.getElementById(id); if(el) el.value = '' })
  ;['sb-sep','sb-accounts','sb-instance'].forEach(id => document.getElementById(id)?.setAttribute('hidden',''))
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'))
  document.getElementById('view-home').classList.add('active')
  document.querySelectorAll('.sb-btn').forEach(b => b.classList.remove('active'))
  document.querySelector('[data-view="home"]')?.classList.add('active')
}

// ══ CONSOLE ══
function consoleLog(text, type) {
  const out = document.getElementById('console-output')
  if (!out) return
  const line = document.createElement('div')
  const color = type === 'error' ? '#f87171' : type === 'warn' ? '#fbbf24' : type === 'info' ? '#60a5fa' : '#d4d4d4'
  line.style.color = color
  line.style.marginBottom = '2px'
  line.textContent = text
  out.appendChild(line)
  out.scrollTop = out.scrollHeight
}

window.api?.onMcLog?.(line => consoleLog(line, 'info'))
window.api?.onMcError?.(line => consoleLog(line, 'error'))
window.api?.onProgress?.(({ msg }) => { if (msg) consoleLog('[LAUNCHER] ' + msg, 'info') })
window.api?.onLaunchError?.((msg) => consoleLog('[ERREUR] ' + msg, 'error'))

