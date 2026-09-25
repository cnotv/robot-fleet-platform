import { readFile } from 'node:fs/promises';
import bcrypt from 'bcryptjs';
import type { Prisma, PrismaClient } from '@prisma/client';

const DEMO_COMPANY = 'cnotv';

interface FleetFixture {
  sites: Omit<Prisma.SiteCreateManyInput, 'companyId'>[];
  robots: Omit<Prisma.RobotCreateManyInput, 'companyId'>[];
}

export interface SeedOptions {
  adminEmail?: string | undefined;
  adminPassword?: string | undefined;
  /** JSON file with sites and robots, shared with the simulator. */
  fleetFile?: string | undefined;
}

/**
 * Makes an empty database usable out of the box: creates the company, the
 * first admin when there are no users, and the demo fleet when there are no robots.
 */
export async function seedDemoData(prisma: PrismaClient, opts: SeedOptions): Promise<void> {
  const company = await prisma.company.upsert({ where: { name: DEMO_COMPANY }, update: {}, create: { name: DEMO_COMPANY } });

  const noUsers = (await prisma.user.count()) === 0;
  if (noUsers && !(opts.adminEmail && opts.adminPassword)) {
    console.warn('no users and no ADMIN_EMAIL and ADMIN_PASSWORD: nobody can sign in until they are set');
  }
  if (noUsers && opts.adminEmail && opts.adminPassword) {
    await prisma.user.create({
      data: {
        email: opts.adminEmail.toLowerCase(),
        passwordHash: await bcrypt.hash(opts.adminPassword, 12),
        role: 'admin',
        companyId: company.id,
      },
    });
  }

  if (opts.fleetFile && (await prisma.robot.count()) === 0) {
    const fleet = JSON.parse(await readFile(opts.fleetFile, 'utf8')) as FleetFixture;
    const companyId = company.id;
    await prisma.$transaction([
      prisma.site.createMany({ data: fleet.sites.map((s) => ({ ...s, companyId })), skipDuplicates: true }),
      prisma.robot.createMany({ data: fleet.robots.map((r) => ({ ...r, companyId })) }),
    ]);
    console.log(`seeded ${fleet.sites.length} sites and ${fleet.robots.length} robots`);
  }
}
