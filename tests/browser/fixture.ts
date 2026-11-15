// Browser-only fixtures. Vite's test configuration aliases these boundaries;
// the production build never imports this file or changes its authentication.
import { useSyncExternalStore } from 'react';
import { saveKycSubmission, reviewKycSubmission } from '../../src/services/kycService';
export const owner = '11111111-1111-4111-8111-111111111111';
const email = 'test@example.com';
const listeners = new Set<() => void>();
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aCmcAAAAASUVORK5CYII=';
let version = 0;
const emit = () => { version++; listeners.forEach(fn => fn()); };
const controls = { failUpload: false, failSave: false, failSign: false, uploads: [] as string[], signs: 0, deposits: [] as any[], kyc: null as any };
const wallet = { id: 'test-wallet', coinName: 'USDT', network: 'TRC20', walletAddress: 'TTestOnlyAddress', qrCodeUrl: png, enabled: true, minimumDeposit: 1 };
export const supabase: any = {
  auth: {
    getSession: async () => ({ data: { session: { user: { id: owner, email, last_sign_in_at: 'test-session' } } } }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
  },
  storage: { from: (bucket: string) => ({
    upload: async (path: string) => {
      if (controls.failUpload) return { error: { message: 'Simulated upload failure' } };
      controls.uploads.push(`${bucket}/${path}`);
      return { data: { path }, error: null };
    },
    createSignedUrls: async (paths: string[]) => { controls.signs++; return controls.failSign ? { error: { message: "Simulated signing failure" } } : { data: paths.map(path => ({ path, signedUrl: png })), error: null }; },
    createSignedUrl: async () => { controls.signs++; return controls.failSign ? { error: { message: 'Simulated signing failure' } } : { data: { signedUrl: png }, error: null }; },
  }) },
  from: () => ({ upsert: (payload: any) => ({ select: () => ({ single: async () => {
    if (controls.failSave) return { error: { message: 'Simulated database failure' } };
    controls.kyc = { ...payload, revision: (controls.kyc?.revision || 0) + 1, submission_date: new Date().toISOString() };
    return { data: controls.kyc, error: null };
  } }) }) }),
  rpc: async (_name: string, args: any) => {
    if (controls.failSave) return { error: { message: 'Simulated review failure' } };
    controls.kyc = { ...controls.kyc, status: args.p_status, revision: controls.kyc.revision + 1, admin_notes: args.p_notes, reviewed_at: new Date().toISOString() };
    return { data: controls.kyc, error: null };
  },
};
export const useSupabaseClient = () => supabase;
const state: any = {
  user: { name: 'Test User', email, isLoggedIn: true, status: 'active', balance: 100, transactions: [], kyc: { status: 'approved' } },
  enabledDepositWallets: [wallet], depositWallets: [wallet], adminWallets: {},
  insufficientBalanceOpen: false, setInsufficientBalanceOpen() {}, addNotification() {},
  adminTransactions: [], refreshAdminDeposits: async () => {},
  deposit: async (amount: number, currency: string, txHash?: string, proofFile?: string, giftCard?: any) => {
    if (controls.failSave) return false;
    const tx = { id: crypto.randomUUID(), userId: owner, userEmail: email, userName: 'Test User', type: 'deposit', status: 'pending', amount, currency: giftCard ? 'USD' : currency, asset: currency, txHash, proofFile, paymentMethod: giftCard ? 'gift_card' : 'crypto', giftCard: giftCard?.details, giftCardImagePaths: giftCard?.imagePaths || [], date: new Date().toISOString() };
    controls.deposits.push(tx); state.adminTransactions = [...controls.deposits]; state.user.transactions = [...controls.deposits]; emit(); return true;
  },
  withdraw: async () => ({ success: !controls.failSave, message: controls.failSave ? 'Simulated database failure' : 'Withdrawal submitted' }),
  adminApproveDeposit: async (id: string) => reviewDeposit(id,'completed'),
  adminRejectDeposit: async (id: string) => reviewDeposit(id,'rejected'),
  myKyc: null, kycLoading: false, kycError: null, refreshKyc: async () => {},
  usersDirectory: [{ id: owner, email, name: 'Test User', role: 'user', status: 'active', balance: 100 }],
  allKycSubmissions: {}, refreshUsersDirectory: async () => {}, isLoadingUsersDirectory: false,
  submitKyc: async (kyc: any) => {
    const saved = await saveKycSubmission(supabase, owner, kyc);
    state.myKyc = saved; state.allKycSubmissions = { [email]: saved }; emit();
  },
  adminKycReview: async (_email: string, status: any, notes: string, revision: number) => {
    const saved = await reviewKycSubmission(supabase, owner, status, notes, revision);
    state.myKyc = saved; state.allKycSubmissions = { [email]: saved }; emit();
  },
};
function reviewDeposit(id: string, status: string) {
  if (controls.failSave) return false;
  const tx = controls.deposits.find(tx => tx.id === id);
  if (tx.status === 'pending' && status === 'completed') state.user.balance += tx.amount;
  tx.status = status; state.adminTransactions = [...controls.deposits]; emit(); return true;
}
export function useOrbit(): any {
  useSyncExternalStore(fn => { listeners.add(fn); return () => { listeners.delete(fn); }; }, () => version);
  return state;
}
(window as any).__bloom = { controls, state, emit };

export async function ensureUserRow(client: any, user: any) { await client.from("users").upsert({ id: user.id }); }
