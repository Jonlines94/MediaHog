export const gbp = (pence: number) =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(pence / 100);

export const GRADES: Record<string, string> = {
  M: "Mint", NM: "Near Mint", "VG+": "Very Good Plus", VG: "Very Good", "G+": "Good Plus", G: "Good", F: "Fair", P: "Poor",
};
