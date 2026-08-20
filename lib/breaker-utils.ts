export const TEAM_PRESETS: Record<string, string[]> = {
  MLB: ['Arizona Diamondbacks','Atlanta Braves','Baltimore Orioles','Boston Red Sox','Chicago Cubs','Chicago White Sox','Cincinnati Reds','Cleveland Guardians','Colorado Rockies','Detroit Tigers','Houston Astros','Kansas City Royals','Los Angeles Angels','Los Angeles Dodgers','Miami Marlins','Milwaukee Brewers','Minnesota Twins','New York Mets','New York Yankees','Athletics','Philadelphia Phillies','Pittsburgh Pirates','San Diego Padres','San Francisco Giants','Seattle Mariners','St. Louis Cardinals','Tampa Bay Rays','Texas Rangers','Toronto Blue Jays','Washington Nationals'],
  NFL: ['Arizona Cardinals','Atlanta Falcons','Baltimore Ravens','Buffalo Bills','Carolina Panthers','Chicago Bears','Cincinnati Bengals','Cleveland Browns','Dallas Cowboys','Denver Broncos','Detroit Lions','Green Bay Packers','Houston Texans','Indianapolis Colts','Jacksonville Jaguars','Kansas City Chiefs','Las Vegas Raiders','Los Angeles Chargers','Los Angeles Rams','Miami Dolphins','Minnesota Vikings','New England Patriots','New Orleans Saints','New York Giants','New York Jets','Philadelphia Eagles','Pittsburgh Steelers','San Francisco 49ers','Seattle Seahawks','Tampa Bay Buccaneers','Tennessee Titans','Washington Commanders'],
  NBA: ['Atlanta Hawks','Boston Celtics','Brooklyn Nets','Charlotte Hornets','Chicago Bulls','Cleveland Cavaliers','Dallas Mavericks','Denver Nuggets','Detroit Pistons','Golden State Warriors','Houston Rockets','Indiana Pacers','LA Clippers','Los Angeles Lakers','Memphis Grizzlies','Miami Heat','Milwaukee Bucks','Minnesota Timberwolves','New Orleans Pelicans','New York Knicks','Oklahoma City Thunder','Orlando Magic','Philadelphia 76ers','Phoenix Suns','Portland Trail Blazers','Sacramento Kings','San Antonio Spurs','Toronto Raptors','Utah Jazz','Washington Wizards'],
  NHL: ['Anaheim Ducks','Boston Bruins','Buffalo Sabres','Calgary Flames','Carolina Hurricanes','Chicago Blackhawks','Colorado Avalanche','Columbus Blue Jackets','Dallas Stars','Detroit Red Wings','Edmonton Oilers','Florida Panthers','Los Angeles Kings','Minnesota Wild','Montreal Canadiens','Nashville Predators','New Jersey Devils','New York Islanders','New York Rangers','Ottawa Senators','Philadelphia Flyers','Pittsburgh Penguins','San Jose Sharks','Seattle Kraken','St. Louis Blues','Tampa Bay Lightning','Toronto Maple Leafs','Utah Mammoth','Vancouver Canucks','Vegas Golden Knights','Washington Capitals','Winnipeg Jets'],
};

function randomInt(maxExclusive: number) {
  if (maxExclusive <= 0) return 0;
  const range = 0x100000000;
  const limit = range - (range % maxExclusive);
  const buffer = new Uint32Array(1);
  do crypto.getRandomValues(buffer); while (buffer[0] >= limit);
  return buffer[0] % maxExclusive;
}

export function secureShuffle<T>(values: readonly T[]) {
  const copy = [...values];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(index + 1);
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

export function securePick<T>(values: readonly T[]) {
  if (!values.length) return null;
  return values[randomInt(values.length)];
}

export function verificationCode(prefix: 'RND' | 'GW', sequence: number) {
  const bytes = new Uint8Array(5);
  crypto.getRandomValues(bytes);
  const suffix = Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('').toUpperCase();
  return `${prefix}-${sequence}-${suffix}`;
}

export function randomOverlayToken() {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (value) => value.toString(36).padStart(2, '0')).join('');
}
