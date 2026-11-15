// Audit-only transport/context fixture. The application, routes, guards, pages,
// navigation and dialogs are real. This file is never imported by production.
import React, { useSyncExternalStore } from 'react';
import { createLoggedOutUser } from '../../src/services/authService';
import { DEFAULT_APP_SETTINGS, DEFAULT_SITE_CONTENT } from '../../src/services/settingsService';
import { DEFAULT_INVESTMENT_PLANS } from '../../src/services/investmentsService';
const role = new URLSearchParams(location.search).get('role') || 'guest';
const populated = new URLSearchParams(location.search).get('data') !== 'empty';
export const owner='11111111-1111-4111-8111-111111111111';
const listeners = new Set<()=>void>(); let version=0;
export const controls={fail:false,calls:[] as string[]};
export const emit=()=>{version++;listeners.forEach(fn=>fn());};
const now=new Date().toISOString();
const image='/bloom-logo-white.svg';
const tx={id:'tx-1',userId:owner,userEmail:'test@example.com',userName:'Test User',type:'deposit',amount:100,currency:'USD',asset:'USD',status:'pending',date:now,timestamp:now};
const ticket={id:'ticket-1',userId:owner,userEmail:'test@example.com',userName:'Test User',subject:'Deposit question',category:'deposit',status:'open',priority:'medium',date:now,messages:[{sender:'user',text:'Please check my deposit.',time:now}]};
const wallet={id:'wallet-1',coinName:'USDT',network:'TRC20',walletAddress:'TTestFixtureAddress',minimumDeposit:10,enabled:true,displayOrder:0,qrCodeUrl:image};
const trader={id:'trader-1',name:'Test Trader',avatar:image,active:true,roi:10,profitDays:30,winRate:80,followers:10,maxFollowers:100,riskScore:2,assetsUnderManagement:'$1000',chartData:[1,2,3,4],minimumCopyAmount:10,maximumCopyAmount:1000};
const asset={updatedAt:new Date().toISOString(),symbol:'BTC',name:'Bitcoin',price:50000,change:2,high:51000,low:49000,volume:'1M',sparkline:[1,2,3,4]};
const investment={id:'investment-1',planId:'plan-bronze',name:'Bronze Tier',amount:100,startDate:now,endDate:new Date(Date.now()+86400000).toISOString(),roiPercent:12,expectedProfit:12,totalReturn:112,accumulatedProfit:5,progress:42,remainingDays:1,status:'Running'};
export const state:any={
 user:{...createLoggedOutUser(),isLoggedIn:role!=='guest',status:'active',name:'Test User',email:role==='guest'?null:'test@example.com',balance:1000,role:role==='admin'?'admin':'user',isAdmin:role==='admin',country:'Nigeria',currency:'USD',readAnnouncementIds:[],loginHistory:[],referralCount:3,points:150,transactions:populated?[tx]:[],tickets:populated?[ticket]:[],activeInvestments:populated?[investment]:[],kyc:{status:'approved'}},
 marketCrypto:populated?[asset]:[],marketStocks:populated?[{...asset,symbol:'AAPL',name:'Apple'}]:[],traders:populated?[trader]:[],plans:populated?DEFAULT_INVESTMENT_PLANS:[],
 tradersError:null,tradersLoading:false,supportError:null,supportLoading:false,refreshSupport:async()=>{},plansLoading:false,plansError:null,investmentDataError:null,investmentDataLoading:false,isLoadingMarkets:false,insufficientBalanceOpen:false,
 siteContent:DEFAULT_SITE_CONTENT,appSettings:{...DEFAULT_APP_SETTINGS,chatwayWidgetId:''},
 usersDirectory:populated?[{id:owner,email:'test@example.com',name:'Test User',balance:1000,status:'active',role:'user',registrationDate:now}]:[],isLoadingUsersDirectory:false,
 adminWallets:{},depositWallets:populated?[wallet]:[],enabledDepositWallets:populated?[wallet]:[],adminAnnouncements:[],userAnnouncements:[],adminAuditLogs:[],adminAirdropClaims:[],airdrops:[],notifications:[],unreadNotificationsCount:0,
 supportTickets:populated?[ticket]:[],adminTransactions:populated?[tx,{...tx,id:'tx-2',type:'withdrawal',address:'TTestFixtureAddress'}]:[],adminActiveInvestments:populated?[{...investment,userId:owner,userEmail:'test@example.com'}]:[],adminCopyTrades:[],allKycSubmissions:{},myKyc:null,kycLoading:false,kycError:null,walletFeedback:[],
};

const actions=["refreshTraders","refreshMarkets","refreshInvestmentData", "setInsufficientBalanceOpen", "deposit", "withdraw", "investInPlan", "claimPlanPayout", "claimAirdrop", "withdrawEarnings", "topUpInvestment", "copyTrader", "uncopyTrader", "claimCopyTradePayout", "executeTrade", "createTicket", "replyToTicket", "sendWelcomeNotification", "refreshUsersDirectory", "markNotificationRead", "markAllNotificationsRead", "deleteNotification", "updateAdminWallets", "adminSaveDepositWallet", "adminDeleteDepositWallet", "adminUpdateUserBalance", "adminChangeUserStatus", "adminDeleteUser", "adminResetUserPassword", "adminKycReview", "adminCreatePlan", "adminUpdatePlan", "adminDeletePlan", "adminSetPlanStatus", "adminApproveDeposit", "adminRejectDeposit", "refreshAdminDeposits", "adminApproveWithdrawal", "adminRejectWithdrawal", "adminApproveAirdrop", "adminRejectAirdrop", "adminCreateAirdrop", "adminUpdateAirdrop", "adminDeleteAirdrop", "adminCreateAnnouncement", "adminUpdateAnnouncement", "adminDeleteAnnouncement", "markAnnouncementRead", "adminReplyToTicket", "adminCloseTicket", "adminSetTicketPriority", "refreshKyc", "addNotification", "clearNotifications", "submitKyc", "saveWalletConnection", "updateSiteContent", "updateAppSettings", "adminUpdateTrader", "adminCreateTrader", "adminDeleteTrader", "submitWalletFeedback", "adminUpdateWalletFeedback", "adminDeleteWalletFeedback"];
for(const name of actions) state[name]=async()=>{controls.calls.push(name);if(controls.fail)throw new Error('Simulated save failure');return {success:true,message:'Saved in test fixture'};};
state.setInsufficientBalanceOpen=(open:boolean)=>{state.insufficientBalanceOpen=open;emit();};
state.deposit=async()=>!controls.fail;
state.adminApproveDeposit=state.adminRejectDeposit=async()=>!controls.fail;
state.createTicket=async()=>{controls.calls.push('createTicket');if(controls.fail)throw new Error('Simulated save failure');return 'ticket-2';};
export function useOrbit():any{useSyncExternalStore(fn=>{listeners.add(fn);return()=>{listeners.delete(fn);};},()=>version);return state;}
export function OrbitProvider({children}:React.PropsWithChildren){return <>{children}</>;}
const authUser=role==='guest'?null:{id:owner,email:'test@example.com',user_metadata:{name:'Test User'}};
export const supabase:any={auth:{getSession:async()=>({data:{session:authUser?{user:authUser,access_token:"fixture-access-token"}:null}}),getUser:async()=>({data:{user:authUser}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),signOut:async()=>({error:null}),updateUser:async()=>({error:controls.fail?{message:'Simulated save failure'}:null}),signInWithPassword:async()=>({data:{user:authUser},error:{message:'Fixture login rejected'}})},
 from:(table:string)=>{const query:any={select:()=>query,eq:()=>query,order:()=>query,upsert:()=>query,insert:()=>query,update:()=>query,delete:()=>query,single:async()=>({data:{id:owner,email:'test@example.com',role:role==='admin'?'admin':'user',status:'active',balance:1000},error:null}),maybeSingle:async()=>query.single(),then:(resolve:any)=>Promise.resolve({data:table==='users'?[{id:owner,role}]:[],error:null}).then(resolve)};return query;},
 storage:{from:()=>({createSignedUrl:async()=>({data:{signedUrl:image},error:null}),createSignedUrls:async()=>({data:[],error:null})})},rpc:async()=>({data:null,error:{message:'Fixture RPC unavailable'}})};
export const useSupabaseClient=()=>supabase;
export const supabasePublic=supabase;
export const createFreshAuthedClient=()=>supabase;
export const ensureUserRow=async()=>{};
export const createUserProfile=async()=>({error:null});
export const uploadDepositWalletQrCode=async()=>image;
(window as any).__audit={state,controls,emit};
export { DEFAULT_SITE_CONTENT };
