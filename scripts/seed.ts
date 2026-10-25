import "dotenv/config";
import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
import { db, connection } from "../src/db";
import { users, customers, bookings, settings } from "../src/db/schema";
import { eq } from "drizzle-orm";
import { hashPassword } from "../src/server/auth";
import { execute, type Operation } from "../src/server/operations";
import { today, addDays, type Actor } from "../src/lib/domain";
export async function seedDemo() {
  if (process.env.DEMO_MODE !== "true")
    throw new Error(
      "Demo seed requires DEMO_MODE=true and an isolated demo database.",
    );
  const [config] = await db().select().from(settings);
  if (!config?.demo) throw new Error("This database is not marked as demo.");
  if (
    (await db().select().from(customers)).length ||
    (await db().select().from(bookings)).length
  )
    throw new Error(
      "Seed aborted: this database already contains business records. Use a separate empty demo database.",
    );
  const managerPassword = process.env.DEMO_MANAGER_PASSWORD,
    ownerPassword = process.env.DEMO_OWNER_PASSWORD;
  if (!managerPassword || !ownerPassword)
    throw new Error("Set both demo passwords to 12 or more characters.");
  const [manager] = await db()
    .insert(users)
    .values({
      name: "Hammas Ahmad",
      email: "manager@salonos.demo",
      passwordHash: await hashPassword(managerPassword),
      role: "finance_manager",
    })
    .returning();
  await db()
    .insert(users)
    .values({
      name: "Sana Rizwan",
      email: "owner@salonos.demo",
      passwordHash: await hashPassword(ownerPassword),
      role: "owner",
    });
  const actor: Actor = {
    id: manager.id,
    name: manager.name,
    email: manager.email,
    role: "finance_manager",
  };
  const command = (op: Operation, data: unknown) =>
    execute(actor, op, data, randomUUID());
  const names = [
    "Ayesha Khan",
    "Hira Malik",
    "Fatima Ali",
    "Zainab Shah",
    "Maham Ahmed",
    "Iqra Hassan",
    "Sana Javed",
    "Noor Fatima",
    "Alina Sheikh",
    "Rida Tariq",
    "Mehwish Aslam",
    "Maryam Riaz",
    "Sadia Mir",
    "Eman Zaidi",
    "Zara Studio",
  ];
  const clients = [];
  for (let i = 0; i < names.length; i++)
    clients.push(
      await command("client.save", {
        name: names[i],
        phone: `+92300${String(5000000 + i)}`,
        email: `client${i + 1}@example.com`,
        type: i === 14 ? "Brand" : i % 4 === 0 ? "Bride" : "Individual",
        instagram: "@fictional_client_" + (i + 1),
        notes: "Fictional demo client. Created for workflow testing.",
      }),
    );
  const catalog = [
    ["Signature Bridal Makeup", "Bridal Makeup", "50000", 180, "4200"],
    ["Luxury Bridal Makeup", "Bridal Makeup", "65000", 210, "5500"],
    ["Evening Party Makeup", "Party Makeup", "12000", 60, "1400"],
    ["Soft Glam Makeup", "Party Makeup", "9000", 50, "1000"],
    ["Bridal Hair Styling", "Hair Styling", "15000", 90, "1200"],
    ["Signature Blow Dry", "Hair Styling", "3500", 45, "400"],
    ["Hair Repair Treatment", "Hair Treatment", "8000", 75, "2400"],
    ["Classic Facial", "Facial", "6500", 60, "1100"],
    ["Wardrobe Styling", "Wardrobe Styling", "10000", 60, "500"],
    ["Editorial Model Makeup", "Model Makeup", "18000", 90, "1800"],
  ];
  const services = [];
  for (const [name, category, price, duration, cost] of catalog)
    services.push(
      await command("service.save", {
        name,
        category,
        price,
        durationMinutes: Number(duration),
        estimatedCost: cost,
        active: true,
        description: "Demo service. Pricing is illustrative.",
      }),
    );
  const bs = [];
  const receipts = [];
  for (let i = 0; i < 20; i++) {
    const completed = i < 12;
    const offset = completed ? (i >= 10 ? 0 : -14 + i) : i === 18 ? -2 : i - 11;
    const appointment = addDays(today(), offset);
    const svc = services[i % services.length];
    const items = [
      { serviceId: svc.id, quantity: 1, price: String(svc.priceMinor / 100) },
    ];
    if (i % 4 === 0)
      items.push({ serviceId: services[4].id, quantity: 1, price: "15000" });
    const b = await command("booking.save", {
      customerId: clients[i % 15].id,
      appointmentDate: appointment,
      appointmentTime: ["11:00", "13:30", "15:00", "17:00"][i % 4],
      category: i % 4 === 0 ? "Bridal" : i % 3 === 0 ? "Salon" : "Party",
      artist: ["Maira Siddiqui", "Areeba Noor", "Sana Rizwan"][i % 3],
      hairstylist: i % 4 === 0 ? "Hina Butt" : "",
      discount: i % 5 === 0 ? "1000" : "0",
      notes: "Fictional appointment for the SalonOS demonstration.",
      items,
    });
    bs.push(b);
    const advance = Math.floor((b.totalMinor / 100) * 0.4);
    const advanceDate = completed
      ? addDays(appointment, -2)
      : i === 18
        ? appointment
        : today();
    const receipt = await command("payment.receive", {
      bookingId: b.id,
      amount: String(advance),
      method: i % 2 ? "Bank transfer" : "Cash",
      date: advanceDate,
      reference: "DEMO-ADV-" + (i + 1),
      verified: true,
    });
    receipts.push(receipt);
    if (completed) {
      await command("booking.status", {
        id: b.id,
        version: b.version,
        status: "completed",
        date: appointment,
      });
      if (i % 3 !== 0)
        await command("payment.receive", {
          bookingId: b.id,
          amount: String((b.totalMinor - receipt.amountMinor) / 100),
          method: i % 2 ? "Raast" : "Cash",
          date: appointment,
          reference: "DEMO-BAL-" + (i + 1),
          verified: true,
        });
    }
    if (i === 18) {
      const [current] = await db()
        .select()
        .from(bookings)
        .where(eq(bookings.id, b.id));
      await command("booking.status", {
        id: b.id,
        version: current.version,
        status: "cancelled",
        date: today(),
        reason: "Client cancelled. Advance refunded in full.",
      });
      await command("payment.refund", {
        paymentId: receipt.id,
        amount: String(receipt.amountMinor / 100),
        method: receipt.method,
        date: today(),
        reason: "Full advance returned after cancellation.",
      });
    }
    if (i === 19)
      await command("booking.status", {
        id: b.id,
        version: b.version,
        status: "inquiry",
        date: today(),
      });
  }
  await command("payment.refund", {
    paymentId: receipts[2].id,
    amount: "500",
    method: receipts[2].method,
    date: today(),
    reason: "Goodwill service credit approved by manager.",
  });
  await command("payment.receive", {
    bookingId: bs[12].id,
    amount: "1000",
    method: "JazzCash",
    date: today(),
    verified: false,
    notes: "Artist reported a transfer. Waiting for manager verification.",
  });
  const expenseData = [
    [
      "Rent",
      "overhead",
      "45000",
      "Studio Property Management",
      "Monthly studio rent",
    ],
    [
      "Electricity",
      "overhead",
      "8500",
      "Utility provider",
      "Studio electricity bill",
    ],
    [
      "Internet",
      "overhead",
      "3500",
      "Local broadband provider",
      "Monthly internet service",
    ],
    [
      "Marketing",
      "overhead",
      "12000",
      "Creative Lane Agency",
      "Autumn campaign creative",
    ],
    [
      "Cleaning",
      "overhead",
      "3200",
      "Clean Studio Supplies",
      "Cleaning and laundry service",
    ],
    [
      "Transport",
      "overhead",
      "2400",
      "City Courier",
      "Outfit collection transport",
    ],
    [
      "Equipment",
      "capital",
      "42000",
      "Beauty Tools Pakistan",
      "Professional salon chair",
    ],
    [
      "Equipment",
      "capital",
      "16500",
      "Studio Lighting Co.",
      "Studio lighting equipment",
    ],
    [
      "Repairs",
      "overhead",
      "2800",
      "Raza Maintenance",
      "Repair of salon wash station",
    ],
    ["Water", "overhead", "1800", "Water supplier", "Studio drinking water"],
  ];
  for (let i = 0; i < expenseData.length; i++) {
    const [category, classification, amount, payee, description] =
      expenseData[i];
    await command("expense.create", {
      category,
      classification,
      amount,
      payee,
      description,
      paid: i !== 3,
      method: i % 2 ? "Bank transfer" : "Cash",
      date: addDays(today(), -Math.min(20, i * 2)),
      notes: "Illustrative demo expense.",
    });
  }
  for (let i = 0; i < 6; i++)
    await command("expense.create", {
      category: i % 2 ? "Outfit rental" : "Staff commissions",
      classification: "direct",
      amount: String(1200 + i * 300),
      payee: i % 2 ? "Zara Wardrobe Studio" : "Maira Siddiqui",
      description: "Direct styling / artist cost for completed booking",
      bookingId: bs[i].id,
      paid: i !== 4,
      method: i % 2 ? "Bank transfer" : "Cash",
      date: bs[i].appointmentDate,
    });
  console.log(
    "Demo seeded: 15 clients, 10 services, 20 bookings, verified and unverified receipts, advances, refunds, 16 expenses, capital purchases and supplier liabilities.",
  );
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    await seedDemo();
  } catch (e) {
    console.error(e);
    process.exitCode = 1;
  } finally {
    await connection().close();
  }
}
