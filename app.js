(() => {
  'use strict';

  // ==========================================
  // CONFIGURATION & CONSTANTS (FIXED)
  // ==========================================
  const VERSION = 'mkworld_ultimate_v1_2026';
  const LS_KEY = 'mkworld:' + location.pathname;
  const MAX_TEAMS = 24;
  const FINISHED_TTL_MS = 24 * 60 * 60 * 1000;

  const SELECT_COLORS = [
    { name: '未選択', display: '', color: '' },
    { name: '🔴赤', display: '🔴', color: '#FE3C4F' },
    { name: '🔵青', display: '🔵', color: '#498CF0' },
    { name: '🟡黄', display: '🟡', color: '#FFF200' },
    { name: '🟢緑', display: '🟢', color: '#57C544' },
  ];

  const AUTO_COLORS = [
    '#FE3C4F', '#498CF0', '#FFF200', '#57C544',
    '#FF7CD5', '#7BE0FF', '#FD8600', '#AD6BFF',
    '#ACF243', '#B58464', '#FFB5EC', '#CCCCCC'
  ];

  const CPU_COLOR = '#4C4C4C';
  const POINTS_12 = [15, 12, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1];
  const POINTS_24 = [15, 12, 10, 9, 9, 8, 8, 7, 7, 6, 6, 6, 5, 5, 5, 4, 4, 4, 3, 3, 3, 2, 2, 1];

  const FORMATS = {
    12: [
      { id: 'FFA', label: 'FFA', teamCount: 12 },
      { id: '2v2', label: '2v2', teamCount: 6 },
      { id: '3v3', label: '3v3', teamCount: 4 },
      { id: '4v4', label: '4v4', teamCount: 3 },
      { id: '6v6', label: '6v6', teamCount: 2 },
    ],
    24: [
      { id: 'FFA', label: 'FFA', teamCount: 24 },
      { id: '2v2', label: '2v2', teamCount: 12 },
      { id: '3v3', label: '3v3', teamCount: 8 },
      { id: '4v4', label: '4v4', teamCount: 6 },
      { id: '6v6', label: '6v6', teamCount: 4 },
      { id: '8v8', label: '8v8', teamCount: 3 },
      { id: '12v12', label: '12v12', teamCount: 2 },
    ]
  };

  const MAXDIFF = {
    12: { FFA: 14, '2v2': 24, '3v3': 31, '4v4': 36, '6v6': 40 },
    24: { FFA: 14, '2v2': 24, '3v3': 32, '4v4': 38, '6v6': 49, '8v8': 56, '12v12': 62 },
  };

  // ==========================================
  // SAFE DOM ELEMENT SELECTOR
  // ==========================================
  const $ = (s) => document.querySelector(s);

  const selMode = $('#selMode');
  const inpQualify = $('#inpQualify');
  const btnResetTags = $('#btnResetTags');
  const dupKeyMsg = $('#dupKeyMsg');
  const tagTables = $('#tagTables');
  const btnResetAll = $('#btnResetAll');
  const btnRecovery = $('#btnRecovery');
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
  const selView = $('#selView');
  const logAdj = $('#logAdj');
  const logCourse = $('#logCourse');
  const chkShowCourseLog = $('#chkShowCourseLog');
  const btnSpec = $('#btnSpec');
  const modalSpec = $('#modalSpec');
  const btnSpecClose = $('#btnSpecClose');

  // ==========================================
  // ROBUST STATE WITH DEEP DEFENSIVE PROTOCOLS
  // ==========================================
  let composingQualify = false;
  let saveTimer = null;
  let copyStatusTimer = null;
  let suppressNewRaceCheck = false;
  let lastMainText = '';

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
    showSum: false,
    showCert: true,
    optViewTeam: 'none',
    showCourseLog: false,
    dispMode: 'normal',
    lastUpdated: 0,
    finishedAt: null,
    recoverySnapshot: null,
    recoveryAvailable: false,
    autosaveOff: false,
  };

  // ==========================================
  // UTILITIES & SANITIZERS (DATA DEFENSE)
  // ==========================================
  function nowMs() { return Date.now(); }
  function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }
  
  function fmt() { 
    return FORMATS[state.players]?.find(x => x.id === state.mode) || FORMATS[state.players]?.[0]; 
  }
  
  function teamCount() { 
    const f = fmt();
    return f ? f.teamCount : 0; 
  }
  
  function visibleIndexes() { 
    return Array.from({ length: Math.min(MAX_TEAMS, teamCount()) }, (_, i) => i); 
  }
  
  function hasColorSelect(count = teamCount()) { return count <= 4; }
  function teamAutoColor(i) { return AUTO_COLORS[i % AUTO_COLORS.length]; }
  function getPoints() { return state.players === 12 ? POINTS_12 : POINTS_24; }

  function toHalfWidth(s) {
    return String(s ?? '')
      .replace(/[！-～]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0))
      .replace(/ /g, ' ');
  }

  function normalizeKey(s) {
    s = toHalfWidth(s).trim();
    if (!s) return '';
    const arr = Array.from(s);
    if (arr.length === 0) return '';
    let first = arr[0];
    if (/[A-Z]/.test(first)) first = first.toLowerCase();
    return first;
  }

  function sanitizeIntInput(s) {
    s = toHalfWidth(String(s ?? ''));
    s = s.replace(/[^0-9+\-]/g, '');
    const m = s.match(/^([+\-]?)(\d*)/);
    if (!m) return '';
    return `${m[1] || ''}${m[2] || ''}`;
  }

  function parseAdjustment(s) {
    s = toHalfWidth(String(s ?? '')).replace(/\s+/g, '');
    if (!s) return 0;
    let total = 0;
    const matches = s.matchAll(/([+\-]?\d+)/g);
    for (const match of matches) {
      total += parseInt(match[1], 10);
    }
    return total;
  }

  function initTeamsData() {
    state.teams = Array.from({ length: MAX_TEAMS }, () => ({
      tag: '',
      colorIdx: '0',
      isCpu: false,
    }));
  }

  // ==========================================
  // FAIL-SAFE LOCAL STORAGE MANAGEMENT
  // ==========================================
  function loadLocalStorage() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return false;
      const d = JSON.parse(raw);
      if (!d || typeof d !== 'object') return false;

      state.players = [12, 24].includes(Number(d.players)) ? Number(d.players) : 24;
      state.races = [8, 12].includes(Number(d.races)) ? Number(d.races) : 12;
      state.mode = typeof d.mode === 'string' ? d.mode : '6v6';
      state.qualify = typeof d.qualify === 'string' ? d.qualify : '';
      state.cpuCalc = ['MKB', 'SUMMIT'].includes(d.cpuCalc) ? d.cpuCalc : 'MKB';
      state.cpuKey = typeof d.cpuKey === 'string' ? d.cpuKey : '';
      state.selfTeamIndex = typeof d.selfTeamIndex === 'string' ? d.selfTeamIndex : '0';
      state.cells = d.cells && typeof d.cells === 'object' ? d.cells : {};
      state.courses = d.courses && typeof d.courses === 'object' ? d.courses : {};
      state.locks = d.locks && typeof d.locks === 'object' ? d.locks : {};
      state.adjLog = Array.isArray(d.adjLog) ? d.adjLog : [];
      state.showSum = !!d.showSum;
      state.showCert = d.showCert !== false;
      state.optViewTeam = typeof d.optViewTeam === 'string' ? d.optViewTeam : 'none';
      state.showCourseLog = !!d.showCourseLog;
      state.dispMode = ['normal', 'sumOnly'].includes(d.dispMode) ? d.dispMode : 'normal';
      state.lastUpdated = Number(d.lastUpdated) || nowMs();
      state.finishedAt = d.finishedAt ? Number(d.finishedAt) : null;
      state.recoverySnapshot = d.recoverySnapshot && typeof d.recoverySnapshot === 'object' ? d.recoverySnapshot : null;
      state.recoveryAvailable = !!d.recoveryAvailable;

      initTeamsData();
      if (Array.isArray(d.teams)) {
        for (let i = 0; i < MAX_TEAMS; i++) {
          if (d.teams[i] && typeof d.teams[i] === 'object') {
            state.teams[i].tag = typeof d.teams[i].tag === 'string' ? d.teams[i].tag : '';
            state.teams[i].colorIdx = typeof d.teams[i].colorIdx === 'string' ? d.teams[i].colorIdx : '0';
            state.teams[i].isCpu = !!d.teams[i].isCpu;
          }
        }
      }

      if (state.finishedAt && (nowMs() - state.finishedAt > FINISHED_TTL_MS)) {
        clearStateDataOnly();
      }
      return true;
    } catch (e) {
      console.error('Critical warning: Storage parse failed. Resetting safely.', e);
      return false;
    }
  }

  function saveLocalStorage() {
    if (state.autosaveOff) return;
    try {
      state.lastUpdated = nowMs();
      localStorage.setItem(LS_KEY, JSON.stringify(state));
    } catch (e) {
      console.error('Critical warning: Storage save failure.', e);
    }
  }

  function queueSave() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveLocalStorage();
      saveTimer = null;
    }, 200);
  }

  function clearStateDataOnly() {
    state.cells = {};
    state.courses = {};
    state.locks = {};
    state.adjLog = [];
    state.finishedAt = null;
    state.cpuKey = '';
    for (let i = 0; i < MAX_TEAMS; i++) {
      state.teams[i].tag = '';
      state.teams[i].colorIdx = '0';
      state.teams[i].isCpu = false;
    }
  }

  function createSnapshot() {
    return {
      cells: JSON.parse(JSON.stringify(state.cells)),
      courses: JSON.parse(JSON.stringify(state.courses)),
      locks: JSON.parse(JSON.stringify(state.locks)),
      adjLog: JSON.parse(JSON.stringify(state.adjLog)),
      teams: JSON.parse(JSON.stringify(state.teams)),
      cpuKey: state.cpuKey,
      finishedAt: state.finishedAt
    };
  }

  function applySnapshot(snap) {
    if (!snap) return;
    state.cells = JSON.parse(JSON.stringify(snap.cells || {}));
    state.courses = JSON.parse(JSON.stringify(snap.courses || {}));
    state.locks = JSON.parse(JSON.stringify(snap.locks || {}));
    state.adjLog = JSON.parse(JSON.stringify(snap.adjLog || []));
    state.cpuKey = snap.cpuKey || '';
    state.finishedAt = snap.finishedAt || null;
    if (Array.isArray(snap.teams)) {
      for (let i = 0; i < MAX_TEAMS; i++) {
        if (snap.teams[i]) {
          state.teams[i].tag = snap.teams[i].tag || '';
          state.teams[i].colorIdx = snap.teams[i].colorIdx || '0';
          state.teams[i].isCpu = !!snap.teams[i].isCpu;
        }
      }
    }
  }

  // ==========================================
  // BULLETPROOF ENGINE (ISOLATED EXECUTION)
  // ==========================================
  function checkDuplicateKeys() {
    if (!dupKeyMsg) return;
    dupKeyMsg.textContent = '';
    const activeIdxs = visibleIndexes();
    const keys = [];
    let hasCpu = false;

    for (const i of activeIdxs) {
      const t = state.teams[i];
      if (!t) continue;
      if (t.isCpu) {
        hasCpu = true;
        continue;
      }
      const k = normalizeKey(t.tag);
      if (k) keys.push(k);
    }

    const cpuCustomKey = normalizeKey(state.cpuKey);
    if (hasCpu && cpuCustomKey) {
      keys.push(cpuCustomKey);
    }

    const seen = new Set();
    const dups = new Set();
    for (const k of keys) {
      if (seen.has(k)) dups.add(k.toUpperCase());
      else seen.add(k);
    }

    if (dups.size > 0) {
      dupKeyMsg.textContent = `重複あり: ${Array.from(dups).join(', ')}`;
    }
  }

  function compileRaceMatrix() {
    const totalRaces = state.races;
    const activeIdxs = visibleIndexes();
    const count = activeIdxs.length;
    const pointsList = getPoints();

    const matrix = Array.from({ length: totalRaces }, () => ({
      valid: true,
      errReason: '',
      ranks: Array.from({ length: state.players }, () => null),
      teamScores: Array.from({ length: count }, () => 0),
      rawInps: Array.from({ length: count }, () => ''),
      adjs: Array.from({ length: count }, () => 0),
    }));

    let effectiveCpuIdx = -1;
    for (const i of activeIdxs) {
      if (state.teams[i]?.isCpu) {
        effectiveCpuIdx = i;
        break;
      }
    }

    const cpuNormKey = normalizeKey(state.cpuKey);

    for (let r = 0; r < totalRaces; r++) {
      const m = matrix[r];
      const counts = {};
      let totalAssigned = 0;

      for (let tIdx = 0; tIdx < count; tIdx++) {
        const globalIdx = activeIdxs[tIdx];
        const val = toHalfWidth(state.cells[`r:${r},t:${globalIdx}`] ?? '').trim();
        m.rawInps[tIdx] = val;

        const adjVal = toHalfWidth(state.cells[`a:${r},t:${globalIdx}`] ?? '').trim();
        m.adjs[tIdx] = parseAdjustment(adjVal);

        if (!val) continue;

        const chars = Array.from(val);
        for (const ch of chars) {
          let norm = ch;
          if (/[A-Z]/.test(norm)) norm = norm.toLowerCase();

          if (effectiveCpuIdx !== -1 && cpuNormKey && norm === cpuNormKey) {
            counts[effectiveCpuIdx] = (counts[effectiveCpuIdx] || 0) + 1;
            totalAssigned++;
          } else {
            let found = false;
            for (let k = 0; k < count; k++) {
              const gI = activeIdxs[k];
              if (state.teams[gI]?.isCpu) {
                const tk = normalizeKey(state.teams[gI].tag);
                if (tk && norm === tk) {
                  counts[gI] = (counts[gI] || 0) + 1;
                  totalAssigned++;
                  found = true;
                  break;
                }
                continue;
              }
              const tk = normalizeKey(state.teams[gI]?.tag);
              if (tk && norm === tk) {
                counts[gI] = (counts[gI] || 0) + 1;
                totalAssigned++;
                found = true;
                break;
              }
            }
            if (!found) {
              m.valid = false;
              m.errReason = '未定義タグあり';
            }
          }
        }
      }

      if (totalAssigned === 0) {
        m.valid = false;
        m.errReason = '';
        continue;
      }

      if (totalAssigned !== state.players) {
        m.valid = false;
        if (!m.errReason) m.errReason = `入力数不一致(${totalAssigned}/${state.players})`;
      }

      let flatRanks = [];
      for (let tIdx = 0; tIdx < count; tIdx++) {
        const globalIdx = activeIdxs[tIdx];
        const num = counts[globalIdx] || 0;
        for (let j = 0; j < num; j++) {
          flatRanks.push(globalIdx);
        }
      }

      if (m.valid) {
        for (let p = 0; p < state.players; p++) {
          m.ranks[p] = flatRanks[p] ?? null;
          const ownerTeam = m.ranks[p];
          if (ownerTeam !== null) {
            const localTIdx = activeIdxs.indexOf(ownerTeam);
            if (localTIdx !== -1) {
              m.teamScores[localTIdx] += pointsList[p] || 0;
            }
          }
        }
      } else {
        if (totalAssigned > 0 && totalAssigned <= state.players) {
          for (let p = 0; p < totalAssigned; p++) {
            m.ranks[p] = flatRanks[p] ?? null;
            const ownerTeam = m.ranks[p];
            if (ownerTeam !== null) {
              const localTIdx = activeIdxs.indexOf(ownerTeam);
              if (localTIdx !== -1) {
                m.teamScores[localTIdx] += pointsList[p] || 0;
              }
            }
          }
        }
      }

      if (effectiveCpuIdx !== -1 && counts[effectiveCpuIdx] > 0) {
        const cpuLocalIdx = activeIdxs.indexOf(effectiveCpuIdx);
        if (cpuLocalIdx !== -1) {
          if (state.cpuCalc === 'SUMMIT') {
            const rawSum = m.teamScores[cpuLocalIdx];
            const base = Math.floor(rawSum / counts[effectiveCpuIdx]);
            const rem = rawSum % counts[effectiveCpuIdx];
            m.teamScores[cpuLocalIdx] = (base * 12) + rem;
          } else {
            const rawSum = m.teamScores[cpuLocalIdx];
            const cCount = counts[effectiveCpuIdx];
            let cpuBonus = 0;
            let flatRankIdx = 0;

            for (let tIdx = 0; tIdx < count; tIdx++) {
              const gI = activeIdxs[tIdx];
              const tCount = counts[gI] || 0;
              if (gI === effectiveCpuIdx) {
                for (let j = 0; j < tCount; j++) {
                  const currentRank = flatRankIdx + 1;
                  if (currentRank <= 12) {
                    cpuBonus += (13 - currentRank);
                  }
                  flatRankIdx++;
                }
              } else {
                flatRankIdx += tCount;
              }
            }
            m.teamScores[cpuLocalIdx] = rawSum + cpuBonus;
          }
        }
      }

      for (let tIdx = 0; tIdx < count; tIdx++) {
        m.teamScores[tIdx] += m.adjs[tIdx];
      }
    }

    return matrix;
  }

  function calculateTotals(matrix) {
    const activeIdxs = visibleIndexes();
    const count = activeIdxs.length;
    const totalRaces = state.races;

    const totals = Array.from({ length: count }, (_, i) => ({
      globalIdx: activeIdxs[i],
      score: 0,
      rank: 1,
      diff: 0
    }));

    for (let r = 0; r < totalRaces; r++) {
      for (let i = 0; i < count; i++) {
        totals[i].score += matrix[r].teamScores[i];
      }
    }

    const sorted = [...totals].sort((a, b) => b.score - a.score);
    let currentRank = 1;
    for (let i = 0; i < count; i++) {
      if (i > 0 && sorted[i].score < sorted[i - 1].score) {
        currentRank = i + 1;
      }
      const originalItem = totals.find(x => x.globalIdx === sorted[i].globalIdx);
      if (originalItem) originalItem.rank = currentRank;
    }

    const selfIdxInt = parseInt(state.selfTeamIndex, 10);
    const selfTotal = totals.find(x => x.globalIdx === selfIdxInt) || totals[0];

    for (let i = 0; i < count; i++) {
      totals[i].diff = totals[i].score - (selfTotal ? selfTotal.score : 0);
    }

    return { totals, sorted };
  }

  function computeAggregations() {
    const matrix = compileRaceMatrix();
    const { totals, sorted } = calculateTotals(matrix);
    const activeIdxs = visibleIndexes();
    const count = activeIdxs.length;
    const totalRaces = state.races;

    let maxDiffAllowed = 0;
    const mData = MAXDIFF[state.players];
    if (mData && mData[state.mode] !== undefined) {
      maxDiffAllowed = mData[state.mode];
    }
    if (spMaxDiff) spMaxDiff.textContent = maxDiffAllowed || '--';

    let lastActiveRace = -1;
    for (let r = 0; r < totalRaces; r++) {
      const hasAnyInp = matrix[r].rawInps.some(x => x !== '');
      if (hasAnyInp) lastActiveRace = r;
    }

    const midRace = Math.floor(totalRaces / 2);
    let isMatchFinished = false;
    if (lastActiveRace === totalRaces - 1 && matrix[lastActiveRace].valid) {
      isMatchFinished = true;
    }

    if (isMatchFinished && !suppressNewRaceCheck) {
      if (!state.finishedAt) {
        state.finishedAt = nowMs();
        queueSave();
      }
    } else {
      if (state.finishedAt) {
        state.finishedAt = null;
        queueSave();
      }
    }

    return { 
      matrix, totals, sorted, lastActiveRace, midRace, 
      maxDiffAllowed, isMatchFinished, count, activeIdxs,
      colorOn: hasColorSelect(count)
    };
  }

  // ==========================================
  // VIEW RENDERERS (RENDER SAFETY SHIELD)
  // ==========================================
  function renderAll() {
    checkDuplicateKeys();
    const agg = computeAggregations();
    
    renderTagTables();
    renderPinPreview(agg);
    renderRankWrap(agg);
    renderOutputs(agg);
    renderLogs(agg);

    if (btnRecovery) btnRecovery.disabled = !state.recoveryAvailable;
  }

  function renderTagTables() {
    if (!tagTables) return;
    const activeIdxs = visibleIndexes();
    const count = activeIdxs.length;
    const colorOn = hasColorSelect(count);

    let html = `<div class="tagMainRow ${colorOn ? 'colorOn' : ''}">`;
    
    if (count > 12) {
      const mid = Math.ceil(count / 2);
      html += `<div class="tagTablesCol">${buildTagTableHtml(activeIdxs.slice(0, mid), colorOn)}</div>`;
      html += `<div class="tagTablesCol">${buildTagTableHtml(activeIdxs.slice(mid), colorOn)}</div>`;
    } else {
      html += `<div class="tagTablesCol">${buildTagTableHtml(activeIdxs, colorOn)}</div>`;
    }

    html += `</div>`;

    let hasCpu = activeIdxs.some(i => state.teams[i]?.isCpu);
    if (hasCpu) {
      html += `
        <div class="cpuInlineWrap">
          <div class="cpuInlineBox ${colorOn ? '' : 'noLabels'}">
            <div class="cpuInlineRow">
              ${colorOn ? `<div class="cpuInlineHead" style="background:${CPU_COLOR};color:#fff;">CPU</div>` : ''}
              <div class="cpuInlineCell">
                <div class="cpuInlineTitle">タグ</div>
                <div class="cpuInlineValue">
                  <input class="cellInp" id="inpCpuKey" maxlength="1" value="${state.cpuKey || ''}" placeholder="C" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" />
                </div>
              </div>
            </div>
          </div>
        </div>`;
    }

    tagTables.innerHTML = html;
    attachTagTableEvents();
  }

  function buildTagTableHtml(subIdxs, colorOn) {
    let h = `<table class="sheet"><thead><tr><th class="rowHead">チーム</th>`;
    h += `<th>タグ</th>`;
    if (colorOn) h += `<th>カラー</th>`;
    h += `<th>自枠</th><th>CPU</th></tr></thead><tbody>`;

    for (const i of subIdxs) {
      const t = state.teams[i] || { tag: '', colorIdx: '0', isCpu: false };
      h += `<tr>`;
      h += `<td class="rowHead">チーム${i + 1}</td>`;
      h += `<td><input class="cellInp left tagInpCls" data-idx="${i}" maxlength="10" value="${t.tag || ''}" placeholder="Tag" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" /></td>`;
      
      if (colorOn) {
        h += `<td><select class="colorSel" data-idx="${i}">`;
        SELECT_COLORS.forEach((c, cI) => {
          const selStr = String(t.colorIdx) === String(cI) ? 'selected' : '';
          h += `<option value="${cI}" ${selStr}>${c.name}</option>`;
        });
        h += `</select></td>`;
      }

      const selfChecked = String(state.selfTeamIndex) === String(i) ? 'checked' : '';
      h += `<td><div class="selfRadioWrap"><input type="radio" name="selfTeam" class="selfRadioCls" value="${i}" ${selfChecked} /></div></td>`;
      
      const cpuChecked = t.isCpu ? 'checked' : '';
      h += `<td><div class="selfRadioWrap"><input type="checkbox" class="cpuChkCls" data-idx="${i}" ${cpuChecked} /></div></td>`;
      h += `</tr>`;
    }
    h += `</tbody></table>`;
    return h;
  }

  function attachTagTableEvents() {
    if (!tagTables) return;
    tagTables.querySelectorAll('.tagInpCls').forEach(el => {
      el.addEventListener('input', (e) => {
        const idx = parseInt(e.target.dataset.idx, 10);
        if (state.teams[idx]) {
          state.teams[idx].tag = e.target.value;
        }
        checkDuplicateKeys();
        queueSave();
        const agg = computeAggregations();
        renderPinPreview(agg);
        renderRankWrap(agg);
        renderOutputs(agg);
      });
    });

    tagTables.querySelectorAll('.colorSel').forEach(el => {
      el.addEventListener('change', (e) => {
        const idx = parseInt(e.target.dataset.idx, 10);
        if (state.teams[idx]) {
          state.teams[idx].colorIdx = e.target.value;
        }
        queueSave();
        const agg = computeAggregations();
        renderPinPreview(agg);
        renderRankWrap(agg);
      });
    });

    tagTables.querySelectorAll('.selfRadioCls').forEach(el => {
      el.addEventListener('change', (e) => {
        state.selfTeamIndex = e.target.value;
        queueSave();
        const agg = computeAggregations();
        renderRankWrap(agg);
        renderOutputs(agg);
      });
    });

    tagTables.querySelectorAll('.cpuChkCls').forEach(el => {
      el.addEventListener('change', (e) => {
        const idx = parseInt(e.target.dataset.idx, 10);
        if (state.teams[idx]) {
          state.teams[idx].isCpu = e.target.checked;
          if (e.target.checked) state.teams[idx].tag = '';
        }
        queueSave();
        renderAll();
      });
    });

    const cpuK = $('#inpCpuKey');
    if (cpuK) {
      cpuK.addEventListener('input', (e) => {
        state.cpuKey = e.target.value;
        checkDuplicateKeys();
        queueSave();
        const agg = computeAggregations();
        renderPinPreview(agg);
        renderRankWrap(agg);
        renderOutputs(agg);
      });
    }
  }

  function renderPinPreview(agg) {
    if (!pinPreview || !pinBarContent) return;
    const html = buildBadgeRowHtml(agg, false);
    pinPreview.innerHTML = html;
    pinBarContent.innerHTML = html;
  }

  function buildBadgeRowHtml(agg, barMode = false) {
    const { sorted, colorOn } = agg;
    let h = `<div class="pinRowLine ${barMode ? 'pinRowLineNoWrap' : ''}">`;

    for (let i = 0; i < sorted.length; i++) {
      const item = sorted[i];
      const t = state.teams[item.globalIdx];
      if (!t) continue;

      let tagDisp = t.tag.trim();
      let isCpuItem = t.isCpu;

      if (isCpuItem) {
        tagDisp = (state.cpuKey.trim() || 'C') + '(CPU)';
      } else if (!tagDisp) {
        tagDisp = `T${item.globalIdx + 1}`;
      }

      let keyDisp = isCpuItem ? (state.cpuKey.trim() || 'C') : (normalizeKey(t.tag).toUpperCase() || '?');

      let bg = '';
      let noAuto = '';
      if (isCpuItem) {
        bg = CPU_COLOR;
      } else if (colorOn) {
        const cObj = SELECT_COLORS[parseInt(t.colorIdx, 10)] || SELECT_COLORS[0];
        bg = cObj.color || '#ffffff';
        if (!cObj.color) noAuto = 'noAutoColor';
      } else {
        bg = teamAutoColor(item.globalIdx);
      }

      let textStyle = (bg === '#FFF200' && !isCpuItem) ? 'color:#000;' : 'color:#fff;';
      if (noAuto) textStyle = 'color:#000;';

      h += `
        <div class="badge">
          <div class="badgeTop ${noAuto} left" style="background:${bg};${textStyle}" title="${tagDisp}">${keyDisp}:${tagDisp}</div>
          <div class="badgeBot">${item.score}</div>
        </div>`;
      
      if (i === 3 && sorted.length > 8 && !barMode) {
        h += `<div class="cpuSpacer"></div>`;
      }
    }

    h += `</div>`;
    return h;
  }

  function renderRankWrap(agg) {
    if (!rankWrap) return;
    const { matrix, totals, sorted, midRace, lastActiveRace, activeIdxs, colorOn } = agg;
    const totalRaces = state.races;

    let h = `<table class="rankTable"><thead><tr>`;
    h += `<th class="rankHeadTd rankLead beforeSep"></th>`;
    h += `<th class="rankHeadTd scoreLead beforeSep"></th>`;

    for (let r = 0; r < totalRaces; r++) {
      const isSplit = (r === midRace - 1);
      h += `<th class="rankHeadTd raceNumHead ${isSplit ? 'raceSplit' : ''}">#${r + 1}</th>`;
    }
    h += `</tr><tr>`;
    h += `<th class="rankHeadTd rankNoHead">順位</th>`;
    h += `<th class="rankHeadTd scoreHead">合計</th>`;

    for (let r = 0; r < totalRaces; r++) {
      const isSplit = (r === midRace - 1);
      h += `<th class="rankHeadTd raceCountHead ${isSplit ? 'raceSplit' : ''}"></th>`;
    }
    h += `</tr></thead><tbody>`;

    for (let sI = 0; sI < sorted.length; sI++) {
      const item = sorted[sI];
      const gIdx = item.globalIdx;
      const t = state.teams[gIdx];
      if (!t) continue;
      const localTIdx = activeIdxs.indexOf(gIdx);

      let tagDisp = t.tag.trim();
      if (t.isCpu) {
        tagDisp = (state.cpuKey.trim() || 'C') + '(CPU)';
      } else if (!tagDisp) {
        tagDisp = `T${gIdx + 1}`;
      }

      let keyDisp = t.isCpu ? (state.cpuKey.trim() || 'C') : (normalizeKey(t.tag).toUpperCase() || '?');

      let cellBg = '';
      if (t.isCpu) {
        cellBg = CPU_COLOR;
      } else if (colorOn) {
        cellBg = (SELECT_COLORS[parseInt(t.colorIdx, 10)] || SELECT_COLORS[0]).color || '';
      } else {
        cellBg = teamAutoColor(gIdx);
      }

      let textStyle = (cellBg === '#FFF200' && !t.isCpu) ? 'color:#000;' : 'color:#fff;';
      if (!cellBg) textStyle = 'color:#000;';

      const isSelf = String(state.selfTeamIndex) === String(gIdx);
      const trSepClass = (sI === 0) ? 'sepTop' : '';

      h += `<tr class="${trSepClass}">`;
      h += `<td class="rankCellTd rankCol">${state.dispMode === 'sumOnly' ? '--' : item.rank}</td>`;

      let scoreDisp = String(item.score);
      if (state.dispMode === 'normal') {
        const prefix = item.diff > 0 ? '+' : '';
        const diffStr = item.diff === 0 ? '±0' : `${prefix}${item.diff}`;
        scoreDisp = state.showSum ? `${item.score}(${diffStr})` : diffStr;
      }
      h += `<td class="rankCellTd scoreCol" style="${isSelf ? 'font-weight:900;background:#ffccd5;' : ''}">${scoreDisp}</td>`;

      for (let r = 0; r < totalRaces; r++) {
        const isSplit = (r === midRace - 1);
        const m = matrix[r];
        if (!m) continue;
        const rawV = m.rawInps[localTIdx] ?? '';
        const isLocked = !!state.locks[`r:${r}`];

        let insideScore = '';
        if (m.valid && localTIdx !== -1) {
          insideScore = ` (${m.teamScores[localTIdx]})`;
        }

        let tdStyle = '';
        let dispStyle = '';
        if (rawV) {
          tdStyle = cellBg ? `background:${cellBg};` : '';
          dispStyle = textStyle;
        }

        const errClass = (rawV && !m.valid) ? 'raceError' : '';
        const lockClass = isLocked ? 'isLocked' : '';

        h += `<td class="rankCellTd ${isSplit ? 'raceSplit' : ''} ${errClass} ${lockClass}" style="${tdStyle}">`;
        h += `<div class="rankCell">`;
        h += `<input class="rankKey rKInpCls" data-r="${r}" data-t="${gIdx}" value="${rawV}" maxlength="15" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" style="${dispStyle}" ${isLocked ? 'disabled' : ''} />`;
        
        let labelStr = rawV ? `${keyDisp}${insideScore}` : keyDisp;
        h += `<div class="rankDisp ${rawV ? '' : 'placeholder'} ${cellBg ? '' : 'noBg'} ${rawV ? '' : 'left'}" style="${dispStyle}">${labelStr}</div>`;
        h += `</div></td>`;
      }
      h += `</tr>`;
    }

    h += `<tr class="raceErrorRow">`;
    h += `<td class="raceErrorLead rankLead"></td>`;
    h += `<td class="raceErrorLead scoreLead"></td>`;
    for (let r = 0; r < totalRaces; r++) {
      const isSplit = (r === midRace - 1);
      const m = matrix[r];
      h += `<td class="raceErrorText ${isSplit ? 'raceSplit' : ''}">${m ? (m.errReason || '') : ''}</td>`;
    }
    h += `</tr>`;

    h += `<tr class="lockRow">`;
    h += `<td class="lockLead rankLead"></td>`;
    h += `<td class="lockLead scoreLead"></td>`;
    for (let r = 0; r < totalRaces; r++) {
      const isSplit = (r === midRace - 1);
      const isLocked = !!state.locks[`r:${r}`];
      h += `<td class="lockCell ${isSplit ? 'raceSplit' : ''}">`;
      h += `<button class="lockBtn lockBtnCls" data-r="${r}">${isLocked ? '🔒' : '🔓'}</button>`;
      h += `</td>`;
    }
    h += `</tr>`;
    h += `</tbody></table>`;

    if (state.showCourseLog) {
      h += buildCourseTableHtml(agg);
    }

    rankWrap.innerHTML = h;
    attachRankWrapEvents();

    if (pinBar) {
      if (lastActiveRace >= midRace) {
        pinBar.classList.remove('hidden');
        pinBar.removeAttribute('aria-hidden');
      } else {
        pinBar.classList.add('hidden');
        pinBar.setAttribute('aria-hidden', 'true');
      }
    }
  }

  function buildCourseTableHtml(agg) {
    const { midRace } = agg;
    const totalRaces = state.races;

    let h = `<table class="courseTable"><tbody><tr>`;
    h += `<td class="rankHeadTd courseHeadLabel">コース名</td>`;

    for (let r = 0; r < totalRaces; r++) {
      const isSplit = (r === midRace - 1);
      const cVal = state.courses[`r:${r}`] ?? '';
      const isLocked = !!state.locks[`r:${r}`];
      const lockClass = isLocked ? 'isLocked' : '';

      h += `<td class="courseCell ${isSplit ? 'raceSplit' : ''} ${lockClass}">`;
      h += `<input class="courseInp courseInpCls" data-r="${r}" value="${cVal}" placeholder="---" maxlength="30" autocomplete="off" ${isLocked ? 'disabled' : ''} />`;
      h += `</td>`;
    }

    h += `</tr></tbody></table>`;
    return h;
  }

  function attachRankWrapEvents() {
    if (!rankWrap) return;
    rankWrap.querySelectorAll('.rKInpCls').forEach(el => {
      el.addEventListener('input', (e) => {
        const r = e.target.dataset.r;
        const t = e.target.dataset.t;
        state.cells[`r:${r},t:${t}`] = e.target.value;
        queueSave();

        const agg = computeAggregations();
        renderPinPreview(agg);
        renderRankWrap(agg);
        renderOutputs(agg);
      });

      el.addEventListener('focus', (e) => {
        const p = e.target.parentElement?.querySelector('.rankDisp');
        if (p) p.style.display = 'none';
      });

      el.addEventListener('blur', (e) => {
        const p = e.target.parentElement?.querySelector('.rankDisp');
        if (p) p.style.display = '';
      });
    });

    rankWrap.querySelectorAll('.lockBtnCls').forEach(el => {
      el.addEventListener('click', (e) => {
        const r = e.target.dataset.r;
        if (state.locks[`r:${r}`]) {
          delete state.locks[`r:${r}`];
        } else {
          state.locks[`r:${r}`] = true;
        }
        queueSave();
        const agg = computeAggregations();
        renderRankWrap(agg);
      });
    });

    rankWrap.querySelectorAll('.courseInpCls').forEach(el => {
      el.addEventListener('input', (e) => {
        const r = e.target.dataset.r;
        state.courses[`r:${r}`] = e.target.value;
        queueSave();
        renderLogs(computeAggregations());
      });

      el.addEventListener('focus', (e) => { e.target.classList.add('left'); });
      el.addEventListener('blur', (e) => { e.target.classList.remove('left'); });
    });
  }

  function renderOutputs(agg) {
    const { totals, sorted, maxDiffAllowed, isMatchFinished } = agg;
    const selfIdxInt = parseInt(state.selfTeamIndex, 10);

    let mainText = '';
    if (state.dispMode === 'sumOnly') {
      const activeIdxs = visibleIndexes();
      mainText = activeIdxs.map(i => {
        const t = state.teams[i];
        if (!t) return '';
        const tag = t.isCpu ? ((state.cpuKey || 'C') + '(CPU)') : (t.tag.trim() || `チーム${i + 1}`);
        const score = totals.find(x => x.globalIdx === i)?.score || 0;
        return `${tag} ${score}`;
      }).filter(Boolean).join(' / ');
    } else {
      const parts = [];
      for (const item of sorted) {
        const t = state.teams[item.globalIdx];
        if (!t) continue;
        const tag = t.isCpu ? ((state.cpuKey || 'C') + '(CPU)') : (t.tag.trim() || `チーム${item.globalIdx + 1}`);
        const prefix = item.diff > 0 ? '+' : '';
        const diffStr = item.diff === 0 ? '±0' : `${prefix}${item.diff}`;
        const chunk = state.showSum ? `${tag} ${item.score}(${diffStr})` : `${tag} ${diffStr}`;
        parts.push(chunk);
      }
      mainText = parts.join(' / ');
    }

    if (outMain) outMain.textContent = mainText;
    lastMainText = mainText;

    let certLabel = $('#certText');
    if (certLabel) {
      if (state.dispMode === 'normal' && state.showCert && !isMatchFinished && sorted.length > 1) {
        const leader = sorted[0];
        const runner = sorted[1];
        if (leader && runner && leader.globalIdx === selfIdxInt) {
          const margin = leader.score - runner.score;
          if (margin > maxDiffAllowed) {
            certLabel.textContent = '【勝ち確】';
            certLabel.style.display = 'inline';
          } else {
            certLabel.textContent = '';
            certLabel.style.display = 'none';
          }
        } else {
          certLabel.textContent = '';
          certLabel.style.display = 'none';
        }
      } else {
        certLabel.textContent = '';
        certLabel.style.display = 'none';
      }
    }

    renderOptView(totals);
  }

  function renderOptView(totals) {
    if (!outOpt) return;
    outOpt.textContent = '';
    if (state.optViewTeam === 'none') {
      outOpt.textContent = '---';
      return;
    }
    const targetIdx = parseInt(state.optViewTeam, 10);
    const targetItem = totals.find(x => x.globalIdx === targetIdx);
    if (!targetItem) {
      outOpt.textContent = '---';
      return;
    }

    const activeIdxs = visibleIndexes();
    let txt = '';
    if (state.dispMode === 'sumOnly') {
      txt = activeIdxs.map(i => {
        const t = state.teams[i];
        if (!t) return '';
        const tag = t.isCpu ? ((state.cpuKey || 'C') + '(CPU)') : (t.tag.trim() || `チーム${i + 1}`);
        const score = totals.find(x => x.globalIdx === i)?.score || 0;
        return `${tag} ${score}`;
      }).filter(Boolean).join(' / ');
    } else {
      const parts = [];
      const localSorted = [...totals].sort((a, b) => b.score - a.score);
      for (const item of localSorted) {
        const t = state.teams[item.globalIdx];
        if (!t) continue;
        const tag = t.isCpu ? ((state.cpuKey || 'C') + '(CPU)') : (t.tag.trim() || `チーム${item.globalIdx + 1}`);
        const dVal = item.score - targetItem.score;
        const prefix = dVal > 0 ? '+' : '';
        const diffStr = dVal === 0 ? '±0' : `${prefix}${dVal}`;
        const chunk = state.showSum ? `${tag} ${item.score}(${diffStr})` : `${tag} ${diffStr}`;
        parts.push(chunk);
      }
      txt = parts.join(' / ');
    }
    outOpt.textContent = txt;
  }

  function syncViewSelect() {
    if (!selView) return;
    const activeIdxs = visibleIndexes();
    let html = `<option value="none">選択してください</option>`;
    for (const i of activeIdxs) {
      const t = state.teams[i];
      if (!t) continue;
      const tag = t.isCpu ? ((state.cpuKey || 'C') + '(CPU)') : (t.tag.trim() || `チーム${i + 1}`);
      const selStr = String(state.optViewTeam) === String(i) ? 'selected' : '';
      html += `<option value="${i}" ${selStr}>${tag}基準</option>`;
    }
    selView.innerHTML = html;
  }

  function renderLogs(agg) {
    const activeIdxs = visibleIndexes();
    const count = activeIdxs.length;

    if (logAdj) {
      let adjLines = [];
      for (let r = 0; r < state.races; r++) {
        let sub = [];
        for (let tIdx = 0; tIdx < count; tIdx++) {
          const gI = activeIdxs[tIdx];
          const t = state.teams[gI];
          if (!t) continue;
          const val = toHalfWidth(state.cells[`a:${r},t:${gI}`] ?? '').trim();
          if (val) {
            const tag = t.isCpu ? ((state.cpuKey || 'C') + '(CPU)') : (t.tag.trim() || `チーム${gI + 1}`);
            sub.push(`${tag}(${val})`);
          }
        }
        if (sub.length > 0) {
          adjLines.push(`${r + 1}R目: ${sub.join(', ')}`);
        }
      }
      logAdj.textContent = adjLines.length > 0 ? adjLines.join(' / ') : 'なし';
    }

    if (logCourse) {
      let courseLines = [];
      for (let r = 0; r < state.races; r++) {
        const v = (state.courses[`r:${r}`] ?? '').trim();
        if (v) courseLines.push(`${r + 1}R:${v}`);
      }
      logCourse.textContent = courseLines.length > 0 ? courseLines.join(' / ') : 'なし';
      
      if (state.showCourseLog) {
        logCourse.parentElement?.classList.remove('hidden');
      } else {
        logCourse.parentElement?.classList.add('hidden');
      }
    }
  }

  function triggerCopy(text, btn) {
    if (!text || text === '---') return;
    navigator.clipboard.writeText(text).then(() => {
      showCopyStatus('copied!', false);
      if (btn) {
        btn.classList.add('isPressing');
        setTimeout(() => btn.classList.remove('isPressing'), 120);
      }
    }).catch(err => {
      console.error(err);
      showCopyStatus('copy failed', true);
    });
  }

  function showCopyStatus(msg, isFail) {
    if (!copyStatusMsg) return;
    if (copyStatusTimer) clearTimeout(copyStatusTimer);
    copyStatusMsg.textContent = msg;
    if (isFail) copyStatusMsg.classList.add('fail');
    else copyStatusMsg.classList.remove('fail');

    copyStatusTimer = setTimeout(() => {
      copyStatusMsg.textContent = '';
      copyStatusMsg.classList.remove('fail');
      copyStatusTimer = null;
    }, 2000);
  }

  // ==========================================
  // INITIALIZATIONS & GLOBAL UI LISTENERS
  // ==========================================
  function syncFormatDropdown() {
    if (!selMode) return;
    const list = FORMATS[state.players] || [];
    let html = '';
    list.forEach(f => {
      const selStr = state.mode === f.id ? 'selected' : '';
      html += `<option value="${f.id}" ${selStr}>${f.label}</option>`;
    });
    selMode.innerHTML = html;
    if (!list.some(f => f.id === state.mode)) {
      state.mode = list[0]?.id || '';
    }
  }

  function applyStateToRulesUi() {
    document.querySelectorAll('input[name="players"]').forEach(el => {
      el.checked = Number(el.value) === state.players;
    });
    document.querySelectorAll('input[name="races"]').forEach(el => {
      el.checked = Number(el.value) === state.races;
    });
    document.querySelectorAll('input[name="cpuCalc"]').forEach(el => {
      el.checked = el.value === state.cpuCalc;
    });
    document.querySelectorAll('input[name="dispMode"]').forEach(el => {
      el.checked = el.value === state.dispMode;
    });

    syncFormatDropdown();
    if (inpQualify) inpQualify.value = state.qualify || '';
    if (chkShowSum) chkShowSum.checked = state.showSum;
    if (chkShowCert) chkShowCert.checked = state.showCert;
    if (chkShowCourseLog) chkShowCourseLog.checked = state.showCourseLog;

    syncViewSelect();
  }

  function attachRulesUiEvents() {
    document.querySelectorAll('input[name="players"]').forEach(el => {
      el.addEventListener('change', (e) => {
        state.players = Number(e.target.value);
        syncFormatDropdown();
        if (selMode) state.mode = selMode.value;
        state.selfTeamIndex = '0';
        state.optViewTeam = 'none';
        queueSave();
        applyStateToRulesUi();
        renderAll();
      });
    });

    if (selMode) {
      selMode.addEventListener('change', (e) => {
        state.mode = e.target.value;
        state.selfTeamIndex = '0';
        state.optViewTeam = 'none';
        queueSave();
        syncViewSelect();
        renderAll();
      });
    }

    document.querySelectorAll('input[name="races"]').forEach(el => {
      el.addEventListener('change', (e) => {
        state.races = Number(e.target.value);
        queueSave();
        renderAll();
      });
    });

    if (inpQualify) {
      inpQualify.addEventListener('compositionstart', () => { composingQualify = true; });
      inpQualify.addEventListener('compositionend', (e) => {
        composingQualify = false;
        state.qualify = sanitizeIntInput(e.target.value);
        e.target.value = state.qualify;
        queueSave();
      });
      inpQualify.addEventListener('input', (e) => {
        if (composingQualify) return;
        state.qualify = sanitizeIntInput(e.target.value);
        e.target.value = state.qualify;
        queueSave();
      });
    }

    document.querySelectorAll('input[name="cpuCalc"]').forEach(el => {
      el.addEventListener('change', (e) => {
        state.cpuCalc = e.target.value;
        queueSave();
        renderAll();
      });
    });

    if (btnResetTags) {
      btnResetTags.addEventListener('click', () => {
        animateBtn(btnResetTags);
        if (!confirm('タグの設定を初期化しますか？(入力中の順位は維持されます)')) return;
        for (let i = 0; i < MAX_TEAMS; i++) {
          state.teams[i].tag = '';
          state.teams[i].colorIdx = '0';
          state.teams[i].isCpu = false;
        }
        state.cpuKey = '';
        queueSave();
        renderAll();
      });
    }

    if (btnResetAll) {
      btnResetAll.addEventListener('click', () => {
        animateBtn(btnResetAll);
        if (!confirm('すべての入力データをリセットしますか？')) return;
        state.recoverySnapshot = createSnapshot();
        state.recoveryAvailable = true;
        clearStateDataOnly();
        queueSave();
        renderAll();
      });
    }

    if (btnRecovery) {
      btnRecovery.addEventListener('click', () => {
        animateBtn(btnRecovery);
        if (!state.recoveryAvailable || !state.recoverySnapshot) return;
        if (!confirm('前回のリセット前の状態に復元しますか？')) return;
        applySnapshot(state.recoverySnapshot);
        state.recoveryAvailable = false;
        state.recoverySnapshot = null;
        queueSave();
        applyStateToRulesUi();
        renderAll();
      });
    }

    if (btnPin) {
      btnPin.addEventListener('click', () => {
        animateBtn(btnPin);
        if (!pinBar) return;
        pinBar.classList.toggle('hidden');
        if (pinBar.classList.contains('hidden')) {
          pinBar.setAttribute('aria-hidden', 'true');
        } else {
          pinBar.removeAttribute('aria-hidden');
        }
      });
    }

    if (btnPinClose && pinBar) {
      btnPinClose.addEventListener('click', () => {
        pinBar.classList.add('hidden');
        pinBar.setAttribute('aria-hidden', 'true');
      });
    }

    if (btnCopyMain) {
      btnCopyMain.addEventListener('click', () => { triggerCopy(lastMainText, btnCopyMain); });
    }
    if (btnCopyOpt) {
      btnCopyOpt.addEventListener('click', () => { triggerCopy(outOpt ? outOpt.textContent : '', btnCopyOpt); });
    }

    if (chkShowSum) {
      chkShowSum.addEventListener('change', (e) => {
        state.showSum = e.target.checked;
        queueSave();
        const agg = computeAggregations();
        renderPinPreview(agg);
        renderRankWrap(agg);
        renderOutputs(agg);
      });
    }

    if (chkShowCert) {
      chkShowCert.addEventListener('change', (e) => {
        state.showCert = e.target.checked;
        queueSave();
        renderOutputs(computeAggregations());
      });
    }

    document.querySelectorAll('input[name="dispMode"]').forEach(el => {
      el.addEventListener('change', (e) => {
        state.dispMode = e.target.value;
        queueSave();
        const agg = computeAggregations();
        renderRankWrap(agg);
        renderOutputs(agg);
      });
    });

    if (selView) {
      selView.addEventListener('change', (e) => {
        state.optViewTeam = e.target.value;
        queueSave();
        renderOptView(computeAggregations().totals);
      });
    }

    if (chkShowCourseLog) {
      chkShowCourseLog.addEventListener('change', (e) => {
        state.showCourseLog = e.target.checked;
        queueSave();
        const agg = computeAggregations();
        renderRankWrap(agg);
        renderLogs(agg);
      });
    }

    if (btnSpec) {
      btnSpec.addEventListener('click', () => {
        animateBtn(btnSpec);
        if (modalSpec) {
          modalSpec.classList.remove('hidden');
          modalSpec.removeAttribute('aria-hidden');
        }
      });
    }

    const mBack = $('.modalBack');
    if (mBack) mBack.addEventListener('click', closeModal);
    if (btnSpecClose) btnSpecClose.addEventListener('click', closeModal);
  }

  function closeModal() {
    if (modalSpec) {
      modalSpec.classList.add('hidden');
      modalSpec.setAttribute('aria-hidden', 'true');
    }
  }

  function animateBtn(btn) {
    if (!btn) return;
    btn.classList.add('isPressing');
    setTimeout(() => btn.classList.remove('isPressing'), 100);
  }

  // ==========================================
  // SAFETY BOOTLOADER ENTRY POINT
  // ==========================================
  initTeamsData();
  const loaded = loadLocalStorage();
  if (!loaded) {
    state.players = 24;
    state.races = 12;
    state.mode = '6v6';
    queueSave();
  }

  applyStateToRulesUi();
  renderAll();
  attachRulesUiEvents();

})();
