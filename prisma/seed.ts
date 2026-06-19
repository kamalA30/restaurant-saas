/**
 * Prisma Seed Script
 * Run: npx prisma db seed
 *
 * Creates:
 *  - 1 Super Admin
 *  - 1 Restaurant (Beirut Kitchen)
 *  - 2 Branches (Berlin Mitte, Hamburg)
 *  - 1 Owner, 2 Branch Managers, 2 Cashiers, 2 Chefs
 *  - Menu categories & items
 */

import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  const hash = (pw: string) => bcrypt.hash(pw, 12);

  // ── Super Admin ───────────────────────────
  const superAdmin = await prisma.user.upsert({
    where: { email: 'admin@system.de' },
    update: {},
    create: {
      email: 'admin@system.de',
      password: await hash('Admin@1234'),
      firstName: 'System',
      lastName: 'Admin',
      role: Role.SUPER_ADMIN,
    },
  });
  console.log('✅ Super Admin:', superAdmin.email);

  // ── Restaurant ────────────────────────────
  const owner = await prisma.user.upsert({
    where: { email: 'owner@beirutkitchen.de' },
    update: {},
    create: {
      email: 'owner@beirutkitchen.de',
      password: await hash('Owner@1234'),
      firstName: 'Karim',
      lastName: 'Mansour',
      role: Role.OWNER,
    },
  });

  const restaurant = await prisma.restaurant.upsert({
    where: { id: 'a1a1a1a1-0000-0000-0000-000000000001' },
    update: {},
    create: {
      id: 'a1a1a1a1-0000-0000-0000-000000000001',
      name: 'Beirut Kitchen',
      country: 'DE',
      city: 'Berlin',
      owners: { connect: { id: owner.id } },
    },
  });
  await prisma.user.update({
    where: { id: owner.id },
    data: { restaurantId: restaurant.id },
  });
  console.log('✅ Restaurant:', restaurant.name);

  // ── Branches ──────────────────────────────
  const branchMitte = await prisma.branch.upsert({
    where: { id: 'b1b1b1b1-0000-0000-0000-000000000001' },
    update: {},
    create: {
      id: 'b1b1b1b1-0000-0000-0000-000000000001',
      restaurantId: restaurant.id,
      name: 'Berlin Mitte',
      address: 'Unter den Linden 12, 10117 Berlin',
      city: 'Berlin',
      phone: '+49 30 12345678',
    },
  });

  const branchHH = await prisma.branch.upsert({
    where: { id: 'b2b2b2b2-0000-0000-0000-000000000002' },
    update: {},
    create: {
      id: 'b2b2b2b2-0000-0000-0000-000000000002',
      restaurantId: restaurant.id,
      name: 'Hamburg Altona',
      address: 'Altona Bahnhof 5, 22765 Hamburg',
      city: 'Hamburg',
      phone: '+49 40 98765432',
    },
  });
  console.log('✅ Branches:', branchMitte.name, ',', branchHH.name);

  // ── Staff ─────────────────────────────────
  const manager1 = await prisma.user.upsert({
    where: { email: 'manager.mitte@beirutkitchen.de' },
    update: {},
    create: {
      email: 'manager.mitte@beirutkitchen.de',
      password: await hash('Manager@1234'),
      firstName: 'Sara',
      lastName: 'Hassan',
      role: Role.BRANCH_MANAGER,
      restaurantId: restaurant.id,
    },
  });

  const cashier1 = await prisma.user.upsert({
    where: { email: 'cashier1@beirutkitchen.de' },
    update: {},
    create: {
      email: 'cashier1@beirutkitchen.de',
      password: await hash('Cashier@1234'),
      firstName: 'Ali',
      lastName: 'Nasser',
      role: Role.CASHIER,
      restaurantId: restaurant.id,
    },
  });

  const chef1 = await prisma.user.upsert({
    where: { email: 'chef1@beirutkitchen.de' },
    update: {},
    create: {
      email: 'chef1@beirutkitchen.de',
      password: await hash('Chef@1234'),
      firstName: 'Omar',
      lastName: 'Khalid',
      role: Role.CHEF,
      restaurantId: restaurant.id,
    },
  });

  // Assign staff to branch
  for (const { userId, role } of [
    { userId: manager1.id, role: Role.BRANCH_MANAGER },
    { userId: cashier1.id, role: Role.CASHIER },
    { userId: chef1.id, role: Role.CHEF },
  ]) {
    await prisma.branchUser.upsert({
      where: { branchId_userId: { branchId: branchMitte.id, userId } },
      update: {},
      create: { branchId: branchMitte.id, userId, role },
    });
  }
  console.log('✅ Staff assigned to Berlin Mitte');

  // ── Menu ──────────────────────────────────
  const catStarters = await prisma.category.upsert({
    where: { id: 'c1c1c1c1-0000-0000-0000-000000000001' },
    update: {},
    create: {
      id: 'c1c1c1c1-0000-0000-0000-000000000001',
      restaurantId: restaurant.id,
      name: 'Starters',
      sortOrder: 1,
    },
  });

  const catMains = await prisma.category.upsert({
    where: { id: 'c2c2c2c2-0000-0000-0000-000000000002' },
    update: {},
    create: {
      id: 'c2c2c2c2-0000-0000-0000-000000000002',
      restaurantId: restaurant.id,
      name: 'Main Dishes',
      sortOrder: 2,
    },
  });

  const catDrinks = await prisma.category.upsert({
    where: { id: 'c3c3c3c3-0000-0000-0000-000000000003' },
    update: {},
    create: {
      id: 'c3c3c3c3-0000-0000-0000-000000000003',
      restaurantId: restaurant.id,
      name: 'Drinks',
      sortOrder: 3,
    },
  });

  const menuItems = [
    { categoryId: catStarters.id, name: 'Hummus', basePrice: 6.5, preparationTimeMinutes: 5, allergens: ['sesame'] },
    { categoryId: catStarters.id, name: 'Fattoush Salad', basePrice: 8.0, preparationTimeMinutes: 8, allergens: ['gluten'] },
    { categoryId: catStarters.id, name: 'Falafel (6 pcs)', basePrice: 7.5, preparationTimeMinutes: 10, allergens: [] },
    { categoryId: catMains.id, name: 'Shish Tawook', basePrice: 16.5, preparationTimeMinutes: 20, allergens: [] },
    { categoryId: catMains.id, name: 'Mixed Grill Plate', basePrice: 22.0, preparationTimeMinutes: 25, allergens: [] },
    { categoryId: catMains.id, name: 'Vegetarian Mezze', basePrice: 14.0, preparationTimeMinutes: 15, allergens: ['dairy'] },
    { categoryId: catDrinks.id, name: 'Jallab Juice', basePrice: 4.5, preparationTimeMinutes: 3, allergens: [] },
    { categoryId: catDrinks.id, name: 'Ayran', basePrice: 3.0, preparationTimeMinutes: 2, allergens: ['dairy'] },
    { categoryId: catDrinks.id, name: 'Water (500ml)', basePrice: 2.0, preparationTimeMinutes: 1, allergens: [] },
  ];

  for (const item of menuItems) {
    await prisma.menuItem.upsert({
      where: { id: `item-${item.name.toLowerCase().replace(/\s/g, '-').slice(0, 30)}`.padEnd(36, '0').slice(0, 36) },
      update: {},
      create: item as any,
    });
  }
  console.log(`✅ ${menuItems.length} menu items created`);

  console.log('\n🎉 Seed complete!\n');
  console.log('Login credentials:');
  console.log('  Super Admin : admin@system.de          / Admin@1234');
  console.log('  Owner       : owner@beirutkitchen.de   / Owner@1234');
  console.log('  Manager     : manager.mitte@...        / Manager@1234');
  console.log('  Cashier     : cashier1@...             / Cashier@1234');
  console.log('  Chef        : chef1@...                / Chef@1234');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
