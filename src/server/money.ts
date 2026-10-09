import { Prisma } from "@/generated/prisma/client";

export const Decimal = Prisma.Decimal;
export type Decimal = Prisma.Decimal;

export type DecimalInput = Prisma.Decimal | number | string;

export function dec(value: DecimalInput | null | undefined): Prisma.Decimal {
  if (value === null || value === undefined || value === "") return new Prisma.Decimal(0);
  return value instanceof Prisma.Decimal ? value : new Prisma.Decimal(value);
}

export function sum(values: Array<DecimalInput | null | undefined>): Prisma.Decimal {
  return values.reduce<Prisma.Decimal>((acc, v) => acc.plus(dec(v)), new Prisma.Decimal(0));
}

/** Nilai baris: kuantitas x harga satuan, dibulatkan ke 2 desimal. */
export function lineTotal(qty: DecimalInput, unitPrice: DecimalInput): Prisma.Decimal {
  return dec(qty).times(dec(unitPrice)).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

/** Konversi aman untuk dikirim ke client (string agar presisi tidak hilang). */
export function decStr(value: DecimalInput | null | undefined): string {
  return dec(value).toString();
}

export function decNum(value: DecimalInput | null | undefined): number {
  return dec(value).toNumber();
}
