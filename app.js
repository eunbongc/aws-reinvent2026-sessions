// =====================================================================
// reinvent/app.js — Controller
//   · 렌더 / 필터 / 정렬 (기존 단일 파일 로직을 그대로 이식)
//   · 수파베이스 인증(매직링크) + 사용자별 선택 읽기/쓰기
// Model: sessions.js (window.SESSIONS, 공개·정적) + 수파베이스 user_sessions (개인)
// View : index.html
// =====================================================================

/* ---------------------------------------------------------------
 * 0. 수파베이스 클라이언트
 * ------------------------------------------------------------- */
const CFG = window.SUPABASE_CONFIG || {};
let sb = null;
if (CFG.url && CFG.publishableKey && window.supabase) {
  sb = window.supabase.createClient(CFG.url, CFG.publishableKey);
}

const ALL = window.SESSIONS || [];

// 로그인한 사용자의 선택을 메모리에 담는 맵 (sessionID -> {pick, verdict, note})
// 기존 PICKS / ANALYSIS 하드코딩을 대체한다.
let MY = {};          // 전체: { [sessionID]: {pick, verdict, note} }
let currentUser = null;

/* ---------------------------------------------------------------
 * 1. 상수 (기존 그대로)
 * ------------------------------------------------------------- */
const PICK_ICONS = ['', '⭕', '⭕⭕', '⭕⭕⭕'];
const DAY_SHORT = {
  'Sunday, Nov 29':'11/29(일)', 'Monday, Nov 30':'11/30(월)',
  'Tuesday, Dec 01':'12/1(화)', 'Wednesday, Dec 02':'12/2(수)',
  'Thursday, Dec 03':'12/3(목)', 'Friday, Dec 04':'12/4(금)'
};
const SORT_KEYS = ['picks','code','company','title','ko_desc','features','start_time','verdict'];
const V_LABEL = { keep:'참석', hold:'보류', drop:'제외' };
const V_NEXT  = { '':'keep', keep:'hold', hold:'drop', drop:'' }; // 클릭 순환

/* ---------------------------------------------------------------
 * 2. 선택 데이터 접근 — 기존 loadPicks()/ANALYSIS 를 MY 로 대체
 * ------------------------------------------------------------- */
function myOf(sid)   { return MY[sid] || { pick:0, verdict:'', note:'' }; }
function loadPicks() {                       // 기존 인터페이스 유지
  const p = {};
  Object.keys(MY).forEach(function(sid){ if (MY[sid].pick > 0) p[sid] = MY[sid].pick; });
  return p;
}

/* ---------------------------------------------------------------
 * 3. 상태 / 필터 / 정렬 (기존 로직 그대로 이식)
 * ------------------------------------------------------------- */
const state = { cat: 'all', days: new Set(), venue: 'all', verdict: 'all' };
let sortKey = 'picks', sortAsc = false;
const expanded = new Set();

const DAY_BTNS = {
  'Monday, Nov 30':'btn-day-mon','Tuesday, Dec 01':'btn-day-tue',
  'Wednesday, Dec 02':'btn-day-wed','Thursday, Dec 03':'btn-day-thu','Friday, Dec 04':'btn-day-fri'
};
function clearDayBtns() {
  document.getElementById('btn-day-all').className = 'filter-btn';
  Object.values(DAY_BTNS).forEach(function(id) {
    var b = document.getElementById(id);
    if (b) b.classList.remove('active-day');
  });
}
function setDayFilter(mode, btn) {
  clearDayBtns();
  if (mode === 'all') {
    state.days.clear();
    document.getElementById('btn-day-all').className = 'filter-btn active-day';
  }
  expanded.clear(); render();
}
function toggleDay(day, btn) {
  if (state.days.has(day)) { state.days.delete(day); btn.classList.remove('active-day'); }
  else { state.days.add(day); btn.classList.add('active-day'); }
  document.getElementById('btn-day-all').className =
    state.days.size === 0 ? 'filter-btn active-day' : 'filter-btn';
  expanded.clear(); render();
}
function setFilter(type, val, btn) {
  state[type] = val;
  btn.closest('.filter-group').querySelectorAll('.filter-btn').forEach(function(b) {
    b.classList.remove('active','active-day','active-venue');
  });
  btn.classList.add(type === 'venue' ? 'active-venue' : 'active');
  if (val === 'my_picks') { sortKey = 'picks'; sortAsc = false; }
  expanded.clear(); render();
  updateMyPicksLabel();
}
function setVerdictFilter(v, btn) {
  state.verdict = v;
  btn.parentElement.querySelectorAll('.filter-btn').forEach(function(b){ b.classList.remove('active-verdict'); });
  btn.classList.add('active-verdict');
  expanded.clear(); render();
}
function doSort(key) {
  if (sortKey === key) sortAsc = !sortAsc;
  else { sortKey = key; sortAsc = (key !== 'picks'); }
  render();
}
function matches(s) {
  var src = s.sources || [], f = s.features || '';
  var cat = state.cat, days = state.days, venue = state.venue;
  if (cat === 'my_picks'        && !(myOf(s.sessionID).pick > 0))     return false;
  if (cat === 'keynote'         && src.indexOf('keynote') < 0)        return false;
  if (cat === 'party'           && src.indexOf('party') < 0)          return false;
  if (cat === 'customer_story'  && f.indexOf('Customer story') < 0)   return false;
  if (cat === 'robotics'        && src.indexOf('robotics') < 0)       return false;
  if (cat === 'retail'          && src.indexOf('retail') < 0)         return false;
  if (cat === 'business_agents' && src.indexOf('business_agents') < 0) return false;
  if (days.size > 0 && !days.has(s.day)) return false;
  if (venue !== 'all' && s.venue !== venue) return false;
  if (state.verdict !== 'all') {
    var v = myOf(s.sessionID).verdict;
    if (state.verdict === 'none') { if (v) return false; }
    else if (v !== state.verdict) return false;
  }
  var q = document.getElementById('searchInput').value.toLowerCase();
  if (q) {
    return (s.title||'').toLowerCase().indexOf(q) >= 0 ||
           (s.code||'').toLowerCase().indexOf(q) >= 0 ||
           (s.company||'').toLowerCase().indexOf(q) >= 0 ||
           (s.ko_desc||'').toLowerCase().indexOf(q) >= 0 ||
           (s.abstract||'').toLowerCase().indexOf(q) >= 0;
  }
  return true;
}

/* ---------------------------------------------------------------
 * 4. 표현 헬퍼 (기존 그대로)
 * ------------------------------------------------------------- */
function mkTd(content, cls) {
  var td = document.createElement('td');
  if (cls) td.className = cls;
  td.innerHTML = content;
  return td;
}
function esc(t) {
  return (t||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function linkify(h) {
  return h.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
}
function companyHtml(s) {
  var c = s.company || '-';
  var cls = (c === 'AWS' || c.indexOf('AWS ') === 0) ? 'company-aws' : 'company-cell';
  return '<span class="' + cls + '">' + esc(c) + '</span>';
}
function badges(s) {
  var f = s.features||'', ap = s.session_appendices||'', src = s.sources||[];
  var h = '';
  if (src.indexOf('keynote')       >= 0) h += '<span class="badge b-keynote">🎤 키노트</span>';
  if (f.indexOf('Walk up only')    >= 0) h += '<span class="badge b-walkup">Walk up only</span>';
  if (/(^|,\s*)Full(,|$)/.test(f))       h += '<span class="badge b-full">Full</span>';
  if (f.indexOf('Customer story')  >= 0) h += '<span class="badge b-customer">★ 기업사례</span>';
  if (ap.indexOf('Sponsored')      >= 0) h += '<span class="badge b-sponsored">광고</span>';
  if (ap.indexOf('New launch')     >= 0) h += '<span class="badge b-new">New</span>';
  if (f.indexOf('AWS Partners')    >= 0) h += '<span class="badge b-partner">파트너</span>';
  if (src.indexOf('robotics')      >= 0) h += '<span class="badge b-robotics">Robotics</span>';
  if (src.indexOf('retail')        >= 0) h += '<span class="badge b-retail">Retail</span>';
  return h || '<span style="color:#ccc">-</span>';
}
function endOf(s) {
  if (!s.start_time || !s.length) return '';
  var p = s.start_time.split(':'); var m = (+p[0])*60 + (+p[1]) + s.length;
  return ('0'+Math.floor(m/60)%24).slice(-2) + ':' + ('0'+(m%60)).slice(-2);
}
function schedHtml(s) {
  var d = DAY_SHORT[s.day] || (s.day||'-');
  var tPart = s.start_time
    ? '<span class="time-info">' + s.start_time + (s.length ? '~' + endOf(s) : '') + '</span> '
    : '<span class="no-time">시간미정 </span>';
  var vPart = s.venue ? '<span class="venue-info">' + esc(s.venue) + '</span>' : '';
  return tPart + '<span class="day-info">' + d + '</span>' + vPart;
}
function verdictHtml(s) {
  var v = myOf(s.sessionID).verdict;
  if (!v) return '<span style="color:#ccc">-</span>';
  return '<span class="verdict v-' + v + '">' + V_LABEL[v] + '</span>';
}
function pickTd(s, cnt) {
  var td = document.createElement('td');
  td.className = 'pick-cell';
  if (cnt > 0) td.style.background = '#f0f8ff';
  td.textContent = PICK_ICONS[cnt] || '';
  td.title = currentUser ? '클릭: 우선순위 올리기 (⭕→⭕⭕→⭕⭕⭕→없음)' : '로그인 후 편집 가능';
  if (currentUser) {
    td.style.cursor = 'pointer';
    td.addEventListener('click', function(e) {
      e.stopPropagation();
      var cur = myOf(s.sessionID).pick;
      setPick(s.sessionID, (cur + 1) % 4);
    });
  }
  return td;
}

/* ---------------------------------------------------------------
 * 5. 렌더 (기존 로직 + 참석여부 클릭 토글)
 * ------------------------------------------------------------- */
function render() {
  var picks = loadPicks();
  var list = ALL.filter(matches);
  list.sort(function(a, b) {
    var va, vb;
    if (sortKey === 'picks') { va = picks[a.sessionID]||0; vb = picks[b.sessionID]||0; }
    else { va = a[sortKey]||''; vb = b[sortKey]||''; }
    if (typeof va === 'number') return sortAsc ? va-vb : vb-va;
    return sortAsc ? String(va).localeCompare(String(vb),'ko') : String(vb).localeCompare(String(va),'ko');
  });

  var tbody = document.getElementById('tbody');
  tbody.innerHTML = '';
  var frag = document.createDocumentFragment();

  list.forEach(function(s) {
    var sid = s.sessionID;
    var cnt = picks[sid] || 0;
    var isExp = expanded.has(sid);

    var tr = document.createElement('tr');
    tr.className = 'data-row' + (isExp ? ' expanded' : '');
    tr.dataset.sid = sid;
    tr.appendChild(pickTd(s, cnt));
    tr.appendChild(mkTd('<span class="code">' + esc(s.code||'-') + '</span>'));
    tr.appendChild(mkTd(companyHtml(s)));
    tr.appendChild(mkTd(esc(s.title||'-')));
    tr.appendChild(mkTd('<span class="ko-text">' + esc(s.ko_desc||'-') + '</span>'));
    tr.appendChild(mkTd(badges(s)));
    tr.appendChild(mkTd(schedHtml(s)));
    tr.appendChild(mkTd(verdictHtml(s)));
    tr.addEventListener('click', function() {
      if (expanded.has(sid)) expanded.delete(sid); else expanded.add(sid);
      render();
    });
    frag.appendChild(tr);

    if (isExp) {
      // 1) 영어 abstract
      var ar = document.createElement('tr'); ar.className = 'abstract-row';
      var atd = document.createElement('td'); atd.colSpan = 8;
      atd.innerHTML = '<strong>[' + esc(s.code||'') + '] ' + esc(s.title||'') + '</strong><br><br>'
        + '<span style="color:#888;">Abstract (EN)</span><br>' + esc(s.abstract||'설명 없음');
      ar.appendChild(atd); frag.appendChild(ar);

      // 2) 한글 해석
      var kr = document.createElement('tr'); kr.className = 'abstract-row';
      var ktd = document.createElement('td'); ktd.colSpan = 8;
      ktd.innerHTML = '<span style="color:#888;">한글 해석</span><br>'
        + esc(s.ko_full||s.ko_desc||'해석 없음').replace(/\n/g, '<br>');
      kr.appendChild(ktd); frag.appendChild(kr);

      // 3) 내 분석/참석여부 편집 (로그인 시)
      var mr = document.createElement('tr'); mr.className = 'abstract-row';
      var mtd = document.createElement('td'); mtd.colSpan = 8;
      mtd.appendChild(editorFor(s));
      mr.appendChild(mtd); frag.appendChild(mr);
    }
  });

  tbody.appendChild(frag);
  document.getElementById('countLabel').textContent = list.length + '개 표시 중';
  document.getElementById('noResult').style.display = list.length === 0 ? '' : 'none';
  document.querySelectorAll('#tbl thead th').forEach(function(th, i) {
    var key = SORT_KEYS[i];
    th.className = key === sortKey ? (sortAsc ? 'sort-th-asc' : 'sort-th-desc') : '';
  });
  updateMyPicksLabel();
}

// 펼침 행의 "내 분석" 편집기
function editorFor(s) {
  var wrap = document.createElement('div');
  var m = myOf(s.sessionID);
  if (!currentUser) {
    wrap.innerHTML = '<span style="color:#888;">내 분석 — 로그인하면 참석여부와 메모를 저장할 수 있습니다.</span>'
      + (m.note ? '<br>' + linkify(esc(m.note)).replace(/\n/g,'<br>') : '');
    return wrap;
  }
  // 참석여부 토글 버튼
  var vrow = document.createElement('div');
  vrow.style.marginBottom = '6px';
  ['keep','hold','drop',''].forEach(function(v) {
    var b = document.createElement('button');
    b.className = 'vbtn' + (m.verdict === v ? ' vbtn-on v-' + (v||'none') : '');
    b.textContent = v ? V_LABEL[v] : '미검토';
    b.onclick = function(e){ e.stopPropagation(); setVerdict(s.sessionID, v); };
    vrow.appendChild(b);
  });
  wrap.appendChild(vrow);
  // 메모 textarea
  var ta = document.createElement('textarea');
  ta.className = 'note-edit';
  ta.value = m.note || '';
  ta.placeholder = '이 세션에 대한 내 분석/메모…';
  ta.onclick = function(e){ e.stopPropagation(); };
  wrap.appendChild(ta);
  var save = document.createElement('button');
  save.className = 'save-btn'; save.textContent = '💾 메모 저장';
  save.onclick = function(e){ e.stopPropagation(); setNote(s.sessionID, ta.value); };
  wrap.appendChild(save);
  return wrap;
}

function updateMyPicksLabel() {
  var cnt = Object.keys(loadPicks()).length;
  var btn = document.getElementById('btn-my-picks');
  if (btn) btn.textContent = cnt > 0 ? ('⭕ 우선순위 (' + cnt + ')') : '⭕ 우선순위';
}

/* ---------------------------------------------------------------
 * 6. 우선순위 복사 (기존 그대로)
 * ------------------------------------------------------------- */
function copyPicks(minPicks) {
  var p = loadPicks();
  var picked = ALL.filter(function(s) { return (p[s.sessionID] || 0) >= minPicks; });
  picked.sort(function(a, b) { return (p[b.sessionID]||0) - (p[a.sessionID]||0); });
  var DAY = {'Monday, Nov 30':'11/30월','Tuesday, Dec 01':'12/1화','Wednesday, Dec 02':'12/2수','Thursday, Dec 03':'12/3목','Friday, Dec 04':'12/4금'};
  var lines = picked.map(function(s) {
    var circles = PICK_ICONS[p[s.sessionID]||0] || '';
    var time = s.start_time || '시간미정';
    var day = DAY[s.day] || s.day;
    return circles + ' [' + s.code + '] ' + s.title + '\n     ' + (s.company||'') + ' | ' + day + ' ' + time + ' | ' + (s.venue||'') + '\n     ' + (s.ko_desc||'').slice(0,80);
  });
  var label = minPicks >= 2 ? '⭕⭕이상' : '전체';
  var text = '=== re:Invent 2026 우선순위 ' + label + ' (' + picked.length + '개) ===\n\n' + lines.join('\n\n');
  var btnId = minPicks >= 2 ? 'copy-btn2' : 'copy-btn';
  navigator.clipboard.writeText(text).then(function() {
    var btn = document.getElementById(btnId); var orig = btn.textContent;
    btn.textContent = '✅ 복사됨!'; setTimeout(function(){ btn.textContent = orig; }, 2000);
  }).catch(function() { prompt('아래 내용을 복사하세요 (Ctrl+A → Ctrl+C):', text); });
}

/* ---------------------------------------------------------------
 * 7. 수파베이스 — 저장/로드 (Controller → Model 개인 데이터)
 * ------------------------------------------------------------- */
function requireLogin() {
  if (!currentUser) { toast('로그인이 필요합니다.'); return false; }
  if (!sb) { toast('수파베이스 설정이 없습니다(config.js 확인).'); return false; }
  return true;
}

async function upsertMine(sid, patch) {
  if (!requireLogin()) return;
  MY[sid] = Object.assign({ pick:0, verdict:'', note:'' }, MY[sid], patch); // 낙관적 반영
  render();
  var row = {
    user_id: currentUser.id,
    session_id: sid,
    pick: MY[sid].pick,
    verdict: MY[sid].verdict || null,
    note: MY[sid].note || ''
  };
  var res = await sb.from('user_sessions')
    .upsert(row, { onConflict: 'user_id,session_id' });
  if (res.error) { toast('저장 실패: ' + res.error.message); console.error(res.error); }
}
function setPick(sid, v)    { upsertMine(sid, { pick: v }); }
function setVerdict(sid, v) { upsertMine(sid, { verdict: v }); }
function setNote(sid, t)    { upsertMine(sid, { note: t }).then(function(){ toast('메모 저장됨'); }); }

async function loadMine() {
  MY = {};
  if (!sb || !currentUser) { render(); return; }
  var res = await sb.from('user_sessions')
    .select('session_id, pick, verdict, note')
    .eq('user_id', currentUser.id);   // RLS가 어차피 본인 것만 주지만 명시
  if (res.error) { toast('불러오기 실패: ' + res.error.message); console.error(res.error); }
  else {
    (res.data || []).forEach(function(r) {
      MY[r.session_id] = { pick: r.pick||0, verdict: r.verdict||'', note: r.note||'' };
    });
  }
  render();
}

/* ---------------------------------------------------------------
 * 8. 인증 (매직링크)
 * ------------------------------------------------------------- */
async function signIn() {
  if (!sb) { toast('수파베이스 설정이 없습니다(config.js 확인).'); return; }
  var email = (document.getElementById('emailInput').value || '').trim();
  if (!email) { toast('이메일을 입력하세요.'); return; }
  var res = await sb.auth.signInWithOtp({
    email: email,
    options: { emailRedirectTo: window.location.href }
  });
  if (res.error) toast('로그인 메일 발송 실패: ' + res.error.message);
  else toast('로그인 링크를 이메일로 보냈습니다. 메일함을 확인하세요.');
}
async function signOut() {
  if (sb) await sb.auth.signOut();
  currentUser = null; MY = {};
  reflectAuth(); render();
}
function reflectAuth() {
  var box = document.getElementById('authBox');
  if (currentUser) {
    box.innerHTML = '<span class="who">' + esc(currentUser.email || '로그인됨') + '</span>'
      + '<button class="auth-btn" onclick="signOut()">로그아웃</button>';
  } else {
    box.innerHTML =
      '<input id="emailInput" type="email" placeholder="이메일(매직링크 로그인)" />' +
      '<button class="auth-btn" onclick="signIn()">로그인 링크 받기</button>';
  }
}

/* ---------------------------------------------------------------
 * 9. 토스트 + 부팅
 * ------------------------------------------------------------- */
function toast(msg) {
  var t = document.getElementById('toast');
  t.textContent = msg; t.style.opacity = '1';
  clearTimeout(toast._t);
  toast._t = setTimeout(function(){ t.style.opacity = '0'; }, 2600);
}

async function boot() {
  reflectAuth();
  render();
  if (!sb) {
    toast('수파베이스 미설정 — 열람 전용으로 동작합니다. (config.js 확인)');
    return;
  }
  var g = await sb.auth.getUser();
  currentUser = (g.data && g.data.user) || null;
  reflectAuth();
  if (currentUser) await loadMine(); else render();

  sb.auth.onAuthStateChange(function(_evt, session) {
    currentUser = session ? session.user : null;
    reflectAuth();
    if (currentUser) loadMine(); else { MY = {}; render(); }
  });
}

window.addEventListener('DOMContentLoaded', boot);
