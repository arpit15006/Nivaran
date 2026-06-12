import { PrismaClient, type JurisdictionType } from '@prisma/client';
import argon2 from 'argon2';

const prisma = new PrismaClient();

// A rectangular ward polygon. GeoJSON coordinates are [lng, lat].
function rect(latMin: number, latMax: number, lngMin: number, lngMax: number) {
  return {
    type: 'Polygon',
    coordinates: [[
      [lngMin, latMin],
      [lngMax, latMin],
      [lngMax, latMax],
      [lngMin, latMax],
      [lngMin, latMin],
    ]],
  };
}

// Demo city centred on Indore (22.7196, 75.8577), split into four wards.
const WARDS = [
  { name: 'Ward 1 — North East', zone: 'Zone A', geojson: rect(22.72, 22.77, 75.86, 75.91) },
  { name: 'Ward 2 — North West', zone: 'Zone A', geojson: rect(22.72, 22.77, 75.81, 75.86) },
  { name: 'Ward 3 — South East', zone: 'Zone B', geojson: rect(22.67, 22.72, 75.86, 75.91) },
  { name: 'Ward 4 — South West', zone: 'Zone B', geojson: rect(22.67, 22.72, 75.81, 75.86) },
];

const DEPARTMENTS: Array<{ name: string; jurisdiction: JurisdictionType; categories: string[] }> = [
  { name: 'Roads & Infrastructure', jurisdiction: 'MUNICIPAL', categories: ['POTHOLE'] },
  { name: 'PWD Highways', jurisdiction: 'STATE_PWD', categories: ['POTHOLE', 'ROAD_DAMAGE'] },
  { name: 'Solid Waste Management', jurisdiction: 'MUNICIPAL', categories: ['GARBAGE'] },
  { name: 'Water Board', jurisdiction: 'UTILITY', categories: ['WATER_SUPPLY'] },
  { name: 'Sewerage & Drainage', jurisdiction: 'MUNICIPAL', categories: ['SEWAGE', 'DRAINAGE'] },
  { name: 'Street Lighting', jurisdiction: 'MUNICIPAL', categories: ['STREETLIGHT'] },
  { name: 'Traffic Management', jurisdiction: 'MUNICIPAL', categories: ['TRAFFIC_SIGNAL'] },
  { name: 'Animal Control', jurisdiction: 'MUNICIPAL', categories: ['STRAY_ANIMALS'] },
  { name: 'Town Planning', jurisdiction: 'MUNICIPAL', categories: ['ILLEGAL_CONSTRUCTION'] },
  { name: 'Pollution Control', jurisdiction: 'MUNICIPAL', categories: ['NOISE_POLLUTION'] },
  { name: 'Horticulture', jurisdiction: 'MUNICIPAL', categories: ['TREE_FALL'] },
  { name: 'Electricity Board', jurisdiction: 'UTILITY', categories: ['ELECTRICITY'] },
];

// (category, jurisdiction) → department name + SLA hours.
const RULES: Array<{ category: string; jurisdiction: JurisdictionType; dept: string; slaHours: number }> = [
  { category: 'POTHOLE', jurisdiction: 'MUNICIPAL', dept: 'Roads & Infrastructure', slaHours: 48 },
  { category: 'POTHOLE', jurisdiction: 'STATE_PWD', dept: 'PWD Highways', slaHours: 72 },
  { category: 'ROAD_DAMAGE', jurisdiction: 'STATE_PWD', dept: 'PWD Highways', slaHours: 72 },
  { category: 'STREETLIGHT', jurisdiction: 'MUNICIPAL', dept: 'Street Lighting', slaHours: 36 },
  { category: 'GARBAGE', jurisdiction: 'MUNICIPAL', dept: 'Solid Waste Management', slaHours: 24 },
  { category: 'WATER_SUPPLY', jurisdiction: 'UTILITY', dept: 'Water Board', slaHours: 12 },
  { category: 'SEWAGE', jurisdiction: 'MUNICIPAL', dept: 'Sewerage & Drainage', slaHours: 24 },
  { category: 'DRAINAGE', jurisdiction: 'MUNICIPAL', dept: 'Sewerage & Drainage', slaHours: 48 },
  { category: 'TRAFFIC_SIGNAL', jurisdiction: 'MUNICIPAL', dept: 'Traffic Management', slaHours: 8 },
  { category: 'STRAY_ANIMALS', jurisdiction: 'MUNICIPAL', dept: 'Animal Control', slaHours: 48 },
  { category: 'ILLEGAL_CONSTRUCTION', jurisdiction: 'MUNICIPAL', dept: 'Town Planning', slaHours: 120 },
  { category: 'NOISE_POLLUTION', jurisdiction: 'MUNICIPAL', dept: 'Pollution Control', slaHours: 24 },
  { category: 'TREE_FALL', jurisdiction: 'MUNICIPAL', dept: 'Horticulture', slaHours: 24 },
  { category: 'ELECTRICITY', jurisdiction: 'UTILITY', dept: 'Electricity Board', slaHours: 6 },
];

// Labeled evaluation set (points placed inside known wards) — CI accuracy gate.
const LABELED: Array<{ rawText: string; lat: number; lng: number; trueCategory: string; trueDepartment: string }> = [
  { rawText: 'Big pothole on MG Road near the market', lat: 22.74, lng: 75.88, trueCategory: 'POTHOLE', trueDepartment: 'Roads & Infrastructure' },
  { rawText: 'Garbage pile not collected for 3 days', lat: 22.74, lng: 75.83, trueCategory: 'GARBAGE', trueDepartment: 'Solid Waste Management' },
  { rawText: 'Street light not working whole lane is dark', lat: 22.69, lng: 75.88, trueCategory: 'STREETLIGHT', trueDepartment: 'Street Lighting' },
  { rawText: 'No water supply since morning', lat: 22.69, lng: 75.83, trueCategory: 'WATER_SUPPLY', trueDepartment: 'Water Board' },
  { rawText: 'Sewage overflowing onto the road', lat: 22.75, lng: 75.87, trueCategory: 'SEWAGE', trueDepartment: 'Sewerage & Drainage' },
  { rawText: 'Drain clogged and waterlogging after rain', lat: 22.73, lng: 75.82, trueCategory: 'DRAINAGE', trueDepartment: 'Sewerage & Drainage' },
  { rawText: 'Traffic signal red light stuck at junction', lat: 22.70, lng: 75.89, trueCategory: 'TRAFFIC_SIGNAL', trueDepartment: 'Traffic Management' },
  { rawText: 'Stray cattle blocking the road', lat: 22.68, lng: 75.84, trueCategory: 'STRAY_ANIMALS', trueDepartment: 'Animal Control' },
  { rawText: 'Transformer sparking power cut in area', lat: 22.74, lng: 75.87, trueCategory: 'ELECTRICITY', trueDepartment: 'Electricity Board' },
  { rawText: 'Large tree branch fell on footpath', lat: 22.73, lng: 75.83, trueCategory: 'TREE_FALL', trueDepartment: 'Horticulture' },
  { rawText: 'Collapsed road surface on the highway stretch', lat: 22.69, lng: 75.87, trueCategory: 'ROAD_DAMAGE', trueDepartment: 'PWD Highways' },
  { rawText: 'Loudspeakers blasting late at night', lat: 22.68, lng: 75.83, trueCategory: 'NOISE_POLLUTION', trueDepartment: 'Pollution Control' },
  { rawText: 'Unauthorized building construction next door', lat: 22.75, lng: 75.88, trueCategory: 'ILLEGAL_CONSTRUCTION', trueDepartment: 'Town Planning' },
];

async function main() {
  console.log('🌱 Seeding Nivaran…');

  // Idempotent reset of seed-owned tables.
  await prisma.statusEvent.deleteMany();
  await prisma.complaint.deleteMany();
  await prisma.labeledComplaint.deleteMany();
  await prisma.routingRule.deleteMany();
  await prisma.escalationStep.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.user.deleteMany();
  await prisma.department.deleteMany();
  await prisma.ward.deleteMany();

  await prisma.ward.createMany({ data: WARDS });

  const deptByName = new Map<string, string>();
  for (const d of DEPARTMENTS) {
    const created = await prisma.department.create({ data: d });
    deptByName.set(d.name, created.id);
  }

  for (const r of RULES) {
    await prisma.routingRule.create({
      data: {
        category: r.category,
        jurisdiction: r.jurisdiction,
        departmentId: deptByName.get(r.dept)!,
        slaHours: r.slaHours,
        version: 1,
        active: true,
      },
    });
  }

  // Two-level escalation chain for every department.
  for (const [, deptId] of deptByName) {
    await prisma.escalationStep.createMany({
      data: [
        { departmentId: deptId, level: 1, authority: 'Zonal Officer', contact: 'zonal@city.gov', slaHours: 24 },
        { departmentId: deptId, level: 2, authority: 'City Commissioner', contact: 'commissioner@city.gov', slaHours: 48 },
      ],
    });
  }

  await prisma.labeledComplaint.createMany({ data: LABELED });

  // Demo users — one per role. Password for all: Password123!
  const passwordHash = await argon2.hash('Password123!', { type: argon2.argon2id });
  const roadsId = deptByName.get('Roads & Infrastructure')!;
  await prisma.user.createMany({
    data: [
      { email: 'admin@nivaran.gov', name: 'City Admin', role: 'ADMIN', passwordHash },
      { email: 'citizen@nivaran.gov', name: 'Asha Citizen', role: 'CITIZEN', passwordHash },
      { email: 'official@nivaran.gov', name: 'Roads Official', role: 'OFFICIAL', departmentId: roadsId, passwordHash },
      { email: 'authority@nivaran.gov', name: 'Zonal Authority', role: 'AUTHORITY', passwordHash },
    ],
  });

  console.log(`✅ Seeded ${WARDS.length} wards, ${DEPARTMENTS.length} departments, ${RULES.length} rules, ${LABELED.length} labeled cases, 4 users.`);
  console.log('   Login with any of: admin@ / citizen@ / official@ / authority@ nivaran.gov  ·  password: Password123!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
