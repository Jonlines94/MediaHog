const CODES = "GB IE FR DE ES IT NL BE LU PT AT CH DK SE NO FI IS PL CZ SK HU RO BG HR SI EE LV LT GR CY MT US CA AU NZ JP KR SG HK TW CN IN IL AE SA ZA BR MX AR CL CO PE TR UA RS AL BA ME MK MD GE AM AZ KZ TH VN MY ID PH PK BD LK EG MA TN KE NG GH".split(" ");

let cached: { code: string; name: string }[] | null = null;
export function countryOptions() {
  if (cached) return cached;
  const dn = new Intl.DisplayNames(["en-GB"], { type: "region" });
  cached = CODES.map((code) => ({ code, name: dn.of(code) ?? code }));
  const [uk, ...rest] = cached;
  cached = [uk, ...rest.sort((a, b) => a.name.localeCompare(b.name))];
  return cached;
}
export const isCountry = (c: string) => CODES.includes(c.toUpperCase());
