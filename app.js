(()=> {
  'use strict';

  const VERSION = 'mkworld_8_12_fixed_20260412';
  const LS_KEY = 'mkworld:' + location.pathname;
  const MAX_TEAMS = 24;

  const SELECT_COLORS = [
    {name:'未選択', color:''},
    {name:'🔴赤', color:'#FE3C4F'},
    {name:'🔵青', color:'#498CF0'},
    {name:'🟡黄', color:'#FFF200'},
    {name:'🟢緑', color:'#57C544'},
  ];

  const AUTO_COLORS = [
    '#FE3C4F', '#498CF0', '#FFF200', '#57C544',
    '#FF7CD5', '#7BE0FF', '#FD8600', '#AD6BFF',
    '#ACF243', '#B58464', '#FFB5EC', '#CCCCCC'
  ];

  const CPU_COLOR = '#4C4C4C';
  const POINTS_12 = [15,12,10,9,8,7,6,5,4,3,2,1];
  const POINTS_24 = [15,12,10,9,9,8,8,7,7,6,6,6,5,5,5,4,4,4,3,3,3,2,2,1];

  const FORMATS = {
    12: [
      {id:'FFA', label:'FFA', teamCount:12},
      {id:'2v2', label:'2v2', teamCount:6},
      {id:'3v3', label:'3v3', teamCount:4},
      {id:'4v4', label:'4v4', teamCount:3},
      {id:'6v6', label:'6v6', teamCount:2},
    ],
    24: [
      {id:'FFA', label:'FFA', teamCount:24},
      {id:'2v2', label:'2v2', teamCount:12},
      {id:'3v3', label:'3v3', teamCount:8},
      {id:'4v4', label:'4v4', teamCount:6},
      {id:'6v6', label:'6v6', teamCount:4},
      {id:'8v8', label:'8v8', teamCount:3},
      {id:'12v12', label:'12v12', teamCount:2},
    ]
  };

  const MAXDIFF = {
    12: {FFA:14,'2v2':24,'3v3':31,'4v4':36,'6v6':40},
    24: {FFA:14,'2v2':24,'3v3':32,'4v4':38,'6v6':49,'8v8':56,'12v12':62},
  };

  const $ = (s)=> document.querySelector(s);
  const selMode = $('#selMode');
  const inpQualify = $('#inpQualify');
  const btnResetTags = $('#btnResetTags');
  const dupKeyMsg = $('#dupKeyMsg');
  const tagTables = $('#tagTables');
  const btnResetAll = $('#btnResetAll');
  const btnPin = $('#btnPin');
  const pinPreview = $('#pinPreview');
  const pinBar = $('#pinBar');
  const pinBarContent = $('#pinBarContent');
  const btnPinClose = $('#btnPinClose');
  const rankWrap = $('#rankWrap');
  const spMaxDiff = $('#spMaxDiff');
  const outMain = $('#outMain');
  const outOpt = $('#outOpt');
  const btnCopyMain = $('#btnCopyMain');
  const btnCopyOpt = $('#btnCopyOpt');
  const copyStatusMsg = $('#copyStatusMsg');
  const chkShowSum = $('#chkShowSum');
  const chkShowCert = $('#chkShowCert');
  const certText = $('#certText');
  const selView = $('#selView');
  const logAdj = $('#logAdj');
  const logCourse = $('#logCourse');
  const chkShowCourseLog = $('#chkShowCourseLog');
  const btnSpec = $('#btnSpec');
  const modalSpec = $('#modalSpec');
  const btnSpecClose = $('#btnSpecClose');

  let composingQualify = false;
  let saveTimer = null;

  const state = {
    players: 24,
    races: 12,
    mode: '6v6',
    qualify: '',
    cpuCalc: 'MKB',
    teams: [],
    cpuKey: '',
    selfTeamIndex: '0',
    cells: {},
    courses: {},
    locks: {},
    adjLog: [],
    adjSnapshots: {},
    showSum: false,
    showCert: true,
    optViewTeam: 'none',
    showCourseLog: false,
    dispMode: 'normal',
    lastUpdated: 0,
    autosaveOff: false,
  };

  function nowMs(){ return Date.now(); }
  function clamp(n,min,max){ return Math.max(min, Math.min(max,n)); }
  function fmt(){ return FORMATS[state.players].find(x=>x.id === state.mode) || FORMATS[state.players][0]; }
  function teamCount(){ return fmt().teamCount; }
  function visibleIndexes(){ return Array.from({length: teamCount()}, (_,i)=> i); }
  function hasColorSelect(count = teamCount()){ return count <= 4; }
  function teamAutoColor(i){ return AUTO_COLORS[i % AUTO_COLORS.length]; }
  function getPoints(){ return state.players === 12 ? POINTS_12 : POINTS_24; }

  function toHalfWidth(s){
    return String(s ?? '')
      .replace(/[！-～]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0))
      .replace(/　/g, ' ');
  }

  function normalizeKey(s){
    s = toHalfWidth(s).trim();
    if(!s) return '';
    s = Array.from(s)[0];
    if(/[A-Z]/.test(s)) s = s.toLowerCase();
    return s;
  }

  function sanitizeIntInput(s){
    s = toHalfWidth(String(s ?? ''));
    s = s.replace(/[^0-9+\-]/g, '');
    const m = s.match(/^([+\-]?)(\d*)/);
    if(!m) return '';
    return `${m[1] || ''}${m[2] || ''}`;
  }

  function safeParseInt(s){
    if(s === '' || s == null) return 0;
    const n = parseInt(s, 10);
    return Number.isFinite(n) ? n : 0;
  }

  function ensureTeams(){
    while(state.teams.length < MAX_TEAMS){
      state.teams.push({ id: String(state.teams.length), name:'', key:'', color:'', adj:'' });
    }
    if(state.teams.length > MAX_TEAMS) state.teams.length = MAX_TEAMS;
    state.teams.forEach((t,i)=>{ if(t.id == null) t.id = String(i); });
  }

  function scheduleSave(){
    if(state.autosaveOff) return;
    state.lastUpdated = nowMs();
    if(saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(doSave, 250);
  }

  function doSave(){
    saveTimer = null;
    if(state.autosaveOff) return;
    try{
      localStorage.setItem(LS_KEY, JSON.stringify({
        version: VERSION,
        lastUpdated: state.lastUpdated,
        players: state.players,
        races: state.races,
        mode: state.mode,
        qualify: state.qualify,
        cpuCalc: state.cpuCalc,
        teams: state.teams.map(t=>({name:t.name,key:t.key,color:t.color,adj:t.adj,id:t.id})),
        cpuKey: state.cpuKey,
        selfTeamIndex: state.selfTeamIndex,
        cells: state.cells,
        courses: state.courses,
        locks: state.locks,
        adjLog: state.adjLog,
        adjSnapshots: state.adjSnapshots,
        showSum: state.showSum,
        showCert: state.showCert,
        optViewTeam: state.optViewTeam,
        showCourseLog: state.showCourseLog,
        dispMode: state.dispMode,
      }));
    }catch(_e){
      state.autosaveOff = true;
    }
  }

  function loadSaved(){
    ensureTeams();
    try{
      const raw = localStorage.getItem(LS_KEY);
      if(!raw) return false;
      const obj = JSON.parse(raw);
      if(!obj) return false;

      state.players = obj.players ?? state.players;
      state.races = obj.races ?? state.races;
      state.mode = obj.mode ?? state.mode;
      state.qualify = obj.qualify ?? '';
      state.cpuCalc = obj.cpuCalc ?? 'MKB';
      state.cpuKey = obj.cpuKey ?? '';
      state.selfTeamIndex = String(obj.selfTeamIndex ?? '0');
      state.cells = obj.cells ?? {};
      state.courses = obj.courses ?? {};
      state.locks = obj.locks ?? {};
      state.adjLog = Array.isArray(obj.adjLog) ? obj.adjLog : [];
      state.adjSnapshots = obj.adjSnapshots && typeof obj.adjSnapshots === 'object' ? obj.adjSnapshots : {};
      state.showSum = !!obj.showSum;
      state.showCert = obj.showCert !== false;
      state.optViewTeam = obj.optViewTeam ?? 'none';
      state.showCourseLog = !!obj.showCourseLog;
      state.dispMode = obj.dispMode ?? 'normal';
      if(state.dispMode !== 'normal' && state.dispMode !== 'sumOnly') state.dispMode = 'normal';
      state.lastUpdated = obj.lastUpdated ?? 0;

      const srcTeams = Array.isArray(obj.teams) ? obj.teams : [];
      ensureTeams();
      for(let i=0;i<MAX_TEAMS;i++){
        const src = srcTeams[i] || {};
        state.teams[i].name = src.name ?? '';
        state.teams[i].key = src.key ?? '';
        state.teams[i].color = src.color ?? '';
        state.teams[i].adj = src.adj ?? '';
      }
      return true;
    }catch(_e){
      return false;
    }
  }

  function getTeamName(i){
    const nm = (state.teams[i]?.name ?? '').trim();
    return nm || `チーム${i+1}`;
  }

  function longLabel(text){
    return shouldLeftAlignLabel(text);
  }

  function buildModeOptions(){
    selMode.innerHTML = '';
    for(const f of FORMATS[state.players]){
      const opt = document.createElement('option');
      opt.value = f.id;
      opt.textContent = f.label;
      selMode.appendChild(opt);
    }
    selMode.value = state.mode;
  }

  function checkDuplicateKeys(){
    const seen = new Set();
    for(const i of visibleIndexes()){
      const key = state.teams[i].key;
      if(!key) continue;
      if(seen.has(key)){
        dupKeyMsg.textContent = '★キーが重複しているので異なるキーを設定してください';
        return false;
      }
      seen.add(key);
    }
    dupKeyMsg.textContent = '';
    return true;
  }

  function getKeyMap(){
    const map = new Map();
    for(const i of visibleIndexes()){
      const key = state.teams[i].key;
      if(key) map.set(key, i);
    }
    return map;
  }

  function currentMainBaseIdx(){
    if(!hasColorSelect()) return 0;
    const n = Number(state.selfTeamIndex);
    if(Number.isFinite(n) && n >= 0 && n < teamCount()) return n;
    return 0;
  }

  function ensureSelections(){
    if(!hasColorSelect()) state.selfTeamIndex = '0';
    const mainIdx = currentMainBaseIdx();
    state.selfTeamIndex = String(mainIdx);

    if(state.optViewTeam !== 'none'){
      const n = Number(state.optViewTeam);
      if(!Number.isFinite(n) || n < 0 || n >= teamCount()) state.optViewTeam = 'none';
    }
  }

  function splitTeamIndexes(count){
    if(count <= 12) return [Array.from({length:count}, (_,i)=> i)];
    return [
      Array.from({length:12}, (_,i)=> i),
      Array.from({length:count - 12}, (_,i)=> i + 12),
    ];
  }

  function tagBoundarySize(){
    if(state.players === 12 && state.mode === 'FFA') return 6;
    if(state.players === 24 && (state.mode === 'FFA' || state.mode === '2v2')) return 6;
    if(state.players === 24 && state.mode === '3v3') return 4;
    return 0;
  }

  function makeBoundary(td, i){
    const step = tagBoundarySize();
    if(step > 0 && i > 0 && i % step === 0) td.classList.add('teamBoundary');
  }

  function autoAlignInput(inp){
    requestAnimationFrame(()=>{
      const left = inp.scrollWidth > inp.clientWidth + 1;
      inp.classList.toggle('left', left);
    });
  }

  function shouldLeftAlignLabel(text){
    return String(text ?? '').trim().length >= 6;
  }

  function pinLayoutRule(){
    const key = `${state.players}:${state.mode}`;
    const map = {
      '12:FFA': {rows:2, groups:[3,3,3,3]},
      '12:2v2': {rows:1, groups:[3,3]},
      '12:3v3': {rows:1, groups:[4]},
      '12:4v4': {rows:1, groups:[3]},
      '12:6v6': {rows:1, groups:[2]},
      '24:FFA': {rows:2, groups:[6,6,6,6]},
      '24:2v2': {rows:2, groups:[3,3,3,3]},
      '24:3v3': {rows:1, groups:[4,4]},
      '24:4v4': {rows:1, groups:[3,3]},
      '24:6v6': {rows:1, groups:[4]},
      '24:8v8': {rows:1, groups:[3]},
      '24:12v12': {rows:1, groups:[2]},
    };
    return map[key] || {rows:1, groups:[teamCount()]};
  }

  function buildTagTables(){
    ensureSelections();
    tagTables.innerHTML = '';
    const count = teamCount();
    const colorOn = hasColorSelect(count);

    const row = document.createElement('div');
    row.className = 'tagMainRow';

    const left = document.createElement('div');
    left.className = 'tagTablesCol';

    for(const idxs of splitTeamIndexes(count)){
      const tbl = document.createElement('table');
      tbl.className = 'sheet';
      const body = document.createElement('tbody');
      const rows = [{head:'タグ', kind:'name'}];
      if(colorOn) rows.push({head:'色選択', kind:'color'});
      if(colorOn) rows.push({head:'集計基準', kind:'self'});
      rows.push({head:'キー', kind:'key'});
      rows.push({head:'点数補正', kind:'adj'});

      for(const rowDef of rows){
        const tr = document.createElement('tr');
        const th = document.createElement('th');
        th.className = 'rowHead';
        th.textContent = rowDef.head;
        tr.appendChild(th);

        for(const i of idxs){
          const td = document.createElement('td');
          makeBoundary(td, i);

          if(rowDef.kind === 'name'){
            const inp = document.createElement('input');
            inp.className = 'cellInp smalltxt';
            inp.maxLength = 12;
            inp.autocomplete = 'off';
            inp.value = state.teams[i].name || '';
            inp.addEventListener('input', ()=>{
              state.teams[i].name = inp.value;
              autoAlignInput(inp);
              buildOptViewOptions();
              refreshAfterTagChange();
            });
            td.appendChild(inp);
            autoAlignInput(inp);
          }

          if(rowDef.kind === 'color'){
            const sel = document.createElement('select');
            sel.className = 'colorSel';
            sel.tabIndex = -1;
            for(const c of SELECT_COLORS){
              const opt = document.createElement('option');
              opt.value = c.color;
              opt.textContent = c.name;
              sel.appendChild(opt);
            }
            sel.value = state.teams[i].color || '';
            sel.addEventListener('change', ()=>{
              state.teams[i].color = sel.value;
              refreshAfterTagChange();
            });
            td.appendChild(sel);
          }

          if(rowDef.kind === 'self'){
            const label = document.createElement('label');
            label.className = 'selfRadioWrap';
            const radio = document.createElement('input');
            radio.type = 'radio';
            radio.name = 'mainBaseTeam';
            radio.value = String(i);
            radio.checked = String(i) === String(currentMainBaseIdx());
            radio.addEventListener('change', ()=>{
              state.selfTeamIndex = String(i);
              recalcAll(true).then(ok=>{ if(ok) recalcOptIfNeeded(true); });
              scheduleSave();
            });
            label.appendChild(radio);
            td.appendChild(label);
          }

          if(rowDef.kind === 'key'){
            const inp = document.createElement('input');
            inp.className = 'cellInp';
            inp.maxLength = 2;
            inp.autocomplete = 'off';
            inp.value = state.teams[i].key || '';
            inp.addEventListener('input', ()=>{
              const v = normalizeKey(inp.value);
              if(inp.value !== v) inp.value = v;
              state.teams[i].key = v;
              buildOptViewOptions();
              refreshAfterTagChange();
            });
            td.appendChild(inp);
          }

          if(rowDef.kind === 'adj'){
            let composingAdj = false;
            const inp = document.createElement('input');
            inp.className = 'cellInp';
            inp.autocomplete = 'off';
            inp.inputMode = 'numeric';
            inp.value = state.teams[i].adj || '';
            const commit = ()=>{
              const prev = sanitizeIntInput(state.teams[i].adj);
              const v = sanitizeIntInput(inp.value);
              if(inp.value !== v) inp.value = v;
              state.teams[i].adj = v;
              if(prev !== v) updateAdjLogForTeam(i, prev, v);
              recalcAll(true).then(ok=>{ if(ok) recalcOptIfNeeded(true); });
              scheduleSave();
            };
            inp.addEventListener('compositionstart', ()=>{ composingAdj = true; });
            inp.addEventListener('compositionend', ()=>{ composingAdj = false; commit(); });
            inp.addEventListener('input', ()=>{ if(!composingAdj) commit(); });
            td.appendChild(inp);
          }

          tr.appendChild(td);
        }
        body.appendChild(tr);
      }
      tbl.appendChild(body);
      left.appendChild(tbl);
    }

    row.appendChild(left);

    const cpuWrap = document.createElement('div');
    cpuWrap.className = 'cpuInlineWrap';
    cpuWrap.innerHTML = `<div class="cpuSpacerBlock"></div>`;
    const cpuBox = document.createElement('div');
    cpuBox.className = 'cpuInlineBox noLabels';
    const cpuTag = document.createElement('div');
    cpuTag.className = 'cpuInlineTitle';
    cpuTag.textContent = '★CPU';
    const cpuValue = document.createElement('div');
    cpuValue.className = 'cpuInlineValue';
    const cpuInp = document.createElement('input');
    cpuInp.className = 'cellInp cpuKeyInp';
    cpuInp.maxLength = 2;
    cpuInp.autocomplete = 'off';
    cpuInp.value = state.cpuKey || '';
    cpuInp.addEventListener('input', ()=>{
      const v = normalizeKey(cpuInp.value);
      if(cpuInp.value !== v) cpuInp.value = v;
      state.cpuKey = v;
      refreshAfterTagChange();
    });
    cpuValue.appendChild(cpuInp);
    cpuBox.append(cpuTag, cpuValue);
    cpuWrap.appendChild(cpuBox);
    row.appendChild(cpuWrap);

    tagTables.appendChild(row);
    checkDuplicateKeys();
  }

  function getBadgeClasses(text){
    return longLabel(text) ? 'badgeTop left' : 'badgeTop';
  }

  function makeBadge(i){
    const badge = document.createElement('div');
    badge.className = 'badge';
    const top = document.createElement('div');
    top.className = getBadgeClasses(getTeamName(i));
    top.textContent = getTeamName(i);
    const bg = hasColorSelect() ? (state.teams[i].color || '') : teamAutoColor(i);
    if(bg){ top.style.background = bg; top.style.color = '#000'; }
    const bot = document.createElement('div');
    bot.className = 'badgeBot';
    bot.textContent = state.teams[i].key || '';
    badge.append(top, bot);
    return badge;
  }

  function makeCpuBadge(){
    const badge = document.createElement('div');
    badge.className = 'badge';
    const top = document.createElement('div');
    top.className = 'badgeTop';
    top.textContent = '★CPU';
    top.style.background = CPU_COLOR;
    top.style.color = '#fff';
    const bot = document.createElement('div');
    bot.className = 'badgeBot';
    bot.textContent = state.cpuKey || '';
    badge.append(top, bot);
    return badge;
  }

  function renderPinPreview(){
    pinPreview.innerHTML = '';
    const count = teamCount();
    const rule = pinLayoutRule();
    const groupBreaks = [];
    let acc = 0;
    for(const g of rule.groups){
      acc += g;
      if(acc < count) groupBreaks.push(acc);
    }

    if(rule.rows === 1){
      const row = document.createElement('div');
      row.className = 'pinRowLine pinRowLineNoWrap';
      for(let i=0;i<count;i++){
        if(groupBreaks.includes(i)){
          const sp = document.createElement('div');
          sp.className = 'cpuSpacer';
          row.appendChild(sp);
        }
        row.appendChild(makeBadge(i));
      }
      const sp = document.createElement('div');
      sp.className = 'cpuSpacer';
      row.appendChild(sp);
      row.appendChild(makeCpuBadge());
      pinPreview.appendChild(row);
      return;
    }

    const row1 = document.createElement('div');
    row1.className = 'pinRowLine pinRowLineNoWrap';
    const row2 = document.createElement('div');
    row2.className = 'pinRowLine';
    const half = count / 2;

    for(let i=0;i<half;i++){
      if(groupBreaks.includes(i)){
        const sp = document.createElement('div');
        sp.className = 'cpuSpacer';
        row1.appendChild(sp);
      }
      row1.appendChild(makeBadge(i));
    }
    const cpuSp = document.createElement('div');
    cpuSp.className = 'cpuSpacer';
    row1.appendChild(cpuSp);
    row1.appendChild(makeCpuBadge());

    for(let i=half;i<count;i++){
      if(groupBreaks.includes(i) && i !== half){
        const sp = document.createElement('div');
        sp.className = 'cpuSpacer';
        row2.appendChild(sp);
      }
      row2.appendChild(makeBadge(i));
    }
    pinPreview.append(row1, row2);
  }

  function buildPinBar(){
    pinBarContent.innerHTML = '';
    const clone = pinPreview.cloneNode(true);
    while(clone.firstChild) pinBarContent.appendChild(clone.firstChild);
  }

  function buildOptViewOptions(){
    const old = state.optViewTeam;
    selView.innerHTML = '';
    const none = document.createElement('option');
    none.value = 'none';
    none.textContent = '表示なし';
    selView.appendChild(none);
    for(const i of visibleIndexes()){
      const opt = document.createElement('option');
      opt.value = String(i);
      opt.textContent = getTeamName(i);
      selView.appendChild(opt);
    }
    state.optViewTeam = old;
    ensureSelections();
    selView.value = state.optViewTeam;
  }

  function getRankTd(r,p){
    return rankWrap.querySelector(`.raceCellTd[data-race="${r}"][data-pos="${p}"]`) || null;
  }

  function updateRankCellDisplay(td, r, p){
    const disp = td?.querySelector('.rankDisp');
    if(!disp) return;
    const raw = (state.cells?.[r]?.[p] ?? '').trim();
    let label = '';
    let bg = '';
    let placeholder = false;
    let left = false;
    if(!raw){
      label = String(p + 1);
      placeholder = true;
    }else if(state.cpuKey && raw === state.cpuKey){
      label = '★CPU';
      bg = CPU_COLOR;
    }else{
      const idx = getKeyMap().get(raw);
      if(idx == null){
        label = raw;
      }else{
        label = getTeamName(idx);
        bg = hasColorSelect() ? (state.teams[idx].color || '') : teamAutoColor(idx);
        left = longLabel(label);
      }
    }
    disp.textContent = label;
    disp.classList.toggle('placeholder', placeholder);
    disp.classList.toggle('left', left);
    td.style.background = placeholder ? '' : (bg || '');
  }

  function rebuildRankDisplays(){
    for(let r=0;r<state.races;r++){
      for(let p=0;p<state.players;p++){
        const td = getRankTd(r,p);
        if(td) updateRankCellDisplay(td, r, p);
      }
    }
  }

  function applyLocks(){
    for(let r=0;r<state.races;r++){
      const locked = !!state.locks[r];
      rankWrap.querySelectorAll(`.raceCellTd[data-race="${r}"]`).forEach(td=> td.classList.toggle('isLocked', locked));
      rankWrap.querySelectorAll(`input.rankKey[data-race="${r}"], input.courseInp[data-race="${r}"]`).forEach(inp=>{ inp.disabled = locked; });
      rankWrap.querySelectorAll(`.courseCell[data-race="${r}"]`).forEach(td=> td.classList.toggle('isLocked', locked));
      const btn = rankWrap.querySelector(`button.lockBtn[data-race="${r}"]`);
      if(btn) btn.textContent = locked ? '🔒' : '🔓';
    }
  }

  function focusNextCellSameRace(r, p){
    const nextPos = p + 1;
    if(nextPos >= state.players) return;
    const next = rankWrap.querySelector(`input.rankKey[data-race="${r}"][data-pos="${nextPos}"]`);
    if(next && !next.disabled) next.focus();
  }

  function countEmpties(r){
    let c = 0;
    for(let p=0;p<state.players;p++) if((state.cells?.[r]?.[p] ?? '') === '') c++;
    return c;
  }

  function allCellsFilled(r){ return countEmpties(r) === 0; }

  function markRaceError(r, msg){
    const box = rankWrap.querySelector(`.raceErrorText[data-race="${r}"]`);
    if(box) box.textContent = msg;
    rankWrap.querySelectorAll(`.raceCellTd[data-race="${r}"]`).forEach(td=> td.classList.toggle('raceError', !!msg));
  }

  function clearRaceErrors(){
    rankWrap.querySelectorAll('.raceErrorText').forEach(el=> el.textContent = '');
    rankWrap.querySelectorAll('.raceCellTd').forEach(td=> td.classList.remove('raceError'));
  }

  function buildRankTable(){
    rankWrap.innerHTML = '';
    const points = getPoints();

    const title = document.createElement('div');
    title.className = 'raceCountTitle';
    title.textContent = 'レース数';
    rankWrap.appendChild(title);

    const table = document.createElement('table');
    table.className = 'rankTable';
    const thead = document.createElement('thead');
    const trh = document.createElement('tr');

    const thRank = document.createElement('th');
    thRank.className = 'rankHeadTd rankNoHead';
    thRank.textContent = '順位';
    trh.appendChild(thRank);

    const thPts = document.createElement('th');
    thPts.className = 'rankHeadTd scoreHead';
    thPts.textContent = '得点';
    trh.appendChild(thPts);

    for(let r=0;r<state.races;r++){
      const th = document.createElement('th');
      th.className = 'rankHeadTd raceNumHead';
      if(r === 7) th.classList.add('raceSplit');
      th.textContent = String(r + 1);
      trh.appendChild(th);
    }
    thead.appendChild(trh);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    for(let p=0;p<state.players;p++){
      const tr = document.createElement('tr');

      const tdRank = document.createElement('td');
      tdRank.className = 'rankCol rankCellTd';
      tdRank.textContent = String(p + 1);
      if(state.players === 24 && p === 12) tdRank.classList.add('sepTop');
      tr.appendChild(tdRank);

      const tdPts = document.createElement('td');
      tdPts.className = 'scoreCol rankCellTd';
      tdPts.textContent = String(points[p]);
      if(state.players === 24 && p === 12) tdPts.classList.add('sepTop');
      tr.appendChild(tdPts);

      for(let r=0;r<state.races;r++){
        const td = document.createElement('td');
        td.className = 'raceCellTd rankCellTd';
        td.dataset.race = String(r);
        td.dataset.pos = String(p);
        if(state.players === 24 && p === 12) td.classList.add('sepTop');
        if(r === 7) td.classList.add('raceSplit');

        const box = document.createElement('div');
        box.className = 'rankCell';

        const inp = document.createElement('input');
        inp.className = 'rankKey';
        inp.autocomplete = 'off';
        inp.value = state.cells?.[r]?.[p] ?? '';
        inp.dataset.race = String(r);
        inp.dataset.pos = String(p);
        inp.addEventListener('focus', ()=>{ try{ inp.select(); }catch(_e){} });
        inp.addEventListener('input', async ()=>{
          const v = normalizeKey(inp.value);
          if(inp.value !== v) inp.value = v;
          if(!state.cells[r]) state.cells[r] = {};
          state.cells[r][p] = v;
          updateRankCellDisplay(td, r, p);
          const ok = await recalcAll(true);
          if(ok) recalcOptIfNeeded(true); else outOpt.textContent = '';
          scheduleSave();
        });

        const disp = document.createElement('div');
        disp.className = 'rankDisp';

        box.append(inp, disp);
        td.appendChild(box);
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    rankWrap.appendChild(table);

    const errorRow = document.createElement('div');
    errorRow.className = 'raceErrorRow';
    const lead1 = document.createElement('div');
    lead1.className = 'raceErrorLead rankLead';
    const lead2 = document.createElement('div');
    lead2.className = 'raceErrorLead scoreLead';
    errorRow.append(lead1, lead2);
    for(let r=0;r<state.races;r++){
      const div = document.createElement('div');
      div.className = 'raceErrorText';
      div.dataset.race = String(r);
      if(r === 7) div.classList.add('raceSplit');
      errorRow.appendChild(div);
    }
    rankWrap.appendChild(errorRow);

    const courseTable = document.createElement('table');
    courseTable.className = 'courseTable';
    const ctr = document.createElement('tr');
    const cth = document.createElement('th');
    cth.className = 'rankHeadTd courseHeadLabel';
    cth.textContent = 'コース名';
    ctr.appendChild(cth);
    for(let r=0;r<state.races;r++){
      const td = document.createElement('td');
      td.className = 'courseCell';
      td.dataset.race = String(r);
      if(r === 7) td.classList.add('raceSplit');
      const inp = document.createElement('input');
      inp.className = 'courseInp';
      inp.autocomplete = 'off';
      inp.value = state.courses?.[r] ?? '';
      inp.dataset.race = String(r);
      inp.addEventListener('input', async ()=>{
        state.courses[r] = inp.value;
        const ok = await recalcAll(true);
        if(ok) recalcOptIfNeeded(true); else outOpt.textContent = '';
        scheduleSave();
      });
      td.appendChild(inp);
      ctr.appendChild(td);
    }
    courseTable.appendChild(ctr);
    rankWrap.appendChild(courseTable);

    const lockRow = document.createElement('div');
    lockRow.className = 'lockRow';
    const lockLead1 = document.createElement('div');
    lockLead1.className = 'lockLead rankLead';
    const lockLead2 = document.createElement('div');
    lockLead2.className = 'lockLead scoreLead';
    lockRow.append(lockLead1, lockLead2);
    for(let r=0;r<state.races;r++){
      const cell = document.createElement('div');
      cell.className = 'lockCell';
      if(r === 7) cell.classList.add('raceSplit');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'lockBtn';
      btn.dataset.race = String(r);
      btn.textContent = state.locks[r] ? '🔒' : '🔓';
      btn.addEventListener('click', ()=>{
        state.locks[r] = !state.locks[r];
        applyLocks();
        scheduleSave();
      });
      cell.appendChild(btn);
      lockRow.appendChild(cell);
    }
    rankWrap.appendChild(lockRow);

    rebuildRankDisplays();
    applyLocks();
  }

  function currentCompletedRaceCount(){
    let c = 0;
    for(let r=0;r<state.races;r++) if(allCellsFilled(r)) c++;
    return c;
  }

  function ensureAdjLogShape(){
    if(!Array.isArray(state.adjLog)) state.adjLog = [];
    state.adjLog = state.adjLog.filter(entry=> entry && Number.isFinite(Number(entry.race)) && Array.isArray(entry.changes));
    if(!state.adjSnapshots || typeof state.adjSnapshots !== 'object') state.adjSnapshots = {};
  }

  function currentAdjRaceNo(){
    return Math.max(1, clamp(currentCompletedRaceCount(), 0, state.races));
  }

  function updateAdjLogForTeam(teamIdx, prevValue, nextValue){
    ensureAdjLogShape();
    const prev = safeParseInt(prevValue);
    const next = safeParseInt(nextValue);
    const diff = next - prev;
    if(diff === 0) return;
    const race = currentAdjRaceNo();
    const sign = diff > 0 ? `+${diff}` : String(diff);
    let entry = state.adjLog.find(x=> Number(x.race) === race);
    if(!entry){
      entry = {race, changes: []};
      state.adjLog.push(entry);
    }
    const change = entry.changes.find(x=> x.teamIdx === teamIdx);
    if(change){
      const merged = safeParseInt(change.diff) + diff;
      if(merged === 0){
        entry.changes = entry.changes.filter(x=> x !== change);
      }else{
        change.diff = merged > 0 ? `+${merged}` : String(merged);
      }
    }else{
      entry.changes.push({teamIdx, diff: sign});
    }
    state.adjLog = state.adjLog.filter(x=> x.changes.length > 0).sort((a,b)=> Number(a.race) - Number(b.race));
  }

  function hasAnyAdjInput(){
    return visibleIndexes().some(i=>{
      const v = sanitizeIntInput(state.teams[i].adj);
      return !!v && v !== '0';
    });
  }

  function renderAdjLog(){
    ensureAdjLogShape();
    logAdj.textContent = state.adjLog
      .map(entry => `${entry.race}レース目 ${entry.changes.map(change => `${getTeamName(change.teamIdx)} ${change.diff}`).join('／')}`)
      .join('\n');
  }

  function renderCourseLog(courseLog){
    if(!state.showCourseLog){
      logCourse.textContent = '';
      return;
    }
    const summary = [];
    const lines = [];
    for(let r=0;r<state.races;r++){
      const c = String(courseLog?.[r] ?? state.courses?.[r] ?? '').trim();
      if(c) summary.push(c);
      lines.push(`${r+1}レース目 ${c}`);
    }
    logCourse.textContent = `${summary.join('／')}\n\n${lines.join('\n')}`.trim();
  }

  async function copyText(text){
    try{
      await navigator.clipboard.writeText(text);
      return true;
    }catch(_e){
      try{
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(ta);
        return ok;
      }catch(_e2){
        return false;
      }
    }
  }

  let copyStatusTimer = null;

  function showCopyStatus(){
    if(copyStatusTimer) clearTimeout(copyStatusTimer);
    copyStatusMsg.textContent = '★自動コピーしました';
    copyStatusTimer = setTimeout(()=>{ copyStatusMsg.textContent = ''; }, 10000);
  }

  async function maybeAutoCopyMain(){
    const text = outMain.textContent.trim();
    if(!text) return;
    const ok = await copyText(text);
    if(ok) showCopyStatus();
  }

  function getLastCompletedCourse(courseLog, completedRaces){
    if(completedRaces <= 0) return '';
    const idx = completedRaces - 1;
    const c = String(courseLog?.[idx] ?? '').trim();
    return c || '';
  }

  function calcStandings(){
    clearRaceErrors();
    if(!checkDuplicateKeys()) return {ok:false};

    const count = teamCount();
    const points = getPoints();
    const keyMap = getKeyMap();
    const teamTotals = Array(count).fill(0);
    const raceScores = {};
    const courseLog = {};
    const requiredPerTeam = Math.floor(state.players / count);
    let hasError = false;

    for(let r=0;r<state.races;r++){
      const counts = Array(count).fill(0);
      let cpuCount = 0;
      let hasInvalid = false;
      const empties = countEmpties(r);

      for(let p=0;p<state.players;p++){
        const raw = (state.cells?.[r]?.[p] ?? '').trim();
        if(!raw) continue;
        if(state.cpuKey && raw === state.cpuKey){ cpuCount++; continue; }
        const idx = keyMap.get(raw);
        if(idx == null){ hasInvalid = true; continue; }
        counts[idx]++;
      }

      const shortages = counts.map(c=> requiredPerTeam - c);
      const overage = shortages.some(v=> v < 0);
      const shortageTeams = shortages.map((v,i)=> v > 0 ? i : -1).filter(v=> v >= 0);
      const shortageSum = shortages.reduce((a,b)=> a + Math.max(0, b), 0);
      const canAuto = cpuCount === 0 && !overage && shortageTeams.length === 1 && empties > 0 && shortageSum === empties;
      const complete = allCellsFilled(r) || canAuto;

      if(!complete) continue;

      if(overage || hasInvalid){
        markRaceError(r, '入力ミス');
        hasError = true;
        continue;
      }

      if((cpuCount > 0 || shortageSum > 0) && cpuCount !== shortageSum){
        markRaceError(r, '入力ミス');
        hasError = true;
        continue;
      }

      const teamScore = Array(count).fill(0);
      for(let p=0;p<state.players;p++){
        const raw = (state.cells?.[r]?.[p] ?? '').trim();
        let idx = null;
        if(!raw){
          if(canAuto) idx = shortageTeams[0];
        }else if(state.cpuKey && raw === state.cpuKey){
          idx = null;
        }else{
          const found = keyMap.get(raw);
          if(found != null) idx = found;
        }
        if(idx != null) teamScore[idx] += points[p];
      }

      if(shortageSum > 0){
        const cpuPoints = [];
        for(let p=0;p<state.players;p++){
          const raw = (state.cells?.[r]?.[p] ?? '').trim();
          if(state.cpuKey && raw === state.cpuKey) cpuPoints.push(points[p]);
        }
        let adopted = 0;
        if(cpuPoints.length){
          adopted = state.cpuCalc === 'MKB'
            ? Math.min(...cpuPoints)
            : Math.floor(cpuPoints.reduce((a,b)=> a+b, 0) / cpuPoints.length);
        }
        for(let i=0;i<count;i++) if(shortages[i] > 0) teamScore[i] += adopted * shortages[i];
      }

      raceScores[r] = {};
      for(let i=0;i<count;i++){
        teamTotals[i] += teamScore[i];
        raceScores[r][i] = teamScore[i];
      }
      courseLog[r] = String(state.courses?.[r] ?? '').trim();
    }

    if(hasError) return {ok:false};

    const displayTotals = visibleIndexes().map(i=> teamTotals[i] + safeParseInt(state.teams[i].adj));
    const standings = visibleIndexes().map((i,order)=> ({
      idx: i,
      name: getTeamName(i),
      total: teamTotals[i],
      displayTotal: displayTotals[order],
    })).sort((a,b)=> b.displayTotal - a.displayTotal || a.idx - b.idx);

    const completedRaces = Object.keys(raceScores).length;
    const remaining = clamp(state.races - completedRaces, 0, state.races);
    return {ok:true, standings, remaining, courseLog, completedRaces};
  }

  function formatDiff(baseTotal, otherTotal){
    const diff = baseTotal - otherTotal;
    if(diff === 0) return '±0';
    return diff > 0 ? `+${diff}` : `${diff}`;
  }

  function buildCertTextForBase(standings, remaining, baseIdx){
    const maxDiff = MAXDIFF[state.players][state.mode] ?? 0;
    const rank = standings.findIndex(x=> x.idx === baseIdx);
    if(rank < 0 || standings.length < 2) return '';
    const threshold = maxDiff * remaining;

    if(standings.length === 2){
      if(rank === 0){
        const lead = standings[0].displayTotal - standings[1].displayTotal;
        if(lead > threshold) return '勝利確定';
      }
      return '';
    }

    const q = safeParseInt(sanitizeIntInput(state.qualify));
    if(rank === 0){
      const lead = standings[0].displayTotal - standings[1].displayTotal;
      if(lead > threshold) return '1位確定';
    }
    if(q > 0 && rank < q){
      const border = standings[q];
      const mine = standings[rank];
      if(border && mine.displayTotal - border.displayTotal > threshold) return '通過確定';
    }
    return '';
  }

  function buildStandardLine(standings, remaining, baseIdx, courseName){
    const base = standings.find(s=> s.idx === baseIdx);
    if(!base) return '';
    const parts = [];
    for(const s of standings){
      if(s.idx === baseIdx){
        parts.push(`【${s.name}】 ${s.displayTotal}`);
      }else{
        const diff = formatDiff(base.displayTotal, s.displayTotal);
        if(state.showSum){
          parts.push(`${s.name} ${s.displayTotal}(${diff})`);
        }else{
          parts.push(`${s.name} ${diff}`);
        }
      }
    }
    const rank = standings.findIndex(s=> s.idx === baseIdx);
    if(rank >= 0) parts.push(`${remaining === 0 ? '最終' : '現在'}${rank+1}位`);
    if(courseName) parts.push(courseName);
    parts.push(`＠${remaining}`);
    if(hasAnyAdjInput()) parts.push('(補正込)');
    if(state.showCert){
      const cert = buildCertTextForBase(standings, remaining, baseIdx);
      if(cert) parts.push(cert);
    }
    return parts.join('／');
  }

  function buildSumOnlyLine(standings, remaining, courseName){
    const parts = standings.map((s, idx)=> `${idx+1}位 ${s.name} ${s.displayTotal}`);
    if(courseName) parts.push(courseName);
    parts.push(`＠${remaining}`);
    if(hasAnyAdjInput()) parts.push('(補正込)');
    return parts.join('／');
  }

  async function recalcAll(doLogs){
    spMaxDiff.textContent = String(MAXDIFF[state.players][state.mode] ?? '--');
    certText.textContent = '';
    const res = calcStandings();
    if(!res.ok){
      if(doLogs){ renderAdjLog(); renderCourseLog(res.courseLog || {}); }
      return false;
    }

    const courseName = getLastCompletedCourse(res.courseLog, res.completedRaces);
    if(state.dispMode === 'sumOnly'){
      outMain.textContent = buildSumOnlyLine(res.standings, res.remaining, courseName);
    }else{
      outMain.textContent = buildStandardLine(res.standings, res.remaining, currentMainBaseIdx(), courseName);
    }
    if(doLogs){ renderAdjLog(); renderCourseLog(res.courseLog); }
    await maybeAutoCopyMain();
    return true;
  }

  function recalcOptIfNeeded(doLogs){
    if(state.optViewTeam === 'none'){
      outOpt.textContent = '';
      return;
    }
    const baseIdx = Number(state.optViewTeam);
    if(!Number.isFinite(baseIdx) || baseIdx < 0 || baseIdx >= teamCount()){
      outOpt.textContent = '';
      return;
    }
    const res = calcStandings();
    if(!res.ok){
      outOpt.textContent = '';
      return;
    }
    const courseName = getLastCompletedCourse(res.courseLog, res.completedRaces);
    outOpt.textContent = buildStandardLine(res.standings, res.remaining, baseIdx, courseName);
    if(doLogs){ renderAdjLog(); renderCourseLog(res.courseLog); }
  }

  function pruneInputs(){
    const newCells = {};
    for(let r=0;r<state.races;r++){
      newCells[r] = {};
      for(let p=0;p<state.players;p++) newCells[r][p] = state.cells?.[r]?.[p] ?? '';
    }
    state.cells = newCells;
    const newCourses = {};
    for(let r=0;r<state.races;r++) newCourses[r] = state.courses?.[r] ?? '';
    state.courses = newCourses;
    const newLocks = {};
    for(let r=0;r<state.races;r++) newLocks[r] = !!state.locks?.[r];
    state.locks = newLocks;
  }

  async function refreshAfterTagChange(){
    checkDuplicateKeys();
    buildOptViewOptions();
    renderPinPreview();
    buildPinBar();
    rebuildRankDisplays();
    const ok = await recalcAll(true);
    if(ok) recalcOptIfNeeded(true); else outOpt.textContent = '';
    scheduleSave();
  }

  async function onRuleChange(){
    state.players = Number(document.querySelector('input[name="players"]:checked')?.value || 24);
    state.races = Number(document.querySelector('input[name="races"]:checked')?.value || 12);
    state.cpuCalc = String(document.querySelector('input[name="cpuCalc"]:checked')?.value || 'MKB');
    const list = FORMATS[state.players];
    if(!list.some(x=> x.id === state.mode)) state.mode = list[0].id;
    buildModeOptions();
    ensureSelections();
    pruneInputs();
    buildTagTables();
    buildOptViewOptions();
    buildRankTable();
    renderPinPreview();
    buildPinBar();
    const ok = await recalcAll(true);
    if(ok) recalcOptIfNeeded(true);
    scheduleSave();
  }

  function resetTags(){
    for(let i=0;i<MAX_TEAMS;i++){
      state.teams[i].name = '';
      state.teams[i].key = '';
      state.teams[i].color = '';
      state.teams[i].adj = '';
    }
    state.cpuKey = '';
    state.selfTeamIndex = '0';
    state.adjLog = [];
    state.adjSnapshots = {};
    buildOptViewOptions();
    refreshAfterTagChange();
  }

  async function resetAll(){
    for(let r=0;r<state.races;r++){
      state.cells[r] = {};
      for(let p=0;p<state.players;p++) state.cells[r][p] = '';
      state.courses[r] = '';
      state.locks[r] = false;
    }
    for(let i=0;i<MAX_TEAMS;i++) state.teams[i].adj = '';
    state.adjLog = [];
    state.adjSnapshots = {};
    buildTagTables();
    buildRankTable();
    renderPinPreview();
    buildPinBar();
    const ok = await recalcAll(true);
    if(ok) recalcOptIfNeeded(true); else outOpt.textContent = '';
    scheduleSave();
  }

  function openModal(){ modalSpec.classList.remove('hidden'); modalSpec.setAttribute('aria-hidden', 'false'); }
  function closeModal(){ modalSpec.classList.add('hidden'); modalSpec.setAttribute('aria-hidden', 'true'); }

  function init(){
    const restored = loadSaved();
    ensureTeams();

    document.querySelectorAll('input[name="players"]').forEach(r=>{
      r.checked = Number(r.value) === state.players;
      r.addEventListener('change', onRuleChange);
    });
    document.querySelectorAll('input[name="races"]').forEach(r=>{
      r.checked = Number(r.value) === state.races;
      r.addEventListener('change', onRuleChange);
    });
    document.querySelectorAll('input[name="cpuCalc"]').forEach(r=>{
      r.checked = r.value === state.cpuCalc;
      r.addEventListener('change', onRuleChange);
    });

    buildModeOptions();
    selMode.value = state.mode;
    selMode.addEventListener('change', ()=>{ state.mode = selMode.value; onRuleChange(); });

    inpQualify.value = state.qualify || '';
    inpQualify.addEventListener('compositionstart', ()=>{ composingQualify = true; });
    inpQualify.addEventListener('compositionend', async ()=>{
      composingQualify = false;
      const v = sanitizeIntInput(inpQualify.value);
      if(inpQualify.value !== v) inpQualify.value = v;
      state.qualify = v;
      const ok = await recalcAll(true);
      if(ok) recalcOptIfNeeded(true);
      scheduleSave();
    });
    inpQualify.addEventListener('input', async ()=>{
      if(composingQualify) return;
      const v = sanitizeIntInput(inpQualify.value);
      if(inpQualify.value !== v) inpQualify.value = v;
      state.qualify = v;
      const ok = await recalcAll(true);
      if(ok) recalcOptIfNeeded(true);
      scheduleSave();
    });

    document.querySelectorAll('input[name="dispMode"]').forEach(r=>{
      r.checked = r.value === state.dispMode;
      r.addEventListener('change', async ()=>{
        state.dispMode = document.querySelector('input[name="dispMode"]:checked')?.value || 'normal';
        const ok = await recalcAll(true);
        if(ok) recalcOptIfNeeded(true); else outOpt.textContent = '';
        scheduleSave();
      });
    });

    btnResetTags.addEventListener('click', resetTags);
    btnResetAll.addEventListener('click', resetAll);

    btnCopyMain.addEventListener('click', async ()=>{
      await copyText(outMain.textContent);
    });
    btnCopyOpt.addEventListener('click', async ()=>{ await copyText(outOpt.textContent); });

    chkShowSum.checked = state.showSum;
    chkShowCert.checked = state.showCert;
    chkShowCourseLog.checked = state.showCourseLog;

    chkShowSum.addEventListener('change', async ()=>{
      state.showSum = chkShowSum.checked;
      const ok = await recalcAll(true);
      if(ok) recalcOptIfNeeded(true);
      scheduleSave();
    });
    chkShowCert.addEventListener('change', async ()=>{
      state.showCert = chkShowCert.checked;
      const ok = await recalcAll(true);
      if(ok) recalcOptIfNeeded(true);
      scheduleSave();
    });
    chkShowCourseLog.addEventListener('change', async ()=>{
      state.showCourseLog = chkShowCourseLog.checked;
      const ok = await recalcAll(true);
      if(ok) recalcOptIfNeeded(true);
      scheduleSave();
    });

    buildOptViewOptions();
    selView.addEventListener('change', ()=>{
      state.optViewTeam = selView.value;
      recalcOptIfNeeded(true);
      scheduleSave();
    });

    btnPin.addEventListener('click', showPin);
    btnPinClose.addEventListener('click', hidePin);
    btnSpec.addEventListener('click', openModal);
    btnSpecClose.addEventListener('click', closeModal);
    modalSpec.querySelector('.modalBack')?.addEventListener('click', closeModal);

    ensureSelections();
    buildTagTables();
    buildOptViewOptions();
    buildRankTable();
    renderPinPreview();
    buildPinBar();
    recalcAll(true).then(ok=>{ if(ok) recalcOptIfNeeded(true); });

    if(!restored){ state.lastUpdated = nowMs(); doSave(); }
  }

  init();
})();
