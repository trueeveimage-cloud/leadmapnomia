/** Multi-country city dataset: Sweden, Norway, Denmark */

export type Country = 'SE' | 'NO' | 'DK';
export type AreaType = 'METRO' | 'CITY' | 'TOWN';
export type Density = 'HIGH' | 'MED' | 'LOW';

export interface CityProfile {
  name: string;
  country: Country;
  lat: number;
  lng: number;
  population: number;
  type: AreaType;
  density: Density;
}

export const COUNTRY_LABELS: Record<Country, string> = {
  SE: '🇸🇪 Sweden',
  NO: '🇳🇴 Norway',
  DK: '🇩🇰 Denmark',
};

export const COUNTRY_CENTER: Record<Country, { lat: number; lng: number; zoom: number }> = {
  SE: { lat: 62.0, lng: 15.5, zoom: 5 },
  NO: { lat: 64.5, lng: 12.0, zoom: 5 },
  DK: { lat: 56.0, lng: 10.0, zoom: 7 },
};

export const COUNTRY_DEFAULT_KEYWORDS: Record<Country, string> = {
  SE: `frisör
bilverkstad
pizzeria
tandläkare
restaurang
cafe
elektriker
rörmokare
städfirma
blomsterhandel`,
  NO: `frisør
bilverksted
pizzeria
tannlege
restaurant
cafe
elektriker
rørlegger
rengjøring
blomsterbutikk`,
  DK: `frisør
autoværksted
pizzeria
tandlæge
restaurant
cafe
elektriker
vvs
rengøring
blomsterhandel`,
};

// ─── SWEDEN ─────────────────────────────────────────
const SE_CITIES: CityProfile[] = [
  { name: 'Stockholm', country: 'SE', lat: 59.3293, lng: 18.0686, population: 975000, type: 'METRO', density: 'HIGH' },
  { name: 'Göteborg', country: 'SE', lat: 57.7089, lng: 11.9746, population: 590000, type: 'METRO', density: 'HIGH' },
  { name: 'Malmö', country: 'SE', lat: 55.6050, lng: 13.0038, population: 350000, type: 'METRO', density: 'HIGH' },
  { name: 'Uppsala', country: 'SE', lat: 59.8586, lng: 17.6389, population: 230000, type: 'CITY', density: 'MED' },
  { name: 'Linköping', country: 'SE', lat: 58.4108, lng: 15.6214, population: 165000, type: 'CITY', density: 'MED' },
  { name: 'Västerås', country: 'SE', lat: 59.6099, lng: 16.5448, population: 155000, type: 'CITY', density: 'MED' },
  { name: 'Örebro', country: 'SE', lat: 59.2753, lng: 15.2134, population: 155000, type: 'CITY', density: 'MED' },
  { name: 'Helsingborg', country: 'SE', lat: 56.0465, lng: 12.6945, population: 150000, type: 'CITY', density: 'MED' },
  { name: 'Norrköping', country: 'SE', lat: 58.5942, lng: 16.1826, population: 143000, type: 'CITY', density: 'MED' },
  { name: 'Jönköping', country: 'SE', lat: 57.7826, lng: 14.1618, population: 142000, type: 'CITY', density: 'MED' },
  { name: 'Lund', country: 'SE', lat: 55.7047, lng: 13.1910, population: 125000, type: 'CITY', density: 'MED' },
  { name: 'Umeå', country: 'SE', lat: 63.8258, lng: 20.2630, population: 130000, type: 'CITY', density: 'MED' },
  { name: 'Gävle', country: 'SE', lat: 60.6749, lng: 17.1413, population: 103000, type: 'CITY', density: 'MED' },
  { name: 'Borås', country: 'SE', lat: 57.7210, lng: 12.9401, population: 113000, type: 'CITY', density: 'MED' },
  { name: 'Södertälje', country: 'SE', lat: 59.1955, lng: 17.6253, population: 100000, type: 'CITY', density: 'MED' },
  { name: 'Eskilstuna', country: 'SE', lat: 59.3666, lng: 16.5077, population: 106000, type: 'CITY', density: 'MED' },
  { name: 'Halmstad', country: 'SE', lat: 56.6745, lng: 12.8578, population: 103000, type: 'CITY', density: 'MED' },
  { name: 'Växjö', country: 'SE', lat: 56.8777, lng: 14.8091, population: 94000, type: 'CITY', density: 'MED' },
  { name: 'Karlstad', country: 'SE', lat: 59.3793, lng: 13.5036, population: 94000, type: 'CITY', density: 'MED' },
  { name: 'Sundsvall', country: 'SE', lat: 62.3908, lng: 17.3069, population: 99000, type: 'CITY', density: 'MED' },
  { name: 'Luleå', country: 'SE', lat: 65.5848, lng: 22.1547, population: 78000, type: 'CITY', density: 'MED' },
  { name: 'Trollhättan', country: 'SE', lat: 58.2837, lng: 12.2886, population: 59000, type: 'CITY', density: 'MED' },
  { name: 'Östersund', country: 'SE', lat: 63.1767, lng: 14.6361, population: 63000, type: 'CITY', density: 'LOW' },
  { name: 'Kristianstad', country: 'SE', lat: 56.0294, lng: 14.1567, population: 85000, type: 'CITY', density: 'MED' },
  { name: 'Kalmar', country: 'SE', lat: 56.6634, lng: 16.3566, population: 70000, type: 'CITY', density: 'MED' },
  { name: 'Skövde', country: 'SE', lat: 58.3869, lng: 13.8458, population: 57000, type: 'CITY', density: 'MED' },
  { name: 'Visby', country: 'SE', lat: 57.6349, lng: 18.2948, population: 24000, type: 'TOWN', density: 'LOW' },
  { name: 'Falun', country: 'SE', lat: 60.6065, lng: 15.6355, population: 59000, type: 'TOWN', density: 'LOW' },
  { name: 'Nyköping', country: 'SE', lat: 58.7530, lng: 17.0086, population: 56000, type: 'TOWN', density: 'LOW' },
  { name: 'Varberg', country: 'SE', lat: 57.1058, lng: 12.2508, population: 65000, type: 'TOWN', density: 'LOW' },
  { name: 'Karlskrona', country: 'SE', lat: 56.1612, lng: 15.5869, population: 66000, type: 'TOWN', density: 'LOW' },
  { name: 'Skellefteå', country: 'SE', lat: 64.7507, lng: 20.9528, population: 73000, type: 'TOWN', density: 'LOW' },
  { name: 'Uddevalla', country: 'SE', lat: 58.3520, lng: 11.9385, population: 56000, type: 'TOWN', density: 'LOW' },
  { name: 'Motala', country: 'SE', lat: 58.5369, lng: 15.0402, population: 43000, type: 'TOWN', density: 'LOW' },
  { name: 'Landskrona', country: 'SE', lat: 55.8709, lng: 12.8303, population: 46000, type: 'TOWN', density: 'LOW' },
  { name: 'Lidköping', country: 'SE', lat: 58.5055, lng: 13.1573, population: 40000, type: 'TOWN', density: 'LOW' },
  { name: 'Enköping', country: 'SE', lat: 59.6354, lng: 17.0773, population: 44000, type: 'TOWN', density: 'LOW' },
  { name: 'Kiruna', country: 'SE', lat: 67.8558, lng: 20.2253, population: 23000, type: 'TOWN', density: 'LOW' },
  { name: 'Ystad', country: 'SE', lat: 55.4295, lng: 13.8200, population: 30000, type: 'TOWN', density: 'LOW' },
  { name: 'Piteå', country: 'SE', lat: 65.3174, lng: 21.4797, population: 42000, type: 'TOWN', density: 'LOW' },
  { name: 'Mora', country: 'SE', lat: 61.0064, lng: 14.5430, population: 20000, type: 'TOWN', density: 'LOW' },
  { name: 'Katrineholm', country: 'SE', lat: 58.9960, lng: 16.2079, population: 34000, type: 'TOWN', density: 'LOW' },
  { name: 'Borlänge', country: 'SE', lat: 60.4858, lng: 15.4365, population: 52000, type: 'TOWN', density: 'LOW' },
  { name: 'Tumba', country: 'SE', lat: 59.1990, lng: 17.8310, population: 40000, type: 'TOWN', density: 'LOW' },
  { name: 'Norrtälje', country: 'SE', lat: 59.7578, lng: 18.7042, population: 40000, type: 'TOWN', density: 'LOW' },
  { name: 'Alingsås', country: 'SE', lat: 57.9300, lng: 12.5337, population: 41000, type: 'TOWN', density: 'LOW' },
  { name: 'Härnösand', country: 'SE', lat: 62.6323, lng: 17.9381, population: 25000, type: 'TOWN', density: 'LOW' },
  { name: 'Örnsköldsvik', country: 'SE', lat: 63.2909, lng: 18.7152, population: 56000, type: 'TOWN', density: 'LOW' },
  { name: 'Karlshamn', country: 'SE', lat: 56.1707, lng: 14.8619, population: 32000, type: 'TOWN', density: 'LOW' },
  { name: 'Oskarshamn', country: 'SE', lat: 57.2647, lng: 16.4478, population: 27000, type: 'TOWN', density: 'LOW' },
  { name: 'Värnamo', country: 'SE', lat: 57.1862, lng: 14.0404, population: 34000, type: 'TOWN', density: 'LOW' },
  { name: 'Köping', country: 'SE', lat: 59.5145, lng: 15.9933, population: 26000, type: 'TOWN', density: 'LOW' },
  { name: 'Arboga', country: 'SE', lat: 59.3942, lng: 15.8384, population: 14000, type: 'TOWN', density: 'LOW' },
  { name: 'Falkenberg', country: 'SE', lat: 56.9054, lng: 12.4913, population: 44000, type: 'TOWN', density: 'LOW' },
  { name: 'Vetlanda', country: 'SE', lat: 57.4289, lng: 15.0770, population: 27000, type: 'TOWN', density: 'LOW' },
  { name: 'Mariestad', country: 'SE', lat: 58.7095, lng: 13.8236, population: 24000, type: 'TOWN', density: 'LOW' },
  { name: 'Sala', country: 'SE', lat: 59.9200, lng: 16.6026, population: 22000, type: 'TOWN', density: 'LOW' },
  { name: 'Kungälv', country: 'SE', lat: 57.8710, lng: 11.9726, population: 44000, type: 'TOWN', density: 'LOW' },
  { name: 'Trelleborg', country: 'SE', lat: 55.3762, lng: 13.1574, population: 44000, type: 'TOWN', density: 'LOW' },
  { name: 'Mjölby', country: 'SE', lat: 58.3267, lng: 15.1317, population: 27000, type: 'TOWN', density: 'LOW' },
  { name: 'Sandviken', country: 'SE', lat: 60.6190, lng: 16.7758, population: 38000, type: 'TOWN', density: 'LOW' },
  { name: 'Avesta', country: 'SE', lat: 60.1451, lng: 16.1700, population: 23000, type: 'TOWN', density: 'LOW' },
  { name: 'Hudiksvall', country: 'SE', lat: 61.7272, lng: 17.1054, population: 37000, type: 'TOWN', density: 'LOW' },
  { name: 'Strängnäs', country: 'SE', lat: 59.3795, lng: 17.0292, population: 35000, type: 'TOWN', density: 'LOW' },
  { name: 'Bollnäs', country: 'SE', lat: 61.3483, lng: 16.3935, population: 27000, type: 'TOWN', density: 'LOW' },
  { name: 'Söderhamn', country: 'SE', lat: 61.3033, lng: 17.0586, population: 26000, type: 'TOWN', density: 'LOW' },
  { name: 'Kumla', country: 'SE', lat: 59.1269, lng: 15.1432, population: 22000, type: 'TOWN', density: 'LOW' },
  { name: 'Nässjö', country: 'SE', lat: 57.6530, lng: 14.6963, population: 31000, type: 'TOWN', density: 'LOW' },
  { name: 'Ängelholm', country: 'SE', lat: 56.2428, lng: 12.8622, population: 42000, type: 'TOWN', density: 'LOW' },
  { name: 'Lysekil', country: 'SE', lat: 58.2743, lng: 11.4352, population: 14000, type: 'TOWN', density: 'LOW' },
  { name: 'Markaryd', country: 'SE', lat: 56.4602, lng: 13.5953, population: 10000, type: 'TOWN', density: 'LOW' },
  { name: 'Lidingö', country: 'SE', lat: 59.3667, lng: 18.1500, population: 48000, type: 'TOWN', density: 'LOW' },
  { name: 'Kungsbacka', country: 'SE', lat: 57.4870, lng: 12.0762, population: 82000, type: 'TOWN', density: 'LOW' },
  { name: 'Partille', country: 'SE', lat: 57.7395, lng: 12.1065, population: 38000, type: 'TOWN', density: 'LOW' },
  { name: 'Mölndal', country: 'SE', lat: 57.6554, lng: 12.0134, population: 68000, type: 'TOWN', density: 'LOW' },
  { name: 'Sollentuna', country: 'SE', lat: 59.4281, lng: 17.9504, population: 73000, type: 'TOWN', density: 'LOW' },
  { name: 'Täby', country: 'SE', lat: 59.4439, lng: 18.0687, population: 72000, type: 'TOWN', density: 'LOW' },
  { name: 'Nacka', country: 'SE', lat: 59.3108, lng: 18.1636, population: 103000, type: 'TOWN', density: 'LOW' },
  { name: 'Haninge', country: 'SE', lat: 59.1740, lng: 18.1509, population: 92000, type: 'TOWN', density: 'LOW' },
  { name: 'Huddinge', country: 'SE', lat: 59.2372, lng: 17.9818, population: 112000, type: 'TOWN', density: 'LOW' },
];

// ─── NORWAY ─────────────────────────────────────────
const NO_CITIES: CityProfile[] = [
  // METRO
  { name: 'Oslo', country: 'NO', lat: 59.9139, lng: 10.7522, population: 697000, type: 'METRO', density: 'HIGH' },
  { name: 'Bergen', country: 'NO', lat: 60.3913, lng: 5.3221, population: 285000, type: 'METRO', density: 'HIGH' },
  // CITY
  { name: 'Trondheim', country: 'NO', lat: 63.4305, lng: 10.3951, population: 207000, type: 'CITY', density: 'MED' },
  { name: 'Stavanger', country: 'NO', lat: 58.9700, lng: 5.7331, population: 144000, type: 'CITY', density: 'MED' },
  { name: 'Drammen', country: 'NO', lat: 59.7441, lng: 10.2045, population: 101000, type: 'CITY', density: 'MED' },
  { name: 'Fredrikstad', country: 'NO', lat: 59.2181, lng: 10.9298, population: 83000, type: 'CITY', density: 'MED' },
  { name: 'Kristiansand', country: 'NO', lat: 58.1599, lng: 8.0182, population: 112000, type: 'CITY', density: 'MED' },
  { name: 'Sandnes', country: 'NO', lat: 58.8520, lng: 5.7352, population: 80000, type: 'CITY', density: 'MED' },
  { name: 'Tromsø', country: 'NO', lat: 69.6492, lng: 18.9553, population: 77000, type: 'CITY', density: 'MED' },
  { name: 'Bodø', country: 'NO', lat: 67.2804, lng: 14.4049, population: 53000, type: 'CITY', density: 'MED' },
  { name: 'Sandefjord', country: 'NO', lat: 59.1314, lng: 10.2166, population: 65000, type: 'CITY', density: 'MED' },
  { name: 'Sarpsborg', country: 'NO', lat: 59.2839, lng: 11.1094, population: 57000, type: 'CITY', density: 'MED' },
  { name: 'Ålesund', country: 'NO', lat: 62.4722, lng: 6.1495, population: 67000, type: 'CITY', density: 'MED' },
  { name: 'Tønsberg', country: 'NO', lat: 59.2672, lng: 10.4075, population: 56000, type: 'CITY', density: 'MED' },
  { name: 'Haugesund', country: 'NO', lat: 59.4138, lng: 5.2680, population: 37000, type: 'CITY', density: 'MED' },
  { name: 'Moss', country: 'NO', lat: 59.4342, lng: 10.6578, population: 49000, type: 'CITY', density: 'MED' },
  { name: 'Porsgrunn', country: 'NO', lat: 59.1405, lng: 9.6569, population: 37000, type: 'CITY', density: 'MED' },
  { name: 'Skien', country: 'NO', lat: 59.2098, lng: 9.6089, population: 55000, type: 'CITY', density: 'MED' },
  { name: 'Arendal', country: 'NO', lat: 58.4610, lng: 8.7726, population: 45000, type: 'CITY', density: 'MED' },
  // TOWN
  { name: 'Gjøvik', country: 'NO', lat: 60.7957, lng: 10.6916, population: 31000, type: 'TOWN', density: 'LOW' },
  { name: 'Hamar', country: 'NO', lat: 60.7945, lng: 11.0680, population: 32000, type: 'TOWN', density: 'LOW' },
  { name: 'Lillehammer', country: 'NO', lat: 61.1153, lng: 10.4662, population: 28000, type: 'TOWN', density: 'LOW' },
  { name: 'Kongsberg', country: 'NO', lat: 59.6684, lng: 9.6520, population: 28000, type: 'TOWN', density: 'LOW' },
  { name: 'Molde', country: 'NO', lat: 62.7375, lng: 7.1591, population: 27000, type: 'TOWN', density: 'LOW' },
  { name: 'Harstad', country: 'NO', lat: 68.7985, lng: 16.5415, population: 25000, type: 'TOWN', density: 'LOW' },
  { name: 'Steinkjer', country: 'NO', lat: 64.0150, lng: 11.4955, population: 24000, type: 'TOWN', density: 'LOW' },
  { name: 'Elverum', country: 'NO', lat: 60.8813, lng: 11.5616, population: 21000, type: 'TOWN', density: 'LOW' },
  { name: 'Hønefoss', country: 'NO', lat: 60.1670, lng: 10.2567, population: 20000, type: 'TOWN', density: 'LOW' },
  { name: 'Narvik', country: 'NO', lat: 68.4385, lng: 17.4273, population: 19000, type: 'TOWN', density: 'LOW' },
  { name: 'Alta', country: 'NO', lat: 69.9689, lng: 23.2716, population: 21000, type: 'TOWN', density: 'LOW' },
  { name: 'Hammerfest', country: 'NO', lat: 70.6634, lng: 23.6821, population: 11000, type: 'TOWN', density: 'LOW' },
  { name: 'Kristiansund', country: 'NO', lat: 63.1106, lng: 7.7279, population: 25000, type: 'TOWN', density: 'LOW' },
  { name: 'Halden', country: 'NO', lat: 59.1337, lng: 11.3872, population: 31000, type: 'TOWN', density: 'LOW' },
  { name: 'Kongsvinger', country: 'NO', lat: 60.1943, lng: 12.0033, population: 21000, type: 'TOWN', density: 'LOW' },
  { name: 'Larvik', country: 'NO', lat: 59.0530, lng: 10.0270, population: 47000, type: 'TOWN', density: 'LOW' },
  { name: 'Mandal', country: 'NO', lat: 58.0293, lng: 7.4608, population: 16000, type: 'TOWN', density: 'LOW' },
  { name: 'Namsos', country: 'NO', lat: 64.4665, lng: 11.4965, population: 13000, type: 'TOWN', density: 'LOW' },
  { name: 'Sortland', country: 'NO', lat: 68.6932, lng: 15.4133, population: 11000, type: 'TOWN', density: 'LOW' },
  { name: 'Rana (Mo i Rana)', country: 'NO', lat: 66.3128, lng: 14.1428, population: 26000, type: 'TOWN', density: 'LOW' },
];

// ─── DENMARK ────────────────────────────────────────
const DK_CITIES: CityProfile[] = [
  // METRO
  { name: 'København', country: 'DK', lat: 55.6761, lng: 12.5683, population: 794000, type: 'METRO', density: 'HIGH' },
  { name: 'Aarhus', country: 'DK', lat: 56.1629, lng: 10.2039, population: 350000, type: 'METRO', density: 'HIGH' },
  // CITY
  { name: 'Odense', country: 'DK', lat: 55.4038, lng: 10.4024, population: 204000, type: 'CITY', density: 'MED' },
  { name: 'Aalborg', country: 'DK', lat: 57.0488, lng: 9.9217, population: 217000, type: 'CITY', density: 'MED' },
  { name: 'Esbjerg', country: 'DK', lat: 55.4764, lng: 8.4593, population: 72000, type: 'CITY', density: 'MED' },
  { name: 'Randers', country: 'DK', lat: 56.4607, lng: 10.0364, population: 62000, type: 'CITY', density: 'MED' },
  { name: 'Kolding', country: 'DK', lat: 55.4904, lng: 9.4722, population: 61000, type: 'CITY', density: 'MED' },
  { name: 'Horsens', country: 'DK', lat: 55.8607, lng: 9.8503, population: 60000, type: 'CITY', density: 'MED' },
  { name: 'Vejle', country: 'DK', lat: 55.7094, lng: 9.5356, population: 58000, type: 'CITY', density: 'MED' },
  { name: 'Roskilde', country: 'DK', lat: 55.6416, lng: 12.0880, population: 51000, type: 'CITY', density: 'MED' },
  { name: 'Herning', country: 'DK', lat: 56.1393, lng: 8.9735, population: 50000, type: 'CITY', density: 'MED' },
  { name: 'Silkeborg', country: 'DK', lat: 56.1694, lng: 9.5450, population: 49000, type: 'CITY', density: 'MED' },
  { name: 'Næstved', country: 'DK', lat: 55.2298, lng: 11.7610, population: 44000, type: 'CITY', density: 'MED' },
  { name: 'Fredericia', country: 'DK', lat: 55.5654, lng: 9.7520, population: 41000, type: 'CITY', density: 'MED' },
  { name: 'Viborg', country: 'DK', lat: 56.4532, lng: 9.4020, population: 41000, type: 'CITY', density: 'MED' },
  { name: 'Slagelse', country: 'DK', lat: 55.4027, lng: 11.3544, population: 34000, type: 'CITY', density: 'MED' },
  { name: 'Holstebro', country: 'DK', lat: 56.3600, lng: 8.6160, population: 37000, type: 'CITY', density: 'MED' },
  { name: 'Sønderborg', country: 'DK', lat: 54.9131, lng: 9.7928, population: 28000, type: 'CITY', density: 'MED' },
  // TOWN
  { name: 'Hjørring', country: 'DK', lat: 57.4641, lng: 9.9822, population: 26000, type: 'TOWN', density: 'LOW' },
  { name: 'Frederikshavn', country: 'DK', lat: 57.4406, lng: 10.5364, population: 23000, type: 'TOWN', density: 'LOW' },
  { name: 'Helsingør', country: 'DK', lat: 56.0360, lng: 12.6136, population: 47000, type: 'TOWN', density: 'LOW' },
  { name: 'Hillerød', country: 'DK', lat: 55.9295, lng: 12.3110, population: 33000, type: 'TOWN', density: 'LOW' },
  { name: 'Holbæk', country: 'DK', lat: 55.7167, lng: 11.7167, population: 29000, type: 'TOWN', density: 'LOW' },
  { name: 'Køge', country: 'DK', lat: 55.4580, lng: 12.1820, population: 37000, type: 'TOWN', density: 'LOW' },
  { name: 'Ringsted', country: 'DK', lat: 55.4419, lng: 11.7903, population: 22000, type: 'TOWN', density: 'LOW' },
  { name: 'Svendborg', country: 'DK', lat: 55.0596, lng: 10.6070, population: 28000, type: 'TOWN', density: 'LOW' },
  { name: 'Thisted', country: 'DK', lat: 56.9558, lng: 8.6908, population: 13000, type: 'TOWN', density: 'LOW' },
  { name: 'Nykøbing Falster', country: 'DK', lat: 54.7694, lng: 11.8722, population: 17000, type: 'TOWN', density: 'LOW' },
  { name: 'Haderslev', country: 'DK', lat: 55.2513, lng: 9.4894, population: 22000, type: 'TOWN', density: 'LOW' },
  { name: 'Skive', country: 'DK', lat: 56.5650, lng: 9.0330, population: 21000, type: 'TOWN', density: 'LOW' },
  { name: 'Nyborg', country: 'DK', lat: 55.3125, lng: 10.7903, population: 17000, type: 'TOWN', density: 'LOW' },
  { name: 'Middelfart', country: 'DK', lat: 55.5053, lng: 9.7314, population: 16000, type: 'TOWN', density: 'LOW' },
  { name: 'Aabenraa', country: 'DK', lat: 55.0444, lng: 9.4167, population: 17000, type: 'TOWN', density: 'LOW' },
  { name: 'Grenaa', country: 'DK', lat: 56.4156, lng: 10.8794, population: 15000, type: 'TOWN', density: 'LOW' },
];

export const ALL_CITIES: CityProfile[] = [...SE_CITIES, ...NO_CITIES, ...DK_CITIES];

export function getCitiesByCountry(country: Country): CityProfile[] {
  return ALL_CITIES.filter(c => c.country === country);
}

export function findCity(name: string, country?: Country): CityProfile | null {
  const n = name.toLowerCase().trim();
  const pool = country ? getCitiesByCountry(country) : ALL_CITIES;
  return pool.find(c => c.name.toLowerCase() === n) || null;
}

export function searchCities(query: string, country?: Country): CityProfile[] {
  const pool = country ? getCitiesByCountry(country) : ALL_CITIES;
  if (!query.trim()) return pool;
  const q = query.toLowerCase().trim();
  return pool.filter(c => c.name.toLowerCase().includes(q));
}

export function getAreaLabel(profile: CityProfile): string {
  const typeLabels: Record<AreaType, string> = { METRO: 'Metro', CITY: 'City', TOWN: 'Town' };
  const densityLabels: Record<Density, string> = { HIGH: 'High density', MED: 'Medium density', LOW: 'Low density' };
  return `${typeLabels[profile.type]} · ${densityLabels[profile.density]}`;
}
