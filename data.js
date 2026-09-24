/* ============================================
   DATA LAYER - Reads from actual Google Sheets
   ============================================ */

const DataSource = (() => {

  const PUB_BASE = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSgqvRsQGtad6abgNSpfTU6CEIZCDNQMPK3j6_BiiDk5_24z7TB2VYm8i7yfc_uN5M1Cxb8LwoYaIFE/pub';

  const GIDS = {
    equipos: '0',
    fixture: '3594822',
    fase1: '308648648',
    fase2: '2057920886',
    playoffs: '1642874826',
  };

  async function fetchCSV(gid) {
    const url = `${PUB_BASE}?output=csv&gid=${gid}`;
    try {
      // Try direct first
      const r = await fetch(url, { cache: 'no-store' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const text = await r.text();
      return parseCSVRows(text);
    } catch (directErr) {
      console.warn(`Direct fetch failed for gid=${gid}, trying proxy...`, directErr.message);
      // Fallback: CORS proxy
      const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(url)}`;
      const r = await fetch(proxyUrl, { cache: 'no-store' });
      if (!r.ok) throw new Error(`Proxy HTTP ${r.status}`);
      const text = await r.text();
      return parseCSVRows(text);
    }
  }

  function parseCSVRows(text) {
    const lines = text.replace(/\r/g, '').trim().split('\n');
    return lines.map(line => {
      const values = [];
      let current = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') inQuotes = !inQuotes;
        else if (ch === ',' && !inQuotes) { values.push(current.trim()); current = ''; }
        else current += ch;
      }
      values.push(current.trim());
      return values;
    });
  }

  // Parse standings from Fase1 / Fase2 sheets
  // Format: row with group name, then header row, then team rows
  function parseStandings(rows) {
    const groups = [];
    let currentGroup = null;

    for (const row of rows) {
      const col1 = (row[1] || '').trim();
      const col2 = (row[2] || '').trim();

      // Group header: col1 has text, col2 is empty or not "PJ"
      if (col1 && col2 !== 'PJ' && !col1.match(/^\d/) && col1 !== '') {
        // Check if it's a group name (not a team row - teams have PJ in col2 area)
        if (col2 === '' || col2 === undefined) {
          currentGroup = { name: col1, teams: [] };
          groups.push(currentGroup);
          continue;
        }
      }

      // Header row
      if (col2 === 'PJ') continue;

      // Team row: name, PJ, G, E, P, DIF, GLS, PTS
      if (currentGroup && col1 && col2 !== '') {
        const gls = (row[7] || '').split(':');
        groups.push; // just to reference
        currentGroup.teams.push({
          name: col1,
          played: parseInt(col2) || 0,
          won: parseInt(row[3]) || 0,
          drawn: parseInt(row[4]) || 0,
          lost: parseInt(row[5]) || 0,
          goalDiff: parseInt(row[6]) || 0,
          goalsFor: parseInt(gls[0]) || 0,
          goalsAgainst: parseInt(gls[1]) || 0,
          points: parseInt(row[8]) || 0,
        });
      }
    }
    return groups;
  }

  // Parse fixture from the Fixture sheet
  // Layout: phase headers, then date headers, then group headers, then 2 match rows per group
  function parseFixture(rows) {
    const phases = [];
    let currentPhase = null;
    let dateHeaders = [];
    let i = 0;

    while (i < rows.length) {
      const row = rows[i];
      const col1 = (row[1] || '').trim();

      // Phase header (e.g. "Fase 1", "Fase 2")
      if (col1.startsWith('Fase ')) {
        currentPhase = { name: col1, rounds: [] };
        phases.push(currentPhase);
        i++;
        continue;
      }

      // Date headers row (e.g. "FECHA 1", "", "", "", "", "", "FECHA 2", ...)
      if (col1.startsWith('FECHA ')) {
        dateHeaders = [];
        // Each date block spans 6 columns: col1(local), col2(score), col3(empty), col4(away), col5(score), col6(empty?)
        // Actually: teamA, scoreA, empty, teamB, scoreB, empty
        for (let c = 1; c < row.length; c++) {
          const val = (row[c] || '').trim();
          if (val.startsWith('FECHA ')) {
            dateHeaders.push({ name: val, startCol: c });
          }
        }
        i++;
        continue;
      }

      // Group header row (e.g. "Grupo A", "", "", "", "", "", "Grupo A", ...)
      if (col1.startsWith('Grupo ') || col1.startsWith('Zona ')) {
        const groupName = col1;
        i++;

        // Next 2 rows are match rows for this group
        for (let m = 0; m < 2 && i < rows.length; m++, i++) {
          const matchRow = rows[i];
          if (!matchRow || !(matchRow[1] || '').trim()) { i++; m--; continue; }

          // For each date, extract a match
          for (const dh of dateHeaders) {
            const c = dh.startCol;
            const homeTeam = (matchRow[c] || '').trim();
            const homeScore = (matchRow[c + 1] || '').trim();
            const awayTeam = (matchRow[c + 3] || '').trim();
            const awayScore = (matchRow[c + 4] || '').trim();

            if (homeTeam || awayTeam) {
              // Find or create round
              let round = currentPhase.rounds.find(r => r.name === dh.name);
              if (!round) {
                round = { name: dh.name, group: groupName, matches: [] };
                currentPhase.rounds.push(round);
              }

              round.matches.push({
                home: homeTeam,
                away: awayTeam,
                homeScore: homeScore !== '' ? parseInt(homeScore) : null,
                awayScore: awayScore !== '' ? parseInt(awayScore) : null,
                group: groupName,
              });
            }
          }
        }
        continue;
      }

      // Empty row
      i++;
    }
    return phases;
  }

  // Parse playoffs bracket
  function parsePlayoffs(rows) {
    const bracket = {
      quarterfinals: [],
      semifinals: [],
      final: null,
    };

    // The playoff sheet has a specific visual layout:
    // Quarterfinals on the left, Semis in middle, Final on right
    // We parse based on the known structure

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const col1 = (row[1] || '').trim();
      const col4 = (row[4] || '').trim();
      const col7 = (row[7] || '').trim();
      const col8 = (row[8] || '').trim();

      // Quarterfinal label rows (contain "vs")
      if (col1.toLowerCase().includes('vs')) {
        // Next 2 rows are the QF match teams
        const team1Row = rows[i + 1];
        const team2Row = rows[i + 2];
        if (team1Row && team2Row) {
          const t1Name = (team1Row[1] || '').trim();
          const t1Score = (team1Row[2] || '').trim();
          const t2Name = (team2Row[1] || '').trim();
          const t2ScoreRaw = (team2Row[2] || '').trim();

          // Handle penalty scores like "1 (4)"
          const parseScore = (s) => {
            if (!s) return { score: null, penalties: null };
            const penMatch = s.match(/^(\d+)\s*\((\d+)\)$/);
            if (penMatch) return { score: parseInt(penMatch[1]), penalties: parseInt(penMatch[2]) };
            const num = parseInt(s);
            return { score: isNaN(num) ? null : num, penalties: null };
          };

          bracket.quarterfinals.push({
            label: col1,
            home: t1Name,
            homeScore: parseScore(t1Score),
            away: t2Name,
            awayScore: parseScore(t2ScoreRaw),
          });
        }
      }

      // Semifinals
      if (col4 && !col4.toLowerCase().includes('semis') && col4 !== '') {
        const col5 = (row[5] || '').trim();
        if (col5 !== '') {
          // This is a semi team row
          const parseScore = (s) => {
            if (!s) return { score: null, penalties: null };
            const penMatch = s.match(/^(\d+)\s*\((\d+)\)$/);
            if (penMatch) return { score: parseInt(penMatch[1]), penalties: parseInt(penMatch[2]) };
            const num = parseInt(s);
            return { score: isNaN(num) ? null : num, penalties: null };
          };

          if (!bracket._lastSemiTeam) {
            bracket._lastSemiTeam = { name: col4, score: parseScore(col5) };
          } else {
            bracket.semifinals.push({
              home: bracket._lastSemiTeam.name,
              homeScore: bracket._lastSemiTeam.score,
              away: col4,
              awayScore: parseScore(col5),
            });
            bracket._lastSemiTeam = null;
          }
        }
      }

      // Final
      if (col7 && col8 !== '' && !col7.toLowerCase().includes('final')) {
        const parseScore = (s) => {
          if (!s) return { score: null, penalties: null };
          const num = parseInt(s);
          return { score: isNaN(num) ? null : num, penalties: null };
        };

        if (!bracket._lastFinalTeam) {
          bracket._lastFinalTeam = { name: col7, score: parseScore(col8) };
        } else {
          bracket.final = {
            home: bracket._lastFinalTeam.name,
            homeScore: bracket._lastFinalTeam.score,
            away: col7,
            awayScore: parseScore(col8),
          };
          bracket._lastFinalTeam = null;
        }
      }
    }

    delete bracket._lastSemiTeam;
    delete bracket._lastFinalTeam;

    return bracket;
  }

  async function fetchLogos() {
    const logos = {};
    try {
      const pubSheetUrl = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSgqvRsQGtad6abgNSpfTU6CEIZCDNQMPK3j6_BiiDk5_24z7TB2VYm8i7yfc_uN5M1Cxb8LwoYaIFE/pubhtml/sheet?headers=false&gid=0';
      const r = await fetch(pubSheetUrl);
      if (!r.ok) return logos;
      const html = await r.text();
      const regex = /<td[^>]*>([^<]+)<\/td>\s*<td[^>]*><div[^>]*><img[^>]+src=["']([^"']+)["']/gi;
      let m;
      const tasks = [];
      while ((m = regex.exec(html)) !== null) {
        const teamName = m[1].trim();
        // Request original high-resolution image (=s400) instead of cell thumbnail (=w100-h20)
        const logoUrl = m[2].replace(/=w\d+-h\d+.*$/, '=s400');
        if (teamName && teamName !== 'EQUIPO') {
          tasks.push((async () => {
            try {
              const imgResp = await fetch(logoUrl);
              const buffer = await imgResp.arrayBuffer();
              const bytes = new Uint8Array(buffer);
              let binary = '';
              for (let i = 0; i < bytes.byteLength; i++) {
                binary += String.fromCharCode(bytes[i]);
              }
              const base64 = btoa(binary);
              const mime = imgResp.headers.get('content-type') || 'image/png';
              logos[teamName] = `data:${mime};base64,${base64}`;
            } catch (err) {
              logos[teamName] = logoUrl;
            }
          })());
        }
      }
      await Promise.all(tasks);
    } catch (e) {
      console.warn('Could not fetch team logos:', e);
    }
    return logos;
  }

  async function load() {
    try {
      const [equiposRows, fixtureRows, fase1Rows, fase2Rows, playoffsRows, logos] = await Promise.all([
        fetchCSV(GIDS.equipos),
        fetchCSV(GIDS.fixture),
        fetchCSV(GIDS.fase1),
        fetchCSV(GIDS.fase2),
        fetchCSV(GIDS.playoffs),
        fetchLogos(),
      ]);

      // Parse teams list
      const teams = [];
      for (let i = 2; i < equiposRows.length; i++) {
        const name = (equiposRows[i][1] || '').trim();
        if (name) teams.push(name);
      }

      const fase1 = parseStandings(fase1Rows);
      const fase2 = parseStandings(fase2Rows);
      const fixture = parseFixture(fixtureRows);
      const playoffs = parsePlayoffs(playoffsRows);

      console.log('✅ Data & logos loaded from Google Sheets');
      return { teams, fase1, fase2, fixture, playoffs, logos, lastUpdated: new Date().toISOString() };
    } catch (err) {
      console.error('❌ Failed to load from Sheets:', err);
      throw err;
    }
  }

  return { load };
})();
