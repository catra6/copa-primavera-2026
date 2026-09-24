/* ============================================
   TOURNAMENT ENGINE
   Sorting + tiebreakers + form calculation
   ============================================ */

const TournamentEngine = (() => {

  /**
   * Sort standings by:
   * 1. Points (desc)
   * 2. Goal difference (desc)
   * 3. Goals scored (desc)
   * 4. Head-to-head points among tied teams (desc)
   */
  function sortStandings(teams, phaseMatches) {
    const sorted = [...teams];

    sorted.sort((a, b) => {
      // 1. Points
      if (a.points !== b.points) return b.points - a.points;
      // 2. Goal difference (diferencia de gol)
      if (a.goalDiff !== b.goalDiff) return b.goalDiff - a.goalDiff;
      // 3. Goals scored (goles a favor)
      if (a.goalsFor !== b.goalsFor) return b.goalsFor - a.goalsFor;
      // 4. Head-to-head (enfrentamiento directo)
      const h2h = getH2HPoints(a.name, b.name, phaseMatches);
      if (h2h !== 0) return h2h;
      return 0;
    });

    return sorted;
  }

  function getH2HPoints(teamA, teamB, matches) {
    if (!matches || !matches.length) return 0;
    let ptsA = 0, ptsB = 0;
    let gfA = 0, gfB = 0;
    let playedH2H = false;

    for (const m of matches) {
      if (m.homeScore === null || m.awayScore === null) continue;
      if (m.home === teamA && m.away === teamB) {
        playedH2H = true;
        gfA += m.homeScore;
        gfB += m.awayScore;
        if (m.homeScore > m.awayScore) ptsA += 3;
        else if (m.homeScore === m.awayScore) { ptsA += 1; ptsB += 1; }
        else ptsB += 3;
      } else if (m.home === teamB && m.away === teamA) {
        playedH2H = true;
        gfB += m.homeScore;
        gfA += m.awayScore;
        if (m.homeScore > m.awayScore) ptsB += 3;
        else if (m.homeScore === m.awayScore) { ptsA += 1; ptsB += 1; }
        else ptsA += 3;
      }
    }
    if (!playedH2H) return 0;
    if (ptsA !== ptsB) return ptsB - ptsA;
    if (gfA !== gfB) return gfB - gfA;
    return 0;
  }

  /**
   * Get all matches for a given phase as a flat array
   */
  function getPhaseMatches(fixturePhase) {
    if (!fixturePhase || !fixturePhase.rounds) return [];
    const all = [];
    for (const round of fixturePhase.rounds) {
      for (const match of round.matches) {
        all.push(match);
      }
    }
    return all;
  }

  /**
   * Get form for a team from matches (returns V/E/D in Spanish)
   */
  function getFormForPhase(teamName, phaseFixture) {
    const results = [];
    if (!phaseFixture || !phaseFixture.rounds) return results;
    for (const round of phaseFixture.rounds) {
      for (const m of round.matches) {
        if (m.homeScore === null || m.awayScore === null) continue;
        if (m.home === teamName) {
          if (m.homeScore > m.awayScore) results.push('V');
          else if (m.homeScore < m.awayScore) results.push('D');
          else results.push('E');
        } else if (m.away === teamName) {
          if (m.awayScore > m.homeScore) results.push('V');
          else if (m.awayScore < m.homeScore) results.push('D');
          else results.push('E');
        }
      }
    }
    return results;
  }

  /**
   * Calculate standings dynamically from played fixture matches
   */
  function calculateStandings(fixturePhase, fallbackGroups = []) {
    if (!fixturePhase || !fixturePhase.rounds || fixturePhase.rounds.length === 0) {
      return fallbackGroups;
    }

    let hasPlayedMatches = false;
    for (const round of fixturePhase.rounds) {
      for (const m of round.matches) {
        if (m.homeScore !== null && m.awayScore !== null) {
          hasPlayedMatches = true;
          break;
        }
      }
      if (hasPlayedMatches) break;
    }

    if (!hasPlayedMatches) return fallbackGroups;

    const groupsMap = {};

    for (const round of fixturePhase.rounds) {
      for (const m of round.matches) {
        const g = m.group || (fallbackGroups[0] ? fallbackGroups[0].name : 'Grupo A');
        if (!groupsMap[g]) groupsMap[g] = {};
        if (m.home && !groupsMap[g][m.home]) {
          groupsMap[g][m.home] = { name: m.home, played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, goalDiff: 0, points: 0 };
        }
        if (m.away && !groupsMap[g][m.away]) {
          groupsMap[g][m.away] = { name: m.away, played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, goalDiff: 0, points: 0 };
        }
      }
    }

    for (const round of fixturePhase.rounds) {
      for (const m of round.matches) {
        if (m.homeScore === null || m.awayScore === null) continue;
        const g = m.group || (fallbackGroups[0] ? fallbackGroups[0].name : 'Grupo A');
        const homeStats = groupsMap[g]?.[m.home];
        const awayStats = groupsMap[g]?.[m.away];

        if (homeStats) {
          homeStats.played++;
          homeStats.goalsFor += m.homeScore;
          homeStats.goalsAgainst += m.awayScore;
          if (m.homeScore > m.awayScore) { homeStats.won++; homeStats.points += 3; }
          else if (m.homeScore === m.awayScore) { homeStats.drawn++; homeStats.points += 1; }
          else { homeStats.lost++; }
        }

        if (awayStats) {
          awayStats.played++;
          awayStats.goalsFor += m.awayScore;
          awayStats.goalsAgainst += m.homeScore;
          if (m.awayScore > m.homeScore) { awayStats.won++; awayStats.points += 3; }
          else if (m.homeScore === m.awayScore) { awayStats.drawn++; awayStats.points += 1; }
          else { awayStats.lost++; }
        }
      }
    }

    const result = [];
    for (const [groupName, teamsObj] of Object.entries(groupsMap)) {
      const teams = Object.values(teamsObj).map(t => {
        t.goalDiff = t.goalsFor - t.goalsAgainst;
        return t;
      });
      result.push({ name: groupName, teams });
    }

    return result;
  }

  return { sortStandings, getPhaseMatches, getFormForPhase, calculateStandings };
})();
