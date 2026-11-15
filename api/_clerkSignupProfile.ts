import { COUNTRIES } from '../src/constants/countries.js';

// Clerk unsafeMetadata is user-controlled. Only ordinary profile preferences
// belong here; never copy identity IDs, email, role, status, balances or KYC.
export function clerkSignupProfile(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const text = (key: string, max: number) => typeof input[key] === 'string'
    ? (input[key] as string).trim().slice(0, max) : '';
  const username = text('username', 100), first_name = text('firstName', 100), last_name = text('lastName', 100);
  const gender = text('gender', 20), phone = text('phone', 50), country = text('country', 100);
  const account_type = text('accountType', 20), currency = text('currency', 10);
  if (!username || !first_name || !last_name || !phone ||
    !['Male', 'Female', 'Other'].includes(gender) ||
    !['Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond'].includes(account_type) ||
    !['USD', 'EUR', 'GBP', 'BTC', 'USDT'].includes(currency) ||
    !COUNTRIES.some(item => item.name === country)) return null;
  return { username, first_name, last_name, name: `${first_name} ${last_name}`.slice(0, 200),
    gender, phone, account_type, country, currency };
}
