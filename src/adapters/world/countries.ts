import type { Country, Region, SubregionKey } from './types';

/**
 * The 193 UN member states, their UN M49 subregion, and their flag colours.
 *
 * This is the part of the world data that is genuinely fixed, and it is real:
 * the same standing as `teams.ts` in the league and `instruments.ts` in the
 * book. Names, ISO codes, subregion membership and accession years are facts
 * you can check. The indicator values next door are generated, and the snapshot
 * says so in its own provenance field.
 *
 * Two entries are worth naming because they look like errors and are not.
 * Germany joined in 1973 (the two German states acceded together; the unified
 * state kept the seat) and Switzerland in 2002, having stayed out on neutrality
 * grounds for fifty-seven years while hosting a UN office the whole time.
 *
 * Observers — the Holy See and the State of Palestine — are not members and are
 * not here. That is a membership test, applied uniformly, rather than a
 * position: the table's rule is "has a seat", and it is the only rule that can
 * be applied to 193 rows without the adapter taking a view on any of them.
 *
 * `populationM` is approximate and rounded, and is used for the order of
 * magnitude of a country rather than as a current figure. See `Country`.
 */

interface CountrySeed {
  iso3: string;
  iso2: string;
  name: string;
  unMemberSince: number;
  populationM: number;
  primary: string;
  secondary: string;
}

/** Which region each subregion sits in, and the label its bed carries. */
export const SUBREGIONS: Record<
  SubregionKey,
  { label: string; region: Region }
> = {
  'northern-africa': { label: 'Northern Africa', region: 'africa' },
  'eastern-africa': { label: 'Eastern Africa', region: 'africa' },
  'middle-africa': { label: 'Middle Africa', region: 'africa' },
  'southern-africa': { label: 'Southern Africa', region: 'africa' },
  'western-africa': { label: 'Western Africa', region: 'africa' },
  'northern-america': { label: 'Northern America', region: 'americas' },
  caribbean: { label: 'Caribbean', region: 'americas' },
  'central-america': { label: 'Central America', region: 'americas' },
  'south-america': { label: 'South America', region: 'americas' },
  'central-asia': { label: 'Central Asia', region: 'asia' },
  'eastern-asia': { label: 'Eastern Asia', region: 'asia' },
  'south-eastern-asia': { label: 'South-Eastern Asia', region: 'asia' },
  'southern-asia': { label: 'Southern Asia', region: 'asia' },
  'western-asia': { label: 'Western Asia', region: 'asia' },
  'eastern-europe': { label: 'Eastern Europe', region: 'europe' },
  'northern-europe': { label: 'Northern Europe', region: 'europe' },
  'southern-europe': { label: 'Southern Europe', region: 'europe' },
  'western-europe': { label: 'Western Europe', region: 'europe' },
  'australia-new-zealand': { label: 'Australia & New Zealand', region: 'oceania' },
  melanesia: { label: 'Melanesia', region: 'oceania' },
  micronesia: { label: 'Micronesia', region: 'oceania' },
  polynesia: { label: 'Polynesia', region: 'oceania' },
};

/**
 * Bed order, west to east and north to south within each region. The layout
 * sorts beds by id, so this ordering is what puts the Americas at one end of
 * the house and Oceania at the other rather than leaving it to the alphabet.
 * Same device as the league's conference prefix and the book's sector index.
 */
export const SUBREGION_ORDER: readonly SubregionKey[] = [
  'northern-america',
  'central-america',
  'caribbean',
  'south-america',
  'northern-europe',
  'western-europe',
  'southern-europe',
  'eastern-europe',
  'northern-africa',
  'western-africa',
  'middle-africa',
  'eastern-africa',
  'southern-africa',
  'western-asia',
  'central-asia',
  'southern-asia',
  'eastern-asia',
  'south-eastern-asia',
  'australia-new-zealand',
  'melanesia',
  'micronesia',
  'polynesia',
];

const BY_SUBREGION: Record<SubregionKey, CountrySeed[]> = {
  'northern-africa': [
    { iso3: 'DZA', iso2: 'DZ', name: 'Algeria', unMemberSince: 1962, populationM: 46, primary: '#006233', secondary: '#d21034' },
    { iso3: 'EGY', iso2: 'EG', name: 'Egypt', unMemberSince: 1945, populationM: 114, primary: '#ce1126', secondary: '#c09300' },
    { iso3: 'LBY', iso2: 'LY', name: 'Libya', unMemberSince: 1955, populationM: 7, primary: '#239e46', secondary: '#e70013' },
    { iso3: 'MAR', iso2: 'MA', name: 'Morocco', unMemberSince: 1956, populationM: 37.8, primary: '#c1272d', secondary: '#006233' },
    { iso3: 'SDN', iso2: 'SD', name: 'Sudan', unMemberSince: 1956, populationM: 48, primary: '#d21034', secondary: '#007229' },
    { iso3: 'TUN', iso2: 'TN', name: 'Tunisia', unMemberSince: 1956, populationM: 12.3, primary: '#e70013', secondary: '#ffffff' },
  ],
  'eastern-africa': [
    { iso3: 'BDI', iso2: 'BI', name: 'Burundi', unMemberSince: 1962, populationM: 13.2, primary: '#ce1126', secondary: '#1eb53a' },
    { iso3: 'COM', iso2: 'KM', name: 'Comoros', unMemberSince: 1975, populationM: 0.9, primary: '#3d8e33', secondary: '#ffc61e' },
    { iso3: 'DJI', iso2: 'DJ', name: 'Djibouti', unMemberSince: 1977, populationM: 1.1, primary: '#6ab2e7', secondary: '#12ad2b' },
    { iso3: 'ERI', iso2: 'ER', name: 'Eritrea', unMemberSince: 1993, populationM: 3.7, primary: '#ea0437', secondary: '#12ad2b' },
    { iso3: 'ETH', iso2: 'ET', name: 'Ethiopia', unMemberSince: 1945, populationM: 128, primary: '#078930', secondary: '#fcdd09' },
    { iso3: 'KEN', iso2: 'KE', name: 'Kenya', unMemberSince: 1963, populationM: 55, primary: '#006600', secondary: '#bb0000' },
    { iso3: 'MDG', iso2: 'MG', name: 'Madagascar', unMemberSince: 1960, populationM: 31, primary: '#fc3d32', secondary: '#007e3a' },
    { iso3: 'MWI', iso2: 'MW', name: 'Malawi', unMemberSince: 1964, populationM: 21, primary: '#21873b', secondary: '#ce1126' },
    { iso3: 'MUS', iso2: 'MU', name: 'Mauritius', unMemberSince: 1968, populationM: 1.3, primary: '#ea2839', secondary: '#1a206d' },
    { iso3: 'MOZ', iso2: 'MZ', name: 'Mozambique', unMemberSince: 1975, populationM: 34, primary: '#007168', secondary: '#fce100' },
    { iso3: 'RWA', iso2: 'RW', name: 'Rwanda', unMemberSince: 1962, populationM: 14, primary: '#00a1de', secondary: '#fad201' },
    { iso3: 'SYC', iso2: 'SC', name: 'Seychelles', unMemberSince: 1976, populationM: 0.1, primary: '#003f87', secondary: '#d62828' },
    { iso3: 'SOM', iso2: 'SO', name: 'Somalia', unMemberSince: 1960, populationM: 18, primary: '#4189dd', secondary: '#ffffff' },
    { iso3: 'SSD', iso2: 'SS', name: 'South Sudan', unMemberSince: 2011, populationM: 11.5, primary: '#078930', secondary: '#da121a' },
    { iso3: 'TZA', iso2: 'TZ', name: 'Tanzania', unMemberSince: 1961, populationM: 67, primary: '#1eb53a', secondary: '#00a3dd' },
    { iso3: 'UGA', iso2: 'UG', name: 'Uganda', unMemberSince: 1962, populationM: 48, primary: '#fcdc04', secondary: '#d90000' },
    { iso3: 'ZMB', iso2: 'ZM', name: 'Zambia', unMemberSince: 1964, populationM: 20.5, primary: '#198a00', secondary: '#ef7d00' },
    { iso3: 'ZWE', iso2: 'ZW', name: 'Zimbabwe', unMemberSince: 1980, populationM: 16.3, primary: '#319208', secondary: '#ffd200' },
  ],
  'middle-africa': [
    { iso3: 'AGO', iso2: 'AO', name: 'Angola', unMemberSince: 1976, populationM: 36, primary: '#ce1126', secondary: '#000000' },
    { iso3: 'CMR', iso2: 'CM', name: 'Cameroon', unMemberSince: 1960, populationM: 28, primary: '#007a5e', secondary: '#ce1126' },
    { iso3: 'CAF', iso2: 'CF', name: 'Central African Republic', unMemberSince: 1960, populationM: 5.7, primary: '#003082', secondary: '#289728' },
    { iso3: 'TCD', iso2: 'TD', name: 'Chad', unMemberSince: 1960, populationM: 18.3, primary: '#002664', secondary: '#c60c30' },
    { iso3: 'COG', iso2: 'CG', name: 'Congo', unMemberSince: 1960, populationM: 6.1, primary: '#009543', secondary: '#fbde4a' },
    { iso3: 'COD', iso2: 'CD', name: 'DR Congo', unMemberSince: 1960, populationM: 102, primary: '#007fff', secondary: '#f7d618' },
    { iso3: 'GNQ', iso2: 'GQ', name: 'Equatorial Guinea', unMemberSince: 1968, populationM: 1.7, primary: '#3e9a00', secondary: '#e32118' },
    { iso3: 'GAB', iso2: 'GA', name: 'Gabon', unMemberSince: 1960, populationM: 2.4, primary: '#009e60', secondary: '#fcd116' },
    { iso3: 'STP', iso2: 'ST', name: 'Sao Tome and Principe', unMemberSince: 1975, populationM: 0.2, primary: '#12ad2b', secondary: '#ffce00' },
  ],
  'southern-africa': [
    { iso3: 'BWA', iso2: 'BW', name: 'Botswana', unMemberSince: 1966, populationM: 2.6, primary: '#75aadb', secondary: '#000000' },
    { iso3: 'SWZ', iso2: 'SZ', name: 'Eswatini', unMemberSince: 1968, populationM: 1.2, primary: '#3e5eb9', secondary: '#ffd900' },
    { iso3: 'LSO', iso2: 'LS', name: 'Lesotho', unMemberSince: 1966, populationM: 2.3, primary: '#00209f', secondary: '#009543' },
    { iso3: 'NAM', iso2: 'NA', name: 'Namibia', unMemberSince: 1990, populationM: 2.6, primary: '#003580', secondary: '#d21034' },
    { iso3: 'ZAF', iso2: 'ZA', name: 'South Africa', unMemberSince: 1945, populationM: 60, primary: '#007a4d', secondary: '#ffb612' },
  ],
  'western-africa': [
    { iso3: 'BEN', iso2: 'BJ', name: 'Benin', unMemberSince: 1960, populationM: 13.7, primary: '#008751', secondary: '#fcd116' },
    { iso3: 'BFA', iso2: 'BF', name: 'Burkina Faso', unMemberSince: 1960, populationM: 23, primary: '#ef2b2d', secondary: '#009e49' },
    { iso3: 'CPV', iso2: 'CV', name: 'Cabo Verde', unMemberSince: 1975, populationM: 0.6, primary: '#003893', secondary: '#cf2027' },
    { iso3: 'CIV', iso2: 'CI', name: "Cote d'Ivoire", unMemberSince: 1960, populationM: 29, primary: '#f77f00', secondary: '#009e60' },
    { iso3: 'GMB', iso2: 'GM', name: 'Gambia', unMemberSince: 1965, populationM: 2.8, primary: '#ce1126', secondary: '#0c1c8c' },
    { iso3: 'GHA', iso2: 'GH', name: 'Ghana', unMemberSince: 1957, populationM: 34, primary: '#ce1126', secondary: '#fcd116' },
    { iso3: 'GIN', iso2: 'GN', name: 'Guinea', unMemberSince: 1958, populationM: 14.2, primary: '#ce1126', secondary: '#fcd116' },
    { iso3: 'GNB', iso2: 'GW', name: 'Guinea-Bissau', unMemberSince: 1974, populationM: 2.2, primary: '#ce1126', secondary: '#009e49' },
    { iso3: 'LBR', iso2: 'LR', name: 'Liberia', unMemberSince: 1945, populationM: 5.4, primary: '#002b7f', secondary: '#bf0a30' },
    { iso3: 'MLI', iso2: 'ML', name: 'Mali', unMemberSince: 1960, populationM: 23, primary: '#14b53a', secondary: '#fcd116' },
    { iso3: 'MRT', iso2: 'MR', name: 'Mauritania', unMemberSince: 1961, populationM: 4.9, primary: '#006233', secondary: '#ffc400' },
    { iso3: 'NER', iso2: 'NE', name: 'Niger', unMemberSince: 1960, populationM: 26, primary: '#0db02b', secondary: '#e05206' },
    { iso3: 'NGA', iso2: 'NG', name: 'Nigeria', unMemberSince: 1960, populationM: 223, primary: '#008751', secondary: '#ffffff' },
    { iso3: 'SEN', iso2: 'SN', name: 'Senegal', unMemberSince: 1960, populationM: 18, primary: '#00853f', secondary: '#fdef42' },
    { iso3: 'SLE', iso2: 'SL', name: 'Sierra Leone', unMemberSince: 1961, populationM: 8.6, primary: '#1eb53a', secondary: '#0072c6' },
    { iso3: 'TGO', iso2: 'TG', name: 'Togo', unMemberSince: 1960, populationM: 9, primary: '#006a4e', secondary: '#ffce00' },
  ],
  'northern-america': [
    { iso3: 'CAN', iso2: 'CA', name: 'Canada', unMemberSince: 1945, populationM: 40, primary: '#d52b1e', secondary: '#ffffff' },
    { iso3: 'USA', iso2: 'US', name: 'United States', unMemberSince: 1945, populationM: 335, primary: '#3c3b6e', secondary: '#b22234' },
  ],
  caribbean: [
    { iso3: 'ATG', iso2: 'AG', name: 'Antigua and Barbuda', unMemberSince: 1981, populationM: 0.1, primary: '#ce1126', secondary: '#0072c6' },
    { iso3: 'BHS', iso2: 'BS', name: 'Bahamas', unMemberSince: 1973, populationM: 0.4, primary: '#00778b', secondary: '#ffc72c' },
    { iso3: 'BRB', iso2: 'BB', name: 'Barbados', unMemberSince: 1966, populationM: 0.3, primary: '#00267f', secondary: '#ffc726' },
    { iso3: 'CUB', iso2: 'CU', name: 'Cuba', unMemberSince: 1945, populationM: 11, primary: '#002a8f', secondary: '#cf142b' },
    { iso3: 'DMA', iso2: 'DM', name: 'Dominica', unMemberSince: 1978, populationM: 0.07, primary: '#006b3f', secondary: '#ffd100' },
    { iso3: 'DOM', iso2: 'DO', name: 'Dominican Republic', unMemberSince: 1945, populationM: 11.3, primary: '#002d62', secondary: '#ce1126' },
    { iso3: 'GRD', iso2: 'GD', name: 'Grenada', unMemberSince: 1974, populationM: 0.1, primary: '#ce1126', secondary: '#007a5e' },
    { iso3: 'HTI', iso2: 'HT', name: 'Haiti', unMemberSince: 1945, populationM: 11.6, primary: '#00209f', secondary: '#d21034' },
    { iso3: 'JAM', iso2: 'JM', name: 'Jamaica', unMemberSince: 1962, populationM: 2.8, primary: '#009b3a', secondary: '#fed100' },
    { iso3: 'KNA', iso2: 'KN', name: 'Saint Kitts and Nevis', unMemberSince: 1983, populationM: 0.05, primary: '#009e49', secondary: '#ffd100' },
    { iso3: 'LCA', iso2: 'LC', name: 'Saint Lucia', unMemberSince: 1979, populationM: 0.18, primary: '#66ccff', secondary: '#fcd116' },
    { iso3: 'VCT', iso2: 'VC', name: 'Saint Vincent and the Grenadines', unMemberSince: 1980, populationM: 0.1, primary: '#0072c6', secondary: '#fcd116' },
    { iso3: 'TTO', iso2: 'TT', name: 'Trinidad and Tobago', unMemberSince: 1962, populationM: 1.5, primary: '#ce1126', secondary: '#000000' },
  ],
  'central-america': [
    { iso3: 'BLZ', iso2: 'BZ', name: 'Belize', unMemberSince: 1981, populationM: 0.4, primary: '#ce1126', secondary: '#003f87' },
    { iso3: 'CRI', iso2: 'CR', name: 'Costa Rica', unMemberSince: 1945, populationM: 5.2, primary: '#002b7f', secondary: '#ce1126' },
    { iso3: 'SLV', iso2: 'SV', name: 'El Salvador', unMemberSince: 1945, populationM: 6.3, primary: '#0f47af', secondary: '#ffffff' },
    { iso3: 'GTM', iso2: 'GT', name: 'Guatemala', unMemberSince: 1945, populationM: 18, primary: '#4997d0', secondary: '#ffffff' },
    { iso3: 'HND', iso2: 'HN', name: 'Honduras', unMemberSince: 1945, populationM: 10.4, primary: '#0073cf', secondary: '#ffffff' },
    { iso3: 'MEX', iso2: 'MX', name: 'Mexico', unMemberSince: 1945, populationM: 129, primary: '#006341', secondary: '#ce1126' },
    { iso3: 'NIC', iso2: 'NI', name: 'Nicaragua', unMemberSince: 1945, populationM: 7, primary: '#0067c6', secondary: '#ffffff' },
    { iso3: 'PAN', iso2: 'PA', name: 'Panama', unMemberSince: 1945, populationM: 4.5, primary: '#005293', secondary: '#da121a' },
  ],
  'south-america': [
    { iso3: 'ARG', iso2: 'AR', name: 'Argentina', unMemberSince: 1945, populationM: 46, primary: '#74acdf', secondary: '#f6b40e' },
    { iso3: 'BOL', iso2: 'BO', name: 'Bolivia', unMemberSince: 1945, populationM: 12.4, primary: '#d52b1e', secondary: '#f9e300' },
    { iso3: 'BRA', iso2: 'BR', name: 'Brazil', unMemberSince: 1945, populationM: 216, primary: '#009c3b', secondary: '#ffdf00' },
    { iso3: 'CHL', iso2: 'CL', name: 'Chile', unMemberSince: 1945, populationM: 19.6, primary: '#0039a6', secondary: '#d52b1e' },
    { iso3: 'COL', iso2: 'CO', name: 'Colombia', unMemberSince: 1945, populationM: 52, primary: '#fcd116', secondary: '#003893' },
    { iso3: 'ECU', iso2: 'EC', name: 'Ecuador', unMemberSince: 1945, populationM: 18.2, primary: '#fcd116', secondary: '#0072ce' },
    { iso3: 'GUY', iso2: 'GY', name: 'Guyana', unMemberSince: 1966, populationM: 0.8, primary: '#009e49', secondary: '#fcd116' },
    { iso3: 'PRY', iso2: 'PY', name: 'Paraguay', unMemberSince: 1945, populationM: 6.9, primary: '#d52b1e', secondary: '#0038a8' },
    { iso3: 'PER', iso2: 'PE', name: 'Peru', unMemberSince: 1945, populationM: 34, primary: '#d91023', secondary: '#ffffff' },
    { iso3: 'SUR', iso2: 'SR', name: 'Suriname', unMemberSince: 1975, populationM: 0.6, primary: '#377e3f', secondary: '#b40a2d' },
    { iso3: 'URY', iso2: 'UY', name: 'Uruguay', unMemberSince: 1945, populationM: 3.4, primary: '#0038a8', secondary: '#fcd116' },
    { iso3: 'VEN', iso2: 'VE', name: 'Venezuela', unMemberSince: 1945, populationM: 28.8, primary: '#fcd116', secondary: '#00247d' },
  ],
  'central-asia': [
    { iso3: 'KAZ', iso2: 'KZ', name: 'Kazakhstan', unMemberSince: 1992, populationM: 20, primary: '#00afca', secondary: '#fec50c' },
    { iso3: 'KGZ', iso2: 'KG', name: 'Kyrgyzstan', unMemberSince: 1992, populationM: 7, primary: '#e8112d', secondary: '#ffef00' },
    { iso3: 'TJK', iso2: 'TJ', name: 'Tajikistan', unMemberSince: 1992, populationM: 10.1, primary: '#cc0000', secondary: '#006600' },
    { iso3: 'TKM', iso2: 'TM', name: 'Turkmenistan', unMemberSince: 1992, populationM: 6.5, primary: '#28ae66', secondary: '#ffffff' },
    { iso3: 'UZB', iso2: 'UZ', name: 'Uzbekistan', unMemberSince: 1992, populationM: 36, primary: '#0099b5', secondary: '#1eb53a' },
  ],
  'eastern-asia': [
    { iso3: 'CHN', iso2: 'CN', name: 'China', unMemberSince: 1945, populationM: 1411, primary: '#de2910', secondary: '#ffde00' },
    { iso3: 'JPN', iso2: 'JP', name: 'Japan', unMemberSince: 1956, populationM: 124, primary: '#bc002d', secondary: '#ffffff' },
    { iso3: 'MNG', iso2: 'MN', name: 'Mongolia', unMemberSince: 1961, populationM: 3.4, primary: '#c4272f', secondary: '#015197' },
    { iso3: 'PRK', iso2: 'KP', name: 'North Korea', unMemberSince: 1991, populationM: 26, primary: '#024fa2', secondary: '#ed1c27' },
    { iso3: 'KOR', iso2: 'KR', name: 'South Korea', unMemberSince: 1991, populationM: 51.7, primary: '#cd2e3a', secondary: '#0047a0' },
  ],
  'south-eastern-asia': [
    { iso3: 'BRN', iso2: 'BN', name: 'Brunei', unMemberSince: 1984, populationM: 0.45, primary: '#f7e017', secondary: '#000000' },
    { iso3: 'KHM', iso2: 'KH', name: 'Cambodia', unMemberSince: 1955, populationM: 17, primary: '#032ea1', secondary: '#e00025' },
    { iso3: 'IDN', iso2: 'ID', name: 'Indonesia', unMemberSince: 1950, populationM: 278, primary: '#ce1126', secondary: '#ffffff' },
    { iso3: 'LAO', iso2: 'LA', name: 'Laos', unMemberSince: 1955, populationM: 7.6, primary: '#ce1126', secondary: '#002868' },
    { iso3: 'MYS', iso2: 'MY', name: 'Malaysia', unMemberSince: 1957, populationM: 34, primary: '#010066', secondary: '#cc0001' },
    { iso3: 'MMR', iso2: 'MM', name: 'Myanmar', unMemberSince: 1948, populationM: 54.5, primary: '#fecb00', secondary: '#34b233' },
    { iso3: 'PHL', iso2: 'PH', name: 'Philippines', unMemberSince: 1945, populationM: 117, primary: '#0038a8', secondary: '#ce1126' },
    { iso3: 'SGP', iso2: 'SG', name: 'Singapore', unMemberSince: 1965, populationM: 5.9, primary: '#ed2939', secondary: '#ffffff' },
    { iso3: 'THA', iso2: 'TH', name: 'Thailand', unMemberSince: 1946, populationM: 71.7, primary: '#a51931', secondary: '#2d2a4a' },
    { iso3: 'TLS', iso2: 'TL', name: 'Timor-Leste', unMemberSince: 2002, populationM: 1.4, primary: '#dc241f', secondary: '#ffc726' },
    { iso3: 'VNM', iso2: 'VN', name: 'Viet Nam', unMemberSince: 1977, populationM: 100, primary: '#da251d', secondary: '#ffff00' },
  ],
  'southern-asia': [
    { iso3: 'AFG', iso2: 'AF', name: 'Afghanistan', unMemberSince: 1946, populationM: 42, primary: '#000000', secondary: '#d32011' },
    { iso3: 'BGD', iso2: 'BD', name: 'Bangladesh', unMemberSince: 1974, populationM: 173, primary: '#006a4e', secondary: '#f42a41' },
    { iso3: 'BTN', iso2: 'BT', name: 'Bhutan', unMemberSince: 1971, populationM: 0.8, primary: '#ffd520', secondary: '#ff4e12' },
    { iso3: 'IND', iso2: 'IN', name: 'India', unMemberSince: 1945, populationM: 1428, primary: '#ff9933', secondary: '#138808' },
    { iso3: 'IRN', iso2: 'IR', name: 'Iran', unMemberSince: 1945, populationM: 89, primary: '#239f40', secondary: '#da0000' },
    { iso3: 'MDV', iso2: 'MV', name: 'Maldives', unMemberSince: 1965, populationM: 0.5, primary: '#d21034', secondary: '#007e3a' },
    { iso3: 'NPL', iso2: 'NP', name: 'Nepal', unMemberSince: 1955, populationM: 30, primary: '#dc143c', secondary: '#003893' },
    { iso3: 'PAK', iso2: 'PK', name: 'Pakistan', unMemberSince: 1947, populationM: 240, primary: '#01411c', secondary: '#ffffff' },
    { iso3: 'LKA', iso2: 'LK', name: 'Sri Lanka', unMemberSince: 1955, populationM: 22, primary: '#8d2029', secondary: '#ffbe29' },
  ],
  'western-asia': [
    { iso3: 'ARM', iso2: 'AM', name: 'Armenia', unMemberSince: 1992, populationM: 2.8, primary: '#d90012', secondary: '#0033a0' },
    { iso3: 'AZE', iso2: 'AZ', name: 'Azerbaijan', unMemberSince: 1992, populationM: 10.1, primary: '#00b5e2', secondary: '#ed2939' },
    { iso3: 'BHR', iso2: 'BH', name: 'Bahrain', unMemberSince: 1971, populationM: 1.5, primary: '#ce1126', secondary: '#ffffff' },
    { iso3: 'CYP', iso2: 'CY', name: 'Cyprus', unMemberSince: 1960, populationM: 1.3, primary: '#d57800', secondary: '#ffffff' },
    { iso3: 'GEO', iso2: 'GE', name: 'Georgia', unMemberSince: 1992, populationM: 3.7, primary: '#e8112d', secondary: '#ffffff' },
    { iso3: 'IRQ', iso2: 'IQ', name: 'Iraq', unMemberSince: 1945, populationM: 45, primary: '#ce1126', secondary: '#000000' },
    { iso3: 'ISR', iso2: 'IL', name: 'Israel', unMemberSince: 1949, populationM: 9.8, primary: '#0038b8', secondary: '#ffffff' },
    { iso3: 'JOR', iso2: 'JO', name: 'Jordan', unMemberSince: 1955, populationM: 11.3, primary: '#007a3d', secondary: '#ce1126' },
    { iso3: 'KWT', iso2: 'KW', name: 'Kuwait', unMemberSince: 1963, populationM: 4.3, primary: '#007a3d', secondary: '#ce1126' },
    { iso3: 'LBN', iso2: 'LB', name: 'Lebanon', unMemberSince: 1945, populationM: 5.5, primary: '#ed1c24', secondary: '#00a651' },
    { iso3: 'OMN', iso2: 'OM', name: 'Oman', unMemberSince: 1971, populationM: 4.6, primary: '#db161b', secondary: '#008000' },
    { iso3: 'QAT', iso2: 'QA', name: 'Qatar', unMemberSince: 1971, populationM: 2.7, primary: '#8a1538', secondary: '#ffffff' },
    { iso3: 'SAU', iso2: 'SA', name: 'Saudi Arabia', unMemberSince: 1945, populationM: 36.9, primary: '#165d31', secondary: '#ffffff' },
    { iso3: 'SYR', iso2: 'SY', name: 'Syria', unMemberSince: 1945, populationM: 23.2, primary: '#ce1126', secondary: '#007a3d' },
    { iso3: 'TUR', iso2: 'TR', name: 'Turkiye', unMemberSince: 1945, populationM: 85.3, primary: '#e30a17', secondary: '#ffffff' },
    { iso3: 'ARE', iso2: 'AE', name: 'United Arab Emirates', unMemberSince: 1971, populationM: 9.5, primary: '#00732f', secondary: '#ce1126' },
    { iso3: 'YEM', iso2: 'YE', name: 'Yemen', unMemberSince: 1947, populationM: 34.4, primary: '#ce1126', secondary: '#000000' },
  ],
  'eastern-europe': [
    { iso3: 'BLR', iso2: 'BY', name: 'Belarus', unMemberSince: 1945, populationM: 9.2, primary: '#ce1720', secondary: '#007c30' },
    { iso3: 'BGR', iso2: 'BG', name: 'Bulgaria', unMemberSince: 1955, populationM: 6.4, primary: '#00966e', secondary: '#d62612' },
    { iso3: 'CZE', iso2: 'CZ', name: 'Czechia', unMemberSince: 1993, populationM: 10.9, primary: '#11457e', secondary: '#d7141a' },
    { iso3: 'HUN', iso2: 'HU', name: 'Hungary', unMemberSince: 1955, populationM: 9.6, primary: '#cd2a3e', secondary: '#436f4d' },
    { iso3: 'MDA', iso2: 'MD', name: 'Moldova', unMemberSince: 1992, populationM: 2.5, primary: '#0046ae', secondary: '#cc092f' },
    { iso3: 'POL', iso2: 'PL', name: 'Poland', unMemberSince: 1945, populationM: 36.7, primary: '#dc143c', secondary: '#ffffff' },
    { iso3: 'ROU', iso2: 'RO', name: 'Romania', unMemberSince: 1955, populationM: 19, primary: '#002b7f', secondary: '#fcd116' },
    { iso3: 'RUS', iso2: 'RU', name: 'Russia', unMemberSince: 1945, populationM: 144, primary: '#0039a6', secondary: '#d52b1e' },
    { iso3: 'SVK', iso2: 'SK', name: 'Slovakia', unMemberSince: 1993, populationM: 5.4, primary: '#0b4ea2', secondary: '#ee1c25' },
    { iso3: 'UKR', iso2: 'UA', name: 'Ukraine', unMemberSince: 1945, populationM: 37, primary: '#005bbb', secondary: '#ffd500' },
  ],
  'northern-europe': [
    { iso3: 'DNK', iso2: 'DK', name: 'Denmark', unMemberSince: 1945, populationM: 5.9, primary: '#c60c30', secondary: '#ffffff' },
    { iso3: 'EST', iso2: 'EE', name: 'Estonia', unMemberSince: 1991, populationM: 1.4, primary: '#0072ce', secondary: '#000000' },
    { iso3: 'FIN', iso2: 'FI', name: 'Finland', unMemberSince: 1955, populationM: 5.6, primary: '#003580', secondary: '#ffffff' },
    { iso3: 'ISL', iso2: 'IS', name: 'Iceland', unMemberSince: 1946, populationM: 0.4, primary: '#02529c', secondary: '#dc1e35' },
    { iso3: 'IRL', iso2: 'IE', name: 'Ireland', unMemberSince: 1955, populationM: 5.3, primary: '#169b62', secondary: '#ff883e' },
    { iso3: 'LVA', iso2: 'LV', name: 'Latvia', unMemberSince: 1991, populationM: 1.9, primary: '#9e3039', secondary: '#ffffff' },
    { iso3: 'LTU', iso2: 'LT', name: 'Lithuania', unMemberSince: 1991, populationM: 2.9, primary: '#fdb913', secondary: '#006a44' },
    { iso3: 'NOR', iso2: 'NO', name: 'Norway', unMemberSince: 1945, populationM: 5.5, primary: '#ba0c2f', secondary: '#00205b' },
    { iso3: 'SWE', iso2: 'SE', name: 'Sweden', unMemberSince: 1946, populationM: 10.5, primary: '#006aa7', secondary: '#fecc00' },
    { iso3: 'GBR', iso2: 'GB', name: 'United Kingdom', unMemberSince: 1945, populationM: 67.6, primary: '#012169', secondary: '#c8102e' },
  ],
  'southern-europe': [
    { iso3: 'ALB', iso2: 'AL', name: 'Albania', unMemberSince: 1955, populationM: 2.8, primary: '#e41e20', secondary: '#000000' },
    { iso3: 'AND', iso2: 'AD', name: 'Andorra', unMemberSince: 1993, populationM: 0.08, primary: '#10069f', secondary: '#d0103a' },
    { iso3: 'BIH', iso2: 'BA', name: 'Bosnia and Herzegovina', unMemberSince: 1992, populationM: 3.2, primary: '#002395', secondary: '#fecb00' },
    { iso3: 'HRV', iso2: 'HR', name: 'Croatia', unMemberSince: 1992, populationM: 3.9, primary: '#ff0000', secondary: '#171796' },
    { iso3: 'GRC', iso2: 'GR', name: 'Greece', unMemberSince: 1945, populationM: 10.4, primary: '#0d5eaf', secondary: '#ffffff' },
    { iso3: 'ITA', iso2: 'IT', name: 'Italy', unMemberSince: 1955, populationM: 58.9, primary: '#008c45', secondary: '#cd212a' },
    { iso3: 'MLT', iso2: 'MT', name: 'Malta', unMemberSince: 1964, populationM: 0.5, primary: '#cf142b', secondary: '#ffffff' },
    { iso3: 'MNE', iso2: 'ME', name: 'Montenegro', unMemberSince: 2006, populationM: 0.6, primary: '#c40308', secondary: '#d3a02d' },
    { iso3: 'MKD', iso2: 'MK', name: 'North Macedonia', unMemberSince: 1993, populationM: 1.8, primary: '#d20000', secondary: '#ffe600' },
    { iso3: 'PRT', iso2: 'PT', name: 'Portugal', unMemberSince: 1955, populationM: 10.5, primary: '#046a38', secondary: '#da291c' },
    { iso3: 'SMR', iso2: 'SM', name: 'San Marino', unMemberSince: 1992, populationM: 0.03, primary: '#5eb6e4', secondary: '#ffffff' },
    { iso3: 'SRB', iso2: 'RS', name: 'Serbia', unMemberSince: 2000, populationM: 6.6, primary: '#c6363c', secondary: '#0c4076' },
    { iso3: 'SVN', iso2: 'SI', name: 'Slovenia', unMemberSince: 1992, populationM: 2.1, primary: '#005da4', secondary: '#ed1c24' },
    { iso3: 'ESP', iso2: 'ES', name: 'Spain', unMemberSince: 1955, populationM: 48.3, primary: '#aa151b', secondary: '#f1bf00' },
  ],
  'western-europe': [
    { iso3: 'AUT', iso2: 'AT', name: 'Austria', unMemberSince: 1955, populationM: 9.1, primary: '#ed2939', secondary: '#ffffff' },
    { iso3: 'BEL', iso2: 'BE', name: 'Belgium', unMemberSince: 1945, populationM: 11.7, primary: '#000000', secondary: '#fae042' },
    { iso3: 'FRA', iso2: 'FR', name: 'France', unMemberSince: 1945, populationM: 68, primary: '#002395', secondary: '#ed2939' },
    { iso3: 'DEU', iso2: 'DE', name: 'Germany', unMemberSince: 1973, populationM: 84, primary: '#000000', secondary: '#dd0000' },
    { iso3: 'LIE', iso2: 'LI', name: 'Liechtenstein', unMemberSince: 1990, populationM: 0.04, primary: '#002b7f', secondary: '#ce1126' },
    { iso3: 'LUX', iso2: 'LU', name: 'Luxembourg', unMemberSince: 1945, populationM: 0.66, primary: '#00a1de', secondary: '#ed2939' },
    { iso3: 'MCO', iso2: 'MC', name: 'Monaco', unMemberSince: 1993, populationM: 0.04, primary: '#ce1126', secondary: '#ffffff' },
    { iso3: 'NLD', iso2: 'NL', name: 'Netherlands', unMemberSince: 1945, populationM: 17.8, primary: '#ae1c28', secondary: '#21468b' },
    { iso3: 'CHE', iso2: 'CH', name: 'Switzerland', unMemberSince: 2002, populationM: 8.8, primary: '#d52b1e', secondary: '#ffffff' },
  ],
  'australia-new-zealand': [
    { iso3: 'AUS', iso2: 'AU', name: 'Australia', unMemberSince: 1945, populationM: 26.5, primary: '#012169', secondary: '#e4002b' },
    { iso3: 'NZL', iso2: 'NZ', name: 'New Zealand', unMemberSince: 1945, populationM: 5.2, primary: '#012169', secondary: '#c8102e' },
  ],
  melanesia: [
    { iso3: 'FJI', iso2: 'FJ', name: 'Fiji', unMemberSince: 1970, populationM: 0.93, primary: '#68bfe5', secondary: '#002868' },
    { iso3: 'PNG', iso2: 'PG', name: 'Papua New Guinea', unMemberSince: 1975, populationM: 10.3, primary: '#ce1126', secondary: '#000000' },
    { iso3: 'SLB', iso2: 'SB', name: 'Solomon Islands', unMemberSince: 1978, populationM: 0.75, primary: '#0051ba', secondary: '#215b33' },
    { iso3: 'VUT', iso2: 'VU', name: 'Vanuatu', unMemberSince: 1981, populationM: 0.33, primary: '#d21034', secondary: '#009543' },
  ],
  micronesia: [
    { iso3: 'FSM', iso2: 'FM', name: 'Micronesia', unMemberSince: 1991, populationM: 0.11, primary: '#75b2dd', secondary: '#ffffff' },
    { iso3: 'KIR', iso2: 'KI', name: 'Kiribati', unMemberSince: 1999, populationM: 0.13, primary: '#ce1126', secondary: '#003f87' },
    { iso3: 'MHL', iso2: 'MH', name: 'Marshall Islands', unMemberSince: 1991, populationM: 0.04, primary: '#003893', secondary: '#dd7500' },
    { iso3: 'NRU', iso2: 'NR', name: 'Nauru', unMemberSince: 1999, populationM: 0.012, primary: '#002b7f', secondary: '#ffc61e' },
    { iso3: 'PLW', iso2: 'PW', name: 'Palau', unMemberSince: 1994, populationM: 0.018, primary: '#4aadd6', secondary: '#ffde00' },
  ],
  polynesia: [
    { iso3: 'WSM', iso2: 'WS', name: 'Samoa', unMemberSince: 1976, populationM: 0.22, primary: '#ce1126', secondary: '#002b7f' },
    { iso3: 'TON', iso2: 'TO', name: 'Tonga', unMemberSince: 1999, populationM: 0.1, primary: '#c10000', secondary: '#ffffff' },
    { iso3: 'TUV', iso2: 'TV', name: 'Tuvalu', unMemberSince: 2000, populationM: 0.011, primary: '#5b97b1', secondary: '#ffce00' },
  ],
};

/** Every UN member state, flattened, in bed order. */
export const COUNTRIES: readonly Country[] = SUBREGION_ORDER.flatMap((subregion) =>
  BY_SUBREGION[subregion].map((seed) => ({
    ...seed,
    subregion,
    region: SUBREGIONS[subregion].region,
  })),
);

const BY_ISO3 = new Map(COUNTRIES.map((country) => [country.iso3, country]));

export function countryOf(iso3: string): Country | undefined {
  return BY_ISO3.get(iso3);
}

export function countriesIn(subregion: SubregionKey): Country[] {
  return COUNTRIES.filter((country) => country.subregion === subregion);
}
