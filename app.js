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

  const MODES = {
    '2v2': { teams: 12, size: 2 },
    '3v3': { teams: 8,  size: 3 },
    '4v4': { teams: 6,  size: 4 },
    '6v6': { teams: 4,  size: 6 },
    '12v12': { teams: 2, size: 12 },
    'FFA': { teams: 24, size: 1 }
  };

  const MAXDIFF = {
    '12': {
      '2v2': 10, '3v3': 15, '4v4': 16, '6v6': 12, '12v12': 0, 'FFA': 14
    },
    '24': {
      '2v2': 20, '3v3': 27, '4v4': 32, '6v6': 36, '12v12': 24, 'FFA': 14
    }
  };

  let state = {
    players: '24',
    mode: '2v2',
    races: 12,
    autoColor: true,
    showCert: true,
    realtimeLog: false,
    showCourseLog: false,
    optViewTeam: '',
    teams: [],
    racesData: [],
    courses: [],
    lastUpdated: 0,
    finishedAt: 0
  };

  let undoStack = [];
  let redoStack = [];
  let suppressNewRaceCheck = false;
  let saveTimer = null;

  const appEl = document.getElementById('app');
  const selMode = document.getElementById('selMode');
  const spMaxDiff = document.getElementById('spMaxDiff');
  const chkAutoColor = document.getElementById('chkAutoColor');
  const chkShowCert = document.getElementById('chkShowCert');
  const chkRealtimeLog = document.getElementById('chkRealtimeLog');
  const chkShowCourseLog = document.getElementById('chkShowCourseLog');
  const btnUndo = document.getElementById('btnUndo');
  const btnRedo = document.getElementById('btnRedo');
  const btnReset = document.getElementById('btnReset');
  const btnRecovery = document.getElementById('btnRecovery');
  const tblRank = document.getElementById('tblRank');
  const tblTag = document.getElementById('tblTag');
  const outText = document.getElementById('outText');
  const outIndiv = document.getElementById('outIndiv');
  const outOpt = document.getElementById('outOpt');
  const selView = document.getElementById('selView');
  const btnCopyText = document.getElementById('btnCopyText');
  const btnCopyIndiv = document.getElementById('btnCopyIndiv');
  const btnCopyOpt = document.getElementById('btnCopyOpt');
  const logAdj = document.getElementById('logAdj');
  const logCourse = document.getElementById('logCourse');
  const btnPin = document.getElementById('btnPin');
  const btnPinClose = document.getElementById('btnPinClose');
  const pinBar = document.getElementById('pinBar');
  const pinBarContent = document.getElementById('pinBarContent');
  const btnSpec = document.getElementById('btnSpec');
  const btnSpecClose = document.getElementById('btnSpecClose');
  const modalSpec = document.getElementById('modalSpec');

  function nowMs() {
    return Date.now();
  }

  function structuredCloneSafe(obj) {
    try {
      if (typeof structuredClone === 'function') {
        return structuredClone(obj);
      }
      return JSON.parse(JSON.stringify(obj));
    } catch (e) {
      return obj;
    }
  }

  function pushState() {
    undoStack.push(JSON.stringify({ teams: state.teams, racesData: state.racesData, courses: state.courses }));
    if (undoStack.length > 50) undoStack.shift();
    redoStack = [];
    updateUndoRedoButtons();
  }

  function updateUndoRedoButtons() {
    if (btnUndo) btnUndo.disabled = (undoStack.length === 0);
    if (btnRedo) btnRedo.disabled = (redoStack.length === 0);
  }

  function ensureTeams() {
    const conf = MODES[state.mode] || MODES['2v2'];
    const totalPlayers = parseInt(state.players, 10) || 24;
    const teamCount = conf.teams;
    const size = conf.size;

    if (!Array.isArray(state.teams)) state.teams = [];

    while (state.teams.length < teamCount) {
      state.teams.push({
        id: state.teams.length,
        name: 'Team ' + String.fromCharCode(65 + state.teams.length),
        colorIdx: 0,
        players: []
      });
    }
    if (state.teams.length > teamCount) {
      state.teams = state.teams.slice(0, teamCount);
    }

    state.teams.forEach((t, i) => {
      if (!t.name || t.name.startsWith('Team ')) {
        t.name = 'Team ' + String.fromCharCode(65 + i);
      }
      if (!Array.isArray(t.players)) t.players = [];
      while (t.players.length < size) {
        t.players.push({ name: '' });
      }
      if (t.players.length > size) {
        t.players = t.players.slice(0, size);
      }
    });
  }

  function ensureSelections() {
    const totalRaces = parseInt(state.races, 10) || 12;
    const totalPlayers = parseInt(state.players, 10) || 24;
    if (!Array.isArray(state.racesData)) state.racesData = [];

    while (state.racesData.length < totalRaces) {
      state.racesData.push(new Array(totalPlayers).fill(null));
    }
    if (state.racesData.length > totalRaces) {
      state.racesData = state.racesData.slice(0, totalRaces);
    }

    state.racesData.forEach((r, ri) => {
      if (!Array.isArray(r) || r.length !== totalPlayers) {
        const nextR = new Array(totalPlayers).fill(null);
        if (Array.isArray(r)) {
          for (let i = 0; i < Math.min(r.length, totalPlayers); i++) nextR[i] = r[i];
        }
        state.racesData[ri] = nextR;
      }
    });

    if (!Array.isArray(state.courses)) state.courses = [];
    while (state.courses.length < totalRaces) {
      state.courses.push('');
    }
    if (state.courses.length > totalRaces) {
      state.courses = state.courses.slice(0, totalRaces);
    }
  }

  function pruneInputs() {
    const totalPlayers = parseInt(state.players, 10) || 24;
    state.racesData.forEach(r => {
      for (let i = 0; i < totalPlayers; i++) {
        if (r[i] !== null) {
          if (r[i] < 1 || r[i] > totalPlayers) r[i] = null;
        }
      }
    });
  }

  function buildModeOptions() {
    if (!selMode) return;
    const curr = selMode.value || state.mode;
    selMode.textContent = '';
    Object.keys(MODES).forEach(m => {
      const opt = document.createElement('option');
      opt.value = m;
      opt.textContent = m;
      selMode.appendChild(opt);
    });
    selMode.value = Object.keys(MODES).includes(curr) ? curr : '2v2';
    state.mode = selMode.value;
  }

  function buildOptViewOptions() {
    if (!selView) return;
    const curr = selView.value || state.optViewTeam;
    selView.textContent = '';
    const optNone = document.createElement('option');
    optNone.value = '';
    optNone.textContent = '--選択してください--';
    selView.appendChild(optNone);

    state.teams.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t.name;
      opt.textContent = t.name;
      selView.appendChild(opt);
    });
    selView.value = state.teams.some(t => t.name === curr) ? curr : '';
    state.optViewTeam = selView.value;
  }

  function getPlayerColor(teamIdx, playerIdx) {
    if (state.autoColor) {
      const conf = MODES[state.mode] || MODES['2v2'];
      const globalIdx = teamIdx * conf.size + playerIdx;
      return AUTO_COLORS[globalIdx % AUTO_COLORS.length];
    }
    const t = state.teams[teamIdx];
    if (t && t.colorIdx > 0) {
      return SELECT_COLORS[t.colorIdx]?.color || '';
    }
    return '';
  }

  function getPtsTable() {
    return state.players === '12' ? POINTS_12 : POINTS_24;
  }

  function calcScores() {
    const ptsTable = getPtsTable();
    const totalPlayers = parseInt(state.players, 10) || 24;
    const conf = MODES[state.mode] || MODES['2v2'];

    let flatPlayers = [];
    state.teams.forEach((t, ti) => {
      t.players.forEach((p, pi) => {
        flatPlayers.push({
          teamId: t.id,
          teamName: t.name,
          playerIdx: pi,
          pName: p.name || ('P' + (ti * conf.size + pi + 1)),
          color: getPlayerColor(ti, pi),
          isCpu: false,
          scores: new Array(state.racesData.length).fill(0),
          ranks: new Array(state.racesData.length).fill(null),
          total: 0
        });
      });
    });

    while (flatPlayers.length < totalPlayers) {
      flatPlayers.push({
        teamId: -1,
        teamName: 'CPU',
        playerIdx: 0,
        pName: 'CPU',
        color: CPU_COLOR,
        isCpu: true,
        scores: new Array(state.racesData.length).fill(0),
        ranks: new Array(state.racesData.length).fill(null),
        total: 0
      });
    }

    let raceStatuses = [];
    state.racesData.forEach((r, ri) => {
      let used = new Set();
      let dups = new Set();
      let counts = {};
      let filledCount = 0;

      r.forEach(v => {
        if (v !== null) {
          filledCount++;
          counts[v] = (counts[v] || 0) + 1;
          if (counts[v] > 1) dups.add(v);
          used.add(v);
        }
      });

      let isError = (dups.size > 0);
      let isComplete = (filledCount === totalPlayers && !isError);
      let isPartial = (filledCount > 0 && filledCount < totalPlayers && !isError);

      let finalRanks = new Array(totalPlayers).fill(null);
      if (isComplete) {
        for (let i = 0; i < totalPlayers; i++) finalRanks[i] = r[i];
      } else if (isPartial) {
        let remain = [];
        for (let i = 1; i <= totalPlayers; i++) {
          if (!used.has(i)) remain.push(i);
        }
        remain.sort((a, b) => a - b);
        let rIdx = 0;
        for (let i = 0; i < totalPlayers; i++) {
          if (r[i] !== null) {
            finalRanks[i] = r[i];
          } else {
            finalRanks[i] = remain[rIdx++] || totalPlayers;
          }
        }
      }

      for (let i = 0; i < totalPlayers; i++) {
        if (isComplete || isPartial) {
          const rk = finalRanks[i];
          if (rk >= 1 && rk <= ptsTable.length) {
            flatPlayers[i].scores[ri] = ptsTable[rk - 1];
          }
          flatPlayers[i].ranks[ri] = r[i];
        } else {
          flatPlayers[i].ranks[ri] = r[i];
        }
      }

      raceStatuses.push({ isError, isComplete, isPartial, dups });
    });

    flatPlayers.forEach(p => {
      p.total = p.scores.reduce((a, b) => a + b, 0);
    });

    let teamMap = {};
    state.teams.forEach(t => {
      teamMap[t.id] = { id: t.id, name: t.name, total: 0, pScores: [] };
    });

    flatPlayers.forEach(p => {
      if (teamMap[p.teamId]) {
        teamMap[p.teamId].total += p.total;
        teamMap[p.teamId].pScores.push(p);
      }
    });

    let teamsResult = Object.values(teamMap);
    teamsResult.sort((a, b) => b.total - a.total);

    return { flatPlayers, teamsResult, raceStatuses };
  }

  function calcAdjLogs(flatPlayers, teamsResult, raceStatuses) {
    const ptsTable = getPtsTable();
    const totalPlayers = parseInt(state.players, 10) || 24;
    const totalRaces = parseInt(state.races, 10) || 12;
    const conf = MODES[state.mode] || MODES['2v2'];
    const maxDiffLimit = MAXDIFF[state.players][state.mode] ?? 0;

    let compCount = raceStatuses.filter(s => s.isComplete || s.isPartial).length;
    if (compCount === 0 || maxDiffLimit === 0) return { logs: [], teamAdj: {} };

    let teamAdj = {};
    state.teams.forEach(t => { teamAdj[t.id] = 0; });

    let logs = [];
    let currentRacesData = structuredCloneSafe(state.racesData);

    for (let ri = 0; ri < totalRaces; ri++) {
      let st = raceStatuses[ri];
      if (!st.isComplete && !st.isPartial) continue;

      let roundPlayers = [];
      state.teams.forEach((t, ti) => {
        t.players.forEach((p, pi) => {
          let idx = ti * conf.size + pi;
          let rk = currentRacesData[ri][idx];
          let finalRk = rk;
          if (st.isPartial && rk === null) {
            let used = new Set(currentRacesData[ri].filter(v => v !== null));
            let remain = [];
            for (let k = 1; k <= totalPlayers; k++) if (!used.has(k)) remain.push(k);
            remain.sort((a, b) => a - b);
            let rIdx = 0;
            for (let k = 0; k < totalPlayers; k++) {
              if (k === idx) {
                finalRk = remain[rIdx] || totalPlayers;
                break;
              }
              if (currentRacesData[ri][k] === null) rIdx++;
            }
          }
          roundPlayers.push({
            teamId: t.id,
            teamName: t.name,
            rank: finalRk,
            score: (finalRk >= 1 && finalRk <= ptsTable.length) ? ptsTable[finalRk - 1] : 0
          });
        });
      });

      let roundTeams = {};
      state.teams.forEach(t => { roundTeams[t.id] = 0; });
      roundPlayers.forEach(p => {
        if (roundTeams[p.teamId] !== undefined) roundTeams[p.teamId] += p.score;
      });

      if (state.realtimeLog) {
        let tIds = state.teams.map(t => t.id);
        for (let i = 0; i < tIds.length; i++) {
          for (let j = i + 1; j < tIds.length; j++) {
            let tA = tIds[i];
            let tB = tIds[j];
            let diff = (roundTeams[tA] + teamAdj[tA]) - (roundTeams[tB] + teamAdj[tB]);
            if (Math.abs(diff) > maxDiffLimit) {
              let tAName = state.teams.find(t => t.id === tA)?.name || '';
              let tBName = state.teams.find(t => t.id === tB)?.name || '';
              if (diff > maxDiffLimit) {
                let adj = diff - maxDiffLimit;
                teamAdj[tB] += adj;
                logs.push(`R${ri + 1}: ${tAName} vs ${tBName} 補正点+${adj} (${tBName}へ)`);
              } else {
                let adj = Math.abs(diff) - maxDiffLimit;
                teamAdj[tA] += adj;
                logs.push(`R${ri + 1}: ${tBName} vs ${tAName} 補正点+${adj} (${tAName}へ)`);
              }
            }
          }
        }
      } else {
        if (ri === compCount - 1) {
          let cumTeams = {};
          state.teams.forEach(t => {
            cumTeams[t.id] = flatPlayers.filter(p => p.teamId === t.id).reduce((sum, p) => {
              let sSum = 0;
              for (let k = 0; k <= ri; k++) sSum += p.scores[k] || 0;
              return sum + sSum;
            }, 0);
          });
          let tIds = state.teams.map(t => t.id);
          let loop = true;
          while (loop) {
            loop = false;
            for (let i = 0; i < tIds.length; i++) {
              for (let j = i + 1; j < tIds.length; j++) {
                let tA = tIds[i];
                let tB = tIds[j];
                let diff = (cumTeams[tA] + teamAdj[tA]) - (cumTeams[tB] + teamAdj[tB]);
                if (Math.abs(diff) > maxDiffLimit) {
                  let tAName = state.teams.find(t => t.id === tA)?.name || '';
                  let tBName = state.teams.find(t => t.id === tB)?.name || '';
                  if (diff > maxDiffLimit) {
                    let adj = diff - maxDiffLimit;
                    teamAdj[tB] += adj;
                    logs.push(`累計補正: ${tAName} vs ${tBName} 補正点+${adj} (${tBName}へ)`);
                    loop = true;
                  } else {
                    let adj = Math.abs(diff) - maxDiffLimit;
                    teamAdj[tA] += adj;
                    logs.push(`累計補正: ${tBName} vs ${tAName} 補正点+${adj} (${tAName}へ)`);
                    loop = true;
                  }
                }
              }
            }
          }
        }
      }
    }
    return { logs, teamAdj };
  }

  function calcCertLines(flatPlayers, teamsResult, raceStatuses, teamAdj) {
    const ptsTable = getPtsTable();
    const totalRaces = parseInt(state.races, 10) || 12;
    const conf = MODES[state.mode] || MODES['2v2'];

    let compCount = raceStatuses.filter(s => s.isComplete || s.isPartial).length;
    let remainRaces = totalRaces - compCount;
    let certMap = {};

    state.teams.forEach(t => {
      let base = flatPlayers.filter(p => p.teamId === t.id).reduce((a, b) => a + b.total, 0) + (teamAdj[t.id] || 0);
      certMap[t.id] = { min: base, max: base };
    });

    if (remainRaces > 0 && state.teams.length > 0) {
      let maxRoundTeamScore = 0;
      let minRoundTeamScore = 0;

      let sortedPts = [...ptsTable].sort((a, b) => b - a);
      for (let i = 0; i < conf.size; i++) maxRoundTeamScore += sortedPts[i] || 0;
      for (let i = 0; i < conf.size; i++) minRoundTeamScore += sortedPts[sortedPts.length - 1 - i] || 0;

      state.teams.forEach(t => {
        certMap[t.id].max += maxRoundTeamScore * remainRaces;
        certMap[t.id].min += minRoundTeamScore * remainRaces;
      });
    }

    let certResults = {};
    state.teams.forEach(tA => {
      let isWinCert = true;
      let isLoseCert = true;
      state.teams.forEach(tB => {
        if (tA.id === tB.id) return;
        if (certMap[tA.id].min <= certMap[tB.id].max) isWinCert = false;
        if (certMap[tA.id].max >= certMap[tB.id].min) isLoseCert = false;
      });
      if (isWinCert) certResults[tA.id] = 'win';
      else if (isLoseCert) certResults[tA.id] = 'lose';
      else certResults[tA.id] = '';
    });

    return certResults;
  }

  function buildRankTable() {
    if (!tblRank) return;
    tblRank.textContent = '';

    const totalRaces = parseInt(state.races, 10) || 12;
    const { flatPlayers, teamsResult, raceStatuses } = calcScores();
    const { logs, teamAdj } = calcAdjLogs(flatPlayers, teamsResult, raceStatuses);
    const certResults = calcCertLines(flatPlayers, teamsResult, raceStatuses, teamAdj);

    let thead = document.createElement('thead');
    let trHead = document.createElement('tr');

    let thRank = document.createElement('th');
    thRank.style.width = 'var(--rankw)';
    thRank.textContent = '順位';
    trHead.appendChild(thRank);

    let thTeam = document.createElement('th');
    thTeam.className = 'rowHead';
    thTeam.style.width = '110px';
    thTeam.textContent = 'チーム';
    trHead.appendChild(thTeam);

    let thTotal = document.createElement('th');
    thTotal.style.width = 'var(--scorew)';
    thTotal.textContent = '計';
    trHead.appendChild(thTotal);

    if (state.showCert) {
      let thCert = document.createElement('th');
      thCert.style.width = '50px';
      thCert.textContent = '確実';
      trHead.appendChild(thCert);
    }

    let thPlayer = document.createElement('th');
    thPlayer.style.width = '90px';
    thPlayer.textContent = 'プレイヤー';
    trHead.appendChild(thPlayer);

    let thPTotal = document.createElement('th');
    thPTotal.style.width = 'var(--scorew)';
    thPTotal.textContent = '点';
    trHead.appendChild(thPTotal);

    for (let i = 0; i < totalRaces; i++) {
      let thR = document.createElement('th');
      thR.style.width = 'var(--racew)';
      let st = raceStatuses[i];
      if (st && st.isError) thR.style.color = 'var(--err)';
      thR.textContent = 'R' + (i + 1);
      trHead.appendChild(thR);
    }
    thead.appendChild(trHead);
    tblRank.appendChild(thead);

    let tbody = document.createElement('tbody');
    const conf = MODES[state.mode] || MODES['2v2'];

    teamsResult.forEach((tRes, tIdx) => {
      let tId = tRes.id;
      let tName = tRes.name;
      let tColor = getPlayerColor(state.teams.findIndex(t => t.id === tId), 0);
      let finalTeamTotal = tRes.total + (teamAdj[tId] || 0);

      tRes.pScores.sort((a, b) => b.total - a.total);

      tRes.pScores.forEach((pRes, pIdx) => {
        let tr = document.createElement('tr');

        if (pIdx === 0) {
          let tdRank = document.createElement('td');
          tdRank.rowSpan = conf.size;
          tdRank.className = 'rankCell';
          let rankLeadClass = (tIdx === 0) ? 'topRank' : (tIdx === 1) ? 'secRank' : (tIdx === 2) ? 'thirdRank' : '';
          let spanRank = document.createElement('span');
          spanRank.className = 'rankLead ' + rankLeadClass;
          spanRank.textContent = String(tIdx + 1);
          tdRank.appendChild(spanRank);
          tr.appendChild(tdRank);

          let tdTeam = document.createElement('td');
          tdTeam.rowSpan = conf.size;
          tdTeam.className = 'rowHead';
          if (tColor) tdTeam.style.borderLeft = '4px solid ' + tColor;
          let spanTeam = document.createElement('span');
          spanTeam.textContent = tName;
          tdTeam.appendChild(spanTeam);
          tr.appendChild(tdTeam);

          let tdTotal = document.createElement('td');
          tdTotal.rowSpan = conf.size;
          tdTotal.className = 'scoreCell';
          tdTotal.textContent = String(finalTeamTotal);
          tr.appendChild(tdTotal);

          if (state.showCert) {
            let tdCert = document.createElement('td');
            tdCert.rowSpan = conf.size;
            tdCert.className = 'certCell';
            let cRes = certResults[tId];
            if (cRes === 'win') {
              tdCert.className += ' ok';
              tdCert.textContent = '勝ち確';
            } else if (cRes === 'lose') {
              tdCert.className += ' err';
              tdCert.textContent = '負け確';
            } else {
              tdCert.textContent = '--';
            }
            tr.appendChild(tdCert);
          }
        }

        let tdPName = document.createElement('td');
        tdPName.style.textAlign = 'left';
        tdPName.style.paddingLeft = '4px';
        tdPName.textContent = pRes.pName;
        tr.appendChild(tdPName);

        let tdPTotal = document.createElement('td');
        tdPTotal.textContent = String(pRes.total);
        tr.appendChild(tdPTotal);

        let globalPlayerIdx = state.teams.findIndex(t => t.id === pRes.teamId) * conf.size + pRes.playerIdx;

        for (let ri = 0; ri < totalRaces; ri++) {
          let tdR = document.createElement('td');
          tdR.className = 'raceCell';
          let rVal = pRes.ranks[ri];
          let st = raceStatuses[ri];

          if (rVal !== null) {
            tdR.className += ' hasVal';
            if (st && st.dups.has(rVal)) {
              tdR.className += ' isDup';
            }
            tdR.textContent = String(rVal);
          } else if (st && (st.isComplete || st.isPartial)) {
            tdR.className += ' isComp';
            let mockRanks = new Array(parseInt(state.players, 10)).fill(null);
            for (let k = 0; k < mockRanks.length; k++) mockRanks[k] = state.racesData[ri][k];
            let used = new Set(mockRanks.filter(v => v !== null));
            let remain = [];
            for (let k = 1; k <= mockRanks.length; k++) if (!used.has(k)) remain.push(k);
            remain.sort((a, b) => a - b);
            let rIdx = 0;
            let finalRk = null;
            for (let k = 0; k < mockRanks.length; k++) {
              if (k === globalPlayerIdx) {
                finalRk = remain[rIdx] || mockRanks.length;
                break;
              }
              if (mockRanks[k] === null) rIdx++;
            }
            tdR.textContent = finalRk ? `(${finalRk})` : '-';
          } else {
            tdR.textContent = '-';
          }

          tdR.addEventListener('click', (e) => {
            e.preventDefault();
            handleRaceCellClick(ri, globalPlayerIdx);
          });
          tr.appendChild(tdR);
        }

        tbody.appendChild(tr);
      });
    });
    tblRank.appendChild(tbody);
  }

  function handleRaceCellClick(raceIdx, playerIdx) {
    pushState();
    const totalPlayers = parseInt(state.players, 10) || 24;
    let curr = state.racesData[raceIdx][playerIdx];
    if (curr === null) {
      state.racesData[raceIdx][playerIdx] = 1;
    } else if (curr >= totalPlayers) {
      state.racesData[raceIdx][playerIdx] = null;
    } else {
      state.racesData[raceIdx][playerIdx] = curr + 1;
    }
    runCalcByCurrentValidState(true);
    scheduleSave();
  }

  function buildTagTables() {
    if (!tblTag) return;
    tblTag.textContent = '';

    let thead = document.createElement('thead');
    let trHead = document.createElement('tr');
    let thTeam = document.createElement('th');
    thTeam.textContent = 'チーム名';
    thTeam.style.width = '140px';
    trHead.appendChild(thTeam);

    let thColor = document.createElement('th');
    thColor.textContent = '色';
    thColor.style.width = '90px';
    trHead.appendChild(thColor);

    const conf = MODES[state.mode] || MODES['2v2'];
    for (let i = 0; i < conf.size; i++) {
      let thP = document.createElement('th');
      thP.textContent = '枠' + (i + 1);
      trHead.appendChild(thP);
    }
    thead.appendChild(trHead);
    tblTag.appendChild(thead);

    let tbody = document.createElement('tbody');
    state.teams.forEach((t, ti) => {
      let tr = document.createElement('tr');

      let tdName = document.createElement('td');
      tdName.className = 'tblTagCellName';
      let ipName = document.createElement('input');
      ipName.type = 'text';
      ipName.value = t.name || '';
      ipName.addEventListener('change', () => {
        pushState();
        t.name = ipName.value.trim() || ('Team ' + String.fromCharCode(65 + ti));
        buildOptViewOptions();
        runCalcByCurrentValidState(false);
        scheduleSave();
      });
      tdName.appendChild(ipName);
      tr.appendChild(tdName);

      let tdColor = document.createElement('td');
      tdColor.className = 'tblTagCellColor';
      if (state.autoColor) {
        tdColor.style.background = '#eee';
        tdColor.style.color = '#666';
        tdColor.style.fontSize = '11px';
        tdColor.textContent = '自動割り当て';
      } else {
        let selC = document.createElement('select');
        SELECT_COLORS.forEach((c, ci) => {
          let opt = document.createElement('option');
          opt.value = String(ci);
          opt.textContent = c.name;
          selC.appendChild(opt);
        });
        selC.value = String(t.colorIdx || 0);
        let currColor = SELECT_COLORS[t.colorIdx || 0]?.color;
        if (currColor) selC.style.backgroundColor = currColor;
        selC.addEventListener('change', () => {
          pushState();
          t.colorIdx = parseInt(selC.value, 10) || 0;
          let nextColor = SELECT_COLORS[t.colorIdx]?.color;
          selC.style.backgroundColor = nextColor || '';
          runCalcByCurrentValidState(false);
          scheduleSave();
        });
        tdColor.appendChild(selC);
      }
      tr.appendChild(tdColor);

      t.players.forEach((p, pi) => {
        let tdP = document.createElement('td');
        let ipP = document.createElement('input');
        ipP.type = 'text';
        ipP.placeholder = 'P' + (ti * conf.size + pi + 1);
        ipP.value = p.name || '';
        ipP.addEventListener('change', () => {
          pushState();
          p.name = ipP.value.trim();
          runCalcByCurrentValidState(false);
          scheduleSave();
        });
        tdP.appendChild(ipP);
        tr.appendChild(tdP);
      });

      tbody.appendChild(tr);
    });
    tblTag.appendChild(tbody);
  }

  function generateOutputs() {
    const { flatPlayers, teamsResult, raceStatuses } = calcScores();
    const { logs, teamAdj } = calcAdjLogs(flatPlayers, teamsResult, raceStatuses);

    let compCount = raceStatuses.filter(s => s.isComplete || s.isPartial).length;
    let totalRaces = parseInt(state.races, 10) || 12;

    let leadStr = (compCount >= totalRaces) ? '【集計完了】' : `【${compCount}R終了時】`;

    let normalLines = [leadStr];
    teamsResult.forEach((t, i) => {
      let finalT = t.total + (teamAdj[t.id] || 0);
      normalLines.push(`${i + 1}位 ${t.name} ${finalT}pts`);
    });
    if (outText) outText.textContent = normalLines.join('\n');

    let indivLines = [`${leadStr} (個人寸評)`];
    let sortedPlayers = [...flatPlayers].sort((a, b) => b.total - a.total);
    sortedPlayers.forEach((p, i) => {
      if (!p.isCpu) {
        indivLines.push(`${i + 1}位 ${p.pName} (${p.teamName}) ${p.total}pts`);
      }
    });
    if (outIndiv) outIndiv.textContent = indivLines.join('\n');

    if (state.optViewTeam && outOpt) {
      let tRes = teamsResult.find(t => t.name === state.optViewTeam);
      if (tRes) {
        let finalT = tRes.total + (teamAdj[tRes.id] || 0);
        let optLines = [`${leadStr} ${tRes.name} 視点`, `チーム合計: ${finalT}pts`];
        tRes.pScores.forEach(p => {
          optLines.push(` - ${p.pName}: ${p.total}pts`);
        });
        outOpt.textContent = optLines.join('\n');
      } else {
        outOpt.textContent = '';
      }
    } else if (outOpt) {
      outOpt.textContent = '';
    }
  }

  function renderAdjLog() {
    if (!logAdj) return;
    const { flatPlayers, teamsResult, raceStatuses } = calcScores();
    const { logs } = calcAdjLogs(flatPlayers, teamsResult, raceStatuses);
    if (logs.length > 0) {
      logAdj.textContent = logs.join('\n');
    } else {
      logAdj.textContent = '補正履歴なし';
    }
  }

  function renderCourseLog(coursesArr) {
    if (!logCourse) return;
    if (!state.showCourseLog) {
      logCourse.textContent = '非表示';
      return;
    }
    let lines = [];
    if (Array.isArray(coursesArr)) {
      coursesArr.forEach((c, i) => {
        if (c) lines.push(`R${i + 1}: ${c}`);
      });
    }
    logCourse.textContent = lines.length > 0 ? lines.join('\n') : 'コース未選択';
  }

  function renderPinPreview() {
    if (!pinBarContent) return;
    pinBarContent.textContent = '';
    const { flatPlayers, teamsResult, raceStatuses } = calcScores();
    const { logs, teamAdj } = calcAdjLogs(flatPlayers, teamsResult, raceStatuses);

    teamsResult.forEach((t, i) => {
      let finalT = t.total + (teamAdj[t.id] || 0);
      let div = document.createElement('div');
      div.className = 'pinItem' + (i === 0 ? ' top' : '');

      let sRank = document.createElement('span');
      sRank.textContent = `${i + 1}位`;
      div.appendChild(sRank);

      let sName = document.createElement('span');
      sName.className = 'pinName';
      sName.textContent = t.name;
      div.appendChild(sName);

      let sScore = document.createElement('span');
      sScore.className = 'pinScore';
      sScore.textContent = `${finalT}pt`;
      div.appendChild(sScore);

      pinBarContent.appendChild(div);
    });
  }

  async function copyText(el) {
    if (!el) return;
    let txt = el.textContent || '';
    if (!txt) return;
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        await navigator.clipboard.writeText(txt);
        return;
      }
    } catch (e) {}
    try {
      let ta = document.createElement('textarea');
      ta.value = txt;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    } catch (err) {}
  }

  async function runCalcByCurrentValidState(skipUiRebuild) {
    if (!skipUiRebuild) {
      buildTagTables();
    }
    buildRankTable();
    generateOutputs();
    renderAdjLog();
    renderPinPreview();
    if (state.showCourseLog) {
      renderCourseLog(state.courses);
    }
  }

  function scheduleSave() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      state.lastUpdated = nowMs();
      const { raceStatuses } = calcScores();
      let isAllComp = raceStatuses.every(s => s.isComplete);
      if (isAllComp && state.racesData.length > 0) {
        if (!state.finishedAt) state.finishedAt = nowMs();
      } else {
        state.finishedAt = 0;
      }
      try {
        localStorage.setItem(LS_KEY, JSON.stringify(state));
      } catch (e) {}
    }, 1000);
  }

  function loadSaved() {
    try {
      let raw = localStorage.getItem(LS_KEY);
      if (raw) {
        let parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          if (parsed.players) state.players = String(parsed.players);
          if (parsed.mode) state.mode = String(parsed.mode);
          if (parsed.races) state.races = parseInt(parsed.races, 10) || 12;
          if (parsed.autoColor !== undefined) state.autoColor = !!parsed.autoColor;
          if (parsed.showCert !== undefined) state.showCert = !!parsed.showCert;
          if (parsed.realtimeLog !== undefined) state.realtimeLog = !!parsed.realtimeLog;
          if (parsed.showCourseLog !== undefined) state.showCourseLog = !!parsed.showCourseLog;
          if (parsed.optViewTeam !== undefined) state.optViewTeam = String(parsed.optViewTeam);
          if (Array.isArray(parsed.teams)) state.teams = parsed.teams;
          if (Array.isArray(parsed.racesData)) state.racesData = parsed.racesData;
          if (Array.isArray(parsed.courses)) state.courses = parsed.courses;
          if (parsed.finishedAt) state.finishedAt = parseInt(parsed.finishedAt, 10) || 0;
          if (parsed.lastUpdated) state.lastUpdated = parseInt(parsed.lastUpdated, 10) || 0;
        }
      }
    } catch (e) {}
  }

  function updateRecoveryButton() {
    if (!btnRecovery) return;
    btnRecovery.classList.add('hidden');
  }

  function showPin() {
    if (pinBar) {
      pinBar.classList.remove('hidden');
      pinBar.setAttribute('aria-hidden', 'false');
    }
  }

  function hidePin() {
    if (pinBar) {
      pinBar.classList.add('hidden');
      pinBar.setAttribute('aria-hidden', 'true');
    }
  }

  function openModal() {
    if (modalSpec) {
      modalSpec.classList.remove('hidden');
      modalSpec.setAttribute('aria-hidden', 'false');
    }
  }

  function closeModal() {
    if (modalSpec) {
      modalSpec.classList.add('hidden');
      modalSpec.setAttribute('aria-hidden', 'true');
    }
  }

  function setTabOrder() {
    // 構造変更を伴わないオリジナルのタブインデックス制御を維持
  }

  function initControls() {
    document.querySelectorAll(`input[name="players"]`).forEach(r => {
      r.checked = (r.value === state.players);
      r.addEventListener('change', async () => {
        pushState();
        state.players = r.value;
        if (spMaxDiff) spMaxDiff.textContent = String(MAXDIFF[state.players][state.mode] ?? '--');
        ensureTeams();
        ensureSelections();
        pruneInputs();
        buildOptViewOptions();
        await runCalcByCurrentValidState(false);
        scheduleSave();
      });
    });

    buildModeOptions();
    if (selMode) {
      selMode.value = state.mode;
      selMode.addEventListener('change', async () => {
        pushState();
        state.mode = selMode.value;
        if (spMaxDiff) spMaxDiff.textContent = String(MAXDIFF[state.players][state.mode] ?? '--');
        ensureTeams();
        ensureSelections();
        pruneInputs();
        buildOptViewOptions();
        await runCalcByCurrentValidState(false);
        scheduleSave();
      });
    }

    document.querySelectorAll(`input[name="races"]`).forEach(r => {
      r.checked = (parseInt(r.value, 10) === state.races);
      r.addEventListener('change', async () => {
        pushState();
        state.races = parseInt(r.value, 10) || 12;
        ensureSelections();
        await runCalcByCurrentValidState(false);
        scheduleSave();
      });
    });

    if (chkAutoColor) {
      chkAutoColor.checked = state.autoColor;
      chkAutoColor.addEventListener('change', async () => {
        pushState();
        state.autoColor = chkAutoColor.checked;
        await runCalcByCurrentValidState(false);
        scheduleSave();
      });
    }

    if (chkShowCert) {
      chkShowCert.checked = state.showCert;
    }
    if (chkRealtimeLog) {
      chkRealtimeLog.checked = state.realtimeLog;
      chkRealtimeLog.addEventListener('change', async () => {
        pushState();
        state.realtimeLog = chkRealtimeLog.checked;
        await runCalcByCurrentValidState(false);
        scheduleSave();
      });
    }

    if (chkShowCourseLog) {
      chkShowCourseLog.checked = state.showCourseLog;
    }

    if (btnUndo) {
      btnUndo.addEventListener('click', async () => {
        if (undoStack.length > 0) {
          let prev = undoStack.pop();
          redoStack.push(JSON.stringify({ teams: state.teams, racesData: state.racesData, courses: state.courses }));
          let parsed = JSON.parse(prev);
          state.teams = parsed.teams;
          state.racesData = parsed.racesData;
          state.courses = parsed.courses;
          updateUndoRedoButtons();
          await runCalcByCurrentValidState(false);
          scheduleSave();
        }
      });
    }

    if (btnRedo) {
      btnRedo.addEventListener('click', async () => {
        if (redoStack.length > 0) {
          let next = redoStack.pop();
          undoStack.push(JSON.stringify({ teams: state.teams, racesData: state.racesData, courses: state.courses }));
          let parsed = JSON.parse(next);
          state.teams = parsed.teams;
          state.racesData = parsed.racesData;
          state.courses = parsed.courses;
          updateUndoRedoButtons();
          await runCalcByCurrentValidState(false);
          scheduleSave();
        }
      });
    }

    if (btnReset) {
      btnReset.addEventListener('click', async () => {
        if (confirm('すべての入力データを初期化しますか？')) {
          pushState();
          localStorage.removeItem(LS_KEY);
          state.teams = [];
          state.racesData = [];
          state.courses = [];
          state.finishedAt = 0;
          ensureTeams();
          ensureSelections();
          buildOptViewOptions();
          await runCalcByCurrentValidState(false);
          scheduleSave();
        }
      });
    }

    if (btnCopyText) btnCopyText.addEventListener('click', () => copyText(outText));
    if (btnCopyIndiv) btnCopyIndiv.addEventListener('click', () => copyText(outIndiv));
    if (btnCopyOpt) btnCopyOpt.addEventListener('click', () => copyText(outOpt));

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

  function init() {
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
    if (spMaxDiff) spMaxDiff.textContent = String(MAXDIFF[state.players][state.mode] ?? '--');
    renderAdjLog();
    renderCourseLog(state.courses);
    updateRecoveryButton();
    setTabOrder();
    runCalcByCurrentValidState(false).then(() => {
      suppressNewRaceCheck = false;
      state.lastUpdated = state.lastUpdated || nowMs();
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
