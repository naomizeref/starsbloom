import React from 'react';
import { useSiteSettings } from '../../src/hooks/data/useSiteSettings';
const control={fail:true};
const db:any={from:()=>{
 const q:any={select:()=>q,eq:()=>q,upsert:()=>q,maybeSingle:async()=>({data:null,error:null}),single:async()=>control.fail?{data:null,error:{code:'PGRST205',message:'Missing settings table'}}:{data:{key:'saved'},error:null}};return q;
}};
export function SettingsPersistence(){const settings=useSiteSettings(db);(window as any).__settings={...settings,control};return <main>Settings persistence fixture</main>;}
