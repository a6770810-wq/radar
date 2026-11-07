"use strict";
// Signal engine — identical to the one in index.html (auto-extracted).

const HOSTS=["https://data-api.binance.vision","https://api.binance.com"];
const ASSETS=[
  {s:"BTCUSDT",k:"BTC",n:"ביטקוין"},
  {s:"ETHUSDT",k:"ETH",n:"את'ריום"},
  {s:"SOLUSDT",k:"SOL",n:"סולנה"},
  {s:"PAXGUSDT",k:"זהב",n:"PAXG"}
];
const TF={"1m":{ms:6e4,htf:"15m",l:"1 דק׳"},"5m":{ms:3e5,htf:"1h",l:"5 דק׳"},"15m":{ms:9e5,htf:"1h",l:"15 דק׳"},"1h":{ms:36e5,htf:"4h",l:"שעה"}};
const HTF_MS={"15m":9e5,"1h":36e5,"4h":144e5};
const HTF_LBL={"15m":"15 דק׳","1h":"שעה","4h":"4 שעות"};
const DEF={th:55,sl:1.5,rr:2,mb:40,fee:0.1,htf:true};
const START=210, LIMIT=1000;
const W={trend:20,htf:20,macd:15,rsi:15,vwap:10,vol:10,sqz:10};


const clip=(x,a=-1,b=1)=>Math.max(a,Math.min(b,x));
function smoothed(src,p,alphaFn){const out=new Array(src.length).fill(NaN);let prev=NaN,cnt=0,sum=0;const a=alphaFn(p);
  for(let i=0;i<src.length;i++){const v=src[i];if(!Number.isFinite(v))continue;
    if(!Number.isFinite(prev)){sum+=v;cnt++;if(cnt===p){prev=sum/p;out[i]=prev}}else{prev=v*a+prev*(1-a);out[i]=prev}}return out}
const ema=(s,p)=>smoothed(s,p,p=>2/(p+1));
const rma=(s,p)=>smoothed(s,p,p=>1/p);
function sma(s,p){const o=new Array(s.length).fill(NaN);let sum=0;for(let i=0;i<s.length;i++){sum+=s[i];if(i>=p)sum-=s[i-p];if(i>=p-1)o[i]=sum/p}return o}
function stdev(s,p,m){const o=new Array(s.length).fill(NaN);for(let i=p-1;i<s.length;i++){let q=0;for(let j=i-p+1;j<=i;j++)q+=(s[j]-m[i])**2;o[i]=Math.sqrt(q/p)}return o}
function rsi(c,p=14){const o=new Array(c.length).fill(NaN);let g=0,l=0;
  for(let i=1;i<c.length;i++){const d=c[i]-c[i-1],up=Math.max(d,0),dn=Math.max(-d,0);
    if(i<=p){g+=up;l+=dn;if(i===p){g/=p;l/=p;o[i]=100-100/(1+g/(l||1e-12))}}
    else{g=(g*(p-1)+up)/p;l=(l*(p-1)+dn)/p;o[i]=100-100/(1+g/(l||1e-12))}}return o}
function pctRank(a,i,len){if(i<len||!Number.isFinite(a[i]))return NaN;let k=0,n=0;for(let j=i-len;j<i;j++){if(Number.isFinite(a[j])){n++;if(a[j]<a[i])k++}}return n?k/n:NaN}


async function fetchK(sym,tf,limit){let err;
  for(const h of HOSTS){try{const r=await fetch(`${h}/api/v3/klines?symbol=${sym}&interval=${tf}&limit=${limit}`,{cache:"no-store"});
      if(!r.ok)throw new Error("HTTP "+r.status);const j=await r.json();
      return j.map(a=>({t:a[0],o:+a[1],h:+a[2],l:+a[3],c:+a[4],v:+a[5]}))}catch(e){err=e}}
  throw err}

function build(c,tf){const L=c.l,n=L.length;const t=L.map(b=>b.t),o=L.map(b=>b.o),h=L.map(b=>b.h),l=L.map(b=>b.l),cl=L.map(b=>b.c),v=L.map(b=>b.v);
  const D={n,t,o,h,l,c:cl,v,tf};
  D.e21=ema(cl,21);D.e50=ema(cl,50);D.e200=ema(cl,200);
  const e12=ema(cl,12),e26=ema(cl,26);D.macd=cl.map((_,i)=>e12[i]-e26[i]);D.sig=ema(D.macd,9);D.hist=D.macd.map((m,i)=>m-D.sig[i]);
  D.rsi=rsi(cl,14);
  const tr=cl.map((_,i)=>i===0?h[0]-l[0]:Math.max(h[i]-l[i],Math.abs(h[i]-cl[i-1]),Math.abs(l[i]-cl[i-1])));
  D.atr=rma(tr,14);
  const pdm=cl.map((_,i)=>{if(!i)return 0;const up=h[i]-h[i-1],dn=l[i-1]-l[i];return up>dn&&up>0?up:0});
  const mdm=cl.map((_,i)=>{if(!i)return 0;const up=h[i]-h[i-1],dn=l[i-1]-l[i];return dn>up&&dn>0?dn:0});
  const sp=rma(pdm,14),sm=rma(mdm,14);
  const dx=cl.map((_,i)=>{const a=D.atr[i];if(!(a>0))return NaN;const pi=100*sp[i]/a,mi=100*sm[i]/a;return pi+mi>0?100*Math.abs(pi-mi)/(pi+mi):0});
  D.adx=rma(dx,14);
  D.bbM=sma(cl,20);const sd=stdev(cl,20,D.bbM);D.bbU=D.bbM.map((m,i)=>m+2*sd[i]);D.bbL=D.bbM.map((m,i)=>m-2*sd[i]);
  const bbw=D.bbM.map((m,i)=>(D.bbU[i]-D.bbL[i])/m);D.bbwPct=bbw.map((_,i)=>pctRank(bbw,i,120));
  D.atrPct=D.atr.map((a,i)=>pctRank(D.atr.map((x,j)=>x/cl[j]),i,200));
  D.vsma=sma(v,20);
  // VWAP, reset each UTC day
  D.vwap=new Array(n).fill(NaN);let pv=0,vv=0,day=-1;
  for(let i=0;i<n;i++){const d=Math.floor(t[i]/864e5);if(d!==day){day=d;pv=0;vv=0}const tp=(h[i]+l[i]+cl[i])/3;pv+=tp*v[i];vv+=v[i];D.vwap[i]=vv?pv/vv:cl[i]}
  // Higher timeframe trend, only from HTF candles already closed at this bar's close
  const H=c.h,hc=H.map(b=>b.c),he21=ema(hc,21),he50=ema(hc,50),hms=HTF_MS[TF[tf].htf],ms=TF[tf].ms;
  D.htf=new Array(n).fill(0);let k=-1;
  for(let i=0;i<n;i++){const close=t[i]+ms;while(k+1<H.length&&H[k+1].t+hms<=close)k++;
    if(k>=50){const x=hc[k];D.htf[i]=(x>he50[k]&&he21[k]>he50[k])?1:(x<he50[k]&&he21[k]<he50[k])?-1:0}}
  D.ev=new Array(n);for(let i=0;i<n;i++)D.ev[i]=evalBar(D,i);
  return D}

function evalBar(D,i){if(i<START||!Number.isFinite(D.e200[i])||!Number.isFinite(D.adx[i])||!Number.isFinite(D.atr[i]))return null;
  const c=D.c[i],e21=D.e21[i],e50=D.e50[i],atr=D.atr[i],adx=D.adx[i],r=D.rsi[i],rp=D.rsi[i-1];
  const regime=D.atrPct[i]>0.97?"extreme":adx>=25?"trend":adx<20?"range":"mixed";
  const P={};const note={};
  // 1. EMA structure
  P.trend=(c>e21&&e21>e50)?1:(c<e21&&e21<e50)?-1:0.5*Math.sign(e21-e50);
  note.trend=P.trend===1?"מחיר מעל EMA21 מעל EMA50":P.trend===-1?"מחיר מתחת EMA21 מתחת EMA50":"מבנה מעורב";
  // 2. HTF trend
  P.htf=D.htf[i];note.htf=P.htf===1?"מגמה עולה בטווח הגבוה":P.htf===-1?"מגמה יורדת בטווח הגבוה":"אין מגמה ברורה בטווח הגבוה";
  // 3. MACD momentum
  const hh=D.hist[i],hp=D.hist[i-1];P.macd=hh>0?(hh>hp?1:0.3):hh<0?(hh<hp?-1:-0.3):0;
  note.macd=hh>0?(hh>hp?"מומנטום חיובי ומתחזק":"מומנטום חיובי שנחלש"):(hh<hp?"מומנטום שלילי ומתחזק":"מומנטום שלילי שנחלש");
  // 4. RSI, read according to regime
  if(regime==="range"){P.rsi=(r<32&&r>rp)?1:(r>68&&r<rp)?-1:0;note.rsi=`RSI ${r.toFixed(0)} · שוק מדשדש: מחפש היפוך מקצוות`}
  else if(P.trend>0){P.rsi=(r>=40&&r<=62&&r>rp)?1:r>75?-0.4:0.3;note.rsi=`RSI ${r.toFixed(0)} · ${r>75?"קנוי יתר, סיכון לתיקון":r>=40&&r<=62&&r>rp?"חזרה לעלייה אחרי תיקון":"ניטרלי במגמה עולה"}`}
  else if(P.trend<0){P.rsi=(r>=38&&r<=60&&r<rp)?-1:r<25?0.4:-0.3;note.rsi=`RSI ${r.toFixed(0)} · ${r<25?"מכור יתר, סיכון לקפיצה":r>=38&&r<=60&&r<rp?"חזרה לירידה אחרי תיקון":"ניטרלי במגמה יורדת"}`}
  else{P.rsi=clip((r-50)/25);note.rsi=`RSI ${r.toFixed(0)}`}
  // 5. VWAP
  P.vwap=clip((c-D.vwap[i])/atr);note.vwap=`${c>D.vwap[i]?"מעל":"מתחת"} ל-VWAP היומי ב-${Math.abs((c-D.vwap[i])/atr).toFixed(1)} ATR`;
  // 6. Volume confirmation
  const vr=D.v[i]/D.vsma[i];P.vol=vr>1.3?Math.sign(c-D.o[i])*clip((vr-1)/1.5,0,1):0;
  note.vol=`נפח פי ${Number.isFinite(vr)?vr.toFixed(1):"–"} מהממוצע${vr>1.3?(c>D.o[i]?", קונים דוחפים":", מוכרים דוחפים"):""}`;
  // 7. Squeeze breakout
  const sq=D.bbwPct[i-1]<0.2;P.sqz=sq&&c>D.bbU[i]?1:sq&&c<D.bbL[i]?-1:0;
  note.sqz=P.sqz?(P.sqz>0?"פריצה למעלה מכיווץ תנודתיות":"שבירה למטה מכיווץ תנודתיות"):sq?"תנודתיות מכווצת, ממתין לפריצה":"אין כיווץ";
  let score=0;for(const k in W)score+=W[k]*P[k];
  return {score:Math.round(score),P,note,regime,htf:D.htf[i],adx,rsi:r}}

function signalAt(D,i,P){const e=D.ev[i];if(!e)return 0;const d=e.score>=P.th?1:e.score<=-P.th?-1:0;
  if(!d||e.regime==="extreme")return 0;if(P.htf&&e.htf!==d)return 0;return d}
function blockReason(D,i,P){const e=D.ev[i];if(!e)return "";const d=Math.sign(e.score);
  if(Math.abs(e.score)<P.th)return `חסרות ${P.th-Math.abs(e.score)} נקודות לאיתות ${d>=0?"לונג":"שורט"}`;
  if(e.regime==="extreme")return "תנודתיות קיצונית, איתותים מושהים";
  if(P.htf&&e.htf!==d)return "הציון חזק אבל הטווח הגבוה לא מאשר את הכיוון";return ""}

/* ============ Backtest ============ */
function backtest(D,P,from=START,to){const n=D.n,last=n-2;to=to??last;const trades=[];let i=Math.max(from,START+1);
  while(i<=to){const s=signalAt(D,i,P);
    if(s&&s!==signalAt(D,i-1,P)&&i+1<n){
      const entry=D.o[i+1],risk=P.sl*D.atr[i];if(!(risk>0)){i++;continue}
      const sl=entry-s*risk,tp=entry+s*risk*P.rr,tp1=entry+s*risk;const feeR=(P.fee/100)*2*entry/risk;
      const tr={dir:s,sig:i,ent:i+1,entry,sl,tp,tp1,risk,feeR,out:"open",R:null,x:null,xi:null,t:D.t[i+1]};
      for(let j=i+1;j<n;j++){const closed=j<=last;const hitSL=s>0?D.l[j]<=sl:D.h[j]>=sl,hitTP=s>0?D.h[j]>=tp:D.l[j]<=tp;
        if(hitSL){tr.out="sl";tr.R=-1-feeR;tr.xi=j;tr.x=sl;break}
        if(hitTP){tr.out="tp";tr.R=P.rr-feeR;tr.xi=j;tr.x=tp;break}
        if(closed&&j-(i+1)>=P.mb){tr.out="time";tr.x=D.c[j];tr.R=s*(D.c[j]-entry)/risk-feeR;tr.xi=j;break}}
      trades.push(tr);if(tr.out==="open")break;i=tr.xi+1}
    else i++}
  return trades}
function stats(trades){const c=trades.filter(t=>t.out!=="open");const n=c.length;if(!n)return{n:0};
  let w=0,gp=0,gl=0,cum=0,peak=0,dd=0;for(const t of c){if(t.R>0){w++;gp+=t.R}else gl+=-t.R;cum+=t.R;peak=Math.max(peak,cum);dd=Math.max(dd,peak-cum)}
  return{n,wr:w/n,exp:cum/n,pf:gl?gp/gl:Infinity,dd,tot:cum}}


module.exports={ASSETS,TF,HTF_MS,HTF_LBL,DEF,START,LIMIT,W,fetchK,build,evalBar,signalAt,blockReason,backtest,stats};
