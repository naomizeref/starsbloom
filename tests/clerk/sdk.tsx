import React, {useSyncExternalStore} from 'react';
let state:any={isLoaded:!(window as any).__clerkInitiallyLoading,session:null};const listeners=new Set<()=>void>();
const change=(id:string|null,currentTask?:{key:string})=>{state={isLoaded:true,session:id?{id,currentTask,getToken:async()=> (window as any).__clerkTokenStalled ? new Promise(()=>{}) : `token-${id}`}:null};listeners.forEach(fn=>fn());};
(window as any).__clerk={signIn:change,finishLoading:()=>{state={...state,isLoaded:true};listeners.forEach(fn=>fn());}};
const clerk={signOut:async()=>change(null)};
export const ClerkProvider=({children}:any)=><>{children}</>;
export const useClerk=()=>clerk;
export const useSession=()=>useSyncExternalStore(fn=>{listeners.add(fn);return()=>{listeners.delete(fn);};},()=>state);
export const SignIn=()=> <p>Unexpected second Clerk login form</p>;
export const SignUp=()=> <p>Clerk sign up</p>;
export const UserProfile=()=> <p>Clerk account security</p>;
export const AuthenticateWithRedirectCallback=()=>null;
export const RedirectToTasks=()=> <p>Complete required account task</p>;

const authTest={calls:[] as {method:string;params:any}[],badCode:false,failSend:false,needsMfa:false,needsTrust:false,needsNewPassword:false,
 factors:[{strategy:'totp'},{strategy:'backup_code'}] as any[]};
(window as any).__authTest=authTest;
const call=(method:string,params:any)=>{authTest.calls.push({method,params});};
const signup:any={status:'missing_requirements',emailAddress:null,requiredFields:['email_address','password'],optionalFields:[],unverifiedFields:['email_address'],createdSessionId:null,
 async create(params:any){call('signup.create',params);this.emailAddress=params.emailAddress;return this;},
 async update(params:any){call('signup.update',params);return this;},
 async prepareEmailAddressVerification(params:any){call('signup.send',params);if(authTest.failSend)throw {errors:[{longMessage:'Please wait before requesting another code.'}]};return this;},
 async attemptEmailAddressVerification(params:any){call('signup.verify',params);if(authTest.badCode)throw {errors:[{longMessage:'That verification code is incorrect.'}]};this.status='complete';this.createdSessionId='B';return this;}
};
const signin:any={status:'needs_first_factor',createdSessionId:null,
 async create(params:any){call('signin.create',params);this.status=params.strategy==='reset_password_email_code'?'needs_first_factor':authTest.needsNewPassword?'needs_new_password':authTest.needsTrust?'needs_client_trust':authTest.needsMfa?'needs_second_factor':'complete';this.supportedSecondFactors=authTest.factors;this.createdSessionId=this.status==='complete'?'A':null;return this;},
 async attemptFirstFactor(params:any){call('signin.reset',params);if(authTest.badCode)throw {errors:[{longMessage:'That reset code is incorrect.'}]};this.status=authTest.needsMfa?'needs_second_factor':'complete';this.supportedSecondFactors=authTest.factors;this.createdSessionId=this.status==='complete'?'A':null;return this;},
 async prepareSecondFactor(params:any){call('signin.sendSecond',params);if(authTest.failSend)throw {errors:[{longMessage:'Unable to send the verification code. Try again.'}]};return this;},
 async attemptSecondFactor(params:any){call('signin.verifySecond',params);if(authTest.badCode)throw {errors:[{longMessage:'That security code is incorrect.'}]};this.status='complete';this.createdSessionId='A';return this;},
 async resetPassword(params:any){call('signin.newPassword',params);this.status='complete';this.createdSessionId='A';return this;},
 async authenticateWithPasskey(params:any){call('signin.passkey',params);this.status='complete';this.createdSessionId='A';return this;}
};
const setActive=async({session}:any)=>{call('setActive',{session});change(session);};
export const useSignUp=()=>({isLoaded:useSession().isLoaded,signUp:signup,setActive});
export const useSignIn=()=>({isLoaded:useSession().isLoaded,signIn:signin,setActive});
