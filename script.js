const firebaseConfig = {
  apiKey: "AIzaSyBsoVp1piNGfpiznGKsu6dYX6iWyrgjJ7Y",
  authDomain: "wsdefr-45c8b.firebaseapp.com",
  projectId: "wsdefr-45c8b",
  storageBucket: "wsdefr-45c8b.firebasestorage.app",
  messagingSenderId: "345585719496",
  appId: "1:345585719496:web:091e04c97c41558e8eedfd",
  measurementId: "G-967D0LFEC3"
}

firebase.initializeApp(firebaseConfig)
const db = firebase.firestore()
let THEME = 'dark'
function applyTheme(t) { THEME = t; document.body.setAttribute('data-theme', t) }
function initTheme() { applyTheme('dark') }

async function sha256(text) {
  const data = new TextEncoder().encode(text)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hash)).map(b=>b.toString(16).padStart(2,'0')).join('')
}

function byId(id) { return document.getElementById(id) }
function show(el) { el.classList.add('active'); el.classList.remove('hidden') }
function hide(el) { el.classList.remove('active'); el.classList.add('hidden') }
function escapeHtml(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;') }

function daysDiff(endStr) {
  if (!endStr) return 999
  const end = new Date(endStr + 'T00:00:00')
  const diff = Math.round((end.getTime() - Date.now()) / (1000*60*60*24))
  return diff
}

function expiryStatus(endStr) {
  const d = daysDiff(endStr)
  if (d < 0) return 'expired'
  if (d <= 5) return 'expiring'
  return 'active'
}

async function listPlayers() {
  const snap = await db.collection('players').get()
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

async function savePlayer(form) {
  const id = byId('pf-id').value.trim()
  const payload = {
    name: byId('pf-name').value.trim(),
    phone: byId('pf-phone').value.trim(),
    username: byId('pf-username').value.trim(),
    passwordHash: '',
    slotId: byId('pf-slot').value.trim(),
    slotEndDate: byId('pf-slotEnd').value,
    paymentStatus: byId('pf-payment').value
  }
  const pw = byId('pf-password').value
  if (pw) payload.passwordHash = await sha256(pw)
  let prevSlot = null
  if (id) {
    const prev = await db.collection('players').doc(id).get()
    if (prev.exists) prevSlot = prev.data().slotId || null
  }
  if (payload.slotId && payload.slotId !== prevSlot) {
    const sDoc = await db.collection('slots').doc(payload.slotId).get()
    if (sDoc.exists) {
      const s = sDoc.data()
      if ((s.currentCount || 0) >= s.capacity) { alert('Slot full'); return }
      await db.collection('slots').doc(payload.slotId).set({ currentCount: (s.currentCount || 0) + 1 }, { merge: true })
    }
  }
  if (id) {
    await db.collection('players').doc(id).set(payload, { merge: true })
  } else {
    const ref = await db.collection('players').add(payload)
    byId('pf-id').value = ref.id
  }
  await refreshAll()
  form.reset()
  byId('pf-id').value = ''
}

async function deletePlayer(id) {
  await db.collection('players').doc(id).delete()
  await refreshAll()
}

async function togglePayment(id, current) {
  const next = current === 'Paid' ? 'Unpaid' : 'Paid'
  await db.collection('players').doc(id).set({ paymentStatus: next }, { merge: true })
  await db.collection('payments').add({ playerId: id, amount: 0, status: next, date: new Date().toISOString() })
  await refreshAll()
}

async function addPaymentLog(playerId) {
  const amount = 1000
  await db.collection('payments').add({ playerId, amount, date: new Date().toISOString() })
  await db.collection('players').doc(playerId).set({ paymentStatus: 'Paid' }, { merge: true })
  await refreshAll()
}

async function listSlots() {
  const snap = await db.collection('slots').get()
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

function populateSlotSelects(slots) {
  const pf = byId('pf-slot')
  if (pf) {
    pf.innerHTML = `<option value="">No slot</option>` + slots.map(s=>`<option value="${s.id}">${s.name}</option>`).join('')
  }
  const applySel = document.getElementById('apply-slot-select')
  if (applySel) {
    applySel.innerHTML = `<option value="">Choose a slot</option>` + slots.map(s=>`<option value="${s.id}">${s.name}</option>`).join('')
  }
}

async function addSlot() {
  const name = byId('slot-name').value.trim()
  const capacity = Number(byId('slot-cap').value || '0')
  if (!name || !capacity) return
  await db.collection('slots').add({ name, capacity, currentCount: 0 })
  byId('slot-name').value = ''
  byId('slot-cap').value = ''
  await refreshSlots()
}

async function updateSlotCapacity(id, cap) {
  await db.collection('slots').doc(id).set({ capacity: Number(cap) }, { merge: true })
  await refreshSlots()
}

async function removeSlot(id) {
  await db.collection('slots').doc(id).delete()
  await refreshSlots()
}

async function assignSlot(playerId, slotId) {
  const sRef = await db.collection('slots').doc(slotId).get()
  if (!sRef.exists) return alert('Slot missing')
  const s = sRef.data()
  if ((s.currentCount || 0) >= s.capacity) return alert('Slot full')
  await db.collection('slots').doc(slotId).set({ currentCount: (s.currentCount || 0) + 1 }, { merge: true })
  await db.collection('players').doc(playerId).set({ slotId }, { merge: true })
  await refreshAll()
}

async function setAttendanceCodeToday(code) {
  const today = new Date().toISOString().slice(0,10)
  await db.collection('attendanceMeta').doc(today).set({ id: today, date: today, code })
}

async function getAttendanceToday() {
  const today = new Date().toISOString().slice(0,10)
  const doc = await db.collection('attendanceMeta').doc(today).get()
  return doc.exists ? doc.data() : null
}

async function listAttendance(date) {
  if (date) {
    const snap = await db.collection('attendance').where('date','==',date).get()
    return snap.docs.map(d => ({ id: d.id, ...d.data() }))
  }
  const snap = await db.collection('attendance').get()
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

function monthKey() { return new Date().toISOString().slice(0,7) }
function monthDays() { const m = monthKey(); return Array.from({length:31},(_,i)=>`${m}-${String(i+1).padStart(2,'0')}`) }
function intensityClass(n) { if (n===0) return ''; if (n<3) return 'l1'; if (n<6) return 'l2'; if (n<10) return 'l3'; return 'l4' }
function renderHeatmap(el, counts) {
  const days = monthDays()
  el.innerHTML = days.map((d,i)=>`<div class="cell ${intensityClass(counts[d]||0)}" title="${d}: ${counts[d]||0}"><span class="day">${i+1}</span></div>`).join('')
}

function renderBars({ paid, unpaid, active, expired }) {
  const container = byId('bar-indicators')
  const total = paid + unpaid + active + expired || 1
  const mk = (label, count, color) => `<div><div class="bar" style="width:${(count/total)*100}%; background:${color}"></div><div class="text">${label}: ${count}</div></div>`
  container.innerHTML = mk('Paid', paid, '#22c55e') + mk('Unpaid', unpaid, '#ef4444') + mk('Active', active, '#16a34a') + mk('Expired', expired, '#f59e0b')
}

async function refreshOverview() {
  const players = await getPlayersFast()
  const total = players.length
  const paid = players.filter(p=>p.paymentStatus==='Paid').length
  const unpaid = total - paid
  const active = players.filter(p=>expiryStatus(p.slotEndDate) !== 'expired').length
  const expired = total - active
  byId('stat-total').textContent = total
  byId('stat-paid').textContent = paid
  byId('stat-unpaid').textContent = unpaid
  byId('stat-active').textContent = active
  byId('stat-expired').textContent = expired
  renderBars({ paid, unpaid, active, expired })
}

async function refreshAdminAnalytics() {
  const [players, attendance] = await Promise.all([listPlayers(), listAttendance()])
  const mk = monthKey()
  const per = players.map(p => {
    const recs = attendance.filter(a=>a.playerId===p.id && String(a.date).startsWith(mk))
    const present = recs.filter(r=>r.status==='Present').length
    const percent = Math.round((present/Math.max(recs.length,1))*100)
    return { player: p, percent }
  })
  const perEl = byId('an-perplayer')
  perEl.innerHTML = per.map(pp=>`<div class="item"><div class="text">${pp.player.name}</div><div class="value">${pp.percent}%</div></div>`).join('')
  const top = [...per].sort((a,b)=>b.percent-a.percent).slice(0,5)
  const topEl = byId('an-top5')
  topEl.innerHTML = top.map((pp,i)=>`<div class="item"><div class="text">${i+1}. ${pp.player.name}</div><div class="value">${pp.percent}%</div></div>`).join('')
  const counts = {}
  attendance.filter(a=>String(a.date).startsWith(mk) && a.status==='Present').forEach(a=>{ counts[a.date] = (counts[a.date]||0)+1 })
  renderHeatmap(byId('an-heatmap'), counts)
}

function renderPlayersTable(players, slots) {
  const container = byId('players-table')
  const rows = players.map(p => {
    const status = expiryStatus(p.slotEndDate)
    const color = status==='expired' ? 'text-red' : status==='expiring' ? 'text-yellow' : 'text-green'
    const slotName = slots.find(s=>s.id===p.slotId)?.name || (p.slotId||'')
    return `<tr>
      <td>${p.name}</td>
      <td>${p.phone}</td>
      <td>${p.username}</td>
      <td>${slotName}</td>
      <td>${p.slotEndDate||''}</td>
      <td>${p.paymentStatus}</td>
      <td class="${color}">${status}</td>
      <td>
        <button class="btn" data-edit="${p.id}">Edit</button>
        <button class="btn" data-del="${p.id}">Delete</button>
        <button class="btn" data-pay="${p.id}" data-paystat="${p.paymentStatus}">Set ${p.paymentStatus==='Paid'?'Unpaid':'Paid'}</button>
        <button class="btn" data-paylog="${p.id}">Add Payment</button>
      </td>
    </tr>`
  }).join('')
  container.innerHTML = `<table>
    <thead><tr><th>Name</th><th>Phone</th><th>Username</th><th>Slot</th><th>Slot End</th><th>Payment</th><th>Expiry</th><th></th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`
  container.querySelectorAll('[data-edit]').forEach(b=>b.addEventListener('click', async ev=>{
    const id = ev.target.getAttribute('data-edit')
    const doc = await db.collection('players').doc(id).get()
    const p = doc.data()
    byId('pf-id').value = id
    byId('pf-name').value = p.name||''
    byId('pf-phone').value = p.phone||''
    byId('pf-username').value = p.username||''
    byId('pf-slot').value = p.slotId||''
    byId('pf-slotEnd').value = p.slotEndDate||''
    byId('pf-payment').value = p.paymentStatus||'Unpaid'
  }))
  container.querySelectorAll('[data-del]').forEach(b=>b.addEventListener('click', ev=> deletePlayer(ev.target.getAttribute('data-del')) ))
  container.querySelectorAll('[data-pay]').forEach(b=>b.addEventListener('click', ev=> togglePayment(ev.target.getAttribute('data-pay'), ev.target.getAttribute('data-paystat')) ))
  container.querySelectorAll('[data-paylog]').forEach(b=>b.addEventListener('click', ev=> addPaymentLog(ev.target.getAttribute('data-paylog')) ))
  
}

async function refreshPlayers() {
  const q = byId('search').value.toLowerCase()
  const key = byId('sort').value
  const [players, slots] = await Promise.all([getPlayersFast(), getSlotsFast()])
  populateSlotSelects(slots)
  const filtered = players.filter(p=>[p.name||'', p.username||'', p.phone||''].some(v=>v.toLowerCase().includes(q)))
  filtered.sort((a,b)=>{
    const va = key==='slot' ? (a.slotId||'') : (a[key]||'')
    const vb = key==='slot' ? (b.slotId||'') : (b[key]||'')
    return String(va).localeCompare(String(vb))
  })
  renderPlayersTable(filtered, slots)
}

async function refreshSlots() {
  const slots = await getSlotsFast()
  populateSlotSelects(slots)
  const container = byId('slot-list')
  container.innerHTML = slots.map(s=>`<div class="item"><div class="text">${s.name}</div><div class="text">cap:${s.capacity} current:${s.currentCount||0}</div><input type="number" value="${s.capacity}" data-cap="${s.id}" class="slot-cap-input" /><button class="btn" data-remove="${s.id}">Delete</button></div>`).join('')
  container.querySelectorAll('.slot-cap-input').forEach(inp=>inp.addEventListener('blur', ev=> updateSlotCapacity(ev.target.getAttribute('data-cap'), ev.target.value)))
  container.querySelectorAll('[data-remove]').forEach(b=>b.addEventListener('click', ev=> removeSlot(ev.target.getAttribute('data-remove')) ))
}

async function refreshAttendance() {
  const today = new Date().toISOString().slice(0,10)
  const meta = await getAttendanceToday()
  byId('att-code').value = meta?.code || ''
  if (!meta || !meta.code) {
    const code = Math.random().toString(36).slice(2,8).toUpperCase()
    await setAttendanceCodeToday(code)
    byId('att-code').value = code
  }
  const [att, players] = await Promise.all([getAttendanceFast(today), getPlayersFast()])
  const nameFor = id => (players.find(p=>p.id===id)?.name||'')
  const userFor = id => (players.find(p=>p.id===id)?.username||'')
  const rows = att.map(a=>`<tr><td>${nameFor(a.playerId)}</td><td>${userFor(a.playerId)}</td><td>${a.status}</td><td>${a.date}</td></tr>`).join('')
  byId('attendance-table').innerHTML = `<table><thead><tr><th>Name</th><th>Username</th><th>Status</th><th>Date</th></tr></thead><tbody>${rows}</tbody></table>`
}

async function exportAttendanceCSV() {
  const today = new Date().toISOString().slice(0,10)
  const att = await listAttendance(today)
  const headers = ['playerId','status','date']
  const lines = [headers.join(',')].concat(att.map(a=> headers.map(h=>JSON.stringify(a[h]||'')).join(',')))
  const csv = lines.join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `attendance-${today}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

async function refreshApplications() {
  const snap = await db.collection('applications').get()
  const apps = snap.docs.map(d => ({ id: d.id, ...d.data() }))
  const rows = apps.map(a=>`<tr><td>${a.name}</td><td>${a.phone}</td><td>${a.username}</td><td>${a.chosenSlot||''}</td><td>${a.status}</td><td><button class="btn" data-accept="${a.id}">Accept</button><button class="btn" data-reject="${a.id}">Reject</button></td></tr>`).join('')
  byId('applications-table').innerHTML = `<table><thead><tr><th>Name</th><th>Phone</th><th>Username</th><th>Slot</th><th>Status</th><th></th></tr></thead><tbody>${rows}</tbody></table>`
  byId('applications-table').querySelectorAll('[data-accept]').forEach(b=>b.addEventListener('click', async ev=>{ await db.collection('applications').doc(ev.target.getAttribute('data-accept')).set({ status: 'Accepted' }, { merge: true }); refreshApplications() }))
  byId('applications-table').querySelectorAll('[data-reject]').forEach(b=>b.addEventListener('click', async ev=>{ await db.collection('applications').doc(ev.target.getAttribute('data-reject')).set({ status: 'Rejected' }, { merge: true }); refreshApplications() }))
}

async function refreshAll() { await Promise.all([refreshOverview(), refreshPlayers(), refreshSlots(), refreshAttendance(), refreshApplications()]) }

function setupAdmin() {
  document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', ev => {
    document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'))
    ev.target.classList.add('active')
    const name = ev.target.getAttribute('data-tab')
    document.querySelectorAll('.panel').forEach(p=>p.classList.remove('active'))
    byId('tab-' + name).classList.add('active')
  }))
  byId('player-form').addEventListener('submit', ev => { ev.preventDefault(); savePlayer(ev.target) })
  byId('slot-add').addEventListener('click', addSlot)
  byId('search').addEventListener('input', refreshPlayers)
  byId('sort').addEventListener('change', refreshPlayers)
  byId('att-regen').addEventListener('click', async()=>{ const code = Math.random().toString(36).slice(2,8).toUpperCase(); await setAttendanceCodeToday(code); await refreshAttendance() })
  byId('att-copy').addEventListener('click', ()=> navigator.clipboard.writeText(byId('att-code').value))
  byId('att-export').addEventListener('click', exportAttendanceCSV)
  byId('theme-toggle-admin')?.addEventListener('click', ()=> applyTheme(THEME==='light'?'dark':'light'))
  byId('match-add')?.addEventListener('click', async()=>{
    const a = byId('match-player-a').value
    const b = byId('match-player-b').value
    const slotId = byId('match-slot').value
    const dt = byId('match-date').value
    const note = byId('match-note').value.trim()
    if (!a || !b || a===b || !dt) return
    await db.collection('matches').add({ playerIds: [a,b], slotId, date: dt, note, status: 'Upcoming' })
    await refreshMatchesAdmin()
  })
  refreshAll()
  refreshAdminAnalytics()
  refreshMatchesAdmin()
  refreshAdminPayments()
  refreshAdminTournaments()
  byId('pay-player')?.addEventListener('change', refreshAdminPayments)
  byId('pay-add')?.addEventListener('click', async()=>{
    const current = byId('pay-player').value
    const amount = Number(byId('pay-amount').value||'0')
    const status = byId('pay-status').value
    const method = byId('pay-method').value.trim()
    const note = byId('pay-note').value.trim()
    if (!current || !status) return
    await db.collection('payments').add({ playerId: current, amount, status, method, note, date: new Date().toISOString() })
    await db.collection('players').doc(current).set({ paymentStatus: status==='Received'?'Paid':'Unpaid' }, { merge: true })
    byId('pay-amount').value = ''
    byId('pay-method').value = ''
    byId('pay-note').value = ''
    cacheWrite('pay:'+current, null)
    refreshAdminPayments()
    refreshPlayers()
  })
}

async function refreshMatchesAdmin() {
  const [players, slots, ms] = await Promise.all([getPlayersFast(), getSlotsFast(), getMatchesFast()])
  const nameFor = id => (players.find(p=>p.id===id)?.name||'')
  const slotName = id => (slots.find(s=>s.id===id)?.name||'')
  const rows = ms.map(m=>{
    const a = m.playerIds?.[0]
    const b = m.playerIds?.[1]
    return `<tr><td>${nameFor(a)} vs ${nameFor(b)}</td><td>${slotName(m.slotId||'')}</td><td>${m.date}</td><td>${m.status||''}</td><td>${escapeHtml(m.note||'')}</td></tr>`
  }).join('')
  byId('matches-table').innerHTML = `<table><thead><tr><th>Players</th><th>Slot</th><th>Date</th><th>Status</th><th>Note</th></tr></thead><tbody>${rows}</tbody></table>`
  const selA = byId('match-player-a')
  const selB = byId('match-player-b')
  const selS = byId('match-slot')
  if (selA) selA.innerHTML = `<option value="">Choose Player A</option>` + players.map(p=>`<option value="${p.id}">${p.name}</option>`).join('')
  if (selB) selB.innerHTML = `<option value="">Choose Player B</option>` + players.map(p=>`<option value="${p.id}">${p.name}</option>`).join('')
  if (selS) selS.innerHTML = `<option value="">Choose Slot</option>` + slots.map(s=>`<option value="${s.id}">${s.name}</option>`).join('')
}



async function refreshAdminPayments() {
  const players = await listPlayers()
  const sel = byId('pay-player')
  const prev = sel?.value || ''
  if (sel) sel.innerHTML = `<option value="">Choose Player</option>` + players.map(p=>`<option value="${p.id}">${p.name}</option>`).join('')
  if (prev && players.find(p=>p.id===prev)) sel.value = prev
  const pid = sel?.value || players[0]?.id || ''
  if (!pid) { const tbl=byId('pay-table'); if (tbl) tbl.innerHTML = ''; return }
  const snap = await db.collection('payments').where('playerId','==',pid).get()
  const rows = snap.docs.map(d=>d.data()).sort((a,b)=> String(b.date).localeCompare(String(a.date))).map(p=>`<tr><td>${p.date}</td><td>${p.amount}</td><td>${p.status||''}</td><td>${p.method||''}</td><td>${p.note||''}</td></tr>`).join('')
  byId('pay-table').innerHTML = `<table><thead><tr><th>Date</th><th>Amount</th><th>Status</th><th>Method</th><th>Note</th></tr></thead><tbody>${rows}</tbody></table>`
  
}

async function listTournaments() {
  const snap = await db.collection('tournaments').get()
  return snap.docs.map(d=>({ id: d.id, ...d.data() }))
}

function labelForRound(count) { if (count<=1) return 'Winner'; if (count===2) return 'Final'; if (count===4) return 'Semifinal'; return 'Round of '+count }

async function refreshAdminTournaments() {
  const [players, slots, tours] = await Promise.all([getPlayersFast(), getSlotsFast(), getTournamentsFast()])
  const selT = byId('tour-select')
  if (selT) selT.innerHTML = `<option value="">Choose Tournament</option>` + tours.map(t=>`<option value="${t.id}">${t.name} ${t.stage?`• ${t.stage}`:''}</option>`).join('')
  const selA = byId('tour-player-a')
  const selB = byId('tour-player-b')
  const selS = byId('tour-slot')
  if (selA) selA.innerHTML = `<option value="">Player A</option>` + players.map(p=>`<option value="${p.id}">${p.name}</option>`).join('')
  if (selB) selB.innerHTML = `<option value="">Player B</option>` + players.map(p=>`<option value="${p.id}">${p.name}</option>`).join('')
  if (selS) selS.innerHTML = `<option value="">Slot</option>` + slots.map(s=>`<option value="${s.id}">${s.name}</option>`).join('')
  const selP = byId('tour-participant')
  if (selP) selP.innerHTML = `<option value="">Choose Player</option>` + players.map(p=>`<option value="${p.id}">${p.name}</option>`).join('')
  selT?.addEventListener('change', async()=>{ await renderTournamentMatches(); await renderTournamentParticipants() })
  selT?.addEventListener('change', renderTournamentMatches)
  byId('tour-add')?.addEventListener('click', async()=>{
    const name = byId('tour-name').value.trim()
    if (!name) return
    await db.collection('tournaments').add({ name, currentRound: 1, stage: 'Round of ?', participants: [] })
    byId('tour-name').value = ''
    refreshAdminTournaments()
  })
  byId('tour-match-add')?.addEventListener('click', async()=>{
    const tid = selT?.value
    const a = selA?.value
    const b = selB?.value
    const slotId = selS?.value
    const dt = byId('tour-date').value
    if (!tid || !a || !b || a===b || !dt) return
    const tDoc = await db.collection('tournaments').doc(tid).get()
    const round = tDoc.exists ? (tDoc.data().currentRound||1) : 1
    await db.collection('matches').add({ tournamentId: tid, round, playerIds: [a,b], slotId, date: dt, status: 'Upcoming', winnerId: null })
    renderTournamentMatches()
  })
  byId('tour-advance')?.addEventListener('click', async()=>{
    const tid = selT?.value
    if (!tid) return
    await advanceTournamentRound(tid)
    renderTournamentMatches()
    refreshAdminTournaments()
  })
  byId('tour-add-participant')?.addEventListener('click', async()=>{
    const tid = selT?.value
    const pid = selP?.value
    if (!tid || !pid) return
    await db.collection('tournaments').doc(tid).set({ participants: firebase.firestore.FieldValue.arrayUnion(pid) }, { merge: true })
    await renderTournamentParticipants()
  })
  byId('tour-generate')?.addEventListener('click', async()=>{
    const tid = selT?.value
    if (!tid) return
    await generateTournamentRound(tid)
    await renderTournamentMatches()
  })
  renderTournamentMatches()
  renderTournamentParticipants()
}

async function renderTournamentMatches() {
  const tid = byId('tour-select')?.value
  if (!tid) { const el=byId('tour-matches'); if (el) el.innerHTML = ''; return }
  const [players, slots, tDoc, ms] = await Promise.all([getPlayersFast(), getSlotsFast(), db.collection('tournaments').doc(tid).get(), db.collection('matches').where('tournamentId','==',tid).get()])
  const nameFor = id => (players.find(p=>p.id===id)?.name||'')
  const slotName = id => (slots.find(s=>s.id===id)?.name||'')
  const items = ms.docs.map(d=>({ id:d.id, ...d.data() })).sort((a,b)=> String(a.round).localeCompare(String(b.round)) || String(a.date).localeCompare(String(b.date)))
  const rows = items.map(m=>{
    const a=m.playerIds?.[0], b=m.playerIds?.[1]
    const winner = m.winnerId ? nameFor(m.winnerId) : ''
    return `<tr><td>${nameFor(a)} vs ${nameFor(b)}</td><td>${slotName(m.slotId||'')}</td><td>${m.date}</td><td>${m.round||''}</td><td>${winner}</td><td>${m.status||''}</td><td><button class="btn" data-win-a="${m.id}">Winner A</button><button class="btn" data-win-b="${m.id}">Winner B</button></td></tr>`
  }).join('')
  byId('tour-matches').innerHTML = `<table><thead><tr><th>Players</th><th>Slot</th><th>Date</th><th>Round</th><th>Winner</th><th>Status</th><th></th></tr></thead><tbody>${rows}</tbody></table>`
  byId('tour-matches').querySelectorAll('[data-win-a]').forEach(b=>b.addEventListener('click', async ev=>{ const mid=ev.target.getAttribute('data-win-a'); const m=items.find(x=>x.id===mid); await db.collection('matches').doc(mid).set({ winnerId: m.playerIds[0], status: 'Completed' }, { merge: true }); renderTournamentMatches() }))
  byId('tour-matches').querySelectorAll('[data-win-b]').forEach(b=>b.addEventListener('click', async ev=>{ const mid=ev.target.getAttribute('data-win-b'); const m=items.find(x=>x.id===mid); await db.collection('matches').doc(mid).set({ winnerId: m.playerIds[1], status: 'Completed' }, { merge: true }); renderTournamentMatches() }))
  byId('tour-stage').textContent = tDoc.exists ? (tDoc.data().stage||'') : ''
}

async function renderTournamentParticipants() {
  const tid = byId('tour-select')?.value
  if (!tid) { const el=byId('tour-participants'); if (el) el.innerHTML=''; return }
  const [players, tDoc] = await Promise.all([listPlayers(), db.collection('tournaments').doc(tid).get()])
  const part = tDoc.exists ? (tDoc.data().participants||[]) : []
  const rows = part.map(pid=>`<div class="item"><div class="text">${players.find(p=>p.id===pid)?.name||pid}</div><button class="btn" data-rmp="${pid}">Remove</button></div>`).join('')
  byId('tour-participants').innerHTML = rows || '<div class="text">No participants</div>'
  byId('tour-participants').querySelectorAll('[data-rmp]').forEach(b=>b.addEventListener('click', async ev=>{ const pid=ev.target.getAttribute('data-rmp'); await db.collection('tournaments').doc(tid).set({ participants: firebase.firestore.FieldValue.arrayRemove(pid) }, { merge: true }); renderTournamentParticipants() }))
}

async function generateTournamentRound(tid) {
  const tDoc = await db.collection('tournaments').doc(tid).get()
  const round = tDoc.exists ? (tDoc.data().currentRound||1) : 1
  let seeds = []
  if (round===1) { seeds = (tDoc.data().participants||[]).slice() } else {
    const snap = await db.collection('matches').where('tournamentId','==',tid).where('round','==',round).get()
    const ms = snap.docs.map(d=>d.data()).filter(m=>m.winnerId)
    seeds = ms.map(m=>m.winnerId)
  }
  if (seeds.length < 2) return
  for (let i=0; i<seeds.length; i+=2) {
    const a = seeds[i], b = seeds[i+1]
    if (!a || !b) {
      await db.collection('matches').add({ tournamentId: tid, round, playerIds: [a], slotId: '', date: new Date().toISOString(), status: 'Upcoming', winnerId: a })
      continue
    }
    await db.collection('matches').add({ tournamentId: tid, round, playerIds: [a,b], slotId: '', date: new Date().toISOString(), status: 'Upcoming', winnerId: null })
  }
  const label = labelForRound(seeds.length)
  await db.collection('tournaments').doc(tid).set({ stage: label }, { merge: true })
}

async function advanceTournamentRound(tid) {
  const tRef = await db.collection('tournaments').doc(tid).get()
  const round = tRef.exists ? (tRef.data().currentRound||1) : 1
  const snap = await db.collection('matches').where('tournamentId','==',tid).where('round','==',round).get()
  const ms = snap.docs.map(d=>d.data()).filter(m=>m.winnerId)
  const winners = ms.map(m=>m.winnerId)
  if (winners.length < 2) return
  const nextRound = round + 1
  for (let i=0; i<winners.length; i+=2) {
    const a = winners[i], b = winners[i+1]
    if (!a || !b) continue
    await db.collection('matches').add({ tournamentId: tid, round: nextRound, playerIds: [a,b], slotId: '', date: new Date().toISOString(), status: 'Upcoming', winnerId: null })
  }
  const label = labelForRound(winners.length)
  await db.collection('tournaments').doc(tid).set({ currentRound: nextRound, stage: label }, { merge: true })
}

// Player page
async function playerLogin() {
  const username = byId('login-username').value.trim()
  const password = byId('login-password').value
  const snap = await db.collection('players').where('username','==',username).get()
  if (snap.empty) { byId('login-error').textContent = 'Invalid login'; return }
  const p = { id: snap.docs[0].id, ...snap.docs[0].data() }
  const h = await sha256(password)
  if (p.passwordHash && p.passwordHash === h) {
    sessionStorage.setItem('playerId', p.id)
    hide(byId('login-panel')); hide(byId('apply-panel'))
    byId('player-tabs').classList.remove('hidden')
    show(byId('p-tab-dashboard'))
    await loadPlayerDashboard()
    await loadPlayerAnalytics()
    await loadPlayerPaymentsTable()
    await loadPlayerMatches()
    await loadPlayerTournaments()
  } else { byId('login-error').textContent = 'Invalid login' }
}

async function submitApplication(ev) {
  ev.preventDefault()
  const fd = new FormData(ev.target)
  const payload = { name: fd.get('name'), phone: fd.get('phone'), username: fd.get('username'), chosenSlot: fd.get('slot'), status: 'Pending' }
  await db.collection('applications').add(payload)
  hide(byId('apply-panel'))
  show(byId('login-panel'))
}

async function loadPlayerDashboard() {
  const id = sessionStorage.getItem('playerId')
  if (!id) return
  const doc = await db.collection('players').doc(id).get()
  if (!doc.exists) return
  const p = doc.data()
  let slotLabel = ''
  if (p.slotId) {
    const sDoc = await db.collection('slots').doc(p.slotId).get()
    if (sDoc.exists) slotLabel = sDoc.data().name || p.slotId
  }
  byId('pd-slot').textContent = slotLabel
  byId('pd-slot-end').textContent = 'End: ' + (p.slotEndDate || '')
  const pays = await getPaymentsFast(id)
  const sortedPays = pays.slice().sort((a,b)=> String(b.date).localeCompare(String(a.date)))
  byId('pd-payments').innerHTML = sortedPays.map(d=>`<div class="item"><div class="text">${d.date}</div><div class="text">${d.amount}${d.status?` • ${d.status}`:''}</div></div>`).join('')
  if (p.slotId) {
    const mates = (await getPlayersFast()).filter(pl=>pl.slotId===p.slotId)
    byId('pd-slot-players').innerHTML = mates.map(m=>`<div class="item"><div class="text">${m.name}</div><div class="text">${m.username||''}</div></div>`).join('')
  } else { byId('pd-slot-players').innerHTML = '' }
  const month = new Date().toISOString().slice(0,7)
  const attSnap = await db.collection('attendance').where('playerId','==',id).get()
  const records = attSnap.docs.map(d=>d.data()).filter(a=>String(a.date).startsWith(month))
  const present = records.filter(r=>r.status==='Present').length
  const percent = Math.round((present / Math.max(records.length,1))*100)
  byId('pd-att-percent').textContent = percent + '%'
}

async function markPresent() {
  const id = sessionStorage.getItem('playerId')
  if (!id) return
  const today = new Date().toISOString().slice(0,10)
  const code = byId('pd-code').value.trim().toUpperCase()
  const btn = byId('pd-mark'); if (btn) { btn.disabled = true; btn.textContent = 'Marking...' }
  const metaDoc = await db.collection('attendanceMeta').doc(today).get()
  if (!metaDoc.exists) return
  const meta = metaDoc.data()
  if (meta.code !== code) return
  await db.collection('attendance').add({ playerId: id, status: 'Present', date: today })
  byId('pd-code').value = ''
  const mk = monthKey()
  let recs = await getAttendanceForPlayerFast(id)
  recs = recs.concat([{ playerId: id, status: 'Present', date: today }])
  cacheWrite('attp:'+id, recs)
  const monthRecs = recs.filter(a=>String(a.date).startsWith(mk))
  const present = monthRecs.filter(r=>r.status==='Present').length
  const percent = Math.round((present / Math.max(monthRecs.length,1))*100)
  byId('pd-att-percent').textContent = percent + '%'
  if (btn) { btn.disabled = false; btn.textContent = 'Mark Present' }
}

function setupPlayer() {
  const existing = sessionStorage.getItem('playerId')
  if (existing) {
    hide(byId('login-panel'))
    hide(byId('apply-panel'))
    byId('player-tabs').classList.remove('hidden')
    show(byId('p-tab-dashboard'))
    loadPlayerDashboard()
    loadPlayerAnalytics()
    loadPlayerPaymentsTable()
    loadPlayerMatches()
    loadPlayerTournaments()
  } else {
    show(byId('login-panel'))
    hide(byId('apply-panel'))
  }
  byId('login-btn').addEventListener('click', playerLogin)
  byId('show-apply').addEventListener('click', ev=>{ ev.preventDefault(); hide(byId('login-panel')); show(byId('apply-panel')) })
  byId('apply-form').addEventListener('submit', submitApplication)
  listSlots().then(populateSlotSelects)
  byId('pd-mark').addEventListener('click', markPresent)
  const tabsContainer = byId('player-tabs')
  tabsContainer.addEventListener('click', ev => {
    const btn = ev.target.closest('.tab')
    if (!btn) return
    tabsContainer.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'))
    btn.classList.add('active')
    const t = btn.getAttribute('data-ptab')
    document.querySelectorAll('[id^=p-tab-]').forEach(p=>p.classList.add('hidden'))
    if (t==='logout') { sessionStorage.removeItem('playerId'); location.reload(); return }
    show(byId('p-tab-'+t))
  })
  byId('p-savepass').addEventListener('click', async()=>{
    const id = sessionStorage.getItem('playerId')
    const np = byId('p-newpass').value
    if (!id || !np) return
    const h = await sha256(np)
    await db.collection('players').doc(id).set({ passwordHash: h }, { merge: true })
    byId('p-newpass').value = ''
  })
}

async function loadPlayerAnalytics() {
  const id = sessionStorage.getItem('playerId')
  if (!id) return
  const mk = monthKey()
  const recsAll = await getAttendanceForPlayerFast(id)
  const recs = recsAll.filter(a=>String(a.date).startsWith(mk))
  const days = monthDays()
  const counts = {}
  days.forEach(d=> counts[d] = recs.filter(r=>r.date===d && r.status==='Present').length )
  renderHeatmap(byId('p-an-heatmap'), counts)
  byId('p-an-bars').innerHTML = days.map(d=>{
    const c = counts[d]||0
    const w = Math.min(100, c*10)
    return `<div class="item"><div class="text">${d}</div><div class="bar" style="width:${w}%; background:#4338ca"></div></div>`
  }).join('')
}

async function loadPlayerPaymentsTable() {
  const id = sessionStorage.getItem('playerId')
  if (!id) return
  const pays = await getPaymentsFast(id)
  const rows = pays.slice().sort((a,b)=> String(b.date).localeCompare(String(a.date))).map(p=>`<tr><td>${p.date}</td><td>${p.amount}</td><td>${p.status||''}</td><td>${p.method||''}</td><td>${p.note||''}</td></tr>`).join('')
  byId('p-payments-table').innerHTML = `<table><thead><tr><th>Date</th><th>Amount</th><th>Status</th><th>Method</th><th>Note</th></tr></thead><tbody>${rows}</tbody></table>`
}

async function loadPlayerMatches() {
  const id = sessionStorage.getItem('playerId')
  if (!id) return
  const [players, slots, ms] = await Promise.all([getPlayersFast(), getSlotsFast(), getMatchesForPlayerFast(id)])
  const nameFor = pid => (players.find(p=>p.id===pid)?.name||'')
  const slotName = sid => (slots.find(s=>s.id===sid)?.name||'')
  const rows = ms.slice().sort((a,b)=> String(a.date).localeCompare(String(b.date))).map(m=>{
    const oppId = (Array.isArray(m.playerIds) ? m.playerIds.find(pid=>pid!==id) : '')
    return `<tr><td>${nameFor(oppId)}</td><td>${slotName(m.slotId||'')}</td><td>${m.date}</td><td>${m.status||''}</td><td>${escapeHtml(m.note||'')}</td></tr>`
  }).join('')
  byId('p-matches-table').innerHTML = `<table><thead><tr><th>Opponent</th><th>Slot</th><th>Date</th><th>Status</th><th>Note</th></tr></thead><tbody>${rows}</tbody></table>`
}



document.addEventListener('DOMContentLoaded', () => {
  const page = document.body.getAttribute('data-page')
  initTheme()
  if (page === 'admin') setupAdmin()
  if (page === 'player') setupPlayer()
})
const CACHE = { store: {}, ttl: 30000 }
function cacheRead(key) { const e = CACHE.store[key]; if (!e) return null; if (Date.now() - e.t < CACHE.ttl) return e.v; return null }
function cacheWrite(key, v) { CACHE.store[key] = { v, t: Date.now() } }
async function getPlayersFast() { const c = cacheRead('players'); if (c) return c; const v = await listPlayers(); cacheWrite('players', v); return v }
async function getSlotsFast() { const c = cacheRead('slots'); if (c) return c; const v = await listSlots(); cacheWrite('slots', v); return v }
async function getAttendanceFast(date) { const k = 'att:'+ (date||'all'); const c = cacheRead(k); if (c) return c; const v = await listAttendance(date); cacheWrite(k, v); return v }
async function getPaymentsFast(playerId) { const k = 'pay:'+playerId; const c = cacheRead(k); if (c) return c; const snap = await db.collection('payments').where('playerId','==',playerId).get(); const v = snap.docs.map(d=>d.data()); cacheWrite(k, v); return v }
async function getMatchesFast() { const c = cacheRead('matches'); if (c) return c; const snap = await db.collection('matches').get(); const v = snap.docs.map(d=>({ id:d.id, ...d.data() })); cacheWrite('matches', v); return v }
async function getMatchesForPlayerFast(id) { const k='m:'+id; const c=cacheRead(k); if (c) return c; const snap=await db.collection('matches').where('playerIds','array-contains',id).get(); const v=snap.docs.map(d=>({ id:d.id, ...d.data() })); cacheWrite(k,v); return v }

async function getTournamentsFast() { const c = cacheRead('tours'); if (c) return c; const v = await listTournaments(); cacheWrite('tours', v); return v }
async function getAttendanceForPlayerFast(id) { const k='attp:'+id; const c=cacheRead(k); if (c) return c; const snap=await db.collection('attendance').where('playerId','==',id).get(); const v=snap.docs.map(d=>d.data()); cacheWrite(k,v); return v }