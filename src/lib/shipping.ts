export interface ShippingZone {
  name: string; countries: string[]; is_default: boolean;
  first_item_pence: number; additional_item_pence: number; free_over_pence: number | null; sort_order?: number;
}

export function findZone(zones: ShippingZone[], country: string): ShippingZone | null {
  const c = country.toUpperCase();
  return zones.find((z) => z.countries.includes(c)) ?? zones.find((z) => z.is_default) ?? null;
}

/** Combined shipping: first record at the full rate, each extra record at the additional rate. */
export function computeShipping(zones: ShippingZone[], country: string, itemCount: number, subtotalPence: number) {
  const zone = findZone(zones, country);
  if (!zone) return null;                         // no zone configured for this country: cannot ship
  if (itemCount <= 0) return { zone: zone.name, pence: 0 };
  if (zone.free_over_pence !== null && subtotalPence >= zone.free_over_pence) return { zone: zone.name, pence: 0 };
  return { zone: zone.name, pence: zone.first_item_pence + (itemCount - 1) * zone.additional_item_pence };
}
