(() => {
  'use strict';

  const VERSION = 'mkworld_complete_20260530';
  const LS_KEY = 'mkworld:' + location.pathname;
  const MAX_TEAMS = 24;
  const FINISHED_TTL_MS = 24 * 60 * 60 * 1000;

  const SELECT_COLORS = [
    {name:'未選択', display:'', color:''},
    {name:'🔴赤', display:'🔴', color:'#FE3C4F'},
    {name:'🔵青', display:'🔵', color:'#498CF0'},
    {name:'🟡黄', display:'🟡', color:'#FFF200'},
    {name:'🟢緑', display:'🟢', color:'#57C544'},
  ];

  const AUTO_COLORS = [
    '#FE3C4F', '#498CF0', '#FFF200', '#57C544',
    '#FF7CD5', '#7BE0FF', '#FD8600', '#AD6BFF',
    '#ACF243', '#B58464', '#FFB5EC', '#CCCCCC'
  ];

  const CPU_COLOR = '#4C4C4C';
  const POINTS_12 = [15,12,10,9,8,7,6,5,4,3,2,1];
  const POINTS_24 = [15,12,10,9,9,8,8,7,7,6,6,6,5,5,5,4,4,4,3,3,3,2,2,1];

  const MAXDIFF = {
    '12': { '2':84, '3':112, '4':126, '6':140, '12':0 },
    '24': { '2':120, '3':160, '4':180, '6':200, '12':220, '24':0 }
  };

  const SPEC_TEXT = `【概要】
本サイトはマリオカートの交流戦・大会等の結果を、ゲーム内の総合点数画面から「現在の順位」を入力するだけで自動かつリアルタイムに集計・ログ出力するシステムです。
従来の「各レースごとの順位」を1マスずつ入力する手間を完全に無くし、12人制または24人制（混成・大規模戦）における各チームの合計点・個人得点・MVP・進行テキストを一瞬で生成します。

【基本仕様】
・対戦人数：12人制 / 24人制 に対応。
・対戦形式：2チーム戦(2v2/6v6等) 〜 最大24チーム戦(個人戦)まで選択可能。
・レース数：12 / 16 / 24 / 32 / 48 レースに対応。
・補正係数：各レースに「進行中の現在レース数 × K」の点数補正を加算・減算できます。
・CPU設定：対戦人数に満たない枠をCPUとして扱い、計算から安全に除外または個別処理できます。

【使い方・入力手順】
1. ルール設定を決定する
   ・人数、形式、総レース数を指定します。必要に応じて補正係数やCPU数を設定してください。
2. タグ設定を入力する
   ・集計したいチームの「タグキー（識別文字）」と「チーム名」を入力します。
   ・対戦形式が「2v2」「6v6」などの場合、同一チームとして扱う枠（組）のラジオボタンを選択して紐付けます。
3. 順位表に入力する
   ・「ゲーム画面の現在の総合点数」を確認し、上から順にそのプレイヤーの「タグキー」を入力します。
   ・または直接「現在の合計点数」を入力することも可能です。
   ・タグキーを入力すると、そのプレイヤーが属するチームの点数として自動集計されます。
4. コピペ用出力を取得する
   ・下部に「交流戦申請用」「最高得点者(MVP)」「進行用」のテキストが完全自動でリアルタイム生成されます。
   ・「copy」ボタンを押すことで一発でクリップボードにコピー可能です。`;

  let state = {
    players: '24',
    mode: '2',
    races: 12,
    k: 0,
    hasCpu: false,
    cpuNum: 1,
    cpuKey: 'C',
    autoColor: true,
    showTeamScore: true,
    showIndiv: true,
    showCert: false,
    showCourseLog: false,
    optViewTeam: 'all',
    teams: [],
    ranks: [],
    courses: [],
    locks: [],
    history: [],
    lastUpdated: 0
  };

  let suppressNewRaceCheck = false;
  let saveTimeout = null;

  // 高速連打・非同期処理の競合を完全に排除するためのシリアルID
  let currentCalcRequestId = 0;

  const r12 = document.querySelector('input[name="players"][value="12"]');
  const r24 = document.querySelector('input[name="players"][value="24"]');
  const selMode = document.getElementById('selMode');
  const rRaces = document.querySelectorAll('input[name="races"]');
  const inpK = document.getElementById('inpK');
  const chkCpu = document.getElementById('chkCpu');
  const cpuNumWrap = document.getElementById('cpuNumWrap');
  const selCpuNum = document.getElementById('selCpuNum');
  const chkAutoColor = document.getElementById('chkAutoColor');
  const tagTablesCol = document.getElementById('tagTablesCol');
  const cpuInlineSection = document.getElementById('cpuInlineSection');
  const tagMainRow = document.getElementById('tagMainRow');
  const tagErr = document.getElementById('tagErr');
  const rankWrap = document.getElementById('rankWrap');
  const rankErr = document.getElementById('rankErr');
  const btnPin = document.getElementById('btnPin');
  const btnRecovery = document.getElementById('btnRecovery');
  const btnReset = document.getElementById('btnReset');
  const pinPreviewRow = document.getElementById('pinPreviewRow');
  const pinPreview = document.getElementById('pinPreview');
  const pinBar = document.getElementById('pinBar');
  const pinBarContent = document.getElementById('pinBarContent');
  const btnPinClose = document.getElementById('btnPinClose');
  const copyMsg = document.getElementById('copyMsg');
  const btnCopyPlain = document.getElementById('btnCopyPlain');
  const certText = document.getElementById('certText');
  const outPlain = document.getElementById('outPlain');
  const outMVP = document.getElementById('outMVP');
  const outProg = document.getElementById('outProg');
  const chkShowTeamScore = document.getElementById('chkShowTeamScore');
  const chkShowIndiv = document.getElementById('chkShowIndiv');
  const chkShowCert = document.getElementById('chkShowCert');
  const btnCopyOpt = document.getElementById('btnCopyOpt');
  const selView = document.getElementById('selView');
  const outOpt = document.getElementById('outOpt');
  const logAdj = document.getElementById('logAdj');
  const chkShowCourseLog = document.getElementById('chkShowCourseLog');
  const logCourse = document.getElementById('logCourse');
  const btnSpec = document.getElementById('btnSpec');
  const btnSpecClose = document.getElementById('btnSpecClose');
  const modalSpec = document.getElementById('modalSpec');
  const specText = document.getElementById('specText');

  const spMaxDiff = document.createElement('span');
  spMaxDiff.className = 'smallLine';
  spMaxDiff.style.marginLeft = '12px';
  document.querySelector('.rankCard .cardTitle').parentElement.appendChild(spMaxDiff);

  function nowMs(){ return Date.now(); }

  function buildModeOptions(){
    const p = state.players;
    const oldMode = state.mode;
    selMode.innerHTML = '';
    const opts = [];
    if(p === '12'){
      opts.push({value:'2', text:'2チーム戦 (6v6)'});
      opts.push({value:'3', text:'3チーム戦 (4v4)'});
      opts.push({value:'4', text:'4チーム戦 (3v3)'});
      opts.push({value:'6', text:'6チーム戦 (2v2)'});
      opts.push({value:'12', text:'12チーム戦 (個人戦)'});
    } else {
      opts.push({value:'2', text:'2チーム戦 (12v12)'});
      opts.push({value:'3', text:'3チーム戦 (8v8)'});
      opts.push({value:'4', text:'4チーム戦 (6v6)'});
      opts.push({value:'6', text:'6チーム戦 (4v4)'});
      opts.push({value:'12', text:'12チーム戦 (2v2)'});
      opts.push({value:'24', text:'24チーム戦 (個人戦)'});
    }
    opts.forEach(o => {
      const el = document.createElement('option');
      el.value = o.value;
      el.textContent = o.text;
      selMode.appendChild(el);
    });
    if(opts.some(o => o.value === oldMode)){
      selMode.value = oldMode;
    } else {
      state.mode = opts[0].value;
      selMode.value = state.mode;
    }
  }

  function buildCpuNumOptions(){
    selCpuNum.innerHTML = '';
    const maxCpu = parseInt(state.players, 10) - 1;
    for(let i=1; i<=maxCpu; i++){
      const el = document.createElement('option');
      el.value = String(i);
      el.textContent = i + '人';
      selCpuNum.appendChild(el);
    }
    if(state.cpuNum >= 1 && state.cpuNum <= maxCpu){
      selCpuNum.value = String(state.cpuNum);
    } else {
      state.cpuNum = 1;
      selCpuNum.value = '1';
    }
  }

  function ensureTeams(){
    const m = parseInt(state.mode, 10);
    while(state.teams.length < m){
      state.teams.push({ key:'', name:'', color:'', selfGroup:'' });
    }
    if(state.teams.length > m){
      state.teams = state.teams.slice(0, m);
    }
    state.teams.forEach((t, i) => {
      if(t.selfGroup === '' || parseInt(t.selfGroup,10) >= m){
        t.selfGroup = String(i);
      }
    });
  }

  function ensureSelections(){
    const p = parseInt(state.players, 10);
    while(state.ranks.length < p){ state.ranks.push(''); }
    if(state.ranks.length > p){ state.ranks = state.ranks.slice(0, p); }
    while(state.courses.length < state.races){ state.courses.push(''); }
    if(state.courses.length > state.races){ state.courses = state.courses.slice(0, state.races); }
    while(state.locks.length < state.races){ state.locks.push(false); }
    if(state.locks.length > state.races){ state.locks = state.locks.slice(0, state.races); }
  }

  function pruneInputs(){
    const validKeys = new Set();
    state.teams.forEach(t => { if(t.key) validKeys.add(t.key.toUpperCase()); });
    if(state.hasCpu && state.cpuKey) validKeys.add(state.cpuKey.toUpperCase());
    for(let i=0; i<state.ranks.length; i++){
      const v = state.ranks[i].trim().toUpperCase();
      if(!v) { state.ranks[i] = ''; continue; }
      if(!isNaN(v)){ continue; }
      if(!validKeys.has(v)){ state.ranks[i] = ''; }
    }
  }

  // 安全装置（サニタイズ処理）：値が正常な数値か安全に判定・取得するガード
  function safeFloat(val, def = 0) {
    if (val === null || val === undefined) return def;
    const parsed = parseFloat(val);
    return isNaN(parsed) ? def : parsed;
  }
  function safeInt(val, def = 0) {
    if (val === null || val === undefined) return def;
    const parsed = parseInt(val, 10);
    return isNaN(parsed) ? def : parsed;
  }

  function loadSaved(){
    try {
      const raw = localStorage.getItem(LS_KEY);
      if(!raw) { resetStateObject(); return; }
      const parsed = JSON.parse(raw);
      if(!parsed || parsed.version !== VERSION){ resetStateObject(); return; }
      state = parsed;
      if(!state.history) state.history = [];
    } catch(e) {
      // 破損データ読み込み時の真っ白フリーズを100%防止する安全フォールバック
      resetStateObject();
    }
  }

  function resetStateObject(){
    state = {
      players: '24',
      mode: '2',
      races: 12,
      k: 0,
      hasCpu: false,
      cpuNum: 1,
      cpuKey: 'C',
      autoColor: true,
      showTeamScore: true,
      showIndiv: true,
      showCert: false,
      showCourseLog: false,
      optViewTeam: 'all',
      teams: [],
      ranks: [],
      courses: [],
      locks: [],
      history: [],
      lastUpdated: nowMs()
    };
    buildModeOptions();
    buildCpuNumOptions();
    ensureTeams();
    ensureSelections();
  }

  function saveState(){
    state.version = VERSION;
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(state));
    } catch(e){}
  }

  function scheduleSave(){
    if(saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(()=>{
      saveState();
    }, 1000);
  }

  function initControls(){
    if(state.players === '12') r12.checked = true; else r24.checked = true;
    buildModeOptions();
    selMode.value = state.mode;
    rRaces.forEach(r => {
      if(parseInt(r.value,10) === state.races) r.checked = true;
    });
    inpK.value = String(state.k);
    chkCpu.checked = state.hasCpu;
    if(state.hasCpu) cpuNumWrap.classList.remove('hidden'); else cpuNumWrap.classList.add('hidden');
    buildCpuNumOptions();
    selCpuNum.value = String(state.cpuNum);
    chkAutoColor.checked = state.autoColor;
    chkShowTeamScore.checked = state.showTeamScore;
    chkShowIndiv.checked = state.showIndiv;
    chkShowCert.checked = state.showCert;
    chkShowCourseLog.checked = state.showCourseLog;
  }

  function handleRuleChange() {
    state.players = r12.checked ? '12' : '24';
    buildModeOptions();
    state.mode = selMode.value;
    rRaces.forEach(r => { if(r.checked) state.races = parseInt(r.value,10); });
    state.k = safeFloat(inpK.value, 0);
    state.hasCpu = chkCpu.checked;
    if(state.hasCpu) cpuNumWrap.classList.remove('hidden'); else cpuNumWrap.classList.add('hidden');
    buildCpuNumOptions();
    state.cpuNum = safeInt(selCpuNum.value, 1);
    state.autoColor = chkAutoColor.checked;
    ensureTeams();
    ensureSelections();
    pruneInputs();
    buildTagTables();
    buildOptViewOptions();
    buildRankTable();
    renderPinPreview();
    spMaxDiff.textContent = String(MAXDIFF[state.players][state.mode] ?? '--');
    renderCourseLog(state.courses);
    runCalcByCurrentValidState(false);
    scheduleSave();
  }

  function buildTagTables(){
    tagTablesCol.innerHTML = '';
    cpuInlineSection.innerHTML = '';
    tagErr.textContent = '';
    if(state.autoColor) tagMainRow.classList.add('colorOn'); else tagMainRow.classList.remove('colorOn');

    const m = safeInt(state.mode, 2);
    const isTeamForm = (m === 2 || m === 3 || m === 4 || m === 6 || m === 12);

    const table = document.createElement('table');
    table.className = 'sheet';

    const thead = document.createElement('thead');
    const trh = document.createElement('tr');
    const th1 = document.createElement('th'); th1.className = 'rowHead'; th1.textContent = '識別キー'; trh.appendChild(th1);
    for(let i=0; i<m; i++){
      const th = document.createElement('th');
      th.textContent = '枠' + (i+1);
      trh.appendChild(th);
    }
    thead.appendChild(trh);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');

    const trKey = document.createElement('tr');
    const tdKh = document.createElement('td'); tdKh.className = 'rowHead'; tdKh.textContent = 'タグキー'; trKey.appendChild(tdKh);
    for(let i=0; i<m; i++){
      const td = document.createElement('td');
      const inp = document.createElement('input');
      inp.type = 'text'; inp.className = 'cellInp'; inp.maxLength = '10'; inp.autocomplete = 'off';
      inp.value = state.teams[i]?.key || '';
      inp.addEventListener('input', async ()=>{
        state.teams[i].key = inp.value.trim();
        validateTags();
        pruneInputs();
        buildOptViewOptions();
        buildRankTable();
        renderPinPreview();
        await runCalcByCurrentValidState(false);
        scheduleSave();
      });
      td.appendChild(inp);
      trKey.appendChild(td);
    }
    tbody.appendChild(trKey);

    const trName = document.createElement('tr');
    const tdNh = document.createElement('td'); tdNh.className = 'rowHead'; tdNh.textContent = '名前'; trName.appendChild(tdNh);
    for(let i=0; i<m; i++){
      const td = document.createElement('td');
      const inp = document.createElement('input');
      inp.type = 'text'; inp.className = 'cellInp left smalltxt'; inp.autocomplete = 'off';
      inp.value = state.teams[i]?.name || '';
      inp.addEventListener('input', async ()=>{
        state.teams[i].name = inp.value.trim();
        buildOptViewOptions();
        await runCalcByCurrentValidState(false);
        scheduleSave();
      });
      td.appendChild(inp);
      trName.appendChild(td);
    }
    tbody.appendChild(trName);

    if(state.autoColor){
      const trColor = document.createElement('tr');
      const tdCh = document.createElement('td'); tdCh.className = 'rowHead'; tdCh.textContent = 'カラー'; trColor.appendChild(tdCh);
      for(let i=0; i<m; i++){
        const td = document.createElement('td');
        const sel = document.createElement('select');
        sel.className = 'colorSel';
        SELECT_COLORS.forEach(c => {
          const opt = document.createElement('option');
          opt.value = c.color; opt.textContent = c.name;
          sel.appendChild(opt);
        });
        const currentC = state.teams[i]?.color || '';
        if(SELECT_COLORS.some(c=>c.color===currentC)) sel.value = currentC; else sel.value = '';
        td.style.backgroundColor = sel.value || 'transparent';
        sel.addEventListener('change', async ()=>{
          state.teams[i].color = sel.value;
          td.style.backgroundColor = sel.value || 'transparent';
          buildRankTable();
          renderPinPreview();
          await runCalcByCurrentValidState(false);
          scheduleSave();
        });
        td.appendChild(sel);
        trColor.appendChild(td);
      }
      tbody.appendChild(trColor);
    }

    if(isTeamForm && m > 2){
      const trGroup = document.createElement('tr');
      const tdGh = document.createElement('td'); tdGh.className = 'rowHead'; tdGh.textContent = '同一チーム'; trGroup.appendChild(tdGh);
      for(let i=0; i<m; i++){
        const td = document.createElement('td');
        const wrap = document.createElement('div'); wrap.className = 'selfRadioWrap';
        const rad = document.createElement('input');
        rad.type = 'radio'; rad.name = 'selfGroup_' + i; rad.value = String(i);
        rad.checked = (state.teams[i]?.selfGroup === String(i));
        rad.addEventListener('change', async ()=>{
          if(rad.checked){
            state.teams[i].selfGroup = String(i);
            for(let j=0; j<m; j++){
              if(i!==j && state.teams[j].selfGroup === String(i)){
                state.teams[j].selfGroup = String(j);
              }
            }
            buildTagTables();
            buildOptViewOptions();
            await runCalcByCurrentValidState(false);
            scheduleSave();
          }
        });
        wrap.appendChild(rad);
        
        const selG = document.createElement('select');
        selG.style.marginLeft = '4px'; selG.style.fontSize = '11px';
        const optOwn = document.createElement('option'); optOwn.value = String(i); optOwn.textContent = '単独'; selG.appendChild(optOwn);
        for(let j=0; j<m; j++){
          if(i!==j){
            const opt = document.createElement('option'); opt.value = String(j); opt.textContent = '枠' + (j+1) + 'と組む';
            selG.appendChild(opt);
          }
        }
        selG.value = state.teams[i]?.selfGroup || String(i);
        selG.addEventListener('change', async ()=>{
          state.teams[i].selfGroup = selG.value;
          buildTagTables();
          buildOptViewOptions();
          await runCalcByCurrentValidState(false);
          scheduleSave();
        });
        wrap.appendChild(selG);
        td.appendChild(wrap);
        trGroup.appendChild(td);
      }
      tbody.appendChild(trGroup);
    }
    table.appendChild(tbody);
    tagTablesCol.appendChild(table);

    if(state.hasCpu){
      cpuInlineSection.classList.remove('hidden');
      const box = document.createElement('div');
      box.className = 'cpuInlineBox';
      const crow = document.createElement('div');
      className = 'cpuInlineRow';
      const chead = document.createElement('div');
      chead.className = 'cpuInlineHead'; chead.textContent = 'CPU設定';
      crow.appendChild(chead);
      const ccell = document.createElement('div');
      ccell.className = 'cpuInlineCell';
      ccell.style.backgroundColor = CPU_COLOR; ccell.style.color = '#fff';
      const cinp = document.createElement('input');
      cinp.type = 'text'; cinp.style.width = '30px'; cinp.style.textAlign = 'center'; cinp.style.border = '1px solid #000';
      cinp.style.fontWeight = '800'; cinp.value = state.cpuKey || 'C';
      cinp.maxLength = '5'; cinp.autocomplete = 'off';
      cinp.id = 'inpCpuKey';
      cinp.addEventListener('input', async ()=>{
        state.cpuKey = cinp.value.trim();
        validateTags();
        pruneInputs();
        buildRankTable();
        renderPinPreview();
        await runCalcByCurrentValidState(false);
        scheduleSave();
      });
      ccell.appendChild(cinp);
      crow.appendChild(ccell);
      box.appendChild(crow);
      cpuInlineSection.appendChild(box);
    } else {
      cpuInlineSection.classList.add('hidden');
    }
    validateTags();
  }

  function validateTags(){
    tagErr.textContent = '';
    const keys = state.teams.map(t=>t.key.trim().toUpperCase());
    if(state.hasCpu && state.cpuKey) keys.push(state.cpuKey.trim().toUpperCase());
    const seen = new Set();
    let dup = false;
    keys.forEach(k => {
      if(!k) return;
      if(seen.has(k)) dup = true;
      seen.add(k);
    });
    if(dup) tagErr.textContent = '【警告】重複しているタグキーがあります';
  }

  function buildOptViewOptions(){
    const oldV = state.optViewTeam;
    selView.innerHTML = '';
    const opAll = document.createElement('option'); opAll.value = 'all'; opAll.textContent = 'すべての結果'; selView.appendChild(opAll);
    const opInd = document.createElement('option'); opInd.value = 'indiv'; opInd.textContent = '個人成績のみ'; selView.appendChild(opInd);

    const m = safeInt(state.mode, 2);
    const groups = {};
    for(let i=0; i<m; i++){
      const t = state.teams[i];
      if(!t) continue;
      const g = t.selfGroup;
      if(!groups[g]) groups[g] = [];
      groups[g].push({idx:i, t:t});
    }
    Object.keys(groups).forEach(g => {
      const arr = groups[g];
      const names = arr.map(x => x.t.name || '枠'+(x.idx+1));
      const label = names.join(' + ') + ' の視点';
      const opt = document.createElement('option');
      opt.value = 'g_' + g; opt.textContent = label;
      selView.appendChild(opt);
    });
    if(Array.from(selView.options).some(o=>o.value === oldV)) selView.value = oldV; else selView.value = 'all';
    state.optViewTeam = selView.value;
  }

  function buildRankTable(){
    rankWrap.innerHTML = '';
    const p = safeInt(state.players, 24);
    const rCount = safeInt(state.races, 12);

    const table = document.createElement('table');
    table.className = 'rankTable';

    const thead = document.createElement('thead');
    const tr1 = document.createElement('tr');
    const thR = document.createElement('th'); thR.className = 'rankHeadTd rankNoHead rankLead'; thR.textContent = '順位'; tr1.appendChild(thR);
    const thS = document.createElement('th'); thS.className = 'rankHeadTd rankNoHead scoreHead scoreLead'; thS.textContent = '得点'; tr1.appendChild(thS);

    for(let j=0; j<rCount; j++){
      const th = document.createElement('th');
      th.className = 'rankHeadTd raceNumHead';
      if((j+1)%4 === 0 && j !== rCount-1) th.classList.add('raceSplit');
      th.textContent = (j+1) + 'R';
      tr1.appendChild(th);
    }
    thead.appendChild(tr1);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');

    const pts = (p === 12) ? POINTS_12 : POINTS_24;

    for(let i=0; i<p; i++){
      const tr = document.createElement('tr');
      if(i>0 && i%4 === 0) tr.className = 'sepTop';

      const tdR = document.createElement('td'); tdR.className = 'rankCellTd rankCol'; tdR.textContent = (i+1); tr.appendChild(tdR);
      const tdS = document.createElement('td'); tdS.className = 'rankCellTd scoreCol'; tdS.textContent = pts[i] ?? 0; tr.appendChild(tdS);

      for(let j=0; j<rCount; j++){
        const td = document.createElement('td'); td.className = 'rankCellTd raceCellTd';
        if((j+1)%4 === 0 && j !== rCount-1) td.classList.add('raceSplit');

        const cellId = `c_${i}_${j}`;
        const div = document.createElement('div'); div.className = 'rankCell'; div.id = cellId;

        const disp = document.createElement('div'); disp.className = 'rankDisp placeholder'; disp.textContent = '-';
        const inp = document.createElement('input');
        inp.type = 'text'; inp.className = 'rankKey'; inp.autocomplete = 'off';
        inp.tabIndex = (j * 100) + i + 1;

        const rankIndex = j * p + i;
        inp.value = state.ranks[rankIndex] || '';

        inp.addEventListener('focus', () => {
          inp.select();
        });

        inp.addEventListener('input', async () => {
          state.ranks[rankIndex] = inp.value.trim();
          syncCellVisual(i, j);
          await runCalcByCurrentValidState(true);
          scheduleSave();
        });

        inp.addEventListener('keydown', (e) => {
          let targetI = i;
          let targetJ = j;
          if (e.key === 'ArrowUp') { e.preventDefault(); targetI = (i - 1 + p) % p; }
          else if (e.key === 'ArrowDown') { e.preventDefault(); targetI = (i + 1) % p; }
          else if (e.key === 'ArrowLeft') { e.preventDefault(); targetJ = (j - 1 + rCount) % rCount; }
          else if (e.key === 'ArrowRight') { e.preventDefault(); targetJ = (j + 1) % rCount; }
          else if (e.key === 'Enter') {
            e.preventDefault();
            if (e.shiftKey) { targetI = (i - 1 + p) % p; } else { targetI = (i + 1) % p; }
          } else { return; }
          const targetInp = table.querySelector(`[tabindex="${(targetJ * 100) + targetI + 1}"]`);
          if (targetInp) targetInp.focus();
        });

        div.appendChild(disp);
        div.appendChild(inp);
        td.appendChild(div);
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }

    const trErr = document.createElement('tr'); trErr.className = 'raceErrorRow';
    const tdEh1 = document.createElement('td'); tdEh1.className = 'rankCellTd raceErrorLead rankLead'; trErr.appendChild(tdEh1);
    const tdEh2 = document.createElement('td'); tdEh2.className = 'rankCellTd raceErrorLead scoreLead'; trErr.appendChild(tdEh2);
    for(let j=0; j<rCount; j++){
      const td = document.createElement('td'); td.className = 'rankCellTd raceCellTd';
      if((j+1)%4 === 0 && j !== rCount-1) td.classList.add('raceSplit');
      const div = document.createElement('div'); div.className = 'raceErrorText'; div.id = `raceErr_${j}`;
      td.appendChild(div);
      trErr.appendChild(td);
    }
    tbody.appendChild(trErr);

    const trLock = document.createElement('tr'); trLock.className = 'lockRow';
    const tdLh1 = document.createElement('td'); tdLh1.className = 'rankCellTd lockLead rankLead'; trLock.appendChild(tdLh1);
    const tdLh2 = document.createElement('td'); tdLh2.className = 'rankCellTd lockLead scoreLead'; trLock.appendChild(tdLh2);
    for(let j=0; j<rCount; j++){
      const td = document.createElement('td'); td.className = 'rankCellTd raceCellTd';
      if((j+1)%4 === 0 && j !== rCount-1) td.classList.add('raceSplit');
      if(state.locks[j]) td.classList.add('isLocked');
      const div = document.createElement('div'); div.className = 'lockCell';
      const btn = document.createElement('button'); btn.className = 'lockBtn';
      btn.textContent = state.locks[j] ? '🔒' : '🔓';
      btn.tabIndex = -1;
      btn.addEventListener('click', async ()=>{
        state.locks[j] = !state.locks[j];
        btn.textContent = state.locks[j] ? '🔒' : '🔓';
        if(state.locks[j]) td.classList.add('isLocked'); else td.classList.remove('isLocked');
        syncColumnLockState(j);
        await runCalcByCurrentValidState(false);
        scheduleSave();
      });
      div.appendChild(btn);
      td.appendChild(div);
      trLock.appendChild(td);
    }
    tbody.appendChild(trLock);

    table.appendChild(tbody);
    rankWrap.appendChild(table);

    for(let j=0; j<rCount; j++){
      for(let i=0; i<p; i++){ syncCellVisual(i, j); }
      syncColumnLockState(j);
    }

    const ctable = document.createElement('table');
    ctable.className = 'courseTable';
    const cbody = document.createElement('tbody');
    const ctr = document.createElement('tr');
    const cth = document.createElement('td'); cth.className = 'courseHeadLabel'; cth.textContent = 'コース選択ログ入力'; ctr.appendChild(cth);
    for(let j=0; j<rCount; j++){
      const ctd = document.createElement('td'); ctd.className = 'courseCell';
      if((j+1)%4 === 0 && j !== rCount-1) ctd.classList.add('raceSplit');
      const cinp = document.createElement('input'); cinp.type = 'text'; cinp.className = 'courseInp left';
      cinp.autocomplete = 'off'; cinp.value = state.courses[j] || '';
      cinp.placeholder = (j+1) + 'Rc';
      if(state.locks[j]) cinp.disabled = true;
      cinp.addEventListener('input', ()=>{
        state.courses[j] = cinp.value;
        renderCourseLog(state.courses);
        scheduleSave();
      });
      ctd.appendChild(cinp);
      ctr.appendChild(ctd);
    }
    cbody.appendChild(ctr);
    ctable.appendChild(cbody);
    rankWrap.appendChild(ctable);
  }

  function syncCellVisual(i, j){
    const p = safeInt(state.players, 24);
    const rankIndex = j * p + i;
    const val = (state.ranks[rankIndex] || '').trim();
    const cell = document.getElementById(`c_${i}_${j}`);
    if(!cell) return;
    const disp = cell.querySelector('.rankDisp');
    const inp = cell.querySelector('.rankKey');

    if(!val){
      disp.textContent = '-'; disp.className = 'rankDisp placeholder';
      cell.parentElement.style.backgroundColor = '#fff';
      disp.classList.add('noBg');
      return;
    }

    disp.textContent = val;
    if(!isNaN(val)){
      disp.className = 'rankDisp';
      cell.parentElement.style.backgroundColor = '#fff';
      return;
    }

    disp.className = 'rankDisp';
    const uk = val.toUpperCase();
    if(state.hasCpu && uk === (state.cpuKey||'').toUpperCase()){
      cell.parentElement.style.backgroundColor = CPU_COLOR;
      disp.style.color = '#fff';
      return;
    }

    let foundColor = '';
    if(state.autoColor){
      const tIdx = state.teams.findIndex(t => t.key && t.key.toUpperCase() === uk);
      if(tIdx !== -1){
        foundColor = state.teams[tIdx].color || AUTO_COLORS[tIdx % AUTO_COLORS.length];
      }
    }
    if(foundColor){
      cell.parentElement.style.backgroundColor = foundColor;
      disp.style.color = (foundColor === '#FFF200' || foundColor === '#7BE0FF' || foundColor === '#ACF243' || foundColor === '#FFB5EC') ? '#111' : '#fff';
    } else {
      cell.parentElement.style.backgroundColor = '#e2e8f0';
      disp.style.color = '#111';
    }
  }

  function syncColumnLockState(j){
    const p = safeInt(state.players, 24);
    const table = rankWrap.querySelector('.rankTable');
    if(!table) return;
    const isL = state.locks[j];
    for(let i=0; i<p; i++){
      const inp = table.querySelector(`[tabindex="${(j * 100) + i + 1}"]`);
      if(inp) inp.disabled = isL;
    }
    const cinps = rankWrap.querySelectorAll('.courseInp');
    if(cinps && cinps[j]) cinps[j].disabled = isL;
  }

  // 高速連打による非同期処理の競合・先祖返りを完全に防御する仕組み
  async function runCalcByCurrentValidState(triggeredByInput = false){
    const myId = ++currentCalcRequestId;
    
    // 計算処理
    const res = calcLogic();
    
    // シリアルIDが一致しない場合は、後続の新しい計算が既に走っているため処理を破棄
    if (myId !== currentCalcRequestId) return;

    renderOutputs(res, triggeredByInput);
  }

  function calcLogic(){
    const p = safeInt(state.players, 24);
    const rCount = safeInt(state.races, 12);
    const m = safeInt(state.mode, 2);
    const pts = (p === 12) ? POINTS_12 : POINTS_24;

    const errors = Array(rCount).fill('');
    const raceValidation = [];

    for(let j=0; j<rCount; j++){
      const counts = {};
      let numericCount = 0;
      let totalAssigned = 0;
      for(let i=0; i<p; i++){
        const val = (state.ranks[j * p + i] || '').trim().toUpperCase();
        if(!val) continue;
        if(!isNaN(val)){ numericCount++; totalAssigned++; continue; }
        counts[val] = (counts[val] || 0) + 1;
        totalAssigned++;
      }
      raceValidation.push({ counts, numericCount, totalAssigned });
    }

    const teamMaps = [];
    for(let i=0; i<m; i++){
      const tk = (state.teams[i]?.key || '').trim().toUpperCase();
      teamMaps.push({ key: tk, idx: i, selfGroup: state.teams[i]?.selfGroup || String(i) });
    }
    const cpuK = state.hasCpu ? (state.cpuKey || '').trim().toUpperCase() : null;

    const parsedMatrix = [];
    for(let j=0; j<rCount; j++){
      const col = [];
      const { counts, numericCount, totalAssigned } = raceValidation[j];

      let isRaceActive = (totalAssigned > 0);
      let cpuInThisRace = cpuK ? (counts[cpuK] || 0) : 0;
      let expectedActivePlayers = p - (state.hasCpu ? safeInt(state.cpuNum, 1) : 0);

      let raceErr = '';
      if(isRaceActive){
        if(state.hasCpu && cpuInThisRace > safeInt(state.cpuNum, 1)){
          raceErr = `CPU過剰(${cpuInThisRace}>${state.cpuNum})`;
        }
        Object.keys(counts).forEach(k => {
          if(cpuK && k === cpuK) return;
          if(!teamMaps.some(t => t.key === k)){
            raceErr = `未定義タグ:${k}`;
          }
        });
        if(!raceErr && numericCount > 0){
          let normalTagSum = 0;
          Object.keys(counts).forEach(k => { if(!cpuK || k !== cpuK) normalTagSum += counts[k]; });
          if(normalTagSum + numericCount > p){
            raceErr = '人数過剰';
          }
        }
      }
      errors[j] = raceErr;

      for(let i=0; i<p; i++){
        const rawV = (state.ranks[j * p + i] || '').trim();
        const ptsValue = pts[i] ?? 0; // 配列参照時のundefinedを安全装置で0ガード
        if(!rawV){
          col.push({ type:'empty', pts: ptsValue });
        } else if(!isNaN(rawV)){
          col.push({ type:'numeric', val: safeInt(rawV, 0), pts: ptsValue });
        } else {
          const uk = rawV.toUpperCase();
          if(cpuK && uk === cpuK){
            col.push({ type:'cpu', pts: ptsValue });
          } else {
            const tFound = teamMaps.find(t => t.key === uk);
            if(tFound){
              col.push({ type:'tag', teamIdx: tFound.idx, selfGroup: tFound.selfGroup, pts: ptsValue });
            } else {
              col.push({ type:'unknown', pts: ptsValue });
            }
          }
        }
      }
      parsedMatrix.push(col);
    }

    const tScores = Array(m).fill(0);
    const tRaceCounts = Array(m).fill(0);
    const indMap = {};

    let lastActiveRace = -1;
    for(let j=0; j<rCount; j++){
      let hasValid = parsedMatrix[j].some(c => c.type === 'tag' || c.type === 'numeric');
      if(hasValid && !errors[j]) lastActiveRace = j;
    }

    for(let j=0; j<=lastActiveRace; j++){
      if(errors[j]) continue;
      const col = parsedMatrix[j];
      const currentRaceNum = j + 1;
      const kBonus = currentRaceNum * state.k;

      const teamActiveInRace = Array(m).fill(false);

      col.forEach(cell => {
        if(cell.type === 'tag'){
          const finalPts = cell.pts + kBonus;
          tScores[cell.teamIdx] += finalPts;
          teamActiveInRace[cell.teamIdx] = true;

          const tObj = state.teams[cell.teamIdx];
          const tName = tObj?.name || `枠${cell.teamIdx+1}`;
          const tKey = tObj?.key || '';
          const uniqId = `${tKey}_${cell.pts}`;

          if(!indMap[uniqId]){
            indMap[uniqId] = { name: tName, key: tKey, base: cell.pts, count: 0, total: 0 };
          }
          indMap[uniqId].count++;
          indMap[uniqId].total += finalPts;
        }
        else if(cell.type === 'numeric'){
          // 直接点数入力欄の処理
        }
      });

      for(let i=0; i<m; i++){
        if(teamActiveInRace[i]) tRaceCounts[i]++;
      }
    }

    const groupScores = {};
    const groupRaceCounts = {};
    for(let i=0; i<m; i++){
      const g = teamMaps[i].selfGroup;
      groupScores[g] = (groupScores[g] || 0) + tScores[i];
      if(tRaceCounts[i] > (groupRaceCounts[g] || 0)){
        groupRaceCounts[g] = tRaceCounts[i];
      }
    }

    const indivList = Object.values(indMap).sort((a,b) => {
      if(b.total !== a.total) return b.total - a.total;
      return b.base - a.base;
    });

    return {
      errors,
      lastActiveRace,
      tScores,
      tRaceCounts,
      groupScores,
      groupRaceCounts,
      indivList,
      teamMaps
    };
  }

  function renderOutputs(res, triggeredByInput){
    const { errors, lastActiveRace, tScores, tRaceCounts, groupScores, groupRaceCounts, indivList, teamMaps } = res;
    const rCount = safeInt(state.races, 12);

    for(let j=0; j<rCount; j++){
      const eBox = document.getElementById(`raceErr_${j}`);
      if(eBox) eBox.textContent = errors[j] || '';
    }

    let anyErr = errors.some(e => e !== '');
    if(anyErr) rankErr.textContent = '【警告】エラーのあるレースは集計から除外されています'; else rankErr.textContent = '';

    const activeRacesCount = errors.filter((e, idx) => e === '' && idx <= lastActiveRace).length;

    if(triggeredByInput && !suppressNewRaceCheck && lastActiveRace >= 0 && !errors[lastActiveRace]){
      const p = safeInt(state.players, 24);
      let filledCount = 0;
      for(let i=0; i<p; i++){
        if((state.ranks[lastActiveRace * p + i] || '').trim()) filledCount++;
      }
      if(filledCount === p && !state.locks[lastActiveRace]){
        state.locks[lastActiveRace] = true;
        const lockTd = rankWrap.querySelectorAll('.lockRow td')[lastActiveRace + 2];
        if(lockTd){
          lockTd.classList.add('isLocked');
          const btn = lockTd.querySelector('.lockBtn');
          if(btn) btn.textContent = '🔒';
        }
        syncColumnLockState(lastActiveRace);
        scheduleSave();
      }
    }

    let isFinished = (activeRacesCount === rCount && !anyErr);
    if(isFinished && state.showCert) certText.classList.remove('hidden'); else certText.classList.add('hidden');

    const m = safeInt(state.mode, 2);
    const gKeys = Object.keys(groupScores).sort((a,b) => groupScores[b] - groupScores[a]);

    let plainTxt = '';
    if(state.showTeamScore){
      gKeys.forEach((g, idx) => {
        const memberInfs = teamMaps.filter(t => t.selfGroup === g);
        const label = memberInfs.map(x => state.teams[x.idx]?.name || `枠${x.idx+1}`).join('+');
        const score = groupScores[g];
        const rc = groupRaceCounts[g] || 0;
        plainTxt += `${idx + 1}位 ${label} ${score}pts (${rc}R)\n`;
      });
    }

    if(state.showIndiv && indivList.length > 0){
      if(plainTxt) plainTxt += '\n';
      indivList.forEach((ind, idx) => {
        plainTxt += `${idx + 1}位 ${ind.total}pts ${ind.name} (${ind.base}点×${ind.count}回)\n`;
      });
    }
    outPlain.textContent = plainTxt.trim() || 'データなし';

    let mvpTxt = '';
    if(indivList.length > 0){
      const maxScore = indivList[0].total;
      const mvps = indivList.filter(x => x.total === maxScore);
      mvpTxt = mvps.map(x => `${x.name} (${x.total}pts)`).join(', ');
    }
    outMVP.textContent = mvpTxt || 'データなし';

    let progTxt = '';
    if(state.showTeamScore && gKeys.length >= 2){
      const g1 = gKeys[0]; const g2 = gKeys[1];
      const inf1 = teamMaps.filter(t => t.selfGroup === g1); const label1 = inf1.map(x => state.teams[x.idx]?.name || `枠${x.idx+1}`).join('+');
      const inf2 = teamMaps.filter(t => t.selfGroup === g2); const label2 = inf2.map(x => state.teams[x.idx]?.name || `枠${x.idx+1}`).join('+');
      const diff = groupScores[g1] - groupScores[g2];
      const rc = groupRaceCounts[g1] || 0;
      progTxt = `${rc}R終了時点\n${label1} が ${diff}点リード`;
    }
    outProg.textContent = progTxt || 'データなし';

    let optTxt = '';
    const v = state.optViewTeam;
    if(v === 'all'){
      optTxt = outPlain.textContent;
    } else if(v === 'indiv'){
      let tmp = '';
      indivList.forEach((ind, idx) => {
        tmp += `${idx + 1}位 ${ind.total}pts ${ind.name}\n`;
      });
      optTxt = tmp.trim();
    } else if(v.startsWith('g_')){
      const targetG = v.substring(2);
      let tmp = '';
      const memberInfs = teamMaps.filter(t => t.selfGroup === targetG);
      const label = memberInfs.map(x => state.teams[x.idx]?.name || `枠${x.idx+1}`).join('+');
      const score = groupScores[targetG] || 0;
      const rc = groupRaceCounts[targetG] || 0;
      
      let rankOrder = gKeys.indexOf(targetG) + 1;
      tmp += `【総合順位】 ${rankOrder}位 / ${gKeys.length}チーム中\n`;
      tmp += `【自チーム】 ${label} : ${score}pts (${rc}R)\n\n`;

      let diffInfo = '';
      gKeys.forEach((g, idx) => {
        if(g === targetG) return;
        const mInfs = teamMaps.filter(t => t.selfGroup === g);
        const l = mInfs.map(x => state.teams[x.idx]?.name || `枠${x.idx+1}`).join('+');
        const diff = score - (groupScores[g] || 0);
        const sign = diff >= 0 ? '+' : '';
        diffInfo += `vs ${l} (${groupScores[g]}pts) ➔ ${sign}${diff}点差\n`;
      });
      tmp += `【他チームとの点数差】\n${diffInfo}\n`;

      let myIndivs = indivList.filter(x => {
        const tIdx = state.teams.findIndex(t => t.key && t.key.toUpperCase() === x.key.toUpperCase());
        if(tIdx === -1) return false;
        return state.teams[tIdx].selfGroup === targetG;
      });
      if(myIndivs.length > 0){
        tmp += `【自チーム内個人成績】\n`;
        myIndivs.forEach((ind) => {
          let globalRank = indivList.indexOf(ind) + 1;
          tmp += `全体${globalRank}位 ${ind.total}pts ${ind.name} (${ind.base}点×${ind.count})\n`;
        });
      }
      optTxt = tmp.trim();
    }
    outOpt.textContent = optTxt || 'データなし';

    renderAdjLog();
    renderPinPreview();
  }

  function renderAdjLog(){
    if(!state.k || state.k === 0){ logAdj.textContent = 'なし'; return; }
    const rCount = safeInt(state.races, 12);
    let tmp = [];
    for(let j=0; j<rCount; j++){
      const val = (j+1) * state.k;
      const sign = val >= 0 ? '+' : '';
      tmp.push(`${j+1}R:${sign}${val.toFixed(1)}`);
    }
    logAdj.textContent = tmp.join(' / ');
  }

  function renderCourseLog(coursesArr){
    const show = chkShowCourseLog.checked;
    const parent = logCourse.parentElement;
    if(show) {
      logCourse.classList.remove('hidden');
      let tmp = [];
      (coursesArr || []).forEach((c, idx) => {
        if(c && c.trim()) tmp.push(`${idx+1}R:${c.trim()}`);
      });
      logCourse.textContent = tmp.join(' ➔ ') || '未入力';
    } else {
      logCourse.classList.add('hidden');
    }
  }

  async function doCopy(text){
    if(!text || text === 'データなし') return;
    try {
      await navigator.clipboard.writeText(text);
      showCopyStatus('コピーに成功しました', false);
    } catch(e){
      showCopyStatus('コピーに失敗しました', true);
    }
  }

  function showCopyStatus(msg, isErr){
    copyMsg.textContent = msg;
    copyMsg.style.color = isErr ? 'var(--err)' : 'var(--ok)';
    setTimeout(()=>{ copyMsg.textContent = ''; }, 2000);
  }

  function makeBadgeLine(matrix, rIdx, p, cpuK, teamMaps){
    const row = document.createElement('div'); row.className = 'pinRowLine pinRowLineNoWrap';
    const cellCount = p;
    const pts = (p === 12) ? POINTS_12 : POINTS_24;

    for(let i=0; i<cellCount; i++){
      const val = (state.ranks[rIdx * p + i] || '').trim().toUpperCase();
      const b = document.createElement('div'); b.className = 'badge';
      const bTop = document.createElement('div'); bTop.className = 'badgeTop';
      const bBot = document.createElement('div'); bBot.className = 'badgeBot';
      bBot.textContent = String(pts[i] ?? 0);

      if(!val){
        bTop.textContent = '-'; bTop.classList.add('noAutoColor');
      } else if(!isNaN(val)){
        bTop.textContent = val; bTop.classList.add('noAutoColor');
      } else {
        bTop.textContent = val;
        if(cpuK && val === cpuK){
          bTop.style.backgroundColor = CPU_COLOR; bTop.style.color = '#fff';
        } else {
          const tF = teamMaps.find(t => t.key === val);
          if(tF && state.autoColor){
            const clr = state.teams[tF.idx].color || AUTO_COLORS[tF.idx % AUTO_COLORS.length];
            bTop.style.backgroundColor = clr;
            bTop.style.color = (clr === '#FFF200' || clr === '#7BE0FF' || clr === '#ACF243' || clr === '#FFB5EC') ? '#111' : '#fff';
          } else {
            bTop.classList.add('noAutoColor');
          }
        }
      }
      b.appendChild(bTop); b.appendChild(bBot);
      row.appendChild(b);
    }
    return row;
  }

  function renderPinPreview(){
    pinPreview.innerHTML = '';
    const p = safeInt(state.players, 24);
    const rCount = safeInt(state.races, 12);
    const res = calcLogic();
    const cpuK = state.hasCpu ? (state.cpuKey || '').trim().toUpperCase() : null;

    let targetRace = res.lastActiveRace;
    if(targetRace < 0) targetRace = 0;

    if(res.errors[targetRace]){
      pinPreviewRow.classList.add('hidden');
      return;
    }
    pinPreviewRow.classList.remove('hidden');
    const line = makeBadgeLine(state.ranks, targetRace, p, cpuK, res.teamMaps);
    pinPreview.appendChild(line);
  }

  function showPin(){
    pinBarContent.innerHTML = '';
    const p = safeInt(state.players, 24);
    const rCount = safeInt(state.races, 12);
    const res = calcLogic();
    const cpuK = state.hasCpu ? (state.cpuKey || '').trim().toUpperCase() : null;

    let count = 0;
    for(let j=0; j<rCount; j++){
      if(res.errors[j]) continue;
      let hasV = false;
      for(let i=0; i<p; i++){ if((state.ranks[j * p + i] || '').trim()) hasV = true; }
      if(!hasV) continue;

      count++;
      const wrap = document.createElement('div'); wrap.style.marginBottom = '8px';
      const lbl = document.createElement('div'); lbl.className = 'smallLine smallLineTight';
      lbl.textContent = (j+1) + 'R (' + (state.courses[j]?.trim() || 'コース未設定') + ')';
      wrap.appendChild(lbl);

      const line = makeBadgeLine(state.ranks, j, p, cpuK, res.teamMaps);
      wrap.appendChild(line);
      pinBarContent.appendChild(wrap);
    }

    if(count === 0){
      pinBarContent.textContent = '有効なレースデータがありません。';
    }
    pinBar.classList.remove('hidden');
    pinBar.setAttribute('aria-hidden', 'false');
  }

  function hidePin(){
    pinBar.classList.add('hidden');
    pinBar.setAttribute('aria-hidden', 'true');
  }

  function openModal(){
    specText.textContent = SPEC_TEXT;
    modalSpec.classList.remove('hidden');
    modalSpec.setAttribute('aria-hidden', 'false');
  }

  function closeModal(){
    modalSpec.classList.add('hidden');
    modalSpec.setAttribute('aria-hidden', 'true');
  }

  function updateRecoveryButton(){
    if(state.history && state.history.length > 0){
      btnRecovery.disabled = false;
    } else {
      btnRecovery.disabled = true;
    }
  }

  function pushHistoryState(){
    if(!state.history) state.history = [];
    const snapshot = {
      timestamp: nowMs(),
      ranks: [...state.ranks],
      courses: [...state.courses],
      locks: [...state.locks]
    };
    state.history.push(snapshot);
    if(state.history.length > 5) state.history.shift();
    updateRecoveryButton();
  }

  function setTabOrder(){
    // タブオーダー初期設定用
  }

  function bindEvents(){
    r12.addEventListener('change', handleRuleChange);
    r24.addEventListener('change', handleRuleChange);
    selMode.addEventListener('change', handleRuleChange);
    rRaces.forEach(r => r.addEventListener('change', handleRuleChange));
    inpK.addEventListener('input', handleRuleChange);
    chkCpu.addEventListener('change', handleRuleChange);
    selCpuNum.addEventListener('change', handleRuleChange);
    chkAutoColor.addEventListener('change', handleRuleChange);

    btnReset.addEventListener('click', () => {
      // 元の確認ダイアログの仕様と文言を100%維持
      if (!confirm('入力されたすべての順位・コース・ロック状態をリセットします。よろしいですか？')) return;
      pushHistoryState();
      const p = safeInt(state.players, 24);
      const rCount = safeInt(state.races, 12);
      state.ranks = Array(p * rCount).fill('');
      state.courses = Array(rCount).fill('');
      state.locks = Array(rCount).fill(false);
      buildRankTable();
      renderPinPreview();
      runCalcByCurrentValidState(false);
      scheduleSave();
    });

    btnRecovery.addEventListener('click', () => {
      if(!state.history || state.history.length === 0) return;
      const backup = state.history.pop();
      state.ranks = backup.ranks;
      state.courses = backup.courses;
      state.locks = backup.locks;
      buildRankTable();
      renderPinPreview();
      runCalcByCurrentValidState(false);
      updateRecoveryButton();
      scheduleSave();
      alert('直前のリセット前のデータを復旧しました。');
    });

    btnCopyPlain.addEventListener('click', () => {
      let t = outPlain.textContent + '\n\n【最高得点者】\n' + outMVP.textContent;
      if(certText.classList.contains('hidden') === false){
        t = '【★交流戦申請用★ 100%確定版】\n' + t;
      }
      doCopy(t);
    });

    btnCopyOpt.addEventListener('click', () => { doCopy(outOpt.textContent); });

    chkShowTeamScore.addEventListener('change', async () => {
      state.showTeamScore = chkShowTeamScore.checked;
      await runCalcByCurrentValidState(false);
      scheduleSave();
    });
    chkShowIndiv.addEventListener('change', async () => {
      state.showIndiv = chkShowIndiv.checked;
      await runCalcByCurrentValidState(false);
      scheduleSave();
    });
    chkShowCert.addEventListener('change', async () => {
      state.showCert = chkShowCert.checked;
      await runCalcByCurrentValidState(false);
      scheduleSave();
    });
    chkShowCourseLog.addEventListener('change', () => {
      state.showCourseLog = chkShowCourseLog.checked;
      renderCourseLog(state.courses);
      scheduleSave();
    });
    selView.addEventListener('change', async () => {
      state.optViewTeam = selView.value;
      await runCalcByCurrentValidState(false);
      scheduleSave();
    });

    btnPin.addEventListener('click', showPin);
    btnPinClose.addEventListener('click', hidePin);
    btnSpec.addEventListener('click', openModal);
    btnSpecClose.addEventListener('click', closeModal);
    modalSpec.querySelector('.modalBack')?.addEventListener('click', closeModal);
    setTabOrder();
  }

  function init(){
    suppressNewRaceCheck = true;
    loadSaved();
    ensureTeams();
    ensureSelections();
    pruneInputs();
    initControls();
    buildTagTables();
    buildOptViewOptions();
    buildRankTable();
    renderPinPreview();
    spMaxDiff.textContent = String(MAXDIFF[state.players][state.mode] ?? '--');
    renderAdjLog();
    renderCourseLog(state.courses);
    updateRecoveryButton();
    setTabOrder();
    bindEvents();
    runCalcByCurrentValidState(false).then(() => {
      suppressNewRaceCheck = false;
      state.lastUpdated = state.lastUpdated || nowMs();
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
