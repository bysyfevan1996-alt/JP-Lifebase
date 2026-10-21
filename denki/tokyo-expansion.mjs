import sources from './tokyo-expansion-sources.json' with { type: 'json' };

export const tariffs = [
  // idemitsu-s-tokyo group
  {id: 'idemitsu-s-tokyo-202605-v1', offerId: 'idemitsu-s-tokyo', areaId: 'tokyo', ruleId: 'idemitsu-s-202507', month: '2026-05', fuelGrossYen: '-7.37', subsidyYen: '0.00', renewableYen: '4.18', sourceIds: ['idemitsu-fuel-202605', 'renewable-2026'], applicability: {basis: 'provider_meter_reading_month', month: '2026-05', standardFullCycleOnly: true, taxIncluded: true, zeroUseSupported: false}},
  {id: 'idemitsu-s-tokyo-202606-v1', offerId: 'idemitsu-s-tokyo', areaId: 'tokyo', ruleId: 'idemitsu-s-202507', month: '2026-06', fuelGrossYen: '-7.30', subsidyYen: '0.00', renewableYen: '4.18', sourceIds: ['idemitsu-fuel-202606', 'renewable-2026'], applicability: {basis: 'provider_meter_reading_month', month: '2026-06', standardFullCycleOnly: true, taxIncluded: true, zeroUseSupported: false}},
  {id: 'idemitsu-s-tokyo-202607-v1', offerId: 'idemitsu-s-tokyo', areaId: 'tokyo', ruleId: 'idemitsu-s-202507', month: '2026-07', fuelGrossYen: '-7.19', subsidyYen: '0.00', renewableYen: '4.18', sourceIds: ['idemitsu-fuel-202607', 'renewable-2026'], applicability: {basis: 'provider_meter_reading_month', month: '2026-07', standardFullCycleOnly: true, taxIncluded: true, zeroUseSupported: false}},
  {id: 'idemitsu-s-tokyo-202608-v1', offerId: 'idemitsu-s-tokyo', areaId: 'tokyo', ruleId: 'idemitsu-s-202507', month: '2026-08', fuelGrossYen: '-6.77', subsidyYen: '3.50', renewableYen: '4.18', sourceIds: ['idemitsu-fuel-202608', 'renewable-2026'], applicability: {basis: 'provider_meter_reading_month', month: '2026-08', standardFullCycleOnly: true, taxIncluded: true, zeroUseSupported: false}},
  {id: 'idemitsu-s-tokyo-202609-v1', offerId: 'idemitsu-s-tokyo', areaId: 'tokyo', ruleId: 'idemitsu-s-202507', month: '2026-09', fuelGrossYen: '-6.46', subsidyYen: '4.50', renewableYen: '4.18', sourceIds: ['idemitsu-fuel-202609', 'renewable-2026'], applicability: {basis: 'provider_meter_reading_month', month: '2026-09', standardFullCycleOnly: true, taxIncluded: true, zeroUseSupported: false}},
  {id: 'idemitsu-s-tokyo-202610-v1', offerId: 'idemitsu-s-tokyo', areaId: 'tokyo', ruleId: 'idemitsu-s-202507', month: '2026-10', fuelGrossYen: '-5.80', subsidyYen: '3.50', renewableYen: '4.18', sourceIds: ['idemitsu-fuel-202610', 'renewable-2026'], applicability: {basis: 'provider_meter_reading_month', month: '2026-10', standardFullCycleOnly: true, taxIncluded: true, zeroUseSupported: false}},
  // cd-basic-b group
  {id: 'cd-basic-b-202605-v1', offerId: 'cd-basic-b', areaId: 'tokyo', ruleId: 'cd-basic-b-202601', month: '2026-05', fuelGrossYen: '-7.37', subsidyYen: '0.00', renewableYen: '4.18', sourceIds: ['cd-fuel-202605', 'renewable-2026'], applicability: {basis: 'provider_meter_reading_month', month: '2026-05', standardFullCycleOnly: true, taxIncluded: true, zeroUseSupported: false}},
  {id: 'cd-basic-b-202606-v1', offerId: 'cd-basic-b', areaId: 'tokyo', ruleId: 'cd-basic-b-202601', month: '2026-06', fuelGrossYen: '-7.30', subsidyYen: '0.00', renewableYen: '4.18', sourceIds: ['cd-fuel-202606', 'renewable-2026'], applicability: {basis: 'provider_meter_reading_month', month: '2026-06', standardFullCycleOnly: true, taxIncluded: true, zeroUseSupported: false}},
  {id: 'cd-basic-b-202607-v1', offerId: 'cd-basic-b', areaId: 'tokyo', ruleId: 'cd-basic-b-202601', month: '2026-07', fuelGrossYen: '-7.19', subsidyYen: '0.00', renewableYen: '4.18', sourceIds: ['cd-fuel-202607', 'renewable-2026'], applicability: {basis: 'provider_meter_reading_month', month: '2026-07', standardFullCycleOnly: true, taxIncluded: true, zeroUseSupported: false}},
  {id: 'cd-basic-b-202608-v1', offerId: 'cd-basic-b', areaId: 'tokyo', ruleId: 'cd-basic-b-202601', month: '2026-08', fuelGrossYen: '-6.77', subsidyYen: '3.50', renewableYen: '4.18', sourceIds: ['cd-fuel-202608', 'renewable-2026'], applicability: {basis: 'provider_meter_reading_month', month: '2026-08', standardFullCycleOnly: true, taxIncluded: true, zeroUseSupported: false}},
  {id: 'cd-basic-b-202609-v1', offerId: 'cd-basic-b', areaId: 'tokyo', ruleId: 'cd-basic-b-202601', month: '2026-09', fuelGrossYen: '-6.46', subsidyYen: '4.50', renewableYen: '4.18', sourceIds: ['cd-fuel-202609', 'renewable-2026'], applicability: {basis: 'provider_meter_reading_month', month: '2026-09', standardFullCycleOnly: true, taxIncluded: true, zeroUseSupported: false}},
  {id: 'cd-basic-b-202610-v1', offerId: 'cd-basic-b', areaId: 'tokyo', ruleId: 'cd-basic-b-202601', month: '2026-10', fuelGrossYen: '-5.80', subsidyYen: '3.50', renewableYen: '4.18', sourceIds: ['cd-fuel-202610', 'renewable-2026'], applicability: {basis: 'provider_meter_reading_month', month: '2026-10', standardFullCycleOnly: true, taxIncluded: true, zeroUseSupported: false}}
];

export const additions = {
  providers: [
    { id: 'idemitsu', name: 'idemitsuでんき（出光興産）' },
    { id: 'cd-energy', name: 'CDエナジーダイレクト' }
  ],
  offers: [
    {
      id: 'idemitsu-s-tokyo',
      providerId: 'idemitsu',
      areaId: 'tokyo',
      name: 'Sプラン（東京・アンペア契約）',
      capacity: { type: 'amp', values: [10, 15, 20, 30, 40, 50, 60] },
      needsDays: false
    },
    {
      id: 'cd-basic-b',
      providerId: 'cd-energy',
      areaId: 'tokyo',
      name: 'ベーシックでんきB',
      capacity: { type: 'amp', values: [10, 15, 20, 30, 40, 50, 60] },
      needsDays: false
    }
  ],
  rules: [
    {
      id: 'idemitsu-s-202507',
      offerId: 'idemitsu-s-tokyo',
      areaId: 'tokyo',
      effectiveFromMonth: '2026-05',
      effectiveToMonth: '2026-10',
      verifiedMonths: ['2026-05','2026-06','2026-07','2026-08','2026-09','2026-10'],
      calculationModel: 'amp_tiered_v1',
      rounding: 'floor_yen_total_renewable_separate',
      zeroUseHalfBase: true,
      baseYenByAmps: {
        '10': '311.75',
        '15': '467.63',
        '20': '623.50',
        '30': '935.25',
        '40': '1247.00',
        '50': '1558.75',
        '60': '1870.50'
      },
      tiers: [
        { upTo: 120, rate: '29.80' },
        { upTo: 300, rate: '34.76' },
        { upTo: null, rate: '37.10' }
      ],
      sourceIds: [
        'idemitsu-s-202507',
        'idemitsu-terms-202607',
        'idemitsu-terms-change-202607',
        'idemitsu-important-202610'
      ]
    },
    {
      id: 'cd-basic-b-202601',
      offerId: 'cd-basic-b',
      areaId: 'tokyo',
      effectiveFromMonth: '2026-05',
      effectiveToMonth: '2026-10',
      verifiedMonths: ['2026-05','2026-06','2026-07','2026-08','2026-09','2026-10'],
      calculationModel: 'amp_tiered_v1',
      rounding: 'floor_yen_total_renewable_separate',
      zeroUseHalfBase: true,
      baseYenByAmps: {
        '10': '276.90',
        '15': '415.35',
        '20': '553.80',
        '30': '830.70',
        '40': '1107.60',
        '50': '1384.50',
        '60': '1661.40'
      },
      tiers: [
        { upTo: 120, rate: '29.90' },
        { upTo: 300, rate: '35.59' },
        { upTo: null, rate: '36.50' }
      ],
      sourceIds: [
        'cd-basic-b-202601',
        'cd-terms-202601',
        'cd-area',
        'cd-calculation-example'
      ]
    }
  ],
  tariffs,
  sources
};
