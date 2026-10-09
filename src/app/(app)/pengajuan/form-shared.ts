// Bagian formulir yang dipakai server & client (bukan modul "use client").
export function blankItem(key: string) {
  return { key, itemName: "", specification: "", quantity: "1", unitName: "unit", estimatedUnitPrice: "", reason: "", neededDate: "" };
}
