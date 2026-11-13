import { markPortfolio } from "../lib/portfolioMarks";
import { isFreshQuote } from "../lib/marketQuotes";
import React, { createContext, useContext, useState, useEffect, useRef, useMemo, useCallback } from "react";
import toast from "react-hot-toast";
import type {
  MarketAsset,
  TraderProfile,
  InvestmentPlan,
  DepositWallet,
  Transaction,
  GiftCardSubmission,
  UserState,
  Announcement,
  AuditLog,
  SiteContent,
  AppSettings,
  Airdrop,
  AirdropClaim,
  KycSubmission,
  WalletFeedback
} from "../types";
import {
  buildActiveInvestment,
  syncInvestmentCountdowns,
  normalizeActiveInvestment,
  normalizeCopyTrade,
  buildAuditLog,
  buildTransaction,
  buildAirdrop,
  buildAirdropClaim,
  findUserCampaignClaim,
  hasReachedClaimLimit,
  isAirdropActive,
  normalizeAirdrop,
  buildCopyTrade,
  buildCopyTransaction,
  buildDepositWallet,
  buildDepositTransaction,
  buildInvestmentTransaction,
  buildNotification,
  type BuildNotificationOptions,
  type NotificationItem,
  formatRelativeTimestamp,
  normalizeNotification,
  sortNotifications,
  buildTopUpTransaction,
  buildUncopyTransaction,
  enrichTransaction,
  buildWithdrawalTransaction,
  createMockAirdrop,
  deleteMockAirdrop,
  deleteMockDepositWallet,
  deleteMockTrader,
  getMockAirdrops,
  getMockDepositWallets,
  getMockTraders,
  saveMockAirdrop,
  saveMockDepositWallet,
  saveMockTrader,
  USE_MOCK_DATA,
  createLoggedOutUser,
  createSignedOutUser,
  decrementTraderFollowers,
  DEFAULT_INVESTMENT_PLANS,
  formatWithdrawalAddress,
  getEnabledDepositWallets,
  incrementTraderFollowers,
  mapDepositWalletsToAddressBook,
  normalizeDepositWallet,
  safeParse,
  settleMaturedInvestments,
  settleMaturedCopyTrades,
  syncCopyTradeCountdowns,
  filterActiveAnnouncements,
  isAnnouncementRead,
  normalizeAnnouncement,
  sortAnnouncementsForAdmin,
  loadLocalAppSettings,
  mergeAppSettings,
  normalizeAppSettings,
  saveLocalAppSettings,
  SETTINGS_DOC_PATH
} from "../services";
import { useEmailNotifications } from "../hooks/useEmailNotifications";
import { changeAccountStatus } from "../services/accountStatusService";
import { getFinancialAccessError, financialActionError } from "../services/accountAccessService";
import type { TransactionalEmailEvent } from "../lib/emailClient";
import { issueAuthCode } from "../lib/authCodes";
import { useSupabaseClient, ensureUserRow } from "../lib/supabase";
import { useCurrentUser } from "../hooks/useCurrentUser";
import { useSiteSettings } from "../hooks/data/useSiteSettings";
import { useTraders } from "../hooks/data/useTraders";
import { useAnnouncements } from "../hooks/data/useAnnouncements";
import { useDepositWallets } from "../hooks/data/useDepositWallets";
import { useAirdrops } from "../hooks/data/useAirdrops";
import { useWalletFeedback } from "../hooks/data/useWalletFeedback";
import { useUsersDirectory, type CoreUserProfile } from "../hooks/data/useUsersDirectory";
import { useTransactions } from "../hooks/data/useTransactions";
import { useKyc } from "../hooks/data/useKyc";
import { useActiveInvestments, type AdminActiveInvestment } from "../hooks/data/useActiveInvestments";
import { usePortfolio } from "../hooks/data/usePortfolio";
import { useCopyTrades, type AdminCopyTrade } from "../hooks/data/useCopyTrades";
import { useSupportTickets, type AdminSupportTicket } from "../hooks/data/useSupportTickets";
import { useAirdropClaims } from "../hooks/data/useAirdropClaims";
import { useNotifications } from "../hooks/data/useNotifications";
import { useInvestmentPlans } from "../hooks/data/useInvestmentPlans";

interface OrbitContextType {
  user: UserState;
  marketCrypto: MarketAsset[];
  marketStocks: MarketAsset[];
  traders: TraderProfile[];
  tradersError: string | null;
  tradersLoading: boolean;
  refreshTraders: () => Promise<unknown>;
  plans: InvestmentPlan[];
  plansLoading: boolean;
  plansError: string | null;
  investmentDataError: string | null;
  investmentDataLoading: boolean;
  refreshInvestmentData: () => Promise<void>;
  isLoadingMarkets: boolean;
  marketDataError: string | null;
  refreshMarkets: () => Promise<void>;
  insufficientBalanceOpen: boolean;
  setInsufficientBalanceOpen: (open: boolean) => void;
  deposit: (amount: number, currency: string, txHash?: string, proofFile?: string, giftCard?: GiftCardSubmission) => Promise<boolean>;
  withdraw: (
    amount: number,
    currency: string,
    address?: string,
    destinationTag?: string,
    bankDetails?: { accountNumber: string; bankName: string; accountName: string; routingCode: string },
    paypalEmail?: string
  ) => Promise<{ success: boolean; message: string }>;
  investInPlan: (planId: string, amount: number) => Promise<{ success: boolean; message: string }>;
  claimPlanPayout: (investmentId: string) => Promise<void>;
  claimAirdrop: (airdropId: string, token: string, rewardAmount: string) => Promise<void>;
  withdrawEarnings: () => Promise<void>;
  topUpInvestment: (investmentId: string, amount: number) => Promise<{ success: boolean; message: string }>;
  copyTrader: (traderId: string, amount: number) => Promise<{ success: boolean; message: string }>;
  uncopyTrader: (copyTradeId: string) => Promise<{ success: boolean; message: string }>;
  claimCopyTradePayout: (copyTradeId: string) => Promise<{ success: boolean; message: string }>;
  executeTrade: (symbol: string, name: string, type: "buy" | "sell", amount: number, price: number, isCrypto: boolean) => Promise<{ success: boolean; message: string }>;
  createTicket: (subject: string, category: "deposit" | "withdrawal" | "trading" | "general", initialMsg: string, priority?: "low" | "medium" | "high") => Promise<string>;
  replyToTicket: (ticketId: string, text: string) => Promise<void>;
  sendWelcomeNotification: (recipientEmail: string, recipientName?: string) => void;

  // Administrative Operations
  usersDirectory: CoreUserProfile[];
  isLoadingUsersDirectory: boolean;
  refreshUsersDirectory: () => Promise<void>;
  adminWallets: Record<string, string>;
  depositWallets: DepositWallet[];
  enabledDepositWallets: DepositWallet[];
  adminAnnouncements: Announcement[];
  userAnnouncements: Announcement[];
  adminAuditLogs: AuditLog[];
  adminAirdropClaims: AirdropClaim[];
  airdrops: Airdrop[];
  notifications: NotificationItem[];
  unreadNotificationsCount: number;
  markNotificationRead: (notificationId: string) => Promise<void>;
  markAllNotificationsRead: () => Promise<void>;
  deleteNotification: (notificationId: string) => Promise<void>;

  updateAdminWallets: (wallets: Record<string, string>) => void;
  adminSaveDepositWallet: (wallet: DepositWallet | Omit<DepositWallet, "id">) => Promise<void>;
  adminDeleteDepositWallet: (walletId: string) => Promise<void>;
  adminUpdateUserBalance: (email: string, amount: number, txData?: { type: "credit" | "debit"; amount: number; label: string; notes: string; }) => Promise<void>;
  adminChangeUserStatus: (email: string, status: "active" | "suspended" | "banned") => Promise<void>;
  adminDeleteUser: (userIdOrEmail: string) => Promise<void>;
  adminResetUserPassword: (email: string) => Promise<void>;
  adminKycReview: (email: string, status: "approved" | "rejected", reason?: string, revision?: number) => Promise<void>;

  adminCreatePlan: (plan: Omit<InvestmentPlan, "id">) => Promise<void>;
  adminUpdatePlan: (plan: InvestmentPlan) => Promise<void>;
  adminDeletePlan: (planId: string) => Promise<void>;
  adminSetPlanStatus: (planId: string, status: "active" | "paused") => Promise<void>;

  adminApproveDeposit: (txId: string, notes?: string) => Promise<boolean>;
  adminRejectDeposit: (txId: string, notes?: string) => Promise<boolean>;
  refreshAdminDeposits: () => Promise<void>;
  adminApproveWithdrawal: (txId: string, notes?: string) => Promise<void>;
  adminRejectWithdrawal: (txId: string, notes?: string) => Promise<void>;

  adminApproveAirdrop: (claimId: string) => Promise<void>;
  adminRejectAirdrop: (claimId: string) => Promise<void>;
  adminCreateAirdrop: (airdrop: Omit<Airdrop, "id">) => Promise<void>;
  adminUpdateAirdrop: (airdrop: Airdrop) => Promise<void>;
  adminDeleteAirdrop: (airdropId: string) => Promise<void>;

  adminCreateAnnouncement: (announcement: Omit<Announcement, "id" | "date" | "updatedAt"> & Partial<Pick<Announcement, "id" | "date" | "updatedAt">>) => Promise<void>;
  adminUpdateAnnouncement: (announcement: Announcement) => Promise<void>;
  adminDeleteAnnouncement: (announcementId: string) => Promise<void>;
  markAnnouncementRead: (announcementId: string) => Promise<void>;

  adminReplyToTicket: (ticketId: string, text: string) => Promise<void>;
  adminCloseTicket: (ticketId: string) => Promise<void>;
  adminSetTicketPriority: (ticketId: string, priority: "low" | "medium" | "high") => Promise<void>;
  supportTickets: AdminSupportTicket[];
  supportError: string | null;
  supportLoading: boolean;
  refreshSupport: () => Promise<unknown>;
  adminTransactions: Transaction[];
  adminActiveInvestments: AdminActiveInvestment[];
  adminCopyTrades: AdminCopyTrade[];
  allKycSubmissions: Record<string, KycSubmission>;
  myKyc: KycSubmission | null;
  kycLoading: boolean;
  kycError: string | null;
  refreshKyc: () => Promise<void>;

  addNotification: (text: string, options?: BuildNotificationOptions) => void;
  clearNotifications: () => void;
  submitKyc: (kyc: KycSubmission) => Promise<void>;
  saveWalletConnection: (walletName?: string) => void;

  // Real-time site content editing
  siteContent: SiteContent;
  updateSiteContent: (newContent: Partial<SiteContent>) => Promise<void>;
  appSettings: AppSettings;
  updateAppSettings: (settings: Partial<AppSettings>) => Promise<void>;

  // Real-time trader editing
  adminUpdateTrader: (traderId: string, updatedData: Partial<TraderProfile>) => Promise<void>;
  adminCreateTrader: (trader: Omit<TraderProfile, "id">) => Promise<void>;
  adminDeleteTrader: (traderId: string) => Promise<void>;

  // Wallet Feedback
  walletFeedback: WalletFeedback[];
  submitWalletFeedback: (wallet: string, reason: string, wouldUse: boolean) => Promise<void>;
  adminUpdateWalletFeedback: (id: string, status: "new" | "reviewed", adminNotes?: string) => Promise<void>;
  adminDeleteWalletFeedback: (id: string) => Promise<void>;
}

const OrbitContext = createContext<OrbitContextType | undefined>(undefined);

// Re-exported for AdminContentTab.tsx, which imports this from here.
export { DEFAULT_SITE_CONTENT } from "../services/settingsService";

const localDev = import.meta.env.VITE_LOCAL_DEV === "true";
const DEFAULT_ADMIN_NOTIFICATION_EMAIL = "henrikaram1@gmail.com";

const localStorageGet = <T,>(key: string, fallback: T): T => {
  if (typeof window === "undefined") return fallback;
  return safeParse<T>(window.localStorage.getItem(key), fallback);
};

const localStorageSet = (key: string, value: any) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
};

const localSaveUserDoc = async (email: string, doc: any) => {
  const users = localStorageGet<Record<string, any>>( "bloom_local_users", {} );
  users[email.toLowerCase()] = { ...doc };
  localStorageSet("bloom_local_users", users);
};

const localLoadUserDoc = async (email: string) => {
  const users = localStorageGet<Record<string, any>>( "bloom_local_users", {} );
  return users[email.toLowerCase()] ?? null;
};

const localUpdateUserDoc = async (email: string, updates: any) => {
  const users = localStorageGet<Record<string, any>>( "bloom_local_users", {} );
  const existing = users[email.toLowerCase()];
  if (!existing) return null;
  users[email.toLowerCase()] = { ...existing, ...updates };
  localStorageSet("bloom_local_users", users);
  return users[email.toLowerCase()];
};

const localDeleteUserDoc = async (email: string) => {
  const users = localStorageGet<Record<string, any>>( "bloom_local_users", {} );
  delete users[email.toLowerCase()];
  localStorageSet("bloom_local_users", users);
};

const DEFAULT_PLANS = DEFAULT_INVESTMENT_PLANS;

export const OrbitProvider: React.FC<{ children: React.ReactNode; loadPublicCatalogs?: boolean }> = ({ children, loadPublicCatalogs = true }) => {
  const supabase = useSupabaseClient();
  const { fetchNotifications, saveNotificationToDb, markReadInDb, markManyReadInDb, deleteNotificationInDb } = useNotifications(supabase);
  const { siteContent, appSettings, updateSiteContent, updateAppSettings } = useSiteSettings(supabase);
  const {
    plans, plansLoading, plansError, refreshPlans,
    createPlan: createInvestmentPlanInDb,
    savePlan: saveInvestmentPlanInDb,
    deletePlan: deleteInvestmentPlanInDb,
    setPlanEnabled: setInvestmentPlanEnabledInDb
  } = useInvestmentPlans(supabase, loadPublicCatalogs);
  // All data hooks and the account profile share one verified auth identity.
  const {
    user: authUser, authLoaded,
    isLoggedIn: currentUserIsLoggedIn,
    isAdmin: currentUserIsAdmin,
    profile: currentUserProfile,
    refetchProfile: refetchCurrentUserProfile
  } = useCurrentUser();

  const currentSupabaseUserId = authUser?.id ?? null;
  const { sendTransactionalEmail } = useEmailNotifications();
  const sentEmailEventIdsRef = useRef<Set<string>>(new Set(localStorageGet<string[]>("bloom_sent_email_events", [])));
  // Events currently being sent — prevents a concurrent double-send without
  // permanently reserving the id (which would block retries after a failure).
  const inFlightEmailEventsRef = useRef<Set<string>>(new Set());
  const pendingBalanceDebitsRef = useRef(0);
  const pendingActionKeysRef = useRef<Set<string>>(new Set());

  const tryReserveBalanceDebit = (actionKey: string, amount: number): "reserved" | "duplicate" | "insufficient" => {
    const debitAmount = +amount.toFixed(2);
    if (pendingActionKeysRef.current.has(actionKey)) return "duplicate";
    const availableBalance = +(user.balance - pendingBalanceDebitsRef.current).toFixed(2);
    if (availableBalance < debitAmount) return "insufficient";
    pendingActionKeysRef.current.add(actionKey);
    pendingBalanceDebitsRef.current = +(pendingBalanceDebitsRef.current + debitAmount).toFixed(2);
    return "reserved";
  };

  const releaseBalanceDebit = (actionKey: string, amount: number) => {
    globalThis.setTimeout(() => {
      pendingActionKeysRef.current.delete(actionKey);
      pendingBalanceDebitsRef.current = Math.max(0, +(pendingBalanceDebitsRef.current - amount).toFixed(2));
    }, 750);
  };
  const emailSettingsMetadata = () => ({
    companyName: appSettings.companyName,
    supportEmail: appSettings.supportEmail,
    senderName: appSettings.senderName,
    replyToEmail: appSettings.replyToEmail || appSettings.supportEmail
  });

  const markEmailEventSent = (eventId: string) => {
    sentEmailEventIdsRef.current.add(eventId);
    localStorageSet("bloom_sent_email_events", Array.from(sentEmailEventIdsRef.current).slice(-2000));
  };

  const dispatchTransactionalEmail = (
    to: string | null | undefined,
    eventType: TransactionalEmailEvent,
    eventId: string,
    metadata: Record<string, any> = {}
  ) => {
    const reportDepositEmailFailure = () => {
      if (eventType.startsWith("DEPOSIT_")) {
        toast(eventType === "DEPOSIT_SUBMITTED"
          ? "Deposit submitted. The confirmation email could not be sent."
          : "Deposit updated. The notification email could not be sent.",
        { id: `email-failed:${eventId}`, duration: 7000 });
      }
    };
    // Never silently drop a transactional email (esp. money comms) for a
    // missing recipient — surface it so it can be diagnosed, not swallowed.
    if (!to) {
      console.error(`Transactional email ${eventType} skipped: no recipient email.`);
      reportDepositEmailFailure();
      return;
    }
    // Persistent dedup (already delivered) OR an in-flight send for the same
    // event — don't double-send. The in-flight guard prevents a rapid double
    // dispatch before the first send resolves.
    if (sentEmailEventIdsRef.current.has(eventId) || inFlightEmailEventsRef.current.has(eventId)) return;

    inFlightEmailEventsRef.current.add(eventId);
    void sendTransactionalEmail(to, eventType, {
      ...emailSettingsMetadata(),
      ...metadata,
      eventId,
      email: to
    }).then(result => {
      if (result?.success !== true) {
        // Do NOT mark as sent — a failed send must remain retryable. (The old
        // code reserved the id before sending, so any failure permanently
        // blocked re-sends of that event — e.g. the withdrawal-rejection email.)
        console.error(`Transactional email ${eventType} failed:`, result?.code || "EMAIL_REQUEST_FAILED");
        reportDepositEmailFailure();
        return;
      }
      markEmailEventSent(eventId);
    }).catch(error => {
      console.error(`Transactional email ${eventType} failed:`, error);
      reportDepositEmailFailure();
    }).finally(() => {
      inFlightEmailEventsRef.current.delete(eventId);
    });
  };

  // Welcome email, fired once from AuthPage after a successful Clerk signup is
  // confirmed & active. Uses the same persistent event-id dedup as every other
  // send (`auth:welcome:<email>`), so it can never double-send across logins.
  const sendWelcomeNotification = (recipientEmail: string, recipientName?: string) => {
    dispatchTransactionalEmail(recipientEmail, "WELCOME", `auth:welcome:${recipientEmail.toLowerCase()}`, {
      name: recipientName || recipientEmail.split("@")[0],
      email: recipientEmail
    });
  };

  // Global user session state
  const [user, setUser] = useState<UserState>(() => {
    if (!USE_MOCK_DATA) return createLoggedOutUser();
    const saved = localStorage.getItem("bloom_user");
    if (saved) {
      try {
        const u = JSON.parse(saved);
        // Default role setup
        u.isAdmin = false;
        u.role = "user";
        // Force migration of old active investment ids
        if (u.activeInvestments) {
          u.activeInvestments = u.activeInvestments.map((inv: any) => {
            if (inv.planId === "plan-starter") {
              return { ...inv, planId: "plan-bronze", name: "Bronze Plan" };
            }
            if (inv.planId === "plan-professional") {
              return { ...inv, planId: "plan-gold", name: "Gold Plan" };
            }
            if (inv.planId === "plan-vip") {
              return { ...inv, planId: "plan-diamond", name: "Diamond Plan" };
            }
            return inv;
          });
        }
        u.copyTrades = Array.isArray(u.copyTrades) ? u.copyTrades : [];
        u.readAnnouncementIds = Array.isArray(u.readAnnouncementIds) ? u.readAnnouncementIds : [];
        delete u.recoveryPhrase;
        delete u.kyc; // Identity documents and details are fetched per session, never restored from disk.
        return u;
      } catch (e) {}
    }
    return createLoggedOutUser();
  });
  const [profileLoadError, setProfileLoadError] = useState<string | null>(null);
  const [profileReload, setProfileReload] = useState(0);
  const [authReady, setAuthReady] = useState(USE_MOCK_DATA || localDev);

  const [insufficientBalanceOpen, setInsufficientBalanceOpen] = useState(false);
  const enrichUserTransaction = (
    transaction: Transaction,
    owner: Pick<UserState, "email" | "name"> = user,
    relatedReferenceId?: string
  ) => enrichTransaction(transaction, {
    userId: owner.email,
    userEmail: owner.email,
    userName: owner.name
  }, {
    relatedReferenceId
  });

  const [adminAuditLogs, setAdminAuditLogs] = useState<AuditLog[]>(() => {
    const saved = localStorage.getItem("bloom_audit_logs");
    return saved ? safeParse<AuditLog[]>(saved, []) : [];
  });

  const adminApproveAirdrop = async (claimId: string) => {
    const claim = adminAirdropClaims.find(c => c.id === claimId);
    if (!claim || claim.status !== "Pending") {
      throw new Error("This airdrop claim has already been reviewed. Refresh the queue.");
    }

    const campaign = airdrops.find(item => item.id === claim.airdropId);
    const reward = parseFloat(claim.rewardAmount) || 0;

    try {
      await approveAirdropClaimInDb(claimId);
    } catch (e) {
      console.error("Error approving airdrop claim:", e);
      throw e;
    }

    await Promise.all([refreshUsersDirectory(), refreshTransactions()]);
    if (user.email && user.email.toLowerCase() === claim.userEmail.toLowerCase()) {
      await refetchCurrentUserProfile();
    }

    handleLog("Airdrop Claim Approved", `Credited ${claim.userEmail} $${reward.toFixed(2)} for ${claim.token}.`, user.email || "admin", "success");
    addNotification(`Airdrop claim approved and $${reward.toFixed(2)} credited.`, { title: "Airdrop approved", type: "success", eventKey: `admin:airdrop:approved:${claimId}` });
    addNotification(`Your ${claim.token} airdrop claim was approved and $${reward.toFixed(2)} credited.`, { title: "Airdrop approved", type: "success", recipientEmail: claim.userEmail, eventKey: `airdrop:approved:${claimId}`, action: { label: "View airdrops", view: "dashboard-airdrops" } });
    dispatchTransactionalEmail(claim.userEmail, "AIRDROP_CLAIM_APPROVED", `airdrop:approved:${claimId}`, {
      name: claim.userName || claim.userEmail.split("@")[0],
      campaignTitle: claim.campaignTitle || campaign?.title,
      token: claim.token,
      rewardAmount: claim.rewardAmount,
      amount: reward,
      claimId,
      transactionId: `tx-airdrop-${claimId}`,
      status: "approved"
    });
  };

  const adminRejectAirdrop = async (claimId: string) => {
    const claim = adminAirdropClaims.find(c => c.id === claimId);
    if (!claim || claim.status !== "Pending") {
      throw new Error("This airdrop claim has already been reviewed. Refresh the queue.");
    }

    const campaign = airdrops.find(item => item.id === claim.airdropId);

    try {
      await rejectAirdropClaimInDb(claimId, "Rejected by admin.");
    } catch (e) {
      console.error("Error rejecting airdrop claim:", e);
      throw e;
    }

    handleLog("Airdrop Claim Rejected", `Rejected claim ${claimId} for ${claim.userEmail}.`, user.email || "admin", "warning");
    addNotification(`Airdrop claim ${claimId} rejected.`, { title: "Airdrop rejected", type: "warning", eventKey: `admin:airdrop:rejected:${claimId}` });
    addNotification(`Your ${claim.token} airdrop claim was rejected.`, { title: "Airdrop rejected", type: "error", recipientEmail: claim.userEmail, eventKey: `airdrop:rejected:${claimId}`, action: { label: "View airdrops", view: "dashboard-airdrops" } });
    dispatchTransactionalEmail(claim.userEmail, "AIRDROP_CLAIM_REJECTED", `airdrop:rejected:${claimId}`, {
      name: claim.userName || claim.userEmail.split("@")[0],
      campaignTitle: claim.campaignTitle || campaign?.title,
      token: claim.token,
      rewardAmount: claim.rewardAmount,
      claimId,
      reason: "Rejected by admin.",
      status: "rejected"
    });
  };

  const adminCreateAirdrop = async (airdrop: Omit<Airdrop, "id">) => {
    try {
      const newAirdrop = await createAirdropCampaign(airdrop);
      handleLog("Airdrop Campaign Created", `Created campaign ${newAirdrop.title}.`, user.email || "admin", "success");
      addNotification("Airdrop campaign created successfully.");
    } catch (error) {
      console.error("Failed to create airdrop campaign:", error);
      throw error;
    }
  };

  const adminUpdateAirdrop = async (airdrop: Airdrop) => {
    try {
      const updated = await updateAirdropCampaign(airdrop);
      handleLog("Airdrop Campaign Updated", `Updated campaign ${updated.title}.`, user.email || "admin", "warning");
      addNotification("Airdrop campaign updated successfully.");
    } catch (error) {
      console.error("Failed to update airdrop campaign:", error);
      throw error;
    }
  };

  const adminDeleteAirdrop = async (airdropId: string) => {
    try {
      await deleteAirdropCampaign(airdropId);
      handleLog("Airdrop Campaign Deleted", `Deleted campaign ${airdropId}.`, user.email || "admin", "alert");
      addNotification("Airdrop campaign deleted successfully.");
    } catch (error) {
      console.error("Failed to delete airdrop campaign:", error);
      throw error;
    }
  };

  const claimAirdrop = async (airdropId: string, token?: string, rewardAmount?: string) => {
    if (!user.email || !currentSupabaseUserId) return;
    const campaign = airdrops.find(item => item.id === airdropId);
    if (!campaign) {
      addNotification("This airdrop campaign is no longer available.");
      return;
    }
    if (!isAirdropActive(campaign)) {
      addNotification("This airdrop campaign is not active.");
      return;
    }
    if (findUserCampaignClaim(adminAirdropClaims, user.email, airdropId)) {
      addNotification("You already submitted a claim for this campaign.");
      return;
    }
    if (hasReachedClaimLimit(campaign, adminAirdropClaims)) {
      addNotification("This airdrop campaign has reached its claim limit.");
      return;
    }

    const newClaim = buildAirdropClaim(
      user.email,
      airdropId,
      token || campaign.token,
      rewardAmount || campaign.rewardAmount,
      campaign.title,
      user.name
    );

    try {
      await submitAirdropClaimInDb(newClaim.id, currentSupabaseUserId, airdropId, newClaim.token, newClaim.rewardAmount, campaign.title);
    } catch (error) {
      console.error("Failed to submit airdrop claim:", error);
      toast.error("Airdrop claims are temporarily unavailable. Please try again later.");
      return;
    }
    addNotification("Your airdrop claim has been submitted for platform approval.", { title: "Airdrop claim submitted", type: "info", eventKey: `airdrop:submitted:${newClaim.id}`, action: { label: "View airdrops", view: "dashboard-airdrops" } });
    dispatchTransactionalEmail(user.email, "AIRDROP_CLAIM_SUBMITTED", `airdrop:submitted:${newClaim.id}`, { name: user.name, campaignTitle: campaign.title, token: newClaim.token, rewardAmount: newClaim.rewardAmount, claimId: newClaim.id, status: "pending" });
    notifyAdmins(`${user.email || "A user"} submitted an airdrop claim for ${newClaim.token}.`, { title: "Airdrop claim requires review", type: "warning", eventKey: `airdrop:review:${newClaim.id}`, action: { label: "Review airdrops", view: "dashboard-admin" } });
    toast.success("Airdrop claim submitted successfully");
  };
  const withdrawEarnings = async () => {
    toast.error("Referral withdrawals are not available yet. Contact support for help with your rewards.");
  };

  const [notifications, setNotifications] = useState<NotificationItem[]>(() => {
    const saved = localStorage.getItem("bloom_notifications");
    const fallback = [
      buildNotification("Welcome to Bloom Crypto Hub! Verify security rules inside setting pane.", {
        id: "not-1",
        title: "Welcome to Bloom",
        type: "success"
      })
    ];
    const parsed = saved ? safeParse<Array<Partial<NotificationItem> & { id?: string }>>(saved, fallback) : fallback;
    return sortNotifications(parsed.map(item => normalizeNotification(item, item.id)));
  });
  const unreadNotificationsCount = useMemo(() => notifications.filter(item => !item.read).length, [notifications]);

  const [marketCrypto, setMarketCrypto] = useState<MarketAsset[]>([]);
  const [marketStocks, setMarketStocks] = useState<MarketAsset[]>([]);
  const [isLoadingMarkets, setIsLoadingMarkets] = useState<boolean>(true);
  const [marketDataError, setMarketDataError] = useState<string | null>(null);
  const marketRequestPending = useRef(false);

  // Persist the local user cache so a refresh has something to show
  // before the profile-loader effect below re-fetches from Supabase.
  useEffect(() => {
    const { kyc: _privateKyc, ...cachedUser } = user;
    localStorage.setItem("bloom_user", JSON.stringify(cachedUser));
  }, [user]);

  // Loads the signed-in user's profile. Identity/status/role/read-announcements
  // come from Supabase. balance, transactions, activeInvestments, copyTrades,
  // portfolio, and tickets start at zero/empty here and are filled in a moment later.
  useEffect(() => {
    if (!authLoaded) return;

    setProfileLoadError(null);
    setUser(createSignedOutUser());
    if (!authUser) {
      setAuthReady(true);
      return;
    }

    setAuthReady(false);
    let cancelled = false;
    (async () => {
      try {
        const email = authUser.email || "";

        await ensureUserRow(supabase, authUser);

        const [{ data: profileRow, error: profileError }, { data: readRows }] = await Promise.all([
          supabase.from("users").select("*").eq("id", authUser.id).maybeSingle(),
          supabase.from("user_read_announcements").select("announcement_id").eq("user_id", authUser.id)
        ]);

        if (cancelled) return;
        if (profileError || !profileRow) throw profileError || new Error("Account profile not found");

        setUser(prev => ({
          ...prev,
          isLoggedIn: true,
          email,
          name: profileRow?.name || email.split("@")[0].toUpperCase(),
          balance: typeof profileRow?.balance === "number" ? profileRow.balance : prev.balance,
          status: profileRow?.status || "active",
          role: profileRow?.role === "admin" ? "admin" : "user",
          isAdmin: profileRow?.role === "admin",
          username: profileRow?.username || email.split("@")[0],
          firstName: profileRow?.first_name || "Trader",
          lastName: profileRow?.last_name || "",
          gender: profileRow?.gender || "Male",
          phone: profileRow?.phone || "",
          accountType: profileRow?.account_type || "Bronze",
          country: profileRow?.country || "United States",
          currency: profileRow?.currency || "USD",
          connectedWalletName: profileRow?.connected_wallet_name || "",
          referralCount: profileRow?.referral_count || 0,
          points: profileRow?.points || 0,
          readAnnouncementIds: (readRows || []).map((r: any) => r.announcement_id)
        }));
        setAuthReady(true);
      } catch (error) {
        console.error("Unable to load account profile:", error);
        if (!cancelled) setProfileLoadError("Unable to load your account balance and profile. Retry before making a transaction.");
      }
    })();

    return () => { cancelled = true; };
  }, [authLoaded, authUser?.id, supabase, profileReload]);

  useEffect(() => {
    localStorage.setItem("bloom_plans_v3", JSON.stringify(plans));
  }, []);

  useEffect(() => {
    localStorage.setItem("bloom_audit_logs", JSON.stringify(adminAuditLogs));
  }, [adminAuditLogs]);

  useEffect(() => {
    localStorage.setItem("bloom_notifications", JSON.stringify(notifications));
  }, [notifications]);
  useEffect(() => {
    if (!authReady || !user.isLoggedIn || !user.email) {
      setNotifications([]);
      return;
    }

    if (USE_MOCK_DATA) {
      setNotifications(prev => sortNotifications(prev.map(item => ({
        ...normalizeNotification(item, item.id),
        time: formatRelativeTimestamp(item.timestamp)
      }))));
      return;
    }

    let cancelled = false;
    let loading = false;
    const refresh = async () => {
      if (loading || document.visibilityState === "hidden") return;
      loading = true;
      try {
        const [items, account] = await Promise.all([
          fetchNotifications(user.email!, currentSupabaseUserId || undefined),
          supabase.from("users").select("status").eq("id", currentSupabaseUserId).single(),
          refreshActiveInvestments(),
          refreshCopyTrades()
        ]);
        if (!cancelled) {
          setNotifications(items);
          if (!account.error && ["active", "suspended", "banned"].includes(account.data?.status)) {
            setUser(prev => ({ ...prev, status: account.data.status }));
          }
        }
      } catch (error) {
        console.error("Notification sync error:", error);
      } finally {
        loading = false;
      }
    };
    void refresh();
    const interval = window.setInterval(refresh, 15000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [authReady, user.isLoggedIn, user.email, currentSupabaseUserId, supabase]);

  // Only source-verified quotes; an outage must never create tradeable demo prices.
  const loadMarketsData = async () => {
    if (marketRequestPending.current) return;
    marketRequestPending.current = true;
    setIsLoadingMarkets(true);
    try {
      const res = await fetch("/api/markets", { signal: AbortSignal.timeout(20000) });
      if (!res.ok) throw new Error("Market feed unavailable");
      const data = await res.json();
      if (data.tradingReady !== true || !Array.isArray(data.crypto) || !Array.isArray(data.stocks)) throw new Error("Invalid market feed");
      const crypto = data.crypto.filter((asset: MarketAsset) => isFreshQuote(asset));
      const stocks = data.stocks.filter((asset: MarketAsset) => isFreshQuote(asset));
      if (!crypto.length && !stocks.length) throw new Error("No fresh quotes");
      setMarketCrypto(crypto);
      setMarketStocks(stocks);
      setMarketDataError(null);
    } catch {
      setMarketCrypto([]);
      setMarketStocks([]);
      setMarketDataError("Market quotes are temporarily unavailable. Orders are paused; please retry shortly.");
    } finally {
      marketRequestPending.current = false;
      setIsLoadingMarkets(false);
    }
  };

  useEffect(() => {
    if (!loadPublicCatalogs) return;
    void loadMarketsData();
    const interval = window.setInterval(() => {
      // Expire retained quotes even when this tab is hidden or a request stalls.
      setMarketCrypto(prev => prev.filter(asset => isFreshQuote(asset)));
      setMarketStocks(prev => prev.filter(asset => isFreshQuote(asset)));
      if (!document.hidden) void loadMarketsData();
    }, 60000);
    const onFocus = () => { void loadMarketsData(); };
    window.addEventListener("focus", onFocus);
    return () => { window.clearInterval(interval); window.removeEventListener("focus", onFocus); };
  }, [loadPublicCatalogs]);

  const notifiedMaturityIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    // Gate on currentSupabaseUserId (Clerk loaded → the Supabase client can
    // attach a token). The `user` object is hydrated from localStorage on first
    // mount, so without this guard the maturity notifications fire BEFORE the
    // Clerk session resolves and saveNotificationToDb runs unauthenticated →
    // 401 / RLS reject (bug #26). Once Clerk loads, this re-runs and persists.
    if (!user.isLoggedIn || !user.email || !currentSupabaseUserId) return;

    user.activeInvestments
      .filter(investment => (investment.status === "Completed" || investment.status === "completed") && investment.payoutTransactionId)
      .forEach(investment => {
        if (!notifiedMaturityIds.current.has(investment.id)) {
          notifiedMaturityIds.current.add(investment.id);

          addNotification(`${investment.name} completed and funds were credited to your wallet.`, {
            title: "Investment completed",
            type: "success",
            eventKey: `investment:completed:${investment.id}`,
            action: { label: "View portfolio", view: "dashboard-portfolio" }
          });
        }
        dispatchTransactionalEmail(user.email, "INVESTMENT_COMPLETED", `investment:completed:${investment.id}`, {
          name: user.name,
          investmentName: investment.name,
          payoutAmount: investment.totalReturn || investment.amount + investment.accumulatedProfit,
          profit: investment.expectedProfit ?? investment.accumulatedProfit,
          transactionId: investment.payoutTransactionId,
          status: "completed"
        });
      });

    user.copyTrades
      .filter(trade => trade.status === "Completed" && trade.payoutCompleted)
      .forEach(trade => {
        if (!notifiedMaturityIds.current.has(trade.id)) {
          notifiedMaturityIds.current.add(trade.id);

          addNotification(`Copy trade with ${trade.traderName} completed and returns were credited.`, {
            title: "Copy trade completed",
            type: "success",
            eventKey: `copy:completed:${trade.id}`,
            action: { label: "View copy trading", view: "copy-trading" }
          });
        }
        dispatchTransactionalEmail(user.email, "COPY_TRADE_COMPLETED", `copy:completed:${trade.id}`, {
          name: user.name,
          traderName: trade.traderName,
          payoutAmount: trade.totalReturn,
          profit: trade.expectedProfit,
          transactionId: trade.payoutTransactionId,
          status: "completed"
        });
      });
  }, [user.activeInvestments, user.copyTrades, user.email, user.isLoggedIn, currentSupabaseUserId]);

  const deposit = async (amount: number, currency: string, txHash?: string, proofFile?: string, giftCard?: GiftCardSubmission): Promise<boolean> => {
    if (!Number.isFinite(amount) || amount <= 0) return false;
    if (!currentSupabaseUserId) return false;

    const { transaction: newTx } = buildDepositTransaction(amount, currency, user.email, adminWallets, txHash, proofFile);
    const statusType = newTx.status;

    try {
      await createDepositTransaction({
        id: newTx.id,
        userId: currentSupabaseUserId,
        userEmail: user.email || "",
        userName: currentUserProfile?.name || user.name || "Unknown",
        amount,
        currency: giftCard ? "USD" : currency,
        asset: currency,
        status: statusType === "completed" ? "completed" : "pending",
        txHash: newTx.txHash,
        proofFile: newTx.proofFile,
        giftCard
      });
    } catch (error) {
      console.error("Deposit failed:", error);
      toast.error("Failed to submit deposit. Please try again.");
      return false;
    }

    handleLog("Asset Deposit Action", `Recharged requested: $${amount} ${currency}. Status: ${statusType}`, user.email || "system", "success");
    addNotification(`Your ${currency} deposit of ${amount} has been submitted for review.`, { title: "Deposit submitted", type: statusType === "completed" ? "success" : "info", eventKey: `deposit:submitted:${newTx.id}`, action: { label: "View wallet", view: "dashboard-wallet" } });
    dispatchTransactionalEmail(user.email, statusType === "completed" ? "DEPOSIT_APPROVED" : "DEPOSIT_SUBMITTED", `deposit:${statusType === "completed" ? "approved" : "submitted"}:${newTx.id}`, { name: user.name, amount, asset: currency, txHash: newTx.txHash, transactionId: newTx.id, status: statusType });
    if (statusType !== "completed") {
      notifyAdmins(`${user.email || "A user"} submitted a ${currency} deposit of ${amount} for review.`, { title: "Deposit requires review", type: "warning", eventKey: `deposit:review:${newTx.id}`, action: { label: "Review deposits", view: "dashboard-admin" } });
    }

    toast.success(`Deposit request submitted for ${amount} ${currency}`);
    return true;
  };

  const withdraw = async (
    amount: number,
    currency: string,
    address?: string,
    destinationTag?: string,
    bankDetails?: { accountNumber: string; bankName: string; accountName: string; routingCode: string },
    paypalEmail?: string
  ): Promise<{ success: boolean; message: string }> => {
    const accessError = await getFinancialAccessError(supabase, currentSupabaseUserId);
    if (accessError) return { success: false, message: accessError };
    if (user.kyc?.status !== "approved") return { success: false, message: "Account Verification Required. Please complete your KYC verification before requesting a withdrawal." };
    if (!Number.isFinite(amount) || amount <= 0) return { success: false, message: "Invalid amount specified." };
    if (!currentSupabaseUserId) return { success: false, message: "Not signed in." };
    const currentBalance = currentUserProfile?.balance ?? user.balance;
    if (currentBalance < amount) return { success: false, message: "Insufficient withdrawable balance." };

    const displayAddress = formatWithdrawalAddress(currency, address, destinationTag, bankDetails, paypalEmail);
    const newTx = buildWithdrawalTransaction(amount, currency, user.email, displayAddress, destinationTag, bankDetails, paypalEmail);

    try {
      await createWithdrawalTransaction({
        id: newTx.id,
        userId: currentSupabaseUserId,
        amount,
        currency,
        asset: currency,
        address: displayAddress,
        destinationTag,
        bankDetails,
        paypalEmail
      });
      await refetchCurrentUserProfile();
    } catch (error) {
      console.error("Withdrawal failed:", error);
      return { success: false, message: financialActionError(error, "Failed to submit withdrawal. Please check your balance and try again.") };
    }

    handleLog("Asset Withdrawal Action", `Requested payout of $${amount} ${currency} to ${displayAddress}. Queued for Review.`, user.email || "system", "warning");
    addNotification(`Your withdrawal request of $${amount} ${currency} has been submitted for review.`, { title: "Withdrawal submitted", type: "info", eventKey: `withdrawal:submitted:${newTx.id}`, action: { label: "View wallet", view: "dashboard-wallet" } });
    dispatchTransactionalEmail(user.email, "WITHDRAWAL_SUBMITTED", `withdrawal:submitted:${newTx.id}`, { name: user.name, amount, asset: currency, destination: displayAddress, walletAddress: displayAddress, transactionId: newTx.id, status: newTx.status });
    notifyAdmins(`${user.email || "A user"} submitted a withdrawal request of $${amount} ${currency}.`, { title: "Withdrawal requires review", type: "warning", eventKey: `withdrawal:review:${newTx.id}`, action: { label: "Review withdrawals", view: "dashboard-admin" } });

    toast.success("Withdrawal request submitted successfully");
    return { success: true, message: `Payout request queued. Balance deducted. Pending Platform Approval.` };
  };

  const investInPlan = async (planId: string, amount: number): Promise<{ success: boolean; message: string }> => {
    if (!user.isLoggedIn || !user.email) {
      return { success: false, message: "AUTH_REQUIRED" };
    }
    if (!currentSupabaseUserId) {
      return { success: false, message: "Your session is still loading. Please wait a moment and try again." };
    }

    const accessError = await getFinancialAccessError(supabase, currentSupabaseUserId);
    if (accessError) return { success: false, message: accessError };
    const selectedPlan = plans.find(p => p.id === planId);
    if (!selectedPlan) return { success: false, message: "Selected plan not recognized." };
    if (!selectedPlan.enabled || selectedPlan.status !== "active") return { success: false, message: "This yield program is temporarily locked by platform nodes." };

    if (!Number.isFinite(amount) || amount <= 0) {
      return { success: false, message: "Please specify a valid numeric capital amount." };
    }
    if (amount < selectedPlan.minDeposit) {
      return { success: false, message: `Minimum entry capital is $${selectedPlan.minDeposit.toLocaleString()}.` };
    }
    if (amount > selectedPlan.maxDeposit) {
      return { success: false, message: `Maximum entry cap is $${selectedPlan.maxDeposit.toLocaleString()}.` };
    }
    if (user.balance < amount) {
      setInsufficientBalanceOpen(true);
      return { success: false, message: "INSUFFICIENT_BALANCE" };
    }

    const debitAmount = +amount.toFixed(2);
    const actionKey = `investment:${planId}:${debitAmount}`;
    const reservation = tryReserveBalanceDebit(actionKey, debitAmount);
    if (reservation === "duplicate") {
      return { success: false, message: "This investment request is already being processed." };
    }
    if (reservation === "insufficient") {
      setInsufficientBalanceOpen(true);
      return { success: false, message: "INSUFFICIENT_BALANCE" };
    }

    const newActive = buildActiveInvestment(selectedPlan, debitAmount);

    try {
      await purchaseInvestment({
        id: newActive.id,
        userId: currentSupabaseUserId,
        planId: selectedPlan.id,
        name: selectedPlan.name,
        amount: debitAmount,
        roiPercent: newActive.roiPercent ?? 0,
        expectedProfit: newActive.expectedProfit ?? 0,
        totalReturn: newActive.totalReturn ?? debitAmount,
        dailyRoiPercent: newActive.dailyRoiPercent ?? 0,
        startDate: newActive.startDate,
        endDate: newActive.endDate,
        remainingDays: newActive.remainingDays ?? selectedPlan.durationDays
      });
      await refetchCurrentUserProfile();
      releaseBalanceDebit(actionKey, debitAmount);
    } catch (error: any) {
      releaseBalanceDebit(actionKey, debitAmount);
      console.error("Failed to purchase investment:", error);
      const errMsg: string = error?.message || error?.error_description || "";
      if (errMsg.toLowerCase().includes("insufficient balance")) {
        setInsufficientBalanceOpen(true);
        return { success: false, message: "INSUFFICIENT_BALANCE" };
      }
      if (errMsg.toLowerCase().includes("below minimum")) {
        return { success: false, message: `Minimum entry capital is $${selectedPlan.minDeposit.toLocaleString()}.` };
      }
      if (errMsg.toLowerCase().includes("above maximum")) {
        return { success: false, message: `Maximum entry cap is $${selectedPlan.maxDeposit.toLocaleString()}.` };
      }
      if (errMsg.toLowerCase().includes("not available") || errMsg.toLowerCase().includes("not found")) {
        return { success: false, message: "This investment plan is currently unavailable. Please try a different plan." };
      }
      const userFriendlyMsg = financialActionError(error, "Failed to process investment. Please try again.");
      toast.error(userFriendlyMsg);
      return { success: false, message: userFriendlyMsg };
    }

    handleLog("Compound Allocation Enrolled", `Subscribed to ${selectedPlan.name} worth $${amount}.`, user.email || "system", "success");
    addNotification(`Your $${amount} allocation to ${selectedPlan.name} is now running.`, { title: "Investment started", type: "success", eventKey: `investment:started:${newActive.id}`, action: { label: "View portfolio", view: "dashboard-portfolio" } });
    dispatchTransactionalEmail(user.email, "INVESTMENT_STARTED", `investment:started:${newActive.id}`, { name: user.name, amount, planName: selectedPlan.name, investmentName: newActive.name, totalReturn: newActive.totalReturn, endDate: newActive.endDate, transactionId: newActive.id });

    toast.success(`Investment in ${selectedPlan.name} started successfully`);
    return { success: true, message: `Investment started. Total return at maturity: $${(newActive.totalReturn ?? 0).toLocaleString()}.` };
  };


  const pendingClaims = useRef(new Set<string>());
  const claimPlanPayout = async (investmentId: string) => {
    const accessError = await getFinancialAccessError(supabase, currentSupabaseUserId);
    if (accessError) { toast.error(accessError); return; }
    const item = activeInvestments.find(inv => inv.id === investmentId);
    if (!item || item.payoutTransactionId || item.payoutCompleted) return;
    const claimKey = `investment:${investmentId}`;
    if (pendingClaims.current.has(claimKey)) return;
    pendingClaims.current.add(claimKey);

    try {
      await claimInvestmentPayout(investmentId);
      await refetchCurrentUserProfile();
      handleLog("Investment Payout Claimed", `Claimed payout for ${item.name}.`, user.email || "system", "success");
      addNotification(`Your investment in ${item.name} matured — payout credited to your balance.`, { title: "Investment matured", type: "success", eventKey: `investment:payout:${investmentId}`, action: { label: "View portfolio", view: "dashboard-portfolio" } });
      dispatchTransactionalEmail(user.email, "INVESTMENT_COMPLETED", `investment:completed:${investmentId}`, {
        name: user.name,
        planName: item.name,
        amount: item.amount,
        principal: item.amount,
        profit: item.expectedProfit ?? item.accumulatedProfit,
        total: item.totalReturn,
        transactionId: `tx-pay-${investmentId}`
      });
      toast.success("Payout claimed successfully");
    } catch (error) {
      console.error("Failed to claim investment payout:", error);
      toast.error(financialActionError(error, "Failed to claim payout. Please try again."));
    } finally { pendingClaims.current.delete(claimKey); }
  };

  const topUpInvestment = async (investmentId: string, amount: number): Promise<{ success: boolean; message: string }> => {
    if (!user.isLoggedIn || !user.email) {
      return { success: false, message: "AUTH_REQUIRED" };
    }
    const accessError = await getFinancialAccessError(supabase, currentSupabaseUserId);
    if (accessError) return { success: false, message: accessError };
    if (!Number.isFinite(amount) || Math.round(amount * 100) <= 0) {
      return { success: false, message: "Please enter a valid amount." };
    }
    if (user.balance < amount) {
      setInsufficientBalanceOpen(true);
      return { success: false, message: "INSUFFICIENT_BALANCE" };
    }

    const investment = activeInvestments.find(inv => inv.id === investmentId);
    if (!investment) {
      return { success: false, message: "Investment not found." };
    }
    if (investment.status === "Completed" || investment.status === "completed" || investment.payoutTransactionId) {
      return { success: false, message: "Completed investments cannot be topped up." };
    }

    const topUpAmount = +amount.toFixed(2);
    const topUpEventId = `topup:${investmentId}:${topUpAmount}:${Date.now()}`;
    const actionKey = `topup:${investmentId}:${topUpAmount}`;
    const reservation = tryReserveBalanceDebit(actionKey, topUpAmount);
    if (reservation === "duplicate") {
      return { success: false, message: "This top-up is already being processed." };
    }
    if (reservation === "insufficient") {
      setInsufficientBalanceOpen(true);
      return { success: false, message: "INSUFFICIENT_BALANCE" };
    }

    try {
      await topUpInvestmentRpc(investmentId, topUpAmount);
      await refetchCurrentUserProfile();
      releaseBalanceDebit(actionKey, topUpAmount);
    } catch (error) {
      releaseBalanceDebit(actionKey, topUpAmount);
      console.error("Failed to top up investment:", error);
      return { success: false, message: financialActionError(error, "Failed to process top-up. Please try again.") };
    }

    handleLog("Investment Topped Up", `Added $${topUpAmount} to ${investment.name}.`, user.email, "success");
    addNotification(`Added $${topUpAmount} to your ${investment.name} investment.`, { title: "Investment topped up", type: "success", eventKey: topUpEventId });
    dispatchTransactionalEmail(user.email, "TOPUP_SUCCESS", topUpEventId, { name: user.name, investmentName: investment.name, amount: topUpAmount, transactionId: investmentId, status: "completed" });
    toast.success("Investment top-up completed successfully");
    return { success: true, message: "Top-up completed successfully." };
  };

  const copyTrader = async (traderId: string, amount: number): Promise<{ success: boolean; message: string }> => {
    if (!user.isLoggedIn || !user.email) {
      return { success: false, message: "AUTH_REQUIRED" };
    }
    if (!currentSupabaseUserId) {
      return { success: false, message: "Your session is still loading. Please wait a moment and try again." };
    }
    const accessError = await getFinancialAccessError(supabase, currentSupabaseUserId);
    if (accessError) return { success: false, message: accessError };

    const copyAmount = Number(amount);
    if (!Number.isFinite(copyAmount) || copyAmount <= 0 || Math.abs(copyAmount * 100 - Math.round(copyAmount * 100)) > 0.000001) {
      return { success: false, message: "Please enter a valid amount." };
    }

    const t = traders.find(tr => tr.id === traderId);
    if (!t) return { success: false, message: "Trader not recognized on system node." };
    if ((t.active ?? true) === false) {
      return { success: false, message: "This trader is not accepting copy allocations right now." };
    }

    const minCopyAmount = typeof t.minimumCopyAmount === "number" && Number.isFinite(t.minimumCopyAmount) && t.minimumCopyAmount > 0 ? t.minimumCopyAmount : 0.01;
    // Treat 0 / null / undefined as "no maximum" — admin may leave it blank
    const maxCopyAmount = typeof t.maximumCopyAmount === "number" && Number.isFinite(t.maximumCopyAmount) && t.maximumCopyAmount > 0 ? t.maximumCopyAmount : Number.POSITIVE_INFINITY;

    if (copyAmount < minCopyAmount) {
      return { success: false, message: `Minimum copy amount for ${t.name} is $${minCopyAmount.toLocaleString()}.` };
    }
    if (copyAmount > maxCopyAmount) {
      return { success: false, message: `Maximum copy amount for ${t.name} is $${maxCopyAmount.toLocaleString()}.` };
    }
    if (user.balance < copyAmount) {
      setInsufficientBalanceOpen(true);
      return { success: false, message: "INSUFFICIENT_BALANCE" };
    }

    if (copyTrades.some(trade => trade.traderId === traderId && trade.status !== "Cancelled" && !trade.payoutCompleted && !trade.payoutTransactionId)) {
      return { success: false, message: `You are already copying ${t.name}.` };
    }

    const actionKey = `copy:${traderId}:${copyAmount}`;
    const reservation = tryReserveBalanceDebit(actionKey, copyAmount);
    if (reservation === "duplicate") {
      return { success: false, message: "This copy trade request is already being processed." };
    }
    if (reservation === "insufficient") {
      setInsufficientBalanceOpen(true);
      return { success: false, message: "INSUFFICIENT_BALANCE" };
    }

    let newCopyTrade;
    try {
      newCopyTrade = await startCopyTrade(t, copyAmount);
      await refetchCurrentUserProfile();
      releaseBalanceDebit(actionKey, copyAmount);
    } catch (error: any) {
      releaseBalanceDebit(actionKey, copyAmount);
      console.error("Failed to start copy trade:", error);
      const errMsg: string = error?.message || error?.error_description || "";
      if (errMsg.toLowerCase().includes("insufficient balance")) {
        setInsufficientBalanceOpen(true);
        return { success: false, message: "INSUFFICIENT_BALANCE" };
      }
      if (errMsg.toLowerCase().includes("below minimum")) {
        return { success: false, message: `Minimum copy amount for ${t.name} is $${(t.minimumCopyAmount ?? 10).toLocaleString()}.` };
      }
      if (errMsg.toLowerCase().includes("above maximum")) {
        const displayMax = maxCopyAmount !== Number.POSITIVE_INFINITY ? `$${maxCopyAmount.toLocaleString()}` : "the trader's limit";
        return { success: false, message: `Maximum copy amount for ${t.name} is ${displayMax}.` };
      }
      if (errMsg.toLowerCase().includes("not accepting")) {
        return { success: false, message: "This trader is not currently accepting copy allocations." };
      }
      if (errMsg.toLowerCase().includes("not found")) {
        return { success: false, message: "Trader not found. Please refresh the page and try again." };
      }
      const userFriendlyMsg = financialActionError(error, "Failed to start copy trade. Please try again.");
      return { success: false, message: userFriendlyMsg };
    }

    handleLog("Copy allocation started", `Allocated $${copyAmount} to copy ${t.name}.`, user.email, "success");
    addNotification(`Copy allocation with ${t.name} confirmed. View its saved terms in your portfolio.`, { title: "Copy trade started", type: "success", eventKey: `copy:started:${newCopyTrade.id}` });
    dispatchTransactionalEmail(user.email, "COPY_TRADE_STARTED", `copy:started:${newCopyTrade.id}`, { name: user.name, traderName: t.name, amount: copyAmount, allocation: copyAmount });
    return { success: true, message: "Copy Trading Activated. You are now copying this trader." };
  };

  const uncopyTrader = async (copyTradeId: string): Promise<{ success: boolean; message: string }> => {
    if (!user.isLoggedIn || !user.email) {
       return { success: false, message: "Authentication required." };
    }

    const accessError = await getFinancialAccessError(supabase, currentSupabaseUserId);
    if (accessError) return { success: false, message: accessError };

    const activeTrade = copyTrades.find(trade => trade.id === copyTradeId && trade.status === "Running" && !trade.payoutCompleted);
    if (!activeTrade) {
      return { success: false, message: "No running copy trade found for this trader." };
    }

    if (Date.parse(activeTrade.endTimestamp) <= Date.now()) return { success: false, message: "This allocation has matured. Claim its payout instead." };
    const refundAmount = activeTrade.amountInvested;

    try {
      await cancelCopyTrade(activeTrade.id);
      await refetchCurrentUserProfile();
    } catch (error) {
      console.error("Failed to cancel copy trade:", error);
      return { success: false, message: financialActionError(error, "Failed to cancel copy trade. Please try again.") };
    }

    addNotification(`Copy trading was cancelled and $${refundAmount} returned to your wallet balance.`, { title: "Copy trade cancelled", type: "warning", eventKey: `copy:cancelled:${activeTrade.id}` });
    dispatchTransactionalEmail(user.email, "COPY_TRADE_CANCELLED", `copy:cancelled:${activeTrade.id}`, { name: user.name, traderName: activeTrade.traderName, refundAmount, amount: refundAmount, transactionId: activeTrade.id, status: "cancelled" });

    return { success: true, message: "Copy Trading Deactivated. Your funds have been released." };
  };

  const claimCopyTradePayout = async (copyTradeId: string) => {
    const accessError = await getFinancialAccessError(supabase, currentSupabaseUserId);
    if (accessError) { toast.error(accessError); return { success: false, message: accessError }; }
    const item = copyTrades.find(trade => trade.id === copyTradeId);
    if (!item) return { success: false, message: "Position not found. Refresh your positions." };
    if (item.payoutTransactionId || item.payoutCompleted) return { success: true, message: "This position has already been settled." };
    const claimKey = `copy:${copyTradeId}`;
    if (pendingClaims.current.has(claimKey)) return { success: false, message: "This payout is already being processed." };
    pendingClaims.current.add(claimKey);

    try {
      await claimCopyTradePayoutRpc(copyTradeId);
      await refetchCurrentUserProfile();
      handleLog("Copy Trade Payout Claimed", `Claimed payout for copy trade with ${item.traderName}.`, user.email || "system", "success");
      addNotification(`Your copy trade with ${item.traderName} matured — payout credited to your balance.`, { title: "Copy trade completed", type: "success", eventKey: `copy:payout:${copyTradeId}`, action: { label: "View copy trading", view: "copy-trading" } });
      dispatchTransactionalEmail(user.email, "COPY_TRADE_COMPLETED", `copy:completed:${copyTradeId}`, {
        name: user.name,
        traderName: item.traderName,
        amount: item.amountInvested,
        pnl: item.expectedProfit,
        total: item.totalReturn,
        transactionId: `tx-copy-pay-${copyTradeId}`
      });
      toast.success("Payout claimed successfully");
      return { success: true, message: "Payout claimed successfully" };
    } catch (error) {
      console.error("Failed to claim copy trade payout:", error);
      const message = financialActionError(error, "Failed to claim payout. Please try again.");
      toast.error(message);
      return { success: false, message };
    } finally { pendingClaims.current.delete(claimKey); }
  };

  const executeTrade = async (
    symbol: string,
    name: string,
    type: "buy" | "sell",
    amount: number,
    price: number,
    isCrypto: boolean
  ): Promise<{ success: boolean; message: string }> => {
    if (!user.isLoggedIn || !user.email) {
      return { success: false, message: "AUTH_REQUIRED" };
    }
    const accessError = await getFinancialAccessError(supabase, currentSupabaseUserId);
    if (accessError) return { success: false, message: accessError };
    if (!Number.isFinite(amount) || Math.round(amount * 100) <= 0) {
      return { success: false, message: "Please specify a valid trade amount." };
    }

    const quantity = +(amount / price).toFixed(6);

    if (type === "buy") {
      if (user.balance < amount) {
        return { success: false, message: "INSUFFICIENT_BALANCE" };
      }

      try {
        await buyAsset(symbol, name, amount, price, quantity, isCrypto ? "crypto" : "stock");
        await refetchCurrentUserProfile();
      } catch (error) {
        console.error("Failed to execute buy order:", error);
        return { success: false, message: financialActionError(error, "Failed to execute trade. Please try again.") };
      }

      handleLog("Market Order Fulfilled", `Purchased $${amount} of ${symbol} at $${price}`, user.email, "success");
      addNotification(`Market Buy Executed: ${quantity} ${symbol.split("/")[0]} filled.`);
      dispatchTransactionalEmail(user.email, "TRADE_EXECUTED", `trade:buy:${symbol}:${Date.now()}`, {
        name: user.name,
        side: "Buy",
        pair: symbol,
        amount,
        entryPrice: price,
        price,
        status: "completed"
      });
      toast.success("Trade executed successfully");

      return { success: true, message: `Market Buy Order completed successfully.` };

    } else {
      const holding = portfolio.find(p => p.symbol === symbol);
      if (!holding || holding.amount <= 0) {
        return { success: false, message: "You do not own any active holdings in this asset." };
      }
      if (holding.amount < quantity) {
        return { success: false, message: `Insufficient assets. You own ${holding.amount} units, but this sale requires ${quantity} units.` };
      }

      try {
        await sellAsset(symbol, amount, price, quantity);
        await refetchCurrentUserProfile();
      } catch (error) {
        console.error("Failed to execute sell order:", error);
        return { success: false, message: financialActionError(error, "Failed to execute trade. Please try again.") };
      }

      handleLog("Market Sale Settled", `Liquidated ${quantity} ${symbol.split("/")[0]} for $${amount}`, user.email, "success");
      addNotification(`Market Sell Executed: ${quantity} ${symbol.split("/")[0]} discharged.`);
      dispatchTransactionalEmail(user.email, "TRADE_EXECUTED", `trade:sell:${symbol}:${Date.now()}`, {
        name: user.name,
        side: "Sell",
        pair: symbol,
        amount,
        entryPrice: price,
        price,
        status: "completed"
      });
      toast.success("Trade executed successfully");
      return { success: true, message: `Market Sell Order completed successfully.` };
    }
  };

  const createTicket = async (
    subject: string,
    category: "deposit" | "withdrawal" | "trading" | "general",
    initialMsg: string,
    priority: "low" | "medium" | "high" = "medium"
  ) => {
    try {
      const ticketId = await createTicketInDb(subject, category, initialMsg, priority);
      handleLog("Support Ticket Created", `Submitted ticket regarding topic: ${subject}`, user.email || "guest@gmail.com", "success");
      dispatchTransactionalEmail(user.email, "SUPPORT_TICKET_CREATED", `ticket:created:${ticketId}`, { name: user.name, subject, category, reference: ticketId, status: "open" });

      return ticketId;
    } catch (error) {
      console.error("Failed to create support ticket:", error);
      throw error;
    }
  };

  const replyToTicket = async (ticketId: string, text: string) => {
    try {
      await replyToTicketInDb(ticketId, text);
      // Notify the support desk (the single configured support inbox) that the
      // user posted a reply — the "other direction" of ticket correspondence.
      const supportInbox = appSettings.supportEmail;
      if (supportInbox) {
        const ticket = user.tickets.find(t => t.id === ticketId);
        dispatchTransactionalEmail(supportInbox, "SUPPORT_TICKET_REPLY", `ticket:userreply:${ticketId}:${Date.now()}`, { name: "Support Team", subject: ticket?.subject || `Ticket ${ticketId}`, reference: ticketId, replyPreview: `${user.email || "A user"} replied: ${text.slice(0, 120)}` });
      }
    } catch (error) {
      console.error("Failed to reply to support ticket:", error);
      throw error;
    }
  };

  // Helper logger
  const handleLog = (action: string, details: string, email: string, logStatus: "success" | "warning" | "alert") => {
    const auditLog = buildAuditLog(action, details, email, logStatus);
    setAdminAuditLogs(prev => [auditLog, ...prev]);
  };

  const syncNotificationLocally = (notification: NotificationItem) => {
    setNotifications(prev => {
      if (notification.eventKey && prev.some(item => item.eventKey === notification.eventKey && item.recipientEmail === notification.recipientEmail)) {
        return prev;
      }
      if (prev.some(item => item.id === notification.id)) return prev;
      return sortNotifications([notification, ...prev]);
    });
  };

  const shouldShowNotificationLocally = (notification: NotificationItem) => {
    if (!notification.recipientEmail) return true;
    return user.email?.toLowerCase() === notification.recipientEmail.toLowerCase();
  };

  const addNotification = (text: string, options: BuildNotificationOptions = {}) => {
    const recipientEmail = options.recipientEmail || user.email || undefined;
    const notification = buildNotification(text, {
      ...options,
      recipientEmail,
      audience: options.audience || (user.role === "admin" ? "admin" : "user")
    });

    if (shouldShowNotificationLocally(notification)) {
      syncNotificationLocally(notification);
    }

    // Only persist once Clerk has loaded (currentSupabaseUserId set) — otherwise
    // the Supabase client can't attach a token yet and the write 401s (bug #26).
    // The local/optimistic notification above still shows regardless.
    if (!USE_MOCK_DATA && notification.recipientEmail && currentSupabaseUserId) {
      saveNotificationToDb(notification).catch(error => {
        console.error("Error saving notification:", error);
      });
    }
  };

  // Catalog permissions come from the verified database role.
  const { traders, tradersError, tradersLoading, refreshTraders, adminCreateTrader, adminUpdateTrader, adminDeleteTrader } = useTraders(
    supabase,
    authReady,
    currentUserIsAdmin,
    addNotification,
    loadPublicCatalogs
  );
  const {
    adminAnnouncements,
    userAnnouncements,
    createAnnouncement,
    updateAnnouncement,
    deleteAnnouncement
  } = useAnnouncements(supabase, authReady, currentUserIsLoggedIn, currentUserIsAdmin);
  const {
    depositWallets,
    enabledDepositWallets,
    adminWallets,
    saveDepositWallet,
    deleteDepositWallet
  } = useDepositWallets(supabase, authReady, currentUserIsLoggedIn);
  const {
    airdrops,
    createAirdropCampaign,
    updateAirdropCampaign,
    deleteAirdropCampaign
  } = useAirdrops(supabase, authReady, currentUserIsLoggedIn);
  const {
    walletFeedback,
    submitWalletFeedback: submitWalletFeedbackToDb,
    adminUpdateWalletFeedback: updateWalletFeedbackInDb,
    adminDeleteWalletFeedback: deleteWalletFeedbackFromDb
  } = useWalletFeedback(supabase, authReady, currentUserIsLoggedIn, currentUserIsAdmin);
  const {
    usersDirectory,
    isLoadingDirectory: isLoadingUsersDirectory,
    refreshUsersDirectory
  } = useUsersDirectory(supabase, authReady, currentUserIsAdmin);
  const {
    transactions: supabaseTransactions,
    refreshTransactions,
    createDepositTransaction,
    createWithdrawalTransaction,
    approveDeposit: approveDepositTx,
    rejectDeposit: rejectDepositTx,
    approveWithdrawal: approveWithdrawalTx,
    rejectWithdrawal: rejectWithdrawalTx
  } = useTransactions(supabase, authReady, currentSupabaseUserId, currentUserIsAdmin);
  const {
    myKyc,
    kycLoading,
    kycError,
    refreshKyc,
    allKycSubmissions,
    submitMyKyc,
    adminReviewKycByEmail
  } = useKyc(supabase, authReady, currentSupabaseUserId, currentUserIsAdmin);
  useEffect(() => {
    setUser(prev => ({ ...prev, kyc: myKyc || undefined }));
  }, [myKyc]);
  const {
    investmentsError, adminInvestmentsError, investmentsLoading, adminInvestmentsLoading,
    activeInvestments,
    adminActiveInvestments,
    purchaseInvestment,
    claimInvestmentPayout,
    topUpInvestmentRpc,
    refreshActiveInvestments,
    refreshAdminActiveInvestments
  } = useActiveInvestments(supabase, authReady, currentSupabaseUserId, currentUserIsAdmin);
  const { portfolio, portfolioError, portfolioLoading, refreshPortfolio, buyAsset, sellAsset } = usePortfolio(supabase, authReady, currentSupabaseUserId);
  const {
    copyTradesError, adminCopyTradesError, copyTradesLoading, adminCopyTradesLoading,
    copyTrades,
    adminCopyTrades,
    startCopyTrade,
    cancelCopyTrade,
    claimCopyTradePayout: claimCopyTradePayoutRpc,
    refreshCopyTrades,
    refreshAdminCopyTrades
  } = useCopyTrades(supabase, authReady, currentSupabaseUserId, currentUserIsAdmin);
  const {
    myTickets: supabaseTickets,
    allTickets: supportTickets,
    supportError, supportLoading, refreshSupport,
    createTicket: createTicketInDb,
    replyToTicket: replyToTicketInDb,
    replyToTicketAsSupport,
    closeTicket: closeTicketInDb,
    setTicketPriority: setTicketPriorityInDb
  } = useSupportTickets(supabase, authReady, currentSupabaseUserId, currentUserIsAdmin);
  const {
    claims: adminAirdropClaims,
    submitClaim: submitAirdropClaimInDb,
    approveClaim: approveAirdropClaimInDb,
    rejectClaim: rejectAirdropClaimInDb
  } = useAirdropClaims(supabase, authReady, currentSupabaseUserId, currentUserIsAdmin);

  // Keep portfolio and copy trades in sync with their Supabase source.
  //
  // NOTE: every one of these overlay effects depends on `user.isLoggedIn` as
  // well as its hook data. The data hooks (gated on authReady + userId) can
  // resolve and fire this effect BEFORE the profile-loader sets isLoggedIn
  // true — e.g. right after a refresh, when Clerk briefly reports "loaded but
  // signed out" and authReady is flipped true early (see the signed-out branch
  // of the profile-loader). Without isLoggedIn in the deps, that early fire
  // hits the `prev.isLoggedIn ? … : prev` guard as a no-op and never re-runs
  // (the hook data reference doesn't change again), stranding the fetched data
  // and leaving the whole dashboard empty. Re-running when isLoggedIn flips
  // true re-applies the already-fetched data.
  useEffect(() => {
    const marked = markPortfolio(portfolio, [...marketCrypto, ...marketStocks]);
    setUser(prev => prev.isLoggedIn ? { ...prev, ...marked } : prev);
  }, [portfolio, marketCrypto, marketStocks, user.isLoggedIn]);

  // A slow clock (60s) so investment & copy-trade progress/countdown keep
  // advancing during a long-open session without a refetch. 60s is far below
  // the churn threshold that caused bug #14 (that was a ~2s market tick).
  const [liveClock, setLiveClock] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setLiveClock(Date.now()), 60000);
    return () => clearInterval(id);
  }, []);

  // Copy trades: derive the time-varying fields (progress, remainingDays,
  // status) LIVE from start_timestamp/end_timestamp/now via
  // syncCopyTradeCountdowns — same frozen-stored-columns issue as investments
  // (bug #17). Money fields (amountInvested, roiPercent, expectedProfit,
  // totalReturn) are preserved as-is; this only re-derives display values.
  useEffect(() => {
    const derived = syncCopyTradeCountdowns(copyTrades, Date.now());
    setUser(prev => prev.isLoggedIn ? { ...prev, copyTrades: derived } : prev);
  }, [copyTrades, liveClock, user.isLoggedIn]);

  // Keep support tickets in sync with their Supabase source.
  useEffect(() => {
    setUser(prev => prev.isLoggedIn ? { ...prev, tickets: supabaseTickets } : prev);
  }, [supabaseTickets, user.isLoggedIn]);

  // Keep the signed-in user's own transaction history in sync with Supabase.
  // supabaseTransactions holds every user's rows when the caller is an admin
  // (see useTransactions), so this must filter down to just the caller's own
  // — otherwise an admin's personal wallet page would show everyone's
  // transactions merged together.
  useEffect(() => {
    setUser(prev => prev.isLoggedIn
      ? { ...prev, transactions: supabaseTransactions.filter(t => t.userId === currentSupabaseUserId) }
      : prev);
  }, [supabaseTransactions, currentSupabaseUserId, user.isLoggedIn]);

  // Keep the displayed balance in sync with Supabase — without this,
  // user.balance only ever reflects whatever it was at login (a one-time
  // Firestore snapshot), and would silently go stale after every deposit,
  // withdrawal, or investment even though the database itself is correct.
  useEffect(() => {
    if (currentUserProfile?.id === currentSupabaseUserId) {
      setUser(prev => prev.isLoggedIn ? { ...prev, balance: currentUserProfile.balance } : prev);
    }
  }, [currentUserProfile?.id, currentUserProfile?.balance, currentSupabaseUserId, user.isLoggedIn]);

  // Keep active investments in sync with their Supabase source — and derive the
  // time-varying fields (progress, accumulatedProfit, remainingDays, status)
  // LIVE from start_date/end_date/now via syncInvestmentCountdowns. The DB
  // stores those columns once at creation and never recomputes them (bug #17),
  // so without this they sit frozen at 0%/$0/full-duration. The stored money
  // fields (amount, roiPercent, expectedProfit, totalReturn) are the source of
  // truth and are preserved as-is — this only re-derives the display values.
  useEffect(() => {
    const derived = syncInvestmentCountdowns(activeInvestments, plans, Date.now());
    setUser(prev => prev.isLoggedIn ? { ...prev, activeInvestments: derived } : prev);
  }, [activeInvestments, plans, liveClock, user.isLoggedIn]);

  const notifyAdmins = (text: string, options: BuildNotificationOptions = {}) => {
    const adminEmails = Array.from(new Set([
      ...usersDirectory
        .filter(profile => profile.role === "admin")
        .map(profile => profile.email),
      user.role === "admin" && user.email ? user.email : DEFAULT_ADMIN_NOTIFICATION_EMAIL
    ].filter(Boolean) as string[]));

    adminEmails.forEach(adminEmail => {
      addNotification(text, {
        ...options,
        recipientEmail: adminEmail,
        audience: "admin",
        eventKey: options.eventKey ? `admin:${adminEmail}:${options.eventKey}` : undefined
      });
    });
  };

  const markNotificationRead = async (notificationId: string) => {
    setNotifications(prev => prev.map(item => item.id === notificationId ? { ...item, read: true } : item));
    if (!USE_MOCK_DATA) {
      await markReadInDb(notificationId);
    }
  };

  const markAllNotificationsRead = async () => {
    const unreadIds = notifications.filter(item => !item.read).map(item => item.id);
    if (!unreadIds.length) return;
    setNotifications(prev => prev.map(item => ({ ...item, read: true })));
    if (!USE_MOCK_DATA) {
      await markManyReadInDb(unreadIds);
    }
  };

  const deleteNotification = async (notificationId: string) => {
    setNotifications(prev => prev.filter(item => item.id !== notificationId));
    if (!USE_MOCK_DATA) {
      await deleteNotificationInDb(notificationId);
    }
  };

  const clearNotifications = () => {
    setNotifications([]);
  };

  // ADMINISTRATIVE MASTER CONTROLS
  // NOTE: adminWallets is now derived from depositWallets (via useDepositWallets),
  // not its own settable state — use adminSaveDepositWallet/adminDeleteDepositWallet
  // to actually change wallet data. This function appears unused elsewhere in the
  // app; kept as a no-op for interface compatibility rather than removed outright.
  const updateAdminWallets = async (wallets: Record<string, string>) => {
    console.warn("updateAdminWallets is deprecated — use adminSaveDepositWallet instead.");
  };

  const adminSaveDepositWallet = async (walletInput: DepositWallet | Omit<DepositWallet, "id">) => {
    try {
      const wallet = await saveDepositWallet(walletInput);
      handleLog("Deposit Wallet Updated", `Saved ${wallet.coinName} ${wallet.network} deposit wallet.`, user.email || "admin", "success");
      addNotification("Deposit wallet saved successfully.");
    } catch (error) {
      console.error("Failed to save deposit wallet:", error);
      throw error;
    }
  };

  const adminDeleteDepositWallet = async (walletId: string) => {
    try {
      await deleteDepositWallet(walletId);
      handleLog("Deposit Wallet Removed", `Deleted deposit wallet ${walletId}.`, user.email || "admin", "warning");
      addNotification("Deposit wallet deleted.");
    } catch (error) {
      console.error("Failed to delete deposit wallet:", error);
      throw error;
    }
  };

  const adminUpdateUserBalance = async (
    email: string,
    amount: number,
    txData?: {
      type: "credit" | "debit";
      amount: number;
      label: string;
      notes: string;
    }
  ) => {
    const targetProfile = usersDirectory.find(item => item.email.toLowerCase() === email.toLowerCase());
    if (!targetProfile) throw new Error(`No Supabase user found for ${email}.`);

    try {
      const { error } = await supabase.rpc("admin_update_user_balance", {
        p_user_id: targetProfile.id,
        p_new_balance: amount,
        p_label: txData?.label || "Admin Balance Edit",
        p_notes: txData?.notes || ""
      });
      if (error) throw error;

      // Trigger email notification if label matches, same as before.
      if (txData?.label === "Deposit Successful") {
        dispatchTransactionalEmail(email, "DEPOSIT_APPROVED", `deposit:admin-balance:${targetProfile.id}:${Date.now()}`, {
          name: targetProfile.name || email,
          amount: txData.amount,
          asset: "USD",
          txHash: "",
          transactionId: "",
          status: "approved"
        });
      }

      // Refresh the admin's own view of the directory + ledger immediately.
      await Promise.all([refreshUsersDirectory(), refreshTransactions()]);

      // If the admin edited their own balance, refresh their live session too.
      if (currentSupabaseUserId === targetProfile.id) {
        await refetchCurrentUserProfile();
      }

      handleLog("Ledger Balances Adjusted", `Overrode balance of ${email} to $${amount}.`, user.email || "admin", "alert");
      addNotification(`Account [${email.split("@")[0].toUpperCase()}] balance updated by node admin.`);
    } catch (e) {
      console.error("Error updating user balance via Supabase:", e);
      throw e;
    }
  };

  const adminChangeUserStatus = async (email: string, statusText: "active" | "suspended" | "banned") => {
    if (!currentUserIsAdmin || !currentSupabaseUserId) throw new Error("Only an administrator can change account status.");
    const targetProfile = usersDirectory.find(item => item.email.toLowerCase() === email.toLowerCase());
    if (!targetProfile) throw new Error(`No user record found for ${email}.`);
    const actionKey = `account-status:${targetProfile.id}`;
    if (pendingActionKeysRef.current.has(actionKey)) throw new Error("An account status change is already in progress.");
    pendingActionKeysRef.current.add(actionKey);
    try {
      const result = await changeAccountStatus(supabase, targetProfile, statusText, {
        saveNotification: async notification => {
          await saveNotificationToDb(notification);
          if (shouldShowNotificationLocally(notification)) syncNotificationLocally(notification);
        },
        sendSuspensionEmail: (to, metadata) => sendTransactionalEmail(to, "ACCOUNT_SUSPENDED", {
          ...emailSettingsMetadata(), ...metadata
        })
      });
      if (user.email && user.email.toLowerCase() === email.toLowerCase()) {
        setUser(prev => ({ ...prev, status: statusText }));
      }
      await Promise.all([refreshUsersDirectory(), refreshAdminActiveInvestments(), refreshAdminCopyTrades()]);
      if (result.changed) {
        handleLog("User Access Permissions Changed", `Changed status of ${email} to ${statusText}.`, user.email || "admin", "alert");
        addNotification(`Account [${email}] set to ${statusText}.`);
      }
      if (result.failedDeliveries.length) {
        throw new Error(`Account is ${statusText}, but delivery failed for: ${result.failedDeliveries.join(" and ")}.`);
      }
    } finally {
      pendingActionKeysRef.current.delete(actionKey);
    }
  };

  const adminDeleteUser = async (userIdOrEmail: string) => {
    try {
      const targetUser = usersDirectory.find(item => item.id === userIdOrEmail || item.email.toLowerCase() === userIdOrEmail.toLowerCase());
      if (!targetUser) throw new Error(`User not found: ${userIdOrEmail}`);

      const { error } = await supabase.from("users").delete().eq("id", targetUser.id);
      if (error) console.error("Failed to delete user from Supabase:", error);

      await refreshUsersDirectory();
      handleLog("User Account Terminated", `Permanently removed user account: ${targetUser.email}.`, user.email || "admin", "alert");
      addNotification(`User account [${targetUser.email}] has been permanently removed.`);
    } catch (e) {
      console.error("Error deleting user:", e);
      toast.error("Failed to delete user account.");
      throw e;
    }
  };

  const adminResetUserPassword = async (email: string) => {
    // Actually deliver a working reset code now: the 6-digit code is generated
    // and verified server-side (/api/auth-codes) and emailed via Resend. The
    // recipient completes the reset through "Forgot Password?" on the login
    // page — entering the code sets their new password server-side.
    const targetName = usersDirectory.find(
      item => item.email.toLowerCase() === email.toLowerCase()
    )?.name;
    const result = await issueAuthCode(email.trim().toLowerCase(), "password_reset", {
      name: targetName,
    });
    if (!result.success) {
      toast.error(result.error || "Failed to send the password reset code.");
      throw new Error(result.error || "Failed to send the password reset code.");
    }
    handleLog("Password Core Reset", `Dispatched verification security reset token to ${email}.`, user.email || "admin", "success");
    addNotification(`Sent reset token dispatch to ${email}.`);
  };

  const adminKycReview = async (email: string, status: "approved" | "rejected", reason?: string, revision?: number): Promise<void> => {
    try {
      const targetProfile = usersDirectory.find(item => item.email.toLowerCase() === email.toLowerCase());
      if (!targetProfile?.id) throw new Error(`No Supabase user record found for ${email}.`);
      const notes = reason || (status === "approved" ? "Verified by admin." : "Documents not sufficient.");

      const reviewedKyc = await adminReviewKycByEmail(email, targetProfile.id, status, notes, revision ?? allKycSubmissions[email]?.revision);

      if (user.email && user.email.toLowerCase() === email.toLowerCase()) {
        setUser(prev => ({ ...prev, kyc: reviewedKyc }));
      }
      handleLog("KYC Verification Result", `Verification team reviewed KYC for ${email}. Result: ${status}.`, user.email || "system", status === "approved" ? "success" : "alert");
      addNotification(`KYC verification for ${email} marked as ${status}.`, { title: `KYC ${status}`, type: status === "approved" ? "success" : "warning", eventKey: `admin:kyc:${status}:${email}` });
      addNotification(status === "approved" ? "Your KYC verification was approved." : "Your KYC verification was rejected. Please review the notes and resubmit.", { title: status === "approved" ? "KYC approved" : "KYC rejected", type: status === "approved" ? "success" : "error", recipientEmail: email, eventKey: `kyc:${status}:${email}:${reviewedKyc.reviewedAt || reviewedKyc.submissionDate}`, action: { label: "View KYC", view: "dashboard-kyc" } });
      dispatchTransactionalEmail(email, status === "approved" ? "KYC_APPROVED" : "KYC_REJECTED", `kyc:${status}:${email}:${reviewedKyc.reviewedAt || reviewedKyc.submissionDate}`, { name: targetProfile?.name || email.split("@")[0], documentType: reviewedKyc.documentType || reviewedKyc.idType, reason: reviewedKyc.rejectionReason || reason, status });
    } catch (e) {
      toast.error("Failed to update KYC review");
      throw e;
    }
  };

  const submitKyc = async (kyc: KycSubmission): Promise<void> => {
    if (!user.email) throw new Error("You must be signed in to submit KYC.");
    if (!currentSupabaseUserId) throw new Error("You must be signed in to submit KYC.");
    try {
      const submission = await submitMyKyc(currentSupabaseUserId, kyc);

      // useKyc owns the session-scoped KYC state and synchronizes it above.
      addNotification("Your KYC submission has been received and is being reviewed.", { title: "KYC submitted", type: "info", eventKey: `kyc:submitted:${submission.submissionDate || user.email}`, action: { label: "View KYC", view: "dashboard-kyc" } });
      dispatchTransactionalEmail(user.email, "KYC_SUBMITTED", `kyc:submitted:${submission.submissionDate || user.email}`, { name: user.name, documentType: submission.documentType || submission.idType, status: "pending" });
      notifyAdmins(`${user.email} submitted KYC documents for review.`, { title: "KYC requires review", type: "warning", eventKey: `kyc:review:${user.email}:${submission.submissionDate || submission.idNumber}`, action: { label: "Review KYC", view: "dashboard-admin" } });
      toast.success("KYC documents submitted for review");
    } catch (e) {
      toast.error("Failed to submit KYC documents");
      throw e;
    }
  };

  const saveWalletConnection = async (walletName?: string) => {
    if (!user.email) return;
    try {
      if (currentSupabaseUserId) {
        const { error } = await supabase
          .from("users")
          .update({ connected_wallet_name: walletName || "" })
          .eq("id", currentSupabaseUserId);
        if (error) console.error("Failed to sync wallet connection to Supabase:", error);
      }

      setUser(prev => ({ ...prev, connectedWalletName: walletName || "" }));
      addNotification("Wallet connection preference saved.");
    } catch (e) {
      console.error("Error saving wallet connection preference:", e);
    }
  };

  const assertAdminPermission = () => {
    if (!user.isLoggedIn || (user.role !== "admin" && user.isAdmin !== true)) {
      throw new Error("Platform permission is required to manage investment plans.");
    }
  };

  const adminCreatePlan = async (newPlan: Omit<InvestmentPlan, "id">) => {
    assertAdminPermission();

    try {
      const freshPlan = await createInvestmentPlanInDb(newPlan);
      handleLog("Yield Protocol Registered", `Added new Plan: ${newPlan.name} ROI ${newPlan.roiPercent}%`, user.email || "admin", "success");
      addNotification(`Created investment portfolio: ${freshPlan.name}`);
    } catch (error) {
      console.error("Failed to create investment plan:", error);
      throw error;
    }
  };

  const adminUpdatePlan = async (updated: InvestmentPlan) => {
    assertAdminPermission();

    try {
      await saveInvestmentPlanInDb(updated);
      handleLog("Yield Protocol Edited", `Modified configurations of ${updated.name}.`, user.email || "admin", "warning");
      addNotification(`Parameters altered on ${updated.name}`);
    } catch (error) {
      console.error("Failed to update investment plan:", error);
      throw error;
    }
  };

  const adminDeletePlan = async (planId: string) => {
    assertAdminPermission();

    try {
      await deleteInvestmentPlanInDb(planId);
      handleLog("Yield Protocol Deleted", `Terminated plan index code: ${planId}`, user.email || "admin", "alert");
    } catch (error) {
      console.error("Failed to delete investment plan:", error);
      throw error;
    }
  };

  const adminSetPlanStatus = async (planId: string, statusValue: "active" | "paused") => {
    assertAdminPermission();

    try {
      await setInvestmentPlanEnabledInDb(planId, statusValue === "active");
      handleLog("Compounding Interval Status Shift", `Switched plan ${planId} status to ${statusValue}`, user.email || "admin", "warning");
    } catch (error) {
      console.error("Failed to update investment plan status:", error);
      throw error;
    }
  };

  const adminApproveDeposit = async (txId: string, noteText: string = "Deposit verified by admin.") => {
    const matchingTx = supabaseTransactions.find(t => t.id === txId);
    if (!matchingTx || matchingTx.status !== "pending") return false;

    try {
      await approveDepositTx(txId, noteText);
      await refetchCurrentUserProfile();
      handleLog("Manual Deposit Confirmed", `Approved deposit ID: ${txId} worth ${matchingTx.amount} ${matchingTx.asset}`, user.email || "admin", "success");
      addNotification(`Approved incoming deposit of ${matchingTx.amount} for ${matchingTx.userName || matchingTx.userEmail}.`, { title: "Deposit approved", type: "success", eventKey: `admin:deposit:approved:${txId}` });
      addNotification(`Your ${matchingTx.asset} deposit of ${matchingTx.amount} was approved.`, { title: "Deposit approved", type: "success", recipientEmail: matchingTx.userEmail, eventKey: `deposit:approved:${txId}`, action: { label: "View wallet", view: "dashboard-wallet" } });
      dispatchTransactionalEmail(matchingTx.userEmail, "DEPOSIT_APPROVED", `deposit:approved:${txId}`, {
        name: matchingTx.userName,
        amount: matchingTx.amount,
        asset: matchingTx.asset,
        txHash: matchingTx.txHash || txId,
        transactionId: txId,
        status: "approved"
      });
      return true;
    } catch (e) {
      console.error("Error approving deposit:", e);
      toast.error("Failed to approve deposit.");
      return false;
    }
  };

  const adminRejectDeposit = async (txId: string, noteText: string = "Payment proof verification unsuccessful.") => {
    const matchingTx = supabaseTransactions.find(t => t.id === txId);
    if (!matchingTx || matchingTx.status !== "pending") return false;

    try {
      await rejectDepositTx(txId, noteText);
      handleLog("Manual Deposit Rejected", `Rejected deposit ID: ${txId}. Reason: ${noteText}`, user.email || "admin", "alert");
      addNotification(`Rejected proof on deposit ${txId}. Dispatched alert log.`, { title: "Deposit rejected", type: "warning", eventKey: `admin:deposit:rejected:${txId}` });
      addNotification(`Your deposit ${txId} was rejected. ${noteText}`, { title: "Deposit rejected", type: "error", recipientEmail: matchingTx.userEmail, eventKey: `deposit:rejected:${txId}`, action: { label: "View wallet", view: "dashboard-wallet" } });
      dispatchTransactionalEmail(matchingTx.userEmail, "DEPOSIT_REJECTED", `deposit:rejected:${txId}`, { name: matchingTx.userName, amount: matchingTx.amount, asset: matchingTx.asset, transactionId: txId, reason: noteText, status: "rejected" });
      return true;
    } catch (e) {
      console.error("Error rejecting deposit:", e);
      toast.error("Failed to reject deposit.");
      return false;
    }
  };

  // Resolve a transaction's requesting user. The denormalized user_email /
  // user_name columns can be blank on older rows — fall back to the users
  // directory by user_id so notifications, emails and admin tables never end
  // up with an empty recipient (which would silently drop the email).
  const resolveTxRecipient = (tx: Transaction): { email: string; name: string } => {
    const profile = tx.userId ? usersDirectory.find(u => u.id === tx.userId) : undefined;
    return {
      email: tx.userEmail || profile?.email || "",
      name: tx.userName || profile?.name || profile?.email || "there",
    };
  };

  const adminApproveWithdrawal = async (txId: string, noteText: string = "Processed successfully via gateway ledger.") => {
    const tx = supabaseTransactions.find(t => t.id === txId);
    if (!tx) throw new Error("Withdrawal is no longer available. Refresh the queue.");

    const recipient = resolveTxRecipient(tx);
    try {
      await approveWithdrawalTx(txId, noteText);
      handleLog("Withdrawing Dispatched", `Released payout ID: ${txId}. Notes: ${noteText}`, user.email || "admin", "success");
      addNotification(`Settled withdrawal invoice ${txId}. Funds successfully dispatched.`, { title: "Withdrawal approved", type: "success", eventKey: `admin:withdrawal:approved:${txId}` });
      addNotification(`Your withdrawal ${txId} was approved and dispatched.`, { title: "Withdrawal approved", type: "success", recipientEmail: recipient.email, eventKey: `withdrawal:approved:${txId}`, action: { label: "View wallet", view: "dashboard-wallet" } });
      dispatchTransactionalEmail(recipient.email, "WITHDRAWAL_APPROVED", `withdrawal:approved:${txId}`, {
        name: recipient.name,
        amount: tx.amount,
        asset: tx.asset,
        walletAddress: tx.address || tx.notes || "Stored Custody",
        transactionId: txId,
        status: "approved"
      });
    } catch (e) {
      console.error("Error approving withdrawal:", e);
      toast.error("Failed to approve withdrawal.");
      throw e;
    }
  };

  const adminRejectWithdrawal = async (txId: string, noteTextByAdmin: string = "Declined due to security validations.") => {
    const matched = supabaseTransactions.find(t => t.id === txId);
    if (!matched) throw new Error("Withdrawal is no longer available. Refresh the queue.");

    const recipient = resolveTxRecipient(matched);
    try {
      await rejectWithdrawalTx(txId, noteTextByAdmin);
      if (user.email && recipient.email && user.email.toLowerCase() === recipient.email.toLowerCase()) {
        await refetchCurrentUserProfile();
      }
      handleLog("Withdrawal Denied", `Security block enforced on withdrawal ID: ${txId}. Credited $${matched.amount} back to user balance. Reason: ${noteTextByAdmin}`, user.email || "admin", "alert");
      addNotification(`Withdrawal ${txId} was rejected. Funds returned to wallet.`, { title: "Withdrawal rejected", type: "warning", eventKey: `admin:withdrawal:rejected:${txId}` });
      addNotification(`Your withdrawal ${txId} was rejected and funds were returned to your wallet.`, { title: "Withdrawal rejected", type: "error", recipientEmail: recipient.email, eventKey: `withdrawal:rejected:${txId}`, action: { label: "View wallet", view: "dashboard-wallet" } });
      dispatchTransactionalEmail(recipient.email, "WITHDRAWAL_REJECTED", `withdrawal:rejected:${txId}`, { name: recipient.name, amount: matched.amount, asset: matched.asset, walletAddress: matched.address || matched.notes, transactionId: txId, reason: noteTextByAdmin, status: "rejected" });
    } catch (e) {
      console.error("Error rejecting withdrawal:", e);
      toast.error("Failed to reject withdrawal.");
      throw e;
    }
  };

  const adminCreateAnnouncement = async (announcement: Omit<Announcement, "id" | "date" | "updatedAt"> & Partial<Pick<Announcement, "id" | "date" | "updatedAt">>) => {
    const fresh = await createAnnouncement(announcement);
    handleLog("Announcement Published", `Added announcement: ${fresh.title}`, user.email || "admin", "success");
    addNotification(`Global announcement published: "${fresh.title}".`, { title: "Announcement published", type: "success", eventKey: `admin:announcement:${fresh.id}` });
    usersDirectory.filter(target => target.role !== "admin").forEach(target => {
      addNotification(fresh.content, { title: fresh.title, type: fresh.priority === "Critical" ? "warning" : "info", recipientEmail: target.email, eventKey: `announcement:${fresh.id}:${target.email}`, action: { label: "View dashboard", view: "dashboard" } });
    });
  };

  const adminUpdateAnnouncement = async (announcement: Announcement) => {
    const updated = await updateAnnouncement(announcement);
    handleLog("Announcement Updated", `Updated announcement: ${updated.title}`, user.email || "admin", "warning");
  };

  const adminDeleteAnnouncement = async (id: string) => {
    await deleteAnnouncement(id);
    handleLog("Announcement Deleted", `Removed announcement ID: ${id}`, user.email || "admin", "warning");
  };

  const markAnnouncementRead = async (announcementId: string) => {
    if (!user.email || isAnnouncementRead(announcementId, user.readAnnouncementIds)) return;

    const readAnnouncementIds = [...(user.readAnnouncementIds || []), announcementId];
    setUser(prev => ({ ...prev, readAnnouncementIds }));

    if (!USE_MOCK_DATA) {
      if (currentSupabaseUserId) {
        const { error } = await supabase
          .from("user_read_announcements")
          .upsert({ user_id: currentSupabaseUserId, announcement_id: announcementId }, { onConflict: "user_id,announcement_id" });
        if (error) console.error("Failed to sync read-announcement to Supabase:", error);
      }
    }
  };

  const adminReplyToTicket = async (ticketId: string, replyText: string) => {
    try {
      await replyToTicketAsSupport(ticketId, replyText);
      handleLog("Ticket Replied", `Dispatched help-desk payload to Ticket ID: ${ticketId}`, user.email || "admin", "success");
      const ticket = supportTickets.find(t => t.id === ticketId);
      if (ticket?.userEmail) {
        dispatchTransactionalEmail(ticket.userEmail, "SUPPORT_TICKET_REPLY", `ticket:reply:${ticketId}:${Date.now()}`, { name: ticket.userEmail.split("@")[0], subject: ticket.subject, reference: ticketId, replyPreview: replyText.slice(0, 140) });
      }
    } catch (e) {
      console.error("Error replying to ticket:", e);
      throw e;
    }
  };

  const adminCloseTicket = async (ticketId: string) => {
    try {
      await closeTicketInDb(ticketId);
      handleLog("Ticket Finalised", `Flagged Ticket ID: ${ticketId} resolved.`, user.email || "admin", "success");
    } catch (e) {
      console.error("Error closing ticket:", e);
      throw e;
    }
  };

  const adminSetTicketPriority = async (ticketId: string, rate: "low" | "medium" | "high") => {
    try {
      await setTicketPriorityInDb(ticketId, rate);
    } catch (e) {
      console.error("Error setting ticket priority:", e);
      throw e;
    }
  };

  const submitWalletFeedback = async (wallet: string, reason: string, wouldUse: boolean) => {
    if (!user.email) throw new Error("Please sign in before submitting feedback.");
    if (USE_MOCK_DATA) return;

    try {
      const result = await submitWalletFeedbackToDb(wallet, reason, wouldUse);
      toast.success("Successful");
      if (!result?.duplicate) {
        handleLog("Wallet Feedback", `User submitted feedback for ${wallet}`, user.email, "success");
      }
    } catch (e) {
      console.error("Error submitting wallet feedback:", e);
      toast.error("Failed to submit feedback");
      throw e;
    }
  };

  const adminUpdateWalletFeedback = async (id: string, status: "new" | "reviewed", adminNotes?: string) => {
    if (USE_MOCK_DATA) return;
    try {
      await updateWalletFeedbackInDb(id, status, adminNotes);
    } catch (e) {
      console.error("Error updating wallet feedback:", e);
      throw e;
    }
  };

  const adminDeleteWalletFeedback = async (id: string) => {
    if (USE_MOCK_DATA) return;
    try {
      await deleteWalletFeedbackFromDb(id);
    } catch (e) {
      console.error("Error deleting wallet feedback:", e);
      throw e;
    }
  };

  return (
    <OrbitContext.Provider value={{
      user,
      marketCrypto,
      marketStocks,
      traders,
      tradersError,
      tradersLoading,
      refreshTraders,
      plans, plansLoading, plansError,
      investmentDataError: [profileLoadError, portfolioError, plansError, tradersError, investmentsError, copyTradesError, adminInvestmentsError, adminCopyTradesError].filter(Boolean).join(" ") || null,
      investmentDataLoading: portfolioLoading || plansLoading || tradersLoading || investmentsLoading || copyTradesLoading || adminInvestmentsLoading || adminCopyTradesLoading,
      refreshInvestmentData: async () => { if (profileLoadError) setProfileReload(value => value + 1); await Promise.all([refreshPlans(), refreshTraders(), refreshPortfolio(), refreshActiveInvestments(), refreshCopyTrades(), refreshAdminActiveInvestments(), refreshAdminCopyTrades(), refetchCurrentUserProfile()]); },
      isLoadingMarkets,
      marketDataError,
      refreshMarkets: loadMarketsData,
      insufficientBalanceOpen,
      setInsufficientBalanceOpen,
      deposit,
      withdraw,
      investInPlan,
      claimPlanPayout,
      claimAirdrop,
      withdrawEarnings,
      copyTrader,
      uncopyTrader,
      claimCopyTradePayout,
      executeTrade,
      createTicket,
      replyToTicket,
      sendWelcomeNotification,

      // Administrative Exports
      usersDirectory,
      isLoadingUsersDirectory,
      refreshUsersDirectory,
      adminWallets,
      depositWallets,
      enabledDepositWallets,
      adminAnnouncements,
      userAnnouncements,
      adminAuditLogs,
      adminAirdropClaims,
      airdrops,
      notifications,
      unreadNotificationsCount,
      markNotificationRead,
      markAllNotificationsRead,
      deleteNotification,

      updateAdminWallets,
      adminSaveDepositWallet,
      adminDeleteDepositWallet,
      adminUpdateUserBalance,
      adminChangeUserStatus,
      adminDeleteUser,
      adminResetUserPassword,
      adminKycReview,

      adminCreatePlan,
      adminUpdatePlan,
      adminDeletePlan,
      adminSetPlanStatus,
      topUpInvestment,

      adminApproveDeposit,
      adminRejectDeposit,
      refreshAdminDeposits: refreshTransactions,
      adminApproveWithdrawal,
      adminRejectWithdrawal,
      adminApproveAirdrop,
      adminRejectAirdrop,
      adminCreateAirdrop,
      adminUpdateAirdrop,
      adminDeleteAirdrop,

      adminCreateAnnouncement,
      adminUpdateAnnouncement,
      adminDeleteAnnouncement,
      markAnnouncementRead,

      adminReplyToTicket,
      adminCloseTicket,
      adminSetTicketPriority,
      supportTickets,
      supportError, supportLoading, refreshSupport,
      adminTransactions: supabaseTransactions,
      adminActiveInvestments: adminActiveInvestments.map(item => ({ ...item, ...normalizeActiveInvestment(item, plans.find(plan => plan.id === item.planId), liveClock) })),
      adminCopyTrades: adminCopyTrades.map(item => ({ ...item, ...normalizeCopyTrade(item, liveClock) })),
      allKycSubmissions,
      myKyc,
      kycLoading,
      kycError,
      refreshKyc,

      addNotification,
      clearNotifications,
      submitKyc,
      saveWalletConnection,

      // Wallet Feedback
      walletFeedback,
      submitWalletFeedback,
      adminUpdateWalletFeedback,
      adminDeleteWalletFeedback,

      // Site content editing
      siteContent,
      updateSiteContent,
      appSettings,
      updateAppSettings,

      // Trader editing
      adminUpdateTrader,
      adminCreateTrader,
      adminDeleteTrader
    }}>
      {children}
    </OrbitContext.Provider>
  );
};

export const useOrbit = () => {
  const context = useContext(OrbitContext);
  if (context === undefined) {
    throw new Error("useOrbit must be used inside an OrbitProvider");
  }
  return context;
};
