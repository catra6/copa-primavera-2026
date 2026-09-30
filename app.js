/* ============================================
   APP - UI Controller
   Flashscore-style with visual bracket
   ============================================ */

const App = (() => {
  let data = null;
  let currentTab = 'standings';
  let currentPhase = 1;
  let currentFixturePhase = 0; // index into data.fixture
  let currentFixtureRoundIndex = 0;
  let currentPlayoffRound = 0; // 0: Cuartos, 1: Semis, 2: Final
  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 640;
  let standingsViewMode = isMobile ? 'simplified' : 'full';
  /* =========================================================================
     ESCALA DEL GRÁFICO RADAR (EDITABLE)
     Cambiá estos dos números para ajustar el rango visual del pentágono:
     ========================================================================= */
  const RADAR_MIN_STAT = 30;  // Valor mínimo (centro del gráfico)
  const RADAR_MAX_STAT = 90; // Valor máximo (borde exterior)

  function mapStatToRadius(val, R) {
    const min = RADAR_MIN_STAT;
    const max = RADAR_MAX_STAT;
    const clamped = Math.max(min, Math.min(max, val || min));
    return ((clamped - min) / (max - min)) * R;
  }

  /* =========================================================================
     CONFIGURACIÓN DE EQUIPOS: COLORES Y VALORES (EDITABLE)
     Podés cambiar los colores en formato HEX (#rrggbb) para cada equipo:
     ========================================================================= */
  const TEAM_PROFILES = {
    'yerbalense': {
      name: 'Yerbalense',
      color: '#86b910', // Verde
      ovr: 74, atq: 69, med: 73, def: 77, pot: 72, reg: 67
    },
    'trotenham': {
      name: 'Trotenham',
      color: '#ad7affff', // Violeta
      ovr: 72, atq: 73, med: 70, def: 74, pot: 81, reg: 65
    },
    'vinesse': {
      name: 'Vinesse',
      color: '#ff1174ff', // Naranja
      ovr: 70, atq: 61, med: 72, def: 76, pot: 63, reg: 72
    },
    'jager munich': {
      name: 'Jager Munich',
      color: '#1ed8bf', // Turquesa
      ovr: 70, atq: 69, med: 67, def: 73, pot: 75, reg: 67
    },
    'al-fuhmar': {
      name: 'Al-Fuhmar',
      color: '#fffb1a', // Amarillo
      ovr: 69, atq: 64, med: 69, def: 72, pot: 67, reg: 67
    },
    'club atletico la zona': {
      name: 'Club Atletico La Zona',
      color: '#ffacacff', // Rosa / Rojo
      ovr: 68, atq: 63, med: 67, def: 73, pot: 67, reg: 66
    },
    'atomos': {
      name: 'Atomos',
      color: '#0099ffff', // Azul
      ovr: 64, atq: 62, med: 64, def: 69, pot: 67, reg: 65
    },
    'real toros f.c.': {
      name: 'Real Toros F.C.',
      color: '#e75d00ff', // Rojo
      ovr: 62, atq: 63, med: 60, def: 61, pot: 62, reg: 61
    },
  };

  const TEAM_ALIASES = {
    'trottenham': 'trotenham',
    'pico y pala': 'jager munich',
    'jager': 'jager munich',
    'la zona': 'club atletico la zona',
    'real toros': 'real toros f.c.',
    'real toros fc': 'real toros f.c.',
    'al fuhmar': 'al-fuhmar',
  };

  const LOCAL_TEAM_LOGOS = {
    'yerbalense': 'equipos/yerbalense.webp',
    'trotenham': 'equipos/trottenham.webp',
    'trottenham': 'equipos/trottenham.webp',
    'vinesse': 'equipos/vinesse.webp',
    'jager munich': 'equipos/jager munich.png',
    'pico y pala': 'equipos/jager munich.png',
    'al-fuhmar': 'equipos/al fuhmar.webp',
    'al fuhmar': 'equipos/al fuhmar.webp',
    'club atletico la zona': 'equipos/la zona.webp',
    'la zona': 'equipos/la zona.webp',
    'atomos': 'equipos/atomos.webp',
    'real toros': 'equipos/real toros.webp',
    'real toros f.c.': 'equipos/real toros.webp',
    'real toros fc': 'equipos/real toros.webp',
  };

  function getTeamProfile(teamName) {
    if (!teamName) return { name: 'Desconocido', color: '#00f0ff', ovr: 65, med: 65, def: 65, pot: 65, reg: 65, atq: 65 };
    const key = teamName.toLowerCase().trim();
    const resolvedKey = TEAM_ALIASES[key] || key;
    if (TEAM_PROFILES[resolvedKey]) return TEAM_PROFILES[resolvedKey];
    let hash = 0;
    for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) & 0xffffffff;
    const h = Math.abs(hash);
    return {
      name: teamName,
      color: '#00f0ff',
      ovr: 65,
      med: 60 + (h % 16),
      def: 60 + ((h >> 4) % 16),
      pot: 60 + ((h >> 8) % 16),
      reg: 60 + ((h >> 12) % 16),
      atq: 60 + ((h >> 16) % 16),
    };
  }

  function hexToRgba(hex, alpha = 1) {
    if (!hex) return `rgba(0, 240, 255, ${alpha})`;
    let c = hex.replace('#', '');
    if (c.length === 3) c = c.split('').map(x => x + x).join('');
    const num = parseInt(c, 16);
    if (isNaN(num)) return `rgba(0, 240, 255, ${alpha})`;
    const r = (num >> 16) & 255;
    const g = (num >> 8) & 255;
    const b = num & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  function isPlaceholder(name) {
    if (!name) return true;
    const lower = name.toLowerCase().trim();
    return lower === 'a definir' || lower === 'por definir' || lower === 'vacío' || lower === 'vacio' || lower === '-' || lower === 'tbd' || lower.startsWith('1ro ') || lower.startsWith('2do ') || lower.startsWith('3ro ') || lower.startsWith('4to ');
  }

  let isProgrammaticPlayoffScroll = false;
  let programmaticScrollTimer = null;

  async function init() {
    updateViewToggleButton();
    bindEvents();
    await loadData();
  }

  function updateViewToggleButton() {
    const viewToggleBtn = document.getElementById('viewToggleBtn');
    if (viewToggleBtn) {
      viewToggleBtn.classList.toggle('active', standingsViewMode === 'simplified');
      const textSpan = viewToggleBtn.querySelector('.view-toggle-text');
      if (textSpan) {
        textSpan.textContent = standingsViewMode === 'simplified' ? 'Vista completa' : 'Vista simple';
      }
    }
  }

  async function loadData() {
    showLoading(true);
    try {
      data = await DataSource.load();
      console.log('Data:', data);
      updateViewToggleButton();
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

    const viewToggleBtn = document.getElementById('viewToggleBtn');
    if (viewToggleBtn) {
      viewToggleBtn.addEventListener('click', () => {
        standingsViewMode = standingsViewMode === 'full' ? 'simplified' : 'full';
        updateViewToggleButton();
        renderStandings();
      });
    }

    document.getElementById('fixturePhaseSelector').addEventListener('click', (e) => {
      const btn = e.target.closest('.phase-btn');
      if (!btn) return;
      currentFixturePhase = parseInt(btn.dataset.fixturePhase);
      currentFixtureRoundIndex = 0;
      document.querySelectorAll('#fixturePhaseSelector .phase-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderFixture();
    });

    document.addEventListener('click', (e) => {
      // 1. Match Comparison Modal trigger from fixture or playoffs
      const matchTrigger = e.target.closest('.match-clickable-card, .bracket-clickable-match');
      if (matchTrigger) {
        const home = matchTrigger.dataset.home;
        const away = matchTrigger.dataset.away;
        if (home && away) {
          openMatchComparisonModal(home, away);
          return;
        }
      }

      // 2. Team Stats Modal trigger from standings table
      const teamTrigger = e.target.closest('.team-clickable-row, .team-name-cell, .team-name');
      if (teamTrigger) {
        const row = teamTrigger.closest('tr');
        const teamName = row?.dataset.teamName || teamTrigger.dataset.teamName;
        if (teamName) {
          openTeamStatsModal(teamName);
          return;
        }
      }

      // 3. Stat explanation triggers inside team modal
      const statTrigger = e.target.closest('.stat-clickable-row');
      if (statTrigger) {
        const idx = statTrigger.dataset.statIdx;
        const code = statTrigger.dataset.statCode;
        showStatExplanation(idx !== undefined ? parseInt(idx, 10) : code);
        return;
      }

      if (e.target.closest('#statExplPrev')) {
        cycleStatExplanation(-1);
        return;
      }

      if (e.target.closest('#statExplNext')) {
        cycleStatExplanation(1);
        return;
      }

      if (e.target.closest('#statExplBack')) {
        hideStatExplanation();
        return;
      }

      // 4. Close modal triggers
      if (e.target.id === 'teamModalClose' || e.target.closest('#teamModalClose') || e.target.id === 'teamModalOverlay' || e.target.id === 'compModalCloseBtn' || e.target.closest('#compModalCloseBtn')) {
        closeTeamStatsModal();
        return;
      }

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

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeTeamStatsModal();
        return;
      }
      const explEl = document.getElementById('teamModalStatExpl');
      if (explEl && !explEl.classList.contains('hidden')) {
        if (e.key === 'ArrowLeft') cycleStatExplanation(-1);
        else if (e.key === 'ArrowRight') cycleStatExplanation(1);
      }
    });
  }

  function setPlayoffRound(roundIndex) {
    currentPlayoffRound = roundIndex;
    isProgrammaticPlayoffScroll = true;
    if (programmaticScrollTimer) clearTimeout(programmaticScrollTimer);
    programmaticScrollTimer = setTimeout(() => {
      isProgrammaticPlayoffScroll = false;
    }, 450);

    const selector = document.getElementById('playoffRoundSelector');
    if (selector) {
      selector.querySelectorAll('.phase-btn').forEach(b => {
        b.classList.toggle('active', parseInt(b.dataset.playoffRound) === roundIndex);
      });
    }
    const bracket = document.querySelector('.bracket');
    const wrapper = document.querySelector('.bracket-wrapper');
    if (bracket && wrapper) {
      bracket.setAttribute('data-active-col', roundIndex);
      const targetCol = bracket.querySelector(`.bracket-column[data-col="${roundIndex}"]`);
      bracket.querySelectorAll('.bracket-column').forEach(col => {
        col.classList.toggle('active-col', col === targetCol);
      });
      if (targetCol) {
        const colLeft = targetCol.offsetLeft;
        const colWidth = targetCol.offsetWidth;
        const wrapperWidth = wrapper.clientWidth;
        const targetScrollLeft = colLeft - (wrapperWidth - colWidth) / 2;
        wrapper.scrollTo({
          left: Math.max(0, targetScrollLeft),
          behavior: 'smooth'
        });
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
    if (isProgrammaticPlayoffScroll) return;
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
   * Get played matches for a phase:
   * 1. Read phase.playedCount (parsed directly from PJ cell in Fixture sheet)
   * 2. Fallback to count of scored fixture matches
   */
  function getPhaseMatchesPlayed(phaseIndex) {
    const phase = (data.fixture && data.fixture[phaseIndex]) ? data.fixture[phaseIndex] : null;
    let scoredCount = 0;
    if (phase && phase.rounds) {
      for (const r of phase.rounds) {
        for (const m of r.matches) {
          if (m.homeScore !== null && m.awayScore !== null) scoredCount++;
        }
      }
    }
    if (phase && typeof phase.playedCount === 'number' && phase.playedCount > scoredCount) {
      return phase.playedCount;
    }
    return scoredCount;
  }

  /**
   * Check if all phase 1 matches are completed (12 matches total).
   */
  function isPhase1Complete() {
    return getPhaseMatchesPlayed(0) >= 12;
  }

  function renderStandings() {
    const container = document.getElementById('groupsContainer');
    const phaseFixture = (data.fixture && data.fixture[currentPhase - 1]) ? data.fixture[currentPhase - 1] : null;

    // Phase 2 locked until Phase 1 matches are complete
    if (currentPhase === 2 && !isPhase1Complete()) {
      const matchesPlayed = getPhaseMatchesPlayed(0);
      const totalMatches = 12;

      container.innerHTML = `
        <div class="ucl-locked-container">
          <div class="locked-icon">🔒</div>
          <h2 class="locked-title">Tabla no disponible</h2>
          <p class="locked-subtitle">Se revelan las posiciones cuando se completen todos los partidos de la Fase 1.</p>
          <div class="locked-progress">${matchesPlayed} / ${totalMatches} partidos jugados</div>
        </div>`;
      return;
    }

    const groups = TournamentEngine.calculateStandings(phaseFixture);
    const phaseMatches = phaseFixture ? TournamentEngine.getPhaseMatches(phaseFixture) : [];

    const isSimplified = standingsViewMode === 'simplified';
    let html = '';
    groups.forEach((group, gi) => {
      const sortedTeams = TournamentEngine.sortStandings(group.teams, phaseMatches);

      html += `
        <div class="group-card" style="animation-delay: ${gi * 0.05}s">
          <div class="group-header">
            <h2>${group.name}</h2>
          </div>
          <div class="table-scroll">
            <table class="standings-table ${isSimplified ? 'simplified' : ''}">
              <thead>
                <tr>
                  <th class="th-team"></th>
                  <th class="th-pj">PJ</th>
                  ${isSimplified ? `
                    <th class="th-dif">DIF</th>
                    <th class="th-pts">PTS</th>
                  ` : `
                    <th class="th-g">G</th>
                    <th class="th-e">E</th>
                    <th class="th-p">P</th>
                    <th class="th-dif">DIF</th>
                    <th class="th-gls">GLS</th>
                    <th class="th-pts">PTS</th>
                  `}
                </tr>
              </thead>
              <tbody>
                ${sortedTeams.map((t, i) => renderStandingRow(t, i, phaseFixture, isSimplified)).join('')}
              </tbody>
            </table>
          </div>
        </div>`;
    });

    if (data.lastUpdated) {
      html += `<p class="last-updated">Ratings generados matemáticamente a partir del rendimiento anual 2025. Evaluación puramente estadística e imparcial.<br>Actualizado: ${formatDate(new Date(data.lastUpdated))}</p>`;
    }
    container.innerHTML = html;
  }

  function getTeamLogoHtml(teamName) {
    if (!teamName) return '';
    const name = teamName.trim();
    const key = name.toLowerCase();
    const resolvedKey = TEAM_ALIASES[key] || key;
    const localLogo = LOCAL_TEAM_LOGOS[key] || LOCAL_TEAM_LOGOS[resolvedKey];
    if (localLogo) {
      return `<img class="team-logo" src="${localLogo}" alt="${name}" loading="lazy" />`;
    }
    const logo = (data && data.logos) ? (data.logos[name] || data.logos[key] || data.logos[resolvedKey] || '') : '';
    if (!logo) return '';
    return `<img class="team-logo" src="${logo}" alt="${name}" referrerpolicy="no-referrer" onerror="this.style.display='none'" />`;
  }

  function renderStandingRow(team, index, phaseFixture, isSimplified = false) {
    const pos = index + 1;
    const qualified = currentPhase === 1 && pos <= 2;
    const diffPrefix = team.goalDiff > 0 ? '+' : '';
    const diffClass = team.goalDiff > 0 ? 'positive' : (team.goalDiff < 0 ? 'negative' : '');

    const logoHtml = getTeamLogoHtml(team.name);
    const isEmpty = !team.name;
    const displayName = isSimplified
      ? (data.abbreviations?.[team.name] || data.abbreviations?.[team.name.toLowerCase()] || team.name)
      : team.name;

    const nameClass = qualified ? 'team-name ucl-qualified' : 'team-name';
    const nameHtml = isEmpty
      ? '<span class="team-name placeholder">vacío</span>'
      : `${logoHtml}<span class="${nameClass}">${displayName}</span>`;

    return `
      <tr class="${qualified ? 'row-qualified' : ''} ${!isEmpty ? 'team-clickable-row' : ''}" data-team-name="${escapeHtml(team.name)}" title="Ver estadísticas de ${escapeHtml(team.name)}">
        <td>
          <div class="team-name-cell">
            <span class="team-position">${pos}</span>
            ${nameHtml}
          </div>
        </td>
        <td class="col-pj">${team.played}</td>
        ${isSimplified ? `
          <td class="col-diff ${diffClass}">${diffPrefix}${team.goalDiff}</td>
          <td class="col-pts">${team.points}</td>
        ` : `
          <td>${team.won}</td>
          <td>${team.drawn}</td>
          <td>${team.lost}</td>
          <td class="col-diff ${diffClass}">${diffPrefix}${team.goalDiff}</td>
          <td class="col-gls">${team.goalsFor}:${team.goalsAgainst}</td>
          <td class="col-pts">${team.points}</td>
        `}
      </tr>`;
  }

  // =============================================
  // Fixture
  // =============================================
  function renderFixture() {
    const container = document.getElementById('fixtureContainer');

    // Phase 2 fixture locked until Phase 1 matches are complete
    if (currentFixturePhase === 1 && !isPhase1Complete()) {
      const matchesPlayed = getPhaseMatchesPlayed(0);
      const totalMatches = 12;

      container.innerHTML = `
        <div class="ucl-locked-container">
          <div class="locked-icon">🔒</div>
          <h2 class="locked-title">Fixture no disponible</h2>
          <p class="locked-subtitle">Se revelan los cruces cuando se completen todos los partidos de la Fase 1.</p>
          <div class="locked-progress">${matchesPlayed} / ${totalMatches} partidos jugados</div>
        </div>`;
      return;
    }

    const phase = data.fixture[currentFixturePhase];
    if (!phase || !phase.rounds || phase.rounds.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">📅</div>
          <p class="empty-state-text">Sin partidos en esta fase</p>
        </div>`;
      return;
    }

    if (currentFixtureRoundIndex >= phase.rounds.length) {
      currentFixtureRoundIndex = 0;
    }

    const currentRound = phase.rounds[currentFixtureRoundIndex];
    const totalRounds = phase.rounds.length;

    let html = `
      <div class="fixture-date-selector">
        <button class="date-nav-btn" id="prevDateBtn" ${currentFixtureRoundIndex === 0 ? 'disabled' : ''} aria-label="Fecha anterior">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
        </button>
        <span class="current-date-title">${currentRound.name}</span>
        <button class="date-nav-btn" id="nextDateBtn" ${currentFixtureRoundIndex === totalRounds - 1 ? 'disabled' : ''} aria-label="Fecha siguiente">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
        </button>
      </div>`;

    // Group matches of current round by group
    const byGroup = {};
    currentRound.matches.forEach(m => {
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

    container.innerHTML = html;

    const prevBtn = document.getElementById('prevDateBtn');
    const nextBtn = document.getElementById('nextDateBtn');
    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        if (currentFixtureRoundIndex > 0) {
          currentFixtureRoundIndex--;
          renderFixture();
        }
      });
    }
    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        if (currentFixtureRoundIndex < totalRounds - 1) {
          currentFixtureRoundIndex++;
          renderFixture();
        }
      });
    }
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

    const homeClass = `match-team-name home ${homeState} ${!match.home ? 'placeholder' : ''}`;
    const awayClass = `match-team-name away ${awayState} ${!match.away ? 'placeholder' : ''}`;
    const canCompare = match.home && match.away && !isPlaceholder(match.home) && !isPlaceholder(match.away);
    const clickableClass = canCompare ? 'match-clickable-card' : '';
    const clickTitle = canCompare ? `title="Comparar ${escapeHtml(match.home)} vs ${escapeHtml(match.away)}"` : '';

    return `
      <div class="match-card ${isPlayed ? 'played' : ''} ${clickableClass}" data-home="${escapeHtml(match.home)}" data-away="${escapeHtml(match.away)}" ${clickTitle}>
        <div class="match-logo-cell home">${homeLogo}</div>
        <div class="${homeClass}">${homeName}</div>
        <div class="match-score-cell">
          ${isPlayed ? `
            <span class="match-score-num ${homeState}">${match.homeScore}</span>
            <span class="match-score-separator">-</span>
            <span class="match-score-num ${awayState}">${match.awayScore}</span>
          ` : `
            <span class="match-pending">vs</span>
          `}
        </div>
        <div class="${awayClass}">${awayName}</div>
        <div class="match-logo-cell away">${awayLogo}</div>
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
      const wrapper = document.querySelector('.bracket-wrapper');
      if (activeCol && wrapper) {
        const colLeft = activeCol.offsetLeft;
        const colWidth = activeCol.offsetWidth;
        const wrapperWidth = wrapper.clientWidth;
        const targetScrollLeft = colLeft - (wrapperWidth - colWidth) / 2;
        wrapper.scrollTo({
          left: Math.max(0, targetScrollLeft),
          behavior: 'auto'
        });
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
    const canCompare = homeName && awayName && !isPlaceholder(homeName) && !isPlaceholder(awayName);
    const clickableClass = canCompare ? 'bracket-clickable-match' : '';
    const clickTitle = canCompare ? `title="Comparar ${escapeHtml(homeName)} vs ${escapeHtml(awayName)}"` : '';

    return `
      <div class="bracket-match-wrap">
        <div class="bracket-match ${clickableClass}" data-home="${escapeHtml(homeName)}" data-away="${escapeHtml(awayName)}" ${clickTitle}>
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
  // Team Stats & PES-Style Pentagon Radar Modal
  // =============================================

  function generateRadarChartSvg(stats, teamColor = '#00f0ff') {
    const cx = 150;
    const cy = 132;
    const R = 85;
    // Clockwise from top: MED (-90°), DEF (-18°), POT (54°), REG (126°), ATQ (198°)
    const angles = [-90, -18, 54, 126, 198];
    const statKeys = ['med', 'def', 'pot', 'reg', 'atq'];
    const statLabels = [
      { code: 'MED', name: 'Mediocampo', anchor: 'middle', dx: 0, dy: -6 },
      { code: 'DEF', name: 'Defensa', anchor: 'start', dx: 6, dy: 4 },
      { code: 'POT', name: 'Potencia', anchor: 'start', dx: 6, dy: 8 },
      { code: 'REG', name: 'Regularidad', anchor: 'end', dx: -6, dy: 8 },
      { code: 'ATQ', name: 'Ataque', anchor: 'end', dx: -6, dy: 4 },
    ];

    // Reference pentagon grids at 20, 40, 60, 80, 100%
    const levels = [20, 40, 60, 80, 100];
    let gridPolygons = '';
    levels.forEach(lvl => {
      const r = (lvl / 100) * R;
      const pts = angles.map(deg => {
        const rad = (deg * Math.PI) / 180;
        return `${(cx + r * Math.cos(rad)).toFixed(1)},${(cy + r * Math.sin(rad)).toFixed(1)}`;
      }).join(' ');
      const isOuter = lvl === 100;
      gridPolygons += `<polygon points="${pts}" fill="${isOuter ? 'rgba(5, 18, 56, 0.55)' : 'none'}" stroke="${isOuter ? 'rgba(0, 240, 255, 0.45)' : 'rgba(0, 240, 255, 0.12)'}" stroke-width="${isOuter ? 1.8 : 1}" />`;
    });

    // Radial axis lines
    let radialLines = '';
    angles.forEach(deg => {
      const rad = (deg * Math.PI) / 180;
      const x = (cx + R * Math.cos(rad)).toFixed(1);
      const y = (cy + R * Math.sin(rad)).toFixed(1);
      radialLines += `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="rgba(0, 240, 255, 0.2)" stroke-width="1.2" />`;
    });

    // Data polygon (no corner circles/dots, clean points)
    const dataPts = [];
    angles.forEach((deg, idx) => {
      const val = stats[statKeys[idx]] || 0;
      const r = mapStatToRadius(val, R);
      const rad = (deg * Math.PI) / 180;
      const x = cx + r * Math.cos(rad);
      const y = cy + r * Math.sin(rad);
      dataPts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
    });

    // Axis labels (acronyms only, positioned closer)
    let labelsSvg = '';
    angles.forEach((deg, idx) => {
      const info = statLabels[idx];
      const rad = (deg * Math.PI) / 180;
      const lx = cx + (R + 10) * Math.cos(rad) + info.dx;
      const ly = cy + (R + 10) * Math.sin(rad) + info.dy;
      labelsSvg += `
        <g class="stat-clickable-row" data-stat-idx="${idx}" data-stat-code="${info.code}" style="cursor: pointer;">
          <text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="${info.anchor}" class="radar-axis-text">
            <tspan class="radar-axis-code">${info.code}</tspan>
          </text>
        </g>`;
    });

    return `
      <svg class="radar-svg" viewBox="0 0 300 270" width="100%" height="240">
        <defs>
          <radialGradient id="radarFillGradSingle" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stop-color="${teamColor}" stop-opacity="0.45" />
            <stop offset="100%" stop-color="${teamColor}" stop-opacity="0.12" />
          </radialGradient>
          <filter id="radarGlowSingle" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="0" stdDeviation="4" flood-color="${teamColor}" flood-opacity="0.75" />
          </filter>
        </defs>
        ${gridPolygons}
        ${radialLines}
        <polygon points="${dataPts.join(' ')}" fill="url(#radarFillGradSingle)" stroke="${teamColor}" stroke-width="2.5" filter="url(#radarGlowSingle)" />
        ${labelsSvg}
      </svg>`;
  }

  function generateComparisonRadarSvg(homeName, prof1, awayName, prof2) {
    const cx = 150;
    const cy = 132;
    const R = 85;
    // Clockwise from top: MED (-90°), DEF (-18°), POT (54°), REG (126°), ATQ (198°)
    const angles = [-90, -18, 54, 126, 198];
    const statKeys = ['med', 'def', 'pot', 'reg', 'atq'];
    const statLabels = [
      { code: 'MED', name: 'Mediocampo', anchor: 'middle', dx: 0, dy: -6 },
      { code: 'DEF', name: 'Defensa', anchor: 'start', dx: 6, dy: 4 },
      { code: 'POT', name: 'Potencia', anchor: 'start', dx: 6, dy: 8 },
      { code: 'REG', name: 'Regularidad', anchor: 'end', dx: -6, dy: 8 },
      { code: 'ATQ', name: 'Ataque', anchor: 'end', dx: -6, dy: 4 },
    ];

    // Reference grids
    const levels = [20, 40, 60, 80, 100];
    let gridPolygons = '';
    levels.forEach(lvl => {
      const r = (lvl / 100) * R;
      const pts = angles.map(deg => {
        const rad = (deg * Math.PI) / 180;
        return `${(cx + r * Math.cos(rad)).toFixed(1)},${(cy + r * Math.sin(rad)).toFixed(1)}`;
      }).join(' ');
      const isOuter = lvl === 100;
      gridPolygons += `<polygon points="${pts}" fill="${isOuter ? 'rgba(5, 18, 56, 0.55)' : 'none'}" stroke="${isOuter ? 'rgba(0, 240, 255, 0.45)' : 'rgba(0, 240, 255, 0.12)'}" stroke-width="${isOuter ? 1.8 : 1}" />`;
    });

    let radialLines = '';
    angles.forEach(deg => {
      const rad = (deg * Math.PI) / 180;
      const x = (cx + R * Math.cos(rad)).toFixed(1);
      const y = (cy + R * Math.sin(rad)).toFixed(1);
      radialLines += `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="rgba(0, 240, 255, 0.2)" stroke-width="1.2" />`;
    });

    // Team 1 polygon (clean points, no dots)
    const dataPts1 = [];
    angles.forEach((deg, idx) => {
      const val = prof1[statKeys[idx]] || 0;
      const r = mapStatToRadius(val, R);
      const rad = (deg * Math.PI) / 180;
      const x = cx + r * Math.cos(rad);
      const y = cy + r * Math.sin(rad);
      dataPts1.push(`${x.toFixed(1)},${y.toFixed(1)}`);
    });

    // Team 2 polygon (clean points, no dots)
    const dataPts2 = [];
    angles.forEach((deg, idx) => {
      const val = prof2[statKeys[idx]] || 0;
      const r = mapStatToRadius(val, R);
      const rad = (deg * Math.PI) / 180;
      const x = cx + r * Math.cos(rad);
      const y = cy + r * Math.sin(rad);
      dataPts2.push(`${x.toFixed(1)},${y.toFixed(1)}`);
    });

    // Axis labels (acronyms only, positioned closer)
    let labelsSvg = '';
    angles.forEach((deg, idx) => {
      const info = statLabels[idx];
      const rad = (deg * Math.PI) / 180;
      const lx = cx + (R + 10) * Math.cos(rad) + info.dx;
      const ly = cy + (R + 10) * Math.sin(rad) + info.dy;
      labelsSvg += `
        <g class="stat-clickable-row" data-stat-idx="${idx}" data-stat-code="${info.code}" style="cursor: pointer;">
          <text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="${info.anchor}" class="radar-axis-text">
            <tspan class="radar-axis-code">${info.code}</tspan>
          </text>
        </g>`;
    });

    return `
      <svg class="radar-svg" viewBox="0 0 300 270" width="100%" height="240">
        <defs>
          <filter id="compGlow1" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="0" stdDeviation="3.5" flood-color="${prof1.color}" flood-opacity="0.75" />
          </filter>
          <filter id="compGlow2" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="0" stdDeviation="3.5" flood-color="${prof2.color}" flood-opacity="0.75" />
          </filter>
        </defs>
        ${gridPolygons}
        ${radialLines}
        <polygon points="${dataPts1.join(' ')}" fill="none" stroke="${prof1.color}" stroke-width="2.6" filter="url(#compGlow1)" />
        <polygon points="${dataPts2.join(' ')}" fill="none" stroke="${prof2.color}" stroke-width="2.6" filter="url(#compGlow2)" />
        ${labelsSvg}
      </svg>`;
  }

  const STAT_DEFINITIONS = [
    {
      code: 'MED',
      name: 'Mediocampo',
      title: 'MEDIOCAMPO (MED)',
      desc: 'Refleja la regularidad para sumar puntos y el control del juego. Premia a los equipos que ganan o empatan con frecuencia y penaliza a los que pierden puntos de forma reiterada.'
    },
    {
      code: 'DEF',
      name: 'Defensa',
      title: 'DEFENSA (DEF)',
      desc: 'Evalúa la seguridad en el arco propio y las vallas invictas. Recibir pocos goles eleva la puntuación, y se penaliza menos si los tantos en contra fueron ante los rivales más fuertes.'
    },
    {
      code: 'POT',
      name: 'Potencia',
      title: 'POTENCIA (POT)',
      desc: 'Diferencia a los equipos que ganan por la mínima de aquellos con capacidad de golear. Evalúa la frecuencia con la que un equipo supera ampliamente a sus rivales en el marcador.'
    },
    {
      code: 'REG',
      name: 'Regularidad',
      title: 'REGULARIDAD (REG)',
      desc: 'Evalúa la estabilidad y predictibilidad a lo largo del año. Premia la resistencia a perder, la mejora sostenida de nivel entre etapas y la consistencia en los resultados sin altibajos marcados.'
    },
    {
      code: 'ATQ',
      name: 'Ataque',
      title: 'ATAQUE (ATQ)',
      desc: 'Mide la capacidad goleadora por partido, dando mayor valor a los goles convertidos contra los equipos mejor ubicados de la tabla y en instancias de eliminación directa.'
    },
  ];

  let currentStatExplIndex = 0;

  function showStatExplanation(idxOrCode) {
    let targetIdx = 0;
    if (typeof idxOrCode === 'number') {
      targetIdx = idxOrCode;
    } else if (typeof idxOrCode === 'string') {
      const found = STAT_DEFINITIONS.findIndex(d => d.code.toUpperCase() === idxOrCode.toUpperCase());
      if (found !== -1) targetIdx = found;
    }

    currentStatExplIndex = (targetIdx + STAT_DEFINITIONS.length) % STAT_DEFINITIONS.length;
    const def = STAT_DEFINITIONS[currentStatExplIndex];

    const listEl = document.getElementById('teamModalStatsList');
    const explEl = document.getElementById('teamModalStatExpl');
    const titleEl = document.getElementById('statExplTitle');
    const descEl = document.getElementById('statExplDesc');

    if (titleEl) titleEl.textContent = def.title;
    if (descEl) descEl.textContent = def.desc;

    if (listEl) listEl.classList.add('hidden');
    if (explEl) explEl.classList.remove('hidden');
  }

  function hideStatExplanation() {
    const listEl = document.getElementById('teamModalStatsList');
    const explEl = document.getElementById('teamModalStatExpl');
    if (listEl) listEl.classList.remove('hidden');
    if (explEl) explEl.classList.add('hidden');
  }

  function cycleStatExplanation(step) {
    showStatExplanation(currentStatExplIndex + step);
  }

  function openTeamStatsModal(teamName) {
    if (!teamName) return;
    const prof = getTeamProfile(teamName);
    const logoHtml = getTeamLogoHtml(teamName);
    const modalBody = document.getElementById('teamModalBody');
    const modalOverlay = document.getElementById('teamModalOverlay');

    const statRows = [
      { name: 'Mediocampo', code: 'MED', val: prof.med, idx: 0 },
      { name: 'Defensa', code: 'DEF', val: prof.def, idx: 1 },
      { name: 'Potencia', code: 'POT', val: prof.pot, idx: 2 },
      { name: 'Regularidad', code: 'REG', val: prof.reg, idx: 3 },
      { name: 'Ataque', code: 'ATQ', val: prof.atq, idx: 4 },
    ];

    modalBody.innerHTML = `
      <div class="team-modal-header">
        <div class="team-modal-logo-wrap">${logoHtml}</div>
        <div class="team-modal-title-wrap">
          <h2 class="team-modal-name">${escapeHtml(prof.name || teamName)}</h2>
          <span class="team-modal-rating-badge" style="border-color: ${prof.color}; color: ${prof.color};">VALORACIÓN GENERAL: <strong style="color: ${prof.color};">${prof.ovr}</strong></span>
        </div>
      </div>
      <div class="team-modal-radar-wrap">
        ${generateRadarChartSvg(prof, prof.color)}
      </div>
      <div class="team-modal-stats-list" id="teamModalStatsList">
        ${statRows.map(r => `
          <div class="stat-bar-row stat-clickable-row" data-stat-idx="${r.idx}" data-stat-code="${r.code}" title="Ver significado de ${r.name}">
            <div class="stat-bar-label">
              <span class="stat-bar-name">${r.name} (${r.code})</span>
              <span class="stat-bar-val" style="color: ${prof.color}">${r.val}</span>
            </div>
            <div class="stat-bar-track">
              <div class="stat-bar-fill" style="width: ${r.val}%; background: ${prof.color};"></div>
            </div>
          </div>
        `).join('')}
      </div>
      <div class="stat-expl-card hidden" id="teamModalStatExpl">
        <div class="stat-expl-header">
          <button type="button" class="stat-expl-nav-btn prev" id="statExplPrev" aria-label="Anterior">◀</button>
          <div class="stat-expl-title" id="statExplTitle">MEDIOCAMPO (MED)</div>
          <button type="button" class="stat-expl-nav-btn next" id="statExplNext" aria-label="Siguiente">▶</button>
        </div>
        <p class="stat-expl-desc" id="statExplDesc"></p>
        <button type="button" class="stat-expl-back-btn" id="statExplBack">✕ VOLVER</button>
      </div>
    `;

    hideStatExplanation();
    const closeBtn = document.getElementById('teamModalClose');
    if (closeBtn) closeBtn.style.display = '';
    modalOverlay.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  }

  function openMatchComparisonModal(homeName, awayName) {
    if (!homeName || !awayName) return;
    const prof1 = getTeamProfile(homeName);
    const prof2 = getTeamProfile(awayName);

    const logo1 = getTeamLogoHtml(homeName);
    const logo2 = getTeamLogoHtml(awayName);
    const modalBody = document.getElementById('teamModalBody');
    const modalOverlay = document.getElementById('teamModalOverlay');

    // Hide top-right close icon in match comparison so it doesn't overlap the logo
    const closeBtn = document.getElementById('teamModalClose');
    if (closeBtn) closeBtn.style.display = 'none';

    const statRows = [
      { name: 'Mediocampo', code: 'MED', v1: prof1.med, v2: prof2.med, idx: 0 },
      { name: 'Defensa', code: 'DEF', v1: prof1.def, v2: prof2.def, idx: 1 },
      { name: 'Potencia', code: 'POT', v1: prof1.pot, v2: prof2.pot, idx: 2 },
      { name: 'Regularidad', code: 'REG', v1: prof1.reg, v2: prof2.reg, idx: 3 },
      { name: 'Ataque', code: 'ATQ', v1: prof1.atq, v2: prof2.atq, idx: 4 },
    ];

    modalBody.innerHTML = `
      <div class="comp-modal-header">
        <div class="comp-team-card home">
          <div class="comp-logo-wrap">${logo1}</div>
          <div class="comp-team-info">
            <span class="comp-team-name">${escapeHtml(prof1.name || homeName)}</span>
            <span class="comp-team-ovr" style="border-color: ${prof1.color}; color: ${prof1.color}">OVR <strong>${prof1.ovr}</strong></span>
          </div>
        </div>
        <div class="comp-vs-badge">VS</div>
        <div class="comp-team-card away">
          <div class="comp-team-info right">
            <span class="comp-team-name">${escapeHtml(prof2.name || awayName)}</span>
            <span class="comp-team-ovr" style="border-color: ${prof2.color}; color: ${prof2.color}">OVR <strong>${prof2.ovr}</strong></span>
          </div>
          <div class="comp-logo-wrap">${logo2}</div>
        </div>
      </div>

      <div class="team-modal-radar-wrap">
        ${generateComparisonRadarSvg(homeName, prof1, awayName, prof2)}
      </div>

      <div class="comp-stats-list" id="teamModalStatsList">
        ${statRows.map(r => `
          <div class="comp-stat-row stat-clickable-row" data-stat-idx="${r.idx}" data-stat-code="${r.code}" title="Tocar para ver significado de ${r.name}">
            <span class="comp-stat-num left" style="color: ${prof1.color}">${r.v1}</span>
            <div class="comp-bars-wrap">
              <div class="comp-bar-half left">
                <div class="comp-bar-fill left" style="width: ${r.v1}%; background: ${prof1.color};"></div>
              </div>
              <span class="comp-stat-label">${r.code}</span>
              <div class="comp-bar-half right">
                <div class="comp-bar-fill right" style="width: ${r.v2}%; background: ${prof2.color};"></div>
              </div>
            </div>
            <span class="comp-stat-num right" style="color: ${prof2.color}">${r.v2}</span>
          </div>
        `).join('')}
      </div>

      <div class="stat-expl-card hidden" id="teamModalStatExpl">
        <div class="stat-expl-header">
          <button type="button" class="stat-expl-nav-btn prev" id="statExplPrev" aria-label="Anterior">◀</button>
          <div class="stat-expl-title" id="statExplTitle">MEDIOCAMPO (MED)</div>
          <button type="button" class="stat-expl-nav-btn next" id="statExplNext" aria-label="Siguiente">▶</button>
        </div>
        <p class="stat-expl-desc" id="statExplDesc"></p>
        <button type="button" class="stat-expl-back-btn" id="statExplBack">✕ VOLVER</button>
      </div>

      <div class="comp-footer-actions">
        <button type="button" class="comp-back-modal-btn" id="compModalCloseBtn">CERRAR</button>
      </div>
    `;

    hideStatExplanation();
    modalOverlay.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  }

  function closeTeamStatsModal() {
    const modalOverlay = document.getElementById('teamModalOverlay');
    const closeBtn = document.getElementById('teamModalClose');
    if (closeBtn) closeBtn.style.display = '';
    if (modalOverlay) {
      modalOverlay.classList.add('hidden');
      document.body.style.overflow = '';
      hideStatExplanation();
    }
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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
