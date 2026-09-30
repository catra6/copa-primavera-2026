/* ============================================
   APP - UI Controller
   Flashscore-style with visual bracket
   ============================================ */

const App = (() => {
  let data = null;
  let currentTab = 'standings';
  let currentPhase = 1;
  let currentFixturePhase = 0; // index into data.fixture
  let currentPlayoffRound = 0; // 0: Cuartos, 1: Semis, 2: Final

  async function init() {
    bindEvents();
    await loadData();
  }

  async function loadData() {
    showLoading(true);
    try {
      data = await DataSource.load();
      console.log('Data:', data);
      render();
    } catch (err) {
      console.error('Failed:', err);
      document.getElementById('mainContent').innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">⚠️</div>
          <p class="empty-state-text">No se pudieron cargar los datos. Reintentá en unos segundos.</p>
        </div>`;
    } finally {
      showLoading(false);
    }
  }

  function bindEvents() {
    document.querySelectorAll('.nav-tab').forEach(tab => {
      tab.addEventListener('click', () => switchTab(tab.dataset.tab));
    });

    document.getElementById('phaseSelector').addEventListener('click', (e) => {
      const btn = e.target.closest('.phase-btn');
      if (!btn) return;
      currentPhase = parseInt(btn.dataset.phase);
      document.querySelectorAll('#phaseSelector .phase-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderStandings();
    });

    document.getElementById('fixturePhaseSelector').addEventListener('click', (e) => {
      const btn = e.target.closest('.phase-btn');
      if (!btn) return;
      currentFixturePhase = parseInt(btn.dataset.fixturePhase);
      document.querySelectorAll('#fixturePhaseSelector .phase-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderFixture();
    });

    document.addEventListener('click', (e) => {
      const playoffBtn = e.target.closest('#playoffRoundSelector .phase-btn');
      if (playoffBtn) {
        setPlayoffRound(parseInt(playoffBtn.dataset.playoffRound));
        return;
      }
      const bracketCol = e.target.closest('.bracket-column');
      if (bracketCol && bracketCol.dataset.col !== undefined) {
        setPlayoffRound(parseInt(bracketCol.dataset.col));
      }
    });
  }

  function setPlayoffRound(roundIndex) {
    currentPlayoffRound = roundIndex;
    const selector = document.getElementById('playoffRoundSelector');
    if (selector) {
      selector.querySelectorAll('.phase-btn').forEach(b => {
        b.classList.toggle('active', parseInt(b.dataset.playoffRound) === roundIndex);
      });
    }
    const bracket = document.querySelector('.bracket');
    if (bracket) {
      bracket.setAttribute('data-active-col', roundIndex);
      const targetCol = bracket.querySelector(`.bracket-column[data-col="${roundIndex}"]`);
      bracket.querySelectorAll('.bracket-column').forEach(col => {
        col.classList.toggle('active-col', col === targetCol);
      });
      if (targetCol) {
        targetCol.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
      }
    }
  }

  function initPlayoffScrollSync() {
    const wrapper = document.querySelector('.bracket-wrapper');
    if (!wrapper || wrapper.dataset.syncBound) return;
    wrapper.dataset.syncBound = 'true';

    let ticking = false;
    wrapper.addEventListener('scroll', () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          syncActiveColFromScroll(wrapper);
          ticking = false;
        });
        ticking = true;
      }
    }, { passive: true });
  }

  function syncActiveColFromScroll(wrapper) {
    const columns = wrapper.querySelectorAll('.bracket-column');
    if (!columns.length) return;

    const wrapperRect = wrapper.getBoundingClientRect();
    const wrapperCenter = wrapperRect.left + wrapperRect.width / 2;

    let closestIndex = currentPlayoffRound;
    let minDiff = Infinity;

    columns.forEach(col => {
      const colRect = col.getBoundingClientRect();
      const colCenter = colRect.left + colRect.width / 2;
      const diff = Math.abs(wrapperCenter - colCenter);
      if (diff < minDiff) {
        minDiff = diff;
        closestIndex = parseInt(col.dataset.col);
      }
    });

    if (currentPlayoffRound !== closestIndex && !isNaN(closestIndex)) {
      currentPlayoffRound = closestIndex;
      const selector = document.getElementById('playoffRoundSelector');
      if (selector) {
        selector.querySelectorAll('.phase-btn').forEach(b => {
          b.classList.toggle('active', parseInt(b.dataset.playoffRound) === closestIndex);
        });
      }
      const bracket = document.querySelector('.bracket');
      if (bracket) {
        bracket.setAttribute('data-active-col', closestIndex);
        columns.forEach(col => {
          col.classList.toggle('active-col', parseInt(col.dataset.col) === closestIndex);
        });
      }
    }
  }

  function switchTab(tabId) {
    currentTab = tabId;
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
    document.querySelector(`[data-tab="${tabId}"]`)?.classList.add('active');
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.getElementById(`tab-${tabId}`)?.classList.add('active');
    const subtitles = { standings: 'Posiciones', fixture: 'Fixture', playoffs: 'Playoffs' };
    document.querySelector('.app-subtitle').textContent = subtitles[tabId] || '';
    render();
  }

  function render() {
    if (!data) return;
    switch (currentTab) {
      case 'standings': renderStandings(); break;
      case 'fixture': renderFixture(); break;
      case 'playoffs': renderPlayoffs(); break;
    }
  }

  // =============================================
  // Standings
  // =============================================

  /**
   * Check if all phase 2 matches are completed.
   * Every team in fase2 groups must have played === 3.
   */
  function isPhase2Complete() {
    if (!data.fase2 || data.fase2.length === 0) return false;
    for (const group of data.fase2) {
      if (!group.teams || group.teams.length === 0) return false;
      for (const team of group.teams) {
        if (team.played < 3) return false;
      }
    }
    return true;
  }

  function renderStandings() {
    const container = document.getElementById('groupsContainer');
    const rawGroups = currentPhase === 1 ? data.fase1 : data.fase2;
    const phaseFixture = data.fixture[currentPhase - 1] || null;
    const calculated = TournamentEngine.calculateStandings(phaseFixture, rawGroups);
    const groups = (calculated && calculated.length > 0) ? calculated : rawGroups;
    const phaseMatches = phaseFixture ? TournamentEngine.getPhaseMatches(phaseFixture) : [];

    // Phase 2 locked until all matches are played
    if (currentPhase === 2 && !isPhase2Complete()) {
      // Count total played matches across all fase2 teams
      let totalPlayed = 0;
      let totalTeams = 0;
      for (const group of data.fase2) {
        for (const team of group.teams) {
          totalPlayed += team.played;
          totalTeams++;
        }
      }
      // Each match is counted twice (once per team), so actual matches played = totalPlayed / 2
      const matchesPlayed = Math.floor(totalPlayed / 2);
      // 8 teams × 3 games / 2 = 12 total matches
      const totalMatches = Math.floor((totalTeams * 3) / 2);

      let html = '<div class="standings-locked-wrapper">';
      html += '<div class="standings-locked-overlay">';
      html += '<div class="locked-icon">🔒</div>';
      html += '<p class="locked-title">Tabla no disponible</p>';
      html += `<p class="locked-subtitle">Se revelan las posiciones cuando se completen todos los partidos de la Fase 2.</p>`;
      html += `<p class="locked-progress">${matchesPlayed} / ${totalMatches} partidos jugados</p>`;
      html += '</div>';

      // Render blurred table behind the overlay
      html += '<div class="standings-blurred">';
      groups.forEach((group, gi) => {
        const sortedTeams = TournamentEngine.sortStandings(group.teams, phaseMatches);
        html += `
          <div class="group-card" style="animation-delay: ${gi * 0.05}s">
            <div class="group-header">
              <h2>${group.name}</h2>
            </div>
            <div class="table-scroll">
              <table class="standings-table">
                <thead>
                  <tr>
                    <th></th>
                    <th>PJ</th>
                    <th>G</th>
                    <th>E</th>
                    <th>P</th>
                    <th>DIF</th>
                    <th>GLS</th>
                    <th>PTS</th>
                  </tr>
                </thead>
                <tbody>
                  ${sortedTeams.map((t, i) => renderStandingRow(t, i, phaseFixture)).join('')}
                </tbody>
              </table>
            </div>
          </div>`;
      });
      html += '</div>'; // .standings-blurred
      html += '</div>'; // .standings-locked-wrapper

      container.innerHTML = html;
      return;
    }

    let html = '';
    groups.forEach((group, gi) => {
      const sortedTeams = TournamentEngine.sortStandings(group.teams, phaseMatches);

      html += `
        <div class="group-card" style="animation-delay: ${gi * 0.05}s">
          <div class="group-header">
            <h2>${group.name}</h2>
          </div>
          <div class="table-scroll">
            <table class="standings-table">
              <thead>
                <tr>
                  <th></th>
                  <th>PJ</th>
                  <th>G</th>
                  <th>E</th>
                  <th>P</th>
                  <th>DIF</th>
                  <th>GLS</th>
                  <th>PTS</th>
                </tr>
              </thead>
              <tbody>
                ${sortedTeams.map((t, i) => renderStandingRow(t, i, phaseFixture)).join('')}
              </tbody>
            </table>
          </div>
        </div>`;
    });

    if (data.lastUpdated) {
      html += `<p class="last-updated">Actualizado: ${formatDate(new Date(data.lastUpdated))}</p>`;
    }
    container.innerHTML = html;
  }

  function getTeamLogoHtml(teamName) {
    if (!teamName || !data || !data.logos) return '';
    const name = teamName.trim();
    const logo = data.logos[name] || data.logos[name.toLowerCase()] || '';
    if (!logo) return '';
    return `<img class="team-logo" src="${logo}" alt="${name}" referrerpolicy="no-referrer" onerror="this.style.display='none'" />`;
  }

  function renderStandingRow(team, index, phaseFixture) {
    const pos = index + 1;
    const qualified = currentPhase === 1 && pos <= 2;
    const diffPrefix = team.goalDiff > 0 ? '+' : '';
    const diffClass = team.goalDiff > 0 ? 'positive' : (team.goalDiff < 0 ? 'negative' : '');

    const logoHtml = getTeamLogoHtml(team.name);
    const isEmpty = !team.name;
    const nameHtml = isEmpty
      ? '<span class="team-name placeholder">vacío</span>'
      : `${logoHtml}<span class="team-name">${team.name}</span>`;

    return `
      <tr>
        <td>
          <div class="team-name-cell">
            <span class="team-pos-indicator ${qualified ? 'qualified' : 'eliminated'}"></span>
            <span class="team-position">${pos}</span>
            ${nameHtml}
          </div>
        </td>
        <td>${team.played}</td>
        <td>${team.won}</td>
        <td>${team.drawn}</td>
        <td>${team.lost}</td>
        <td class="col-diff ${diffClass}">${diffPrefix}${team.goalDiff}</td>
        <td class="col-gls">${team.goalsFor}:${team.goalsAgainst}</td>
        <td class="col-pts">${team.points}</td>
      </tr>`;
  }

  // =============================================
  // Fixture
  // =============================================
  function renderFixture() {
    const container = document.getElementById('fixtureContainer');
    const phase = data.fixture[currentFixturePhase];

    if (!phase || phase.rounds.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">📅</div>
          <p class="empty-state-text">Sin partidos en esta fase</p>
        </div>`;
      return;
    }

    // Group rounds by date
    const roundsByName = {};
    phase.rounds.forEach(r => {
      if (!roundsByName[r.name]) roundsByName[r.name] = [];
      roundsByName[r.name].push(...r.matches);
    });

    let html = '';
    Object.entries(roundsByName).forEach(([name, matches]) => {
      html += `
        <div class="fixture-round">
          <h3 class="round-title">${name}</h3>`;

      // Separate matches by group
      const byGroup = {};
      matches.forEach(m => {
        const g = m.group || 'Grupo A';
        if (!byGroup[g]) byGroup[g] = [];
        byGroup[g].push(m);
      });

      Object.entries(byGroup).forEach(([groupName, groupMatches]) => {
        html += `
          <div class="fixture-group-section">
            <h4 class="fixture-group-title">${groupName}</h4>
            ${groupMatches.map(m => renderMatchCard(m)).join('')}
          </div>`;
      });

      html += `</div>`;
    });

    container.innerHTML = html;
  }

  function renderMatchCard(match) {
    const isPlayed = match.homeScore !== null && match.awayScore !== null;
    const homeName = match.home || 'vacío';
    const awayName = match.away || 'vacío';
    const homeLogo = getTeamLogoHtml(match.home);
    const awayLogo = getTeamLogoHtml(match.away);

    let homeState = '', awayState = '';
    if (isPlayed) {
      if (match.homeScore > match.awayScore) { homeState = 'winner'; awayState = 'loser'; }
      else if (match.awayScore > match.homeScore) { homeState = 'loser'; awayState = 'winner'; }
      else { homeState = 'draw'; awayState = 'draw'; }
    }

    const homeClass = `match-team-name ${homeState} ${!match.home ? 'placeholder' : ''}`;
    const awayClass = `match-team-name ${awayState} ${!match.away ? 'placeholder' : ''}`;

    return `
      <div class="match-card ${isPlayed ? 'played' : ''}">
        <div class="match-team">
          ${homeLogo}
          <span class="${homeClass}">${homeName}</span>
        </div>
        ${isPlayed ? `
          <div class="match-score">
            <span class="match-score-num ${homeState}">${match.homeScore}</span>
            <span class="match-score-separator">-</span>
            <span class="match-score-num ${awayState}">${match.awayScore}</span>
          </div>
        ` : `
          <div class="match-pending">vs</div>
        `}
        <div class="match-team away">
          ${awayLogo}
          <span class="${awayClass}">${awayName}</span>
        </div>
      </div>`;
  }

  // =============================================
  // Playoffs - Visual Bracket
  // =============================================
  function renderPlayoffs() {
    const container = document.getElementById('playoffsContainer');
    const p = data.playoffs;

    if (!p || (p.quarterfinals.length === 0 && p.semifinals.length === 0 && !p.final)) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">🏆</div>
          <p class="empty-state-text">Los playoffs aún no se definieron</p>
        </div>`;
      return;
    }

    // Champion banner (only if final match is played and has a winner)
    let championHtml = '';
    if (p.final && p.final.homeScore && p.final.awayScore && p.final.homeScore.score !== null && p.final.awayScore.score !== null) {
      const hs = p.final.homeScore;
      const as = p.final.awayScore;
      let winner = null;
      if (hs.penalties !== null && as.penalties !== null) {
        if (hs.penalties > as.penalties) winner = p.final.home;
        else if (as.penalties > hs.penalties) winner = p.final.away;
      } else {
        if (hs.score > as.score) winner = p.final.home;
        else if (as.score > hs.score) winner = p.final.away;
      }
      if (winner) {
        const champLogo = getTeamLogoHtml(winner);
        championHtml = `
          <div class="champion-banner">
            <span class="champion-label">🏆 Campeón</span>
            <div class="champion-winner-row">${champLogo}<span class="champion-name">${winner}</span></div>
          </div>`;
      }
    }

    let html = championHtml;

    html += `
      <div class="phase-selector playoff-selector" id="playoffRoundSelector">
        <button class="phase-btn ${currentPlayoffRound === 0 ? 'active' : ''}" data-playoff-round="0">Cuartos</button>
        <button class="phase-btn ${currentPlayoffRound === 1 ? 'active' : ''}" data-playoff-round="1">Semis</button>
        <button class="phase-btn ${currentPlayoffRound === 2 ? 'active' : ''}" data-playoff-round="2">Final</button>
      </div>`;

    html += '<div class="bracket-wrapper">';

    // Bracket
    html += `<div class="bracket" data-active-col="${currentPlayoffRound}">`;

    // Column 1: Quarterfinals
    html += `<div class="bracket-column ${currentPlayoffRound === 0 ? 'active-col' : ''}" data-col="0">`;
    html += '<div class="bracket-column-title">Cuartos de final</div>';
    html += '<div class="bracket-matches">';
    for (let i = 0; i < p.quarterfinals.length; i += 2) {
      html += '<div class="bracket-match-pair">';
      html += renderBracketMatch(p.quarterfinals[i].home, p.quarterfinals[i].homeScore, p.quarterfinals[i].away, p.quarterfinals[i].awayScore, p.quarterfinals[i].label);
      if (p.quarterfinals[i + 1]) {
        html += renderBracketMatch(p.quarterfinals[i + 1].home, p.quarterfinals[i + 1].homeScore, p.quarterfinals[i + 1].away, p.quarterfinals[i + 1].awayScore, p.quarterfinals[i + 1].label);
      }
      html += '</div>';
    }
    html += '</div></div>';

    // Column 2: Semifinals
    html += `<div class="bracket-column ${currentPlayoffRound === 1 ? 'active-col' : ''}" data-col="1">`;
    html += '<div class="bracket-column-title">Semifinales</div>';
    html += '<div class="bracket-matches">';
    for (let i = 0; i < p.semifinals.length; i += 2) {
      html += '<div class="bracket-match-pair">';
      html += renderBracketMatch(p.semifinals[i].home, p.semifinals[i].homeScore, p.semifinals[i].away, p.semifinals[i].awayScore, `Semifinal ${i + 1}`);
      if (p.semifinals[i + 1]) {
        html += renderBracketMatch(p.semifinals[i + 1].home, p.semifinals[i + 1].homeScore, p.semifinals[i + 1].away, p.semifinals[i + 1].awayScore, `Semifinal ${i + 2}`);
      }
      html += '</div>';
    }
    html += '</div></div>';

    // Column 3: Final
    html += `<div class="bracket-column ${currentPlayoffRound === 2 ? 'active-col' : ''}" data-col="2">`;
    html += '<div class="bracket-column-title">Final</div>';
    html += '<div class="bracket-matches">';
    html += '<div class="bracket-match-pair single-match">';
    if (p.final) {
      html += renderBracketMatch(p.final.home, p.final.homeScore, p.final.away, p.final.awayScore, 'Final');
    }
    html += '</div></div></div>';

    html += '</div>'; // .bracket
    html += '</div>'; // .bracket-wrapper

    container.innerHTML = html;
    initPlayoffScrollSync();
    setTimeout(() => {
      const activeCol = document.querySelector(`.bracket-column[data-col="${currentPlayoffRound}"]`);
      if (activeCol) {
        activeCol.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
      }
    }, 50);
  }

  function renderBracketMatch(homeName, homeScoreObj, awayName, awayScoreObj, label) {
    const hs = homeScoreObj || { score: null, penalties: null };
    const as = awayScoreObj || { score: null, penalties: null };
    const isPlayed = hs.score !== null && as.score !== null;

    let homeWinner = false, awayWinner = false;
    if (isPlayed) {
      if (hs.penalties !== null && as.penalties !== null) {
        homeWinner = hs.penalties > as.penalties;
        awayWinner = as.penalties > hs.penalties;
      } else {
        homeWinner = hs.score > as.score;
        awayWinner = as.score > hs.score;
      }
    }

    let homeState = isPlayed ? (homeWinner ? 'winner' : (awayWinner ? 'loser' : 'draw')) : '';
    let awayState = isPlayed ? (awayWinner ? 'winner' : (homeWinner ? 'loser' : 'draw')) : '';

    const fmtScore = (s) => {
      if (s.score === null) return '-';
      if (s.penalties !== null) return `${s.score} (${s.penalties})`;
      return `${s.score}`;
    };

    const homeNameClass = homeName ? '' : 'bracket-tbd';
    const awayNameClass = awayName ? '' : 'bracket-tbd';

    const homeLogo = getTeamLogoHtml(homeName);
    const awayLogo = getTeamLogoHtml(awayName);

    return `
      <div class="bracket-match-wrap">
        <div class="bracket-match">
          <div class="bracket-team ${homeState}">
            ${homeLogo}
            <span class="bracket-team-name ${homeNameClass}">${homeName || 'Por definir'}</span>
            <span class="bracket-team-score">${fmtScore(hs)}</span>
          </div>
          <div class="bracket-team ${awayState}">
            ${awayLogo}
            <span class="bracket-team-name ${awayNameClass}">${awayName || 'Por definir'}</span>
            <span class="bracket-team-score">${fmtScore(as)}</span>
          </div>
        </div>
      </div>`;
  }

  // =============================================
  // Utilities
  // =============================================
  function showLoading(show) {
    const el = document.getElementById('loadingOverlay');
    if (show) el.classList.remove('hidden');
    else el.classList.add('hidden');
  }

  function formatDate(date) {
    return date.toLocaleDateString('es-AR', {
      day: 'numeric', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  }

  // Auto-init
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  return { loadData, switchTab };
})();
