(()=> {
  'use strict';

  const VERSION = 'mkworld_complete_20260530';
  const LS_KEY = 'mkworld:' + location.pathname;
  const MAX_TEAMS = 24;
  const FINISHED_TTL_MS = 24 * 60 * 60 * 1000;

  const SELECT_COLORS = [\n    {name:'未選択', display:'', color:''},\n    {name:'🔴赤', display:'🔴', color:'#FE3C4F'},\n    {name:'🔵青', display:'🔵', color:'#498CF0'},\n    {name:'🟡黄', display:'🟡', color:'#FFF200'},\n    {name:'🟢緑', display:'🟢', color:'#57C544'},\n  ];

  const AUTO_COLORS = [
    '#FE3C4F', '#498CF0', '#FFF200', '#57C544',
    '#FF7CD5', '#7BE0FF', '#FD8600', '#AD6BFF',
    '#ACF243', '#B58464', '#FFB5EC', '#CCCCCC'
  ];

  const CPU_COLOR = '#4C4C4C';
  const POINTS_12 = [15,12,10,9,8,7,6,5,4,3,2,1];
  const POINTS_24 = [15,12,10,9,9,8,8,7,7,6,6,6,5,5,5,4,4,4,3,3,3,2,2,1];

  const MAXDIFF = {
    '12': { '2':80, '3':105, '4':120, '6':135 },
    '24': { '2':160, '3':210, '4':240, '6':270, '8':285, '12':300 }
  };

  const MODES = {
    '12': [
      { value:'2', text:'2人×6形式 (2v2v2v2v2v2)' },
      { value:'3', text:'3人×4形式 (3v3v3v3)' },
      { value:'4', text:'4人×3形式 (4v4v4)' },
      { value:'6', text:'6人×2形式 (6v6)' }
    ],
    '24': [
      { value:'2', text:'2人×12形式 (2v12)' },
      { value:'3', text:'3人×8形式 (3v8)' },
      { value:'4', text:'4人×6形式 (4v6)' },
      { value:'6', text:'6人×4形式 (6v4)' },
      { value:'8', text:'8人×3形式 (8v3)' },
      { value:'12', text:'12人×2形式 (12v12)' }
    ]
  };

  const KEY_MAP = {
    '1':'1', '2':'2', '3':'3', '4':'4', '5':'5', '6':'6', '7':'7', '8':'8', '9':'9',
    '0':'10', '00':'10', '-':'11', '^':'12'
  };

  let state = {
    players: '24',
    mode: '6',
    races: '12',
    selfTeam: 'A',
    cpuTeam: 'none',
    useColor: true,
    sortTag: true,
    showCert: false,
    showCourseLog: false,
    optViewTeam: 'all',
    teams: [],
    ranks: {},
    courses: {},
    locks: {},
    history: [],
    lastUpdated: 0
  };

  let suppressNewRaceCheck = false;
  let saveTimeout = null;

  const selMode = document.getElementById('selMode');
  const selSelfTeam = document.getElementById('selSelfTeam');
  const selCpuTeam = document.getElementById('selCpuTeam');
  const chkUseColor = document.getElementById('chkUseColor');
  const chkSortTag = document.getElementById('chkSortTag');
  const chkShowCert = document.getElementById('chkShowCert');
  const chkShowCourseLog = document.getElementById('chkShowCourseLog');
  const selView = document.getElementById('selView');
  const btnRecovery = document.getElementById('btnRecovery');
  const btnReset = document.getElementById('btnReset');
  const btnCopyPlain = document.getElementById('btnCopyPlain');
  const btnCopyOpt = document.getElementById('btnCopyOpt');
  const btnPin = document.getElementById('btnPin');
  const btnPinClose = document.getElementById('btnPinClose');
  const pinBar = document.getElementById('pinBar');
  const pinBarContent = document.getElementById('pinBarContent');
  const btnSpec = document.getElementById('btnSpec');
  const btnSpecClose = document.getElementById('btnSpecClose');
  const modalSpec = document.getElementById('modalSpec');
  const errMain = document.getElementById('errMain');
  const copyStatusMsg = document.getElementById('copyStatusMsg');
  const outPlain = document.getElementById('outPlain');
  const outOpt = document.getElementById('outOpt');
  const logAdj = document.getElementById('logAdj');
  const logCourse = document.getElementById('logCourse');
  const spMaxDiff = document.getElementById('spMaxDiff');
  const tagMainRow = document.getElementById('tagMainRow');
  const tagTables = document.getElementById('tagTables');
  const cpuInlineWrap = document.getElementById('cpuInlineWrap');
  const rankWrap = document.getElementById('rankWrap');
  const pinPreview = document.getElementById('pinPreview');

  function nowMs(){ return Date.now(); }

  function cloneState(s){
    return JSON.parse(JSON.stringify(s));
  }

  function pushHistory(){
    state.lastUpdated = nowMs();
    state.history.push({
      ranks: JSON.parse(JSON.stringify(state.ranks)),
      courses: JSON.parse(JSON.stringify(state.courses)),
      locks: JSON.parse(JSON.stringify(state.locks))
    });
    if(state.history.length > 50) state.history.shift();
    updateRecoveryButton();
  }

  function updateRecoveryButton(){
    btnRecovery.disabled = (state.history.length === 0);
  }

  function scheduleSave(){
    if(saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(saveToLocalStorage, 1000);
  }

  function saveToLocalStorage(){
    try {
      const dataToSave = cloneState(state);
      dataToSave.history = [];
      localStorage.setItem(LS_KEY, JSON.stringify(dataToSave));
    }catch(e){}
  }

  function loadSaved(){
    try {
      const raw = localStorage.getItem(LS_KEY);
      if(!raw) return;
      const parsed = JSON.parse(raw);
      if(!parsed || typeof parsed !== 'object') return;
      if(parsed.lastUpdated && nowMs() - parsed.lastUpdated > FINISHED_TTL_MS){
        return;
      }
      if(parsed.players) state.players = parsed.players;
      if(parsed.mode) state.mode = parsed.mode;
      if(parsed.races) state.races = parsed.races;
      if(parsed.selfTeam) state.selfTeam = parsed.selfTeam;
      if(parsed.cpuTeam) state.cpuTeam = parsed.cpuTeam;
      if(parsed.hasOwnProperty('useColor')) state.useColor = parsed.useColor;
      if(parsed.hasOwnProperty('sortTag')) state.sortTag = parsed.sortTag;
      if(parsed.hasOwnProperty('showCert')) state.showCert = parsed.showCert;
      if(parsed.hasOwnProperty('showCourseLog')) state.showCourseLog = parsed.showCourseLog;
      if(parsed.optViewTeam) state.optViewTeam = parsed.optViewTeam;
      if(Array.isArray(parsed.teams)) state.teams = parsed.teams;
      if(parsed.ranks) state.ranks = parsed.ranks;
      if(parsed.courses) state.courses = parsed.courses;
      if(parsed.locks) state.locks = parsed.locks;
    }catch(e){}
  }

  function ensureTeams(){
    const pCount = parseInt(state.players, 10);
    const tSize = parseInt(state.mode, 10);
    const numTeams = pCount / tSize;
    const currentNum = state.teams.length;
    if(currentNum < numTeams){
      for(let i=currentNum; i<numTeams; i++){
        const letter = String.fromCharCode(65 + i);
        state.teams.push({
          letter: letter,
          tag: '',
          colorIdx: 0
        });
      }
    }else if(currentNum > numTeams){
      state.teams = state.teams.slice(0, numTeams);
    }
  }

  function ensureSelections(){
    const pCount = parseInt(state.players, 10);
    const totalRaces = parseInt(state.races, 10);
    for(let r=1; r<=totalRaces; r++){
      if(!state.ranks[r]) state.ranks[r] = {};
      if(!state.courses[r]) state.courses[r] = '';
      if(!state.locks[r]) state.locks[r] = false;
      for(let p=1; p<=pCount; p++){
        if(!state.ranks[r][p]) state.ranks[r][p] = '';
      }
    }
  }

  function pruneInputs(){
    const pCount = parseInt(state.players, 10);
    const totalRaces = parseInt(state.races, 10);
    for(const rKey in state.ranks){
      if(parseInt(rKey,10) > totalRaces){
        delete state.ranks[rKey];
        delete state.courses[rKey];
        delete state.locks[rKey];
        continue;
      }
      for(const pKey in state.ranks[rKey]){
        if(parseInt(pKey,10) > pCount){
          delete state.ranks[rKey][pKey];
        }
      }
    }
  }

  function updateModeOptions(){
    selMode.innerHTML = '';
    const opts = MODES[state.players] || [];
    opts.forEach(o => {
      const el = document.createElement('option');
      el.value = o.value;
      el.textContent = o.text;
      selMode.appendChild(el);
    });
    const valid = opts.some(o => o.value === state.mode);
    if(!valid && opts.length > 0) state.mode = opts[0].value;
    selMode.value = state.mode;
  }

  function updateSelfCpuOptions(){
    selSelfTeam.innerHTML = '';
    state.teams.forEach(t => {
      const el = document.createElement('option');
      el.value = t.letter;
      el.textContent = t.letter + '組';
      selSelfTeam.appendChild(el);
    });
    selSelfTeam.value = state.selfTeam;

    selCpuTeam.innerHTML = '';
    const elNone = document.createElement('option');
    elNone.value = 'none';
    elNone.textContent = 'なし';
    selCpuTeam.appendChild(elNone);
    state.teams.forEach(t => {
      const el = document.createElement('option');
      el.value = t.letter;
      el.textContent = t.letter + '組';
      selCpuTeam.appendChild(el);
    });
    selCpuTeam.value = state.cpuTeam;
  }

  function initControls(){
    const radPlayers = document.querySelectorAll('input[name="players"]');
    radPlayers.forEach(r => {
      if(r.value === state.players) r.checked = true;
      r.addEventListener('change', async ()=>{
        if(r.checked){
          state.players = r.value;
          updateModeOptions();
          ensureTeams();
          ensureSelections();
          pruneInputs();
          updateSelfCpuOptions();
          buildTagTables();
          buildOptViewOptions();
          buildRankTable();
          renderPinPreview();
          spMaxDiff.textContent = String(MAXDIFF[state.players][state.mode] ?? '--');
          await runCalcByCurrentValidState(true);
          scheduleSave();
        }
      });
    });

    updateModeOptions();

    const radRaces = document.querySelectorAll('input[name="races"]');
    radRaces.forEach(r => {
      if(r.value === state.races) r.checked = true;
      r.addEventListener('change', async ()=>{
        if(r.checked){
          state.races = r.value;
          ensureSelections();
          pruneInputs();
          buildRankTable();
          renderPinPreview();
          await runCalcByCurrentValidState(true);
          scheduleSave();
        }
      });
    });

    selMode.addEventListener('change', async ()=>{
      state.mode = selMode.value;
      ensureTeams();
      ensureSelections();
      pruneInputs();
      updateSelfCpuOptions();
      buildTagTables();
      buildOptViewOptions();
      buildRankTable();
      renderPinPreview();
      spMaxDiff.textContent = String(MAXDIFF[state.players][state.mode] ?? '--');
      await runCalcByCurrentValidState(true);
      scheduleSave();
    });

    updateSelfCpuOptions();

    selSelfTeam.addEventListener('change', async ()=>{
      state.selfTeam = selSelfTeam.value;
      buildTagTables();
      await runCalcByCurrentValidState(false);
      scheduleSave();
    });

    selCpuTeam.addEventListener('change', async ()=>{
      state.cpuTeam = selCpuTeam.value;
      buildTagTables();
      await runCalcByCurrentValidState(false);
      scheduleSave();
    });

    chkUseColor.checked = state.useColor;
    if(state.useColor) tagMainRow.classList.add('colorOn');
    else tagMainRow.classList.remove('colorOn');

    chkUseColor.addEventListener('change', async ()=>{
      state.useColor = chkUseColor.checked;
      if(state.useColor) tagMainRow.classList.add('colorOn');
      else tagMainRow.classList.remove('colorOn');
      await runCalcByCurrentValidState(false);
      scheduleSave();
    });

    chkSortTag.checked = state.sortTag;
    chkSortTag.addEventListener('change', async ()=>{
      state.sortTag = chkSortTag.checked;
      await runCalcByCurrentValidState(false);
      scheduleSave();
    });

    chkShowCert.checked = state.showCert;
    chkShowCert.addEventListener('change', async ()=>{
      state.showCert = chkShowCert.checked;
      await runCalcByCurrentValidState(false);
      scheduleSave();
    });

    chkShowCourseLog.checked = state.showCourseLog;
    chkShowCourseLog.addEventListener('change', ()=>{
      state.showCourseLog = chkShowCourseLog.checked;
      renderCourseLog(state.courses);
      scheduleSave();
    });

    selView.addEventListener('change', async ()=>{
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
    runCalcByCurrentValidState(false).then(()=>{
      suppressNewRaceCheck = false;
      state.lastUpdated = state.lastUpdated || nowMs();
    });
  }

  window.addEventListener('DOMContentLoaded', init);
})();
