/** Swedish city dataset with coordinates and population-based density classification */

export type AreaType = 'METRO' | 'CITY' | 'TOWN';
export type Density = 'HIGH' | 'MED' | 'LOW';

export interface CityProfile {
  name: string;
  lat: number;
  lng: number;
  population: number;
  type: AreaType;
  density: Density;
}

// Population-based classification:
// METRO (>300k): Stockholm, Göteborg, Malmö
// CITY (50k-300k): Uppsala, Linköping, Västerås, etc.
// TOWN (<50k): Smaller cities
export const SWEDEN_CITIES: CityProfile[] = [
  // METRO
  { name: 'Stockholm', lat: 59.3293, lng: 18.0686, population: 975000, type: 'METRO', density: 'HIGH' },
  { name: 'Göteborg', lat: 57.7089, lng: 11.9746, population: 590000, type: 'METRO', density: 'HIGH' },
  { name: 'Malmö', lat: 55.6050, lng: 13.0038, population: 350000, type: 'METRO', density: 'HIGH' },
  // CITY
  { name: 'Uppsala', lat: 59.8586, lng: 17.6389, population: 230000, type: 'CITY', density: 'MED' },
  { name: 'Linköping', lat: 58.4108, lng: 15.6214, population: 165000, type: 'CITY', density: 'MED' },
  { name: 'Västerås', lat: 59.6099, lng: 16.5448, population: 155000, type: 'CITY', density: 'MED' },
  { name: 'Örebro', lat: 59.2753, lng: 15.2134, population: 155000, type: 'CITY', density: 'MED' },
  { name: 'Helsingborg', lat: 56.0465, lng: 12.6945, population: 150000, type: 'CITY', density: 'MED' },
  { name: 'Norrköping', lat: 58.5942, lng: 16.1826, population: 143000, type: 'CITY', density: 'MED' },
  { name: 'Jönköping', lat: 57.7826, lng: 14.1618, population: 142000, type: 'CITY', density: 'MED' },
  { name: 'Lund', lat: 55.7047, lng: 13.1910, population: 125000, type: 'CITY', density: 'MED' },
  { name: 'Umeå', lat: 63.8258, lng: 20.2630, population: 130000, type: 'CITY', density: 'MED' },
  { name: 'Gävle', lat: 60.6749, lng: 17.1413, population: 103000, type: 'CITY', density: 'MED' },
  { name: 'Borås', lat: 57.7210, lng: 12.9401, population: 113000, type: 'CITY', density: 'MED' },
  { name: 'Södertälje', lat: 59.1955, lng: 17.6253, population: 100000, type: 'CITY', density: 'MED' },
  { name: 'Eskilstuna', lat: 59.3666, lng: 16.5077, population: 106000, type: 'CITY', density: 'MED' },
  { name: 'Halmstad', lat: 56.6745, lng: 12.8578, population: 103000, type: 'CITY', density: 'MED' },
  { name: 'Växjö', lat: 56.8777, lng: 14.8091, population: 94000, type: 'CITY', density: 'MED' },
  { name: 'Karlstad', lat: 59.3793, lng: 13.5036, population: 94000, type: 'CITY', density: 'MED' },
  { name: 'Sundsvall', lat: 62.3908, lng: 17.3069, population: 99000, type: 'CITY', density: 'MED' },
  { name: 'Luleå', lat: 65.5848, lng: 22.1547, population: 78000, type: 'CITY', density: 'MED' },
  { name: 'Trollhättan', lat: 58.2837, lng: 12.2886, population: 59000, type: 'CITY', density: 'MED' },
  { name: 'Östersund', lat: 63.1767, lng: 14.6361, population: 63000, type: 'CITY', density: 'LOW' },
  { name: 'Kristianstad', lat: 56.0294, lng: 14.1567, population: 85000, type: 'CITY', density: 'MED' },
  { name: 'Kalmar', lat: 56.6634, lng: 16.3566, population: 70000, type: 'CITY', density: 'MED' },
  { name: 'Skövde', lat: 58.3869, lng: 13.8458, population: 57000, type: 'CITY', density: 'MED' },
  // TOWN
  { name: 'Visby', lat: 57.6349, lng: 18.2948, population: 24000, type: 'TOWN', density: 'LOW' },
  { name: 'Falun', lat: 60.6065, lng: 15.6355, population: 59000, type: 'TOWN', density: 'LOW' },
  { name: 'Nyköping', lat: 58.7530, lng: 17.0086, population: 56000, type: 'TOWN', density: 'LOW' },
  { name: 'Varberg', lat: 57.1058, lng: 12.2508, population: 65000, type: 'TOWN', density: 'LOW' },
  { name: 'Karlskrona', lat: 56.1612, lng: 15.5869, population: 66000, type: 'TOWN', density: 'LOW' },
  { name: 'Skellefteå', lat: 64.7507, lng: 20.9528, population: 73000, type: 'TOWN', density: 'LOW' },
  { name: 'Uddevalla', lat: 58.3520, lng: 11.9385, population: 56000, type: 'TOWN', density: 'LOW' },
  { name: 'Motala', lat: 58.5369, lng: 15.0402, population: 43000, type: 'TOWN', density: 'LOW' },
  { name: 'Landskrona', lat: 55.8709, lng: 12.8303, population: 46000, type: 'TOWN', density: 'LOW' },
  { name: 'Lidköping', lat: 58.5055, lng: 13.1573, population: 40000, type: 'TOWN', density: 'LOW' },
  { name: 'Enköping', lat: 59.6354, lng: 17.0773, population: 44000, type: 'TOWN', density: 'LOW' },
  { name: 'Kiruna', lat: 67.8558, lng: 20.2253, population: 23000, type: 'TOWN', density: 'LOW' },
  { name: 'Ystad', lat: 55.4295, lng: 13.8200, population: 30000, type: 'TOWN', density: 'LOW' },
  { name: 'Piteå', lat: 65.3174, lng: 21.4797, population: 42000, type: 'TOWN', density: 'LOW' },
  { name: 'Mora', lat: 61.0064, lng: 14.5430, population: 20000, type: 'TOWN', density: 'LOW' },
  { name: 'Katrineholm', lat: 58.9960, lng: 16.2079, population: 34000, type: 'TOWN', density: 'LOW' },
  { name: 'Borlänge', lat: 60.4858, lng: 15.4365, population: 52000, type: 'TOWN', density: 'LOW' },
  { name: 'Tumba', lat: 59.1990, lng: 17.8310, population: 40000, type: 'TOWN', density: 'LOW' },
  // Additional towns
  { name: 'Norrtälje', lat: 59.7578, lng: 18.7042, population: 40000, type: 'TOWN', density: 'LOW' },
  { name: 'Alingsås', lat: 57.9300, lng: 12.5337, population: 41000, type: 'TOWN', density: 'LOW' },
  { name: 'Härnösand', lat: 62.6323, lng: 17.9381, population: 25000, type: 'TOWN', density: 'LOW' },
  { name: 'Örnsköldsvik', lat: 63.2909, lng: 18.7152, population: 56000, type: 'TOWN', density: 'LOW' },
  { name: 'Karlshamn', lat: 56.1707, lng: 14.8619, population: 32000, type: 'TOWN', density: 'LOW' },
  { name: 'Oskarshamn', lat: 57.2647, lng: 16.4478, population: 27000, type: 'TOWN', density: 'LOW' },
  { name: 'Värnamo', lat: 57.1862, lng: 14.0404, population: 34000, type: 'TOWN', density: 'LOW' },
  { name: 'Köping', lat: 59.5145, lng: 15.9933, population: 26000, type: 'TOWN', density: 'LOW' },
  { name: 'Arboga', lat: 59.3942, lng: 15.8384, population: 14000, type: 'TOWN', density: 'LOW' },
  { name: 'Falkenberg', lat: 56.9054, lng: 12.4913, population: 44000, type: 'TOWN', density: 'LOW' },
  { name: 'Vetlanda', lat: 57.4289, lng: 15.0770, population: 27000, type: 'TOWN', density: 'LOW' },
  { name: 'Mariestad', lat: 58.7095, lng: 13.8236, population: 24000, type: 'TOWN', density: 'LOW' },
  { name: 'Sala', lat: 59.9200, lng: 16.6026, population: 22000, type: 'TOWN', density: 'LOW' },
  { name: 'Kungälv', lat: 57.8710, lng: 11.9726, population: 44000, type: 'TOWN', density: 'LOW' },
  { name: 'Trelleborg', lat: 55.3762, lng: 13.1574, population: 44000, type: 'TOWN', density: 'LOW' },
  { name: 'Mjölby', lat: 58.3267, lng: 15.1317, population: 27000, type: 'TOWN', density: 'LOW' },
  { name: 'Sandviken', lat: 60.6190, lng: 16.7758, population: 38000, type: 'TOWN', density: 'LOW' },
  { name: 'Avesta', lat: 60.1451, lng: 16.1700, population: 23000, type: 'TOWN', density: 'LOW' },
  { name: 'Hudiksvall', lat: 61.7272, lng: 17.1054, population: 37000, type: 'TOWN', density: 'LOW' },
  { name: 'Strängnäs', lat: 59.3795, lng: 17.0292, population: 35000, type: 'TOWN', density: 'LOW' },
  { name: 'Bollnäs', lat: 61.3483, lng: 16.3935, population: 27000, type: 'TOWN', density: 'LOW' },
  { name: 'Söderhamn', lat: 61.3033, lng: 17.0586, population: 26000, type: 'TOWN', density: 'LOW' },
  { name: 'Kumla', lat: 59.1269, lng: 15.1432, population: 22000, type: 'TOWN', density: 'LOW' },
  { name: 'Nässjö', lat: 57.6530, lng: 14.6963, population: 31000, type: 'TOWN', density: 'LOW' },
  { name: 'Ängelholm', lat: 56.2428, lng: 12.8622, population: 42000, type: 'TOWN', density: 'LOW' },
  { name: 'Lysekil', lat: 58.2743, lng: 11.4352, population: 14000, type: 'TOWN', density: 'LOW' },
  { name: 'Markaryd', lat: 56.4602, lng: 13.5953, population: 10000, type: 'TOWN', density: 'LOW' },
  { name: 'Lidingö', lat: 59.3667, lng: 18.1500, population: 48000, type: 'TOWN', density: 'LOW' },
  { name: 'Kungsbacka', lat: 57.4870, lng: 12.0762, population: 82000, type: 'TOWN', density: 'LOW' },
  { name: 'Partille', lat: 57.7395, lng: 12.1065, population: 38000, type: 'TOWN', density: 'LOW' },
  { name: 'Mölndal', lat: 57.6554, lng: 12.0134, population: 68000, type: 'TOWN', density: 'LOW' },
  { name: 'Sollentuna', lat: 59.4281, lng: 17.9504, population: 73000, type: 'TOWN', density: 'LOW' },
  { name: 'Täby', lat: 59.4439, lng: 18.0687, population: 72000, type: 'TOWN', density: 'LOW' },
  { name: 'Nacka', lat: 59.3108, lng: 18.1636, population: 103000, type: 'TOWN', density: 'LOW' },
  { name: 'Haninge', lat: 59.1740, lng: 18.1509, population: 92000, type: 'TOWN', density: 'LOW' },
  { name: 'Huddinge', lat: 59.2372, lng: 17.9818, population: 112000, type: 'TOWN', density: 'LOW' },
];

export function findCity(name: string): CityProfile | null {
  const n = name.toLowerCase().trim();
  return SWEDEN_CITIES.find(c => c.name.toLowerCase() === n) || null;
}

export function searchCities(query: string): CityProfile[] {
  if (!query.trim()) return SWEDEN_CITIES;
  const q = query.toLowerCase().trim();
  return SWEDEN_CITIES.filter(c => c.name.toLowerCase().includes(q));
}

export function getAreaLabel(profile: CityProfile): string {
  const typeLabels: Record<AreaType, string> = { METRO: 'Metro', CITY: 'City', TOWN: 'Town' };
  const densityLabels: Record<Density, string> = { HIGH: 'High density', MED: 'Medium density', LOW: 'Low density' };
  return `${typeLabels[profile.type]} · ${densityLabels[profile.density]}`;
}
